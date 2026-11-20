/* ============================================================
   D-27 海马 —— 轻型舰载垂直起降战斗机（批次 6.2）
   单发、没有跑道也能起降：喷口向下偏转托举，油门居中就是定高悬停，倾斜机头就会往那个方向漂。
   不是重型机：挂点只有三组、载荷小、血量少，是前线的近距护卫与补位。
   飞行模型是独立分支（js/engine/entities/vtol.js）：速度低于 vtol.transSpeed 时进悬停分支，
   速度矢量与机头解耦；高于它之后和普通战斗机一样。机型字段 vtol 的参数含义见下面。
   玩家专用（没有 npcOnly）；本批 AI 不会驾驶它。
   ============================================================ */
Registry.aircraft({
  order: 55,
  tags: ['vtol', 'noPSM'],
  id: 'seahorse',
  name: 'D-27', nick: 'Seahorse', cn: T('aircraft.seahorse.cn'),
  ceiling: 11000,
  role: T('aircraft.seahorse.role'),
  faction: T('aircraft.seahorse.faction'),
  planformType: T('aircraft.seahorse.planformType'),
  caps: ['strike'],
  maker: T('aircraft.seahorse.maker'),
  model: 'seahorse',
  desc: T('aircraft.seahorse.desc'),
  stats: { spd: 0.46, mob: 0.52, stl: 0.30, fire: 0.46, dur: 0.30, rng: 0.30, ecm: 0.20 },
  /* vStall 取得很小（70）：它只在主路径（速度 ≥ vtol.transSpeed）里起作用，那里本来就不该失速 */
  phys: { vMax: 360, vMil: 300, vStall: 70, accel: 16, decel: 28, pitch: 0.9, roll: 2.2, yaw: 0.6, hp: 105 },
  /* 悬停分支参数（vtol.js）：
       transSpeed  低于它进悬停分支；速度回到 ×1.08 且机头对齐后交还主路径
       wingV       翼升力从 0 到满的速度尺度（wingK = min(1, (v/wingV)²)）
       liftG       升力推力 / 重量（要大于 1 + 阻力才能以 vzUp 爬升）
       vzUp vzDown 辅助悬停的最大爬升 / 下降速度（m/s），油门 0.85 / 0.04 对应
       fwdAccel    前向推力加速度（m/s²），油门 0.85 → 1.25 渐开
       drag        悬停时的线性阻力系数（1/s）
       align       速度矢量被拉向机头的速率（1/s，×wingK）
       rcs         姿态角速率（rad/s），不吃动压 */
  vtol: { transSpeed: 95, wingV: 80, liftG: 1.6, vzUp: 28, vzDown: 18, fwdAccel: 14, drag: 0.18, align: 2.5,
    rcs: { pitch: 0.9, roll: 1.6, yaw: 0.9 } },
  gun: 'cel3',
  maxLoad: 3200,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.seahorse.hardpointGroups.i0.label'), kind: 'tip', pts: [{ x: 4.3, y: -3.3 }, { x: -4.3, y: -3.3 }] },
    { id: 'B', label: T('aircraft.seahorse.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 2.7, y: -2.4 }, { x: -2.7, y: -2.4 }] },
    { id: 'C', label: T('aircraft.seahorse.hardpointGroups.i2.label'), kind: 'belly', pts: [{ x: 0.9, y: -4.4 }, { x: -0.9, y: -4.4 }] }
  ],
  defaultLoadout: { A: 'srm', B: 'mrm', C: 'clb' }
});
