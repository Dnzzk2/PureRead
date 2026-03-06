# PureRead

> **Note**: 本项目由 **Vibe Coding** 生成，核心逻辑与代码实现均由 AI 辅助完成，并非完全手写。旨在探索 AI 辅助编程的潜力与最佳实践。

PureRead 是一款专注于提升网页阅读体验的浏览器扩展（Chrome/Edge）。它提供字体替换、排版调节、阅读进度可视化、专注模式等功能，帮助你在任何网页上获得更舒适的阅读体验。

## 安装与使用 (Installation & Usage)

### Chromium 内核浏览器 (Chrome / Edge 等)

1. Clone 本仓库到本地，或下载 ZIP 包并解压。
2. 打开 Chrome/Edge 浏览器，访问 `chrome://extensions/` (Edge 为 `edge://extensions/`)。
3. 开启右上角或左下角的 **"开发者模式" (Developer mode)**。
4. 点击 **"加载已解压的扩展程序" (Load unpacked)**，选择本项目根目录。

### Firefox 浏览器 (通过 CRX Installer)

1. 在 Firefox 浏览器中，安装并启用 [CRX Installer](https://addons.mozilla.org/en-US/firefox/addon/crxinstaller/) 扩展（或其他可以将 Chrome 扩展转换为 Firefox 格式的工具）。
2. 打包本扩展为 `.crx` 或直接打为 `.zip` 包。
3. 使用 CRX Installer 加载并安装，以在 Firefox 内核中使用。

## 核心逻辑 (Logic & Rules)

本项目遵循以下核心设计规则：

1. **样式注入机制 (Injection System)**
    - 使用 `document_start` 时机注入核心 CSS 变量，尽可能减少页面闪烁（FOUC）。
    - 通过动态创建 `<style id="pure-read-injector">` 标签挂载样式。
    - 使用 CSS 变量（`--pr-fs`, `--pr-lh`）控制排版，通过 JS 修改根元素变量实现实时预览，性能极高。

2. **配置优先级 (Configuration Priority)**
    - **站点级 (Domain Specific)** > **全局级 (Global)**。
    - 扩展会自动识别当前域名。若用户为当前域名单独设置了开关或样式（"Custom" 模式），则忽略全局设置。
    - 支持“黑名单”与“白名单”逻辑：
      - 全局开启时，可单独关闭特定站点（黑名单）。
      - 全局关闭时，可单独开启特定站点（白名单）。

3. **智能排除 (Smart Exclusion)**
    - 为了防止破坏网页功能，内置了严格的排除规则（`exclude` 对象）。
    - **不处理**：图标（FontAwesome/Iconfont）、代码编辑器（CodeMirror/Monaco）、视频播放器、数学公式（MathJax/KaTeX 独立处理）。

4. **阅读增强功能 (Reading Enhancement)**
    - **阅读进度条**：在页面顶部显示当前阅读进度（0-100%），支持自定义颜色。默认翡翠绿 `#10b981`。
    - **专注模式**：一键淡化侧边栏、广告、导航栏等非正文区域（站点级记忆）。悬停时恢复可见。
    - **智能暗色模式**：自动检测网站是否支持原生暗色主题。如果支持，触发网站内置暗色模式；如果不支持，使用 CSS filter 反转颜色（fallback）。
    - **阅读时间估算**：自动计算正文字数，显示预计阅读时间（中文 400字/分钟，英文 200词/分钟）。

5. **快捷键支持 (Keyboard Shortcuts)**
    - `Alt+Shift+P`：开关当前站点
    - `Alt+Shift+F`：切换专注模式
    - `Alt+Shift+D`：切换暗色模式
    - `Alt+Shift+R`：切换阅读时间显示

6. **构建与发布 (Build & Release)**
    - 项目内置了 `build.py` 自动化脚本。
    - 运行 `python build.py` 即可自动读取版本号并生成发布用的 ZIP 压缩包。

## 学习价值 (Learning Context)

如果你正在学习浏览器扩展开发或原生 Web 技术，本项目是一个很好的参考案例：

1. **Manifest V3 架构**
    - 学习如何使用 MV3 的 `storage.sync` 进行跨设备配置同步。
    - 理解 `content_scripts` 与 `popup`/`options` 页面之间的通信机制（`chrome.runtime.sendMessage`）。

2. **Vanilla JS & 无框架开发**
    - 本项目未使用 React/Vue 等框架，纯原生 JS (`popup.js`, `content.js`) 实现。
    - 适合学习 DOM 操作、事件委托、防抖（Debounce）处理高频输入（如滑块拖动）。

3. **高级 CSS 技巧**
    - 深入理解 CSS 权重（Specificity）与 `!important` 的攻防。
    - 学习 CSS 变量（Custom Properties）在动态主题中的应用。
    - 学习如何编写健壮的 CSS 选择器（`:not()` 伪类连用技巧）来精准命中目标文本而不误伤 UI 组件。

4. **数据持久化与状态管理**
    - 观察如何设计扁平化的数据结构来存储全局设置与成百上千个站点的独立配置。

## 协议 (License)

本项目采用 **MIT 协议** 开源。
这意味着你可以自由地使用、复制、修改、合并、出版发行、散布、再授权及贩售本软件及其副本。

详见 [LICENSE](./LICENSE) 文件。
