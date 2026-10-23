# 页面副本与启动器（Pages）

`index.html` 曾经是 557 行的单文件：约 250 行 DOM + 约 300 条 `<script>`。现在它被模块化、脚本化了：

```
index.html                          本地启动器（生成）：识别语言 → 重定向。双击入口始终是它
locales/
├── _html/                          与语言无关的页面模板片段
│   ├── shell.html                  <head>、<body> 骨架；{{> 片段}} 插入各屏；{{scripts}} 插入脚本块
│   ├── screens/  title campaign hangar brief debrief settings codex help changelog .html
│   └── overlays/ radio sysnote pause .html
└── zh-CN/                          一种语言一个目录（以后加 en/ 同构）
    ├── text/**.json                文本（含 text/html/*.json：页面里的静态文字）
    ├── text.gen.js                 生成：该语言的 Text.load(...)
    └── html/index.html             生成：该语言的页面副本（页面单独一个文件夹）
```

## 为什么是"副本"

页面里的静态文字是**构建期**填进去的，不是运行时用 JS 往 DOM 里灌：副本本身就是一份完整的、该语言的 html，
没有闪烁，也不依赖脚本执行顺序。不同语言 = 不同的 html 副本；启动器只负责选一份。

## 模板语法

| 写法 | 含义 |
|---|---|
| `{{> screens/title}}` | 插入片段 `locales/_html/screens/title.html` |
| `{{scripts}}` | 脚本块：顺序来自 `tools/build/gen-index.js`，语言包 `locales/zh-CN/text.gen.js`（回退语言，始终加载）紧跟 `js/core/text.js`，非 zh-CN 语言再加载自己的 |
| `{{lang}}` `{{base}}` | `<html lang>` 与 `<base href="../../../">`（副本在 `locales/<语言>/` 下，`<base>` 让 `css/` `js/` 路径照旧写） |
| `{{html.屏.名字}}` | 文本，取自 `locales/<语言>/text/html/*.json`；值里可以带内联标记（`<b>` `<span class="ok">` …） |

写在片段里的 HTML 注释是给开发者看的，不进生成的页面。非回退语言缺某个键时回退到 zh-CN 并警告；回退语言也缺则报错。

## 启动器

`index.html` 是生成物（`tools/build/gen-pages.js`），极简：按顺序决定语言 —— `?lang=` → `localStorage['ml.lang']`
→ 浏览器语言 → 默认 zh-CN，然后 `location.replace('locales/<语言>/html/index.html' + 查询串 + 锚点)`。
带 `<noscript>` 与 `<meta refresh>` 兜底。可用语言列表由 `gen-pages` 扫描 `locales/*/text/` 写入。
游戏内的语言切换界面还没做（启动器已经会读 `ml.lang`，到加第二种语言时在设置页里写它即可）。

## 命令

```bash
node tools/build/gen-locales.js        # 改了 locales/**/text 下的 JSON 之后：重新生成 text.gen.js
node tools/build/gen-pages.js          # 改了模板片段、文本、或增删了 js 文件之后：重新生成页面副本与启动器
node tools/build/gen-pages.js --check  # 只检查（smoke 与 CI 用）
node tools/build/gen-pages.js --pseudo # 另生成 locales/pseudo/html/index.html：静态文本也包成 ⟦…⟧（gitignore，仅开发）
```

生成物（`text.gen.js`、各语言 `index.html`、启动器 `index.html`）都提交进仓库，`smoke.js` 断言它们与现场重新生成的一致，
忘了跑会在测试里炸，而不是在玩家屏幕上白屏或缺字。

## 加一种语言

1. 复制 `locales/zh-CN/text/` 为 `locales/<新语言>/text/`，翻译 JSON 里的值（键不动；缺的键会回退 zh-CN）。
2. `node tools/build/gen-locales.js && node tools/build/gen-pages.js`。
3. 启动器会自动把它列入可用语言；浏览器语言匹配时直接进入。

## 迁移说明

旧 `index.html` 用一次性脚本 `tools/build/extract-html.js` 拆成片段与 JSON（55 条静态文本）。迁移时用"旧页面 vs 新页面"的
可见文本与结构逐段比对确认：除 `<base>`、脚本块与语言包外**完全一致**。
