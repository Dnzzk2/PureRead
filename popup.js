// 使用 shared.js 中的 DEFAULT_MAPPING 和 DEFAULT_TYPO

document.addEventListener("DOMContentLoaded", async () => {
  const els = {
    globalSwitch: document.getElementById("global-switch"),
    siteSwitch: document.getElementById("site-switch"),
    modeRadios: document.querySelectorAll('input[name="mode"]'),
    domainDisplay: document.getElementById("domain-display"),
    mappingLabel: document.getElementById("mapping-label"),
    selectors: document.querySelectorAll(".font-input"),
    typoRanges: document.querySelectorAll(".style-range"),
    typoSwitch: document.getElementById("typo-switch"),
    typoCard: document.getElementById("typo-card"),
    loading: document.getElementById("loading-tip"),
    selectorStd: document.getElementById("selectors-standard"),
    selectorMono: document.getElementById("selectors-mono"),
    selectorMath: document.getElementById("selectors-math"),
    selectorExclude: document.getElementById("selectors-exclude"),
    selectorPickTarget: document.getElementById("selector-pick-target"),
    selectorPickButton: document.getElementById("selector-pick-button"),
    // 新功能
    progressSwitch: document.getElementById("progress-switch"),
    progressColor: document.getElementById("progress-color"),
    focusSwitch: document.getElementById("focus-switch"),
    darkSwitch: document.getElementById("dark-switch"),
    readtimeSwitch: document.getElementById("readtime-switch"),
    shortcutsSwitch: document.getElementById("shortcuts-enabled"),
    shortcutsConfigBtn: document.getElementById("configure-shortcuts"),
    domainDisplay: document.getElementById("domain-display")
  };

  // 核心变量
  let domain = "";
  let data = {};
  let siteData = {};
  let tab = null;
  let allFonts = [];
  let skipNextSync = false;
  let isRefreshing = false;

  const applySelectorCopy = () => {
    const panelTitle = document.querySelector(".selector-title span");
    if (panelTitle) panelTitle.textContent = "作用范围与排除";

    const labels = document.querySelectorAll(".selector-label");
    if (labels[0]) labels[0].textContent = "额外匹配 ・ 标准字体";
    if (labels[1]) labels[1].textContent = "额外匹配 ・ 代码 / 等宽";
    if (labels[2]) labels[2].textContent = "额外匹配 ・ 数学公式";
  };

  // 1. 初始化流程
  const PICK_TARGET_LABELS = {
    standard: "额外匹配 ・ 标准字体",
    mono: "额外匹配 ・ 代码 / 等宽",
    math: "额外匹配 ・ 数学公式",
    exclude: "排除替换 ・ 全局",
  };

  const startSelectorPicker = async () => {
    if (!tab?.id || !domain) return;

    // Use dataset.value (e.g., 'standard') instead of display text
    const target = els.selectorPickTarget?.dataset.value || "standard";
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

  const init = async () => {
    applySelectorCopy();
    const selectorLabels = document.querySelectorAll(".selector-label");
    if (selectorLabels[3]) selectorLabels[3].textContent = "排除替换 ・ 全局";
    if (els.selectorPickButton) els.selectorPickButton.textContent = "开始拾取";
    if (els.selectorPickTarget) {
      if (els.selectorPickTarget.options) {
        Array.from(els.selectorPickTarget.options).forEach((option) => {
          option.textContent = PICK_TARGET_LABELS[option.value] || option.textContent;
        });
      } else {
        // Handle custom input-based dropdown
        const val = els.selectorPickTarget.dataset.value || "standard";
        els.selectorPickTarget.value = PICK_TARGET_LABELS[val];
        els.selectorPickTarget.dataset.value = val;
      }
    }
    // 获取域名
    try {
      const [currentTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        currentTab &&
        currentTab.url &&
        !currentTab.url.startsWith("chrome://") &&
        !currentTab.url.startsWith("edge://")
      ) {
        domain = new URL(currentTab.url).hostname;
      }
      tab = currentTab;
    } catch (e) {
      console.error("[PureRead] 获取环境信息失败:", e.message);
    }
    if (els.domainDisplay) els.domainDisplay.innerText = domain || "不支持的页面";

    // 加载字体
    allFonts = await FontLoader.load();
    if (els.loading) els.loading.style.display = "none";

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
      if (
        rawSettings === undefined ||
        rawSettings === null ||
        typeof rawSettings !== "object" ||
        Array.isArray(rawSettings)
      ) {
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

      // 同步映射与样式
      updateMappingUI(data, siteData);
      updateTypoSwitchUI();

      // 同步补充选择器
      const selectors = DataValidator.ensureSelectors(data.global.selectors);
      if (els.selectorStd) els.selectorStd.value = selectors.include.standard || "";
      if (els.selectorMono) els.selectorMono.value = selectors.include.mono || "";
      if (els.selectorMath) els.selectorMath.value = selectors.include.math || "";
      if (els.selectorExclude) els.selectorExclude.value = selectors.exclude || "";

      // 同步阅读增强
      const features = data.global.features || {};
      const progressBar = features.progressBar || {
        enabled: false,
        color: "#10b981",
      };
      if (els.progressSwitch) els.progressSwitch.checked = progressBar.enabled;
      if (els.progressColor)
        els.progressColor.value = progressBar.color || "#10b981";
      if (els.focusSwitch)
        els.focusSwitch.checked = siteData.focusMode ?? false;
      if (els.darkSwitch) els.darkSwitch.checked = features.forceDark ?? false;
      if (els.readtimeSwitch)
        els.readtimeSwitch.checked = features.readingTime ?? false;

      // 同步快捷键
      const shortcutsEnabled = data.global.shortcutsEnabled !== false;
      if (els.shortcutsSwitch) {
        els.shortcutsSwitch.checked = shortcutsEnabled;
        const listContainer = document.getElementById(
          "shortcuts-list-container",
        );
        if (listContainer) {
          listContainer.style.opacity = shortcutsEnabled ? "1" : "0.5";
          listContainer.style.pointerEvents = shortcutsEnabled
            ? "auto"
            : "none";
        }
      }

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

    const currentTypo = {
      enabled: els.typoSwitch?.checked ?? false,
    };
    els.typoRanges.forEach((r) => {
      currentTypo[r.dataset.key] = r.value;
      updateTypoLabel(r);
    });

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
        s.typo = currentTypo;
      } else {
        delete s.mapping;
        delete s.typo;
      }
    }

    if (mode !== "custom") {
      data.global.mapping = currentMapping;
      data.global.typo = currentTypo;
      updateMappingUI(data, siteData);
    }

    data.global.selectors = {
      include: {
        standard: els.selectorStd?.value || "",
        mono: els.selectorMono?.value || "",
        math: els.selectorMath?.value || "",
      },
      exclude: els.selectorExclude?.value || "",
    };

    if (!data.global.features) data.global.features = {};
    data.global.features.progressBar = {
      enabled: els.progressSwitch?.checked ?? false,
      color: els.progressColor?.value || "#10b981",
    };

    if (domain && els.focusSwitch) {
      if (!data.sites[domain]) data.sites[domain] = {};
      data.sites[domain].focusMode = els.focusSwitch.checked;
      siteData.focusMode = els.focusSwitch.checked;
    }

    data.global.features.forceDark = els.darkSwitch?.checked ?? false;
    data.global.features.readingTime = els.readtimeSwitch?.checked ?? false;
    data.global.shortcutsEnabled = els.shortcutsSwitch?.checked ?? true;

    skipNextSync = true;
    const success = await Storage.set({ settings: data });
    if (success && tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "updateStyles", settings: data });
        await chrome.tabs.sendMessage(tab.id, { action: "updateFeatures", settings: data });
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

    els.typoRanges.forEach((r) => r.addEventListener("input", saveDataDebounced));
    if (els.typoSwitch) {
      els.typoSwitch.addEventListener("change", () => {
        els.typoCard.style.opacity = els.typoSwitch.checked ? "1" : "0.5";
        els.typoCard.style.pointerEvents = els.typoSwitch.checked ? "auto" : "none";
        saveData();
      });
    }

    if (els.selectorStd) els.selectorStd.addEventListener("input", saveDataDebounced);
    if (els.selectorMono) els.selectorMono.addEventListener("input", saveDataDebounced);
    if (els.selectorMath) els.selectorMath.addEventListener("input", saveDataDebounced);
    if (els.selectorExclude) els.selectorExclude.addEventListener("input", saveDataDebounced);
    if (els.selectorPickButton) els.selectorPickButton.addEventListener("click", startSelectorPicker);

    if (els.progressSwitch) els.progressSwitch.addEventListener("change", saveData);
    if (els.progressColor) els.progressColor.addEventListener("input", saveDataDebounced);
    if (els.focusSwitch) els.focusSwitch.addEventListener("change", saveData);
    if (els.darkSwitch) els.darkSwitch.addEventListener("change", saveData);
    if (els.readtimeSwitch) els.readtimeSwitch.addEventListener("change", saveData);

    if (els.shortcutsSwitch) {
      els.shortcutsSwitch.addEventListener("change", () => {
        const isEnabled = els.shortcutsSwitch.checked;
        const listContainer = document.getElementById("shortcuts-list-container");
        if (listContainer) {
          listContainer.style.opacity = isEnabled ? "1" : "0.5";
          listContainer.style.pointerEvents = isEnabled ? "auto" : "none";
        }
        saveData();
      });
    }
    if (els.shortcutsConfigBtn) {
      els.shortcutsConfigBtn.addEventListener("click", () => {
        const isEdge = navigator.userAgent.includes("Edg/");
        const url = isEdge ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts";
        chrome.tabs.create({ url });
      });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) {
        if (skipNextSync) { skipNextSync = false; return; }
        refreshUI();
      }
    });

    els.selectors.forEach((input) => {
      const dropdown = input.closest(".setting-item").querySelector(".dropdown-list");
      input.addEventListener("input", () => {
        saveDataDebounced();
        renderDropdown(dropdown, input.value, input);
      });
      input.addEventListener("focus", () => {
        document.querySelectorAll(".dropdown-list").forEach((d) => (d.style.display = "none"));
        renderDropdown(dropdown, input.value, input);
        dropdown.style.display = "block";
      });
    });

    const pickTargetDropdown = document.getElementById("selector-pick-dropdown");
    if (els.selectorPickTarget && pickTargetDropdown) {
      els.selectorPickTarget.addEventListener("click", () => {
        document.querySelectorAll(".dropdown-list").forEach((d) => (d.style.display = "none"));
        renderPickTargetDropdown(pickTargetDropdown, els.selectorPickTarget);
      });
    }

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".setting-item") || e.target.closest(".setting-label")) {
        document.querySelectorAll(".dropdown-list").forEach((d) => (d.style.display = "none"));
      }
    });

    document.querySelectorAll(".reset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.target;
        const input = Array.from(els.selectors).find((s) => s.dataset.key === key);
        if (input) { input.value = ""; saveData(); }
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
        const name = presetInput.value.trim() || `方案 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        const currentMapping = {};
        els.selectors.forEach((sel) => (currentMapping[sel.dataset.key] = sel.value));
        const currentTypo = {};
        els.typoRanges.forEach((r) => (currentTypo[r.dataset.key] = r.value));
        Storage.get(["schemes"]).then(async (res) => {
          const schemes = res.schemes || [];
          schemes.push({ name, mapping: currentMapping, typo: currentTypo });
          await Storage.set({ schemes });
          presetInput.value = "";
          loadSchemes();
        });
      });
    }
  };

  // UI 辅助函数
  function updateTypoLabel(input) {
    const key = input.dataset.key;
    const val = input.value;
    const labelMap = { lineHeight: "lh-val", fontSize: "fs-val", fontWeight: "fw-val" };
    const el = document.getElementById(labelMap[key]);
    if (el) {
      if (key === "fontSize") el.innerText = val + "%";
      else if (key === "fontWeight") el.innerText = (val > 0 ? "+" : "") + val;
      else el.innerText = val;
    }
  }

  function updateTypoSwitchUI() {
    const checkedMode = document.querySelector('input[name="mode"]:checked');
    const isCustom = checkedMode && checkedMode.value === "custom";
    const activeTypo = DataValidator.ensureTypo((isCustom ? siteData.typo : data.global.typo) || DEFAULT_TYPO);
    if (els.typoSwitch) {
      els.typoSwitch.checked = activeTypo.enabled === true;
      els.typoCard.style.opacity = els.typoSwitch.checked ? "1" : "0.5";
      els.typoCard.style.pointerEvents = els.typoSwitch.checked ? "auto" : "none";
    }
  }

  function updateMappingUI(data, siteData) {
    const checkedMode = document.querySelector('input[name="mode"]:checked');
    const mode = checkedMode ? checkedMode.value : "global";
    const isCustom = mode === "custom";
    if (els.mappingLabel) els.mappingLabel.innerText = isCustom ? "当前站点定制" : "全局通用设置";

    const activeMapping = DataValidator.ensureMapping(isCustom ? siteData.mapping : data.global.mapping);
    const activeTypo = DataValidator.ensureTypo((isCustom ? siteData.typo : data.global.typo) || DEFAULT_TYPO);

    els.selectors.forEach((input) => {
      input.value = activeMapping[input.dataset.key] || "";
    });
    els.typoRanges.forEach((r) => {
      r.value = activeTypo[r.dataset.key] || DEFAULT_TYPO[r.dataset.key];
      updateTypoLabel(r);
    });
  }

  function renderPickTargetDropdown(listEl, targetInput) {
    listEl.innerHTML = "";
    Object.keys(PICK_TARGET_LABELS).forEach((key) => {
      const label = PICK_TARGET_LABELS[key];
      const item = document.createElement("div");
      item.className = "dropdown-item";
      if (targetInput.dataset.value === key) item.classList.add("active");
      item.innerText = label;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        targetInput.value = label;
        targetInput.dataset.value = key;
        listEl.style.display = "none";
      });
      listEl.appendChild(item);
    });
    listEl.style.display = "block";
  }

  function renderDropdown(listEl, filterText, targetInput) {
    listEl.innerHTML = "";
    const filtered = allFonts.filter((f) => f.toLowerCase().includes(filterText.toLowerCase()) || filterText === "");
    if (filtered.length === 0) { listEl.style.display = "none"; return; }
    filtered.forEach((font) => {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      if (font === targetInput.value) item.classList.add("active");
      item.innerText = font;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        targetInput.value = font;
        saveData();
        listEl.style.display = "none";
      });
      listEl.appendChild(item);
    });
    listEl.style.display = "block";
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
      presetContainer.innerHTML = '<div class="empty-tip">暂无保存的方案</div>';
      return;
    }
    schemes.forEach((s, index) => {
      const item = document.createElement("div");
      item.className = "preset-item";
      const escapedName = document.createElement("span");
      escapedName.textContent = s.name;
      item.innerHTML = `<span class="name">${escapedName.innerHTML}</span><div class="preset-del" data-index="${index}" title="删除方案"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></div>`;
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
    els.selectors.forEach((input) => { input.value = scheme.mapping[input.dataset.key] || ""; });
    els.typoRanges.forEach((r) => { r.value = scheme.typo[r.dataset.key] || DEFAULT_TYPO[r.dataset.key]; updateTypoLabel(r); });
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
    verBadge.innerText = "v" + currentVersion;
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
          verBadge.innerText = "↑ 更新版本";
          verBadge.className = "badge badge-update";
          verBadge.title = "有新版本可更新: v" + res.latestRelease;
          verBadge.onclick = () => window.open(res.releaseUrl || "https://github.com/Dnzzk2/PureRead/releases", "_blank");
        }
      }
    });
  }

  // 执行
  bindEvents();
  await init();
  loadSchemes();
});
