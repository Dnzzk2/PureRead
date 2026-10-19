// 使用 shared.js 中的 DEFAULT_MAPPING 和 DEFAULT_TYPO

// i18n 简写。模板可信、替换值不可信：t() 进 textContent，tHtml() 进 innerHTML。
const t = (key, subs) => I18n.t(key, subs);
const tHtml = (key, subs) => I18n.tHtml(key, subs);

// 界面字体是设备级偏好，异步读到后套到 --font 上。
UiFont.loadAndApply();

// 取当前标签页可用于站点配置的域名；返回空串表示这个页面不支持站点级设置。
//
// 判定跟 content_scripts 的 <all_urls> 对齐：它只匹配 http / https / file / ftp
// 这几种协议，其余页面脚本压根不注入。这里刻意用白名单而不是黑名单 ——
// 黑名单只挡得住想得到的协议，实测下来两个方向都会错：
//   file:// 的 hostname 是空串，会被误判成「不支持」（用户开了文件访问权限后其实能注入）；
//   devtools:// 之类解析出的 hostname 非空，反而会被当成正常站点，放行一个永不生效的配置。
//
// Chrome 另外硬性禁止在应用商店页面注入内容脚本，哪怕地址是 https。
// 必须单独排除，否则用户逛商店时能写进一条永远不生效的规则。
const UNSCRIPTABLE = [
  { host: "chromewebstore.google.com" },
  { host: "chrome.google.com", path: "/webstore" }, // 旧版商店地址
];

const resolveDomain = (url) => {
  if (!url) return "";
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return ""; // about:blank 等解析不了的一律不支持
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

  const blocked = UNSCRIPTABLE.some(
    (rule) =>
      parsed.hostname === rule.host &&
      (!rule.path || parsed.pathname.startsWith(rule.path)),
  );
  return blocked ? "" : parsed.hostname;
};

document.addEventListener("DOMContentLoaded", async () => {
  const els = {
    globalSwitch: document.getElementById("global-switch"),
    siteSwitch: document.getElementById("site-switch"),
    modeRadios: document.querySelectorAll('input[name="mode"]'),
    domainDisplay: document.getElementById("domain-display"),
    selectors: document.querySelectorAll(".font-input"),
    loading: document.getElementById("loading-tip"),
    fontLimitHint: document.getElementById("font-limit-hint"),
    fontLimitText: document.getElementById("font-limit-text"),
    selectorPickButtons: document.querySelectorAll(".selector-pick-btn"),
  };

  // 核心变量
  let domain = "";
  let data = {};
  let siteData = {};
  let tab = null;
  let allFonts = [];
  let skipNextSync = false;
  let isRefreshing = false;

  // 1. 初始化流程
  // 目标项由按钮的 data-target 决定（standard / mono / math / exclude），
  // 按钮文案写在 popup.html 里，与 options 的四个规则项同名。
  const startSelectorPicker = async (target = "standard") => {
    if (!tab?.id || !domain) return;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "startSelectorPicker",
        target,
      });
      window.close();
    } catch (e) {
      console.warn("[PureRead] 无法启动页面拾取:", e.message);
    }
  };

  // 不支持的页面（chrome:// 等）：禁用站点级控件，避免产生无意义的站点配置
  const applySiteAvailability = () => {
    const supported = Boolean(domain);

    if (els.siteSwitch) {
      els.siteSwitch.disabled = !supported;
      if (!supported) els.siteSwitch.checked = false;
    }

    const segmented = document.querySelector(".segmented-control");
    if (segmented) segmented.classList.toggle("is-disabled", !supported);

    const siteCard = document.getElementById("site-card");
    if (siteCard) siteCard.classList.toggle("is-unsupported", !supported);

    // 页面拾取依赖内容脚本注入，浏览器内置页注入不了，一并禁用，
    // 否则点击后只会静默失败（popup 不关、页面无任何反应）。
    els.selectorPickButtons.forEach((btn) => (btn.disabled = !supported));

    const pickerControls = document.querySelector(".selector-picker-controls");
    if (pickerControls) pickerControls.classList.toggle("is-disabled", !supported);

    const picker = document.getElementById("selector-picker");
    if (picker) picker.classList.toggle("is-unsupported", !supported);

    els.modeRadios.forEach((radio) => {
      radio.disabled = !supported;
    });

    if (!supported) {
      const globalRadio = document.querySelector(
        'input[name="mode"][value="global"]',
      );
      if (globalRadio) globalRadio.checked = true;
    }
  };

  // 拿不到系统字体列表时（Firefox 未实现 chrome.fontSettings），
  // 下拉里只剩 shared.js 的 11 个兜底字体。这里明确说明原因并给出解法，
  // 否则用户会以为「字体列表就这么少」而放弃。
  const applyFontListHint = () => {
    if (!els.fontLimitHint || !FontLoader.usingFallbackFonts) return;

    const browser = /firefox/i.test(navigator.userAgent)
      ? "Firefox"
      : t("common.currentBrowser");
    if (els.fontLimitText) {
      els.fontLimitText.innerHTML = tHtml("popup.fontLimit.hint", { browser });
    }
    els.fontLimitHint.classList.add("is-visible");
  };

  const init = async () => {
    // 获取域名
    try {
      const [currentTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      domain = resolveDomain(currentTab?.url);
      tab = currentTab;
    } catch (e) {
      console.error("[PureRead] 获取环境信息失败:", e.message);
    }
    if (els.domainDisplay)
      els.domainDisplay.innerText = domain || t("popup.unsupportedPage");

    // 加载字体
    allFonts = await FontLoader.load();
    if (els.loading) els.loading.style.display = "none";
    applyFontListHint();

    // 首次同步 UI
    await refreshUI(true);
    checkUpdates();
  };

  // 2. 实时同步 UI 函数
  const refreshUI = async (isInitial = false) => {
    if (isRefreshing) return;
    isRefreshing = true;

    try {
      const result = await Storage.get(["settings"]);
      const rawSettings = result.settings;
      data = DataValidator.ensureSettings(rawSettings);

      let needsPersist =
        rawSettings === undefined ||
        rawSettings === null ||
        typeof rawSettings !== "object" ||
        Array.isArray(rawSettings);

      // 清理历史遗留：旧版本在 chrome:// 等页面误写入的 sites[""] 空域名
      if (Object.prototype.hasOwnProperty.call(data.sites, "")) {
        delete data.sites[""];
        needsPersist = true;
      }

      if (needsPersist) {
        skipNextSync = true;
        await Storage.set({ settings: data });
      }
      siteData = DataValidator.ensureSiteData(data.sites[domain]);

      const sliders = document.querySelectorAll(".slider, .selection-bar");
      if (isInitial) sliders.forEach((s) => (s.style.transition = "none"));

      // 同步开关状态
      const isGlobalOn = data.global.on !== false;
      if (els.globalSwitch) els.globalSwitch.checked = isGlobalOn;
      if (els.siteSwitch) {
        els.siteSwitch.checked =
          typeof siteData.on === "boolean" ? siteData.on : isGlobalOn;
      }

      const activeModeInput = document.querySelector(
        `input[name="mode"][value="${siteData.mode}"]`,
      );
      if (activeModeInput) activeModeInput.checked = true;

      // 不支持的页面：强制回退到全局模式并禁用站点控件
      applySiteAvailability();

      // 同步映射与样式
      updateMappingUI(data, siteData);

      if (isInitial) {
        setTimeout(() => sliders.forEach((s) => (s.style.transition = "")), 5);
      }
    } finally {
      isRefreshing = false;
    }
  };

  // 核心保存逻辑
  const _saveDataCore = async () => {
    const globalOn = els.globalSwitch?.checked ?? true;
    const siteOn = els.siteSwitch?.checked ?? true;
    const checkedMode = document.querySelector('input[name="mode"]:checked');
    const mode = checkedMode ? checkedMode.value : "global";

    data.global.on = globalOn;

    const currentMapping = {};
    els.selectors.forEach(
      (sel) => (currentMapping[sel.dataset.key] = sel.value),
    );

    // domain 为空（chrome:// 等不支持的页面）时，不写入任何站点级数据
    if (domain) {
      if (mode === "global" && siteOn === globalOn) {
        delete data.sites[domain];
        siteData.on = undefined;
        siteData.mode = "global";
      } else {
        if (!data.sites[domain]) data.sites[domain] = {};
        const s = data.sites[domain];
        s.on = siteOn;
        s.mode = mode;
        if (mode === "custom") {
          s.mapping = currentMapping;
        } else {
          delete s.mapping;
        }
      }
    }

    if (mode !== "custom") {
      data.global.mapping = currentMapping;
      updateMappingUI(data, siteData);
    }

    // 注意：这里【不能】重写 data.global.selectors。
    // popup 已不再提供选择器输入框（改由页面拾取器写入、或在 options 里手改），
    // data 是整份 settings 的拷件，不碰它即原样保留；
    // 早先那版用 els.selector*.value 无条件重建，元素一删就会把用户已有选择器清空。

    skipNextSync = true;
    const success = await Storage.set({ settings: data });
    if (success && tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "updateStyles", settings: data });
      } catch (e) {}
    }
  };

  const saveData = _saveDataCore;
  const saveDataDebounced = Utils.debounce(_saveDataCore, 150);

  // 事件绑定入口
  const bindEvents = () => {
    if (els.globalSwitch) {
      els.globalSwitch.addEventListener("change", () => {
        if (typeof siteData.on !== "boolean") els.siteSwitch.checked = els.globalSwitch.checked;
        saveData();
      });
    }
    if (els.siteSwitch) els.siteSwitch.addEventListener("change", saveData);
    els.modeRadios.forEach((r) => r.addEventListener("change", () => {
      updateMappingUI(data, siteData);
      saveData();
    }));

    els.selectorPickButtons.forEach((btn) =>
      btn.addEventListener("click", () => startSelectorPicker(btn.dataset.target)),
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) {
        if (skipNextSync) { skipNextSync = false; return; }
        refreshUI();
      }
    });

    els.selectors.forEach((input) => {
      const dropdown = input.closest(".setting-item").querySelector(".dropdown-list");
      input.addEventListener("input", () => {
        // 手动敲进来的字体名也即时预览：名字还没拼完整时 styleFor 返回空串，
        // 会落回界面字体，所以不会边打字边跳。
        applyInputFont(input);
        saveDataDebounced();
        renderDropdown(dropdown, input.value, input);
      });
      input.addEventListener("focus", () => {
        closeAllDropdowns();
        renderDropdown(dropdown, input.value, input);
      });
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".setting-item") || e.target.closest(".setting-label")) {
        closeAllDropdowns();
      }
    });

    document.querySelectorAll(".reset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.target;
        const input = Array.from(els.selectors).find((s) => s.dataset.key === key);
        if (input) {
          input.value = "";
          applyInputFont(input);
          saveData();
        }
      });
    });

    const openSettingsBtn = document.getElementById("open-settings");
    if (openSettingsBtn) {
      openSettingsBtn.onclick = () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL("options.html"));
      };
    }

    const btnSavePreset = document.getElementById("btn-save-preset");
    if (btnSavePreset) {
      btnSavePreset.addEventListener("click", () => {
        const presetInput = document.getElementById("new-preset-name");
        const time = new Date().toLocaleTimeString(I18n.localeTag, {
          hour: "2-digit",
          minute: "2-digit",
        });
        const name = presetInput.value.trim() || t("popup.schemes.defaultName", { time });
        const currentMapping = {};
        els.selectors.forEach((sel) => (currentMapping[sel.dataset.key] = sel.value));
        Storage.get(["schemes"]).then(async (res) => {
          const schemes = res.schemes || [];
          schemes.push({ name, mapping: currentMapping });
          await Storage.set({ schemes });
          presetInput.value = "";
          loadSchemes();
        });
      });
    }
  };

  // UI 辅助函数
  function updateMappingUI(data, siteData) {
    const checkedMode = document.querySelector('input[name="mode"]:checked');
    const mode = checkedMode ? checkedMode.value : "global";
    const isCustom = mode === "custom";

    const activeMapping = DataValidator.ensureMapping(isCustom ? siteData.mapping : data.global.mapping);

    els.selectors.forEach((input) => {
      input.value = activeMapping[input.dataset.key] || "";
      applyInputFont(input);
    });
  }

  // 输入框里显示的也是字体名，同样用它自身的字形渲染 ——
  // 选完不用切到页面上看效果。空值必须保持界面字体，
  // 否则 placeholder（「留空则不替换正文」）会被套成候选字体的样子。
  function applyInputFont(input) {
    if (input) FontPreview.apply(input, input.value);
  }

  // 列表项固定行高由 shared.js 的 DROPDOWN_ITEM_HEIGHT 定，必须与 popup.html 里
  // .dropdown-item 的 height 保持一致，否则虚拟列表的滚动换算会错位。

  function createFontItem(font, targetInput, listEl) {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    if (font === targetInput.value) item.classList.add("active");
    item.innerText = font;
    // 候选字体用它自身的字形渲染自己的名字，省掉一次「选完再切到页面看」的往返
    FontPreview.apply(item, font);
    // 部分字体名偏宽会被 ellipsis 截断，hover 时可看全名
    item.title = font;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      targetInput.value = font;
      applyInputFont(targetInput);
      saveData();
      listEl.style.display = "none";
      syncChevron(listEl);
    });
    return item;
  }

  // 箭头（.chevron-icon）跟着列表真实的开合状态翻转，见 popup.html 里那条注释。
  // 类挂在 .setting-item 上 —— .dropdown-list 是 .input-group 的兄弟，不是子节点。
  function syncChevron(listEl) {
    const item = listEl.closest(".setting-item");
    if (item) item.classList.toggle("dropdown-open", listEl.style.display === "block");
  }

  function closeAllDropdowns() {
    document.querySelectorAll(".dropdown-list").forEach((d) => {
      d.style.display = "none";
      syncChevron(d);
    });
  }

  function renderDropdown(listEl, filterText, targetInput) {
    const query = filterText.toLowerCase();
    const filtered = query
      ? allFonts.filter((f) => f.toLowerCase().includes(query))
      : allFonts.slice();

    VirtualList.render(listEl, filtered, (font) =>
      createFontItem(font, targetInput, listEl),
    );
    // 开还是关由 VirtualList 定（无命中时它会把列表收起来），箭头跟它的结论走。
    // 这里不能再补一句 display = "block"：那会让「筛不出结果」也弹出一个空框。
    syncChevron(listEl);
  }

  const loadSchemes = async () => {
    const res = await Storage.get(["schemes"]);
    renderSchemes(res.schemes || []);
  };

  const renderSchemes = (schemes) => {
    const presetContainer = document.getElementById("preset-container");
    if (!presetContainer) return;
    presetContainer.innerHTML = "";
    if (schemes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-tip";
      empty.textContent = t("popup.schemes.empty");
      presetContainer.appendChild(empty);
      return;
    }
    schemes.forEach((s, index) => {
      const item = document.createElement("div");
      item.className = "preset-item";
      const escapedName = document.createElement("span");
      escapedName.textContent = s.name;
      item.innerHTML = `<span class="name">${escapedName.innerHTML}</span><div class="preset-del" data-index="${index}" data-i18n-title="popup.schemes.deleteTitle" title="删除方案"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></div>`;
      // 行是重建出来的，属性文案得当场套一遍，否则会停在中文。
      I18n.localizePage(item);
      item.addEventListener("click", (e) => {
        if (e.target.closest(".preset-del")) return;
        applyScheme(s, item);
      });
      item.querySelector(".preset-del").addEventListener("click", (e) => {
        e.stopPropagation();
        const schemesCopy = [...schemes];
        schemesCopy.splice(index, 1);
        Storage.set({ schemes: schemesCopy }).then(loadSchemes);
      });
      presetContainer.appendChild(item);
    });
  };

  const applyScheme = (scheme, itemElement) => {
    const mapping = scheme.mapping || {};
    els.selectors.forEach((input) => {
      input.value = mapping[input.dataset.key] || "";
      applyInputFont(input);
    });
    saveData();
    if (itemElement) {
      document.querySelectorAll(".preset-item.applied").forEach((el) => el.classList.remove("applied"));
      itemElement.classList.add("applied");
      setTimeout(() => itemElement.classList.remove("applied"), 1500);
    }
  };

  function checkUpdates() {
    const currentVersion = chrome.runtime.getManifest().version;
    const verBadge = document.getElementById("popup-ver-badge");
    if (!verBadge) return;
    verBadge.innerText = "v " + currentVersion;
    chrome.storage.local.get(["latestRelease", "releaseUrl"], (res) => {
      if (res.latestRelease) {
        const parts1 = res.latestRelease.split('.').map(Number);
        const parts2 = currentVersion.split('.').map(Number);
        let isNew = false;
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
          const p1 = parts1[i] || 0;
          const p2 = parts2[i] || 0;
          if (p1 > p2) { isNew = true; break; }
          if (p1 < p2) { break; }
        }
        if (isNew) {
          verBadge.innerText = t("popup.version.badge");
          verBadge.className = "badge badge-update";
          verBadge.title = t("popup.version.newTitle", {
            version: res.latestRelease,
          });
          verBadge.onclick = () => window.open(res.releaseUrl || "https://github.com/Dnzzk2/PureRead/releases", "_blank");
        }
      }
    });
  }

  // 执行
  //
  // 语言分两步落地：I18n 加载时已把 locale 同步定成浏览器语言，所以这里立刻
  // 套一遍就不会先闪出中文；storage.local 里的偏好是异步读的，读到再整体重来。
  document.documentElement.lang = I18n.localeTag;
  I18n.localizePage();

  const applyLocale = () => {
    document.documentElement.lang = I18n.localeTag;
    I18n.localizePage();
    applyFontListHint();
    loadSchemes();
  };

  // 设置页改了语言 / 界面字体时，开着的 popup 也跟着换。
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.uiFont) UiFont.apply(changes.uiFont.newValue);
    if (!changes.uiLocale) return;
    I18n.applyPref(changes.uiLocale.newValue);
    applyLocale();
  });

  bindEvents();
  await I18n.ready;
  applyLocale();
  await init();
  loadSchemes();
});
