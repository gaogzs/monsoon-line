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
  /* 悬停分支参数（vtol.js）。推力只代表期望的前进速度（0% 静止悬浮、50% = vStall、100% = 军推），
     不下坠由实际速度决定：速度低于 vStall 时喷口转向补上机翼托不住的那部分（推力预算 = phys.accel，必须大于 G）。
       transK      速度低于「有效 vStall × transK」进悬停分支；回到 ×1.08 且对齐后交还主路径
       vzUp        低速时仰头上升的最大爬升率（m/s，按仰角 sin 折算）；低头不下降
       vzDown      减速板（推力在慢车以下）悬浮下降的速度（m/s）
       vAccel      竖直辅助速度的变化率（m/s²）
       rcs         姿态角速率（rad/s），不吃动压 */
  vtol: { transK: 1.2, vzUp: 24, vzDown: 18, vAccel: 9, rcs: { pitch: 0.9, roll: 1.6, yaw: 0.9 } },
  gun: 'cel3',
  maxLoad: 3200,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.seahorse.hardpointGroups.i0.label'), kind: 'tip', pts: [{ x: 4.3, y: -3.3 }, { x: -4.3, y: -3.3 }] },
    { id: 'B', label: T('aircraft.seahorse.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 2.7, y: -2.4 }, { x: -2.7, y: -2.4 }] },
    { id: 'C', label: T('aircraft.seahorse.hardpointGroups.i2.label'), kind: 'belly', pts: [{ x: 0.9, y: -4.4 }, { x: -0.9, y: -4.4 }] }
  ],
  defaultLoadout: { A: 'srm', B: 'mrm', C: 'clb' }
});
