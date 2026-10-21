# 资料库（资料 / CODEX）

代码：`js/codex.js`（1333 行）· 渲染与导航在 `js/game.js` 的 `buildCodex()` · DOM 在 `index.html` 的 `#scr-codex`

一句话职责：**codex.js 只提供数据与"生成函数"**——不碰 DOM、不写样式、不决定导航；条目在 `game.js` 里被遍历、拼字符串、塞进 `#codexNav` / `#codexBody`。

> 世界设定的完整散文版本在 [docs/world/SETTING.md](../world/SETTING.md)，战役情节在 [docs/world/CAMPAIGN.md](../world/CAMPAIGN.md)。
> 两者的关系是本文件最需要注意的部分，见下文「与 SETTING.md 的关系」。

---

## 代码位置与职责边界

| 项 | 事实 |
|---|---|
| 文件 | `js/codex.js`，全中文注释 |
| 加载位置 | `index.html` 里紧随 `planform.js` 之后、`data.js` 之前 |
| 依赖 | 静态条目零依赖；图鉴条目在 `build()` 里读 `AIRCRAFT` / `WEAPONS` / `SHIPS`（`WEAPONS` 已含补丁表注入的字段） |
| 输出 | 全局 `var CODEX`（数组）；四个辅助函数 `_hpKind` `_capLabel` `_rngTxt` `_seekerLabel` 也挂在全局 |
| 校验 | `tools/smoke.js` 会遍历所有 `typeof e.build === 'function'` 的条目并调用一次 |

**加载顺序为什么重要**：codex.js 先于 data.js 求值。`CODEX` 数组字面量本身不引用那些表，所以能安全求值；所有对 `AIRCRAFT` / `WEAPONS` 的引用都必须留在 `build()` 函数体内，等用户点开图鉴时才执行。源码注释把这条写得很明白：

```js
/* 注意 codex.js 在 data.js 之前加载，所以 build() 里引用那些表
   必须等到被调用时才求值 —— 这正是把它们写成函数的原因。 */
```

同理，`_rngTxt()` 里调用的 `missileRange(w)` 定义在 `data.js`——也是靠"调用时它已经加载完"才成立。**不要在 codex.js 的模块顶层直接算这些值。**

---

## 数据结构：`CODEX` 条目

`CODEX` 是一个数组（24 条：21 静态 + 3 动态），元素有两种形态。

| 字段 | 类型 | 静态条目 | 动态条目 | 缺了会怎样 |
|---|---|---|---|---|
| `cat` | string | ✅ | ✅ | 它在导航里会以 `undefined` 作为分类标题 |
| `id` | string | ✅ | ✅ | **当前没有任何代码读 `id`**（`buildCodex()` 只用下标）；它是锚点/可读性用途 |
| `title` | string | ✅ | ✅ | 导航项文字变成 `undefined`，正文标题也变 `undefined` |
| `sub` | string | ✅ | ✅ | 正文标题下那行变成 `undefined`（没有兜底判断） |
| `html` | HTML string | ✅ | ❌ | — |
| `build` | function | ❌ | ✅ | 两者都没有时正文为空（不会报错） |
| `mount` | function | 可选 | 可选 | 没有就不调。`buildCodex()` 在 `innerHTML` 写完之后调它，给条目挂需要真 DOM 的小部件（目前只有 `s4` 的 3D 预览） |

渲染逻辑只有这一行在做分派：

```js
var body = typeof e.build === 'function' ? e.build() : (e.html || '');
```

**契约**：一个条目要么给 `html`，要么给 `build`，不给就算空页。`build` 每次打开/切换都重新调用，**不是缓存**——所以它必须够快、且不能有副作用。`smoke.js` 额外要求 `build()` 返回的字符串 **≥ 200 字符**（防空页），并且不能抛异常。

---

## 条目清单（24 条）

数组顺序 = 导航顺序。分类标题**不是预定义的**，而是顺序扫描时 `cat` 变化就插一个标题。

| cat | 条目 |
|---|---|
| 世界 / WORLD | `w1` 季风线 · `w2` 下游：一场有理由的战争 |
| 技术 / TECH | `t1` 平流层作战 · `t2` 自适应循环发动机 · `t3` 认知电子战 · `t4` 定向能武器的三条铁律 |
| 兵器 / SYSTEMS | `s1` 不可逃逸区与冲压空空弹 · `s2` 为什么 2078 年还有机炮 · `s3` 有人-无人编队 · `s4` 调节单元：怎么打一个气球 · `s5` 海面上的东西 |
| 势力 / FACTIONS | `f1` 上游公约 · `f2` 下游同盟 · `f3` 分水群岛国 · `f4` 调节场管理局 · `f5` 南回契约 · `f6` 高纬联合 · `f7` 环外共同体 |
| 战役 / CAMPAIGN | `cmp1` 分水岭行动 · `cmp2` 第四周 |
| 语言 / LANGUAGE | `t5` 逻辑语 |
| 图鉴 / INVENTORY | `inv1` 机型图鉴（build）· `inv2` 挂载图鉴（build）· `inv3` 舰艇图鉴（build） |

**两个刻意的结构决定**（源码注释里写了理由）：

- **势力与战役拆开**：势力页只描述"谁是什么样"，不描述"谁在打谁"。将来若从别的阵营视角写战役，这些页一个字都不用改。
- **逻辑语 `t5` 排在最后一组静态条目**，分类是"语言 / LANGUAGE"，与前面的"技术 / TECH"分开。

**`inv1` / `inv2` / `inv3` 是用 `CODEX.push(...)` 追加的**，所以在数组末尾、导航最后。
分类顺序完全取决于数组顺序——把某条挪个位置就会多出一个重复的分类标题（见下）。

`s5`「海面上的东西」的位置是**刻意**的：它排在同一组的最后一条静态条目，
紧挨着后面的 "势力 / FACTIONS"。理由是它讲的是四方加三方**都在用**的东西
（水面舰船），放在势力页之前当一个"共同背景"，比塞进某个势力页更合适。

---

## 动态条目：图鉴为什么必须动态生成

`inv1`（机型图鉴）、`inv2`（挂载图鉴）与 `inv3`（舰艇图鉴）没有 `html`，只有 `build()`。理由只有一条：

> 手写的装备表一定会和 `data.js` 脱节。

于是 `build()` 现场遍历数据表：

| 条目 | 读什么 | 生成什么 |
|---|---|---|
| `inv1` | `AIRCRAFT` | 机型总表（型号/阵营/定位/最大速度/俯仰率/结构/挂点/翼型）+ 挂点分布表 |
| `inv2` | `WEAPONS`（含被补丁表注入的 `fits` `perPoint` `mass` `role` `needs` `lead`） | 按 `kind` 分的五张表 + 一张「下游装备」表 |
| `inv3` | **`SHIPS`** | 按势力分的七张舰船表 + 一张「要害与舰载武备」表 |

### `inv1` 的关键点

- 可驾驶标记读 `a.npcOnly`：没有该字段 = 可驾驶，显示 `可驾驶` 徽章。所以**字段名和设定叙述都不预设玩家立场**（历史上这个字段叫 `enemyOnly`，已改名）。
- 挂点数是从 `hardpointGroups[].pts.length` **现场数出来的**，不是另存的数字。
- 中文名取 `a.cn`、英文绰号取 `a.nick`。注释里记了一次真实事故：早期把这两个字段写反，上游三架显示英文、新加的三架因为字段写反而显示中文，"正好颠倒"。
- **型号名外面包了一层可点的 `<span class="cx-unit" data-unit="aircraft:<id>">`** —— 点进这一型自己的详情页。`codex.js` 只输出标记，**不绑事件**；绑定由 `game.js` 在 `#codexBody` 上做一次事件委托。理由见 [unitview.md](unitview.md#链接是怎么接上的)。

### `inv2` 的关键点

分类表是写死的五类：

```js
var cats = [ {t:'空空导弹',k:'aam'}, {t:'反大型 / 反舰',k:'asm'},
             {t:'空地导弹',k:'agm'}, {t:'炸弹与火箭',k:'bomb'},
             {t:'吊舱',k:'ecm'} ];
```

排序与"是不是玩家能用"的判据：

```js
if (!w.fits || !w.fits.length) continue;   // 敌方专用不列（第一轮，正面表）
...
if (w.fits && w.fits.length) continue;     // 只列敌方专用（第二轮，下游表）
```

- **`kind: 'gun'` 不在 `cats` 里**，所以机炮不会出现在正面表。
- `cats` 里有 `dew` 分类，`l2`（GUS-2「日光」）出现在正面表的「定向能」一节；「射程」列写拦截半径，「导引」列写「自动拦截」。加新 `kind` 时记得同步 `cats`。
- 「单点」列对被动吊舱显示 `—`（`w.passive ? '—' : '×' + w.perPoint`）。
- 「导引」列由 `_seekerLabel()` 生成：被动 → `被动`；`seeker: 'none'` → `无制导`；`eo` / `laser` 有专门文案；其余按 `ir` / 雷达 + `lead` 百分比。
- **静默回退**：`_seekerLabel` 的默认分支是"雷达"。**新武器如果漏写 `seeker`，图鉴会把它的导引方式标成"雷达"**，不会报错。

### `inv3` 的关键点

`inv3`（舰艇图鉴）是唯一一个**按叙事顺序而不是表的存储顺序**输出的图鉴。
势力顺序写死在 `build()` 里：

```js
var order = ['上游公约', '下游同盟', '分水群岛国', '调节场管理局',
  '南回契约', '高纬联合', '环外共同体'];
```

理由是：顺序是叙事，不该跟着表的存储顺序走。`SHIPS` 现在恰好按势力连续存放
（上游 5 · 下游 5 · 群岛国 1 · 管理局 2 · 未参战 3），但早期是交错的，直接遍历会把
同一势力拆成好几段；往表里插一条船也不该改变资料库的阅读顺序。**顺序在这里是叙事，不是数据** ——
先参战四方，再未参战三方，正好对应 `s5` 那一页的讲法。

其余几点：

- 表格按 `s.faction` 过滤，**没有任何一行是手写的**：吨位、主尺度、航速、编制
  全部来自 `SHIPS`
- 「不该打」徽章读 `s.neutral`（南十字 / 冰芯 / 环礁三条），与 `value: 0` 是同一件事的两面
- **要害与舰载武备**单列一张表，因为这两列是数组（`vials` / `arms`），
  放进主表会把行挤爆
- 最后那段"舰载弹药与机载弹药共用编号"是**静态文字**，与前面的静态条目一样
  会随 `data.js` 漂移 —— 它没有读任何表
- **编号与舰名外面包了一层可点的 `<span class="cx-unit" data-unit="ship:<id>">`**，
  与 `inv1` 同一套约定，不需要各写一份

### 三个格式化函数的回退

| 函数 | 输入异常时 |
|---|---|
| `_hpKind(k)` | 返回原字符串（映射表里查不到时） |
| `_capLabel(c)` | 返回原字符串 |
| `_rngTxt(w)` | `missileRange` 返回 `null` / `≤ 0` 时输出 `—`；`kind === 'dew'` 且有 `interceptRange` 时输出"拦截 X km"（该分支目前无武器能走到） |
| `_seekerLabel(w)` | 未知 `seeker` 一律当"雷达"；`lead` 未定义时不显示百分比 |

---

## 关键流程

### 导航如何构建（`game.js` `buildCodex()`）

```js
var lastCat = null;
for (var i = 0; i < CODEX.length; i++) {
  if (CODEX[i].cat !== lastCat) {          // ← 只和"上一条"比
    lastCat = CODEX[i].cat;
    ...appendChild(分类标题 div...)
  }
  ...appendChild(条目 div, onclick = 选中并重建...
}
```

要点与坑：

1. **分类标题只在 `cat` 和上一条不同时插入**。所以**同一分类必须连续排在一起**；如果数组里穿插回去，导航里就会出现两个同名分类标题。
2. 导航项是 `<div class="cx-item">`，靠 `textContent = CODEX[idx].title` 显示，`onclick` 里设置全局 `codexSel = idx` 后再调 `buildCodex()` 重建整块。
3. **没有键盘导航**。只有鼠标点击；`codexSel` 是模块级变量，退出资料库再进来会保留上次选中项（不重置）。
4. 每次 `buildCodex()` 都会把 `#codexNav` / `#codexBody` 的 `innerHTML` 清空重建。`smoke.js` 的 DOM 桩专门为此让 `innerHTML` setter 清空 `children`，否则"重复进入"会看到元素越积越多。

### 条目如何渲染

```js
var body = typeof e.build === 'function' ? e.build() : (e.html || '');
document.getElementById('codexBody').innerHTML =
  '<div class="cx-title">' + e.title + '</div>' +
  '<div class="cx-sub">' + e.sub + '</div>' +
  '<div class="cx-text">' + body + '</div>';
if (typeof e.mount === 'function') e.mount();   // DOM 就位之后再挂
```

**`s4` 的 3D 预览**：正文里放一个 `<canvas class="uv-3d" id="cxCell3d">`，`mount()` 取到它后调
`UnitView.mountModel(cvs, MODELS.cell)` —— 与机型详情页同一个转台。离开页面由 `UnitView.stop()` 收尾，和以前一样。
`smoke.js` 检查 `s4.mount` 存在且调用不抛异常。

**全部是 `innerHTML` 直拼**：条目里的 HTML（`<table class="cx-table">` `<h4>` `<span class="am">`）会原样生效；`title` / `sub` 缺字段就渲染成字面量 `undefined`。

进入路径：`game.js` 里 `else if (go === 'codex') { buildCodex(); show('codex'); }`。所以图鉴是**懒求值**——不点进去就不会执行 `build()`。

`smoke.js` 对动态条目的断言（三次采样）：

```js
const dyn = C.filter(e => typeof e.build === 'function');
for (const e of dyn) {
  const h = e.build();
  if (!h || h.length < 200) fail('图鉴「' + e.title + '」生成的内容只有 ... 字符');
}
```

---

## 与 SETTING.md 的关系

两者讲同一批设定（平流层作战、自适应循环、逻辑语、四方势力……），但**职责完全不同**。
战役情节已拆到 `CAMPAIGN.md`；对应地，资料库里**只有「战役」分类（`cmp1` / `cmp2`）讲战役**，
其余条目只写世界本身——不提任务名、冬港、VESPER、政变，也不说"本作"。加新条目照这个分法放。

| | `docs/world/SETTING.md` | `js/codex.js` |
|---|---|---|
| 形态 | 纯散文（约 1230 行），可单独阅读、离线分发 | 游戏内 HTML 片段，靠 `buildCodex()` 渲染 |
| 与代码的关系 | **零绑定**。数字全是手抄的 | 图鉴三页现场读数据表；叙事页里的数字走 `{{键}}` 占位符现读 |
| 谁会看 | 想通读世界观的人 | 游戏里的玩家 |

### 哪些是静态文本

静态条目是手写 HTML。纯叙事（历史、立场、为什么这么设计）照旧手写；
**凡是复述了游戏数据的数字，一律写成 `{{键}}` 占位符**，渲染时现读。

### 哪些是代码动态生成的

- `inv1` / `inv2` / `inv3`：整页由 `build()` 遍历 `AIRCRAFT` / `WEAPONS` / `SHIPS` 生成。
- 带占位符的静态页（当前 `t1` / `t3` / `t4` / `s1` / `s2` / `cmp1`）：
  `codex.js` 末尾的循环给所有 `html` 含 `{{` 的条目自动挂上
  `build: function () { return _cxFill(this.html); }`。`buildCodex` 本来就优先调用 `build()`，所以 `game.js` 不用改。

### 占位符机制（`_CX_VALS` / `_cxFill`）

| 键前缀 | 数据来源 |
|---|---|
| `rho.*` | `Ent.airDensity()` / `Ent.turnFactor()`（t1 密度表、20 km 的 7%、3.7 倍动压速度） |
| `gunTable`、`gun.k3.*` | `WEAPONS` 中 `kind === 'gun'` 的全部条目（s2 机炮表、t1/s2 射程、初速、每秒发数、飞行时间） |
| `w.e4.*` / `w.l2.*` | ZUN-4 的 `lockReduce` / `cd`（来自 `STORE_COOLDOWN`）/ `duration`；GUS-2 的拦截半径、锥角、概率、单次冷却 `cd` |
| `w.v17.*` / `w.mrm.*` / `w.srm.*` | CLA-17 动力段、高空降级后动力段、转弯率、总飞行时间；对比用的 CLA-4 / TOR-2 |
| `ms.*` | `MISSIONS`：现在只有 `cmp1` 用 `ms.m10.limit`（m10 的 `timeLimit`）。`ms.total` / `ms.highN` / `ms.highList` 仍定义着，但 `t1` 那句"几个任务在 18–22 km"已删（非战役条目不提任务），没人用 |

规则：

1. `_CX_VALS` 的每一项都是**函数**——codex.js 先于 data.js / entities.js / missions.js 加载，只能在渲染时求值。
2. 未知键原样保留 `{{键}}`；`smoke.js` 断言所有动态条目不含 `undefined` / `NaN` / 未替换占位符，且 `inv2` 里出现「无制导」。
3. `w.v17.lifeHigh` 直接调用 `Ent.effectiveLife(w, 20000)`，没有手抄公式；`entities.js` 的冲压降级改了，这里自动跟上。
4. 机炮表的「装备方」列是叙事，写在 `_CX_GUN_OWNER`；新增机炮会自动出现在表里，只是装备方显示「—」。
5. 仍然手写的物理数字（t1 的静压 / 气温列、t4 的激光功率—射程表、t3 的 0.2 / 3 / 8 秒对抗时间）不是游戏数据或没有单一字段对应，改动时需人工核对。

### 导引方式：一个判定、两处使用

`weaponGuidance(w)`（codex.js，全局）返回 `{ name, note, lead }`，图鉴的 `_seekerLabel()` 与机库挂载卡片的 `storeStatLine()`（game.js）都调用它。
`w.unguided` 或 `seeker` 缺省 / `'none'` 一律判为「无制导」——此前缺省 `seeker` 的火箭弹（rkt）与子母弹（clb）在图鉴里被标成了「雷达」。

### 已修复的漂移（改为占位符之前）

| 位置 | 原来静态写的 | 实际 |
|---|---|---|
| `t3` 游戏机制 | ZUN-4 冷却 | 现读 `WEAPONS.e4.cd`（`STORE_COOLDOWN.e4 = 50`） |
| `t3` 游戏机制 | "锁定锥收窄到 ±20°" | 已有实现：`game.js` 锁定逻辑在 `ewPower > 0` 时 `cone = min(cone, 20°)`；这条不再算漂移 |
| `s1` | CLA-17 燃烧 6→60 s、高空 60→14 s、转弯 0.9 | `life = 10`、高空 2.4 s、`turn = 1.00`，全部改为占位符 |
| `s2` | 机炮"1000 米射程"、0.9 秒 | `k3.range = 1600` → 1.5 秒 |
| `t1` | 18 km 密度 0.12、22 km 0.045 | `Ent.airDensity`：0.099（9.9%）、0.052 |
| `t1` | "十一个任务中有两个"在 18–22 km | 曾改为 `ms.*` 现数；后来整句删掉（非战役条目不提任务） |

（`t1` 的"可用过载随真空速**线性**下降"也是静态叙述的近似——实际机制是 `ctrlFactor` 按动压 `q = ½ρv²` 缩放，对速度是二次的。）

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 导航顺序 / 分类 | `CODEX` 数组顺序；分类标题由 `cat` 变化自动插入 |
| 某一页的正文 | 该条目的 `html` 字符串 |
| 图鉴收录的机型 | `AIRCRAFT`（`inv1` 自动读） |
| **图鉴收录的舰船** | **`SHIPS`（`inv3` 自动读）；势力分组顺序写死在 `inv3` 的 `order` 数组里** |
| 图鉴收录的武器与分组 | `cats` 数组（`inv2` 的 `kind` 分组）+ `WEAPONS[].fits` |
| "可驾驶"徽章 | `AIRCRAFT[].npcOnly` |
| 挂点类型中文化 | `_hpKind()` 的映射表 |
| 能力门槛中文名 | `_capLabel()` 的映射表（`strike` = 重型火控） |
| 射程列算法 | `data.js` 的 `missileRange()` |
| 导引方式文案 | `weaponGuidance()`（图鉴与机库卡片共用） |
| 叙事页里的数值 | `_CX_VALS` 占位符表 |

## 易踩的坑与设计取舍

1. **加了新 `kind` 就要加进 `cats`**，否则整类武器在图鉴里凭空消失（`dew` 的现状）。
2. **`build()` 里不要依赖加载顺序之外的全局**，也不要缓存结果；每次点击都会重跑。
3. **分类必须连续**，`buildCodex` 只比较相邻两条的 `cat`。
4. **`title` / `sub` 没有兜底**，缺字段会直接渲染 `undefined`。
5. **`id` 是死的**：改 `id` 不会破坏任何东西，也不会改变任何行为；导航靠下标。
6. **静态条目里新写的数字必须走占位符**；直接写死的数字会漂移（见上表）。
7. **`build()` 抛异常会打断整次渲染**（`buildCodex` 没有 try/catch），页面停在半成品；`smoke.js` 是唯一的守门人。
8. **势力页不带立场、战役页单独成组**是刻意的结构设计，不要为了"读起来顺"把它们合并回一页。

## 与其它模块的依赖关系

| 模块 | 关系 |
|---|---|
| `data.js` | `inv1` / `inv2` / `inv3` 的数据源（`AIRCRAFT` / `WEAPONS` / `SHIPS`）；`_rngTxt` 调 `missileRange()`。**加载在 codex.js 之后** |
| `game.js` | `buildCodex()` 是唯一的消费者：建导航、渲染正文、`show('codex')` 时懒执行 |
| `unitview.js` | 图鉴里那两个 `cx-unit` 标记的落点：`game.js` 的委托拿到 `data-unit` 后调 `UnitView.html()` / `mount()` 换成详情页。`s4` 的 `mount()` 另外直接调 `UnitView.mountModel()` 挂调节单元的 3D 预览。`.cx-unit` 的样式也在那一族里 |
| `index.html` | 提供 `#scr-codex` / `#codexNav` / `#codexBody` 三个锚点，以及入口按钮 `data-go="codex"` |
| `css/style.css` | `.cx-table` `.cx-title` `.cx-sub` `.cx-text` `.cx-note` `.cx-cat` `.cx-item` `.cx-fly`，以及 `<span class="am">` / `cy` / `rd` 三个强调色 |
| `tools/smoke.js` | 断言动态条目可生成且 ≥200 字符；导航按钮 `data-go="codex"` → `scr-codex` |
| `docs/world/SETTING.md` | 同源散文，但**没有代码绑定**，参数可能已漂移 |

## 本批更新

- 非机载表（表 2）收录 TOR-3「雏矢」（`fits: []`，玩家挂不上）。
- 僚机指令段补充：默认挂载（翼下 TOR-3、机腹 CLA-4）与掩护（3）指令下的干扰弹。
