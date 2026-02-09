/**
 * PureRead - Background Service Worker (Manifest V3)
 * 处理快捷键命令
 */

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  // 获取当前活动标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // 获取当前设置
  const result = await chrome.storage.sync.get(["settings"]);
  const settings = result.settings || { global: { on: true }, sites: {} };
  const domain = tab.url ? new URL(tab.url).hostname : "";

  // 检查快捷键是否启用
  if (settings.global.shortcutsEnabled === false) return;

  switch (command) {
    case "toggle-extension":
      // 切换当前站点的开关状态
      if (domain) {
        const siteConfig = settings.sites[domain] || {};
        const currentState =
          typeof siteConfig.on === "boolean"
            ? siteConfig.on
            : settings.global.on !== false;
        if (!settings.sites[domain]) settings.sites[domain] = {};
        settings.sites[domain].on = !currentState;
        await chrome.storage.sync.set({ settings });
        // 通知 content script 更新
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: "updateStyles",
            settings,
          });
          await chrome.tabs.sendMessage(tab.id, {
            action: "updateFeatures",
            settings,
          });
        } catch (e) {}
      }
      break;

    case "toggle-focus-mode":
      // 切换当前站点的专注模式
      if (domain) {
        if (!settings.sites[domain]) settings.sites[domain] = {};
        settings.sites[domain].focusMode = !settings.sites[domain].focusMode;
        await chrome.storage.sync.set({ settings });
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: "updateFeatures",
            settings,
          });
        } catch (e) {}
      }
      break;

    case "toggle-dark-mode":
      // 切换暗色模式
      if (!settings.global.features) settings.global.features = {};
      settings.global.features.forceDark = !settings.global.features.forceDark;
      await chrome.storage.sync.set({ settings });
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateFeatures",
          settings,
        });
      } catch (e) {}
      break;

    case "toggle-reading-time":
      // 切换阅读时间显示
      if (!settings.global.features) settings.global.features = {};
      settings.global.features.readingTime =
        !settings.global.features.readingTime;
      await chrome.storage.sync.set({ settings });
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateFeatures",
          settings,
        });
      } catch (e) {}
      break;
  }
});
