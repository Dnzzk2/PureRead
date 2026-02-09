// 初始加载
chrome.storage.sync.get(["settings"], (result) => {
  if (result.settings) {
    updateContentStyles(result.settings);
    updateFeatures(result.settings);
  }
});

// 监听来自 Popup 的实时更新消息（当前 tab）
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "updateStyles" && request.settings) {
    updateContentStyles(request.settings);
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
  const exclude = {
    icon: ':not(.fa):not(.fas):not(.far):not(.fab):not(.glyphicon):not(.iconfont):not([class*="icon"]):not(i)',
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
    p, span, div${exclude.player}:not([class*="danmaku"]):not([class*="bpx"]),
    li, td, th, label, a, h1, h2, h3, h4, h5, h6,
    article, section, aside, main, blockquote, figcaption {
      line-height: var(--pr-lh) !important;
    }

    /* 字号缩放 */
    ${
      scale !== 1
        ? `
    p, span${exclude.player}:not([class*="time"]):not([class*="duration"]),
    li, td, th, article, blockquote, figcaption {
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
    body *:not([class*="icon"]):not(i)${exclude.media} {
      -webkit-text-stroke-width: ${typo.fontWeight / 500}px;
    }`
          : `
    /* 负值：使用 font-weight 减细 + letter-spacing 视觉优化 */
    body *:not([class*="icon"]):not(i)${exclude.media}:not(h1):not(h2):not(h3) {
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

  // 强制暗色模式
  const forceDark = features.forceDark ?? false;
  const isDarkApplied = !!document.getElementById("pure-read-dark-mode");
  if (forceDark) {
    if (!isDarkApplied) enableDarkMode();
  } else if (isDarkApplied) {
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

// 监听来自 Popup 的功能更新消息
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "updateFeatures" && request.settings) {
    updateFeatures(request.settings);
  }
});

// ═══════════════════════════════════════════════════════════
// 强制暗色模式 (Force Dark Mode)
// ═══════════════════════════════════════════════════════════

// 判断这是否是一个暗色页面
function isDarkPage() {
  const bgColor = getComputedStyle(document.body).backgroundColor;
  const htmlColor = getComputedStyle(document.documentElement).backgroundColor;

  const isDark = (color) => {
    if (!color || color === "rgba(0, 0, 0, 0)" || color === "transparent")
      return false;
    const rgb = color.match(/\d+/g);
    if (!rgb) return false;
    // 简单亮度公式
    const brightness =
      (parseInt(rgb[0]) * 299 +
        parseInt(rgb[1]) * 587 +
        parseInt(rgb[2]) * 114) /
      1000;
    return brightness < 128;
  };

  return isDark(bgColor) || isDark(htmlColor);
}

function enableDarkMode() {
  if (document.getElementById("pure-read-dark-mode")) return;

  // 如果页面本身已经是暗色背景，就不需要反转了
  if (isDarkPage()) {
    console.log("[PureRead] 页面已是暗色，跳过处理");
    return;
  }

  const style = document.createElement("style");
  style.id = "pure-read-dark-mode";
  style.textContent = `
  /* 核心反转：高对比度，强力反转 */
    html {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* 净化页面：去除反转后产生的杂乱光晕和线条 */
    * {
      box-shadow: none !important;
      text-shadow: none !important;
      /* 尝试让边框颜色变暗，减少刺眼线条，但保留布局结构 */
      /* border-color: rgba(255, 255, 255, 0.2) !important; 可选 */
    }

    /* ═══ 媒体保护区：恢复被反转的元素 ═══ */
    
    /* 1. 基础媒体元素 */
    img, video, iframe, canvas, object, embed, picture, source, svg image {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* 2. 背景图片容器 (尝试捕获) */
    [style*="background-image"]:not([style*="gradient"]),
    [class*="hero"], [class*="banner"], [class*="cover"],
    [class*="avatar"], [class*="Avatar"],
    [class*="logo"], [class*="Logo"],
    [class*="icon"], [class*="Icon"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* 3. 防止 SVG 自身被反转（如果它作为图标） */
    /* 注意：svg image 已经被上面的规则覆盖，这里处理纯 SVG 矢量图 */
    /* 通常 SVG 图标是单色的，反转后变色正好。但如果是多彩 SVG，可能需要保护 */
    /* 这里我们保持默认反转，因为 SVG 图标通常需要随文字颜色变化 */

    /* 4. 特殊处理：有些元素虽然有背景图，但也包含文字，如果反转回来，文字会再次反转成黑色（看不清） */
    /* 这是一个两难，但为了图片正常，优先保护背景图容器。 */
    /* 如果背景图容器里的文字看不清，可以尝试给文字再次反转（三重反转=反转）... 不，这太复杂了 */

    /* 强力背景修正：确保网页背景是深色的 */
    /* 
       由于 html 已经被 invert(1)，如果原网页背景是白(#fff)，现在是黑(#000)。
       如果原网页背景是浅灰(#eee)，现在是深灰(#111)。
       这是符合预期的。
    */
  `;
  document.documentElement.appendChild(style);
}

function disableDarkMode() {
  document.getElementById("pure-read-dark-mode")?.remove();
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
