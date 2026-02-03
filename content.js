// 初始加载
chrome.storage.sync.get(["settings"], (result) => {
  if (result.settings) {
    updateContentStyles(result.settings);
  }
});

// 监听来自 Popup 的实时更新消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateStyles" && request.settings) {
    updateContentStyles(request.settings);
  }
});

function updateContentStyles(settings) {
  const domain = window.location.hostname;
  const global = settings.global;
  const site = settings.sites[domain];

  // 逻辑判断：站点开关具有最高优先级 (支持白名单模式)
  const isSiteEnabled = site ? site.on : global.on;

  if (!isSiteEnabled) {
    removeStyles();
    return;
  }

  const isCustom = site && site.mode === "custom";
  const mapping = isCustom ? site.mapping : global.mapping;
  const typo = (isCustom ? site.typo : global.typo) || {
    lineHeight: "1.6",
    fontSize: "100",
    fontWeight: "0",
  };

  applyStyles(mapping, typo);
}

function removeStyles() {
  const existing = document.getElementById("pure-read-injector");
  if (existing) existing.remove();
}

function applyStyles(mapping, typo) {
  const fontStr = (name, fallback) => {
    if (!name) return "";
    return `font-family: "${name}", ${fallback} !important;`;
  };

  // 严格的图标排除
  const iconExclusions =
    ':not(.fa):not(.fas):not(.far):not(.fab):not(.glyphicon):not(.iconfont):not([class*="icon-"]):not([class*="Icon-"]):not(i):not([style*="font-family: Material Icons"])';

  const css = `
        :root {
          --pr-lh: ${typo.lineHeight};
          --pr-fs: ${typo.fontSize}%;
          --pr-fw-offset: ${typo.fontWeight};
        }

        /* 1. 基础排版应用 */
        html {
          font-size: var(--pr-fs) !important;
        }

        *:not(pre):not(code):not(kbd):not(samp):not(var):not(math):not(.katex)${iconExclusions} { 
            ${fontStr(mapping.standard, "sans-serif")}
            line-height: var(--pr-lh) !important;
        }

        /* 2. 字重补偿 (如果是正数则加粗，负数暂时不处理以防乱码) */
        ${
          typo.fontWeight != "0"
            ? `
        body *:not([class*="icon"]):not(i) {
          -webkit-text-stroke-width: ${Math.max(0, typo.fontWeight / 500)}px;
        }`
            : ""
        }

        /* 3. 代码块 (Mono) */
        pre, code, kbd, samp, .blob-code, .text-mono, .mono { 
            ${fontStr(mapping.mono, "monospace")} 
            line-height: 1.4 !important;
        }

        /* 4. 数学公式 (Math) */
        math, .mjx-chtml, .katex { 
            ${fontStr(mapping.math, "serif")} 
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
