# AGENTS.md

## 项目概况

PureRead 是一个基于 Chrome/Edge Manifest V3 的原生浏览器扩展，用于增强网页阅读体验。仓库不使用 Node.js、打包器或前端框架，核心代码均为直接可加载的原生 HTML/CSS/JavaScript 文件。

代理在这个仓库中工作时，默认目标应是：在不引入额外构建链的前提下，保持扩展可直接通过“加载已解压的扩展程序”运行。

## 仓库结构

- `manifest.json`：扩展入口与权限声明，定义 `content_scripts`、`background.service_worker`、`commands`、`options_page`、`action.default_popup`
- `content.js`：核心阅读增强逻辑，负责样式注入、阅读进度条、专注模式、暗色模式、阅读时间等运行时行为
- `background.js`：MV3 service worker，主要处理快捷键命令、更新检查、定时任务
- `shared.js`：共享默认配置、存储读写封装、数据修复/校验逻辑
- `popup.html` / `popup.js`：弹出面板 UI 与交互
- `options.html` / `options.js`：设置页 UI 与交互
- `build.py`：发布打包脚本，读取 `manifest.json` 中版本号并生成 ZIP
- `README.md`：对外说明文档，功能描述与快捷键信息应尽量与实现保持一致

## 关键数据约定

不要随意改动设置结构。当前核心存储位于 `chrome.storage.sync` 的 `settings` 键下，基本形状如下：

```js
{
  global: {
    on: true,
    mapping: { standard, mono, math },
    typo: { enabled, lineHeight, fontSize, fontWeight },
    selectors: { standard, mono, math },
    features: {
      progressBar: { enabled, color },
      // 其余全局功能位按现有代码扩展
    }
  },
  sites: {
    [domain]: {
      on,
      mode,       // "global" 或 "custom"
      mapping,
      typo,
      focusMode
    }
  }
}
```

必须遵守的行为规则：

- 站点级优先级高于全局级
- `sites[domain].mode === "custom"` 时，字体映射和排版使用站点配置，否则回退到全局配置
- 站点开关 `sites[domain].on` 可覆盖 `global.on`
- `focusMode` 当前是站点级配置，不应回写到全局默认结构中
- 内容样式通过 `#pure-read-injector` 注入；新增样式机制时优先复用这一入口，而不是散落多个 `<style>` 标签

## 修改原则

- 优先做最小改动，避免大规模重写原生脚本
- 保持无框架、无构建依赖的实现方式，除非用户明确要求引入新工具链
- 变更功能时，同时检查 `manifest.json`、相关 UI 文案和 `README.md` 是否需要同步
- 变更快捷键时，同时检查：
  - `manifest.json` 中的 `commands`
  - `background.js` 中的命令处理分支
  - `README.md` 中的快捷键说明
- 变更存储结构时，优先在 `shared.js` 的默认值与数据修复逻辑中补齐兼容
- 修改 `content.js` 时，注意不要破坏代码块、图标、播放器、公式等排除规则
- 修改 DOM 注入逻辑时，注意扩展运行目标是任意网站，必须尽量降低对宿主页面的侵入性

## 开发与验证

本仓库没有自动化测试。默认验证方式是手工验证。

### 本地加载

1. 打开 Chromium 内核浏览器扩展管理页
2. 启用开发者模式
3. 选择当前仓库根目录进行“加载已解压的扩展程序”
4. 修改代码后手动点击“刷新”重新加载扩展

### 建议手工检查项

- 普通文章页：字体替换、字号、行高是否生效
- 含代码块页面：代码字体不应被正文样式误伤
- 含数学公式页面：MathJax/KaTeX 不应被错误替换
- 有侧栏或广告页面：专注模式是否仅弱化非正文区域
- 长页面：阅读进度条是否正确更新
- 弹窗和设置页：读写设置后，当前页面是否即时响应
- 快捷键：重新加载扩展后是否按预期触发

### 打包

发布包由以下命令生成：

```powershell
python build.py
```

该脚本会读取 `manifest.json` 的版本号，并生成 `PureRead-v<version>.zip`。如果新增发布文件，记得同步更新 `build.py` 中的 `include_files`。

## 文件级建议

### `content.js`

- 这里是风险最高的文件，任何改动都可能影响所有网页
- 优先复用现有消息入口：`updateStyles` / `updateFeatures`
- 优先复用现有 DOM id，例如 `pure-read-injector`、`pure-read-progress`
- 谨慎增加高频监听器；滚动、resize、MutationObserver 相关逻辑要考虑性能

### `background.js`

- 保持 service worker 代码简洁，不要假设长期常驻内存
- 命令处理后如需刷新页面效果，优先通过消息通知 content script
- 涉及外部请求时，确认 MV3 权限和失败回退路径

### `shared.js`

- 新增配置项时，先补默认值，再补校验/修复逻辑
- 存储读写失败要保持可恢复，不要让扩展因为异常配置直接失效

### `popup.js` / `options.js`

- 这两个文件主要负责读写设置与驱动 UI
- 避免把业务规则复制一份到 UI 层；能复用共享结构就复用
- UI 文案目前以中文为主，新增文案保持一致

## 禁止事项

- 不要引入 npm、bundler、TypeScript、React、Vue，除非用户明确要求
- 不要把简单修改重构成大型架构调整
- 不要删除现有兼容逻辑，除非能确认没有历史数据迁移风险
- 不要假设页面 DOM 结构固定；这是一个运行在任意网站上的扩展
- 不要在未经确认的情况下新增高权限浏览器权限

## 交付预期

完成修改后，代理的最终说明应至少包含：

- 改了什么
- 为什么这样改
- 是否同步更新了相关入口文件或文档
- 是否执行了手工验证；如果没有，明确说明未验证

