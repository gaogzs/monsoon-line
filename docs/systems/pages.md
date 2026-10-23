# 页面副本与启动器（Pages）

`index.html` 曾经是 557 行的单文件：约 250 行 DOM + 约 300 条 `<script>`。现在页面由模板片段 + 文本在构建期生成，根目录的 `index.html` 只剩一个启动器：

```
index.html                          本地启动器（生成）：识别语言 → 重定向。双击入口始终是它
locales/
├── _html/                          与语言无关的页面模板片段
│   ├── shell.html                  <head>、<body> 骨架；{{> 片段}} 插入各屏；{{scripts}} 插入脚本块
│   ├── screens/  title campaign hangar brief debrief settings codex help changelog（各一个 .html）
│   └── overlays/ radio sysnote pause（各一个 .html）
└── zh-CN/                          一种语言一个目录（以后加 en/ 同构）
    ├── text/**.json                文本（含 text/html/*.json：页面里的静态文字，每个片段一个文件，shell.json 是骨架）
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
| `{{lang}}` `{{base}}` | `<html lang>` 与 `<base href="../../../">`（副本在 `locales/<语言>/html/` 下，`<base>` 指回仓库根，让 `css/` `js/` `locales/` 路径照旧从根写） |
| `{{html.屏.名字}}` | 文本，取自 `locales/<语言>/text/html/*.json`；值里可以带内联标记（`<b>` `<span class="ok">` …） |

写在片段（含 `shell.html`）里的 HTML 注释是给开发者看的，不进生成的页面。非回退语言缺某个 `{{html.*}}` 键时回退到 zh-CN 并警告；回退语言也缺（或写错了键名）则报错、退出码 1。`{{> 片段}}` 可以嵌套。
文本值里的内联标记原样写进页面；伪语言副本把值包成 `⟦…⟧` 并按 30% 补 `~`。

## 启动器

根目录的 `index.html` 是生成物（`tools/build/gen-pages.js` 里的 `launcher()`），极简：按顺序决定语言 —— `?lang=` → `localStorage['ml.lang']`
→ 浏览器语言（完全匹配，或语言代码的主体匹配，如 `zh-TW` 匹配 `zh-CN`）→ 默认 zh-CN，然后 `location.replace('locales/<语言>/html/index.html' + 查询串 + 锚点)`，
所以 `?lang=pseudo` 之类的查询串会原样带到页面副本里（`pseudo` 不在可用语言列表里，启动器落到默认语言，由 `text.js` 在运行时处理它）。
带 `<noscript>` 与 1 秒的 `<meta refresh>` 兜底。可用语言列表由 `gen-pages` 扫描 `locales/*/text/`（`GL.languages()`）写入。
游戏内的语言切换界面还没做（启动器已经会读 `ml.lang`，到加第二种语言时在设置页里写它即可）。

## 命令

```bash
node tools/build/gen-locales.js        # 改了 locales/**/text 下的 JSON 之后：重新生成 text.gen.js
node tools/build/gen-pages.js          # 改了模板片段、文本、或增删了 js 文件之后：重新生成页面副本与启动器
node tools/build/gen-pages.js --check  # 只检查是否过期，不写文件（过期则退出码 1）
node tools/build/gen-pages.js --pseudo # 另生成 locales/pseudo/html/index.html：静态文本也包成 ⟦…⟧（gitignore，仅开发）
```

`gen-pages.js` 在内存里自己合并文本，不依赖磁盘上的 `text.gen.js`；但页面副本加载的是 `text.gen.js`，所以文本变了两个都要跑（先 `gen-locales.js`）。
`--check` 过期时列出过期的文件并退出码 1。

生成物（`text.gen.js`、各语言 `index.html`、启动器 `index.html`）都提交进仓库，`smoke.js` 开头直接调 `gen-pages.js` 的 `build()` 逐文件比对，
`check-locales.js`（由 smoke 调用）检查 `text.gen.js`，忘了跑会在测试里炸，而不是在玩家屏幕上白屏或缺字。
各命令的参数与退出码见 [tools.md](tools.md#文本与页面的生成工具toolsbuild)。

## 加一种语言

1. 复制 `locales/zh-CN/text/` 为 `locales/<新语言>/text/`，翻译 JSON 里的值（键不动；缺的键会回退 zh-CN）。
2. `node tools/build/gen-locales.js && node tools/build/gen-pages.js`。
3. 启动器会自动把它列入可用语言；浏览器语言匹配时直接进入。

## 迁移说明

旧 `index.html` 用一次性脚本 `tools/build/extract-html.js <旧页面路径> [--write]` 拆成片段与 JSON（55 条静态文本）。迁移时用"旧页面 vs 新页面"的
可见文本与结构逐段比对确认：除 `<base>`、脚本块与语言包外**完全一致**。迁移完成后脚本只为说明当初怎么拆的；日常改页面直接改片段与 JSON。
