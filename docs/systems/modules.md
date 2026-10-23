# 模块公开接口表

批次 1（v3.0.0 底层重构）之后，`js/` 里没有"一个文件一个巨型闭包"了：每个命名空间拆成按职责命名的小文件，
共享状态放在 `NS.$`。**只许该命名空间自己的文件读写 `NS.$`；跨命名空间只能走下面的公开函数。**
`tools/test/smoke.js` 有静态检查。

## 命名空间

### `Ent` —— 实体、飞行模型、导弹、粒子、伤害

文件：`engine/entities/_state.js`、`engine/entities/aircraft.js`、`engine/entities/damage.js`、`engine/entities/ecm.js`、`engine/entities/guns.js`、`engine/entities/missile.js`、`engine/entities/mounts.js`、`engine/entities/particles.js`、`engine/entities/physics.js`、`engine/entities/radiation.js`、`engine/entities/range.js`、`engine/entities/targets.js`、`engine/entities/warhead.js`

公开接口（`Ent.xxx`）：`airDensity`、`airDragK`、`qOf`、`ctrlFactor`、`turnFactor`、`makeAircraft`、`stepAircraft`、`hostile`、`fitsKind`、`mountPlan`、`storePos`、`storeHy`、`nozzlesOf`、`surfaceBelow`、`STORE_HY`、`forEachStoreSlot`、`storeForSlot`、`chooseWeapon`、`setWeapon`、`targetClass`、`curLoadFactor`、`contactScan`、`weaponMatchesTarget`、`mountIssues`、`clearMountIssues`、`makeMissile`、`stepMissile`、`effectiveLife`、`breakLock`、`breakLockFor`、`openEcm`、`passiveEffects`、`setEcm`、`setStealth`、`ECM_LEAD_K`、`fireGun`、`fireGunFrom`、`shellFuze`、`detonateShell`、`gunMuzzle`、`flashRings`、`stepBullet`、`SLOT_EMPTY`、`spawnParticle`、`stepParticles`、`explode`、`damage`、`kill`、`killGround`、`explode2`、`detonate`、`wakeSpray`、`effRange`、`glideReach`、`maxReach`、`flyTo`、`envelopeRange`、`envelopeCached`、`displayRange`、`naturalPoint`、`gunLead`、`groundY`、`terrainY`、`isLand`、`agl`、`SEA_Y`、`setTerrain`、`finFootprint`、`aiReach`、`AI_RANGE_K`、`lockOff`、`isHard`、`warheadK`、`hitAny`、`isRadiating`、`jamState`、`jamShown`、`jamDuty`、`jamRanges`、`jamPress`、`jamLockOK`、`jamLockK`、`JAM_BURN_R`、`JAM_SURF_K`、`JAM_BURN_SURF`、`gunResistK`、`SMALL_CAL`、`setTargetHitHandler`、`hitSurface`、`makeTarget`、`stepTarget`、`randUnit`

`$` 私有状态在 `js/engine/entities/_state.js`。`physics`（大气 / 控制因子 / 地形钩子）、`mounts`（挂点适配与 NPC 挂载分配）、`aircraft`、`missile`、`range`（有效射程与发射包线）、`radiation`（反辐射与烧穿干扰）、`warhead`（加固与战斗部）、`guns`、`particles`、`damage`、`ecm`（被动吊舱）、`targets`。

### `AI` —— AI 控制律与行为

文件：`engine/ai/_state.js`、`engine/ai/brain.js`、`engine/ai/steer.js`、`engine/ai/tactics.js`、`engine/ai/util.js`

公开接口（`AI.xxx`）：`attach`、`update`、`steerTo`、`findIncoming`、`nearestEnemy`、`leadTo`、`strafeTarget`

`util`（索敌与工具）、`steer`（把期望方向翻译成三轴杆量）、`brain`（attach / update 主决策）、`tactics`（追击 / 规避 / 对地）。

### `HUD` —— 平显

文件：`ui/hud/_state.js`、`ui/hud/aids.js`、`ui/hud/base.js`、`ui/hud/instruments.js`、`ui/hud/panels.js`、`ui/hud/radar.js`、`ui/hud/targeting.js`、`ui/hud/text.js`

公开接口（`HUD.xxx`）：`draw`、`banner`、`hitMark`、`computeNEZ`、`computeEnvelope`、`radarXY`、`offscreenRect`、`drawAlerts`、`ALERT_ORDER`、`thrPercent`、`THR_IDLE`、`THR_MAX`、`GREEN`、`AMBER`、`CY`、`RED`

`base`（配色、布局、主入口 draw）、`instruments`（指南针 / 速度高度带 / 推力 / 舵面）、`radar`（雷达与威胁环）、`targeting`（目标框与锁定框）、`aids`（CCIP / 瞄准圈 / 屏外标记）、`panels`（武器面板 / 告警栈 / 目标方位尺）、`text`。

### `Game` —— 状态机、主循环、屏幕、输入、相机

文件：

公开接口（`Game.xxx`）：`init`、`startMission`、`__player`、`__world`、`__pushStores`、`__updateTargets`、`__update`、`__render`、`__updateLock`、`__cycleTarget`、`__scanShot`、`__camFrame`、`__thr`、`__camPitch`

文件按职责分在 `js/engine/game/`（世界侧：vars、world、launch、mission-start、control、lock、combat、update、finish、loadout）、`js/ui/`（input、camera、frame）、`js/ui/screens/`（nav、settings、hangar、hardpoints、brief、codex、pause、changelog）、`js/boot/main.js`（主循环、开机自检、初始化）。`__` 开头的是测试 / 回归钩子（`__render` 只画一帧、`__update` 只推进逻辑）。

### `PLANFORM` —— 平面识别图

文件：`render/planform/_state.js`、`render/planform/paint.js`、`render/planform/planes.js`、`render/planform/stores.js`

公开接口（`PLANFORM.xxx`）：`planes`、`draw`、`paint`、`paintStore`

### `RenderEnv` —— GL 环境层（天空 / 海面 / 云 / 粒子）

文件：`render/env/_state.js`、`render/env/build.js`、`render/env/create.js`、`render/env/shaders.js`

公开接口（`RenderEnv.xxx`）：`create`、`PERIOD`

### 其余模块

| 全局 | 文件 | 公开接口 |
|---|---|---|
| `Registry` | `core/registry.js` | `aircraft` `ship` `platform` `weapon` `turretGun` `target` `model` `modelGroup` `mission` `campaign` `codexEntry`（注册）；`list` `byId` `seal` `sealData` `sealModels` `sealMissions` `sealCodex` |
| `Tags` | `core/registry.js`（声明在 `core/tags.js`） | `declare` `expand` `has` `declared` |
| `Text` / `T` | `core/text.js` | `T(key[, ctx])` `T.pick` `T.has`；`Text.load` `lang` `keys` `unused` `missing` |
| `Loadout` | `engine/loadout.js` | `defaults(ac)` `resolve(ac, lo)` `mass(ac, lo)` `passive(ac, lo)` `apply(ent, ac, lo[, wl])` —— 机库、开局（以及批次 4 的整备点）共用 |
| `ModelLib` | `models/_lib.js` 等 | 模型构建器：`V` `C` `MB` `mast` `house` `done` `orientClosed` `seaBase` `jacket` `pDeck`，收尾遍 `finish` |
| `Combat` `Turret` `Route` `Ballistics` `SFX` | `engine/*.js` | 见各自的 systems 文档 |
| `Renderer` `RenderGL` | `render/render.js` `render/render-gl.js` | 见 [rendering.md](rendering.md) |
| `UnitView` `HudFx` `Radio` `SysNote` `CODEX` | `ui/` | 见 [unitview.md](unitview.md)、[hud.md](hud.md)、[codex.md](codex.md) |

## 机库视图（`Game.$.hangarView`）

`buildHangar(view)` / `buildHardpointEditor(ac, lo, view)` 不再读写全局的 `selectedAC` / `activeHpGroup`，
只读一个视图对象：`ac`（机型下标）、`group`（选中的挂载点组）、`ids`（元素 id 表，键缺省时用键名本身）、
`rebuild`（改动之后怎么重画）。批次 4 的整备界面传一套自己的 id 就能复用同一份编辑器。

## 旧文件 → 新位置

| 旧文件 | 现在 |
|---|---|
| `data.js` | `data/{aircraft,weapons,ships,platforms,targets,turret-guns,callsigns}/<id>.js`、`data/rules.js`、`data/voices.js`；武器原来分在 `STORE_ATTR` `STORE_LOOK` `STORE_ROLE` `STORE_NEEDS` `STORE_COOLDOWN` `MISSILE_LEAD` `FLARE_RD` 里的字段并进各自的武器文件（`attr` / `look` / `role` / `needs` / `cd` / `lead` / `flareRD`）；`SHIP_MOUNTS` / `SHIP_LAUNCHERS` 并进各舰文件的 `mounts` / `launchers`；`HARD_MODELS` / `GUN_RESIST_MODELS` 并进 `data/targets/` |
| `models.js` | `models/_lib.js`（`ModelLib`）+ 每个模型一个文件 + `models/_passes.js`（收尾遍） |
| `missions.js` | `missions/_lib.js`（共享生成器）+ 每关一个文件 + `missions/campaigns.js`（按关卡 id 引用） |
| `entities.js` `ai.js` `hud.js` `planform.js` `render-env.js` | 同名命名空间下的目录，见上 |
| `game.js` | `Game` 按职责分在 `engine/game/` `ui/` `ui/screens/` `boot/`；`Radio` → `ui/radio.js`，`SysNote` → `ui/sysnote.js` |
| `codex.js` | `ui/codex/entries/<id>.js`（一条一个文件）+ `ui/codex/_lib.js` + `ui/codex/zz-seal.js` |

武器 id：五门机炮 `k1 k2 k3 k7 k11` 改名为 `cel1 cel2 cel3 cel7 cel11`，与玩家看到的 CEL-n 对应。
