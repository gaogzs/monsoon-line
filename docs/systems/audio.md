# 音效合成

代码：`js/audio.js`

---

## 为什么全程序化

**没有任何音频文件。** 每一个声音都是 WebAudio 节点实时合成的。

理由：

1. **零资源分发**。游戏只有一个 HTML + 一个 CSS + 11 个 JS，
   可以直接邮件发送
2. **不会有加载失败**。没有 404、没有解码错误、没有格式兼容问题
3. **可以连续调制**。引擎音要随油门连续变频，
   用采样循环做这件事会很难听

代价：合成音不如录制音真实。但对一个低多边形游戏来说，
电子感的音效反而更协调。

---

## 音量架构

三层：

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

API：

```js
SFX.setVolumes(master, engine, sfx);   // 0..1
SFX.getVolumes();
SFX.setMuted(bool);                    // 只影响 master gain
```

`setMuted` 不修改各通道的值，所以静音/取消静音不会丢失音量设置。

---

## 持续音（三组）

在 `unlock()` 里一次性建好节点，之后只调参数，**绝不每帧新建节点**。

### 引擎

```
sawtooth(74Hz) ─┐
                ├→ lowpass → gain → master
square(37Hz) ───┘
      ↑
sine LFO 调 frequency
```

基频 = `52 + throttle*62 + (ab ? 22 : 0)` Hz，
低通截止 = `560 + throttle*1500 + (ab?500:0)`。
加力时音量再加 0.030。

**不用采样**是因为需要跨越 4 个八度连续变频而不产生"变调"感。

### 机炮

```
循环白噪声 → bandpass(1250Hz) → gain → master
                                  ↑
                        64Hz square 调制 gain
```

那个 64 Hz 的方波调制是关键——它把连续噪声切成
每秒 64 次的脉冲，听感就是转膛炮的"突突突"。
发射率 3900 发/分 ≈ 65 发/秒，和调制频率匹配。

### 导弹告警

```
square(1150Hz) → gain → master
                    ↑
         7Hz square 调制 gain
```

7 Hz 的断续感模拟真实 RWR 的"哔—哔—哔"。

---

## 一次性音效

三个底层原语：

| 原语 | 用途 |
|---|---|
| `burst(vol, f0, f1, dur, type)` | 噪声爆发，频率从 f0 扫到 f1 |
| `sweep(vol, f0, f1, dur, type)` | 振荡器扫频 |
| `beep(vol, freq, dur, type)` | 定频短音 |

上层音效都是它们的组合。例如爆炸：

```js
boom(size) {
  burst(0.30*size, 2200, 80, 0.75*size, 'lowpass');   // 主爆裂
  sweep(0.26*size, 110, 26, 0.52*size, 'sine');       // 低频冲击
}
```

**所有 `exponentialRampToValueAtTime` 的起点必须是 0.0001 而不是 0**，
否则 WebAudio 抛 `RangeError`。三个原语里都处理了这一点。

---

## 音效清单

| 方法 | 触发时机 |
|---|---|
| `engine(throttle, ab, alive)` | 每帧 |
| `gun(on)` | 机炮开火期间 |
| `warning(on)` | 有导弹以本机为目标且在 3.6 km 内 |
| `lock()` / `lockTone(hi)` / `loseLock()` | 锁定进度变化 |
| `missile()` / `missileFar()` | 己方 / 敌方发射 |
| `boom(size)` / `bigHit()` | 爆炸 / 大型目标受创 |
| `hit()` / `playerHit()` | 命中 / 被命中 |
| `flare()` | 释放干扰弹 |
| `laser()` | 定向能拦截或 ECM 开机 |
| `radio()` | 每条无线电字幕 |
| `stall()` / `terrain()` | 失速 / 撞地告警 |
| `click()` / `confirm()` | UI 反馈 |
| `fanfare()` / `fail()` | 任务成功 / 失败 |
| `silence()` | 暂停时一键静音全部持续音 |

---

## 加一个新音效

1. 在返回的 API 对象里加方法
2. 用 `burst` / `sweep` / `beep` 组合
3. **别忘 `if (!ready || muted) return;`** —— `ready` 为假表示
   用户还没交互过，AudioContext 还不存在
4. 如果它是持续音，在 `buildXxx()` 里建节点，
   并在 `silence()` 里加一行把它压到 0

---

## 已知问题

1. **`warning(on)` 有状态短路**：`if (on === warnOn) return;`
   意味着改变 `volSfx` 时正在响的告警音量不会立刻更新，
   要等下一次状态翻转。
2. **没有音频可视化或频谱分析**，纯功能实现。
3. **移动端浏览器**有严格的自动播放策略，第一次点击前
   一切静音——这是设计上的必然，不是 bug。
