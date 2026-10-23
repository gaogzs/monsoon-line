# 文本层（Text）

玩家可见的文字只存在于 `locales/<语言>/text/**/*.json`。机制只在 `js/core/text.js`；数据和脚本里只写键：

```js
T('aircraft.frigatebird.desc')           // 取文本
T('fail.m2.baseLost', { n: 3 })          // 文本里的 {{n}} 从第二个参数按点号路径取值，取不到值直接抛错
T.pick('radio.fox.variants', rng)        // 叶子是数组时随机挑一条（rng 缺省 Math.random）；T(键) 对数组取第一条
T.has('some.key')                        // 键是否存在
```

`Text` 对象另有：`Text.load(语言, 树)`、`Text.lang([语言])`（读 / 设当前语言）、`Text.keys([前缀])`、`Text.unused()`（从没被取过的键）、
`Text.missing`（取过但不存在的键，数组）、`Text.flatten`。当前语言取自页面的 `<html lang>`；取不到的键回退 `zh-CN`；两边都没有返回 `⟦键⟧` 并记入 `Text.missing`。

## JSON 规范

- 只有键和文本：没有脚本、没有注释、没有函数。2 空格缩进，UTF-8，结尾换行（`node tools/build/fmt-locales.js` 一键整理）。
- 多级键用嵌套存，脚本读取后展平成点号键。**只认键，不认文件名**：加载时递归读全部 `*.json` 合并；
  同一个叶子出现在两个文件里 = 错误（报出两个文件名）；同一个键在一处是叶子、另一处是对象 = 错误；同一对象的不同叶子分在两个文件里是允许的。
- 叶子类型：字符串，或字符串数组（同一事件的多个说法）。其它类型一律报错（`tools/lib/strict-json.js`；同一对象里的重复键也报错，而不是像 `JSON.parse` 那样悄悄取最后一个）。
- 键名每一段只允许 `[A-Za-z0-9_-]`，段内不得含 `.`，不得以数字开头。
- 文本里可以带现有的 HTML 标记（`<b>` `<i>` `<br>` `<p>` `<h4>` `<span class>` `<table>` …）；占位只有一种写法 `{{路径}}`。
- 文件划分是软约定：`locales/<语言>/text/` 下按代码位置分目录——`aircraft/<id>.json`、`weapons/<id>.json`、`ships/<id>.json`、
  `platforms/`、`turretGuns/`、`missions/<id>.json`、`campaigns/`、`codex/<页>.json`、`data/`、`core/`、`engine/`、`ui/`（含 `ui/hud/`、`ui/screens/`）、
  `render/`、`boot/`、`html/`（页面静态文字）；单文件尽量 ≤ 800 行（现有个别文件略超）。

## 为什么要有一个生成步骤

`file://` 下浏览器不允许脚本读本地 JSON，而项目的底线是"双击页面就能玩"。所以
`node tools/build/gen-locales.js` 把全部 JSON 合并成 `locales/<语言>/text.gen.js`（一句 `Text.load(...)`），
页面副本里按普通 `<script>` 加载（紧跟 `js/core/text.js`，见 [pages.md](pages.md)）。这与 `CHANGELOG.md → js/core/changelog.js` 同一个套路：
生成物提交进仓库，`smoke.js` 断言它与现场重新生成的结果一致。

## 工具

| 命令 | 作用 |
|---|---|
| `node tools/build/gen-locales.js [--check]` | 合并 JSON → `locales/<语言>/text.gen.js`；有 `text/` 子目录的都算一种语言。`--check` 只检查：不一致、格式不规范、键重复都退出码 1 |
| `node tools/build/fmt-locales.js` | 规范化 `locales/` 下全部 JSON；遇到重复键等直接报错（`tools/lib/strict-json.js`），而不是悄悄丢一个 |
| `node tools/test/check-locales.js` | 脚本里静态写出的 `T('键')` / `T.pick('键')` 与页面模板里的 `{{html.键}}` 必须存在；`text.gen.js` 与 JSON 同步；没有被任何脚本 / 模板引用的键只给警告（动态拼出来的键静态扫描看不到，所以只是警告） |
| `node tools/build/gen-pages.js [--check] [--pseudo]` | 页面副本与启动器，见 [pages.md](pages.md) |
| `node tools/test/text-census.js [--check]` | 统计脚本里剩余的含中文的字符串字面量；`--check` 对照允许清单（`tools/test/baseline/text-census.json`，只许缩小） |
| `node --expose-internals tools/build/extract-text.js [--write] [--only 前缀]` | 一次性迁移工具：从脚本里提取中文字符串 → JSON，并把字面量换成 `T('键')`（借用 Node 内置的 acorn，所以要 `--expose-internals`）。不带 `--write` 只报告；迁移完成后现在应当提取 0 条 |

`smoke.js` 的「挂载系统」段会调 `check-locales.js` 与 `text-census.js` 的检查函数，并断言运行到那一刻为止 `Text.missing` 为空。
各命令的完整参数与退出码见 [tools.md](tools.md#文本与页面的生成工具toolsbuild)。

## 伪语言

`?lang=pseudo`（运行时）：每条 `T()` 取到的文本包成 `⟦…⟧` 并拉长 30%（补 `~`），用来目视找漏迁的字符串与排版溢出。
它只作用于脚本里走 `T()` 的**动态**文本；页面里的静态文字是构建期填进去的，要看它们用 `node tools/build/gen-pages.js --pseudo`
生成 `locales/pseudo/html/index.html`（gitignore，仅开发）直接打开。没有被迁走、仍写死在脚本里的中文字符串在两种伪语言下都不会变形，一眼就能看出来。

## 脚本里还剩的中文（允许清单）

`text-census` 数出脚本里还有 27 条含中文的字符串字面量，全部是不给玩家看的：

- 开发者消息：`throw new Error(...)`（`js/core/text.js`、`js/core/registry.js`）与 `console.*`（`js/engine/game/update.js` 的看门狗、`js/boot/main.js` 的开机自检、`js/engine/entities/mounts.js` 的挂载问题、`js/render/render-gl.js`）。
- `js/data/callsigns/naval.js` 里两个对象键 `'上游公约'`、`'下游同盟'`（阵营名，查表用的键，不是显示文本；各出现两次，共 4 条）。

其余都走了 `T()`。清单文件按文件记最大条数，超出就报（`smoke.js` 与 `text-census.js --check` 都查）。

## 键是机器起的

`tools/build/extract-text.js` 按"文件 + 所在属性 / 函数 + 序号"起键（如 `ui.screens.hangar.setHangarMode.textContent.s1`、`core.tags.doc_2`），
单位文件按单位（`weapons.srm.desc`）。想起更好的名字可以直接改：JSON 与脚本里的 `T('…')` 同步改即可，
`check-locales.js` 会报没对上的。

## 页面里的静态文字

页面里的静态文字（标题页、各屏标题与按钮、暂停菜单…）也在文本层里：键是 `html.<片段名>.<名字>`（`locales/zh-CN/text/html/<片段名>.json`，
`shell` 是页面骨架），页面模板片段里写 `{{html.片段名.名字}}`，由 `tools/build/gen-pages.js` 在构建期填进各语言的页面副本。
`check-locales.js` 也会检查模板里引用的键是否存在。见 [pages.md](pages.md)。
