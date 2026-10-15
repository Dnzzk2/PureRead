#!/usr/bin/env python3
"""把扩展打包成发布用的 zip。

文件清单不再手写。从 manifest.json 出发，顺着它声明的入口（popup / options /
service worker / content scripts / icons）追下去，HTML 里再顺着 src 与 href 追一层，
最后补上两个整目录（_locales/ 与 public/）。这样清单自己会跟着代码走。

两个刻意的设计，都是被咬过之后改的：

  1. 缺文件即报错。以前是 `if os.path.exists(file)`，漏掉一个文件不吭声，
     只是打出一个缺东西的包，装进浏览器才发现。改名 logo 那次就差点中招。
  2. 不再维护白名单。原来是手写列表，新增文件忘了加进去同样不报错 ——
     上面那条检查只有在「列表里有、磁盘上没有」时才救得了你，救不了
     「磁盘上有、列表里没有」。现在清单是从引用关系推出来的，两边不会走散。
"""

import json
import os
import re
import sys
import zipfile

MANIFEST = "manifest.json"
# 整目录打包。_locales/ 是 manifest 的 default_locale 决定的；
# public/ 是静态资源目录，里面的图标按尺寸成套使用，未必每个都被代码引用
# （16/32/48 是给浏览器工具栏和商店用的，HTML 里只引得到 128）。
ASSET_DIRS = ("_locales", "public")
JUNK = (".DS_Store",)
JUNK_PREFIX = "._"


def is_local(ref):
    """只收包内相对路径。跳过外链、协议相对、data:、锚点。"""
    if not ref or ref.startswith(("#", "//")):
        return False
    return not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", ref)


def refs_from_manifest(manifest):
    """manifest 里所有指向包内文件的字段。"""
    out = []

    def add(value):
        if isinstance(value, str):
            out.append(value)
        elif isinstance(value, dict):
            out.extend(v for v in value.values() if isinstance(v, str))
        elif isinstance(value, list):
            out.extend(v for v in value if isinstance(v, str))

    add(manifest.get("icons"))
    add(manifest.get("action", {}).get("default_icon"))
    add(manifest.get("action", {}).get("default_popup"))
    add(manifest.get("options_page"))
    add(manifest.get("options_ui", {}).get("page"))
    add(manifest.get("devtools_page"))

    bg = manifest.get("background", {})
    add(bg.get("service_worker"))
    add(bg.get("scripts"))  # MV2 写法，留着不亏

    for cs in manifest.get("content_scripts", []):
        add(cs.get("js"))
        add(cs.get("css"))

    for war in manifest.get("web_accessible_resources", []):
        # MV3 是 {resources: [...]}，MV2 直接是数组
        add(war.get("resources") if isinstance(war, dict) else war)

    return [r for r in out if is_local(r)]


# HTML 里的 src / href。不挑标签 —— img、script、link、source、use 一网打尽。
ATTR_RE = re.compile(r"""\b(?:src|href)\s*=\s*["']([^"']+)["']""", re.I)


def refs_from_html(text):
    return [r for r in ATTR_RE.findall(text) if is_local(r)]


def collect(root, manifest):
    """广度优先追引用，返回有序的文件清单。"""
    queue = [MANIFEST] + refs_from_manifest(manifest)
    seen = set()
    ordered = []

    while queue:
        rel = queue.pop(0).replace("\\", "/").lstrip("/")
        if rel in seen or not rel:
            continue
        seen.add(rel)

        # 只有 HTML 需要往下追。图片、脚本、样式都是叶子。
        if rel.lower().endswith((".html", ".htm")):
            path = os.path.join(root, rel)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as fh:
                    queue.extend(refs_from_html(fh.read()))

        ordered.append(rel)

    return ordered


def walk_assets(root):
    """整目录收：跳过目录本身、macOS 的 .DS_Store 和 AppleDouble。"""
    out = []
    for top in ASSET_DIRS:
        base = os.path.join(root, top)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in JUNK and not d.startswith(JUNK_PREFIX)]
            for name in sorted(filenames):
                if name in JUNK or name.startswith(JUNK_PREFIX):
                    continue
                full = os.path.join(dirpath, name)
                out.append(os.path.relpath(full, root).replace(os.sep, "/"))
    return sorted(out)


def build_release():
    root = os.path.dirname(os.path.abspath(__file__))

    with open(os.path.join(root, MANIFEST), "r", encoding="utf-8") as fh:
        manifest = json.load(fh)

    files = collect(root, manifest)
    assets = walk_assets(root)
    # 去重但保序：推导出来的在前（入口优先），目录收的在后。
    seen = set()
    ordered = [f for f in files + assets if not (f in seen or seen.add(f))]

    # manifest 声明的 default_locale 必须真有对应目录，否则读不到文案。
    locale = manifest.get("default_locale")
    if locale and not os.path.exists(os.path.join(root, "_locales", locale, "messages.json")):
        print(f"错误：manifest 声明 default_locale={locale}，但没有 _locales/{locale}/messages.json")
        return 1

    # 缺文件就停。宁可什么都不产出，也不产出半成品。
    missing = [f for f in ordered if not os.path.isfile(os.path.join(root, f))]
    if missing:
        print("错误：以下文件被引用（或在资源目录里）但磁盘上不存在：")
        for f in missing:
            print(f"    {f}")
        print("\n包没有生成。补上文件，或从 manifest / HTML 里去掉引用。")
        return 1

    version = manifest["version"]
    output = f"PureRead-v{version}.zip"

    with zipfile.ZipFile(os.path.join(root, output), "w", zipfile.ZIP_DEFLATED) as zipf:
        for rel in ordered:
            # arcname 传相对路径，保留 _locales/zh_CN/ 这层结构；
            # 拍平会让 CRX 非法。
            zipf.write(os.path.join(root, rel), rel)
            print(f"Added: {rel}")

    size = os.path.getsize(os.path.join(root, output))
    print(f"\nSuccessfully created: {output}")
    print(f"{len(ordered)} 个文件，{size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(build_release())
