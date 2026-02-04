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
  };

  // 安全获取当前域名
  let domain = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://")) {
      domain = new URL(tab.url).hostname;
    }
  } catch (e) {
    console.error("[PureRead] 获取域名失败:", e.message);
  }
  els.domainDisplay.innerText = domain || "不支持的页面";

  let allFonts = []; // 全局字体列表

  // 使用公共模块加载字体
  allFonts = await FontLoader.load();
  els.loading.style.display = "none";

  // 使用公共模块读取存储
  const result = await Storage.get(["settings"]);
  let data = DataValidator.ensureSettings(result.settings);

  // 初始化时获取站点数据，但不立即存入 data.sites，除非用户修改
  const siteData = DataValidator.ensureSiteData(data.sites[domain]);

  // 获取 tab 用于后续发送消息
  let tab = null;
  try {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = currentTab;
  } catch (e) {
    console.error("[PureRead] 获取 tab 失败:", e.message);
  }

  // 初始渲染
  const sliders = document.querySelectorAll(".slider, .selection-bar");
  sliders.forEach((s) => (s.style.transition = "none"));

  const isGlobalOn = data.global.on !== false;
  els.globalSwitch.checked = isGlobalOn;

  // 页面开关：如果 siteData.on 有值则用，否则跟随总开关
  els.siteSwitch.checked = (typeof siteData.on === "boolean") ? siteData.on : isGlobalOn;
  const activeModeInput = document.querySelector(
    `input[name="mode"][value="${siteData.mode}"]`,
  );
  if (activeModeInput) activeModeInput.checked = true;

  updateMappingUI(data, siteData);
  updateTypoSwitchUI();

  // 载入补充选择器
  const selectors = DataValidator.ensureSelectors(data.global.selectors);
  if (els.selectorStd) els.selectorStd.value = selectors.standard || "";
  if (els.selectorMono) els.selectorMono.value = selectors.mono || "";
  if (els.selectorMath) els.selectorMath.value = selectors.math || "";

  setTimeout(() => sliders.forEach((s) => (s.style.transition = "")), 50);

  // 核心保存逻辑
  const _saveDataCore = async () => {
    const globalOn = els.globalSwitch.checked;
    const siteOn = els.siteSwitch.checked;
    const checkedMode = document.querySelector('input[name="mode"]:checked');
    const mode = checkedMode ? checkedMode.value : "global";

    data.global.on = globalOn;

    const currentMapping = {};
    els.selectors.forEach(
      (sel) => (currentMapping[sel.dataset.key] = sel.value),
    );

    const currentTypo = {
      enabled: els.typoSwitch.checked,
    };
    els.typoRanges.forEach((r) => {
      currentTypo[r.dataset.key] = r.value;
      updateTypoLabel(r);
    });

    // 核心改进：判断是否需要保留站点特定配置
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

    // 保存补充选择器（全局）
    data.global.selectors = {
      standard: els.selectorStd ? els.selectorStd.value : "",
      mono: els.selectorMono ? els.selectorMono.value : "",
      math: els.selectorMath ? els.selectorMath.value : "",
    };

    // 使用公共模块保存
    const success = await Storage.set({ settings: data });
    if (success && tab && tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateStyles",
          settings: data,
        });
      } catch (e) {
        // 页面可能不支持消息
      }
    }
  };

  // 立即保存（用于开关切换等需要即时响应的操作）
  const saveData = _saveDataCore;

  // 防抖保存（用于滑块拖动、输入框输入等高频操作）
  const saveDataDebounced = Utils.debounce(_saveDataCore, 150);


  const openSettingsBtn = document.getElementById("open-settings");
  if (openSettingsBtn) {
    openSettingsBtn.onclick = () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("options.html"));
      }
    };
  }

  // 移除已转移到 Options 的逻辑
  const btnResetSites = document.getElementById("btn-reset-sites");
  if (btnResetSites) {
    btnResetSites.onclick = () => {
      if (confirm("确定清空所有特定站点的自定义配置吗？")) {
        data.sites = {};
        saveData();
        window.location.reload();
      }
    };
  }

  function updateTypoLabel(input) {
    const key = input.dataset.key;
    const val = input.value;
    const labelMap = {
      lineHeight: "lh-val",
      fontSize: "fs-val",
      fontWeight: "fw-val",
    };
    const el = document.getElementById(labelMap[key]);
    if (el) {
      if (key === "fontSize") el.innerText = val + "%";
      else if (key === "fontWeight")
        el.innerText = (val > 0 ? "+" : "") + val;
      else el.innerText = val;
    }
  }

  function updateTypoSwitchUI() {
    const checkedMode = document.querySelector('input[name="mode"]:checked');
    const isCustom = checkedMode && checkedMode.value === "custom";
    const activeTypo =
      (isCustom ? siteData.typo : data.global.typo) || DEFAULT_TYPO;
    els.typoSwitch.checked = activeTypo.enabled !== false;
    els.typoCard.style.opacity = els.typoSwitch.checked ? "1" : "0.5";
    els.typoCard.style.pointerEvents = els.typoSwitch.checked
      ? "auto"
      : "none";
  }

  // 事件绑定
  els.globalSwitch.addEventListener("change", () => {
    if (typeof siteData.on !== "boolean") {
      els.siteSwitch.checked = els.globalSwitch.checked;
    }
    saveData();
  });

  els.siteSwitch.addEventListener("change", () => {
    saveData();
  });
  els.modeRadios.forEach((r) =>
    r.addEventListener("change", () => {
      updateMappingUI(data, siteData);
      saveData();
    }),
  );

  // 滑块使用防抖处理（高频拖动）
  els.typoRanges.forEach((r) => r.addEventListener("input", saveDataDebounced));
  els.typoSwitch.addEventListener("change", () => {
    els.typoCard.style.opacity = els.typoSwitch.checked ? "1" : "0.5";
    els.typoCard.style.pointerEvents = els.typoSwitch.checked
      ? "auto"
      : "none";
    saveData(); // 开关用立即保存
  });

  // 选择器输入框使用防抖处理
  if (els.selectorStd) els.selectorStd.addEventListener("input", saveDataDebounced);
  if (els.selectorMono) els.selectorMono.addEventListener("input", saveDataDebounced);
  if (els.selectorMath) els.selectorMath.addEventListener("input", saveDataDebounced);

  // 输入框交互增强
  els.selectors.forEach((input) => {
    const dropdown = input
      .closest(".setting-item")
      .querySelector(".dropdown-list");
    input.addEventListener("input", () => {
      saveDataDebounced(); // 使用防抖
      renderDropdown(dropdown, input.value, input);
    });
    input.addEventListener("focus", () => {
      document
        .querySelectorAll(".dropdown-list")
        .forEach((d) => (d.style.display = "none"));
      renderDropdown(dropdown, input.value, input);
      dropdown.style.display = "block";
    });
  });

  // 点击空白处或标签关闭下拉
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".setting-item") ||
      e.target.closest(".setting-label")
    ) {
      document
        .querySelectorAll(".dropdown-list")
        .forEach((d) => (d.style.display = "none"));
    }
  });

  // 重置按钮
  document.querySelectorAll(".reset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.target;
      const input = Array.from(els.selectors).find(
        (s) => s.dataset.key === key,
      );
      if (input) {
        input.value = "";
        saveData();
      }
    });
  });

  function updateMappingUI(data, siteData) {
    const checkedMode = document.querySelector('input[name="mode"]:checked');
    const mode = checkedMode ? checkedMode.value : "global";
    const isCustom = mode === "custom";
    els.mappingLabel.innerText = isCustom ? "当前站点定制" : "全局通用设置";

    const activeMapping = isCustom ? siteData.mapping : data.global.mapping;
    const activeTypo =
      (isCustom ? siteData.typo : data.global.typo) || DEFAULT_TYPO;

    els.selectors.forEach((input) => {
      input.value = activeMapping[input.dataset.key] || "";
    });

    els.typoRanges.forEach((r) => {
      r.value = activeTypo[r.dataset.key] || DEFAULT_TYPO[r.dataset.key];
      updateTypoLabel(r);
    });
  }

  // 方案预设逻辑
  const presetContainer = document.getElementById("preset-container");
  const presetInput = document.getElementById("new-preset-name");
  const btnSavePreset = document.getElementById("btn-save-preset");

  const loadSchemes = () => {
    chrome.storage.sync.get(["schemes"], (res) => {
      const schemes = res.schemes || [];
      renderSchemes(schemes);
    });
  };

  const renderSchemes = (schemes) => {
    presetContainer.innerHTML = "";
    if (schemes.length === 0) {
      presetContainer.innerHTML =
        '<div class="empty-tip">暂无保存的方案</div>';
      return;
    }

    schemes.forEach((s, index) => {
      const item = document.createElement("div");
      item.className = "preset-item";
      item.innerHTML = `
        <span class="name">${s.name}</span>
        <div class="preset-del" data-index="${index}" title="删除方案">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </div>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".preset-del")) return;
        applyScheme(s, item);
      });

      item.querySelector(".preset-del").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteScheme(index);
      });

      presetContainer.appendChild(item);
    });
  };

  const applyScheme = (scheme, itemElement) => {
    els.selectors.forEach((input) => {
      input.value = scheme.mapping[input.dataset.key] || "";
    });
    els.typoRanges.forEach((r) => {
      r.value = scheme.typo[r.dataset.key] || DEFAULT_TYPO[r.dataset.key];
      updateTypoLabel(r);
    });
    saveData();

    if (itemElement) {
      document.querySelectorAll('.preset-item.applied').forEach(el => {
        el.classList.remove('applied');
      });
      itemElement.classList.add('applied');
      setTimeout(() => {
        itemElement.classList.remove('applied');
      }, 1500);
    }
  };

  const deleteScheme = (index) => {
    chrome.storage.sync.get(["schemes"], (res) => {
      const schemes = res.schemes || [];
      schemes.splice(index, 1);
      chrome.storage.sync.set({ schemes }, loadSchemes);
    });
  };

  btnSavePreset.addEventListener("click", () => {
    const name =
      presetInput.value.trim() ||
      `方案 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const currentMapping = {};
    els.selectors.forEach(
      (sel) => (currentMapping[sel.dataset.key] = sel.value),
    );

    const currentTypo = {};
    els.typoRanges.forEach((r) => (currentTypo[r.dataset.key] = r.value));

    chrome.storage.sync.get(["schemes"], (res) => {
      const schemes = res.schemes || [];
      schemes.push({ name, mapping: currentMapping, typo: currentTypo });
      chrome.storage.sync.set({ schemes }, () => {
        presetInput.value = "";
        loadSchemes();
      });
    });
  });

  loadSchemes();

  // 渲染自定义下拉列表
  function renderDropdown(listEl, filterText, targetInput) {
    listEl.innerHTML = "";
    const filtered = allFonts.filter(
      (f) =>
        f.toLowerCase().includes(filterText.toLowerCase()) ||
        filterText === "",
    );

    if (filtered.length === 0) {
      listEl.style.display = "none";
      return;
    }

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
});
