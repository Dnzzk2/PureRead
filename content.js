// 初始加载
chrome.storage.sync.get(["settings"], (result) => {
  if (result.settings) updateContentStyles(result.settings);
});

// 监听来自 Popup 的实时更新消息（当前 tab）
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "updateStyles" && request.settings) {
    updateContentStyles(request.settings);
  }
});

// 监听存储变化（其他页面/tab 的配置更新会触发这里）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.settings) {
    const newSettings = changes.settings.newValue;
    if (newSettings) {
      updateContentStyles(newSettings);
    }
  }
});

function updateContentStyles(settings) {
  const domain = window.location.hostname;
  const global = settings.global || {};
  const sites = settings.sites || {};
  const site = sites[domain];

  // 获取最终生效的开关状态：若站点有明确设置则用站点的，否则用全局的
  const isEnabled = (site && typeof site.on === "boolean") ? site.on : global.on;

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
