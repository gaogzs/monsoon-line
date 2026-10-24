/* ============================================================
   F-9 海燕 —— 高空高速截击机
   ============================================================ */
Registry.aircraft({
  order: 40,
  id: 'petrel',
  name: 'F-9', nick: 'Petrel', cn: T('aircraft.petrel.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 21000,
  // 高速区间里操控提前拉满（16500 而不是默认的 22000）
  ctrlFull: 16500,
  role: T('aircraft.petrel.role'),
  faction: T('aircraft.petrel.faction'),
  planformType: T('aircraft.petrel.planformType'),
  caps: ['intercept'],
  maker: T('aircraft.petrel.maker'),
  model: 'petrel',
  desc: T('aircraft.petrel.desc'),
  stats: { spd: 0.98, mob: 0.40, stl: 0.30, fire: 0.74, dur: 0.58, rng: 0.62, ecm: 0.28 },
  phys: { vMax: 640, vMil: 500, vStall: 138, accel: 34, decel: 32, pitch: 0.48, roll: 1.72, yaw: 0.24, hp: 110 },
  gun: 'cel3',
  maxLoad: 5200,
  hardpointGroups: [
    // 挂在三角翼中段下面 —— 以前落在前缘之前，弹体整个悬在翼外
    { id: 'A', label: T('aircraft.petrel.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 3.0, y: -3.0 }, { x: -3.0, y: -3.0 }] },
    { id: 'B', label: T('aircraft.petrel.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 5.0, y: -5.3 }, { x: -5.0, y: -5.3 }] },
    { id: 'C', label: T('aircraft.petrel.hardpointGroups.i2.label'), kind: 'heavy', playerOnly: true, pts: [{ x: 4.0, y: -4.0 }, { x: -4.0, y: -4.0 }] }
  ],
  /* C（2.4 新增）翼下内侧再挂一对 CLA-17 远距冲压弹：一击脱离靠射程，截击机不缺远弹 */
  defaultLoadout: { A: 'hva', B: 'mrm', C: 'v17' }
});
