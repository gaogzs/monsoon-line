# 文本层（Text）

玩家可见的文字只存在于 `locales/<语言>/text/**/*.json`。机制只在 `js/core/text.js`；数据和脚本里只写键：

```js
T('aircraft.frigatebird.desc')           // 取文本
T('fail.m2.baseLost', { n: 3 })          // 文本里的 {{n}} 从第二个参数按点号路径取值
T.pick('radio.fox.variants', rng)        // 叶子是数组时随机挑一条
```

## JSON 规范

- 只有键和文本：没有脚本、没有注释、没有函数。2 空格缩进，UTF-8，结尾换行（`node tools/build/fmt-locales.js` 一键整理）。
- 多级键用嵌套存，脚本读取后展平成点号键。**只认键，不认文件名**：加载时递归读全部 `*.json` 合并；
  同一个叶子出现在两个文件里 = 错误（报出两个文件名）；同一对象的不同叶子分在两个文件里是允许的。
- 叶子类型：字符串，或字符串数组（同一事件的多个说法）。其它类型一律报错。
- 键名每一段只允许 `[A-Za-z0-9_-]`，段内不得含 `.`，不得以数字开头。
- 文本里可以带现有的 HTML 标记（`<b>` `<i>` `<br>` `<p>` `<h4>` `<span class>` `<table>` …）；占位只有一种写法 `{{路径}}`。
- 文件划分是软约定：`aircraft/<id>.json`、`weapons/<id>.json`、`ships/<id>.json`、`missions/<id>.json`、
  `codex/<页>.json`、`ui/**`、`hud/**`、`engine/**` 等，单文件尽量 ≤ 800 行。

## 为什么要有一个生成步骤

`file://` 下浏览器不允许脚本读本地 JSON，而项目的底线是"双击 `index.html` 就能玩"。所以
`node tools/build/gen-locales.js` 把全部 JSON 合并成 `locales/<语言>/text.gen.js`（一句 `Text.load(...)`），
`index.html` 里按普通 `<script>` 加载。这与 `CHANGELOG.md → js/core/changelog.js` 同一个套路：
生成物提交进仓库，`smoke.js` 断言它与现场重新生成的结果一致。

## 工具

| 命令 | 作用 |
|---|---|
| `node tools/build/gen-locales.js [--check]` | 合并 JSON → `text.gen.js`；`--check` 只检查 |
| `node tools/build/fmt-locales.js` | 规范化全部 JSON；遇到重复键等直接报错（`tools/lib/strict-json.js`） |
| `node tools/test/check-locales.js` | 脚本里静态写出的 `T('键')` 必须存在；没有脚本引用的键给警告；生成物同步 |
| `node --expose-internals tools/build/extract-text.js [--write]` | 从脚本里提取中文字符串 → JSON，并把字面量换成 `T('键')`（借用 Node 内置的 acorn） |
| `node tools/test/text-census.js [--check]` | 统计脚本里剩余的中文字符串；`--check` 对照允许清单（`tools/test/baseline/text-census.json`，只许缩小） |

`?lang=pseudo`：每条文本包成 `⟦…⟧` 并拉长 30%，用来目视找漏迁的字符串与排版溢出。缺键返回 `⟦键⟧` 并记入 `Text.missing`，
smoke 断言它为空。

## 脚本里还剩的中文（允许清单）

`throw new Error(...)` / `console.*` 的开发者消息，以及两个对象键（`NAVAL_CS` 里的 `'上游公约'` `'下游同盟'` 阵营名，
它们是查表用的键，不是显示文本）。其余都走了 `T()`。

## 键是机器起的

`tools/build/extract-text.js` 按"文件 + 所在属性 / 函数 + 序号"起键（如 `ui.hud.panels.drawWeaponPanel.s3`），
单位文件按单位（`weapons.srm.desc`）。想起更好的名字可以直接改：JSON 与脚本里的 `T('…')` 同步改即可，
`check-locales.js` 会报没对上的。

## 页面里的静态文字

`index.html` 里的静态文字（标题页、各屏标题与按钮、暂停菜单…）也在文本层里：键以 `html.` 开头（`locales/zh-CN/text/html/*.json`），
页面模板片段里写 `{{html.屏.名字}}`，由 `tools/build/gen-pages.js` 在构建期填进各语言的页面副本。见 [pages.md](pages.md)。
