// 初始加载
chrome.storage.sync.get(["settings"], (result) => {
  if (result.settings) {
    window.prSettings = result.settings;
    updateContentStyles(result.settings);
    updateFeatures(result.settings);
  }
});

// 监听来自 Popup / Background 的消息（统一入口）
chrome.runtime.onMessage.addListener((request) => {
  if (!request.settings) return;
  window.prSettings = request.settings;
  if (request.action === "updateStyles") {
    updateContentStyles(request.settings);
  } else if (request.action === "updateFeatures") {
    updateFeatures(request.settings);
  }
});

// 内存中的设置快照，用于对比减少重绘
let currentSettingsStr = "";

// 监听存储变化（其他页面/tab 的配置更新会触发这里）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.settings) {
    const newSettings = changes.settings.newValue;
    const newSettingsStr = JSON.stringify(newSettings);

    // 如果设置内容没变（比如只是其它无关状态更新），则不执行重绘
    if (newSettingsStr === currentSettingsStr) return;
    currentSettingsStr = newSettingsStr;

    if (newSettings) {
      window.prSettings = newSettings;
      updateContentStyles(newSettings);
      updateFeatures(newSettings);
    }
  }
});

function updateContentStyles(settings) {
  const domain = window.location.hostname;
  const global = settings.global || {};
  const sites = settings.sites || {};
  const site = sites[domain];

  // 获取最终生效的开关状态：若站点有明确设置则用站点的，否则用全局的
  const isEnabled = site && typeof site.on === "boolean" ? site.on : global.on;

  if (!isEnabled) {
    return removeStyles();
  }

  const isCustom = site?.mode === "custom";
  const mapping = (isCustom ? site.mapping : global.mapping) || {
    standard: "",
    mono: "",
    math: "",
  };
  const typo = (isCustom ? site.typo : global.typo) || {
    enabled: true,
    lineHeight: "1.6",
    fontSize: "100",
    fontWeight: "0",
  };

  const selectors = global.selectors || { standard: "", mono: "", math: "" };
  applyStyles(mapping, typo, selectors);
}

function removeStyles() {
  document.getElementById("pure-read-injector")?.remove();
}

function applyStyles(mapping, typo, selectors) {
  const font = (name, fallback) =>
    name ? `font-family: "${name}", ${fallback} !important;` : "";
  const scale = typo.fontSize / 100;
  const typoOn = typo.enabled !== false;
  const buildNotChain = (targets, excludeDescendants = false) =>
    targets
      .flatMap((target) =>
        excludeDescendants
          ? [`:not(${target})`, `:not(${target} *)`]
          : [`:not(${target})`]
      )
      .join("");

  const getExtra = (key) => {
    const raw =
      typeof selectors === "string"
        ? key === "standard"
          ? selectors
          : ""
        : selectors[key];
    if (!raw) return "";
    return (
      ", " +
      raw
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s)
        .join(", ")
    );
  };

  // 排除规则
  const iconTargets = [
    "i",
    '[role="img"]',
  ];
  const iconContainers = [
    ".fa",
    ".fas",
    ".far",
    ".fab",
    ".fal",
    ".fad",
    ".fat",
    ".glyphicon",
    ".iconfont",
    '[class*="icon"]',
    '[class*="Icon"]',
    '[class*="symbol"]',
    '[class*="Symbol"]',
    ".google-symbols",
    '[class*="material-icon"]',
    '[class*="material-symbol"]',
    '[class*="codicon"]',
    '[class*="lucide"]',
    "[data-icon]",
  ];
  const exclude = {
    icon:
      buildNotChain(iconTargets) + buildNotChain(iconContainers, true),
    code: ':not(pre):not(pre *):not(code):not(code *):not(kbd):not(samp):not([class*="pl-"]):not([class*="blob-code"]):not([class*="highlight"])',
    media:
      ":not(video):not(iframe):not(canvas):not(svg):not(svg *):not(img):not(audio)",
    player:
      ':not([class*="player"]):not([class*="Player"]):not([class*="video"]):not([class*="Video"])',
  };

  const css = `
    :root {
      --pr-lh: ${typo.lineHeight};
      --pr-fs: ${scale};
    }

    /* 标准字体 */
    body *${exclude.code}${exclude.media}${exclude.player}${exclude.icon}:not(math):not(.katex)${getExtra("standard")} {
      ${font(mapping.standard, "sans-serif")}
    }

    ${
      typoOn
        ? `
    /* 行高 */
    p${exclude.icon}, span${exclude.icon}, div${exclude.player}${exclude.icon}:not([class*="danmaku"]):not([class*="bpx"]),
    li${exclude.icon}, td${exclude.icon}, th${exclude.icon}, label${exclude.icon}, a${exclude.icon},
    h1${exclude.icon}, h2${exclude.icon}, h3${exclude.icon}, h4${exclude.icon}, h5${exclude.icon}, h6${exclude.icon},
    article${exclude.icon}, section${exclude.icon}, aside${exclude.icon}, main${exclude.icon}, blockquote${exclude.icon}, figcaption${exclude.icon} {
      line-height: var(--pr-lh) !important;
    }

    /* 字号缩放 */
    ${
      scale !== 1
        ? `
    p${exclude.icon}, span${exclude.player}${exclude.icon}:not([class*="time"]):not([class*="duration"]),
    li${exclude.icon}, td${exclude.icon}, th${exclude.icon}, article${exclude.icon}, blockquote${exclude.icon}, figcaption${exclude.icon} {
      font-size: calc(1em * var(--pr-fs)) !important;
    }`
        : ""
    }

    /* 字重补偿 - 支持正负值 */
    ${
      typo.fontWeight != "0"
        ? parseInt(typo.fontWeight) > 0
          ? `
    /* 正值：使用 text-stroke 加粗 */
    body *${exclude.icon}${exclude.media} {
      -webkit-text-stroke-width: ${typo.fontWeight / 500}px;
    }`
          : `
    /* 负值：使用 font-weight 减细 + letter-spacing 视觉优化 */
    body *${exclude.icon}${exclude.media}:not(h1):not(h2):not(h3) {
      font-weight: lighter !important;
      letter-spacing: ${Math.abs(parseInt(typo.fontWeight)) / 400}px;
    }`
        : ""
    }
    `
        : ""
    }

    /* 代码块 */
    body pre, body code, body kbd, body samp,
    body pre *, body code *, body kbd *, body samp *,
    body .blob-code, body .blob-code *, body .text-mono, body .mono,
    [class*="pl-"], .blob-code-inner, .blob-code-inner *,
    div.highlight pre, div.highlight pre *,
    pre[class*="language"], pre[class*="language"] *,
    code[class*="language"], code[class*="language"] *${getExtra("mono")} {
      ${font(mapping.mono, "monospace")}
      line-height: 1.4 !important;
    }

    /* 数学公式 */
    body math, body math *, body .mjx-chtml, body .mjx-chtml *,
    body .katex, body .katex *${getExtra("math")} {
      ${font(mapping.math, "serif")}
    }
  `;

  let style = document.getElementById("pure-read-injector");
  if (!style) {
    style = document.createElement("style");
    style.id = "pure-read-injector";
    document.documentElement.appendChild(style);
  }
  style.textContent = css;
}

// ═══════════════════════════════════════════════════════════
// 阅读进度条 (Reading Progress Bar)
// ═══════════════════════════════════════════════════════════

let progressBarEnabled = false;
let progressBarColor = "#10b981";

function createProgressBar() {
  if (document.getElementById("pure-read-progress")) return;

  const bar = document.createElement("div");
  bar.id = "pure-read-progress";
  bar.innerHTML = `
    <style>
      #pure-read-progress {
        position: fixed;
        top: 0;
        left: 0;
        width: 0%;
        height: 3px;
        background: var(--pr-progress-color, #10b981);
        z-index: 2147483647;
        transition: width 0.1s ease-out;
        pointer-events: none;
        box-shadow: 0 0 8px var(--pr-progress-color, #10b981);
      }
    </style>
  `;
  document.documentElement.appendChild(bar);
}

function removeProgressBar() {
  document.getElementById("pure-read-progress")?.remove();
}

function updateProgressBar() {
  const bar = document.getElementById("pure-read-progress");
  if (!bar) return;

  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  bar.style.width = `${Math.min(100, progress)}%`;
}

function setProgressBarColor(color) {
  document.documentElement.style.setProperty("--pr-progress-color", color);
}

// 节流函数，限制滚动事件的触发频率
function throttle(fn, wait) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

const throttledUpdateProgress = throttle(updateProgressBar, 16); // ~60fps

function enableProgressBar(color) {
  progressBarColor = color || "#10b981";
  progressBarEnabled = true;
  createProgressBar();
  setProgressBarColor(progressBarColor);
  updateProgressBar();
  window.addEventListener("scroll", throttledUpdateProgress, { passive: true });
  window.addEventListener("resize", throttledUpdateProgress, { passive: true });
}

function disableProgressBar() {
  progressBarEnabled = false;
  removeProgressBar();
  window.removeEventListener("scroll", throttledUpdateProgress);
  window.removeEventListener("resize", throttledUpdateProgress);
}

// ═══════════════════════════════════════════════════════════
// 专注模式 (Focus Mode)
// ═══════════════════════════════════════════════════════════

let focusModeEnabled = false;

function enableFocusMode(opacity = 0.08) {
  if (document.getElementById("pure-read-focus-style")) return;

  const style = document.createElement("style");
  style.id = "pure-read-focus-style";
  style.textContent = `
    /* ═══ 专注模式 ═══ */
    
    /* 第一步：淡化所有干扰元素 */
    aside,
    [class*="sidebar"],
    [class*="Sidebar"],
    [id*="sidebar"],
    [id*="Sidebar"],
    [class*="aside"]:not(article):not(main),
    [class*="Aside"]:not(article):not(main),
    [class*="ad-"],
    [class*="Ad-"],
    [class*="advertisement"],
    [class*="banner"]:not([class*="article-banner"]),
    [class*="Banner"]:not([class*="article"]),
    [class*="promo"],
    [class*="Promo"],
    [class*="recommend"],
    [class*="Recommend"],
    [class*="related"],
    [class*="Related"],
    [class*="social"]:not([class*="social-share"]),
    [class*="Social"],
    [class*="widget"],
    [class*="Widget"],
    body > footer,
    body > header:not(:has(article)):not(:has(main)),
    body > [class*="footer"],
    body > [id*="footer"] {
      opacity: ${opacity} !important;
      pointer-events: none !important;
      transition: opacity 0.3s ease !important;
    }

    /* 第二步：确保正文容器完全不受影响 */
    article,
    main,
    [class*="article-"],
    [class*="Article-"],
    [class*="post-content"],
    [class*="post_content"],
    [class*="postContent"],
    [class*="entry-content"],
    [class*="content-body"],
    [class*="blog-content"],
    [class*="markdown"],
    [class*="Markdown"],
    [class*="prose"],
    [class*="richtext"],
    [role="main"],
    [itemprop="articleBody"],
    pre,
    code,
    .highlight,
    .code-block {
      opacity: 1 !important;
      pointer-events: auto !important;
    }

    /* 第三步：正文容器内的元素恢复原有样式（不强制设置 opacity） */
    article *,
    main *,
    [class*="article-"] *,
    [class*="post-content"] *,
    [class*="entry-content"] *,
    [class*="markdown"] *,
    [class*="prose"] *,
    [role="main"] *,
    [itemprop="articleBody"] * {
      pointer-events: auto !important;
    }

    /* 悬停恢复干扰元素 */
    aside:hover,
    [class*="sidebar"]:hover,
    [class*="Sidebar"]:hover,
    [id*="sidebar"]:hover,
    [id*="Sidebar"]:hover,
    [class*="aside"]:not(article):not(main):hover,
    [class*="Aside"]:not(article):not(main):hover,
    [class*="ad-"]:hover,
    [class*="Ad-"]:hover,
    [class*="advertisement"]:hover,
    [class*="banner"]:not([class*="article-banner"]):hover,
    [class*="Banner"]:not([class*="article"]):hover,
    [class*="promo"]:hover,
    [class*="Promo"]:hover,
    [class*="recommend"]:hover,
    [class*="Recommend"]:hover,
    [class*="related"]:hover,
    [class*="Related"]:hover,
    [class*="social"]:not([class*="social-share"]):hover,
    [class*="Social"]:hover,
    [class*="widget"]:hover,
    [class*="Widget"]:hover,
    body > footer:hover,
    body > header:not(:has(article)):not(:has(main)):hover,
    body > [class*="footer"]:hover,
    body > [id*="footer"]:hover {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;
  document.documentElement.appendChild(style);
  focusModeEnabled = true;
}

function disableFocusMode() {
  document.getElementById("pure-read-focus-style")?.remove();
  focusModeEnabled = false;
}

// ═══════════════════════════════════════════════════════════
// 功能状态更新
// ═══════════════════════════════════════════════════════════

function updateFeatures(settings) {
  const features = settings.global?.features || {};
  const domain = window.location.hostname;
  const siteConfig = settings.sites?.[domain] || {};

  // 阅读进度条（状态守卫，避免重复绑定）
  const progressBar = features.progressBar || {};
  if (progressBar.enabled) {
    if (!progressBarEnabled || progressBarColor !== progressBar.color) {
      enableProgressBar(progressBar.color);
    }
  } else if (progressBarEnabled) {
    disableProgressBar();
  }

  // 专注模式（站点级配置）
  const siteFocusMode = siteConfig.focusMode ?? false;
  if (siteFocusMode) {
    if (!focusModeEnabled) enableFocusMode(0.08);
  } else if (focusModeEnabled) {
    disableFocusMode();
  }

  // 智能暗色模式
  const forceDark = features.forceDark ?? false;
  if (forceDark) {
    if (!isDarkModeApplied()) enableDarkMode();
  } else if (isDarkModeApplied()) {
    disableDarkMode();
  }

  // 阅读时间估算
  const showReadTime = features.readingTime ?? false;
  if (showReadTime) {
    showReadingTime();
  } else {
    hideReadingTime();
  }
}


// ═══════════════════════════════════════════════════════════
// 智能暗色模式 (Smart Dark Mode)
// 策略：多维度检测网站原生暗色支持，优先触发原生暗色，不支持时才 fallback
// 检测优先级：
//   1. HTML/body 上已有的主题属性（data-theme 等）
//   2. CSS 中的 class-based 暗色模式（.dark, .dark-mode 等）
//   3. CSS 中的 attribute-based 暗色模式（[data-theme="dark"] 等）
//   4. @media (prefers-color-scheme: dark) 媒体查询
//   5. CSS filter 反转（兜底方案）
// ═══════════════════════════════════════════════════════════

let _prDarkState = null;

function isDarkPage() {
  if (!document.body) return false;

  const isDark = (color) => {
    if (!color || color === "rgba(0, 0, 0, 0)" || color === "transparent")
      return false;
    const rgb = color.match(/\d+/g);
    if (!rgb) return false;
    const brightness =
      (parseInt(rgb[0]) * 299 +
        parseInt(rgb[1]) * 587 +
        parseInt(rgb[2]) * 114) /
      1000;
    return brightness < 128;
  };

  const bgColor = getComputedStyle(document.body).backgroundColor;
  const htmlColor = getComputedStyle(document.documentElement).backgroundColor;
  return isDark(bgColor) || isDark(htmlColor);
}

// ─── 样式表遍历工具 ───

function forEachStyleRule(callback) {
  function walk(rules) {
    for (const rule of rules) {
      if (rule.type === 1) callback(rule);
      else if (rule.cssRules) walk(rule.cssRules);
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      if (!sheet.cssRules) continue;
      walk(sheet.cssRules);
    } catch (_) {}
  }
}

function countRulesMatching(regex) {
  let count = 0;
  forEachStyleRule((rule) => {
    if (regex.test(rule.selectorText || "")) count++;
  });
  return count;
}

function collectMediaDarkRules() {
  const darkCssTexts = [];

  function processRules(rules) {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) {
        const condText = rule.conditionText || rule.media.mediaText || "";
        if (
          condText.includes("prefers-color-scheme") &&
          condText.includes("dark")
        ) {
          for (const innerRule of rule.cssRules) {
            darkCssTexts.push(innerRule.cssText);
          }
        } else {
          processRules(rule.cssRules);
        }
      } else if (rule.cssRules) {
        processRules(rule.cssRules);
      }
    }
  }

  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules || sheet.rules;
      if (!rules) continue;
      processRules(rules);
    } catch (_) {}
  }

  return darkCssTexts;
}

// ─── 多策略检测 ───

const THEME_ATTRS = [
  "data-theme",
  "data-color-scheme",
  "data-color-mode",
  "data-bs-theme",
  "data-mode",
  "data-appearance",
  "data-dark",
  "data-scheme",
];

const DARK_CLASSES = [
  "dark",
  "dark-mode",
  "dark-theme",
  "theme-dark",
  "night-mode",
  "night",
  "darkmode",
  "nightmode",
];

function detectNativeDarkMode() {
  const el = document.documentElement;
  const body = document.body;

  // ── Strategy 1: HTML/body 上已存在主题属性（最强信号） ──
  // 如果页面已经使用 data-theme="light" 之类的属性，说明站点有主题切换机制
  for (const attr of THEME_ATTRS) {
    for (const target of [el, body]) {
      if (!target) continue;
      const val = target.getAttribute(attr);
      if (val === null || val === "dark") continue;
      const regex = new RegExp(
        `\\[${attr}[~|^$*]?=["']?dark(?:["']\\]|\\])`
      );
      if (countRulesMatching(regex) >= 2) {
        return {
          method: "attr",
          key: attr,
          value: "dark",
          target,
          originalValue: val,
        };
      }
    }
  }

  // ── Strategy 2: CSS class-based 暗色模式 ──
  // 扫描样式表中 .dark / .dark-mode / .dark-theme 等选择器
  let bestClass = null,
    bestCount = 0;
  for (const cls of DARK_CLASSES) {
    const escaped = cls.replace(/-/g, "\\-");
    const regex = new RegExp(`\\.${escaped}(?![a-zA-Z0-9_-])`);
    const count = countRulesMatching(regex);
    if (count > bestCount) {
      bestCount = count;
      bestClass = cls;
    }
  }
  if (bestClass && bestCount >= 3) {
    return { method: "class", key: bestClass, ruleCount: bestCount };
  }

  // ── Strategy 3: CSS attribute-based 暗色模式（属性尚未出现在 DOM 上） ──
  for (const attr of THEME_ATTRS) {
    if (el.hasAttribute(attr) || body?.hasAttribute(attr)) continue;
    const regex = new RegExp(`\\[${attr}[~|^$*]?=["']?dark(?:["']\\]|\\])`);
    const count = countRulesMatching(regex);
    if (count >= 3) {
      return {
        method: "attr",
        key: attr,
        value: "dark",
        target: el,
        originalValue: null,
      };
    }
  }

  // ── Strategy 4: @media (prefers-color-scheme: dark) ──
  const mediaRules = collectMediaDarkRules();
  if (mediaRules.length >= 2) {
    return { method: "media", cssTexts: mediaRules };
  }

  return null;
}

// ─── 暗色模式启用 / 关闭 ───

function enableDarkMode() {
  if (isDarkModeApplied()) return;

  if (isDarkPage()) return;

  const detection = detectNativeDarkMode();

  if (detection) {
    switch (detection.method) {
      case "attr":
        _prDarkState = {
          method: "attr",
          key: detection.key,
          target: detection.target,
          originalValue: detection.originalValue,
        };
        detection.target.setAttribute(detection.key, detection.value);
        break;

      case "class":
        _prDarkState = { method: "class", key: detection.key };
        document.documentElement.classList.add(detection.key);
        break;

      case "media": {
        _prDarkState = { method: "media" };
        const style = document.createElement("style");
        style.id = "pure-read-dark-native";
        style.textContent = detection.cssTexts.join("\n");
        document.documentElement.appendChild(style);
        document.documentElement.style.colorScheme = "dark";
        break;
      }
    }
  } else {
    _prDarkState = { method: "filter" };
    const style = document.createElement("style");
    style.id = "pure-read-dark-mode";
    style.textContent = `
      html {
        filter: invert(1) hue-rotate(180deg) !important;
      }
      * {
        box-shadow: none !important;
        text-shadow: none !important;
      }

      img,
      video,
      iframe,
      canvas,
      object,
      embed,
      picture,
      picture > source,
      figure > img,
      svg image,
      input[type="image"],
      [role="img"] {
        filter: invert(1) hue-rotate(180deg) !important;
      }

      [style*="background-image"]:not([style*="gradient"]),
      [class*="hero"], [class*="banner"], [class*="cover"],
      [class*="thumb"], [class*="Thumb"],
      [class*="avatar"], [class*="Avatar"],
      [class*="logo"], [class*="Logo"],
      [class*="icon"], [class*="Icon"],
      [class*="photo"], [class*="Photo"],
      [class*="image"], [class*="Image"],
      [class*="poster"], [class*="Poster"],
      [class*="carousel"], [class*="gallery"],
      [class*="media"] > img,
      [class*="figure"] > img {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `;
    document.documentElement.appendChild(style);
  }
}

function disableDarkMode() {
  if (!_prDarkState) {
    document.getElementById("pure-read-dark-mode")?.remove();
    document.getElementById("pure-read-dark-native")?.remove();
    document.documentElement.style.colorScheme = "";
    return;
  }

  switch (_prDarkState.method) {
    case "attr":
      if (_prDarkState.originalValue !== null) {
        _prDarkState.target.setAttribute(
          _prDarkState.key,
          _prDarkState.originalValue
        );
      } else {
        _prDarkState.target.removeAttribute(_prDarkState.key);
      }
      break;

    case "class":
      document.documentElement.classList.remove(_prDarkState.key);
      break;

    case "media":
      document.getElementById("pure-read-dark-native")?.remove();
      document.documentElement.style.colorScheme = "";
      break;

    case "filter":
      document.getElementById("pure-read-dark-mode")?.remove();
      break;
  }

  _prDarkState = null;
}

function isDarkModeApplied() {
  return (
    _prDarkState !== null ||
    !!document.getElementById("pure-read-dark-mode") ||
    !!document.getElementById("pure-read-dark-native")
  );
}

// ═══════════════════════════════════════════════════════════
// 阅读时间估算 (Reading Time Estimation)
// ═══════════════════════════════════════════════════════════

function calculateReadingTime() {
  // 获取正文文本
  const article =
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.querySelector("[class*='content']") ||
    document.querySelector("[class*='post']") ||
    document.body;

  if (!article) return null;

  const text = article.innerText || "";

  // 统计字数
  // 中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 英文单词数
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;

  // 阅读速度：中文 400字/分钟，英文 200词/分钟
  const chineseMinutes = chineseChars / 400;
  const englishMinutes = englishWords / 200;

  const totalMinutes = Math.ceil(chineseMinutes + englishMinutes);

  return {
    minutes: totalMinutes,
    chineseChars,
    englishWords,
    totalChars: text.length,
  };
}

let readingTimeMonitor = null;

function startReadingTimeMonitor() {
  if (readingTimeMonitor) return;
  let lastUrl = location.href;
  readingTimeMonitor = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById("pure-read-reading-time")?.remove();
      setTimeout(showReadingTime, 1000);
    }
  }, 1000); // 降低频率至 1s，减少 CPU 占用
}

let readingTimeTimeout = null;

function showReadingTime() {
  const showReadTime = window.prSettings?.global?.features?.readingTime ?? true;
  if (!showReadTime && readingTimeMonitor) {
    hideReadingTime();
    return;
  }

  startReadingTimeMonitor();
  if (document.getElementById("pure-read-reading-time")) return;

  // 等待 DOM 加载完成
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showReadingTime);
    return;
  }

  const stats = calculateReadingTime();
  if (!stats || stats.minutes < 1) return;

  const badge = document.createElement("div");
  badge.id = "pure-read-reading-time";
  badge.innerHTML = `
    <style>
      #pure-read-reading-time {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.75);
        color: #fff;
        padding: 10px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        z-index: 2147483646;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: prReadTimeIn 0.3s ease;
      }
      @keyframes prReadTimeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      #pure-read-reading-time svg {
        width: 16px;
        height: 16px;
        opacity: 0.8;
      }
      #pure-read-reading-time .time {
        font-weight: 600;
        color: #10b981;
      }
      #pure-read-reading-time .close {
        margin-left: 8px;
        cursor: pointer;
        opacity: 0.5;
        transition: opacity 0.2s;
      }
      #pure-read-reading-time .close:hover {
        opacity: 1;
      }
      @media (prefers-color-scheme: dark) {
        #pure-read-reading-time {
          background: rgba(255, 255, 255, 0.1);
        }
      }
    </style>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
    <span>预计阅读 <span class="time">${stats.minutes}</span> 分钟</span>
    <span class="close" title="关闭">✕</span>
  `;

  document.body.appendChild(badge);

  // 点击关闭
  badge.querySelector(".close").addEventListener("click", () => {
    badge.remove();
  });

  // 5秒后自动淡出
  if (readingTimeTimeout) clearTimeout(readingTimeTimeout);
  readingTimeTimeout = setTimeout(() => {
    if (badge.parentNode) {
      badge.style.opacity = "0.3";
      badge.style.transition = "opacity 0.5s";
      const onEnter = () => {
        badge.style.opacity = "1";
      };
      const onLeave = () => {
        badge.style.opacity = "0.3";
      };
      badge.addEventListener("mouseenter", onEnter);
      badge.addEventListener("mouseleave", onLeave);
      // 存储清理引用
      badge._onEnter = onEnter;
      badge._onLeave = onLeave;
    }
  }, 5000);
}

function hideReadingTime() {
  const badge = document.getElementById("pure-read-reading-time");
  if (badge) {
    if (badge._onEnter) {
      badge.removeEventListener("mouseenter", badge._onEnter);
      badge.removeEventListener("mouseleave", badge._onLeave);
    }
    badge.remove();
  }

  if (readingTimeMonitor) {
    clearInterval(readingTimeMonitor);
    readingTimeMonitor = null;
  }
  if (readingTimeTimeout) {
    clearTimeout(readingTimeTimeout);
    readingTimeTimeout = null;
  }
}
