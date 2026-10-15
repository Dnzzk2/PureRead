/**
 * PureRead - Background Service Worker (Manifest V3)
 * 定时检查 GitHub Releases 更新
 */

// ====== 更新检测逻辑 ======
function checkForUpdates() {
  fetch("https://api.github.com/repos/Dnzzk2/PureRead/releases/latest")
    .then(res => res.json())
    .then(data => {
      if (data && data.tag_name) {
        const latestVersion = data.tag_name.replace(/^v/, '');
        chrome.storage.local.set({
          latestRelease: latestVersion,
          releaseUrl: data.html_url
        });
      }
    })
    .catch(err => console.log("Check update failed:", err));
}

// 首次安装或启动时检查
chrome.runtime.onInstalled.addListener(checkForUpdates);
chrome.runtime.onStartup.addListener(checkForUpdates);

// 定时任务（每 12 小时检查一次）
// 注意：MV3 的 service worker 每次冷启动都会重新执行顶层代码，而 chrome.alarms.create
// 对同名 alarm 是「取消并重建、计时清零」。若无条件调用，12 小时的周期会被反复重置，
// 实际永远等不到触发（只剩 onInstalled / onStartup 两条路径）。故必须先查再建。
const UPDATE_ALARM_NAME = "checkUpdate";
const UPDATE_PERIOD_MINUTES = 12 * 60;

chrome.alarms
  .get(UPDATE_ALARM_NAME)
  .then((existing) => {
    if (existing) return;
    chrome.alarms.create(UPDATE_ALARM_NAME, {
      periodInMinutes: UPDATE_PERIOD_MINUTES,
    });
  })
  .catch((err) => {
    console.warn("[PureRead] 更新检查定时器初始化失败:", err.message);
  });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM_NAME) {
    checkForUpdates();
  }
});
