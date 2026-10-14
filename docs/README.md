# 文档索引

| 文档 | 内容 |
|---|---|
| [DESIGN.md](DESIGN.md) | **总设计文档** —— 架构、模块划分、数据流、关键约定、已知问题 |
| [world/SETTING.md](world/SETTING.md) | **世界设定集** —— 可以脱离代码单独阅读 |
| [systems/rendering.md](systems/rendering.md) | 渲染管线：相机、投影、裁剪、光照、天空与云 |
| [systems/flight-model.md](systems/flight-model.md) | 飞行模型：大气、动压、姿态积分、导弹动力学 |
| [systems/weapons.md](systems/weapons.md) | 武器系统：编号体系、导引、拦截、交战规则 |
| [systems/ai.md](systems/ai.md) | AI：控制律、状态机、编队指令、难度 |
| [systems/loadout.md](systems/loadout.md) | **挂载系统** —— 分组挂载点、齐射数、重量惩罚 |
| [systems/hud.md](systems/hud.md) | HUD、输入映射与设置系统 |
| [systems/planform.md](systems/planform.md) | 机库俯视识别图与预览器 |
| [systems/audio.md](systems/audio.md) | 程序化音效合成 |

---

## 一条约定

**改动代码之后，请同步更新对应文档。**

这些文档不是事后补写的说明，而是下一次改动时的依据。特别是那些
"看起来可以随手改、其实有具体原因"的地方——原因都写在这里，
不写下来就会在半年后被某个人（很可能是自己）改回去。

## 另一条约定

`tools/smoke.js` 是这个项目唯一的自动化测试。改完代码之后跑一下：

```bash
node tools/smoke.js
```

它用最小 DOM / Canvas / WebAudio 桩把所有脚本加载起来，跑一遍开机自检，
逐个点击导航按钮，然后启动任务推进 240 帧。它能抓住大部分
"改一行结果整个游戏白屏"的问题。
