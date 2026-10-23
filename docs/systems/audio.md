# 音效合成

代码：`js/engine/audio.js`· 调用点 `Game`、`Ent`、`AI`

---

## 为什么全程序化

**没有任何音频文件。** 每一个声音都是 WebAudio 节点实时合成的。

理由：

1. **零资源分发**。游戏只有一个 HTML + 一个 CSS + 15 个 JS，
   可以直接邮件发送
2. **不会有加载失败**。没有 404、没有解码错误、没有格式兼容问题
3. **可以连续调制**。引擎音要随油门连续变频，
   用采样循环做这件事会很难听

代价：合成音不如录制音真实。但对一个低多边形游戏来说，电子感的音效反而更协调。

---

## 节点生命周期

`unlock()` **必须在用户手势之后调用**——浏览器不允许页面自行创建
`AudioContext`。Game 在 `mousedown` 上挂了一次 `SFX.unlock()`。

`unlock()` 里一次性做完全部节点创建：取
`window.AudioContext || window.webkitAudioContext`（都没有就返回），
建 `master` gain 与 `noiseBuf`，依次调
`buildEngine()` / `buildGun()` / `buildWarn()` / `buildNear()`，
置 `ready = true`；若 `ctx.state === 'suspended'` 再 `ctx.resume()`。

`noiseBuf` 是一段 **2.0 秒的单声道白噪声**（`makeNoise(2.0)`，
逐样本 `Math.random()*2-1`）。引擎、机炮、附近飞机三条循环音链
和所有一次性噪声爆发**共用这同一段 buffer**。

之后每帧只调参数，**绝不每帧新建节点**——持续音的更新全走
`setTargetAtTime`。

---

## 音量架构

三层，默认值就在 `audio.js` 顶部：

| 变量 | 默认值 | 作用域 |
|---|---|---|
| `volMaster` | **0.45** | `master.gain`，总总线 |
| `volEngine` | **0.45** | 引擎音（含附近飞机） |
| `volSfx` | **0.85** | 一次性音效 + 机炮 + 告警 |

```
主音量 (volMaster)
  └─ master gain ────────────────→ destination
       ├─ 引擎音 × volEngine     （持续音，默认压到 45%）
       ├─ 音效   × volSfx        （一次性音效，默认 85%）
       └─ 机炮 / 告警 × volSfx   （持续音，但归到音效类）
```

引擎单独一条通道，因为它**是持续音**——最容易变成恼人的底噪。
用户反馈"电子音太大了"时，第一件事就是把它压下来，
同时给玩家一个独立的滑块。

注意 `volEngine` **只乘在 `engG` 和 `nearG` 上**：引擎的三条支路
（`jetG` / `whineG` / `subG`）不各自乘一遍，汇进 `engG` 后才统一缩放。

### 公开接口

```js
SFX.unlock();                          // 手势后初始化，可重复调用
SFX.isReady();                         // → bool
SFX.setMuted(bool);                    // 只改 master gain，不动各通道值
SFX.isMuted();                         // → bool
SFX.setVolumes(master, engine, sfx);   // 0..1，内部用 M3.clamp 夹紧
SFX.getVolumes();                      // → { master, engine, sfx }
```

`setMuted` 不修改各通道的值，所以静音/取消静音不会丢失音量设置——
它只是把 `master.gain` 在 `0` 和 `volMaster` 之间来回切。

`setVolumes` 除了写三个变量、重设 `master.gain`，还必须**重新施加
正在响的持续音**，否则新音量要等下一次状态翻转才生效：

```js
API.gun(gunOn);                          // 机炮
if (warnOn) { warnOn = false; API.warning(true); }
```

告警那一行先手动把 `warnOn` 复位再调一次，就是为了绕开
`warning()` 开头的等值短路（见"陷阱"一节）。

游戏侧的默认值与这里一一对应（`Game` 的 `S`）：
`volMaster: 45`、`volEngine: 45`、`volSfx: 85`、`muted: false`，
滑块范围 0–100%，`S.volMaster/100` 后才传给 `setVolumes`。
UI 标签是"主音量 / 引擎音 / 音效 / 全部静音"。

---

## 持续音（四组）

### 引擎（喷气式）

```
噪声(循环) → bandpass(850Hz) ─────────┐
sawtooth(1.75k) → bandpass(2800,Q7) ──┼→ engG → master
triangle(62Hz) ───────────────────────┘
      ↑
sine LFO(23Hz) ×110 → 喷流带通的中心频率
```

`buildEngine()` 的静态初值：`jetF` = bandpass 850 Hz / Q 0.5，
`jetG` = 1.0，`engA` = sawtooth 1750 Hz（啸叫源），
`whineF` = bandpass 2800 Hz / Q 7.0，`whineG` = 0，`engB` = triangle 62 Hz，
`subG` = 0，`engLfo` = sine 23 Hz，`engLfoG` = **110**（LFO 深度），`engG` = 0。
其中 `jetG` 与 `engLfoG` 建链后不再改动，其余每个都在下一节被重设。

三层：

| 层 | 作用 |
|---|---|
| 宽带喷流噪声（`engSrc`→`jetF`→`jetG`） | 主体 |
| 压气机啸叫（`engA`→`whineF`→`whineG`） | 转速越高越尖、越响 |
| 低频轰鸣（`engB`→`subG`） | 很轻，只提供厚度 |

`engLfo`→`engLfoG`(110)→`jetF.frequency`，让喷流噪声的中心频率游走，
免得听起来像纯白噪。

**早先版本是 74 Hz 锯齿 + 37 Hz 方波 + 低通** —— 那是**活塞机**的频谱
（低频周期性脉动），听起来像螺旋桨。喷气机的声源是宽带喷流，
不是低频脉动，所以这版把主体换成了噪声。

`API.engine(throttle, ab, alive)` 每帧调用，括号里是时间常数：

| 目标 | 公式 |
|---|---|
| `jetF.frequency` | `760 + throttle*1500 + (ab ? 700 : 0)`（0.15） |
| `jetF.Q` | `0.5 + throttle*0.5`（0.15） |
| `engA.frequency` | `1450 + throttle*2700 + (ab ? 950 : 0)`（0.14） |
| `whineF.frequency` | `2600 + throttle*1700`（0.14） |
| `whineG.gain` | `alive ? 0.09 + throttle*0.16 + (ab ? 0.10 : 0) : 0`（0.15） |
| `subG.gain` | `alive ? 0.13 + throttle*0.13 + (ab ? 0.06 : 0) : 0`（0.18） |
| `engB.frequency` | `56 + throttle*26`（0.2） |
| `engLfo.frequency` | `17 + throttle*19`（0.2） |
| `engG.gain` | `alive ? (0.030 + throttle*0.075 + (ab ? 0.030 : 0)) * volEngine : 0`（0.12） |

所以啸叫振荡器在油门满、开加力时到 `1450+2700+950 = 5100` Hz，
噪声带通中心到 `760+1500+700 = 2960` Hz。
**不用采样**是因为需要这样连续变频（啸叫从约 1.45 kHz 扫到约 5.1 kHz）
而不产生"变调"感。

### 附近飞机（共享引擎链）

```
noise(循环) → lowpass(600Hz,Q0.7) → nearG → master
```

不可能给每架 NPC 各建一条音链：11 架 × 4 个振荡器 = 44 个节点，
而大部分时间它们都听不见。所以只做**一条共享音链**，
由 Game 每帧传入"最近的一架"的距离与油门来驱动。
丢失的是方向感（听不出声音来自左边还是右边），
保住的是最重要的那条信息：**附近有人，而且他推了油门**。

`API.nearby(dist, throttle, ab)`：`att = clamp(1 - dist/1500, 0, 1)`；
`nearF.frequency = 480 + throttle*1300 + (ab ? 520 : 0)`（0.2）；
`nearG.gain = att*att * (0.018 + throttle*0.05) * volEngine`（0.15）。
Game 侧遍历所有存活飞机（排除玩家）取最近的一架 `nBest`／距离 `nBd`，
`nBd < 1500` 时 `SFX.nearby(nBd, nBest.throttle || 0.8, !!nBest.ab)`，
否则 `SFX.nearby(99999, 0, false)` 把这条链压回零。

### 机炮

```
noise(循环) → bandpass(1250Hz,Q0.9) → gunG → master
                                        ↑
                            square(64Hz) → gunLfoG → gunG.gain
```

`gunG.gain` 与 `gunLfoG.gain` **初值都是 0**（`buildGun()`）。
那个 32.5 Hz 的方波调制是关键——它把连续噪声切成每秒 32.5 次的脉冲，
听感就是转膛炮的"突突突"。机炮数据是 1950 发/分
（`js/data/` 的 `rpm`，约 32.5 发/秒），调制频率与之对齐（`gunLfo` 32.5 Hz）。

`API.gun(on)` 同时写两个增益，时间常数都是 0.012：
`gunG.gain = on ? 0.115 * volSfx : 0`，
`gunLfoG.gain = on ? 0.075 * volSfx : 0`。

### 导弹告警

```
square(1150Hz) → warnG → master
                    ↑
        square(7Hz) → warnLfoG → warnG.gain
```

7 Hz 的断续感模拟真实 RWR 的"哔—哔—哔"。
`warnG.gain` 与 `warnLfoG.gain` 初值同样都是 0。
`API.warning(on)`：开头有 `if (on === warnOn) return;`（等值短路），
然后写两个增益，时间常数都是 0.03：
`warnG.gain = on ? 0.075 * volSfx : 0`，
`warnLfoG.gain = on ? 0.055 * volSfx : 0`。

Game 侧每帧扫描所有存活导弹，只要存在
`m.team !== player.team && m.target === player && dist < 3600` 就置真——
即"有导弹以本机为目标且在 **3.6 km** 内"。

---

## 一个必须知道的 WebAudio 陷阱

**`AudioParam` 的最终值 = 基础值 + 所有连入信号之和。**

这对所有 `AudioParam` 都成立。机炮和告警两条链把它踩成了坑：
**LFO 直接连在 gain 的 `.gain` 上**。于是 `gain.value = 0`
只把**基础值**设成 0，LFO 照样推。
（引擎那条链的 LFO 接的是 `jetF.frequency` 而不是某个 gain，
而且深度 110 从建链起就有意非零，不构成同一个问题。）

```
gunSrc(循环噪声) → gunF → gunG(gain) → master
                              ↑
                     gunLfo(64Hz 方波) → gunLfoG → gunG.gain
```

如果 `gunLfoG.gain` 初值给成 0.075，那么从页面启动起
`gunG` 就被 32.5 Hz 方波推到 ±0.075，而 `gunSrc` 一直在播——
结果就是**主菜单上一路常驻的、被 32.5 Hz 门控的"突突"底噪**，
而且它乘不到 `volSfx`，任何子项音量都管不住它（只有 `master` 能）。
`gun()` 只在开火时才会把它设回去，而主菜单根本不会调 `gun()`。
所以 `buildGun()` 里深度**必须从 0 开始**。

告警音（1150 Hz 被 7 Hz 调制）同理，而且更隐蔽：
`warning(false)` 开头有 `if (on === warnOn) return;`，
`warnOn` 初值本来就是 `false`，于是那个函数**永远不会**把
初始非零深度清掉。这就是"点一下页面就能听到的高频持续音"的来源。

**开关持续音时必须把 LFO 深度也一起归零：**

```js
gunG.gain.setTargetAtTime(on ? 0.115 * volSfx : 0, t, 0.012);
gunLfoG.gain.setTargetAtTime(on ? 0.075 * volSfx : 0, t, 0.012);   // ← 关键
```

改音量时也要用 `API.gun(gunOn)` 重新施加一次，
否则正在响的音要等下一次开关才跟上新值。
`silence()` 同样成对归零：`engG` / `gunG` / `warnG`
连同 `gunLfoG` / `warnLfoG` 一起压到 0（时间常数 0.05），
并把 `gunOn`、`warnOn` 复位成 `false`。

---

## 一次性音效

三个底层原语，**都在开头挡 `if (!ready || muted) return;`**，
并且都在内部把传入的 `vol` **再乘一次 `volSfx`**：

| 原语 | 用途 | 细节 |
|---|---|---|
| `burst(vol, f0, f1, dur, type)` | 噪声爆发 | `noiseBuf` 不循环，biquad 默认 `'lowpass'`；频率 `max(40,f0)` 指数扫到 `max(40,f1)`；增益 0.0001→vol（+0.008s）→0.0001（dur）；`stop(t+dur+0.05)` |
| `sweep(vol, f0, f1, dur, type)` | 振荡器扫频 | 振荡器默认 `'sine'`；频率 `max(20,f0)` 指数扫到 `max(20,f1)`；增益 0.0001→vol（+0.01s）→0.0001（dur）；`stop(t+dur+0.05)` |
| `beep(vol, freq, dur, type)` | 定频短音 | 振荡器默认 `'square'`，频率恒定；增益 0.0001→vol（+0.005s）→0.0001（dur）；`stop(t+dur+0.02)` |

因为 `burst` 用的是那段 2.0 秒 buffer 且不循环，
**单个 `burst` 的 `dur` 不能超过 2.0 秒**（当前最长的 `bigHit` 是 1.15 s）。

**所有 `exponentialRampToValueAtTime` 的起点必须是 0.0001 而不是 0**，
否则 WebAudio 抛 `RangeError`。三个原语里都处理了这一点
（终点也都是 0.0001）。

上层音效都是它们的组合。例如爆炸：

```js
boom(size) {
  burst(0.30*size, 2200, 80, 0.75*size, 'lowpass');   // 主爆裂
  sweep(0.26*size, 110, 26, 0.52*size, 'sine');       // 低频冲击
}
```

---

## 音效清单

下表 `vol` 都是相对值，实际音量 = 表内值 × `volSfx`。

| 方法 | 合成与参数 | 调用点 |
|---|---|---|
| `engine(throttle, ab, alive)` | 见"引擎"参数表 | `Game` 每帧；阵亡后以 `(0,false,false)` 收尾 |
| `nearby(dist, throttle, ab)` | 见"附近飞机" | `Game` 每帧取最近一架，无目标传 `99999` |
| `gun(on)` | `gunG=0.115*volSfx`、`gunLfoG=0.075*volSfx`（0.012） | 开火判定；`update()` 结尾兜底 `gun(false)`；暂停时关闭 |
| `warning(on)` | `warnG=0.075*volSfx`、`warnLfoG=0.055*volSfx`（0.03） | 每帧（3.6 km 判定）；暂停/重开 `warning(false)` |
| `lock()` | `beep(0.10, 1480, 0.055, 'square')` | 锁定进度推进 |
| `lockTone(hi)` | `beep(0.09, hi ? 2100 : 1250, 0.045, 'square')` | 逐格提示音 |
| `loseLock()` | `beep(0.07, 620, 0.11, 'triangle')` | 锁定丢失 / 发射被拒 |
| `gunShotAt(dist)` | `att=(1-dist/2600)²`，`att≤0` 返回；节流 `0.06+(1-att)*0.15` s；`burst(0.13*att, 2500-(1-att)*1500, 420, 0.06, 'bandpass')` | `AI` 敌方开炮，"敌人到底有没有在打我"的主要线索 |
| `missileAt(dist)` | `att=1-dist/6000`，`att≤0` 返回；节流 0.05 s；`sweep(0.13*att, 1250-(1-att)*650, 150, 0.45, 'sawtooth')` + `burst(0.15*att, 3000-(1-att)*1800, 300, 0.5, 'lowpass')` | 敌方发射导弹，按与玩家的距离衰减 |
| `missile()` | `sweep(0.20, 1500, 180, 0.42, 'sawtooth')` + `burst(0.22, 3400, 320, 0.55, 'lowpass')` | 己方发射 |
| `missileFar()` | `sweep(0.10, 900, 130, 0.5, 'sawtooth')`（更远、更闷） | 敌方发射 |
| `boom(size)` | `size = size \|\| 1`；`burst(0.30*size, 2200, 80, 0.75*size, 'lowpass')` + `sweep(0.26*size, 110, 26, 0.52*size, 'sine')` | 导弹引信起爆 `0.75`；飞机被击落 `hp>150 ? 1.5 : 1.1` |
| `bigHit()` | `burst(0.34, 1200, 60, 1.15, 'lowpass')` + `sweep(0.30, 90, 22, 1.0, 'sine')` | `Ent` `killGround()`：地面目标被摧毁 |
| `hit()` | `burst(0.22, 4200, 1400, 0.10, 'bandpass')` | 子弹命中 |
| `playerHit()` | `burst(0.34, 1500, 120, 0.42, 'lowpass')` + `sweep(0.22, 200, 40, 0.36, 'square')` | **无调用点** |
| `flare()` | `burst(0.14, 3000, 2600, 0.35, 'highpass')` | `Ent` `breakLock()` 释放干扰弹 |
| `laser()` | `sweep(0.14, 2400, 900, 0.28, 'sawtooth')` | ECM 吊舱开机，或 DEW 定向能拦截成功 |
| `radio()` | `burst(0.045, 2400, 1900, 0.20, 'bandpass')` | 每条无线电字幕（`cls !== 'fx'`） |
| `stall()` | `beep(0.09, 400, 0.20, 'triangle')` | 失速标志 |
| `terrain()` | `beep(0.10, 320, 0.14, 'square')` | 高度 < 260 m 且在下沉 |
| `click()` | `beep(0.07, 880, 0.045, 'square')` | UI 反馈 |
| `confirm()` | `beep(0.09, 1180, 0.07, 'square')`，70 ms 后追加 `beep(0.09, 1580, 0.09, 'square')` | 关键确认 / 击落计数 |
| `fanfare()` | 序列 `[523, 659, 784, 1046]`，每个 `beep(0.11, f, 0.30, 'triangle')`，步长 165 ms | `finish()` 任务成功 |
| `fail()` | 序列 `[392, 330, 262]`，每个 `beep(0.11, f, 0.45, 'sawtooth')`，步长 260 ms | `finish()` 任务失败 |
| `silence()` | `engG`/`gunG`/`warnG`/`gunLfoG`/`warnLfoG` → 0（0.05），`gunOn=warnOn=false` | 暂停、结算、重置 |

`fanfare` 用 `setTimeout` 串起四个音（`confirm` 同理串两个），其余都是一次性调用。

`gunShotAt` 与 `missileAt` 这类按距离触发的音必须做**采样节流**：
机炮每秒三十来发，每帧都触发会瞬间堆几十个 `burst`，既爆音又吃 CPU。
近处 60 ms 一次，越远越稀。远处的炮声还要更闷：高频先被空气吃掉。

`gunShot()`（机炮单发点射反馈）、`playerHit()`、`isReady()`、`isMuted()`
在 `audio.js` 里都实现了，但全库检索不到调用点。
它们是可以随时接上的备用接口，别因为"没人用"就当死代码删掉。

---

## 加一个新音效

1. 在返回的 `API` 对象里加方法
2. 用 `burst` / `sweep` / `beep` 组合
3. **别忘 `if (!ready || muted) return;`** —— `ready` 为假表示
   用户还没交互过，`AudioContext` 还不存在
   （三个原语已各自挡了一层，直接调原语就自动获得这层保护）
4. 如果它是持续音，在 `buildXxx()` 里建节点，**LFO 深度初值设 0**，
   并在 `silence()` 里加一行把它压到 0

---

## 已知问题

1. **`silence()` 不管 `nearG`**：它只归零
   `engG` / `gunG` / `warnG` / `gunLfoG` / `warnLfoG`。
   暂停时 `loop()` 会跳过 `update()`，`nearby()` 不再被调用，
   于是 `nearG` 保持归零前的值——如果暂停那一刻最近的一架飞机
   在 1500 m 内，暂停菜单底下会一直留着它的引擎声。
2. **`warning(on)` 的等值短路**：`if (on === warnOn) return;`
   本身没问题（它需要这个状态机），但任何想改告警音量的地方
   都必须像 `setVolumes` 那样先把 `warnOn` 复位再重调一次，
   否则正在响的告警要等下一次状态翻转才跟上新值。
3. **没有音频可视化或频谱分析**，纯功能实现。
4. **移动端浏览器**有严格的自动播放策略，第一次点击前
   一切静音——这是设计上的必然，不是 bug。
