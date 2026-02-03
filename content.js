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

  // 逻辑判断：是否需要应用样式
  if (!global.on || (site && site.on === false)) {
    removeStyles();
    return;
  }

  let mapping =
    site && site.mode === "custom" && site.mapping
      ? site.mapping
      : global.mapping;
  applyStyles(mapping);
}

function removeStyles() {
  const existing = document.getElementById("pure-read-injector");
  if (existing) existing.remove();
}

function applyStyles(mapping) {
  const fontStr = (name, fallback) => {
    if (!name || name === "系统默认") return "";
    return `font-family: "${name}", ${fallback} !important;`;
  };

  // 严格的图标排除，避免常用的 IconFont 乱码
  const iconExclusions =
    ':not(.fa):not(.fas):not(.far):not(.fab):not(.glyphicon):not(.iconfont):not([class*="icon-"]):not([class*="Icon-"]):not(i):not([style*="font-family: Material Icons"])';

  const css = `
        /* 1. 全局底色 (Standard)
           页面上几乎所有的东西统统变成【标准字体】，解决网页类名不规范的问题。
        */
        *:not(pre):not(code):not(kbd):not(samp):not(var):not(math):not(.katex)${iconExclusions} { 
            ${fontStr(mapping.standard, "sans-serif")} 
        }

        /* 2. 代码块 (Mono) - 强制优先级最高 */
        pre, code, kbd, samp, .blob-code, .text-mono, .mono { 
            ${fontStr(mapping.mono, "monospace")} 
        }

        /* 3. 数学公式 (Math) */
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
