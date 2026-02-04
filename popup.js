const DEFAULT_MAPPING = {
  standard: "",
  mono: "",
  math: "",
};

const DEFAULT_TYPO = {
  enabled: true,
  lineHeight: "1.6",
  fontSize: "100",
  fontWeight: "0",
};

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

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = new URL(tab.url).hostname;
  els.domainDisplay.innerText = domain;

  let allFonts = []; // 全局字体列表

  // 初始化字体加载
  await loadSystemFonts(els);

  chrome.storage.sync.get(["settings"], (result) => {
    let data = result.settings || {
      global: {
        on: true,
        mapping: { ...DEFAULT_MAPPING },
        typo: { ...DEFAULT_TYPO },
      },
      sites: {},
    };

    if (!data.sites[domain]) {
      data.sites[domain] = {
        on: true,
        mode: "global",
        mapping: { ...DEFAULT_MAPPING },
        typo: { ...DEFAULT_TYPO },
      };
    }

    const siteData = data.sites[domain];

    // 初始渲染
    const sliders = document.querySelectorAll(".slider, .selection-bar");
    sliders.forEach((s) => (s.style.transition = "none"));

    els.globalSwitch.checked = data.global.on !== false;
    els.siteSwitch.checked = siteData.on !== false;
    const activeModeInput = document.querySelector(
      `input[name="mode"][value="${siteData.mode}"]`,
    );
    if (activeModeInput) activeModeInput.checked = true;

    updateMappingUI(data, siteData);
    updateTypoSwitchUI();

    // 载入补充选择器
    const selectors = data.global.selectors || {
      standard: "",
      mono: "",
      math: "",
    };
    if (typeof selectors === "string") {
      if (els.selectorStd) els.selectorStd.value = selectors;
    } else {
      if (els.selectorStd) els.selectorStd.value = selectors.standard || "";
      if (els.selectorMono) els.selectorMono.value = selectors.mono || "";
      if (els.selectorMath) els.selectorMath.value = selectors.math || "";
    }

    setTimeout(() => sliders.forEach((s) => (s.style.transition = "")), 50);

    // 实时保存并广播消息
    const saveData = () => {
      data.global.on = els.globalSwitch.checked;
      siteData.on = els.siteSwitch.checked;
      const checkedMode = document.querySelector('input[name="mode"]:checked');
      siteData.mode = checkedMode ? checkedMode.value : "global";

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

      if (siteData.mode === "custom") {
        siteData.mapping = currentMapping;
        siteData.typo = currentTypo;
      } else {
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

      data.sites[domain] = siteData;
      chrome.storage.sync.set({ settings: data }, () => {
        chrome.tabs.sendMessage(tab.id, {
          action: "updateStyles",
          settings: data,
        });
      });
    };

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
    els.globalSwitch.addEventListener("change", saveData);
    els.siteSwitch.addEventListener("change", saveData);
    els.modeRadios.forEach((r) =>
      r.addEventListener("change", () => {
        updateMappingUI(data, siteData);
        saveData();
      }),
    );

    els.typoRanges.forEach((r) => r.addEventListener("input", saveData));
    els.typoSwitch.addEventListener("change", () => {
      // 直接根据开关状态更新 UI 外观
      els.typoCard.style.opacity = els.typoSwitch.checked ? "1" : "0.5";
      els.typoCard.style.pointerEvents = els.typoSwitch.checked
        ? "auto"
        : "none";
      saveData();
    });

    if (els.selectorStd) els.selectorStd.addEventListener("input", saveData);
    if (els.selectorMono) els.selectorMono.addEventListener("input", saveData);
    if (els.selectorMath) els.selectorMath.addEventListener("input", saveData);

    // 输入框交互增强
    els.selectors.forEach((input) => {
      const dropdown = input
        .closest(".setting-item")
        .querySelector(".dropdown-list");
      input.addEventListener("input", () => {
        saveData();
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
          applyScheme(s);
        });

        item.querySelector(".preset-del").addEventListener("click", (e) => {
          e.stopPropagation();
          deleteScheme(index);
        });

        presetContainer.appendChild(item);
      });
    };

    const applyScheme = (scheme) => {
      // 应用方案到当前 mapping 和 typo
      els.selectors.forEach((input) => {
        input.value = scheme.mapping[input.dataset.key] || "";
      });
      els.typoRanges.forEach((r) => {
        r.value = scheme.typo[r.dataset.key] || DEFAULT_TYPO[r.dataset.key];
        updateTypoLabel(r);
      });
      saveData();
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

  async function loadSystemFonts(els) {
    els.loading.style.display = "block";

    // 降级字体列表
    const FALLBACK_FONTS = [
      "Microsoft YaHei",
      "SimSun",
      "Arial",
      "Consolas",
      "PingFang SC",
      "Hiragino Sans GB",
    ];

    try {
      // 1. 尝试读取缓存
      const cached = await chrome.storage.local.get("fontCache");
      if (cached.fontCache && cached.fontCache.length > 0) {
        allFonts = cached.fontCache;
        els.loading.style.display = "none";
      }

      // 2. 检查 API 是否存在 (适配 Firefox 或权限受限环境)
      if (!chrome.fontSettings) {
        throw new Error("API_NOT_SUPPORTED");
      }

      chrome.fontSettings.getFontList((fonts) => {
        const fontNames = [...new Set(fonts.map((f) => f.fontId))].sort();
        allFonts = fontNames;
        chrome.storage.local.set({ fontCache: fontNames });
        els.loading.style.display = "none";
      });
    } catch (e) {
      console.warn("字体获取采用降级方案:", e.message);
      allFonts = FALLBACK_FONTS;
      els.loading.style.display = "none";
    }
  }
});
