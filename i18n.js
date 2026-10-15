// PureRead 运行时本地化。
//
// 为什么不用 chrome.i18n.getMessage()：它锁定浏览器 UI 语言，无法按扩展覆盖，
// 而设置页要能手动切换语言。所以界面文案的字典打包在本文件里；_locales/ 只承担
// manifest 里那几个必须由 Chrome 读取的串（拓展名、描述），两者零重复。
//
// 纪律：顶层不碰 DOM —— manifest 把本文件以 document_start 注入每一个页面，
// 包括 content.js 所在的宿主页。只有扩展自己的界面才调用 localizePage()。

const I18n = (() => {
  const DEFAULT_LOCALE = "en";
  const STORAGE_KEY = "uiLocale";

  const MESSAGES = {
    en: {
      // ── 通用 ────────────────────────────────────────────────
      "common.confirm": "OK",
      "common.cancel": "Cancel",
      "common.ok": "Got it",
      "common.understood": "Got it",
      "common.save": "Save",
      "common.unknown": "Unknown",
      "common.currentBrowser": "This browser",
      "common.systemDefault": "System default",
      "common.systemDefaultMono": "System default mono",

      // ── options：站点管理 ──────────────────────────────────
      "options.title": "PureRead Control Center",
      "options.sites.title": "Site rules",
      "options.sites.clearAll": "Clear all",
      "options.sites.noticeHeading": "How these rules work",
      "options.sites.noticeBody":
        "When you flip a site's switch in the popup, or choose <b>“Site font”</b> for it, a record for that domain appears here. Sites that simply follow the global settings take up no record.<br /><br />" +
        "<b>Allowlist</b> (badge reads <span class=\"badge badge-custom\">ON</span>):<br />" +
        "With the master switch off, font replacement <b>still runs on this site</b>.<br /><br />" +
        "<b>Blocklist</b> (badge reads <span class=\"badge badge-off\">OFF</span>):<br />" +
        "With the master switch on, the extension stays off here and the page keeps its <b>original styling</b>.",
      "options.sites.empty":
        "No site-specific rules yet. Every site currently uses “Global font” with the same switch state.",
      "options.sites.unlist": "Remove and restore default",
      "options.sites.clearTitle": "Clear all site rules?",
      "options.sites.clearBody":
        "This removes every domain record — both the sites you turned off and the ones set to “Site font”. All sites go back to the global font.",
      "options.sites.clearConfirm": "Clear all",

      // ── options：额外匹配与排除 ────────────────────────────
      "options.selectors.title": "Extra matching & exclusion",
      "options.selectors.desc":
        "Force a font preset onto specific elements — one selector per line, e.g. <code>.article-body</code>.",
      "options.selectors.note":
        "Separate with commas or newlines. For an exclusion, list the element itself — you don't need to add <code>::before</code>.",
      "options.selectors.label.standard": "Standard",
      "options.selectors.label.mono": "Code / monospace",
      "options.selectors.label.math": "Math",
      "options.selectors.label.exclude": "Exclude",
      "options.selectors.savedTitle": "Saved",
      "options.selectors.savedBody": "Selectors saved. They apply immediately, no page refresh needed.",

      // ── options：方案库 ────────────────────────────────────
      "options.schemes.title": "Presets",
      "options.schemes.empty":
        "No presets saved yet. Click “Save” in the popup to add one.",
      // 方案卡片里三行的标签列，宽度紧张，用短词；长版见下面的 standard/mono/math
      "options.schemes.labelStandard": "Standard",
      "options.schemes.labelMono": "Mono",
      "options.schemes.labelMath": "Math",
      "options.schemes.editTitle": "Edit name and details",
      "options.schemes.deleteTitle": "Delete preset",
      "options.schemes.modalTitle": "Edit preset",
      "options.schemes.nameLabel": "Preset name",
      "options.schemes.typeColumn": "Category",
      "options.schemes.fontColumn": "Font",
      "options.schemes.standard": "Standard font",
      "options.schemes.mono": "Monospace font",
      "options.schemes.math": "Math font",
      "options.schemes.fontPlaceholder": "Type or pick a font",
      "options.schemes.updateConfirm": "Save changes",
      "options.schemes.deleteQuestion": "Delete this preset?",
      "options.schemes.deleteBody":
        "Permanently delete the preset “{name}”? This can't be undone.",
      "options.schemes.deleteConfirm": "Delete now",

      // ── options：存储记录 ──────────────────────────────────
      "options.storage.title": "Storage",
      "options.storage.usageLabel": "Used",
      "options.storage.loading": "Loading…",
      "options.storage.usage": "{bytes} / {limit} bytes (sync quota)",

      // ── options：配置备份 ──────────────────────────────────
      "options.backup.title": "Backup",
      "options.backup.desc":
        "Export your setup to back it up or move it to another machine; import to restore it from a file.",
      "options.backup.export": "Export",
      "options.backup.import": "Import",
      "options.backup.doneTitle": "Export complete",
      "options.backup.doneBody":
        "The file has been downloaded — keep it somewhere safe.",

      // ── options：导入 ──────────────────────────────────────
      "options.import.title": "Confirm import",
      "options.import.body":
        "<p>This file contains:</p>" +
        "<ul style=\"margin: 12px 0; padding-left: 20px; font-size: 13px;\">" +
        "<li>Presets: {schemes}</li>" +
        "<li>Site rules: {sites}</li>" +
        "<li>Exported: {date}</li>" +
        "</ul>" +
        "<p style=\"color: var(--text-muted); font-size: 12px;\">⚠️ This replaces all of your current settings.</p>",
      "options.import.confirm": "Import",
      "options.import.doneTitle": "Import complete",
      "options.import.doneBody":
        "Your setup was restored and is now active everywhere.",
      "options.import.failTitle": "Import failed",
      "options.import.failBody": "Couldn't read the file: {error}",
      "options.import.invalidFormat":
        "That isn't a PureRead configuration file.",

      // ── options：关于 ──────────────────────────────────────
      "options.about.title": "About PureRead",
      "options.about.version": "Version:",
      "options.about.newVersion": "New version",
      "options.about.desc":
        "Keep the extension current for the latest fixes and improvements.",
      "options.about.checkUpdates": "Check for updates",
      "options.about.updateNow": "Update now",
      "options.about.feedback": "Send feedback",
      "options.about.privacy": "Privacy policy",
      // ── options：界面语言 ──────────────────────────────────
      "options.language.title": "Interface language",
      "options.language.desc":
        "Pick the language for the extension's own interface. \"Follow browser\" tracks your browser's UI language.",
      "options.language.auto": "Follow browser",

      // ── popup ──────────────────────────────────────────────
      "popup.advanced": "Settings",
      "popup.masterSwitch": "Master switch",
      "popup.modeGlobal": "Global font",
      "popup.modeSite": "Site font",
      "popup.unsupportedPage": "Unsupported page",
      "popup.unsupportedHint":
        "This page doesn't support per-site settings. Font changes still apply globally.",
      "popup.fontsSection": "Fonts",
      "popup.loadingFonts": "Loading system fonts…",
      "popup.fontLimit.hint":
        "{browser} can't read the system font list, so the dropdown only offers common fonts. Type a font name <b>straight into the field</b> and it will still work.",
      "popup.label.standard": "Standard",
      "popup.label.mono": "Code/mono",
      "popup.label.math": "Math",
      "popup.placeholder.standard": "Empty = leave body text alone",
      "popup.placeholder.mono": "Empty = leave code alone",
      "popup.placeholder.math": "Empty = leave math alone",
      "popup.schemesSection": "Presets",
      "popup.schemes.empty": "No presets yet",
      "popup.schemes.namePlaceholder": "Name this preset…",
      "popup.schemes.saveTitle": "Save preset",
      "popup.schemes.save": "Save",
      "popup.schemes.defaultName": "Preset {time}",
      "popup.schemes.deleteTitle": "Delete preset",
      "popup.picker.title": "Extra matching & exclusions",
      "popup.picker.heading": "Element picker",
      "popup.picker.desc":
        "Pick an element on the page — it gets appended to whichever rule you choose below.",
      "popup.picker.unsupported":
        "This is a browser page, so the picker can't inject here.",
      "popup.picker.target.standard": "Standard",
      "popup.picker.target.mono": "Code / monospace",
      "popup.picker.target.math": "Math",
      "popup.picker.target.exclude": "Exclude",
      "popup.version.badge": "↑ Update",
      "popup.version.newTitle": "Version v{version} is available",

      // ── content.js：页面拾取浮层 ───────────────────────────
      "picker.target.standard": "Extra match · Standard",
      "picker.target.mono": "Extra match · Code / monospace",
      "picker.target.math": "Extra match · Math",
      "picker.target.exclude": "Exclude · Global",
      "picker.target.standard.short": "Standard",
      "picker.target.mono.short": "Code / monospace",
      "picker.target.math.short": "Math",
      "picker.target.exclude.short": "Exclude",
      "picker.waitingElement": "Waiting for a selection",
      "picker.waitingSelector": "Generating selector…",
      "picker.tip.target": "Target element",
      "picker.tip.selector": "Selector",
      "picker.tip.click": "confirm",
      "picker.tip.esc": "exit",
      "picker.hint.applied": "Changes apply immediately",
      "picker.action.undo": "Undo",
      "picker.toast.added": "Added to {target}",
      "picker.toast.undone": "Removed",
      "picker.toast.undoFailed": "Couldn't undo: {error}",
      "picker.toast.cancelled": "Picker cancelled",
      "picker.toast.noSelector":
        "Couldn't build a selector for that element — try another one.",
      "picker.toast.saveFailed": "Couldn't save: {error}",
    },

    zh_CN: {
      // ── 通用 ────────────────────────────────────────────────
      "common.confirm": "确定",
      "common.cancel": "取消",
      "common.ok": "好的",
      "common.understood": "知道了",
      "common.save": "保存",
      "common.unknown": "未知",
      "common.currentBrowser": "当前浏览器",
      "common.systemDefault": "系统默认",
      "common.systemDefaultMono": "系统默认等宽",

      // ── options：站点管理 ──────────────────────────────────
      "options.title": "控制中心 - PureRead",
      "options.sites.title": "站点管理",
      "options.sites.clearAll": "清空全部",
      "options.sites.noticeHeading": "管理逻辑说明",
      "options.sites.noticeBody":
        "在扩展弹窗中，当您在特定网站上<b>切换了站点开关</b>，或者选择了<b>“本站字体”</b>时，这里会自动生成一条该站点的专属记录；完全跟随全局设置的站点不占记录。<br /><br />" +
        "<b>白名单效应</b>（站点头衔为 <span class=\"badge badge-custom\">ON</span>）：<br />" +
        "当您关闭了扩展的“总开关”，但该站点在列表中是开启（ON）状态时，扩展字体替换在<b>这个特定站点仍然会生效</b>。<br /><br />" +
        "<b>黑名单效应</b>（站点头衔为 <span class=\"badge badge-off\">OFF</span>）：<br />" +
        "当您开启了扩展的“总开关”，但该站点在列表中是关闭（OFF）状态时，扩展在这个站点将被禁用，<b>恢复原网页原本的显示效果</b>。",
      "options.sites.empty":
        "暂无特定站点记录。所有网站目前都处于“全局字体”且开关一致的状态。",
      "options.sites.unlist": "移除并恢复默认",
      "options.sites.clearTitle": "清空所有站点？",
      "options.sites.clearBody":
        "这将清除所有的域名黑白名单记录（包括关闭的站点和选用“本站字体”的站点），所有网站将恢复为默认的全局字体。",
      "options.sites.clearConfirm": "确认清空",

      // ── options：额外匹配与排除 ────────────────────────────
      "options.selectors.title": "额外匹配与排除",
      "options.selectors.desc":
        "将特定元素强制应用字体预设，每行一个选择器（如 <code>.article-body</code>）。",
      "options.selectors.note":
        "支持逗号或换行分隔。排除项写元素本身即可，不需要手动写 <code>::before</code>。",
      "options.selectors.label.standard": "标准字体",
      "options.selectors.label.mono": "代码 / 等宽",
      "options.selectors.label.math": "数学公式",
      "options.selectors.label.exclude": "排除替换",
      "options.selectors.savedTitle": "保存成功",
      "options.selectors.savedBody": "补充选择器已保存，已即时生效，无需刷新页面。",

      // ── options：方案库 ────────────────────────────────────
      "options.schemes.title": "方案库",
      "options.schemes.empty":
        "还没有保存任何方案",
      // 方案卡片里三行的标签列，宽度紧张，用短词；长版见下面的 standard/mono/math
      "options.schemes.labelStandard": "标准",
      "options.schemes.labelMono": "等宽",
      "options.schemes.labelMath": "公式",
      "options.schemes.editTitle": "编辑名称和详情",
      "options.schemes.deleteTitle": "删除方案",
      "options.schemes.modalTitle": "编辑方案配置",
      "options.schemes.nameLabel": "方案名称",
      "options.schemes.typeColumn": "字体类型",
      "options.schemes.fontColumn": "字体名称",
      "options.schemes.standard": "标准字体",
      "options.schemes.mono": "等宽字体",
      "options.schemes.math": "数学公式",
      "options.schemes.fontPlaceholder": "输入或选择字体",
      "options.schemes.updateConfirm": "更新保存",
      "options.schemes.deleteQuestion": "确认删除？",
      "options.schemes.deleteBody":
        "确定要彻底删除配置方案「{name}」吗？此操作无法撤销。",
      "options.schemes.deleteConfirm": "立即删除",

      // ── options：存储记录 ──────────────────────────────────
      "options.storage.title": "存储记录",
      "options.storage.usageLabel": "占用率",
      "options.storage.loading": "载入中...",
      "options.storage.usage": "{bytes} / {limit} 字节 (Sync 限额)",

      // ── options：配置备份 ──────────────────────────────────
      "options.backup.title": "配置备份",
      "options.backup.desc": "导出配置以便备份或换机；导入可从文件恢复。",
      "options.backup.export": "导出配置",
      "options.backup.import": "导入配置",
      "options.backup.doneTitle": "导出成功",
      "options.backup.doneBody": "配置文件已下载，请妥善保存。",

      // ── options：导入 ──────────────────────────────────────
      "options.import.title": "确认导入",
      "options.import.body":
        "<p>即将导入以下配置：</p>" +
        "<ul style=\"margin: 12px 0; padding-left: 20px; font-size: 13px;\">" +
        "<li>方案数量：{schemes} 个</li>" +
        "<li>站点设置：{sites} 个</li>" +
        "<li>导出时间：{date}</li>" +
        "</ul>" +
        "<p style=\"color: var(--text-muted); font-size: 12px;\">⚠️ 这将覆盖当前的所有配置。</p>",
      "options.import.confirm": "确认导入",
      "options.import.doneTitle": "导入成功",
      "options.import.doneBody": "配置已成功恢复，所有设置已生效。",
      "options.import.failTitle": "导入失败",
      "options.import.failBody": "文件解析错误：{error}",
      "options.import.invalidFormat": "无效的配置文件格式",

      // ── options：关于 ──────────────────────────────────────
      "options.about.title": "关于 PureRead",
      "options.about.version": "当前版本：",
      "options.about.newVersion": "有新版本",
      "options.about.desc": "保持扩展更新以获取最新的界面优化和功能改进。",
      "options.about.checkUpdates": "检查更新",
      "options.about.updateNow": "立即更新",
      "options.about.feedback": "意见反馈",
      "options.about.privacy": "隐私说明",

      // ── options：界面语言 ──────────────────────────────────
      "options.language.title": "界面语言",
      "options.language.desc":
        "选择扩展界面的显示语言。「跟随浏览器」会随浏览器的界面语言自动切换。",
      "options.language.auto": "跟随浏览器",

      // ── popup ──────────────────────────────────────────────
      "popup.advanced": "高级设置",
      "popup.masterSwitch": "总开关",
      "popup.modeGlobal": "全局字体",
      "popup.modeSite": "本站字体",
      "popup.unsupportedPage": "不支持的页面",
      "popup.unsupportedHint":
        "当前页面不支持站点级设置，字体修改仍会全局生效。",
      "popup.fontsSection": "字体选择",
      "popup.loadingFonts": "正在载入系统字体...",
      "popup.fontLimit.hint":
        "{browser} 无法读取系统字体列表，下拉里只有常用字体。直接在输入框<b>手动输入字体名</b>即可生效。",
      "popup.label.standard": "标准字体",
      "popup.label.mono": "代码/等宽",
      "popup.label.math": "数学公式",
      "popup.placeholder.standard": "留空则不替换正文",
      "popup.placeholder.mono": "留空则不替换代码",
      "popup.placeholder.math": "留空则不替换公式",
      "popup.schemesSection": "配置方案",
      "popup.schemes.empty": "暂无保存的方案",
      "popup.schemes.namePlaceholder": "为当前方案命名...",
      "popup.schemes.saveTitle": "保存方案",
      "popup.schemes.save": "保存",
      "popup.schemes.defaultName": "方案 {time}",
      "popup.schemes.deleteTitle": "删除方案",
      "popup.picker.title": "额外匹配与排除",
      "popup.picker.heading": "页面拾取",
      "popup.picker.desc":
        "从当前网页点选一个元素，自动追加到下面你点击的规则项。",
      "popup.picker.unsupported":
        "当前页面为浏览器内置页，无法注入脚本，暂不能拾取元素。",
      "popup.picker.target.standard": "标准字体",
      "popup.picker.target.mono": "代码 / 等宽",
      "popup.picker.target.math": "数学公式",
      "popup.picker.target.exclude": "排除替换",
      "popup.version.badge": "更新版本",
      "popup.version.newTitle": "有新版本可更新: v{version}",

      // ── content.js：页面拾取浮层 ───────────────────────────
      "picker.target.standard": "额外匹配 · 标准字体",
      "picker.target.mono": "额外匹配 · 代码 / 等宽",
      "picker.target.math": "额外匹配 · 数学公式",
      "picker.target.exclude": "排除替换 · 全局",
      "picker.target.standard.short": "标准字体",
      "picker.target.mono.short": "代码 / 等宽",
      "picker.target.math.short": "数学公式",
      "picker.target.exclude.short": "排除替换",
      "picker.waitingElement": "等待选择元素",
      "picker.waitingSelector": "等待生成代码...",
      "picker.tip.target": "目标元素",
      "picker.tip.selector": "生成选择器",
      "picker.tip.click": "确认",
      "picker.tip.esc": "退出",
      "picker.hint.applied": "更改已即时应用",
      "picker.action.undo": "撤销",
      "picker.toast.added": "已添加到 {target}",
      "picker.toast.undone": "已撤销本次添加",
      "picker.toast.undoFailed": "撤销失败：{error}",
      "picker.toast.cancelled": "已取消页面拾取",
      "picker.toast.noSelector": "未能生成可用的选择器，请换一个元素试试。",
      "picker.toast.saveFailed": "保存失败：{error}",
    },
  };

  const warnedKeys = new Set();
  const listeners = [];
  // 同步定成浏览器语言（detectLocale 是函数声明，已提升），保证 t() 一上来就可用。
  let locale = detectLocale();
  let pref = "auto"; // 用户的显式选择：'auto' | 'zh_CN' | 'en'
  let initPromise = null;

  // 纯字符串转义：document_start 时 document 未必可用，且 content.js 的浮层
  // 会把宿主页来的 class/id 名（恶意页面可控）拼进 innerHTML，需要它。
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 替换格式是 {name}（单花括号）。未匹配的占位符原样留着，不抛错。
  function interpolate(template, subs, escapeValues) {
    if (!subs) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      if (!Object.prototype.hasOwnProperty.call(subs, name)) return match;
      const value = subs[name];
      return escapeValues
        ? escapeHtml(value)
        : String(value == null ? "" : value);
    });
  }

  function lookup(key) {
    const table = MESSAGES[locale] || {};
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];

    const fallback = MESSAGES[DEFAULT_LOCALE] || {};
    if (Object.prototype.hasOwnProperty.call(fallback, key)) {
      if (!warnedKeys.has(key)) {
        warnedKeys.add(key);
        console.warn(`[PureRead] 缺少 ${locale} 文案：${key}（已回退英文）`);
      }
      return fallback[key];
    }

    if (!warnedKeys.has(key)) {
      warnedKeys.add(key);
      console.warn(`[PureRead] 缺少文案键：${key}`);
    }
    return key;
  }

  // 模板可信、替换值不可信：
  //   t()     结果进 textContent / innerText，或模板本身不含标签时用。
  //   tHtml() 只转义 subs 的值，模板（可能含 <b>/<code>/<span class="badge">）不动。
  // 绝不要写 escapeHtml(I18n.t(...)) —— 那会把模板里的标签一起吃掉。
  function t(key, subs) {
    return interpolate(lookup(key), subs, false);
  }

  function tHtml(key, subs) {
    return interpolate(lookup(key), subs, true);
  }

  function detectLocale() {
    try {
      const ui = chrome.i18n.getUILanguage() || "";
      return /^zh/i.test(ui) ? "zh_CN" : DEFAULT_LOCALE;
    } catch (e) {
      // 非扩展环境（例如单独打开 html 预览）没有 chrome.i18n
      return DEFAULT_LOCALE;
    }
  }

  function resolveLocale(pref) {
    if (pref === "zh_CN" || pref === "en") return pref;
    return detectLocale();
  }

  function setLocale(next) {
    if (!next || next === locale) return locale;
    locale = next;
    listeners.forEach((cb) => {
      try {
        cb(locale);
      } catch (e) {
        console.warn("[PureRead] 语言切换回调出错:", e);
      }
    });
    return locale;
  }

  function onChange(cb) {
    listeners.push(cb);
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function readStoredLocale() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(res && res[STORAGE_KEY] ? res[STORAGE_KEY] : null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // locale 在模块加载时就同步定成浏览器语言，保证 t() 立刻可用；
  // 落盘的偏好是异步读的，读到再覆盖。这就是 ready 存在的理由。

  function normalizePref(value) {
    return value === "zh_CN" || value === "en" ? value : "auto";
  }

  // 只切换，不落盘。给 storage.onChanged 的监听方用 —— 那条路径上偏好
  // 已经是落盘值，再写一次会绕出回声。
  function applyPref(next) {
    pref = normalizePref(next);
    return setLocale(resolveLocale(pref));
  }

  // 切换并落盘。存 storage.local 而不是 sync：这是设备级偏好，
  // 而且 sync 有 100KB 限额，设置页里有占用条在盯着它。
  function setPref(next) {
    const before = pref;
    const result = applyPref(next);
    if (pref !== before) {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: pref });
      } catch (e) {
        console.warn("[PureRead] 语言偏好落盘失败:", e);
      }
    }
    return result;
  }

  async function runInit() {
    try {
      const stored = await readStoredLocale();
      if (stored) applyPref(stored);
    } catch (e) {
      // 读不到偏好就继续跟随浏览器语言
    }
    return api;
  }

  function init() {
    if (!initPromise) initPromise = runInit();
    return initPromise;
  }

  function eachMatching(scope, selector, fn) {
    if (!scope) return;
    if (scope.nodeType === 1 && scope.matches(selector)) fn(scope);
    if (scope.querySelectorAll) scope.querySelectorAll(selector).forEach(fn);
  }

  const ATTR_BINDINGS = [
    ["placeholder", "data-i18n-placeholder"],
    ["title", "data-i18n-title"],
    ["aria-label", "data-i18n-aria-label"],
  ];

  // 批量套用静态文案。不碰 documentElement.lang —— content.js 绝不能改
  // 宿主页的 <html lang>，扩展页自己在 init 里设。
  function localizePage(root) {
    const scope =
      root || (typeof document !== "undefined" ? document : null);
    if (!scope) return;

    eachMatching(scope, "[data-i18n]", (el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });

    eachMatching(scope, "[data-i18n-html]", (el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });

    ATTR_BINDINGS.forEach(([attr, dataAttr]) => {
      eachMatching(scope, `[${dataAttr}]`, (el) => {
        el.setAttribute(attr, t(el.getAttribute(dataAttr)));
      });
    });
  }

  const api = {
    t,
    tHtml,
    escapeHtml,
    detectLocale,
    resolveLocale,
    setLocale,
    setPref,
    applyPref,
    onChange,
    init,
    localizePage,
    // ready 用 getter：`await I18n.ready` 本身就会触发 init，
    // 调用方忘了显式 init() 也不会永远挂起。
    get ready() {
      return init();
    },
    get locale() {
      return locale;
    },
    get pref() {
      return pref;
    },
    get localeTag() {
      return locale === "zh_CN" ? "zh-CN" : "en";
    },
  };

  return api;
})();
