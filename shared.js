/**
 * PureRead - 公共模块
 * 包含默认值、工具函数和错误处理
 */

// ═══════════════════════════════════════════════════════════
// 默认配置常量
// ═══════════════════════════════════════════════════════════

const DEFAULT_MAPPING = {
  standard: "",
  mono: "",
  math: "",
};

const DEFAULT_TYPO = {
  enabled: false,
  lineHeight: "1.6",
  fontSize: "100",
  fontWeight: "0",
};

const DEFAULT_SELECTOR_RULES = {
  standard: "",
  mono: "",
  math: "",
};

const DEFAULT_SELECTORS = {
  include: { ...DEFAULT_SELECTOR_RULES },
  exclude: "",
};

// 新功能默认配置
const DEFAULT_FEATURES = {
  progressBar: {
    enabled: false,
    color: "#10b981", // 翡翠绿
  },
  // focusMode 已改为站点级配置，存储在 sites[domain].focusMode
  // 保留此字段仅用于向后兼容
};

const DEFAULT_GLOBAL = {
  on: true,
  mapping: { ...DEFAULT_MAPPING },
  typo: { ...DEFAULT_TYPO },
  selectors: {
    include: { ...DEFAULT_SELECTOR_RULES },
    exclude: "",
  },
  features: JSON.parse(JSON.stringify(DEFAULT_FEATURES)),
};

const DEFAULT_SETTINGS = {
  global: {
    ...DEFAULT_GLOBAL,
    mapping: { ...DEFAULT_MAPPING },
    typo: { ...DEFAULT_TYPO },
    selectors: {
      include: { ...DEFAULT_SELECTOR_RULES },
      exclude: "",
    },
  },
  sites: {},
};

// ═══════════════════════════════════════════════════════════
// 存储操作工具（带错误处理）
// ═══════════════════════════════════════════════════════════

const Storage = {
  /**
   * 安全读取存储数据
   * @param {string[]} keys - 要读取的键名数组
   * @returns {Promise<Object>} 返回数据对象
   */
  async get(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[PureRead] 存储读取失败:",
              chrome.runtime.lastError.message,
            );
            resolve({});
            return;
          }
          resolve(result);
        });
      } catch (e) {
        console.error("[PureRead] 存储访问异常:", e.message);
        resolve({});
      }
    });
  },

  /**
   * 安全写入存储数据
   * @param {Object} data - 要保存的数据
   * @returns {Promise<boolean>} 返回是否成功
   */
  async set(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.set(data, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[PureRead] 存储写入失败:",
              chrome.runtime.lastError.message,
            );
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (e) {
        console.error("[PureRead] 存储写入异常:", e.message);
        resolve(false);
      }
    });
  },

  /**
   * 安全读取本地存储
   * @param {string[]} keys
   * @returns {Promise<Object>}
   */
  async getLocal(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[PureRead] 本地存储读取失败:",
              chrome.runtime.lastError.message,
            );
            resolve({});
            return;
          }
          resolve(result);
        });
      } catch (e) {
        console.error("[PureRead] 本地存储访问异常:", e.message);
        resolve({});
      }
    });
  },

  /**
   * 安全写入本地存储
   * @param {Object} data
   * @returns {Promise<boolean>}
   */
  async setLocal(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (e) {
        resolve(false);
      }
    });
  },
};

// ═══════════════════════════════════════════════════════════
// 数据校验与修复工具
// ═══════════════════════════════════════════════════════════

const DataValidator = {
  /**
   * 确保 settings 对象结构完整
   * @param {Object} settings - 原始设置对象
   * @returns {Object} 修复后的设置对象
   */
  ensureSettings(settings) {
    if (settings === undefined || settings === null || Array.isArray(settings)) {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    if (!settings || typeof settings !== "object") {
      console.warn("[PureRead] 设置数据无效，使用默认值");
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }

    // 确保 global 存在
    if (!settings.global || typeof settings.global !== "object") {
      settings.global = JSON.parse(JSON.stringify(DEFAULT_GLOBAL));
    }

    // 确保 global 的各个字段存在
    if (typeof settings.global.on !== "boolean") {
      settings.global.on = true;
    }
    settings.global.mapping = DataValidator.ensureMapping(settings.global.mapping);
    settings.global.typo = DataValidator.ensureTypo(settings.global.typo);
    settings.global.selectors = DataValidator.ensureSelectors(settings.global.selectors);
    if (!settings.global.features) {
      settings.global.features = JSON.parse(JSON.stringify(DEFAULT_FEATURES));
    }

    // 确保 sites 存在
    if (!settings.sites || typeof settings.sites !== "object") {
      settings.sites = {};
    }

    return settings;
  },

  /**
   * 确保站点数据结构完整
   * @param {Object} siteData - 站点数据
   * @returns {Object} 修复后的站点数据
   */
  ensureSiteData(siteData) {
    if (!siteData || typeof siteData !== "object") {
      return {
        mode: "global",
        mapping: { ...DEFAULT_MAPPING },
        typo: { ...DEFAULT_TYPO },
      };
    }

    if (!siteData.mode) siteData.mode = "global";
    siteData.mapping = DataValidator.ensureMapping(siteData.mapping);
    siteData.typo = DataValidator.ensureTypo(siteData.typo);

    return siteData;
  },

  /**
   * 确保 typo 数据完整
   * @param {Object} typo
   * @returns {Object}
   */
  ensureTypo(typo) {
    if (!typo || typeof typo !== "object") {
      return { ...DEFAULT_TYPO };
    }

    const lineHeight =
      typo.lineHeight !== undefined && typo.lineHeight !== null && typo.lineHeight !== ""
        ? String(typo.lineHeight)
        : DEFAULT_TYPO.lineHeight;
    const fontSize =
      typo.fontSize !== undefined && typo.fontSize !== null && typo.fontSize !== ""
        ? String(typo.fontSize)
        : DEFAULT_TYPO.fontSize;
    const fontWeight =
      typo.fontWeight !== undefined && typo.fontWeight !== null && typo.fontWeight !== ""
        ? String(typo.fontWeight)
        : DEFAULT_TYPO.fontWeight;

    // If enabled is missing (older configs), infer it from whether any typo value differs.
    const enabled =
      typeof typo.enabled === "boolean"
        ? typo.enabled
        : lineHeight !== DEFAULT_TYPO.lineHeight ||
          fontSize !== DEFAULT_TYPO.fontSize ||
          fontWeight !== DEFAULT_TYPO.fontWeight;
    return {
      enabled,
      lineHeight,
      fontSize,
      fontWeight,
    };
  },

  /**
   * 确保 mapping 数据完整
   * @param {Object} mapping
   * @returns {Object}
   */
  ensureMapping(mapping) {
    if (!mapping || typeof mapping !== "object") {
      return { ...DEFAULT_MAPPING };
    }
    return {
      standard: mapping.standard || "",
      mono: mapping.mono || "",
      math: mapping.math || "",
    };
  },

  /**
   * 确保 selectors 数据完整（兼容旧版字符串格式）
   * @param {Object|string} selectors
   * @returns {Object}
   */
  ensureSelectors(selectors) {
    if (typeof selectors === "string") {
      return {
        include: { ...DEFAULT_SELECTOR_RULES, standard: selectors },
        exclude: "",
      };
    }
    if (!selectors || typeof selectors !== "object") {
      return {
        include: { ...DEFAULT_SELECTOR_RULES },
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

    const include = selectors.include;
    return {
      include: {
        standard: include?.standard || "",
        mono: include?.mono || "",
        math: include?.math || "",
      },
      exclude: typeof selectors.exclude === "string" ? selectors.exclude : "",
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 字体名预览
// ═══════════════════════════════════════════════════════════

// 这几组字体把拉丁字母映射成图形符号，用它们渲染自己的名字只会得到一串乱码，
// 用户反而读不出字体叫什么，故这些一律保持用界面字体渲染。
const SYMBOL_FONTS = new Set([
  "webdings",
  "wingdings",
  "wingdings 2",
  "wingdings 3",
  "zapf dingbats",
  "apple symbols",
  "marlett",
  "bookshelf symbol 7",
  "mtextra",
  "ligature symbols",
]);

const FontPreview = {
  isSymbolFont(name) {
    return SYMBOL_FONTS.has(String(name || "").trim().toLowerCase());
  },

  // 字体名能不能用它自身的字形渲染。空串和符号字体都不行 ——
  // 「系统默认」这类占位文案不是字体名，套上只会掉到回退字体。
  canPreview(name) {
    const font = String(name || "").trim();
    return Boolean(font) && !this.isSymbolFont(font);
  },

  // 转成合法的 CSS font-family 值。字体名里的引号和反斜杠必须转义，
  // 否则一个叫 `Foo"Bar` 的字体能把整条声明拆断。
  toFontFamily(name) {
    const escaped = String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}", var(--font)`;
  },

  // 需要预览就返回 font-family 值，否则返回空串 —— 调用方把空串写回
  // style.fontFamily 即可恢复界面字体。
  styleFor(name) {
    return this.canPreview(name) ? this.toFontFamily(name) : "";
  },

  // 把预览样式套到一个元素上（输入框、下拉项、卡片里的字体名都走这里）
  apply(el, name) {
    if (el) el.style.fontFamily = this.styleFor(name);
  },
};

// ═══════════════════════════════════════════════════════════
// 下拉虚拟列表
// ═══════════════════════════════════════════════════════════

// 下拉项的固定行高。必须和 CSS 里的 height 对上：列表项各用自己的字体渲染，
// 字面高度不一，行高一旦交给内容决定，下面的滚动换算就会逐行错位。
// 两处样式（popup.html 的 .dropdown-item、options.html 的 .dropdown-item）都取这个值。
const DROPDOWN_ITEM_HEIGHT = 32;
const DROPDOWN_OVERSCAN = 4; // 视口上下各多渲染几行，快速滚动时不露白

const VirtualList = {
  // 只保留「上下两个占位块 + 可视区内的少量行」。
  //
  // 系统字体常达数百项，且每项都要用各自的字体渲染自己的名字（触发字体加载与
  // 重新度量），全量插入的代价远不止节点数，所以下拉列表必须虚拟化。
  //
  // items 为空时会把列表隐藏并丢掉骨架，由调用方决定怎么恢复显示。
  // renderItem(item) 返回一个等高元素 —— 它不再被本函数尺寸约束，高度由 CSS 定死。
  render(listEl, items, renderItem) {
    if (items.length === 0) {
      listEl.innerHTML = "";
      listEl._virtual = null;
      listEl.style.display = "none";
      return;
    }

    // 必须先可见，否则 clientHeight 为 0，算不出该渲染多少行
    listEl.style.display = "block";

    const view = listEl._virtual || (listEl._virtual = {});
    view.items = items;
    view.renderItem = renderItem;

    // 只在首次（或骨架被上面的空分支清掉后）重建，滚动时不动这两个 spacer
    if (!view.padTop || view.padTop.parentNode !== listEl) {
      listEl.innerHTML = "";
      view.padTop = document.createElement("div");
      view.padBottom = document.createElement("div");
      view.padTop.className = "dropdown-spacer";
      view.padBottom.className = "dropdown-spacer";
      listEl.append(view.padTop, view.padBottom);
    }
    listEl.scrollTop = 0;

    view.paint = () => {
      const total = view.items.length;
      const visibleRows =
        Math.ceil(listEl.clientHeight / DROPDOWN_ITEM_HEIGHT) +
        DROPDOWN_OVERSCAN * 2;
      // first 必须有上界：滚到底时若只按 scrollTop 减去 OVERSCAN 计算，窗口会停在
      // 末尾之前，最后若干行永远不渲染，底部露出一片空白。
      const maxFirst = Math.max(0, total - visibleRows);
      const first = Math.min(
        maxFirst,
        Math.max(
          0,
          Math.floor(listEl.scrollTop / DROPDOWN_ITEM_HEIGHT) - DROPDOWN_OVERSCAN,
        ),
      );
      const last = Math.min(total, first + visibleRows);

      const frag = document.createDocumentFragment();
      for (let i = first; i < last; i++) {
        frag.appendChild(view.renderItem(view.items[i]));
      }

      // 移除上一批可见项
      let node = view.padTop.nextSibling;
      while (node && node !== view.padBottom) {
        const next = node.nextSibling;
        node.remove();
        node = next;
      }

      // 以上都在同一个同步块里完成，浏览器只会在之后布局一次，看不到中间态
      listEl.insertBefore(frag, view.padBottom);
      view.padTop.style.height = `${first * DROPDOWN_ITEM_HEIGHT}px`;
      view.padBottom.style.height = `${(total - last) * DROPDOWN_ITEM_HEIGHT}px`;
    };

    // 用 onscroll 而非 addEventListener：每次渲染都会换新的 paint 闭包，
    // 直接赋值可避免反复注册导致监听器堆积。
    listEl.onscroll = () => view.paint();
    view.paint();
  },
};

// ═══════════════════════════════════════════════════════════
// 字体加载工具
// ═══════════════════════════════════════════════════════════

const FontLoader = {
  FALLBACK_FONTS: [
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
  ],

  /**
   * load() 是否退回了内置兜底列表（即拿不到真实系统字体）。
   * 两种情况会置 true：Firefox 未实现 chrome.fontSettings；
   * 或 API 存在但调用报错。popup 据此决定要不要提示用户手动输入。
   */
  usingFallbackFonts: false,

  /**
   * 加载系统字体列表
   * @returns {Promise<string[]>}
   */
  async load() {
    try {
      // 1. 尝试读取缓存
      const cached = await Storage.getLocal(["fontCache"]);
      let fonts = cached.fontCache || [];

      // 2. 如果有缓存，先用缓存
      if (fonts.length > 0) {
        // 异步更新缓存
        this._refreshCache();
        return fonts;
      }

      // 3. 没有缓存，尝试从 API 获取
      if (chrome.fontSettings && chrome.fontSettings.getFontList) {
        return new Promise((resolve) => {
          chrome.fontSettings.getFontList((fontList) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[PureRead] 字体 API 错误:",
                chrome.runtime.lastError.message,
              );
              this.usingFallbackFonts = true;
              resolve(this.FALLBACK_FONTS);
              return;
            }
            fonts = [...new Set(fontList.map((f) => f.fontId))].sort();
            Storage.setLocal({ fontCache: fonts });
            resolve(fonts);
          });
        });
      }

      // 4. 降级使用内置字体列表（Firefox 等没有 fontSettings）
      this.usingFallbackFonts = true;
      return this.FALLBACK_FONTS;
    } catch (e) {
      console.warn("[PureRead] 字体加载异常:", e.message);
      this.usingFallbackFonts = true;
      return this.FALLBACK_FONTS;
    }
  },

  /**
   * 异步刷新字体缓存
   */
  async _refreshCache() {
    if (!chrome.fontSettings || !chrome.fontSettings.getFontList) return;
    try {
      chrome.fontSettings.getFontList((fontList) => {
        if (!chrome.runtime.lastError && fontList) {
          const fonts = [...new Set(fontList.map((f) => f.fontId))].sort();
          Storage.setLocal({ fontCache: fonts });
        }
      });
    } catch (e) {
      // 静默失败
    }
  },
};

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

const Utils = {
  /**
   * 深拷贝对象
   * @param {Object} obj
   * @returns {Object}
   */
  deepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return {};
    }
  },

  /**
   * 获取当前标签页域名
   * @returns {Promise<string>}
   */
  async getCurrentDomain() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.url) {
        return new URL(tab.url).hostname;
      }
      return "";
    } catch (e) {
      console.error("[PureRead] 获取域名失败:", e.message);
      return "";
    }
  },

  /**
   * 显示 Toast 提示（需要页面有对应容器）
   * @param {string} message
   * @param {string} type - 'success' | 'error' | 'info'
   */
  showToast(message, type = "info") {
    // 可以在页面中实现 toast 容器
    console.log(`[PureRead] ${type.toUpperCase()}: ${message}`);
  },

  /**
   * 防抖函数 - 延迟执行，连续调用只执行最后一次
   * @param {Function} fn - 要防抖的函数
   * @param {number} delay - 延迟时间（毫秒）
   * @returns {Function} 防抖后的函数
   */
  debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fn.apply(this, args);
        timer = null;
      }, delay);
    };
  },

  /**
   * 节流函数 - 固定时间间隔执行
   * @param {Function} fn - 要节流的函数
   * @param {number} interval - 间隔时间（毫秒）
   * @returns {Function} 节流后的函数
   */
  throttle(fn, interval = 100) {
    let lastTime = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      const remaining = interval - (now - lastTime);

      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        lastTime = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          lastTime = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remaining);
      }
    };
  },
};

// 导出（ES Module 不支持时使用全局变量）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_MAPPING,
    DEFAULT_TYPO,
    DEFAULT_SELECTOR_RULES,
    DEFAULT_SELECTORS,
    DEFAULT_GLOBAL,
    DEFAULT_SETTINGS,
    Storage,
    DataValidator,
    FontPreview,
    VirtualList,
    DROPDOWN_ITEM_HEIGHT,
    DROPDOWN_OVERSCAN,
    FontLoader,
    Utils,
  };
}
