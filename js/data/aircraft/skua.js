/* ============================================================
   D-21 贼鸥 —— 多用途隐形战斗机
   ============================================================ */
Registry.aircraft({
  order: 50,
  id: 'skua',
  name: 'D-21', nick: 'Skua', cn: T('aircraft.skua.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 19000,
  role: T('aircraft.skua.role'),
  faction: T('aircraft.skua.faction'),
  planformType: T('aircraft.skua.planformType'),
  caps: ['strike', 'ew'],
  maker: T('aircraft.skua.maker'),
  model: 'skua',
  desc: T('aircraft.skua.desc'),
  stats: { spd: 0.72, mob: 0.66, stl: 0.96, fire: 0.56, dur: 0.50, rng: 0.70, ecm: 0.72 },
  phys: { vMax: 540, vMil: 430, vStall: 118, accel: 26, decel: 36, pitch: 0.66, roll: 2.42, yaw: 0.26, hp: 96 },
  gun: 'cel3',
  maxLoad: 4200,
  hardpointGroups: [
    /* 升力体机身很扁（下表面约 -0.75 m），默认的 belly -1.95 / light -1.15
       会让挂载悬在机身下面一米多 —— 贴着机腹 / 翼面挂。 */
    { id: 'A', label: T('aircraft.skua.hardpointGroups.i0.label'), kind: 'belly', expose: 0, hy: -0.82, pts: [{ x: 1.1, y: -2.2 }, { x: -1.1, y: -2.2 }] },
    { id: 'B', label: T('aircraft.skua.hardpointGroups.i1.label'), kind: 'light', hy: -0.55, pts: [{ x: 3.6, y: -3.4 }, { x: -3.6, y: -3.4 }] },
    { id: 'C', label: T('aircraft.skua.hardpointGroups.i2.label'), kind: 'light', hy: -0.55, playerOnly: true, pts: [{ x: 5.4, y: -3.6 }, { x: -5.4, y: -3.6 }] }
  ],
  defaultLoadout: { A: 'lcm', B: 'oep' }
});
