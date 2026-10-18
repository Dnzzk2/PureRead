<p align="center">
  <img src="./public/PureRead-icon-128.png" height="128" alt="PureRead Logo">
</p>

<p align="center">Your font, your rules. A professional, lightweight Chrome extension that provides you with an excellent web reading experience.</p>
<p align="center">你的字体，你做主。一款专业、轻量的浏览器扩展，为你提供卓越的网页阅读体验。</p>

<p align="center"><a href="#简体中文">简体中文</a> · <a href="#english">English</a></p>

---

## 简体中文

> [!IMPORTANT]
> PureRead 的核心是 **「网页字体更换」**。它不重排页面、不裁剪内容，只是向页面写入一段 CSS：把**正文**、**代码 / 等宽**、**数学公式**三类文本，换成你指定的字体。

### 它做什么

内容脚本以 `document_start` 注入，向页面写入唯一的 `<style id="pure-read-injector">`，按三个维度替换字体：

| 维度 | 生效范围 |
| --- | --- |
| **标准字体** | 正文、标题等绝大多数文本（`body *`，已排除代码、公式、图标与媒体元素） |
| **代码 / 等宽** | `pre` `code` `kbd` `samp` 及其后代、`.blob-code`、`.blob-code-inner`、`.text-mono`、`.mono`、`[class*="pl-"]`、`.highlight` 内的代码、`pre[class*="language"]` 等，并固定行高为 1.4 |
| **数学公式** | `math`、`.katex`、`.mjx-chtml` 及其后代 |

三者都是**留空即不替换** —— 只想要等宽字体、正文保持原样，完全可行。

#### 内置排除规则

即使只设置了「标准字体」，下面这些元素也不会被碰到：

- **图标字体** —— Font Awesome（`.fa` `.fas` `.far` `.fab`）、`.glyphicon`、iconfont、`[class*="icon"]`、`[class*="ico-"]`、`[class*="glyph"]`、`[class*="emoji"]`、`[data-icon]`、`[role="img"]`、`<i>` 等；
- **代码** —— `pre` / `code` / `kbd` / `samp`、GitHub 的 `.blob-code` 系列、`[class*="highlight"]` 等，交给「代码 / 等宽」那一档处理；
- **媒体与播放器** —— `video` `iframe` `canvas` `svg` `img` `audio`，以及所有 `[class*="player"]` / `[class*="video"]`。

这是「一键换字体」最容易翻车的地方：图标变成豆腐块、代码块被换成比例字体、视频控件错位。PureRead 在选择器层面用 `:not()` 先把它们摘出去，而不是靠事后修补。

### 功能

#### 总开关与站点级控制

- **总开关**：一键启用 / 停用全部字体替换。
- **两种模式**（弹窗内分段切换）：
  - **全局字体** —— 所有站点共用同一套三项映射；
  - **本站字体** —— 只对当前域名保存一套独立的映射，其他站点不受影响。
- **站点开关**：为某个域名单独记录开关状态，语义是双向的 ——
  - 徽标为 **ON**（白名单）：总开关关闭时，**这个站照常替换字体**；
  - 徽标为 **OFF**（黑名单）：总开关开启时，**这个站保持网页原样**。
- 控制中心的「站点管理」列出所有被单独设置过的域名，可逐个移除或一次清空；只是跟随全局设置的站点不会留下记录。
- 浏览器内置页（`chrome://` 等）不支持站点级设置，弹窗会自动禁用相关控件并回退到全局模式。

#### 内嵌框架（iframe）

页面里的评论、视频、文档等内容常常渲染在 iframe 中。CSS 的字体继承不会跨文档边界，只处理顶层页面时，这些内容会保持原字体。控制中心新增「内嵌框架」开关：

- **开启（默认）**：内容脚本同时进入所有子框架，把同一套字体规则写进 iframe；
- **关闭**：只处理顶层页面，内嵌内容保持原站字体；
- 站点级开关与「本站字体」按**顶层页面域名**解析 —— 在某个站点关掉扩展，它内嵌的框架也一起停下。

实现上由 manifest 的 `all_frames` 让脚本进入每个框架，脚本再按开关决定是否写入样式；跨域框架通过 `location.ancestorOrigins`（兜底 `document.referrer`）取顶层域名。

#### 页面拾取（Element Picker）

有些站点的正文容器没有语义化的类名，或者你想把某个角落的元素排除掉 —— 不用读源码，直接在页面上点：

- 弹窗底部「额外匹配与排除」里选择目标规则：**标准字体 / 代码·等宽 / 数学公式 / 排除替换**；
- 回到页面，鼠标移动时高亮命中的元素，右上角实时显示这一元素的信息与**即将写入的 CSS 选择器**；
- 单击即写入设置并**立即生效**，随后弹出一条通知，可在 6 秒内一键**撤销**这次添加；
- `Esc` 随时退出拾取，无法生成选择器或保存失败都会明确提示。

选择器由元素的 `id`、class 与 `:nth-of-type()` 逐级拼成（最多向上 5 层），拼到能唯一命中为止；点击普通链接或按钮不会触发页面跳转。

> [!NOTE]
> 「额外匹配与排除」是**全局**设置，不随站点区分 —— 拾取到的规则对所有站点生效。其中「排除替换」写入的是排除项，其余三项写入对应维度的额外匹配；排除项只需写元素本身，不需要手动加 `::before`。

#### 配置方案（预设）

- 弹窗里把当前三项映射一键存成一个方案，可自定义名称（留空则按时间命名）；
- 点击方案即套用，删除同样在弹窗里完成；
- 控制中心的「方案库」会列出每个方案的三项字体（字体名用该字体自身的字形渲染，便于辨认），支持改名、改字体、删除。

#### 手动编辑选择器

控制中心的「额外匹配与排除」提供四个文本框（标准 / 代码·等宽 / 数学公式 / 排除替换），支持逗号或换行分隔，保存后立即对所有标签页生效，无需刷新页面。适合需要精确书写 `[class*="…"]` 这类规则的时候。

#### 界面语言

- **跟随浏览器 / 简体中文 / English** 三选一，在控制中心切换；
- 偏好存放在 `chrome.storage.local`（不随账号同步），切换**即时生效**于弹窗、控制中心，以及页面上的拾取浮层。

#### 更新提示

Service Worker 在安装、浏览器启动时各检查一次，此后每 12 小时一次（`chrome.alarms`），读取 GitHub Releases 的最新版本号。有新版本时，弹窗右上角的版本徽标变为「↑ 更新」，控制中心的「关于」卡片显示新版本号与「立即更新」入口。

#### 字体列表与预览

- 通过 `chrome.fontSettings.getFontList()` 读取本机已安装字体，结果缓存到 `chrome.storage.local`，下次先读缓存；
- 下拉框用虚拟列表渲染 —— 系统字体常达数百项，且每一项都要用**它自己的字形**渲染自己的名字；
- 输入框、候选列表、方案卡片里的字体名同样用该字体渲染，选之前就能看到实际观感（Webdings 这类符号字体除外，用它们渲染只会得到乱码）；
- Firefox 未实现 `chrome.fontSettings`，此时回退到内置的常用字体列表，并在弹窗中说明原因与解法（直接输入字体名）。

#### 数据与备份

- **存储记录**：控制中心显示 `chrome.storage.sync` 的配额占用率与字节数；
- **导出 / 导入**：把设置与方案导出为 JSON 文件备份或迁移，导入前会展示文件内容摘要并提示将覆盖现有设置。

### 安装

#### Chrome / Edge / Brave 等 Chromium 内核

1. 前往 [Releases](https://github.com/Dnzzk2/PureRead/releases) 下载最新的 `PureRead-v<版本>.zip` 并解压；
2. 打开 `chrome://extensions/`，开启右上角的 **开发者模式**；
3. 点击 **加载已解压的扩展程序**，选择解压后的文件夹。

#### Firefox

可借助 [CRX Installer](https://addons.mozilla.org/zh-CN/firefox/addon/crxinstaller/) 等工具导入安装包。

> [!WARNING]
> **Firefox 已知限制**：Firefox 未实现 `chrome.fontSettings`，扩展**无法自动获取系统字体列表**，下拉框中只有内置的常用字体。把字体名**直接输入**到输入框即可正常生效。

### 使用方法

**换掉全站字体**：点击工具栏图标 → 在「字体选择」中填入标准 / 代码·等宽 / 数学公式三项字体（留空表示该项保持原样）→ 立即生效。

**只改一个网站**：在弹窗中切到「本站字体」，为当前域名填一套独立映射；再用站点开关单独控制这个站的启用状态。

**精确控制某块区域**：弹窗底部「额外匹配与排除」→ 选择目标规则 → 在页面上点选元素 → 规则自动写入，可在通知里撤销；需要手写时到控制中心编辑。

**存一套常用搭配**：调好三项字体后在弹窗「配置方案」里保存，之后一键切换。

### 项目结构

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | 扩展入口与权限声明（Manifest V3） |
| `background.js` | Service Worker：GitHub Releases 更新检查与 12 小时定时器 |
| `content.js` | 内容脚本：CSS 注入与页面拾取浮层 |
| `popup.html` / `popup.js` | 弹窗界面：开关、字体选择、配置方案、页面拾取入口 |
| `options.html` / `options.js` | 控制中心：站点管理、选择器、方案库、存储、备份、语言、关于 |
| `shared.js` | 默认值、存储读写、数据校验与修复、字体加载、字体预览、下拉虚拟列表 |
| `i18n.js` | 界面文案字典与运行时本地化 |
| `_locales/` | manifest 需要由 Chrome 读取的文案（扩展名与描述） |
| `public/` | 图标等静态资源 |
| `build.py` | 打包脚本，从 `manifest.json` 出发追引用生成发布 zip |

### 开发

本仓库没有 Node 构建流水线，以「加载已解压的扩展程序」方式开发，改完在 `chrome://extensions/` 重新加载即可生效：

```bash
git clone https://github.com/Dnzzk2/PureRead.git
# chrome://extensions/ → 开发者模式 → 加载已解压的扩展程序 → 选择仓库根目录
python3 build.py   # 生成 PureRead-v<version>.zip
```

改动后建议手动验证：弹窗开关与三项字体、控制中心的选择器保存与站点管理、页面拾取的点选与撤销，并确认 `chrome.storage.sync` 的变化能在弹窗、控制中心与已打开的标签页之间同步。

代码风格沿用仓库现有约定：2 空格缩进、分号、`camelCase`、小写文件名，可复用的存储与校验逻辑放进 `shared.js`。详细约定见 [AGENTS.md](./AGENTS.md)。

### 权限

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存设置、方案与站点规则 |
| `activeTab` | 打开扩展时读取当前标签页地址，用于匹配站点规则 |
| `fontSettings` | 读取本机已安装的字体列表，填充字体下拉框 |
| `alarms` | 每 12 小时触发一次更新检查 |

manifest 中**没有** `host_permissions`。内容脚本按 `<all_urls>` 注入 —— 这是把字体样式写进任意网页所必需的访问能力 —— 它只向页面**写入**一个 `<style>` 标签。

### 隐私

**PureRead 不收集任何数据** —— 没有账号、没有埋点、没有广告。字体设置存在浏览器自带的存储里，页面内容不出浏览器；扩展只发两个只读请求：向 GitHub 读取最新版本号（用于更新提示），向 [zeoseven](https://fonts.zeoseven.com/) 获取扩展界面所用的字体（普通网页上只有你主动拾取元素后才会加载）。

完整说明见 **[PRIVACY.md](./PRIVACY.md)**。

### 反馈与致谢

发现问题或有功能建议，欢迎到 [Issues](https://github.com/Dnzzk2/PureRead/issues) 提出。感谢 [Linux.do](https://linux.do/) 社区的支持与讨论，以及 [zeoseven](https://fonts.zeoseven.com/) 提供的界面字体服务。

### 开源协议

本项目采用 [MIT License](./LICENSE)。

---

## English

> [!IMPORTANT]
> PureRead is about one thing: **replacing the fonts a web page uses**. It does not reflow layouts or hide content — it writes a single block of CSS into the page that swaps the typeface for **body text**, **code / monospace**, and **math**, each configured separately.

### What it does

The content script is injected at `document_start` and writes a single `<style id="pure-read-injector">` into the page, replacing fonts along three dimensions:

| Dimension | Scope |
| --- | --- |
| **Standard** | Body text, headings, and most other text (`body *`, with code, math, icons, and media already excluded) |
| **Code / monospace** | `pre` `code` `kbd` `samp` and their descendants, `.blob-code`, `.blob-code-inner`, `.text-mono`, `.mono`, `[class*="pl-"]`, code inside `.highlight`, `pre[class*="language"]`, and more — with line height pinned to 1.4 |
| **Math** | `math`, `.katex`, `.mjx-chtml` and their descendants |

Every dimension is **optional**: leave a field empty and that kind of text keeps its original font.

#### Built-in exclusions

Even if you only set a **Standard** font, none of these are touched:

- **Icon fonts** — Font Awesome (`.fa` `.fas` `.far` `.fab`), `.glyphicon`, iconfont, `[class*="icon"]`, `[class*="ico-"]`, `[class*="glyph"]`, `[class*="emoji"]`, `[data-icon]`, `[role="img"]`, `<i>`, and more;
- **Code** — `pre` / `code` / `kbd` / `samp`, GitHub's `.blob-code` family, `[class*="highlight"]`; these are handed to the **Code / monospace** slot instead;
- **Media and players** — `video` `iframe` `canvas` `svg` `img` `audio`, plus anything matching `[class*="player"]` / `[class*="video"]`.

This is where "replace every font on the page" extensions usually break things: icons turn into tofu boxes, code blocks get a proportional typeface, video controls fall apart. PureRead rules those elements out with `:not()` at the selector level instead of patching the damage afterwards.

### Features

#### Master switch and per-site control

- **Master switch** — turns all font replacement on or off in one click.
- **Two modes** (segmented control in the popup):
  - **Global font** — every site shares one set of three font mappings;
  - **Site font** — the current domain gets its own mapping, leaving other sites alone.
- **Per-site switch** — records an on/off state for a single domain, and it works in both directions:
  - badge reads **ON** (allowlist): with the master switch off, font replacement **still runs on that site**;
  - badge reads **OFF** (blocklist): with the master switch on, that site keeps its **original styling**.
- The Control Center's "Site rules" lists every domain you have customized, so you can remove them one by one or clear them all. Sites that simply follow the global settings leave no record behind.
- Browser-internal pages (`chrome://` and friends) do not support per-site settings; the popup disables those controls and falls back to global mode.

#### Embedded frames (iframe)

Comments, videos, documents, and other embedded content usually live inside an iframe. CSS font inheritance does not cross document boundaries, so a top-page-only rule leaves them untouched. The Control Center adds an **Embedded frames** switch:

- **On (default)** — the content script also enters every subframe and writes the same font rules there;
- **Off** — only the top-level page is styled, and embedded content keeps its original fonts;
- Site rules and "Site font" resolve against the **top-level page's domain** — turning the extension off on a site also stops the frames inside it.

Under the hood, `all_frames` in the manifest lets the script run in every frame, and the script decides whether to write the stylesheet; cross-origin frames read the top-level domain from `location.ancestorOrigins` (with `document.referrer` as a fallback).

#### Element picker

Some sites have no meaningful class name on their article container, or you may want to exclude one specific element — you don't have to read the source, just click it on the page:

- In "Extra matching & exclusions" at the bottom of the popup, choose a target rule: **Standard / Code · monospace / Math / Exclude**;
- Back on the page, moving the mouse highlights the element under the cursor, and a panel in the top-right shows what it is plus **the CSS selector about to be written**;
- A single click writes the rule and **applies it immediately**, followed by a notification with a one-click **Undo** that stays for 6 seconds;
- `Esc` exits the picker at any time; a selector that can't be built, or a save that fails, is reported explicitly.

Selectors are assembled from the element's `id`, classes, and `:nth-of-type()` (up to 5 levels up), stopping as soon as the result uniquely matches. Clicking ordinary links or buttons does not navigate the page.

> [!NOTE]
> "Extra matching & exclusions" is a **global** setting, not per site — picked rules apply everywhere. **Exclude** writes to the exclusion list, while the other three write extra matching selectors for that dimension. An exclusion only needs the element itself; there is no need to add `::before` manually.

#### Presets

- Save the current three mappings as a preset from the popup, with your own name (left blank, it is named after the time);
- Click a preset to apply it; deleting also happens in the popup;
- The Control Center's "Presets" card lists the three fonts of every preset — each font name rendered in its own typeface, so you can tell them apart at a glance — and lets you rename, re-pick fonts, or delete.

#### Editing selectors by hand

The Control Center's "Extra matching & exclusion" section offers four text fields (Standard / Code · monospace / Math / Exclude). Separate entries with commas or newlines. Saving applies to every tab immediately, with no page reload. This is the place for precise rules like `[class*="…"]`.

#### Interface language

- **Follow browser / 简体中文 / English**, switchable in the Control Center;
- The preference lives in `chrome.storage.local` (it does not sync with your account), and switching takes effect **immediately** in the popup, the Control Center, and the on-page picker overlay.

#### Update notices

The service worker checks once on install, once on browser startup, and every 12 hours thereafter (`chrome.alarms`), reading the latest version number from GitHub Releases. When a newer version exists, the version badge in the popup turns into "↑ Update", and the Control Center's About card shows the new version number with an "Update now" link.

#### Font list and previews

- Locally installed fonts are read through `chrome.fontSettings.getFontList()` and cached in `chrome.storage.local`, so the next run starts from the cache;
- The dropdown is virtualized — a system font list often runs into the hundreds, and every row renders its own name in **its own typeface**;
- Text fields, dropdown rows, and preset cards all preview font names the same way, so you can judge a font before choosing it (symbol fonts such as Webdings are the exception — rendering their name in them only yields gibberish);
- Firefox has no `chrome.fontSettings`; there the extension falls back to a built-in list of common fonts and explains the situation in the popup, with the workaround: type the font name directly.

#### Data and backup

- **Storage** — the Control Center shows how much of your `chrome.storage.sync` quota is used, in percent and bytes;
- **Export / Import** — write your settings and presets to a JSON file for safekeeping or moving to another machine. Before importing, a summary of the file is shown together with a warning that it replaces your current settings.

### Installation

#### Chrome / Edge / Brave and other Chromium browsers

1. Download the latest `PureRead-v<version>.zip` from [Releases](https://github.com/Dnzzk2/PureRead/releases) and unzip it;
2. Open `chrome://extensions/` and turn on **Developer mode** (top-right);
3. Click **Load unpacked** and select the unzipped folder.

#### Firefox

Use a helper such as [CRX Installer](https://addons.mozilla.org/en-US/firefox/addon/crxinstaller/) to import the package.

> [!WARNING]
> **Known Firefox limitation**: Firefox does not implement `chrome.fontSettings`, so the extension **cannot read your installed fonts** and the dropdown only offers a built-in list of common ones. Type a font name **straight into the field** and it works normally.

### Usage

**Change fonts everywhere**: click the toolbar icon → fill in Standard / Code · monospace / Math (an empty field means that kind of text is left alone) → it applies right away.

**Change one site only**: switch the popup to "Site font" and give the current domain its own mapping; use the per-site switch to control whether that site is on.

**Target one part of a page**: open "Extra matching & exclusions" at the bottom of the popup → pick a target rule → click the element on the page → the rule is written automatically, and the notification offers an undo. For hand-written rules, edit them in the Control Center.

**Keep a setup you like**: once the three fonts look right, save them as a preset in the popup and switch between setups with one click.

### Project structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension entry points and permissions (Manifest V3) |
| `background.js` | Service worker: GitHub Releases update check and the 12-hour alarm |
| `content.js` | Content script: CSS injection and the element-picker overlay |
| `popup.html` / `popup.js` | Popup UI: switches, font selection, presets, picker entry point |
| `options.html` / `options.js` | Control Center: sites, selectors, presets, storage, backup, language, about |
| `shared.js` | Defaults, storage helpers, validation and repair, font loading, font preview, virtualized dropdown |
| `i18n.js` | UI string dictionary and runtime localization |
| `_locales/` | Strings Chrome itself reads from the manifest (extension name and description) |
| `public/` | Icons and other static assets |
| `build.py` | Packaging script — walks references from `manifest.json` to build the release zip |

### Development

There is no Node build pipeline. Development happens by loading the folder as an unpacked extension; after a change, reload it in `chrome://extensions/`:

```bash
git clone https://github.com/Dnzzk2/PureRead.git
# chrome://extensions/ → Developer mode → Load unpacked → select the repository root
python3 build.py   # produces PureRead-v<version>.zip
```

Worth checking by hand after a change: the popup's switches and three font fields, saving selectors and managing sites in the Control Center, and picking/undoing with the element picker — plus that `chrome.storage.sync` changes propagate between the popup, the Control Center, and already-open tabs.

Code style follows the existing conventions: 2-space indentation, semicolons, `camelCase`, lowercase filenames, and reusable storage/validation logic in `shared.js`. See [AGENTS.md](./AGENTS.md) for the full guidelines.

### Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Save settings, presets, and site rules |
| `activeTab` | Read the current tab's address when you open the extension, to match site rules |
| `fontSettings` | Read the list of installed fonts to populate the font dropdown |
| `alarms` | Run the update check every 12 hours |

The manifest declares **no** `host_permissions`. A content script is injected on `<all_urls>` — the access this feature genuinely requires in order to write font styles into any page — and it only **writes** a single `<style>` tag into the page.

### Privacy

**PureRead collects none of your data** — no account, no telemetry, no ads. Your font settings live in your browser's own storage, and page content never leaves the browser. The extension makes exactly two read-only requests: one to GitHub for the latest version number (for update notices), and one to [zeoseven](https://fonts.zeoseven.com/) for the typeface used by the extension's own interface (on ordinary pages this loads only after you start picking an element).

See **[PRIVACY.md](./PRIVACY.md)** for the full policy.

### Feedback and credits

Bug reports and feature requests are welcome in [Issues](https://github.com/Dnzzk2/PureRead/issues). Thanks to the [Linux.do](https://linux.do/) community for the support and discussion, and to [zeoseven](https://fonts.zeoseven.com/) for serving the interface typeface.

### License

Released under the [MIT License](./LICENSE).
