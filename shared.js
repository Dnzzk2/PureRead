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

const DEFAULT_SELECTORS = {
  standard: "",
  mono: "",
  math: "",
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
  selectors: { ...DEFAULT_SELECTORS },
  features: JSON.parse(JSON.stringify(DEFAULT_FEATURES)),
};

const DEFAULT_SETTINGS = {
  global: { ...DEFAULT_GLOBAL },
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
      return { standard: selectors, mono: "", math: "" };
    }
    if (!selectors || typeof selectors !== "object") {
      return { ...DEFAULT_SELECTORS };
    }
    return {
      standard: selectors.standard || "",
      mono: selectors.mono || "",
      math: selectors.math || "",
    };
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
      if (chrome.fontSettings) {
        return new Promise((resolve) => {
          chrome.fontSettings.getFontList((fontList) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[PureRead] 字体 API 错误:",
                chrome.runtime.lastError.message,
              );
              resolve(this.FALLBACK_FONTS);
              return;
            }
            fonts = [...new Set(fontList.map((f) => f.fontId))].sort();
            Storage.setLocal({ fontCache: fonts });
            resolve(fonts);
          });
        });
      }

      // 4. 降级使用内置字体列表
      return this.FALLBACK_FONTS;
    } catch (e) {
      console.warn("[PureRead] 字体加载异常:", e.message);
      return this.FALLBACK_FONTS;
    }
  },

  /**
   * 异步刷新字体缓存
   */
  async _refreshCache() {
    if (!chrome.fontSettings) return;
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
    DEFAULT_SELECTORS,
    DEFAULT_GLOBAL,
    DEFAULT_SETTINGS,
    Storage,
    DataValidator,
    FontLoader,
    Utils,
  };
}
