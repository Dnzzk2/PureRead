// 全局变量
let allSchemes = [];
let allSettings = {};
let isRippleBound = false;
let allFonts = []; // 系统字体列表

function escapeHTML(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// 初始化
function bindRippleEffect() {
  if (isRippleBound) return;
  isRippleBound = true;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn, .backup-btn, .save-btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = e.clientX - rect.left - 10 + "px";
    ripple.style.top = e.clientY - rect.top - 10 + "px";
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
}

async function init() {
  bindRippleEffect();
  await loadSystemFonts();
  loadData();
  updateStorageInfo();
  bindGlobalEvents();
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
    const selectors = allSettings.global?.selectors || {
      standard: "",
      mono: "",
      math: "",
    };
    if (typeof selectors === "string") {
      // 兼容旧版
      document.getElementById("selectors-standard").value = selectors;
    } else {
      document.getElementById("selectors-standard").value =
        selectors.standard || "";
      document.getElementById("selectors-mono").value = selectors.mono || "";
      document.getElementById("selectors-math").value = selectors.math || "";
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

  show({ title, body, customHTML, confirmText, onConfirm, isDanger }) {
    this.title.innerText = title || "";
    this.body.innerHTML = body || "";
    this.custom.innerHTML = customHTML || "";
    this.confirmBtn.innerText = confirmText || "确定";
    this.confirmBtn.className = isDanger ? "btn btn-danger" : "btn btn-primary";

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

function renderSchemes(schemes) {
  const container = document.getElementById("schemes-container");
  container.innerHTML = "";

  if (schemes.length === 0) {
    container.innerHTML =
      '<div class="empty">还没有保存任何方案，在弹窗中点击“保存”来添加。</div>';
    return;
  }

  schemes.forEach((s, index) => {
    const item = document.createElement("div");
    item.className = "scheme-item";

    const standard = escapeHTML(s.mapping.standard || "系统默认");
    const mono = escapeHTML(s.mapping.mono || "系统默认等宽");

    item.innerHTML = `
      <div class="scheme-info">
        <div class="scheme-title">${escapeHTML(s.name)}</div>
        <div class="scheme-meta">标准: ${standard} · 等宽: ${mono} · 字号: ${escapeHTML(String(s.typo.fontSize))}%</div>
      </div>
      <div class="scheme-actions">
        <button class="action-btn edit-btn" title="编辑名称和详情">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7m-8-5l9-9a2.828 2.828 0 1 1 4 4L11 20l-4 1 1-4 9-9z"></path></svg>
        </button>
        <button class="action-btn del del-btn" title="删除方案">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // 编辑方案
    item.querySelector(".edit-btn").onclick = () => {
      modal.show({
        title: "编辑方案配置",
        body: "",
        customHTML: `
          <div class="form-group">
            <label class="form-label">方案名称</label>
            <input type="text" id="edit-name" class="form-input" value="${escapeHTML(s.name)}" maxlength="12">
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border);">
                <th style="text-align: left; padding: 8px 0; font-size: 13px; font-weight: 700; color: var(--text-light); width: 100px;">字体类型</th>
                <th style="text-align: left; padding: 8px 0; font-size: 13px; font-weight: 700; color: var(--text-light);">字体名称</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">标准字体</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-std" class="form-input font-edit-input" style="margin: 0;" value="${escapeHTML(s.mapping.standard || "")}" placeholder="输入或选择字体" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-std"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">等宽字体</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-mono" class="form-input font-edit-input" style="margin: 0;" value="${escapeHTML(s.mapping.mono || "")}" placeholder="输入或选择字体" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-mono"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">数学公式</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-math" class="form-input font-edit-input" style="margin: 0;" value="${escapeHTML(s.mapping.math || "")}" placeholder="输入或选择字体" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-math"></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        `,
        confirmText: "更新保存",
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

          chrome.storage.sync.set({ schemes: allSchemes }, () => {
            loadData();
          });
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
        title: "确认删除？",
        body: `确定要彻底删除配置方案「${escapeHTML(s.name)}」吗？此操作无法撤销。`,
        confirmText: "立即删除",
        isDanger: true,
        onConfirm: () => {
          allSchemes.splice(index, 1);
          chrome.storage.sync.set({ schemes: allSchemes }, () => {
            loadData();
          });
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
    container.innerHTML =
      '<div class="empty">暂无特定站点记录。所有网站目前都处于“跟随全局”且开关一致的状态，存储零占用。</div>';
    return;
  }

  domains.forEach((d) => {
    const row = document.createElement("div");
    row.className = "site-row";
    const statusText = sites[d].on ? "ON" : "OFF";
    const badgeClass = sites[d].on ? "badge-custom" : "badge-off";

    row.innerHTML = `
      <div class="site-domain">${escapeHTML(d)}</div>
      <div style="display:flex; align-items:center; gap:16px;">
        <span class="badge ${badgeClass}">${statusText}</span>
        <button class="action-btn del site-del" title="移除并恢复默认">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    row.querySelector(".site-del").onclick = () => {
      delete allSettings.sites[d];
      chrome.storage.sync.set({ settings: allSettings }, loadData);
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
    if (txt) txt.innerText = `${bytes} / ${limit} 字节 (Sync 限额)`;
  });
}

function bindGlobalEvents() {
  document.getElementById("clear-sites").onclick = () => {
    modal.show({
      title: "清空所有站点？",
      body: "这将清除所有的域名黑白名单记录（包括关闭的站点和单独定制的站点），所有网站将恢复为默认全局模式。",
      confirmText: "确认清空",
      isDanger: true,
      onConfirm: () => {
        allSettings.sites = {};
        chrome.storage.sync.set({ settings: allSettings }, loadData);
        return true;
      },
    });
  };

  // 保存补充选择器
  document.getElementById("save-selectors").onclick = () => {
    const selectors = {
      standard: document.getElementById("selectors-standard").value,
      mono: document.getElementById("selectors-mono").value,
      math: document.getElementById("selectors-math").value,
    };
    if (!allSettings.global) allSettings.global = {};
    allSettings.global.selectors = selectors;

    chrome.storage.sync.set({ settings: allSettings }, () => {
      updateStorageInfo();
      // 发送通知
      modal.show({
        title: "保存成功",
        body: "补充选择器已保存，刷新页面后生效。",
        confirmText: "好的",
        onConfirm: () => true,
      });
    });
  };

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
        title: "导出成功",
        body: "配置文件已下载，请妥善保存。",
        confirmText: "好的",
        onConfirm: () => true,
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
          throw new Error("无效的配置文件格式");
        }

        modal.show({
          title: "确认导入",
          body: `
            <p>即将导入以下配置：</p>
            <ul style="margin: 12px 0; padding-left: 20px; font-size: 13px;">
              <li>方案数量：${(importData.schemes || []).length} 个</li>
              <li>站点设置：${Object.keys(importData.settings?.sites || {}).length} 个</li>
              <li>导出时间：${importData.exportedAt ? new Date(importData.exportedAt).toLocaleString() : "未知"}</li>
            </ul>
            <p style="color: var(--text-muted); font-size: 12px;">⚠️ 这将覆盖当前的所有配置。</p>
          `,
          confirmText: "确认导入",
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
                title: "导入成功",
                body: "配置已成功恢复，所有设置已生效。",
                confirmText: "好的",
                onConfirm: () => true,
              });
            });
            return true;
          },
        });
      } catch (err) {
        modal.show({
          title: "导入失败",
          body: `文件解析错误：${err.message}`,
          confirmText: "知道了",
          onConfirm: () => true,
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

  inputs.forEach((input) => {
    const dropdownId = "dropdown-" + input.id.replace("edit-", "");
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    // 渲染下拉列表
    const renderDropdown = (filterText) => {
      dropdown.innerHTML = "";
      const filtered = allFonts
        .filter(
          (f) =>
            f.toLowerCase().includes(filterText.toLowerCase()) ||
            filterText === "",
        )
        .slice(0, 50); // 限制显示数量

      if (filtered.length === 0) {
        dropdown.style.display = "none";
        return;
      }

      filtered.forEach((font) => {
        const item = document.createElement("div");
        item.className = "font-dropdown-item";
        item.innerText = font;
        item.style.fontFamily = `"${font}", sans-serif`;
        item.onmousedown = (e) => {
          e.preventDefault();
          input.value = font;
          dropdown.style.display = "none";
        };
        dropdown.appendChild(item);
      });
      dropdown.style.display = "block";
    };

    // 输入时过滤
    input.addEventListener("input", () => {
      renderDropdown(input.value);
    });

    // 聚焦时显示
    input.addEventListener("focus", () => {
      renderDropdown(input.value);
    });

    // 失焦时隐藏
    input.addEventListener("blur", () => {
      setTimeout(() => {
        dropdown.style.display = "none";
      }, 150);
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
        document.getElementById("opt-update-badge").style.display = "inline-block";
        document.getElementById("opt-update-text").innerText = "立即更新 v" + res.latestRelease;
        if (res.releaseUrl) {
          document.getElementById("opt-update-link").href = res.releaseUrl;
        }
      }
    }
  });
}

init();
