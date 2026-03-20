<p align="center">
  <img src="./icon.png" height="128" alt="PureRead Logo">
</p>

<p align="center">Your font, your rules. A professional, lightweight Chrome extension that provides you with an excellent web reading experience.</p>
<p align="center">你的字体，你做主。一款专业、轻量的浏览器扩展，为你提供卓越的网页阅读体验。</p>

> [!IMPORTANT]
> PureRead 诞生的核心初衷是提供 **「网页字体更换」** 体验。

---

## 功能展示

### 1. 基础控制与阅读辅助面板

这是扩展的交互入口，包含站点开关与基础环境优化：

- **站点策略切换**：支持「跟随全局」同步样式，或开启「单独定制」为特定网站保存独立的排版参数。
- **阅读增强 (辅助功能)**：内置四项基于视觉交互的锦上添花功能，旨在提升阅读沉浸感。
- **快捷键系统**：提供自定义快速热键，支持开启/关闭扩展插件。

|                                               主控面板 - 浅色                                                |                                                  主控面板 - 深色                                                  |
| :----------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------: |
| <img src="https://cdn.jsdelivr.net/gh/Dnzzk2/image-hosting@main/PureRead/PureRead-popup.png" height="350" /> | <img src="https://cdn.jsdelivr.net/gh/Dnzzk2/image-hosting@main/PureRead/PureRead-popup-dark.png" height="350" /> |

### 2. 主旋律：字体选择与排版细节

本项目的主要功能模块，通过对内容类型的拆解，实现网页视觉的精致统一：

- **三维度字体设置**：将内容拆分为 **标准字体**、**代码/等宽** 以及 **数学公式** 三个维度，解决常见插件一刀切导致排版紊乱的问题。
- **参数精细调节**：提供 **行间距**、**字号缩放** 以及 **字重补偿** 的灵敏微调。

|                                                字体选择与排版 - 浅色                                                |                                                  字体选择与排版 - 深色                                                   |
| :-----------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------: |
| <img src="https://cdn.jsdelivr.net/gh/Dnzzk2/image-hosting@main/PureRead/PureRead-popup-select.png" height="400" /> | <img src="https://cdn.jsdelivr.net/gh/Dnzzk2/image-hosting@main/PureRead/PureRead-popup-select-dark.png" height="400" /> |

### 3. 配置方案与深度适配

针对特定场景的进阶功能，确保存储与样式匹配：

- **方案保存**：支持将当前的调节参数管理并打包，方便一键切换。
- **补充 CSS 选择器**：支持手动输入特定的选择器，确保样式能精准覆盖特殊的网页区域。

|                                                 方案与选择器 - 浅色                                                  |                                                    方案与选择器 - 深色                                                    |
| :------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------: |
| <img src="https://cdn.jsdelivr.net/gh/Dnzzk2/image-hosting@main/PureRead/PureRead-popup-setting.png" height="350" /> | <img src="https://cdn.jsdelivr.net/gh/Dnzzk2/image-hosting@main/PureRead/PureRead-popup-setting-dark.png" height="350" /> |

### 4. 站点管理与控制中心 (Options)

选项页面提供了完整的配置看板，涵盖了存储监控、全局 CSS 注入以及数据备份等功能。

|                                                            控制中心                                                             |
| :-----------------------------------------------------------------------------------------------------------------------------: |
| <img src="https://cdn.jsdelivr.net/gh/Dnzzk2/image-hosting@main/PureRead/PureRead-options.png" height="400" alt="Options Page"> |

---

## 快速开始

### Chromium 内核 (Chrome / Edge / Brave 等)

1. 前往 [Releases](https://github.com/Dnzzk2/PureRead/releases) 下载最新版本的 `.zip` 压缩包并解压。
2. 打开 `chrome://extensions/` 页面，开启 **“开发者模式”**。
3. 点击 **“加载已解解压的扩展程序”**，选择解压后的文件夹即可。

### Firefox 内核

1. 使用 [CRX Installer](https://addons.mozilla.org/zh-CN/firefox/addon/crxinstaller/) 等辅助工具导入安装包。

> [!WARNING]
> **火狐版已知限制**：Firefox 版本 **无法自动获取系统字体列表**。建议用户在设置中通过手动输入字体名称来生效。

---

## 快捷键

| 功能                 | 快捷键            |
| :------------------- | :---------------- |
| **开/关当前站点**    | `Alt + Shift + P` |
| **切换专注模式**     | `Alt + Shift + F` |
| **切换暗色模式**     | `Alt + Shift + D` |
| **切换阅读时间显示** | `Alt + Shift + R` |

---

## 社区与支持

感谢以下社区的支持与讨论：

- [Linux.do](https://linux.do/)

## 开源协议

本项目采用 [MIT License](./LICENSE) 。

---

## Vibe Coding

本项目是一个典型的 **Vibe Coding** 产物。所有的代码生成、功能讨论及 README 的多轮迭代均在开发者与 AI 的“对话灵感”中完成。我们追求极致的视觉直觉与流畅的开发律动感。
