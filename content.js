// ── 框架上下文 ────────────────────────────────────────────────
// manifest 用 all_frames 把本脚本注入每一个子框架，但「是否真的改字体」还要
// 由设置里的 iframeFonts 开关决定（见 updateContentStyles）。顶层页面与子框架
// 共用同一份脚本，所以先把这两个判断收在这里。
const IS_TOP_FRAME = (() => {
  try {
    return window.top === window;
  } catch (_) {
    return false;
  }
})();

// 初始加载
// i18n.js 由 manifest 排在 content.js 前面注入，同一个 isolated world，
// 所以这里的 I18n 已经就位。init() 只是把落盘的语言偏好读出来 ——
// 顶层不碰 DOM（document_start 会把它注进每一个页面）。
// 子框架只会用到注入的字体规则，拾取器/toast 的文案只在顶层出现，
// 所以跳过一次 storage.local 读取 —— 页面里可能有几十个 iframe。
if (IS_TOP_FRAME) I18n.init();

// 子框架缺这个字段时按「开启」处理。与 shared.js 的
// DEFAULT_FEATURES.iframeFonts.enabled 必须保持一致。
const DEFAULT_IFRAME_FONTS = true;
const DEFAULT_SHADOW_DOM = true;

// 子框架没有「用户地址栏里那个站点」的概念。站点级开关与「本站字体」都按
// 顶层页面解析 —— 在 example.com 上关掉扩展，它内嵌的 iframe 也应一起停下。
// ancestorOrigins 跨域可读且只给 origin；referrer 是兜底（no-referrer 时会空）。
function getFrameSiteDomain() {
  if (IS_TOP_FRAME) return window.location.hostname;

  try {
    const origins = window.location.ancestorOrigins;
    if (origins && origins.length > 0) {
      const host = new URL(origins[origins.length - 1]).hostname;
      if (host) return host;
    }
  } catch (_) {}

  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host) return host;
    }
  } catch (_) {}

  return window.location.hostname;
}

function iframeFontsEnabled(settings) {
  // 老配置没有这个字段时回落到默认值，不能简单写成 `!== false` ——
  // 那样一旦默认值改成关闭，这里会悄悄把旧配置当成开启。
  const enabled = settings?.global?.features?.iframeFonts?.enabled;
  return typeof enabled === "boolean" ? enabled : DEFAULT_IFRAME_FONTS;
}

function shadowDomEnabled(settings) {
  const enabled = settings?.global?.features?.shadowDom?.enabled;
  return typeof enabled === "boolean" ? enabled : DEFAULT_SHADOW_DOM;
}

// 内存中的设置快照，用于对比减少重绘
let currentSettingsStr = "";
// 最近一次生效的设置。排除项需要等页面样式表就绪后重新读一次原字体，
// 这个快照就是那时重新 apply 的输入。
let latestSettings = null;

// 排除项真正恢复页面原字体所需的记录。
//
// 只靠 :not(...) 只能让规则不命中被排除的元素，挡不住「祖先已经被换成
// 用户字体，子元素继承下来」—— 这正是嵌套元素排除不掉的根因。所以这里在
// 撤掉自己的 <style> 之后，用 getComputedStyle 读一次页面原来的字体，
// 再以 inline !important 钉回被排除的根元素；子树仍由 :not(排除项 *)
// 挡住，不会被子元素自己的规则误伤。改动设置时先撤销钉回再重新读取。
const excludedFontElements = new Set();
const excludedFontPrevious = new WeakMap();
const MAX_EXCLUDED_FONT_RESETS = 1000;
let excludeRefreshHookInstalled = false;

// 嵌套 shadow 链的额外匹配通过 inline style 落到最内层元素上；记录旧值，
// 关闭/改设置时原样还回去。
const chainFontElements = new Set();
const chainFontPrevious = new WeakMap();

// 每个开放 shadow root 里注入的字体样式表。root 被移除后这里的强引用
// 仍然存在，所以 applyShadowStyles 会顺手清掉已不在文档里的条目。
const shadowStyleMap = new Map();
let shadowRefreshTimers = [];
let latestShadowCss = "";
let shadowObserver = null;
let observedShadowRoots = new WeakSet();
let shadowMutationTimer = null;

chrome.storage.sync.get(["settings"], (result) => {
  if (result.settings) {
    updateContentStyles(result.settings);
  }
});

// 界面语言变了：拾取浮层每次都是新建的，所以「下次打开用新语言」自动成立；
// 只有正开着的时候需要就地把提示条重画一遍。
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.uiLocale) return;
  I18n.applyPref(changes.uiLocale.newValue);
  if (selectorPickerState) {
    updatePickerTip(
      selectorPickerState.hoveredElement,
      selectorPickerState.hoveredSelector,
      selectorPickerState.hoveredBlocked,
    );
  }
});

// 监听来自 Popup / Background 的消息（统一入口）
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "startSelectorPicker") {
    // all_frames 之后，popup 的 tabs.sendMessage 会送到每一个框架；拾取器
    // 只属于顶层页面（坐标、滚动、浮层都按顶层视口算），子框架直接忽略。
    if (!IS_TOP_FRAME) return;
    startSelectorPicker(request.target);
    if (sendResponse) sendResponse({ ok: true });
    return true;
  }

  if (!request.settings) return;
  if (request.action === "updateStyles") {
    updateContentStyles(request.settings);
  }
});

function isPartSelector(selector) {
  return String(selector).includes("::part(");
}

// 嵌套 shadow 的定向路径。纯 CSS 的 ::part() 只能跨一层，所以这里用
// 「外层宿主 >>> 内层宿主::part(name)」把不可达的链路显式记下来，
// 应用时逐层进入 shadow root 再写字体。
function isShadowChainSelector(selector) {
  return String(selector).includes(">>>");
}

// host::part(name) 不能直接交给 querySelectorAll；拆成宿主选择器，
// 再到开放 shadow root 里按 part 属性找元素。
function queryPartElements(selector) {
  const match = String(selector).match(/^(.*)::part\(([^)]+)\)$/);
  if (!match) return [];

  const hostSelector = match[1].trim();
  const partName = match[2].trim().split(/\s+/)[0];
  if (!hostSelector || !partName) return [];

  const escapedName = partName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const elements = [];
  let hosts;
  try {
    hosts = document.querySelectorAll(hostSelector);
  } catch (_) {
    return [];
  }

  for (const host of hosts) {
    const shadowRoot = host.shadowRoot;
    if (!shadowRoot) continue;
    try {
      shadowRoot
        .querySelectorAll(`[part~="${escapedName}"]`)
        .forEach((element) => elements.push(element));
    } catch (_) {}
  }
  return elements;
}

// 从最内层 part 往外拼：内层宿主选择器 + ::part(name)，再逐层 prepend
// 外层宿主在各自父树里的选择器。只有两层以上才需要链；单层仍然用 CSS
// 的 host::part(name) 就够了。
function buildShadowChain(partName, partRoot) {
  const segments = [];
  let currentRoot = partRoot;
  let innermost = true;

  while (currentRoot && currentRoot.nodeType === 11 && currentRoot.host) {
    const host = currentRoot.host;
    const parentRoot = host.getRootNode();
    const hostSelector = buildSelectorPath(host, parentRoot);
    if (!hostSelector) return "";

    segments.unshift(
      innermost ? `${hostSelector}::part(${partName})` : hostSelector,
    );
    innermost = false;

    if (parentRoot && parentRoot.nodeType === 9) break;
    currentRoot = parentRoot;
  }

  return segments.length > 1 ? segments.join(" >>> ") : segments[0] || "";
}

// 链只在应用设置时解析；开放 shadow root 找不到就返回空，不抛错。
function resolveShadowChain(selector) {
  const segments = String(selector)
    .split(">>>")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return [];

  const results = [];
  const walk = (scope, index) => {
    const segment = segments[index];
    const isLast = index === segments.length - 1;
    const partMatch = segment.match(/^(.*?)::part\(([^)]+)\)$/);

    if (isLast && partMatch) {
      const hostSelector = partMatch[1].trim();
      const partName = partMatch[2].trim().split(/\s+/)[0];
      if (!hostSelector || !partName) return;

      const escapedName = partName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      let hosts;
      try {
        hosts = scope.querySelectorAll(hostSelector);
      } catch (_) {
        return;
      }

      for (const host of hosts) {
        const shadowRoot = host.shadowRoot;
        if (!shadowRoot) continue;
        try {
          shadowRoot
            .querySelectorAll(`[part~="${escapedName}"]`)
            .forEach((element) => results.push(element));
        } catch (_) {}
      }
      return;
    }

    let matches;
    try {
      matches = scope.querySelectorAll(segment);
    } catch (_) {
      return;
    }

    for (const element of matches) {
      if (isLast) {
        results.push(element);
      } else if (element.shadowRoot) {
        walk(element.shadowRoot, index + 1);
      }
    }
  };

  walk(document, 0);
  return results;
}

function clearExcludedFontResets() {
  for (const element of excludedFontElements) {
    const previous = excludedFontPrevious.get(element);
    if (previous && previous.value) {
      element.style.setProperty(
        "font-family",
        previous.value,
        previous.priority,
      );
    } else {
      element.style.removeProperty("font-family");
    }
    // 撤销后别在页面上留下一个空的 style="" 属性。
    if (element.style.length === 0) element.removeAttribute("style");
    excludedFontPrevious.delete(element);
  }
  excludedFontElements.clear();
}

// 在页面自己的样式下读取被排除元素的原始字体，然后钉回去。
// 必须先撤掉本扩展的 <style> 和上一轮钉回，否则读到的就是自己写的字体。
function captureStyleProperty(element, property) {
  return {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
}

function restoreStyleProperty(element, property, previous) {
  if (previous && previous.value) {
    element.style.setProperty(property, previous.value, previous.priority);
  } else {
    element.style.removeProperty(property);
  }
}

function clearChainFontOverrides() {
  for (const element of chainFontElements) {
    const previous = chainFontPrevious.get(element);
    if (previous) {
      restoreStyleProperty(element, "font-family", previous.fontFamily);
      restoreStyleProperty(element, "line-height", previous.lineHeight);
    }
    if (element.style.length === 0) element.removeAttribute("style");
    chainFontPrevious.delete(element);
  }
  chainFontElements.clear();
}

function fontFamilyValue(name, fallback) {
  const escaped = String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}", ${fallback}`;
}

function hasExcludedAncestor(element) {
  let current = element;
  while (current) {
    if (excludedFontElements.has(current)) return true;
    if (current.parentElement) {
      current = current.parentElement;
    } else {
      // 到 shadow root 顶部后跳到宿主，继续检查外层是否被排除。
      const root = current.getRootNode();
      current = root && root.host ? root.host : null;
    }
  }
  return false;
}

function collectOpenShadowRoots() {
  const roots = [];
  const walk = (scope) => {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      const root = node.shadowRoot;
      if (!root) continue;
      roots.push(root);
      walk(root);
    }
  };
  walk(document);
  return roots;
}

function clearShadowRefreshTimers() {
  for (const timer of shadowRefreshTimers) clearTimeout(timer);
  shadowRefreshTimers = [];
}

function isOwnShadowStyleMutation(mutation) {
  const target = mutation.target;
  if (
    target &&
    target.nodeType === 1 &&
    target.matches?.("style[data-pure-read-shadow]")
  ) {
    return true;
  }
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  return (
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        node.nodeType === 1 &&
        node.matches?.("style[data-pure-read-shadow]"),
    )
  );
}

function ensureShadowObserver() {
  if (shadowObserver) return;

  shadowObserver = new MutationObserver((mutations) => {
    if (!latestShadowCss) return;
    // 忽略我们自己插入/更新 shadow <style> 造成的 mutation，避免自激。
    if (mutations.every(isOwnShadowStyleMutation)) return;

    clearTimeout(shadowMutationTimer);
    shadowMutationTimer = setTimeout(() => {
      shadowMutationTimer = null;
      if (latestShadowCss) applyShadowStyles(latestShadowCss, true);
    }, 300);
  });

  shadowObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function removeShadowStyles() {
  clearShadowRefreshTimers();
  clearTimeout(shadowMutationTimer);
  shadowMutationTimer = null;
  latestShadowCss = "";

  if (shadowObserver) {
    shadowObserver.disconnect();
    shadowObserver = null;
  }
  observedShadowRoots = new WeakSet();

  for (const style of shadowStyleMap.values()) style.remove();
  shadowStyleMap.clear();
}

// 有些组件在 DOMContentLoaded 之后才升级/挂载 shadow root。安排几次
// 轻量重扫；MutationObserver 处理正常的 DOM 新增，这里专门兜底
// 「宿主已经存在、后来才 attachShadow」的情况。
function scheduleShadowRescan(css, enabled) {
  clearShadowRefreshTimers();
  if (!enabled || !css) return;

  for (const delay of [250, 800, 2000, 5000]) {
    shadowRefreshTimers.push(
      setTimeout(() => applyShadowStyles(css, true), delay),
    );
  }
}

// 把与顶层同样的字体规则写进每一个开放 shadow root。这样组件内部
// 就算显式声明了 font-family，也会被 !important 盖掉，不需要逐个 part
// 额外匹配。宿主（或它的 shadow 宿主祖先）被排除时整棵 root 跳过。
function applyShadowStyles(css, enabled) {
  if (!enabled || !css) {
    removeShadowStyles();
    return;
  }

  latestShadowCss = css;
  ensureShadowObserver();

  const roots = collectOpenShadowRoots();
  const seen = new Set();

  for (const root of roots) {
    if (hasExcludedAncestor(root.host)) continue;
    seen.add(root);

    if (!observedShadowRoots.has(root)) {
      observedShadowRoots.add(root);
      shadowObserver.observe(root, { childList: true, subtree: true });
    }

    let style = shadowStyleMap.get(root);
    if (!style) {
      style = document.createElement("style");
      style.setAttribute("data-pure-read-shadow", "");
      shadowStyleMap.set(root, style);
      root.appendChild(style);
    }
    // 设置没变时不重写，避免无谓的样式重算。
    if (style.textContent !== css) style.textContent = css;
  }

  for (const [root, style] of shadowStyleMap) {
    if (seen.has(root)) continue;
    style.remove();
    shadowStyleMap.delete(root);
  }
}

function applyChainFontOverrides(rules) {
  for (const rule of rules) {
    const { element, font, fallback, lineHeight } = rule;
    if (!element || !font) continue;
    // 排除项优先：目标自身或任一 shadow 宿主祖先被排除时，保留原字体。
    if (hasExcludedAncestor(element)) continue;

    if (!chainFontPrevious.has(element)) {
      chainFontPrevious.set(element, {
        fontFamily: captureStyleProperty(element, "font-family"),
        lineHeight: captureStyleProperty(element, "line-height"),
      });
      chainFontElements.add(element);
    }

    element.style.setProperty(
      "font-family",
      fontFamilyValue(font, fallback),
      "important",
    );
    if (lineHeight) {
      element.style.setProperty("line-height", lineHeight, "important");
    }
  }
}

function resetExcludedFonts(
  excludeSelectors,
  partSelectors = [],
  chainSelectors = [],
) {
  if (
    !excludeSelectors.length &&
    !partSelectors.length &&
    !chainSelectors.length
  ) {
    clearExcludedFontResets();
    return;
  }

  document.getElementById("pure-read-injector")?.remove();
  clearExcludedFontResets();

  const elements = new Set();
  for (const selector of excludeSelectors) {
    try {
      document
        .querySelectorAll(selector)
        .forEach((element) => elements.add(element));
    } catch (_) {}
  }
  for (const selector of partSelectors) {
    queryPartElements(selector).forEach((element) => elements.add(element));
  }
  for (const selector of chainSelectors) {
    resolveShadowChain(selector).forEach((element) => elements.add(element));
  }

  if (elements.size > MAX_EXCLUDED_FONT_RESETS) {
    console.warn(
      "[PureRead] 排除项命中元素过多，已跳过原字体回填:",
      elements.size,
    );
    return;
  }

  for (const element of elements) {
    let original;
    try {
      original = getComputedStyle(element).fontFamily;
    } catch (_) {
      continue;
    }
    if (!original) continue;

    excludedFontPrevious.set(element, {
      value: element.style.getPropertyValue("font-family"),
      priority: element.style.getPropertyPriority("font-family"),
    });
    element.style.setProperty("font-family", original, "important");
    excludedFontElements.add(element);
  }
}

// 内容脚本在 document_start 注入，此时外部样式表可能还没解析完，
// 读到的「原字体」会失真。等 DOMContentLoaded（渲染阻塞样式表已加载）
// 再重跑一次；只在存在排除项或嵌套链时安装，避免无谓的重绘。
function installExcludeRefreshHook() {
  if (excludeRefreshHookInstalled) return;
  excludeRefreshHookInstalled = true;

  const refresh = () => {
    if (latestSettings) updateContentStyles(latestSettings);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    setTimeout(refresh, 0);
  }
}

// 监听存储变化（其他页面/tab 的配置更新会触发这里）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.settings) {
    const newSettings = changes.settings.newValue;
    const newSettingsStr = JSON.stringify(newSettings);

    // 如果设置内容没变（比如只是其它无关状态更新），则不执行重绘
    if (newSettingsStr === currentSettingsStr) return;
    currentSettingsStr = newSettingsStr;

    if (newSettings) {
      updateContentStyles(newSettings);
    }
  }
});

function updateContentStyles(settings) {
  latestSettings = settings;
  const domain = getFrameSiteDomain();
  const global = settings.global || {};
  const sites = settings.sites || {};
  const site = sites[domain];

  // 获取最终生效的开关状态：若站点有明确设置则用站点的，否则用全局的
  const isEnabled = site && typeof site.on === "boolean" ? site.on : global.on;

  if (!isEnabled) {
    return removeStyles();
  }

  // 子框架只在「应用到内嵌框架」开启时写入样式。关掉开关后这里会走
  // removeStyles，已经注入过的 iframe 也会立即恢复原样（storage 变化会
  // 在每个框架里触发一次 updateContentStyles）。
  if (!IS_TOP_FRAME && !iframeFontsEnabled(settings)) {
    return removeStyles();
  }

  const isCustom = site?.mode === "custom";
  const mapping = (isCustom ? site.mapping : global.mapping) || {
    standard: "",
    mono: "",
    math: "",
  };

  const selectors = global.selectors || { standard: "", mono: "", math: "" };
  applyStyles(mapping, selectors, { shadowDom: shadowDomEnabled(settings) });
}

function removeStyles() {
  document.getElementById("pure-read-injector")?.remove();
  removeShadowStyles();
  clearChainFontOverrides();
  clearExcludedFontResets();
}

function applyStyles(mapping, selectors, { shadowDom = false } = {}) {
  const font = (name, fallback) => (name ? `font-family: "${name}", ${fallback} !important;` : "");
  const selectorConfig =
    typeof selectors === "string"
      ? {
          include: { standard: selectors, mono: "", math: "" },
          exclude: "",
        }
      : selectors && typeof selectors === "object"
        ? {
            include:
              selectors.include && typeof selectors.include === "object"
                ? {
                    standard: selectors.include.standard || "",
                    mono: selectors.include.mono || "",
                    math: selectors.include.math || "",
                  }
                : {
                    standard: selectors.standard || "",
                    mono: selectors.mono || "",
                    math: selectors.math || "",
                  },
            exclude: typeof selectors.exclude === "string" ? selectors.exclude : "",
          }
        : {
            include: { standard: "", mono: "", math: "" },
            exclude: "",
          };

  const parseSelectorList = (raw, { stripPseudo = false } = {}) =>
    String(raw || "")
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter((s) => s)
      .map((s) => (stripPseudo ? s.replace(/::?(before|after)$/i, "").trim() : s))
      .filter((s) => s);

  // ::part() 只能出现在复合选择器的末尾，后面再接 :not(...) 会让整条
  // 规则失效（浏览器会把它当成非法选择器丢掉）。所以排除门要插在
  // ::part 之前：mdn-button:not(...)::part(label) 才是合法的。
  const gateForSelector = (selector, gate) => {
    if (!gate) return selector;
    const partIndex = selector.indexOf("::part(");
    return partIndex === -1
      ? `${selector}${gate}`
      : `${selector.slice(0, partIndex)}${gate}${selector.slice(partIndex)}`;
  };

  const getExtra = (key, gate = "") => {
    const list = parseSelectorList(selectorConfig.include[key]).filter(
      (selector) =>
        !isShadowChainSelector(selector) &&
        !isPartSelector(selector) &&
        !partExcludeLines.includes(selector) &&
        !chainExcludeLines.includes(selector),
    );
    return list.length
      ? `, ${list.map((selector) => gateForSelector(selector, gate)).join(", ")}`
      : "";
  };

  // 默认内置排除规则
  const exclude = {
    icon: ':not(.fa):not(.fas):not(.far):not(.fab):not(.glyphicon):not(.iconfont):not([class*="fa-" i]):not([class*="icon" i]):not([class*="ico-" i]):not([class*="ico_" i]):not([class*="glyph" i]):not([class*="symbol" i]):not([class*="emoji" i]):not([data-icon]):not([role="img"]):not([aria-hidden="true"]):not(i)',
    code: ':not(pre):not(pre *):not(code):not(code *):not(kbd):not(samp):not([class*="pl-"]):not([class*="blob-code"]):not([class*="highlight"])',
    media: ":not(video):not(iframe):not(canvas):not(svg):not(svg *):not(img):not(audio)",
    player: ':not([class*="player"]):not([class*="Player"]):not([class*="video"]):not([class*="Video"])',
  };

  // 代码编辑器推断：先用主流编辑器的稳定 class，再覆盖常见的
  // contenteditable「类名/ID 带 editor/code」变体。这些元素整棵子树
  // 从正文字体里排除，改由「代码 / 等宽」字体接管；但不再强迫行高，
  // 避免把编辑器行高、光标位置压坏。
  const EDITOR_SELECTORS = [
    ".cm-editor",
    ".CodeMirror",
    ".monaco-editor",
    ".ace_editor",
    ".hljs",
    ".xterm",
    ".terminal",
    '[class*="codemirror" i]',
    '[class*="code-editor" i]',
    '[class*="code-block" i]',
    '[class*="codeblock" i]',
    '[class*="source-code" i]',
    '[class*="monaco-editor" i]',
    '[class*="ace_editor" i]',
    '[data-language]',
    '[contenteditable][class*="editor" i]',
    '[contenteditable][id*="editor" i]',
    '[contenteditable][class*="code" i]',
    '[contenteditable][id*="code" i]',
    'textarea[class*="editor" i]',
    'textarea[id*="editor" i]',
    'textarea[class*="code" i]',
    'textarea[id*="code" i]',
  ];
  const editorGate = EDITOR_SELECTORS.flatMap((selector) => [
    `:not(${selector})`,
    `:not(${selector} *)`,
  ]).join("");

  const allExcludeLines = parseSelectorList(selectorConfig.exclude, {
    stripPseudo: true,
  });
  // ::part 选择器不能进 :not()，也无法用 querySelectorAll 读取原字体；
  // 它只用于「不要对某个 part 做额外匹配」，所以单独拆出来。
  // >>> 链同样不是 CSS 选择器，由运行时解析后走 inline style。
  const chainExcludeLines = allExcludeLines.filter(isShadowChainSelector);
  const partExcludeLines = allExcludeLines.filter(
    (selector) =>
      !isShadowChainSelector(selector) && isPartSelector(selector),
  );
  const manualExcludeLines = allExcludeLines.filter(
    (selector) =>
      !isShadowChainSelector(selector) && !isPartSelector(selector),
  );
  const excludeSelectorStr = manualExcludeLines.length
    ? manualExcludeLines.flatMap((s) => [s, `${s} *`]).join(", ")
    : "";
  const manualExcludeGate = excludeSelectorStr ? `:not(${excludeSelectorStr})` : "";
  // 编辑器主题（CodeMirror/Monaco）常用高特异性规则写 font-family，
  // 这里借一个永远不会存在的 id 抬高特异性，确保用户的代码字体能压过去。
  const EDITOR_BOOST = ":not(#pure-read-editor-never-match)";
  const editorSelectorsGated = EDITOR_SELECTORS.flatMap((selector) => [
    `${selector}${EDITOR_BOOST}${manualExcludeGate}`,
    `${selector}${EDITOR_BOOST} *${manualExcludeGate}`,
  ]).join(", ");

  // 链式额外匹配是 inline style，shadow root 里也有上一轮的注入样式；
  // 读原字体前必须全部撤掉，否则排除项读到的是自己写的字体。
  clearChainFontOverrides();
  removeShadowStyles();
  // 这一步会先撤掉旧 <style>，读取页面原字体后再钉回；必须发生在生成新
  // 样式之前，否则读到的就是上一轮的用户字体。
  resetExcludedFonts(
    manualExcludeLines,
    partExcludeLines,
    chainExcludeLines,
  );

  // part / >>> 链不走普通 CSS：解析出最内层元素后写 inline style。
  // shadow root 里注入的 * 规则也是 !important，只有 inline 才能稳定
  // 盖过它；同时也能处理链式嵌套。
  const shadowRules = [];
  const addShadowRules = (key, fontName, fallback, lineHeight) => {
    if (!fontName) return;
    for (const selector of parseSelectorList(selectorConfig.include[key])) {
      if (
        partExcludeLines.includes(selector) ||
        chainExcludeLines.includes(selector)
      ) {
        continue;
      }

      let targets;
      if (isShadowChainSelector(selector)) {
        targets = resolveShadowChain(selector);
      } else if (isPartSelector(selector)) {
        targets = queryPartElements(selector);
      } else {
        continue;
      }

      for (const element of targets) {
        shadowRules.push({ element, font: fontName, fallback, lineHeight });
      }
    }
  };
  addShadowRules("standard", mapping.standard, "sans-serif", "");
  addShadowRules("mono", mapping.mono, "monospace", "1.4");
  addShadowRules("math", mapping.math, "serif", "");

  const hasShadowTargetIncludes = ["standard", "mono", "math"].some((key) =>
    parseSelectorList(selectorConfig.include[key]).some(
      (selector) =>
        (isShadowChainSelector(selector) || isPartSelector(selector)) &&
        !partExcludeLines.includes(selector) &&
        !chainExcludeLines.includes(selector),
    ),
  );

  const css = `
    /* 标准字体 */
    body *${exclude.code}${exclude.media}${exclude.player}${exclude.icon}${editorGate}:not(math):not(.katex)${manualExcludeGate}${getExtra("standard", manualExcludeGate)} {
      ${font(mapping.standard, "sans-serif")}
    }

    /* 代码块 */
    body pre${manualExcludeGate}, body code${manualExcludeGate}, body kbd${manualExcludeGate}, body samp${manualExcludeGate},
    body pre *${manualExcludeGate}, body code *${manualExcludeGate}, body kbd *${manualExcludeGate}, body samp *${manualExcludeGate},
    body .blob-code${manualExcludeGate}, body .blob-code *${manualExcludeGate}, body .text-mono${manualExcludeGate}, body .mono${manualExcludeGate},
    [class*="pl-"]${manualExcludeGate}, .blob-code-inner${manualExcludeGate}, .blob-code-inner *${manualExcludeGate},
    div.highlight pre${manualExcludeGate}, div.highlight pre *${manualExcludeGate},
    pre[class*="language"]${manualExcludeGate}, pre[class*="language"] *${manualExcludeGate},
    code[class*="language"]${manualExcludeGate}, code[class*="language"] *${manualExcludeGate}${getExtra("mono", manualExcludeGate)} {
      ${font(mapping.mono, "monospace")}
      line-height: 1.4 !important;
    }

    ${mapping.mono ? `
    /* 代码编辑器：只换字体，不改行高，避免破坏编辑器的光标/对齐 */
    ${editorSelectorsGated} {
      ${font(mapping.mono, "monospace")}
    }
    ` : ""}

    /* 数学公式 */
    body math${manualExcludeGate}, body math *${manualExcludeGate}, body .mjx-chtml${manualExcludeGate}, body .mjx-chtml *${manualExcludeGate},
    body .katex${manualExcludeGate}, body .katex *${manualExcludeGate}${getExtra("math", manualExcludeGate)} {
      ${font(mapping.math, "serif")}
    }
  `;

  // shadow root 内的版本：去掉 body 前缀；额外匹配不复制（链式规则
  // 会以 inline style 精确覆盖具体元素），其余排除规则保持一致。
  const hasShadowFont = Boolean(
    mapping.standard || mapping.mono || mapping.math,
  );
  const shadowCss = !hasShadowFont
    ? ""
    : `
      *${exclude.code}${exclude.media}${exclude.player}${exclude.icon}${editorGate}:not(math):not(.katex)${manualExcludeGate} {
        ${font(mapping.standard, "sans-serif")}
      }

      pre${manualExcludeGate}, code${manualExcludeGate}, kbd${manualExcludeGate}, samp${manualExcludeGate},
      pre *${manualExcludeGate}, code *${manualExcludeGate}, kbd *${manualExcludeGate}, samp *${manualExcludeGate},
      .blob-code${manualExcludeGate}, .blob-code *${manualExcludeGate}, .text-mono${manualExcludeGate}, .mono${manualExcludeGate},
      [class*="pl-"]${manualExcludeGate}, .blob-code-inner${manualExcludeGate}, .blob-code-inner *${manualExcludeGate},
      div.highlight pre${manualExcludeGate}, div.highlight pre *${manualExcludeGate},
      pre[class*="language"]${manualExcludeGate}, pre[class*="language"] *${manualExcludeGate},
      code[class*="language"]${manualExcludeGate}, code[class*="language"] *${manualExcludeGate} {
        ${font(mapping.mono, "monospace")}
        line-height: 1.4 !important;
      }

      ${mapping.mono ? `
      /* 代码编辑器：只换字体，不改行高 */
      ${editorSelectorsGated} {
        ${font(mapping.mono, "monospace")}
      }
      ` : ""}

      math${manualExcludeGate}, math *${manualExcludeGate}, .mjx-chtml${manualExcludeGate}, .mjx-chtml *${manualExcludeGate},
      .katex${manualExcludeGate}, .katex *${manualExcludeGate} {
        ${font(mapping.math, "serif")}
      }
    `;

  let style = document.getElementById("pure-read-injector");
  if (!style) {
    style = document.createElement("style");
    style.id = "pure-read-injector";
  }
  style.textContent = css;
  // resetExcludedFonts() 会先把旧 <style> 摘掉再读原字体，所以这里要按
  // isConnected 判断，不能假定节点还在文档里。
  if (!style.isConnected) {
    document.documentElement.appendChild(style);
  }

  applyChainFontOverrides(shadowRules);
  applyShadowStyles(shadowCss, shadowDom);
  scheduleShadowRescan(shadowCss, shadowDom);

  if (
    manualExcludeLines.length ||
    partExcludeLines.length ||
    chainExcludeLines.length ||
    hasShadowTargetIncludes
  ) {
    installExcludeRefreshHook();
  }
}

// 拾取目标的名字。原先是一张常量表 + `PICKER_TARGET_LABELS[t].split(" · ")[1]`
// 取短名 —— 按分隔符切串对语言很脆（中文用「·」，英文未必是这个符号）。
// 现在两种长度各是一个独立的键，切换语言时现取现用。
const PICKER_TARGETS = ["standard", "mono", "math", "exclude"];

function pickerTargetLabel(target) {
  return I18n.t(`picker.target.${target}`);
}

function pickerTargetShortLabel(target) {
  return I18n.t(`picker.target.${target}.short`);
}

let selectorPickerState = null;
// 同一时刻只会有一条 toast（id 唯一），所以这两个计时器用模块级变量就够了：
// selectorPickerToastTimer 管「到点自动消失」，selectorPickerToastExitTimer
// 是退场动画的兜底（见 dismissSelectorPickerToast）。
let selectorPickerToastTimer = null;
let selectorPickerToastExitTimer = null;
let selectorPickerToastId = "pure-read-selector-picker-toast";

// 拾取浮层跟随扩展界面字体（storage.local 的 uiFont）。默认系统字体；
// 不引入任何远程字体，隐私和离线都更稳。
const UI_FONT_SYSTEM_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif';
let PICKER_FLOAT_FONT = UI_FONT_SYSTEM_STACK;

function uiFontCssValue(value) {
  const family =
    value &&
    typeof value === "object" &&
    value.mode === "custom" &&
    typeof value.family === "string"
      ? value.family.trim()
      : "";
  if (!family) return UI_FONT_SYSTEM_STACK;
  const escaped = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}", ${UI_FONT_SYSTEM_STACK}`;
}

if (IS_TOP_FRAME) {
  chrome.storage.local.get(["uiFont"], (result) => {
    PICKER_FLOAT_FONT = uiFontCssValue(result.uiFont);
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.uiFont) {
      PICKER_FLOAT_FONT = uiFontCssValue(changes.uiFont.newValue);
    }
  });
}
// 四种拾取类型各一个色相，取值对齐 options.html 图标圆的语义色（明/暗两套）。
// 约束：值必须保持 6 位 hex —— hexToRgba() 依赖它。
const PICKER_TARGET_HUES = {
  standard: { light: "#2563eb", dark: "#60a5fa" }, // 蓝：默认强调色，保持改造前的观感
  mono: { light: "#7c3aed", dark: "#a78bfa" }, // 紫：与拾取器写入的「额外匹配与排除」卡片同色
  math: { light: "#b45309", dark: "#fbbf24" }, // 琥珀
  // 玫红：排除＝限制/移除。亮色取 rose-700 而非 rose-600 的 #e11d48 ——
  // 这一色在 popup 里要当 12px 按钮文字用，#e11d48 压在面板底 #faf9f7 上
  // 只有 4.46:1，差一点点没到 4.5；#be123c 是 5.97:1。
  // 与 options.html 把琥珀从 600 档降到 #b45309 是同一个理由。
  exclude: { light: "#be123c", dark: "#fb7185" },
};

// 毛玻璃。两个前提缺一不可：底色带透明、且声明 backdrop-filter。
// 之前只声明了 filter、底色却是 #ffffff / #1a1a1e 全不透明 ——
// 不透明背景会把滤镜结果整块盖掉，那行等于是死的。
const PICKER_BACKDROP = "saturate(180%) blur(16px)";

// 通知的进出场。关键帧在 ensureSelectorPickerUiStyle 注入的样式表里（与调色板无关）。
// 关掉动画时（prefers-reduced-motion）这两个值不会被用上 —— 见 dismissSelectorPickerToast。
const PICKER_TOAST_ENTER = "prPickerToastIn 280ms cubic-bezier(0.16, 1, 0.3, 1)";
const PICKER_TOAST_LEAVE =
  "prPickerToastOut 180ms cubic-bezier(0.4, 0, 1, 1) forwards";

// 与色相无关的表面与文字。暗色那组对齐 options.html 的 dark :root，
// 让浮窗和扩展自己的页面看起来是同一套东西。
//
// surface 是「浮在页面上的那层玻璃」，所以带 14% 透明：背后的页面能透上来一点，
// 浅色页上的深色浮窗、深色页上的浅色浮窗都不再是一块突兀的实心色板。
// 代价是文字对比度会随背后内容浮动 —— 实测最极端的情况（深色浮窗压纯白页、
// 浅色浮窗压纯黑页）仍在 9.6:1 以上，9px 键帽也够。
//
// surfaceAlt 是浮窗内部的元素（键帽、目标徽章、撤销按钮），它们垫在玻璃上，
// 必须不透明，否则自己也要被背后的页面染一遍，小字就糊了。
const PICKER_SURFACE = {
  light: {
    text: "#1f2937",
    textMuted: "#6b7280",
    surface: "rgba(255,255,255,0.86)",
    surfaceAlt: "#f9fafb",
    border: "#e5e7eb",
    divider: "rgba(0,0,0,0.04)",
    ring: "rgba(255,255,255,0.94)",
    inset: "rgba(255,255,255,0.85)",
    shadowStrong: "rgba(0,0,0,0.15)",
    shadowSoft: "rgba(0,0,0,0.02)",
    error: "#dc2626",
    errorSoft: "rgba(220,38,38,0.08)",
  },
  dark: {
    text: "#ececef",
    textMuted: "#9898a0",
    surface: "rgba(26,26,30,0.86)",
    surfaceAlt: "#222226",
    border: "#2e2e32",
    divider: "rgba(255,255,255,0.08)",
    ring: "rgba(255,255,255,0.14)",
    inset: "rgba(255,255,255,0.06)",
    shadowStrong: "rgba(0,0,0,0.5)",
    shadowSoft: "rgba(0,0,0,0.3)",
    error: "#f87171",
    errorSoft: "rgba(248,113,113,0.14)",
  },
};

// 明暗判断与 popup / options 完全同一依据：只跟系统偏好，
// 不去嗅探宿主页的 color-scheme —— 否则同一个系统设置下三处会不一致。
function pickerSchemeQuery() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)");
  } catch (_) {
    return null;
  }
}

function detectPickerTheme() {
  const query = pickerSchemeQuery();
  return query && query.matches ? "dark" : "light";
}

// 6 位 hex → rgba()。取代原来 `${color}08` 那种拼 alpha 的写法：
// 拼法只在锚点恰好是 6 位 hex 时成立，而且表达不出「暗色要更高 alpha」。
function hexToRgba(hex, alpha) {
  const raw = String(hex).replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 按「当前主题 + 拾取类型」合成一套调色板，render 时现取。
// 现取而不是启动时算一次：主题一变，下次重画就跟上了
// （拾取器存活期间用户切系统外观，见 startSelectorPicker 里的 matchMedia）。
// 暗色的几处淡色刻意用了更高 alpha —— 深色底上 8% 基本看不见。
function pickerColors(target) {
  const theme = detectPickerTheme();
  const hue = (PICKER_TARGET_HUES[target] || PICKER_TARGET_HUES.standard)[theme];
  const dark = theme === "dark";
  return {
    ...PICKER_SURFACE[theme],
    primary: hue,
    accent: hue,
    primarySoft: hexToRgba(hue, dark ? 0.16 : 0.08), // 各种淡色底 + 呼吸动画最外圈
    accentSoft: hexToRgba(hue, dark ? 0.26 : 0.16), // toast 色点外的光晕
    accentDash: hexToRgba(hue, dark ? 0.34 : 0.18), // 浮窗里虚线面板的边框
    glow: hexToRgba(hue, 0.35),
    glowStrong: hexToRgba(hue, 0.4),
  };
}
const selectorPickerUiStyleId = "pure-read-selector-picker-ui-style";

function ensureSelectorPickerUiStyle() {
  if (document.getElementById(selectorPickerUiStyleId)) return;

  const style = document.createElement("style");
  style.id = selectorPickerUiStyleId;
  style.textContent = `
    /* toast 钉在右上角，所以进出都走右边这条边：从右侧滑进来、再往右侧退回去。
       原来是从上方 -10px 落下来，跟它贴的那条边不一致，像是从屏幕外掉下来的。
       缩放中心由元素的 transform-origin: top right 决定，正好是钉住的那个角。 */
    @keyframes prPickerToastIn {
      0% {
        opacity: 0;
        transform: translate3d(28px, -4px, 0) scale(0.97);
      }
      100% {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
    }

    @keyframes prPickerToastOut {
      0% {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate3d(20px, -4px, 0) scale(0.98);
      }
    }

    @keyframes prPickerTipIn {
      0% {
        opacity: 0;
        transform: translate3d(0, 8px, 0) scale(0.98);
      }
      100% {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
    }

    /* 颜色一律走元素级变量，样式表本身与调色板无关：
       换主题/换拾取类型时只重设选取框上的 --pr-*，不必重建这个 <style>。
       也不能把颜色烤进来 —— 那样每换一次类型就得重建整个 <style>。 */
    @keyframes prPickerGlow {
      0%,
      100% {
        box-shadow:
          0 0 0 1px var(--pr-ring),
          0 22px 44px -28px var(--pr-glow),
          inset 0 1px 0 var(--pr-inset);
      }
      50% {
        box-shadow:
          0 0 0 1px var(--pr-ring),
          0 26px 52px -26px var(--pr-glow-strong),
          0 0 0 6px var(--pr-halo),
          inset 0 1px 0 var(--pr-inset);
      }
    }
  `;
  document.documentElement.appendChild(style);
}

function getSyncStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => resolve(result || {}));
  });
}

function setSyncStorage(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function ensurePickerSelectorConfig(selectors) {
  if (typeof selectors === "string") {
    return {
      include: { standard: selectors, mono: "", math: "" },
      exclude: "",
    };
  }

  if (!selectors || typeof selectors !== "object") {
    return {
      include: { standard: "", mono: "", math: "" },
      exclude: "",
    };
  }

  if (!selectors.include && !("exclude" in selectors)) {
    return {
      include: {
        standard: selectors.standard || "",
        mono: selectors.mono || "",
        math: selectors.math || "",
      },
      exclude: "",
    };
  }

  return {
    include: {
      standard: selectors.include?.standard || "",
      mono: selectors.include?.mono || "",
      math: selectors.include?.math || "",
    },
    exclude: typeof selectors.exclude === "string" ? selectors.exclude : "",
  };
}

function createDefaultSettings() {
  return {
    global: {
      on: true,
      mapping: { standard: "", mono: "", math: "" },
      typo: {
        enabled: false,
        lineHeight: "1.6",
        fontSize: "100",
        fontWeight: "0",
      },
      selectors: {
        include: { standard: "", mono: "", math: "" },
        exclude: "",
      },
      features: { iframeFonts: { enabled: true } },
    },
    sites: {},
  };
}

function appendSelectorLine(existing, selector) {
  const lines = String(existing || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line);

  if (!lines.includes(selector)) lines.push(selector);
  return lines.join("\n");
}

function removeSelectorPickerToast() {
  document.getElementById(selectorPickerToastId)?.remove();
  if (selectorPickerToastTimer) {
    clearTimeout(selectorPickerToastTimer);
    selectorPickerToastTimer = null;
  }
  // 正在播退场的那条也可能被新通知顶掉，它的兜底计时器一并撤掉。
  if (selectorPickerToastExitTimer) {
    clearTimeout(selectorPickerToastExitTimer);
    selectorPickerToastExitTimer = null;
  }
}

// toast 会活在拾取器生命周期之外：teardownSelectorPicker 先把
// selectorPickerState 置 null，之后「已取消 / 已撤销 / 出错」的 toast 才渲染。
// 所以 target 要能显式传进来，否则撤销 toast 会掉回默认的蓝色。
function currentPickerTarget(target) {
  return target || (selectorPickerState && selectorPickerState.target) || "standard";
}

function pickerPrefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {
    return false;
  }
}

// 退场要等动画跑完才删节点，所以不能再直接 toast.remove()。
// 关掉动画时（prefers-reduced-motion）就直接删，别让节点在那儿白等。
function dismissSelectorPickerToast(toast) {
  if (!toast || !toast.isConnected || toast.dataset.prLeaving === "1") return;

  // 这条 toast 的「到点自动消失」计时器挂在 selectorPickerToastTimer 上。
  // 同一时刻只会有一条 toast（id 唯一），所以这里能安全地认领它 ——
  // 不撤的话，手动撤销之后还会有一个定时器悬着，多攥着节点几秒钟。
  if (selectorPickerToastTimer) {
    clearTimeout(selectorPickerToastTimer);
    selectorPickerToastTimer = null;
  }

  if (pickerPrefersReducedMotion()) {
    toast.remove();
    return;
  }

  toast.dataset.prLeaving = "1";
  toast.style.animation = PICKER_TOAST_LEAVE;

  const finish = () => {
    if (selectorPickerToastExitTimer) {
      clearTimeout(selectorPickerToastExitTimer);
      selectorPickerToastExitTimer = null;
    }
    toast.removeEventListener("animationend", onAnimationEnd);
    toast.remove();
  };
  const onAnimationEnd = (event) => {
    // 入场动画被顶掉时也会走到这里，认准退场那一支再删。
    if (event.animationName === "prPickerToastOut") finish();
  };

  toast.addEventListener("animationend", onAnimationEnd);
  // 兜底：万一 @keyframes 没落地（宿主页摘了样式表），animationend 永远不来，
  // 没有这一条就会把节点永久留在页面上。
  selectorPickerToastExitTimer = setTimeout(finish, 600);
}

// 四种语气各一个图标，24 格。三个带圈的统一用 r=9，视觉重量才一致。
const PICKER_TOAST_ICONS = {
  // 「已添加到 X」那张待撤销的卡：加号圆圈。
  // 之前它和「已取消」共用 info，而 info 画成了一个「圆圈 + 四根短刺」的
  // 半吊子太阳 —— 17px 下刺和圈糊在一起，看不出是什么。而且加号说「添加」、
  // 斜杠说「中止」，本来也不该是同一个图形。
  added:
    '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>',
  // Esc 主动退出：斜杠圆圈＝中止。不用叉，叉在通知里读作「出错」。
  info: '<circle cx="12" cy="12" r="9"></circle><line x1="6" y1="18" x2="18" y2="6"></line>',
  success: '<polyline points="20 6 9 17 4 12"></polyline>',
  error:
    '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="7.5" x2="12" y2="13"></line><line x1="12" y1="16.5" x2="12.01" y2="16.5"></line>',
};

// 两种 toast 共用这一套排版：图标 + 正文，有标题就在正文上头加一行，
// 有动作时再补一条分隔线和一个撤销按钮。
//
// 关键是 minWidth。之前「简单 toast」是个自带 padding 的裸 div，宽度按内容收缩 ——
// 「已取消页面拾取」这种短句会缩成一个约 125×65 的窄条，跟同一角落里的撤销卡片
// 完全不像一个东西。现在两者共用同一档宽度（320–400），一列排下来是对齐的。
//
// 正文一律走 textContent，不走 innerHTML：选择器和错误信息都是页面/系统可控的，
// 用 textContent 就没有转义这回事，调用点也不必再纠结用 t() 还是 tHtml()。
function createSelectorPickerToast({
  tone = "info",
  target,
  title,
  body,
  monoBody = false,
  actionLabel,
  onAction,
  timeout = 2400,
}) {
  ensureSelectorPickerUiStyle();
  removeSelectorPickerToast();

  const colors = pickerColors(currentPickerTarget(target));
  const isError = tone === "error";
  const accent = isError ? colors.error : colors.primary;
  const hasAction = Boolean(actionLabel) && typeof onAction === "function";

  const toast = document.createElement("div");
  toast.id = selectorPickerToastId;
  Object.assign(toast.style, {
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: "2147483647",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    width: "max-content",
    minWidth: "320px",
    maxWidth: "400px",
    padding: "14px 16px",
    borderRadius: "12px",
    fontFamily: PICKER_FLOAT_FONT,
    fontSize: "13px",
    lineHeight: "1.5",
    color: colors.text,
    background: colors.surface,
    border: `1px solid ${isError ? colors.error : colors.border}`,
    boxShadow: `0 16px 40px -12px ${colors.shadowStrong}, 0 2px 8px -2px ${colors.shadowSoft}`,
    backdropFilter: PICKER_BACKDROP,
    WebkitBackdropFilter: PICKER_BACKDROP,
    transformOrigin: "top right",
    animation: pickerPrefersReducedMotion() ? "none" : PICKER_TOAST_ENTER,
  });

  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
  });

  const iconTile = document.createElement("div");
  Object.assign(iconTile.style, {
    width: "32px",
    height: "32px",
    borderRadius: "9px",
    background: isError ? colors.errorSoft : colors.primarySoft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  });
  iconTile.innerHTML = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${PICKER_TOAST_ICONS[tone] || PICKER_TOAST_ICONS.info}
    </svg>
  `;

  const textGroup = document.createElement("div");
  Object.assign(textGroup.style, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    flex: "1 1 auto",
    // 不给 0 的话，长选择器会把卡片撑过 maxWidth，而不是乖乖换行。
    minWidth: "0",
    // 让首行的光学中心落在 32px 图标块的中心：首行行盒约 19px，
    // (32 - 19) / 2 ≈ 6.5。带不带标题都成立，所以不必按有无标题分两套对齐。
    paddingTop: "6px",
  });

  // 标题是可选的。带动作的卡片要它（「已添加到 标准」+ 选择器两行）；
  // 纯通知不要 —— 语气已经由图标交代了，再压一行「已更新」就成了废话，
  // 更糟的是 success 那句「已更新」配「已撤销本次添加」自相矛盾。
  const hasTitle = title != null && String(title) !== "";
  if (hasTitle) {
    const titleEl = document.createElement("div");
    titleEl.textContent = String(title);
    Object.assign(titleEl.style, {
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "-0.01em",
      color: colors.text,
    });
    textGroup.appendChild(titleEl);
  }

  if (body != null && String(body) !== "") {
    const bodyEl = document.createElement("div");
    bodyEl.textContent = String(body);
    Object.assign(bodyEl.style, {
      fontSize: "12.5px",
      lineHeight: "1.5",
      // 正文是卡片上唯一的字时它就是主角，用正文色；上头还有标题时它退成副标题。
      color: hasTitle ? colors.textMuted : colors.text,
      wordBreak: "break-word",
    });
    if (monoBody) {
      // 选择器可能是一长串没有空格的 class，得允许在任意位置断。
      bodyEl.style.fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      bodyEl.style.wordBreak = "break-all";
    }
    textGroup.appendChild(bodyEl);
  }

  row.appendChild(iconTile);
  row.appendChild(textGroup);
  toast.appendChild(row);

  if (hasAction) {
    const divider = document.createElement("div");
    Object.assign(divider.style, {
      height: "1px",
      background: colors.divider,
      // 通到卡片两侧，别看着像浮在中间的一条短线。
      margin: "0 -16px",
    });

    const footer = document.createElement("div");
    Object.assign(footer.style, {
      display: "flex",
      alignItems: "center",
      // 提示贴左、按钮贴右，两端顶开。
      justifyContent: "space-between",
      gap: "12px",
    });

    const hint = document.createElement("div");
    hint.textContent = I18n.t("picker.hint.applied");
    Object.assign(hint.style, {
      fontSize: "11.5px",
      color: colors.textMuted,
    });

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    Object.assign(button.style, {
      border: `1px solid ${colors.accentDash}`,
      background: colors.primarySoft,
      color: colors.primary,
      borderRadius: "7px",
      padding: "5px 12px",
      fontSize: "12px",
      fontWeight: "600",
      // 表单控件默认不继承字体，不写这行按钮会掉回系统字体。
      fontFamily: "inherit",
      cursor: "pointer",
      transition: "background 0.15s ease",
    });
    button.addEventListener("mouseenter", () => {
      button.style.background = colors.accentSoft;
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = colors.primarySoft;
    });
    button.addEventListener("click", async () => {
      // 先把卡片收走，别让它僵在屏幕角上等异步结果。
      dismissSelectorPickerToast(toast);
      try {
        await onAction();
        showSelectorPickerToast(I18n.t("picker.toast.undone"), "success", target);
      } catch (error) {
        showSelectorPickerToast(
          I18n.t("picker.toast.undoFailed", { error: error.message }),
          "error",
          target,
        );
      }
    });

    footer.appendChild(hint);
    footer.appendChild(button);
    toast.appendChild(divider);
    toast.appendChild(footer);
  }

  // 有按钮的要能点；纯通知不该挡住底下的页面。
  toast.style.pointerEvents = hasAction ? "auto" : "none";

  document.documentElement.appendChild(toast);
  selectorPickerToastTimer = setTimeout(
    () => dismissSelectorPickerToast(toast),
    timeout,
  );
  return toast;
}

// 纯通知：只有一行正文，不要标题。
// 原先按 tone 顶一个标题上去（「页面拾取」/「已更新」/「操作失败」），
// 结果要么是同义反复（「页面拾取」压着「已取消页面拾取」），要么干脆打架
// （success 的「已更新」压着「已撤销本次添加」）。语气已经由图标交代了。
function showSelectorPickerToast(message, tone = "info", target) {
  createSelectorPickerToast({
    tone,
    target,
    body: message,
    // 出错的内容更值得看两眼，让它多留一会儿。
    timeout: tone === "error" ? 4200 : 2400,
  });
}

function showSelectorPickerActionToast({
  title,
  detail,
  actionLabel,
  onAction,
  target,
}) {
  createSelectorPickerToast({
    // 加号圆圈，不是 info 的斜杠 —— 这张卡说的是「加进去了」。
    tone: "added",
    target,
    title,
    body: detail,
    monoBody: true,
    actionLabel,
    onAction,
    // 比普通通知留得久，够用户伸手去点撤销。
    timeout: 6000,
  });
}

function escapeCssIdentifier(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function isUniqueSelector(selector, scope = document) {
  try {
    return scope.querySelectorAll(selector).length === 1;
  } catch (_) {
    return false;
  }
}

function isMeaningfulClassName(name) {
  return !!name && name.length >= 2 && name.length <= 40 && !/^\d+$/.test(name) && !name.startsWith("pure-read-");
}

function getNthOfTypeIndex(element) {
  let index = 1;
  let sibling = element;
  while ((sibling = sibling.previousElementSibling)) {
    if (sibling.tagName === element.tagName) index += 1;
  }
  return index;
}

function buildSelectorSegment(element, scope = document) {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  if (id) {
    const selector = `#${escapeCssIdentifier(id)}`;
    if (isUniqueSelector(selector, scope)) return selector;
  }

  const classes = Array.from(element.classList || [])
    .filter(isMeaningfulClassName)
    .slice(0, 2);

  let selector = tag;
  if (classes.length) {
    selector += `.${classes.map(escapeCssIdentifier).join(".")}`;
    if (isUniqueSelector(selector, scope)) return selector;
  }

  return `${selector}:nth-of-type(${getNthOfTypeIndex(element)})`;
}

// scope 可以是 document，也可以是某个 shadow root。嵌套 shadow 里的宿主
// 只有在其所在的树里求值才可能唯一，不能一律拿 document 去查。
function buildSelectorPath(element, scope) {
  if (!(element instanceof Element)) return "";

  const root =
    scope ||
    (element.getRootNode().nodeType === 9 ? document : element.getRootNode());
  const id = element.getAttribute("id");
  if (id) {
    const selector = `#${escapeCssIdentifier(id)}`;
    if (isUniqueSelector(selector, root)) return selector;
  }

  const segments = [];
  let current = element;
  let depth = 0;
  const stopAt = root.nodeType === 9 ? root.documentElement : null;

  while (current && depth < 5 && current !== stopAt) {
    segments.unshift(buildSelectorSegment(current, root));
    const selector = segments.join(" > ");
    if (isUniqueSelector(selector, root)) return selector;
    current = current.parentElement;
    depth += 1;
  }

  return segments.join(" > ");
}

function getElementLabel(element) {
  if (!(element instanceof Element)) return "";

  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  const classes = Array.from(element.classList || [])
    .filter(isMeaningfulClassName)
    .slice(0, 2);

  let label = tag;
  if (id) label += `#${id}`;
  if (classes.length) label += `.${classes.join(".")}`;
  return label;
}

// 事件在 shadow DOM 里会被 retarget 成宿主元素（event.target 是宿主），
// 但 composedPath() 仍能拿到开放 shadow root 内部的真实节点。
function getEventTargetElement(event) {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    // 不用 instanceof Element：content script 在 isolated world，
    // 事件路径里的节点可能是另一个 realm 的包装对象。
    if (node && node.nodeType === 1) return node;
  }
  return event.target && event.target.nodeType === 1 ? event.target : null;
}

// 从命中的节点向上找最近的 part。::part() 只能样式化带 part 属性的
// 那个元素本身，不能穿透到它的子节点，所以取最近的一层最稳。
function findNearestPart(element, root) {
  let current = element;
  while (current && current !== root.host) {
    const part = current.getAttribute?.("part");
    if (part && part.trim()) {
      return {
        element: current,
        name: part.trim().split(/\s+/)[0],
      };
    }
    current = current.parentElement;
  }
  return null;
}

function getPickerTarget(event) {
  let target = getEventTargetElement(event);
  if (!target) return null;
  if (target.closest('[id^="pure-read-selector-picker"]')) return null;

  const tag = target.tagName.toLowerCase();
  if (tag === "path" || tag === "use") {
    target = target.closest("svg") || target;
  }

  const root = target.getRootNode();
  // 11 = DOCUMENT_FRAGMENT_NODE；有 host 才是 ShadowRoot。
  // 同样避免跨 world 的 instanceof ShadowRoot 判断。
  if (root && root.nodeType === 11 && root.host) {
    const part = findNearestPart(target, root);
    if (!part) {
      // 开放 shadow root 但没暴露 part：页面 CSS 无法命中内部节点。
      // 返回宿主让高亮仍有反馈，但 selector 留空，点击时明确拒绝。
      return { element: root.host, selector: "", blocked: true };
    }

    // 宿主自己还套在另一层 shadow root 里。::part() 只能跨一层：
    // 除非外层组件用 exportparts 转发，否则顶层 CSS 生成的
    // host::part(name) 只会在文档树里找宿主，命不中里面的组件。
    // 这种情况不能假装成功，否则就是「能选中、点了没反应」。
    const outerRoot = root.host.getRootNode();
    if (outerRoot && outerRoot.nodeType === 11 && outerRoot.host) {
      // 外层也是 shadow root：生成 >>> 链，由运行时逐层解析。
      const chain = buildShadowChain(part.name, root);
      if (!chain) {
        return { element: part.element, selector: "", blocked: true };
      }
      return { element: part.element, selector: chain, blocked: false };
    }

    const hostSelector = buildSelectorPath(root.host);
    if (!hostSelector) {
      return { element: part.element, selector: "", blocked: true };
    }
    return {
      element: part.element,
      selector: `${hostSelector}::part(${part.name})`,
      blocked: false,
    };
  }

  return {
    element: target,
    selector: buildSelectorPath(target),
    blocked: false,
  };
}

function updatePickerTip(element, selector, blocked = false) {
  if (!selectorPickerState?.tip) return;

  const { tip, target } = selectorPickerState;
  // label 是宿主页的 class/id 名、finalSelector 由它拼出来 —— 恶意页面可控，
  // 而下面整块是 innerHTML 拼接。凡是插值的地方都先转义。
  const escape = I18n.escapeHtml;
  const label = escape(
    element ? getElementLabel(element) : I18n.t("picker.waitingElement"),
  );
  const finalSelector = escape(
    selector ||
      (blocked
        ? I18n.t("picker.tip.shadowBlocked")
        : I18n.t("picker.waitingSelector")),
  );
  const colors = pickerColors(target);
  // 被 shadow 边界挡住时，选择器卡片换成错误色，明确告诉用户
  // 「不是没生成选择器，而是页面 CSS 根本到不了里面」。
  const selectorBg = blocked ? colors.errorSoft : colors.primarySoft;
  const selectorBorder = blocked ? colors.error : colors.accentDash;
  const selectorFg = blocked ? colors.error : colors.primary;
  // 键帽样式抽出来复用：两处唯一的差别就是键名。
  // color 必须显式给 —— 不给就继承页脚那行的 textMuted，9px 下就已经很糊，
  // 暗色底上更是看不见（这正是要修的那个 bug）。
  const keycap = (name) =>
    `<kbd style="padding:1px 4px; background:${colors.surfaceAlt}; border:1px solid ${colors.border}; border-radius:3px; font-family:sans-serif; font-size:9px; color:${colors.text};">${name}</kbd>`;

  tip.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid ${colors.divider}; padding-bottom:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:12px; height:12px; background:${colors.primary}; border-radius:3px; display:flex; align-items:center; justify-content:center;">
            <div style="width:4px; height:4px; background:white; border-radius:999px;"></div>
          </div>
          <span style="font-size:11px; font-weight:800; color:${colors.primary}; text-transform:uppercase; letter-spacing:0.05em;">PR Picker</span>
        </div>
        <div style="font-size:10px; font-weight:600; color:${colors.textMuted}; background:${colors.surfaceAlt}; padding:2px 6px; border-radius:4px;">${escape(pickerTargetShortLabel(target))}</div>
      </div>

      <!-- Main Info -->
      <div style="display:grid; gap:10px;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-size:10px; font-weight:700; color:${colors.textMuted}; text-transform:uppercase; opacity:0.6;">${I18n.t("picker.tip.target")}</div>
          <div style="font-size:13px; font-weight:600; color:${colors.text}; font-family:inherit, monospace; word-break:break-word;">${label}</div>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; padding:10px; background:${selectorBg}; border-radius:8px; border:1px dashed ${selectorBorder};">
          <div style="font-size:10px; font-weight:700; color:${selectorFg}; text-transform:uppercase; opacity:0.8;">${I18n.t("picker.tip.selector")}</div>
          <div style="font-size:12px; line-height:1.4; color:${selectorFg}; font-weight:500; word-break:break-all;">${finalSelector}</div>
        </div>
      </div>

      <!-- Footer -->
      <div style="display:flex; align-items:center; gap:10px; font-size:10px; color:${colors.textMuted};">
        <div style="display:flex; align-items:center; gap:4px;">
          ${keycap("Click")} <span style="opacity:0.8;">${I18n.t("picker.tip.click")}</span>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          ${keycap("Esc")} <span style="opacity:0.8;">${I18n.t("picker.tip.esc")}</span>
        </div>
      </div>
    </div>
  `;
}

function updatePickerOverlay(pick) {
  if (!selectorPickerState) return;

  selectorPickerState.hoveredPick = pick || null;
  selectorPickerState.hoveredElement = pick?.element || null;
  selectorPickerState.hoveredSelector = pick?.selector || "";
  selectorPickerState.hoveredBlocked = Boolean(pick?.blocked);

  const { box, tip } = selectorPickerState;
  if (!pick || !pick.element) {
    box.style.opacity = "0";
    updatePickerTip(null, "", false);
    return;
  }

  const element = pick.element;
  const rect = element.getBoundingClientRect();
  box.style.opacity = rect.width > 0 && rect.height > 0 ? "1" : "0";
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;

  updatePickerTip(element, pick.selector, pick.blocked);

  const tipWidth = Math.min(360, Math.max(260, tip.offsetWidth || 320));
  const tipHeight = tip.offsetHeight || 110;
  const preferredTop = rect.top - 12;
  const nextTop =
    preferredTop > tipHeight + 24 ? preferredTop : Math.min(window.innerHeight - tipHeight - 12, rect.bottom + 12);
  const nextLeft = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - tipWidth - 12));

  tip.style.left = `${nextLeft}px`;
  tip.style.top = `${nextTop}px`;
  tip.style.transform = preferredTop > tipHeight + 24 ? "translateY(-100%)" : "none";
  tip.style.maxWidth = `${tipWidth}px`;
}

function teardownSelectorPicker({ silent = false } = {}) {
  if (!selectorPickerState) return;

  // 先留一份类型色：下面 selectorPickerState 就置 null 了，
  // 而取消 toast 是这之后才弹的，现取会掉回默认蓝。
  const target = selectorPickerState.target;

  document.removeEventListener("mousemove", selectorPickerState.onMouseMove, true);
  window.removeEventListener("click", selectorPickerState.onClick, true);
  document.removeEventListener("keydown", selectorPickerState.onKeyDown, true);
  window.removeEventListener("scroll", selectorPickerState.onScroll, true);
  for (const [type, handler] of selectorPickerState.pointerGuards || []) {
    window.removeEventListener(type, handler, true);
  }
  if (selectorPickerState.schemeQuery && selectorPickerState.onSchemeChange) {
    selectorPickerState.schemeQuery.removeEventListener(
      "change",
      selectorPickerState.onSchemeChange,
    );
  }

  selectorPickerState.root.remove();
  selectorPickerState = null;

  if (!silent) {
    showSelectorPickerToast(I18n.t("picker.toast.cancelled"), "info", target);
  }
}

async function savePickedSelector(target, selector) {
  const result = await getSyncStorage(["settings"]);
  const settings = result.settings && typeof result.settings === "object" ? result.settings : createDefaultSettings();

  if (!settings.global || typeof settings.global !== "object") {
    settings.global = createDefaultSettings().global;
  }

  const selectors = ensurePickerSelectorConfig(settings.global.selectors);
  const previousSelectors = JSON.parse(JSON.stringify(selectors));
  if (target === "exclude") {
    selectors.exclude = appendSelectorLine(selectors.exclude, selector);
  } else {
    selectors.include[target] = appendSelectorLine(selectors.include[target], selector);
  }

  settings.global.selectors = selectors;
  await setSyncStorage({ settings });
  updateContentStyles(settings);

  return {
    previousSelectors,
    target,
    selector,
  };
}

async function restorePickedSelector(previousSelectors) {
  const result = await getSyncStorage(["settings"]);
  const settings = result.settings && typeof result.settings === "object" ? result.settings : createDefaultSettings();

  if (!settings.global || typeof settings.global !== "object") {
    settings.global = createDefaultSettings().global;
  }

  settings.global.selectors = ensurePickerSelectorConfig(previousSelectors);
  await setSyncStorage({ settings });
  updateContentStyles(settings);
}

function startSelectorPicker(target = "standard") {
  const normalizedTarget = PICKER_TARGETS.includes(target) ? target : "standard";
  ensureSelectorPickerUiStyle();
  teardownSelectorPicker({ silent: true });
  removeSelectorPickerToast();

  const root = document.createElement("div");
  root.id = "pure-read-selector-picker-root";
  root.innerHTML = `
    <div id="pure-read-selector-picker-box"></div>
    <div id="pure-read-selector-picker-tip"></div>
  `;

  const box = root.querySelector("#pure-read-selector-picker-box");
  const tip = root.querySelector("#pure-read-selector-picker-tip");

  // 布局与颜色分开：这里只摆位置，颜色统一由下面的 applyPickerColors 上，
  // 免得改主题时漏掉某个属性、留下半套旧配色。
  Object.assign(box.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "0",
    height: "0",
    border: "2px solid transparent",
    borderRadius: "10px",
    pointerEvents: "none",
    zIndex: "2147483646",
    opacity: "0",
    transition: "all 120ms cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: "transform, width, height, opacity",
    animation: "prPickerGlow 2.4s ease-in-out infinite",
  });

  Object.assign(tip.style, {
    position: "fixed",
    top: "18px",
    left: "18px",
    transform: "none",
    zIndex: "2147483647",
    padding: "14px",
    borderRadius: "8px",
    fontFamily: PICKER_FLOAT_FONT,
    fontSize: "13px",
    lineHeight: "1.5",
    border: "1px solid transparent",
    backdropFilter: PICKER_BACKDROP,
    WebkitBackdropFilter: PICKER_BACKDROP,
    pointerEvents: "none",
    textAlign: "left",
    maxWidth: "360px",
    minWidth: "260px",
    animation: "prPickerTipIn 200ms cubic-bezier(0, 0, 0.2, 1)",
    transformOrigin: "top left",
  });

  // 把当前「类型 + 系统明暗」落到选取框与浮窗上。首次和主题变化时都走这里，
  // 所以只会有一套配色在生效，不会出现浮窗换了色、框还是旧色的混搭帧。
  const applyPickerColors = () => {
    const colors = pickerColors(normalizedTarget);

    // @keyframes 里的颜色经这 5 个变量传进去。变量在动画元素自身上解析，
    // 所以动的是它们，样式表本身不用重建。
    box.style.setProperty("--pr-ring", colors.ring);
    box.style.setProperty("--pr-glow", colors.glow);
    box.style.setProperty("--pr-glow-strong", colors.glowStrong);
    box.style.setProperty("--pr-halo", colors.primarySoft);
    box.style.setProperty("--pr-inset", colors.inset);

    box.style.borderColor = colors.primary;
    box.style.background = `linear-gradient(180deg, ${colors.primarySoft}, ${hexToRgba(colors.primary, 0)})`;
    // 动画运行期间这行被 prPickerGlow 盖住，是动画缺席时的兜底 —— 所以照抄它 0% 那一帧。
    box.style.boxShadow = `0 0 0 1px ${colors.ring}, 0 22px 44px -28px ${colors.glowStrong}, inset 0 1px 0 ${colors.inset}`;

    tip.style.color = colors.text;
    tip.style.background = colors.surface;
    tip.style.borderColor = colors.border;
    tip.style.boxShadow = `0 10px 15px -3px ${colors.shadowStrong}, 0 4px 6px -2px ${colors.shadowSoft}`;
  };

  applyPickerColors();

  document.documentElement.appendChild(root);

  const onMouseMove = (event) => {
    updatePickerOverlay(getPickerTarget(event));
  };

  const onScroll = () => {
    updatePickerOverlay(selectorPickerState?.hoveredPick || null);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      teardownSelectorPicker();
    }
  };

  const onClick = async (event) => {
    const pick = getPickerTarget(event);
    if (!pick) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (pick.blocked) {
      showSelectorPickerToast(
        I18n.t("picker.toast.noPart"),
        "error",
        normalizedTarget,
      );
      return;
    }

    if (!pick.selector) {
      showSelectorPickerToast(
        I18n.t("picker.toast.noSelector"),
        "error",
        normalizedTarget,
      );
      return;
    }

    const selector = pick.selector;

    try {
      const change = await savePickedSelector(normalizedTarget, selector);
      teardownSelectorPicker({ silent: true });
      showSelectorPickerActionToast({
        // 这条进的是 textContent（showSelectorPickerActionToast 的 titleEl），
        // 所以用不转义的 t()；转义会在文字里留下 &amp; 之类的实体。
        title: I18n.t("picker.toast.added", {
          target: pickerTargetLabel(normalizedTarget),
        }),
        detail: selector,
        actionLabel: I18n.t("picker.action.undo"),
        onAction: () => restorePickedSelector(change.previousSelectors),
        // 上面 teardown 已经把 state 清空了，类型色只能显式带过去。
        target: normalizedTarget,
      });
    } catch (error) {
      teardownSelectorPicker({ silent: true });
      // 正文现在走 textContent，所以要 t() 而不是 tHtml() ——
      // 转义过的串在 textContent 里会把 &lt; 原样显示成文本。
      showSelectorPickerToast(
        I18n.t("picker.toast.saveFailed", { error: error.message }),
        "error",
        normalizedTarget,
      );
    }
  };

  // 拾取模式下只拦 click 已经太晚：很多页面的菜单、拖拽、输入框聚焦、
  // 按钮动作都挂在 pointerdown / mousedown / pointerup 上。这里在 window
  // 捕获阶段把一整串按下/抬起事件也截住，避免点击拾取时触发页面交互。
  //
  // 注意 pointerdown 不 preventDefault：取消它可能连带取消后续的 click，
  // 拾取器就收不到选择事件了；只阻止传播即可。mousedown 才 preventDefault，
  // 用来压掉聚焦、文本选择和原生拖拽。
  const stopPagePointer = (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const preventPagePointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const pointerGuards = [
    ["pointerdown", stopPagePointer],
    ["pointerup", stopPagePointer],
    ["mouseup", stopPagePointer],
    ["mousedown", preventPagePointer],
    ["auxclick", preventPagePointer],
    ["dragstart", preventPagePointer],
  ];
  for (const [type, handler] of pointerGuards) {
    window.addEventListener(type, handler, true);
  }

  // 拾取器存活期间用户切了系统外观：重上一遍色，再重画浮窗。
  // 两件事必须一起做 —— 只重画浮窗的话选取框会停在旧主题，出现一帧混搭。
  const schemeQuery = pickerSchemeQuery();
  const onSchemeChange = () => {
    applyPickerColors();
    updatePickerOverlay(selectorPickerState?.hoveredPick || null);
  };

  selectorPickerState = {
    root,
    box,
    tip,
    target: normalizedTarget,
    hoveredElement: null,
    hoveredPick: null,
    hoveredSelector: "",
    hoveredBlocked: false,
    pointerGuards,
    onMouseMove,
    onClick,
    onKeyDown,
    onScroll,
    schemeQuery,
    onSchemeChange,
  };

  document.addEventListener("mousemove", onMouseMove, true);
  // window 捕获阶段比 document 更早，能赶在页面的 document 级 click 前面。
  window.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
  if (schemeQuery) {
    schemeQuery.addEventListener("change", onSchemeChange);
  }
}
