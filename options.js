// 全局变量
let allSchemes = [];
let allSettings = {};
let allFonts = []; // 系统字体列表
// 检测到的新版本 { version, url }，没有就是 null。
// 存下来是因为界面语言一换，localizePage() 会把按钮文案冲回默认值，
// 得靠这个再画一遍，见 applyUpdateState()。
let pendingUpdate = null;

function escapeHTML(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// i18n 简写。模板可信、替换值不可信：t() 进 textContent，tHtml() 进 innerHTML。
const t = (key, subs) => I18n.t(key, subs);
const tHtml = (key, subs) => I18n.tHtml(key, subs);

// ═══ 界面语言 ═══

// 本页既写 uiLocale 又监听 storage.onChanged，写的时候要先置位跳过自己的回声。
let skipNextLocaleSync = false;

const LOCALE_VALUES = ["auto", "zh_CN", "en"];

const localeTrigger = () => document.getElementById("ui-locale-trigger");
const localeList = () => document.getElementById("ui-locale-list");
const localeItems = () =>
  Array.from(document.querySelectorAll("#ui-locale-list .dropdown-item"));

// 自绘下拉取代了原来的原生 <select>：原生 option 菜单的样式改不动，
// 跟 popup 那张（.dropdown-list/.dropdown-item）对不齐。
// 触发器上的字随选中项变化，所以一律由这里现写、不挂 data-i18n ——
// 否则 localizePage 会把它冲回「跟随浏览器」，切了语言也看不出选中的是哪一项。
// 与 modal 两个按钮是同一个理由。
function syncLocaleTrigger() {
  const label = document.getElementById("ui-locale-value");
  if (!label) return;

  const pref = I18n.pref;
  let text = "";
  localeItems().forEach((item) => {
    const active = item.dataset.value === pref;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", active ? "true" : "false");
    if (active) text = item.textContent.trim();
  });
  label.textContent = text;
}

function closeLocaleList() {
  const list = localeList();
  const trigger = localeTrigger();
  if (!list || list.style.display !== "block") return;
  list.style.display = "none";
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

// 把 fixed 定位的列表摆到触发器正下方。放不下就翻到上方。
// 列表本身挂在 <body> 上，所以这里一律用视口坐标（getBoundingClientRect）。
function placeLocaleList() {
  const list = localeList();
  const trigger = localeTrigger();
  if (!list || !trigger || list.style.display !== "block") return;

  const r = trigger.getBoundingClientRect();
  const gap = 6;
  list.style.left = `${Math.round(r.left)}px`;
  list.style.width = `${Math.round(r.width)}px`;

  const listH = list.offsetHeight;
  const fitsBelow = r.bottom + gap + listH <= window.innerHeight;
  const fitsAbove = r.top - gap - listH >= 0;
  list.style.top =
    !fitsBelow && fitsAbove
      ? `${Math.round(r.top - gap - listH)}px`
      : `${Math.round(r.bottom + gap)}px`;
}

function openLocaleList() {
  const list = localeList();
  const trigger = localeTrigger();
  if (!list || !trigger) return;
  list.style.display = "block";
  trigger.setAttribute("aria-expanded", "true");
  placeLocaleList();
}

// i18n 就绪后套用当前语言。只做「外壳」：属性、静态文案、下拉回填。
// localizePage 必须排在 syncLocaleTrigger 之前 —— 「跟随浏览器」这一项的
// 文案本身也要翻译，触发器要从翻译后的文本里取字。
function applyLocale() {
  document.documentElement.lang = I18n.localeTag;
  I18n.localizePage();
  syncLocaleTrigger();
}

// 语言一变，动态渲染出来的行（方案名、站点徽章、存储占用条）都得重画一遍，
// 更新提示同理 —— 它也是 JS 填的字，不重画就会退回 localizePage() 给的默认文案。
function rerenderLocalized() {
  renderSchemes(allSchemes);
  renderSites(allSettings.sites || {});
  updateStorageInfo();
  applyUpdateState();
}

function bindLocaleSwitcher() {
  const trigger = localeTrigger();
  const list = localeList();
  if (!trigger || !list) return;

  // 列表挪到 <body> 下。留在卡片里的话，.section 的 overflow: hidden 会裁掉它，
  // 而且入场动画的 transform（fill: both，终帧 translateY(0)）让卡片成了
  // 「固定定位的包含块」，连 position: fixed 也照样被裁 —— 所以必须搬出来。
  document.body.appendChild(list);

  const choose = (value) => {
    closeLocaleList();
    trigger.focus();
    if (!LOCALE_VALUES.includes(value) || value === I18n.pref) return;
    skipNextLocaleSync = true;
    I18n.setPref(value);
    applyLocale();
    rerenderLocalized();
  };

  trigger.addEventListener("click", () => {
    if (list.style.display === "block") {
      closeLocaleList();
      return;
    }
    openLocaleList();
    // 展开时把焦点交给当前项，键盘用户就能直接上下选。
    const items = localeItems();
    const active = items.find((i) => i.classList.contains("active"));
    (active || items[0])?.focus();
  });

  list.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (item) choose(item.dataset.value);
  });

  // 列表里接管方向键 / Enter / Esc / Tab，补回原生 <select> 被换掉后
  // 消失的键盘操作。
  list.addEventListener("keydown", (e) => {
    const items = localeItems();
    const at = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length].focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (at >= 0) choose(items[at].dataset.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeLocaleList();
      trigger.focus();
    } else if (e.key === "Tab") {
      closeLocaleList();
    }
  });

  // 点组件之外收起，与 popup 那个 document 级监听同一套手感。
  // 列表已挂到 body 上，不再是 .lang-dropdown 的后代，所以要单独放行。
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".lang-dropdown") && !e.target.closest("#ui-locale-list")) {
      closeLocaleList();
    }
  });

  // fixed 定位不会跟着页面滚，滚动/改窗口大小时跟着触发器重摆一次。
  window.addEventListener("scroll", placeLocaleList, { passive: true });
  window.addEventListener("resize", placeLocaleList);

  // 另一处界面（popup）改了语言时跟上。
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.uiLocale) return;
    if (skipNextLocaleSync) {
      skipNextLocaleSync = false;
      return;
    }
    I18n.applyPref(changes.uiLocale.newValue);
    applyLocale();
    rerenderLocalized();
  });
}

async function init() {
  // 先按浏览器语言同步套一遍，英文界面就不会闪一下中文；
  // 落盘的偏好是异步读的，读到后由下面的 applyLocale 覆盖。
  applyLocale();

  bindGlobalEvents();
  bindLocaleSwitcher();

  await I18n.ready;
  applyLocale();

  await loadSystemFonts();
  loadData();
  updateStorageInfo();
  checkUpdates();
}

// 加载系统字体
async function loadSystemFonts() {
  const FALLBACK_FONTS = [
    "Microsoft YaHei",
    "SimSun",
    "Arial",
    "Consolas",
    "PingFang SC",
    "Hiragino Sans GB",
    "Source Han Sans",
    "Noto Sans SC",
    "Roboto",
    "Inter",
    "Fira Code",
  ];

  try {
    const cached = await chrome.storage.local.get("fontCache");
    if (cached.fontCache && cached.fontCache.length > 0) {
      allFonts = cached.fontCache;
    }

    if (chrome.fontSettings) {
      chrome.fontSettings.getFontList((fonts) => {
        allFonts = [...new Set(fonts.map((f) => f.fontId))].sort();
        chrome.storage.local.set({ fontCache: allFonts });
      });
    }
  } catch (e) {
    allFonts = FALLBACK_FONTS;
  }
}

function loadData() {
  chrome.storage.sync.get(["settings", "schemes"], (res) => {
    const rawSettings = res.settings;
    allSettings = DataValidator.ensureSettings(rawSettings);
    if (
      rawSettings === undefined ||
      rawSettings === null ||
      typeof rawSettings !== "object" ||
      Array.isArray(rawSettings)
    ) {
      chrome.storage.sync.set({ settings: allSettings });
    }
    allSchemes = res.schemes || [];
    renderSchemes(allSchemes);
    renderSites(allSettings.sites);

    // 加载补充选择器
    const selectors = DataValidator.ensureSelectors(allSettings.global?.selectors);
    if (typeof selectors === "string") {
      // 兼容旧版
      document.getElementById("selectors-standard").value = "";
    } else {
      document.getElementById("selectors-standard").value =
        selectors.include.standard || "";
      document.getElementById("selectors-mono").value =
        selectors.include.mono || "";
      document.getElementById("selectors-math").value =
        selectors.include.math || "";
      document.getElementById("selectors-exclude").value =
        selectors.exclude || "";
    }

    // 内嵌框架开关。ensureSettings 已把 features 补齐，老配置读出来就是默认开启。
    const iframeSwitch = document.getElementById("iframe-fonts-switch");
    if (iframeSwitch) {
      iframeSwitch.checked = allSettings.global.features.iframeFonts.enabled;
    }
  });
}

// --- 自定义模态框系统 ---
const modal = {
  el: document.getElementById("modal-overlay"),
  title: document.getElementById("modal-title"),
  body: document.getElementById("modal-body"),
  custom: document.getElementById("modal-custom-content"),
  confirmBtn: document.getElementById("modal-confirm"),
  cancelBtn: document.getElementById("modal-cancel"),

  // singleAction：纯告知的弹窗用它，不给「取消」按钮。
  // 「取消」和「好的」做的事完全一样（都只是 hide()），并排放着只会让人犹豫
  // 点哪个；需要用户真正做选择的弹窗（删除、清空、导入覆盖）才留两个。
  show({ title, body, customHTML, confirmText, onConfirm, isDanger, singleAction }) {
    this.title.innerText = title || "";
    this.body.innerHTML = body || "";
    this.custom.innerHTML = customHTML || "";
    this.confirmBtn.innerText = confirmText || t("common.confirm");
    this.cancelBtn.innerText = t("common.cancel");
    this.confirmBtn.className = isDanger ? "btn btn-danger" : "btn btn-primary";
    // 每次都显式设一遍，免得上一次隐藏后残留到下一次。
    this.cancelBtn.style.display = singleAction ? "none" : "";

    this.el.style.display = "flex";

    // 清除之前的事件监听
    const newConfirm = this.confirmBtn.cloneNode(true);
    this.confirmBtn.parentNode.replaceChild(newConfirm, this.confirmBtn);
    this.confirmBtn = newConfirm;

    this.confirmBtn.onclick = () => {
      if (onConfirm()) this.hide();
    };
    this.cancelBtn.onclick = () => this.hide();
  },

  hide() {
    this.el.style.display = "none";
  },
};

// --- 渲染逻辑 ---

// 卡片里三项字体各占一行。以前是一行「标准: X · 等宽: Y」，问题有两个：
// 一是右栏只有 380px，扣掉内边距和操作按钮，文字区不到 270px，长字体名直接
// 被 ellipsis 吃掉；二是那个模板压根没有 {math} 占位符 —— 方案存了公式字体、
// 编辑弹窗里也能改，列表里却从来不显示。
const SCHEME_FONT_ROWS = [
  {
    key: "standard",
    label: "options.schemes.labelStandard",
    fallback: "common.systemDefault",
  },
  {
    key: "mono",
    label: "options.schemes.labelMono",
    fallback: "common.systemDefaultMono",
  },
  {
    key: "math",
    label: "options.schemes.labelMath",
    fallback: "common.systemDefault",
  },
];

// 用 DOM 建而不是拼 HTML：字体名要逐行写 style.fontFamily，
// 拼字符串的话建完还得再查一遍元素，不如直接建。
function buildSchemeInfo(scheme) {
  const mapping = scheme.mapping || {};

  const info = document.createElement("div");
  info.className = "scheme-info";

  const title = document.createElement("div");
  title.className = "scheme-title";
  title.textContent = scheme.name;
  info.appendChild(title);

  const fonts = document.createElement("div");
  fonts.className = "scheme-fonts";

  SCHEME_FONT_ROWS.forEach((row) => {
    const font = String(mapping[row.key] || "").trim();

    const label = document.createElement("div");
    label.className = "scheme-fonts-label";
    label.textContent = t(row.label);

    const value = document.createElement("div");
    value.className = "scheme-fonts-value";
    // 没设置时显示「系统默认」，但那是文案不是字体名，套上只会掉到回退字体
    value.textContent = font || t(row.fallback);
    FontPreview.apply(value, font);

    fonts.appendChild(label);
    fonts.appendChild(value);
  });

  info.appendChild(fonts);
  return info;
}

function renderSchemes(schemes) {
  const container = document.getElementById("schemes-container");
  container.innerHTML = "";

  if (schemes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("options.schemes.empty");
    container.appendChild(empty);
    return;
  }

  schemes.forEach((s, index) => {
    const item = document.createElement("div");
    item.className = "scheme-item";

    item.appendChild(buildSchemeInfo(s));

    item.insertAdjacentHTML(
      "beforeend",
      `
      <div class="scheme-actions">
        <button class="action-btn edit-btn" data-i18n-title="options.schemes.editTitle">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7m-8-5l9-9a2.828 2.828 0 1 1 4 4L11 20l-4 1 1-4 9-9z"></path></svg>
        </button>
        <button class="action-btn del del-btn" data-i18n-title="options.schemes.deleteTitle">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `,
    );
    // 行是重建出来的，属性文案得当场套一遍，否则会停在中文。
    I18n.localizePage(item);

    // 编辑方案
    item.querySelector(".edit-btn").onclick = () => {
      modal.show({
        title: t("options.schemes.modalTitle"),
        body: "",
        customHTML: `
          <div class="form-group">
            <label class="form-label">${t("options.schemes.nameLabel")}</label>
            <input type="text" id="edit-name" class="form-input" value="${escapeHTML(s.name)}" maxlength="12">
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border);">
                <th style="text-align: left; padding: 8px 0; font-size: 13px; font-weight: 700; color: var(--text-light); width: 100px;">${t("options.schemes.typeColumn")}</th>
                <th style="text-align: left; padding: 8px 0; font-size: 13px; font-weight: 700; color: var(--text-light);">${t("options.schemes.fontColumn")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">${t("options.schemes.standard")}</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-std" class="form-input font-edit-input" style="margin: 0;" value="${escapeHTML(s.mapping.standard || "")}" placeholder="${t("options.schemes.fontPlaceholder")}" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-std"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">${t("options.schemes.mono")}</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-mono" class="form-input font-edit-input" style="margin: 0;" value="${escapeHTML(s.mapping.mono || "")}" placeholder="${t("options.schemes.fontPlaceholder")}" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-mono"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">${t("options.schemes.math")}</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-math" class="form-input font-edit-input" style="margin: 0;" value="${escapeHTML(s.mapping.math || "")}" placeholder="${t("options.schemes.fontPlaceholder")}" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-math"></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        `,
        confirmText: t("options.schemes.updateConfirm"),
        onConfirm: () => {
          const newName = document.getElementById("edit-name").value.trim();
          const newStd = document.getElementById("edit-std").value.trim();
          const newMono = document.getElementById("edit-mono").value.trim();
          const newMath = document.getElementById("edit-math").value.trim();
          if (!newName) return false;

          allSchemes[index].name = newName;
          allSchemes[index].mapping.standard = newStd;
          allSchemes[index].mapping.mono = newMono;
          allSchemes[index].mapping.math = newMath;

          persistThenRefresh({ schemes: allSchemes });
          return true;
        },
      });

      // 绑定字体下拉事件
      setTimeout(() => {
        bindFontDropdowns();
      }, 50);
    };

    // 删除方案
    item.querySelector(".del-btn").onclick = () => {
      modal.show({
        title: t("options.schemes.deleteQuestion"),
        body: tHtml("options.schemes.deleteBody", { name: s.name }),
        confirmText: t("options.schemes.deleteConfirm"),
        isDanger: true,
        onConfirm: () => {
          allSchemes.splice(index, 1);
          persistThenRefresh({ schemes: allSchemes });
          return true;
        },
      });
    };

    container.appendChild(item);
  });
}

function renderSites(sites) {
  const container = document.getElementById("sites-container");
  container.innerHTML = "";

  const domains = Object.keys(sites).filter((d) => {
    // 只要有显式的开关设置（无论开或关），或者有自定义模式，就显示在列表中
    return typeof sites[d].on === "boolean" || sites[d].mode === "custom";
  });

  if (domains.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("options.sites.empty");
    container.appendChild(empty);
    return;
  }

  domains.forEach((d) => {
    const row = document.createElement("div");
    row.className = "site-row";
    // ON / OFF 是状态徽章，两种语言下都读得懂，不进字典。
    const statusText = sites[d].on ? "ON" : "OFF";
    const badgeClass = sites[d].on ? "badge-custom" : "badge-off";

    row.innerHTML = `
      <div class="site-domain">${escapeHTML(d)}</div>
      <div style="display:flex; align-items:center; gap:16px;">
        <span class="badge ${badgeClass}">${statusText}</span>
        <button class="action-btn del site-del" data-i18n-title="options.sites.unlist">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;
    I18n.localizePage(row);

    row.querySelector(".site-del").onclick = () => {
      delete allSettings.sites[d];
      persistThenRefresh({ settings: allSettings });
    };

    container.appendChild(row);
  });
}

function updateStorageInfo() {
  chrome.storage.sync.getBytesInUse(null, (bytes) => {
    const limit = chrome.storage.sync.QUOTA_BYTES || 102400;
    const percentage = Math.min(100, (bytes / limit) * 100);

    const bar = document.getElementById("storage-bar");
    const perc = document.getElementById("storage-percentage");
    const txt = document.getElementById("storage-text");

    if (bar) bar.style.width = percentage + "%";
    if (perc) perc.innerText = percentage.toFixed(1) + "%";
    if (txt) txt.innerText = t("options.storage.usage", { bytes, limit });
  });
}

// 改动 settings / schemes 之后的统一收尾：重渲染 + 刷新存储占用条。
// 清空站点、删除单个站点、删除方案、编辑方案这四处原先只调 loadData()，
// 于是右侧「存储记录」的读数会一直停在改动前，直到手动重开页面。
function persistThenRefresh(payload) {
  chrome.storage.sync.set(payload, () => {
    loadData();
    updateStorageInfo();
  });
}

function bindGlobalEvents() {
  document.getElementById("clear-sites").onclick = () => {
    modal.show({
      title: t("options.sites.clearTitle"),
      body: t("options.sites.clearBody"),
      confirmText: t("options.sites.clearConfirm"),
      isDanger: true,
      onConfirm: () => {
        allSettings.sites = {};
        persistThenRefresh({ settings: allSettings });
        return true;
      },
    });
  };

  // 「配置备份」板块只做导出与导入，【没有】「恢复默认设置」。
  // 曾经加过一个（把 settings 整份推回默认值），后来去掉了：
  // 全页只留「站点管理 → 清空全部」一处破坏性入口，再添一个只会扩大误触面；
  // 而它的粒度（只清 sites）已经够用 —— 全局字体映射改乱了，在 popup 里逐条改回来即可。

  // 保存补充选择器
  document.getElementById("save-selectors").onclick = () => {
    const selectors = {
      include: {
        standard: document.getElementById("selectors-standard").value,
        mono: document.getElementById("selectors-mono").value,
        math: document.getElementById("selectors-math").value,
      },
      exclude: document.getElementById("selectors-exclude").value,
    };
    if (!allSettings.global) allSettings.global = {};
    allSettings.global.selectors = selectors;

    chrome.storage.sync.set({ settings: allSettings }, () => {
      updateStorageInfo();
      // 发送通知
      modal.show({
        title: t("options.selectors.savedTitle"),
        body: t("options.selectors.savedBody"),
        confirmText: t("common.ok"),
        onConfirm: () => true,
        singleAction: true,
      });
    });
  };

  // 内嵌框架开关：即时保存，不设「保存」按钮。
  // 写失败时把开关拨回去 —— 只改 UI 不落盘，会让人以为已经生效。
  const iframeSwitch = document.getElementById("iframe-fonts-switch");
  if (iframeSwitch) {
    iframeSwitch.addEventListener("change", async () => {
      if (!allSettings.global) allSettings.global = {};
      allSettings.global.features = DataValidator.ensureFeatures(
        allSettings.global.features,
      );

      const next = iframeSwitch.checked;
      allSettings.global.features.iframeFonts.enabled = next;

      const saved = await Storage.set({ settings: allSettings });
      if (!saved) {
        allSettings.global.features.iframeFonts.enabled = !next;
        iframeSwitch.checked = !next;
        modal.show({
          title: t("options.frames.saveFailedTitle"),
          body: t("options.frames.saveFailedBody"),
          confirmText: t("common.ok"),
          onConfirm: () => true,
          singleAction: true,
        });
        return;
      }
      updateStorageInfo();
    });
  }

  // ═══ 导出配置 ═══
  document.getElementById("export-config").onclick = () => {
    chrome.storage.sync.get(["settings", "schemes"], (res) => {
      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        settings: res.settings || {},
        schemes: res.schemes || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pureread-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      modal.show({
        title: t("options.backup.doneTitle"),
        body: t("options.backup.doneBody"),
        confirmText: t("common.ok"),
        onConfirm: () => true,
        singleAction: true,
      });
    });
  };

  // ═══ 导入配置 ═══
  document.getElementById("import-config").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importData = JSON.parse(event.target.result);

        // 校验数据格式
        if (!importData.settings && !importData.schemes) {
          throw new Error(t("options.import.invalidFormat"));
        }

        const schemeCount = (importData.schemes || []).length;
        const siteCount = Object.keys(importData.settings?.sites || {}).length;
        // 日期串必须按界面语言格式化，否则「英文界面 + 中文浏览器」下会串味。
        const exportedAt = importData.exportedAt
          ? new Date(importData.exportedAt).toLocaleString(I18n.localeTag)
          : t("common.unknown");

        modal.show({
          title: t("options.import.title"),
          body: tHtml("options.import.body", {
            schemes: schemeCount,
            sites: siteCount,
            date: exportedAt,
          }),
          confirmText: t("options.import.confirm"),
          isDanger: true,
          onConfirm: () => {
            // 执行导入
            const dataToSave = {};
            if (importData.settings) dataToSave.settings = importData.settings;
            if (importData.schemes) dataToSave.schemes = importData.schemes;

            chrome.storage.sync.set(dataToSave, () => {
              loadData();
              updateStorageInfo();
              modal.show({
                title: t("options.import.doneTitle"),
                body: t("options.import.doneBody"),
                confirmText: t("common.ok"),
                onConfirm: () => true,
                singleAction: true,
              });
            });
            return true;
          },
        });
      } catch (err) {
        modal.show({
          title: t("options.import.failTitle"),
          body: t("options.import.failBody", { error: err.message }),
          confirmText: t("common.understood"),
          onConfirm: () => true,
          singleAction: true,
        });
      }
    };
    reader.readAsText(file);

    // 清空 input 以便再次选择同一文件
    e.target.value = "";
  };
}

// 绑定字体下拉选择事件
function bindFontDropdowns() {
  const inputs = document.querySelectorAll(".font-edit-input");

  // 收掉所有字体下拉。
  // 主路径其实是下面每个输入框自己的 blur —— 从「等宽」点到「标准」，等宽先失焦。
  // 在 focus 前再收一遍是把「同时最多只开一个」这条不变量讲死，不依赖
  // blur / focus 的先后（各浏览器不保证一致，虽然这里两个方向都对）。
  const closeAll = () => {
    document.querySelectorAll(".font-dropdown").forEach((d) => {
      d.style.display = "none";
    });
  };

  // 输入框里显示的也是字体名，同样用它自身的字形渲染。空值保持界面字体，
  // 否则 placeholder（「输入或选择字体」）会被套成候选字体的样子。
  const paintInput = (input) => FontPreview.apply(input, input.value);

  inputs.forEach((input) => {
    const dropdownId = "dropdown-" + input.id.replace("edit-", "");
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    paintInput(input); // 弹窗带着已有值打开，进场就该是预览态

    // 渲染下拉列表。走 shared.js 的虚拟列表：系统字体常达数百项，每项还要用
    // 各自字体渲染自己的名字（触发字体加载与重新度量），全量插入太贵。
    // 原来这里靠 .slice(0, 50) 把代价压下去，代价是搜不到的字体直接不出现 ——
    // 输入越具体，越可能因为排在 50 名之后就「查无此字体」，用户只会以为没装。
    const renderDropdown = (filterText) => {
      const query = filterText.toLowerCase();
      const filtered = query
        ? allFonts.filter((f) => f.toLowerCase().includes(query))
        : allFonts.slice();

      VirtualList.render(dropdown, filtered, (font) => {
        const item = document.createElement("div");
        item.className = "dropdown-item";
        if (font === input.value) item.classList.add("active");
        item.innerText = font;
        // 候选字体用它自身的字形渲染自己的名字，省掉一次「选完再切到页面看」的往返
        FontPreview.apply(item, font);
        // 部分字体名偏宽会被 ellipsis 截断，hover 时可看全名
        item.title = font;
        item.onmousedown = (e) => {
          e.preventDefault();
          input.value = font;
          paintInput(input);
          dropdown.style.display = "none";
        };
        return item;
      });
    };

    // 输入时过滤
    input.addEventListener("input", () => {
      // 拼到一半的名字不是字体名，styleFor 会返回空串落回界面字体，不会边打字边跳
      paintInput(input);
      renderDropdown(input.value);
    });

    // 聚焦时显示
    input.addEventListener("focus", () => {
      closeAll();
      renderDropdown(input.value);
    });

    // 失焦即收，不延迟。
    //
    // 这里原来套了一层 setTimeout(150)。那个延迟是为了让点选列表项的那一下
    // 先落地 —— 但列表项的 mousedown 已经 preventDefault（见上），点选项根本
    // 不会让输入框失焦，也就没有需要等的东西。白等的代价是实打实的：从「等宽」
    // 切到「标准」时，等宽那个框会在屏幕上多停 160ms 上下，和新开的框叠在一起，
    // 看着就是卡了一下。popup 那边一直是同步收的，两边手感才对得上。
    input.addEventListener("blur", () => {
      dropdown.style.display = "none";
    });
  });
}

function checkUpdates() {
  const currentVersion = chrome.runtime.getManifest().version;
  const verSpan = document.getElementById("opt-current-version");
  if (verSpan) verSpan.innerText = "v" + currentVersion;

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
        pendingUpdate = { version: res.latestRelease, url: res.releaseUrl };
        applyUpdateState();
      }
    }
  });
}

// 把关于卡切到「有新版本」态。版本号挂徽标、按钮只留动作词。
// 单独抽出来是为了能在切界面语言后重画一遍 —— applyLocale() 里的
// localizePage() 会把按钮文案冲回「检查更新」，rerenderLocalized() 会再调它。
function applyUpdateState() {
  if (!pendingUpdate) return;

  const badge = document.getElementById("opt-update-badge");
  badge.innerText = t("options.about.newVersion") + " v" + pendingUpdate.version;
  badge.style.display = "inline-block";

  // 按钮换成「更新色」，见 options.html 里 .backup-btn.export.is-update
  document.getElementById("opt-update-btn").classList.add("is-update");
  document.getElementById("opt-update-text").innerText = t("options.about.updateNow");

  if (pendingUpdate.url) {
    document.getElementById("opt-update-link").href = pendingUpdate.url;
  }
}

init();
