/* ============================================================
   G-8 燕鸥 —— 战斗轰炸机（批次 6.2c）
   速度够自卫的对地攻击机：机腹两组挂对地弹，翼下两组留空空弹，遇到敌机能应战。
   填的是「快、能打空战、又能挂对地重弹」的空缺。
   ============================================================ */
Registry.aircraft({
  order: 35,
  id: 'tern',
  name: 'G-8', nick: 'Tern', cn: T('aircraft.tern.cn'),
  ceiling: 14000,
  role: T('aircraft.tern.role'),
  faction: T('aircraft.tern.faction'),
  planformType: T('aircraft.tern.planformType'),
  caps: ['strike'],
  maker: T('aircraft.tern.maker'),
  model: 'tern',
  desc: T('aircraft.tern.desc'),
  stats: { spd: 0.62, mob: 0.58, stl: 0.34, fire: 0.76, dur: 0.52, rng: 0.62, ecm: 0.30 },
  phys: { vMax: 450, vMil: 385, vStall: 105, accel: 24, decel: 36, pitch: 0.56, roll: 1.9, yaw: 0.30, hp: 130 },
  gun: 'cel3',
  maxLoad: 6000,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.tern.hardpointGroups.i0.label'), kind: 'belly', pts: [{ x: 1.0, y: -1.2 }, { x: -1.0, y: -1.2 }] },
    { id: 'B', label: T('aircraft.tern.hardpointGroups.i1.label'), kind: 'belly', pts: [{ x: 2.2, y: -2.4 }, { x: -2.2, y: -2.4 }] },
    { id: 'C', label: T('aircraft.tern.hardpointGroups.i2.label'), kind: 'light', pts: [{ x: 4.0, y: -2.2 }, { x: -4.0, y: -2.2 }] },
    { id: 'D', label: T('aircraft.tern.hardpointGroups.i3.label'), kind: 'light', pts: [{ x: 5.6, y: -3.0 }, { x: -5.6, y: -3.0 }] }
  ],
  defaultLoadout: { A: 'pgb', B: 'clb', C: 'mrm', D: 'trm' }
});
