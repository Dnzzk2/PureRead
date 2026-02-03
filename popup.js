// 默认配置
const DEFAULT_MAPPING = {
  standard: "系统默认",
  mono: "系统默认",
  math: "系统默认",
};

document.addEventListener("DOMContentLoaded", async () => {
  const els = {
    globalSwitch: document.getElementById("global-switch"),
    siteSwitch: document.getElementById("site-switch"),
    modeRadios: document.querySelectorAll('input[name="mode"]'),
    domainDisplay: document.getElementById("domain-display"),
    mappingLabel: document.getElementById("mapping-label"),
    selectors: document.querySelectorAll(".font-sel"),
    loading: document.getElementById("loading-tip"),
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = new URL(tab.url).hostname;
  els.domainDisplay.innerText = domain;

  await loadSystemFonts(els);

  chrome.storage.sync.get(["settings"], (result) => {
    let data = result.settings || {
      global: { on: true, mapping: { ...DEFAULT_MAPPING } },
      sites: {},
    };

    if (!data.sites[domain]) {
      data.sites[domain] = {
        on: true,
        mode: "global",
        mapping: { ...DEFAULT_MAPPING },
      };
    }

    const siteData = data.sites[domain];

    // 初始渲染 (确保开关默认状态正确)
    // 暂时禁用动画以防打开时“闪现滚动”
    const sliders = document.querySelectorAll(".slider, .selection-bar");
    sliders.forEach((s) => (s.style.transition = "none"));

    els.globalSwitch.checked = data.global.on !== false; // 默认为 true
    els.siteSwitch.checked = siteData.on !== false; // 默认为 true
    document.querySelector(
      `input[name="mode"][value="${siteData.mode}"]`,
    ).checked = true;
    updateMappingUI(data, siteData);

    // 状态应用后恢复动画
    requestAnimationFrame(() => {
      setTimeout(() => {
        sliders.forEach((s) => (s.style.transition = ""));
      }, 50);
    });

    // 实时保存并广播消息
    const saveData = () => {
      data.global.on = els.globalSwitch.checked;
      siteData.on = els.siteSwitch.checked;
      siteData.mode = document.querySelector(
        'input[name="mode"]:checked',
      ).value;

      const currentMapping = {};
      els.selectors.forEach(
        (sel) => (currentMapping[sel.dataset.key] = sel.value),
      );

      if (siteData.mode === "custom") {
        siteData.mapping = currentMapping;
      } else {
        data.global.mapping = currentMapping;
        // 如果是全局模式，同步 UI
        updateMappingUI(data, siteData);
      }

      data.sites[domain] = siteData;
      chrome.storage.sync.set({ settings: data }, () => {
        // 通过消息机制通知当前 Tab 实时更新样式
        chrome.tabs.sendMessage(tab.id, {
          action: "updateStyles",
          settings: data,
        });
      });
    };

    // 事件绑定
    els.globalSwitch.addEventListener("change", saveData);
    els.siteSwitch.addEventListener("change", saveData);
    els.modeRadios.forEach((r) =>
      r.addEventListener("change", () => {
        updateMappingUI(data, siteData);
        saveData();
      }),
    );
    els.selectors.forEach((sel) => sel.addEventListener("change", saveData));

    // 重置按钮监听
    document.querySelectorAll(".reset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.target;
        const selector = Array.from(els.selectors).find(
          (s) => s.dataset.key === key,
        );
        if (selector) {
          selector.value = "系统默认";
          saveData();
        }
      });
    });

    function updateMappingUI(data, siteData) {
      const mode = document.querySelector('input[name="mode"]:checked').value;
      const isCustom = mode === "custom";
      els.mappingLabel.innerText = isCustom ? "当前站点定制" : "全局通用设置";
      const activeMapping = isCustom ? siteData.mapping : data.global.mapping;
      els.selectors.forEach((sel) => {
        if (activeMapping[sel.dataset.key]) {
          sel.value = activeMapping[sel.dataset.key];
        }
      });
    }
  });
});

// 核心功能：获取本地字体
async function loadSystemFonts(els) {
  els.loading.style.display = "block";

  try {
    // 1. 尝试从本地缓存读取（加快二次打开速度）
    const cached = await chrome.storage.local.get("fontCache");
    if (cached.fontCache && cached.fontCache.length > 0) {
      renderFontOptions(els, cached.fontCache);
      els.loading.style.display = "none"; // 缓存加载后立即隐藏
    }

    // 2. 使用扩展原生 API 获取字体（无需用户手动点击授权，无弹窗）
    chrome.fontSettings.getFontList((fonts) => {
      // 提取名称并去重排序
      const fontNames = [...new Set(fonts.map((f) => f.fontId))].sort();

      // 更新缓存
      chrome.storage.local.set({ fontCache: fontNames });

      // 渲染
      renderFontOptions(els, fontNames);

      els.loading.style.display = "none"; // API 加载后隐藏
    });
  } catch (e) {
    console.error("字体获取失败", e);
    const fallback = [
      "系统默认",
      "Microsoft YaHei",
      "SimSun",
      "Arial",
      "Consolas",
    ];
    renderFontOptions(els, fallback);
    els.loading.style.display = "none"; // 失败也隐藏
  }
}

// 辅助渲染函数
function renderFontOptions(els, fontNames) {
  const list = fontNames.includes("系统默认")
    ? fontNames
    : ["系统默认", ...fontNames];
  els.selectors.forEach((sel) => {
    const currentVal = sel.value;
    sel.innerHTML = "";
    list.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.innerText = name;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  });
}
