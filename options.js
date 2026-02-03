// 全局变量
let allSchemes = [];
let allSettings = {};
let allFonts = []; // 系统字体列表

// 初始化
async function init() {
  await loadSystemFonts();
  loadData();
  updateStorageInfo();
  bindGlobalEvents();
}

// 加载系统字体
async function loadSystemFonts() {
  const FALLBACK_FONTS = [
    "Microsoft YaHei", "SimSun", "Arial", "Consolas",
    "PingFang SC", "Hiragino Sans GB", "Source Han Sans",
    "Noto Sans SC", "Roboto", "Inter", "Fira Code"
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
    allSettings = res.settings || { sites: {}, global: {} };
    allSchemes = res.schemes || [];
    renderSchemes(allSchemes);
    renderSites(allSettings.sites);
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
    this.confirmBtn.innerText = confirmText || "下发";
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

    const standard = s.mapping.standard || "系统默认";
    const mono = s.mapping.mono || "系统默认等宽";

    item.innerHTML = `
      <div class="scheme-info">
        <div class="scheme-title">${s.name}</div>
        <div class="scheme-meta">标准: ${standard} · 等宽: ${mono} · 字号: ${s.typo.fontSize}%</div>
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
            <input type="text" id="edit-name" class="form-input" value="${s.name}" maxlength="12">
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
                    <input type="text" id="edit-std" class="form-input font-edit-input" style="margin: 0;" value="${s.mapping.standard || ''}" placeholder="输入或选择字体" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-std"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">等宽字体</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-mono" class="form-input font-edit-input" style="margin: 0;" value="${s.mapping.mono || ''}" placeholder="输入或选择字体" autocomplete="off">
                    <div class="font-dropdown" id="dropdown-mono"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-size: 14px; font-weight: 600;">数学公式</td>
                <td style="padding: 12px 0;">
                  <div class="font-input-wrapper">
                    <input type="text" id="edit-math" class="form-input font-edit-input" style="margin: 0;" value="${s.mapping.math || ''}" placeholder="输入或选择字体" autocomplete="off">
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
        body: `确定要彻底删除配置方案 "${s.name}" 吗？此操作无法撤销。`,
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
    return sites[d].on === false || sites[d].mode === "custom";
  });

  if (domains.length === 0) {
    container.innerHTML =
      '<div class="empty">暂无特定站点记录。当你在某个网页关闭开关或单独设置时，它们会出现在这里。</div>';
    return;
  }

  domains.forEach((d) => {
    const row = document.createElement("div");
    row.className = "site-row";
    const statusText = sites[d].on ? "ON" : "OFF";
    const badgeClass = sites[d].on ? "badge-custom" : "badge-off";

    row.innerHTML = `
      <div class="site-domain">${d}</div>
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
}

// 绑定字体下拉选择事件
function bindFontDropdowns() {
  const inputs = document.querySelectorAll('.font-edit-input');

  inputs.forEach(input => {
    const dropdownId = 'dropdown-' + input.id.replace('edit-', '');
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    // 渲染下拉列表
    const renderDropdown = (filterText) => {
      dropdown.innerHTML = '';
      const filtered = allFonts.filter(f =>
        f.toLowerCase().includes(filterText.toLowerCase()) || filterText === ''
      ).slice(0, 50); // 限制显示数量

      if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
      }

      filtered.forEach(font => {
        const item = document.createElement('div');
        item.className = 'font-dropdown-item';
        item.innerText = font;
        item.style.fontFamily = `"${font}", sans-serif`;
        item.onmousedown = (e) => {
          e.preventDefault();
          input.value = font;
          dropdown.style.display = 'none';
        };
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    };

    // 输入时过滤
    input.addEventListener('input', () => {
      renderDropdown(input.value);
    });

    // 聚焦时显示
    input.addEventListener('focus', () => {
      renderDropdown(input.value);
    });

    // 失焦时隐藏
    input.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 150);
    });
  });
}

init();
