// 初始加载
chrome.storage.sync.get(["settings"], (result) => {
  if (result.settings) {
    window.prSettings = result.settings;
    updateContentStyles(result.settings);
    updateFeatures(result.settings);
  }
});

// 监听来自 Popup / Background 的消息（统一入口）
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "startSelectorPicker") {
    startSelectorPicker(request.target);
    if (sendResponse) sendResponse({ ok: true });
    return true;
  }

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
    enabled: false,
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

  const defaultTypo = {
    enabled: false,
    lineHeight: "1.6",
    fontSize: "100",
    fontWeight: "0",
  };

  const lineHeight =
    typo.lineHeight !== undefined && typo.lineHeight !== null && typo.lineHeight !== ""
      ? String(typo.lineHeight)
      : defaultTypo.lineHeight;
  const fontSize =
    typo.fontSize !== undefined && typo.fontSize !== null && typo.fontSize !== ""
      ? String(typo.fontSize)
      : defaultTypo.fontSize;
  const fontWeight =
    typo.fontWeight !== undefined && typo.fontWeight !== null && typo.fontWeight !== ""
      ? String(typo.fontWeight)
      : defaultTypo.fontWeight;

  const inferredEnabled =
    lineHeight !== defaultTypo.lineHeight || fontSize !== defaultTypo.fontSize || fontWeight !== defaultTypo.fontWeight;
  const typoEnabled = typeof typo.enabled === "boolean" ? typo.enabled : inferredEnabled;

  const typoOn = typoEnabled === true;

  const fontSizeNum = Number(fontSize);
  const scale = Number.isFinite(fontSizeNum) ? fontSizeNum / 100 : Number(defaultTypo.fontSize) / 100;

  const getExtra = (key, gate = "") => {
    const list = parseSelectorList(selectorConfig.include[key]);
    return list.length ? `, ${list.map((s) => `${s}${gate}`).join(", ")}` : "";
  };

  // 默认内置排除规则
  const exclude = {
    icon: ':not(.fa):not(.fas):not(.far):not(.fab):not(.glyphicon):not(.iconfont):not([class*="fa-" i]):not([class*="icon" i]):not([class*="ico-" i]):not([class*="ico_" i]):not([class*="glyph" i]):not([class*="symbol" i]):not([class*="emoji" i]):not([data-icon]):not([role="img"]):not([aria-hidden="true"]):not(i)',
    code: ':not(pre):not(pre *):not(code):not(code *):not(kbd):not(samp):not([class*="pl-"]):not([class*="blob-code"]):not([class*="highlight"])',
    media: ":not(video):not(iframe):not(canvas):not(svg):not(svg *):not(img):not(audio)",
    player: ':not([class*="player"]):not([class*="Player"]):not([class*="video"]):not([class*="Video"])',
  };

  const manualExcludeLines = parseSelectorList(selectorConfig.exclude, {
    stripPseudo: true,
  });
  const excludeSelectorStr = manualExcludeLines.length
    ? manualExcludeLines.flatMap((s) => [s, `${s} *`]).join(", ")
    : "";
  const manualExcludeGate = excludeSelectorStr ? `:not(${excludeSelectorStr})` : "";

  const css = `
    :root {
      --pr-lh: ${lineHeight};
      --pr-fs: ${scale};
    }

    /* 标准字体 */
    body *${exclude.code}${exclude.media}${exclude.player}${exclude.icon}:not(math):not(.katex)${manualExcludeGate}${getExtra("standard", manualExcludeGate)} {
      ${font(mapping.standard, "sans-serif")}
    }

    ${
      typoOn
        ? `
    /* 行高 */
    p${manualExcludeGate}, span${manualExcludeGate}, div${exclude.player}${manualExcludeGate}:not([class*="danmaku"]):not([class*="bpx"]),
    li${manualExcludeGate}, td${manualExcludeGate}, th${manualExcludeGate}, label${manualExcludeGate}, a${manualExcludeGate}, h1${manualExcludeGate}, h2${manualExcludeGate}, h3${manualExcludeGate}, h4${manualExcludeGate}, h5${manualExcludeGate}, h6${manualExcludeGate},
    article${manualExcludeGate}, section${manualExcludeGate}, aside${manualExcludeGate}, main${manualExcludeGate}, blockquote${manualExcludeGate}, figcaption${manualExcludeGate} {
      line-height: var(--pr-lh) !important;
    }

    /* 字号缩放 */
    ${
      scale !== 1
        ? `
    p${manualExcludeGate}, span${exclude.player}${manualExcludeGate}:not([class*="time"]):not([class*="duration"]),
    li${manualExcludeGate}, td${manualExcludeGate}, th${manualExcludeGate}, article${manualExcludeGate}, blockquote${manualExcludeGate}, figcaption${manualExcludeGate} {
      font-size: calc(1em * var(--pr-fs)) !important;
    }`
        : ""
    }

    /* 字重补偿 - 支持正负值 */
    ${
      fontWeight != "0"
        ? parseInt(fontWeight) > 0
          ? `
    /* 正值：使用 text-stroke 加粗 */
    body *:not([class*="icon" i]):not([class*="ico-" i]):not([class*="ico_" i]):not(.iconfont):not([data-icon]):not([role="img"]):not([aria-hidden="true"]):not(i)${exclude.media}${manualExcludeGate} {
      -webkit-text-stroke-width: ${fontWeight / 500}px;
    }`
          : `
    /* 负值：使用 font-weight 减细 + letter-spacing 视觉优化 */
    body *:not([class*="icon" i]):not([class*="ico-" i]):not([class*="ico_" i]):not(.iconfont):not([data-icon]):not([role="img"]):not([aria-hidden="true"]):not(i)${exclude.media}:not(h1):not(h2):not(h3)${manualExcludeGate} {
      font-weight: lighter !important;
      letter-spacing: ${Math.abs(parseInt(fontWeight)) / 400}px;
    }`
        : ""
    }
    `
        : ""
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

    /* 数学公式 */
    body math${manualExcludeGate}, body math *${manualExcludeGate}, body .mjx-chtml${manualExcludeGate}, body .mjx-chtml *${manualExcludeGate},
    body .katex${manualExcludeGate}, body .katex *${manualExcludeGate}${getExtra("math", manualExcludeGate)} {
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

const PICKER_TARGET_LABELS = {
  standard: "额外匹配 · 标准字体",
  mono: "额外匹配 · 代码 / 等宽",
  math: "额外匹配 · 数学公式",
  exclude: "排除替换 · 全局",
};

let selectorPickerState = null;
let selectorPickerToastTimer = null;
let selectorPickerToastId = "pure-read-selector-picker-toast";
const PICKER_FLOAT_FONT =
  '"Huiwen-HKHei",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
const PICKER_FLOAT_COLORS = {
  text: "#1f2937",
  textMuted: "#6b7280",
  primary: "#2563eb",
  primarySoft: "rgba(37,99,235,0.08)",
  accent: "#2563eb",
  accentSoft: "rgba(37,99,235,0.16)",
  surface: "#ffffff",
  surfaceAlt: "#f9fafb",
  border: "#e5e7eb",
  error: "#dc2626",
  errorSoft: "rgba(220,38,38,0.08)",
};
const selectorPickerUiStyleId = "pure-read-selector-picker-ui-style";

function ensureSelectorPickerUiStyle() {
  if (document.getElementById(selectorPickerUiStyleId)) return;

  const style = document.createElement("style");
  style.id = selectorPickerUiStyleId;
  style.textContent = `
    @import url("https://fontsapi.zeoseven.com/439/main/result.css");

    @keyframes prPickerToastIn {
      0% {
        opacity: 0;
        transform: translate3d(0, -10px, 0) scale(0.96);
      }
      100% {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
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

    @keyframes prPickerGlow {
      0%,
      100% {
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.94),
          0 22px 44px -28px rgba(37,99,235,0.35),
          inset 0 1px 0 rgba(255,255,255,0.85);
      }
      50% {
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.94),
          0 26px 52px -26px rgba(37,99,235,0.4),
          0 0 0 6px ${PICKER_FLOAT_COLORS.primarySoft},
          inset 0 1px 0 rgba(255,255,255,0.85);
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
      features: {},
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
}

function createSelectorPickerToastShell(tone = "info") {
  ensureSelectorPickerUiStyle();
  removeSelectorPickerToast();

  const toast = document.createElement("div");
  toast.id = selectorPickerToastId;
  Object.assign(toast.style, {
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: "2147483647",
    maxWidth: "380px",
    padding: "12px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    lineHeight: "1.5",
    fontFamily: PICKER_FLOAT_FONT,
    color: tone === "error" ? PICKER_FLOAT_COLORS.error : PICKER_FLOAT_COLORS.text,
    background: PICKER_FLOAT_COLORS.surface,
    border: `1px solid ${tone === "error" ? PICKER_FLOAT_COLORS.error : PICKER_FLOAT_COLORS.border}`,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    animation: "prPickerToastIn 200ms cubic-bezier(0, 0, 0.2, 1)",
    transformOrigin: "top right",
  });

  document.documentElement.appendChild(toast);
  return toast;
}

function showSelectorPickerToast(message, tone = "info") {
  const toast = createSelectorPickerToastShell(tone);
  toast.innerHTML = `
    <div style="display:grid; gap:6px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:8px; height:8px; border-radius:999px; background:${tone === "error" ? PICKER_FLOAT_COLORS.error : PICKER_FLOAT_COLORS.accent}; box-shadow:0 0 0 5px ${tone === "error" ? PICKER_FLOAT_COLORS.errorSoft : PICKER_FLOAT_COLORS.accentSoft}; flex-shrink:0;"></span>
        <span style="font-family:${PICKER_FLOAT_FONT}; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${tone === "error" ? PICKER_FLOAT_COLORS.error : PICKER_FLOAT_COLORS.primary};">${tone === "error" ? "操作失败" : tone === "success" ? "已更新" : "页面拾取"}</span>
      </div>
      <div style="font-family:${PICKER_FLOAT_FONT}; font-size:13px; line-height:1.55; color:${tone === "error" ? PICKER_FLOAT_COLORS.error : PICKER_FLOAT_COLORS.text};">${message}</div>
    </div>
  `;
  toast.style.pointerEvents = "none";
  selectorPickerToastTimer = setTimeout(() => toast.remove(), 2200);
}

function showSelectorPickerActionToast({ title, detail, actionLabel, onAction }) {
  const toast = createSelectorPickerToastShell("info");
  toast.style.pointerEvents = "auto";
  toast.style.padding = "20px 24px";
  toast.style.maxWidth = "460px";
  toast.style.width = "max-content";
  toast.style.minWidth = "320px";
  toast.style.display = "flex";
  toast.style.flexDirection = "column";
  toast.style.gap = "16px";
  toast.style.borderColor = "transparent";
  toast.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0,0,0,0.02)";

  // Content Area
  const content = document.createElement("div");
  Object.assign(content.style, {
    display: "flex",
    gap: "16px",
    alignItems: "flex-start",
  });

  // Leading Icon Section
  const iconWrapper = document.createElement("div");
  Object.assign(iconWrapper.style, {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    background: PICKER_FLOAT_COLORS.primarySoft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  });
  iconWrapper.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${PICKER_FLOAT_COLORS.primary}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  // Text Section
  const textGroup = document.createElement("div");
  Object.assign(textGroup.style, {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  });

  const titleEl = document.createElement("div");
  titleEl.textContent = title;
  Object.assign(titleEl.style, {
    fontWeight: "700",
    fontSize: "15px",
    color: PICKER_FLOAT_COLORS.text,
    letterSpacing: "-0.01em",
  });

  const detailEl = document.createElement("div");
  detailEl.textContent = detail;
  Object.assign(detailEl.style, {
    fontSize: "12px",
    fontFamily: "ui-monospace, monospace",
    color: PICKER_FLOAT_COLORS.textMuted,
    opacity: "0.8",
    wordBreak: "break-all",
  });

  textGroup.appendChild(titleEl);
  textGroup.appendChild(detailEl);

  content.appendChild(iconWrapper);
  content.appendChild(textGroup);

  // Divider
  const divider = document.createElement("div");
  Object.assign(divider.style, {
    height: "1px",
    background: "rgba(0,0,0,0.04)",
    width: "100%",
  });

  // Action Footer
  const footer = document.createElement("div");
  Object.assign(footer.style, {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "12px",
  });

  const hint = document.createElement("div");
  hint.textContent = "更改已即时应用";
  Object.assign(hint.style, {
    fontSize: "11px",
    color: PICKER_FLOAT_COLORS.textMuted,
    fontWeight: "500",
  });

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = actionLabel;
  Object.assign(button.style, {
    border: "none",
    background: PICKER_FLOAT_COLORS.surfaceAlt,
    color: PICKER_FLOAT_COLORS.text,
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
    border: `1px solid ${PICKER_FLOAT_COLORS.border}`,
  });
  button.addEventListener("mouseenter", () => {
    button.style.background = PICKER_FLOAT_COLORS.border;
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = PICKER_FLOAT_COLORS.surfaceAlt;
  });
  button.addEventListener("click", async () => {
    try {
      await onAction();
      showSelectorPickerToast("已撤销本次添加", "success");
    } catch (error) {
      showSelectorPickerToast(`撤销失败：${error.message}`, "error");
    }
  });

  footer.appendChild(hint);
  footer.appendChild(button);

  toast.appendChild(content);
  toast.appendChild(divider);
  toast.appendChild(footer);
  selectorPickerToastTimer = setTimeout(() => toast.remove(), 5000);
}

function escapeCssIdentifier(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function isUniqueSelector(selector) {
  try {
    return document.querySelectorAll(selector).length === 1;
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

function buildSelectorSegment(element) {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  if (id) {
    const selector = `#${escapeCssIdentifier(id)}`;
    if (isUniqueSelector(selector)) return selector;
  }

  const classes = Array.from(element.classList || [])
    .filter(isMeaningfulClassName)
    .slice(0, 2);

  let selector = tag;
  if (classes.length) {
    selector += `.${classes.map(escapeCssIdentifier).join(".")}`;
    if (isUniqueSelector(selector)) return selector;
  }

  return `${selector}:nth-of-type(${getNthOfTypeIndex(element)})`;
}

function buildSelectorPath(element) {
  if (!(element instanceof Element)) return "";

  const id = element.getAttribute("id");
  if (id) {
    const selector = `#${escapeCssIdentifier(id)}`;
    if (isUniqueSelector(selector)) return selector;
  }

  const segments = [];
  let current = element;
  let depth = 0;

  while (current && depth < 5 && current !== document.documentElement) {
    segments.unshift(buildSelectorSegment(current));
    const selector = segments.join(" > ");
    if (isUniqueSelector(selector)) return selector;
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

function getPickerElement(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest('[id^="pure-read-selector-picker"]')) return null;

  const tag = target.tagName.toLowerCase();
  if (tag === "path" || tag === "use") {
    return target.closest("svg") || target;
  }

  return target;
}

function updatePickerTip(element, selector) {
  if (!selectorPickerState?.tip) return;

  const { tip, target } = selectorPickerState;
  const label = element ? getElementLabel(element) : "等待选择元素";
  const finalSelector = selector || "等待生成代码...";

  tip.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.04); padding-bottom:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:12px; height:12px; background:${PICKER_FLOAT_COLORS.primary}; border-radius:3px; display:flex; align-items:center; justify-content:center;">
            <div style="width:4px; height:4px; background:white; border-radius:999px;"></div>
          </div>
          <span style="font-size:11px; font-weight:800; color:${PICKER_FLOAT_COLORS.primary}; text-transform:uppercase; letter-spacing:0.05em;">PR Picker</span>
        </div>
        <div style="font-size:10px; font-weight:600; color:${PICKER_FLOAT_COLORS.textMuted}; background:${PICKER_FLOAT_COLORS.surfaceAlt}; padding:2px 6px; border-radius:4px;">${PICKER_TARGET_LABELS[target].split(" · ")[1] || PICKER_TARGET_LABELS[target]}</div>
      </div>

      <!-- Main Info -->
      <div style="display:grid; gap:10px;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-size:10px; font-weight:700; color:${PICKER_FLOAT_COLORS.textMuted}; text-transform:uppercase; opacity:0.6;">目标元素</div>
          <div style="font-size:13px; font-weight:600; color:${PICKER_FLOAT_COLORS.text}; font-family:ui-monospace, monospace; word-break:break-word;">${label}</div>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; padding:10px; background:${PICKER_FLOAT_COLORS.primary}08; border-radius:8px; border:1px dashed ${PICKER_FLOAT_COLORS.primary}30;">
          <div style="font-size:10px; font-weight:700; color:${PICKER_FLOAT_COLORS.primary}; text-transform:uppercase; opacity:0.8;">生成选择器</div>
          <div style="font-size:12px; line-height:1.4; color:${PICKER_FLOAT_COLORS.primary}; font-weight:500; word-break:break-all;">${finalSelector}</div>
        </div>
      </div>

      <!-- Footer -->
      <div style="display:flex; align-items:center; gap:10px; font-size:10px; color:${PICKER_FLOAT_COLORS.textMuted}; opacity:0.8;">
        <div style="display:flex; align-items:center; gap:4px;">
          <kbd style="padding:1px 4px; background:${PICKER_FLOAT_COLORS.surfaceAlt}; border:1px solid ${PICKER_FLOAT_COLORS.border}; border-radius:3px; font-family:sans-serif; font-size:9px;">Click</kbd> 确认
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <kbd style="padding:1px 4px; background:${PICKER_FLOAT_COLORS.surfaceAlt}; border:1px solid ${PICKER_FLOAT_COLORS.border}; border-radius:3px; font-family:sans-serif; font-size:9px;">Esc</kbd> 退出
        </div>
      </div>
    </div>
  `;
}

function updatePickerOverlay(element) {
  if (!selectorPickerState) return;

  selectorPickerState.hoveredElement = element;
  const { box, tip } = selectorPickerState;
  if (!element) {
    box.style.opacity = "0";
    updatePickerTip(null, "");
    return;
  }

  const rect = element.getBoundingClientRect();
  const selector = buildSelectorPath(element);
  box.style.opacity = rect.width > 0 && rect.height > 0 ? "1" : "0";
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;

  updatePickerTip(element, selector);

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

  document.removeEventListener("mousemove", selectorPickerState.onMouseMove, true);
  document.removeEventListener("click", selectorPickerState.onClick, true);
  document.removeEventListener("keydown", selectorPickerState.onKeyDown, true);
  window.removeEventListener("scroll", selectorPickerState.onScroll, true);

  selectorPickerState.root.remove();
  selectorPickerState = null;

  if (!silent) {
    showSelectorPickerToast("已取消页面拾取");
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
  window.prSettings = settings;
  updateContentStyles(settings);
  updateFeatures(settings);

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
  window.prSettings = settings;
  updateContentStyles(settings);
  updateFeatures(settings);
}

function startSelectorPicker(target = "standard") {
  const normalizedTarget = PICKER_TARGET_LABELS[target] ? target : "standard";
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

  Object.assign(box.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "0",
    height: "0",
    border: `2px solid ${PICKER_FLOAT_COLORS.primary}`,
    background: `linear-gradient(180deg, ${PICKER_FLOAT_COLORS.primarySoft}, rgba(37,99,235,0.04))`,
    boxShadow:
      "0 0 0 1px rgba(255,255,255,0.94), 0 22px 44px -28px rgba(37,99,235,0.4), inset 0 1px 0 rgba(255,255,255,0.85)",
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
    color: PICKER_FLOAT_COLORS.text,
    background: PICKER_FLOAT_COLORS.surface,
    border: `1px solid ${PICKER_FLOAT_COLORS.border}`,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    pointerEvents: "none",
    textAlign: "left",
    maxWidth: "360px",
    minWidth: "260px",
    animation: "prPickerTipIn 200ms cubic-bezier(0, 0, 0.2, 1)",
    transformOrigin: "top left",
  });

  document.documentElement.appendChild(root);
  updatePickerTip(null, "");

  const onMouseMove = (event) => {
    updatePickerOverlay(getPickerElement(event.target));
  };

  const onScroll = () => {
    updatePickerOverlay(selectorPickerState?.hoveredElement || null);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      teardownSelectorPicker();
    }
  };

  const onClick = async (event) => {
    const element = getPickerElement(event.target);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const selector = buildSelectorPath(element);
    if (!selector) {
      showSelectorPickerToast("未能生成可用的选择器，请换一个元素试试。", "error");
      return;
    }

    try {
      const change = await savePickedSelector(normalizedTarget, selector);
      teardownSelectorPicker({ silent: true });
      showSelectorPickerActionToast({
        title: `已添加到 ${PICKER_TARGET_LABELS[normalizedTarget]}`,
        detail: selector,
        actionLabel: "撤销",
        onAction: () => restorePickedSelector(change.previousSelectors),
      });
    } catch (error) {
      teardownSelectorPicker({ silent: true });
      showSelectorPickerToast(`保存失败：${error.message}`, "error");
    }
  };

  selectorPickerState = {
    root,
    box,
    tip,
    target: normalizedTarget,
    hoveredElement: null,
    onMouseMove,
    onClick,
    onKeyDown,
    onScroll,
  };

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
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
    if (!color || color === "rgba(0, 0, 0, 0)" || color === "transparent") return false;
    const rgb = color.match(/\d+/g);
    if (!rgb) return false;
    const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
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
        if (condText.includes("prefers-color-scheme") && condText.includes("dark")) {
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

const DARK_CLASSES = ["dark", "dark-mode", "dark-theme", "theme-dark", "night-mode", "night", "darkmode", "nightmode"];

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
      const regex = new RegExp(`\\[${attr}[~|^$*]?=["']?dark(?:["']\\]|\\])`);
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
        _prDarkState.target.setAttribute(_prDarkState.key, _prDarkState.originalValue);
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
