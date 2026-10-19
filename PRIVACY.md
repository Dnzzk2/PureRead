# 隐私说明 · Privacy Policy

**PureRead 不收集你的任何数据。** 没有账号，没有遥测，没有统计，没有广告。

最后更新：2026-10-19 · 适用于 v1.2.0

---

## 一、不做什么

- 不收集、不上传任何个人信息；
- 没有账号体系，不需要登录；
- 没有埋点、分析、崩溃上报；
- 不读取网页正文、表单内容、输入内容、密码、Cookie、浏览历史或书签；
- 不包含任何广告或推广代码，不向第三方出售或共享数据。

## 二、数据存在哪里

全部存在**你自己的浏览器**里，开发者无从访问。

**`chrome.storage.sync`** —— 随你的浏览器账号（Chrome 同步 / Edge 同步等）在设备间同步：

| 键         | 内容                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `settings` | 总开关、三档字体映射、额外匹配与排除的 CSS 选择器、**你单独设置过的站点域名** |
| `schemes`  | 你保存的配置方案                                                            |

**`chrome.storage.local`** —— 只在本机，不同步：

| 键                            | 内容                               |
| ----------------------------- | ---------------------------------- |
| `uiLocale`                    | 界面语言偏好                       |
| `uiFont`                      | 界面字体偏好（系统 / 本机字体）    |
| `fontCache`                   | 本机字体列表的缓存                 |
| `latestRelease` / `releaseUrl` | 最近一次更新检查的结果             |

同步由浏览器自己完成，数据存在你的账号里。关掉浏览器同步，这些数据就只留在本机。

## 三、什么时候会联网

只有一个固定的只读请求，除 HTTP 请求本身必需的 IP、User-Agent、Referer 外**不携带任何你的数据**：

| 目标                                                  | 时机                                | 用途                         |
| ----------------------------------------------------- | ----------------------------------- | ---------------------------- |
| `api.github.com/repos/Dnzzk2/PureRead/releases/latest` | 安装时、浏览器启动时，此后每 12 小时 | 读取最新版本号，用于提示更新 |

扩展界面字体只使用系统字体或你本机已安装的字体，不加载任何远程字体。

## 四、页面拾取读什么

在页面上使用「页面拾取」时，PureRead 会读取**你点中的那一个元素**的标签名、class、id 以及它在文档里的位置，拼成一条 CSS 选择器字符串（例如 `.article > p:nth-child(3)`）。

这条字符串会存进**你自己的**设置里（`chrome.storage.sync`），并随浏览器同步。除此之外，页面内容不出浏览器。

## 五、权限用途

| 权限           | 用途                                             |
| -------------- | ------------------------------------------------ |
| `storage`      | 保存上面那些设置                                 |
| `activeTab`    | 你打开扩展时读取当前标签页地址，用于匹配站点规则 |
| `fontSettings` | 读取本机已安装的字体列表，填进字体下拉框         |
| `alarms`       | 每 12 小时触发一次更新检查                       |

manifest 中没有 `host_permissions` 字段 —— 扩展不需要常驻的跨域访问权（更新检查靠 GitHub API 自身的 CORS 即可完成）。

内容脚本按 `<all_urls>` 注入到所有网站，这是把字体样式写进任意网页所必需的一项访问能力；它只向页面**写入**一个 `<style>` 标签，除第四节所述的拾取外不读取页面内容。

## 六、第三方

- **GitHub** —— 更新检查会请求 GitHub 的公开 API，受 [GitHub 隐私声明](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement) 约束。

除此之外没有其他第三方。

## 七、变更与联系

本说明随扩展一起更新，任何改动都留在本仓库的提交记录里；有实质变化时会一并更新顶部的日期。

发现问题或认为有遗漏，请到 [Issues](https://github.com/Dnzzk2/PureRead/issues) 提出。

---

# Privacy Policy (English)

**PureRead collects none of your data.** No account, no telemetry, no analytics, no ads.

Last updated: 2026-10-19 · Applies to v1.2.0

## 1. What PureRead does not do

- It does not collect or transmit any personal information.
- There is no account system and no sign-in.
- There is no tracking, analytics, or crash reporting.
- It does not read page content, form entries, typed input, passwords, cookies, browsing history, or bookmarks.
- It contains no advertising or promotional code, and it never sells or shares data with third parties.

## 2. Where your data lives

Everything stays in **your own browser**. The developer cannot reach any of it.

**`chrome.storage.sync`** — synced across your devices through your own browser account (Chrome Sync, Edge Sync, and so on):

| Key        | Contents                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `settings` | Master switch, the three font mappings, your include/exclude CSS selectors, **the site domains you customized** |
| `schemes`  | Configuration schemes you saved                                                                    |

**`chrome.storage.local`** — this device only, never synced:

| Key                           | Contents                              |
| ----------------------------- | ------------------------------------- |
| `uiLocale`                    | Interface language preference         |
| `uiFont`                      | Interface font preference (system / local font) |
| `fontCache`                   | Cached list of fonts installed locally |
| `latestRelease` / `releaseUrl` | Result of the last update check       |

Syncing is handled entirely by the browser, and the data lives in your account. With browser sync turned off, none of it leaves your device.

## 3. When PureRead goes online

There is exactly one fixed, read-only request. Apart from the IP, User-Agent, and Referer that any HTTP request must carry, **it sends none of your data**:

| Destination                                                   | When                                                         | Purpose                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| `api.github.com/repos/Dnzzk2/PureRead/releases/latest`         | On install, on browser startup, and every 12 hours thereafter | Read the latest version number for update notices |

The extension's own interface uses the system font or a locally installed font only; no remote font is loaded.

## 4. What element picking reads

When you pick an element on a page, PureRead reads the tag name, class, id, and document position of **the single element you clicked**, and assembles them into a CSS selector string (for example `.article > p:nth-child(3)`).

That string is saved to **your own** settings (`chrome.storage.sync`) and syncs with your browser. Beyond that, page content never leaves the browser.

## 5. Why each permission is needed

| Permission     | Purpose                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `storage`      | Save the settings listed above                                              |
| `activeTab`    | Read the current tab's address when you open the extension, to match site rules |
| `fontSettings` | Read the list of locally installed fonts to populate the font dropdown       |
| `alarms`       | Trigger an update check every 12 hours                                       |

The manifest declares no `host_permissions` field — the extension needs no standing cross-origin access, since the update check works through GitHub's API CORS headers alone.

A content script is injected on all sites (`<all_urls>`), the access this feature genuinely requires in order to write font styles into any page. It only **writes** a single `<style>` tag into the page; apart from element picking described in section 4, it does not read page content.

## 6. Third parties

- **GitHub** — the update check calls GitHub's public API and is governed by the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement).

There are no other third parties.

## 7. Changes and contact

This policy is updated alongside the extension, and every change remains in this repository's commit history. The date at the top is revised whenever the substance changes.

If you spot a problem or believe something is missing, please open an [issue](https://github.com/Dnzzk2/PureRead/issues).
