/* ============================================================
   F-12 塘鹅 —— 国土防卫重型战斗机（批次 6.2b）
   守本土与航母上空：不以机动取胜，靠挂载多、扛打。5 组挂点，空空与对地都能接。
   ============================================================ */
Registry.aircraft({
  order: 45,
  id: 'gannet',
  name: 'F-12', nick: 'Gannet', cn: T('aircraft.gannet.cn'),
  ceiling: 16000,
  role: T('aircraft.gannet.role'),
  faction: T('aircraft.gannet.faction'),
  planformType: T('aircraft.gannet.planformType'),
  caps: ['intercept', 'strike'],
  maker: T('aircraft.gannet.maker'),
  model: 'gannet',
  desc: T('aircraft.gannet.desc'),
  stats: { spd: 0.55, mob: 0.36, stl: 0.22, fire: 0.92, dur: 0.88, rng: 0.80, ecm: 0.34 },
  phys: { vMax: 520, vMil: 420, vStall: 120, accel: 20, decel: 34, pitch: 0.50, roll: 1.35, yaw: 0.28, hp: 190 },
  gun: 'cel3',
  maxLoad: 6800,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.gannet.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 3.2, y: -1.6 }, { x: -3.2, y: -1.6 }] },
    { id: 'B', label: T('aircraft.gannet.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 5.2, y: -3.0 }, { x: -5.2, y: -3.0 }] },
    { id: 'C', label: T('aircraft.gannet.hardpointGroups.i2.label'), kind: 'light', pts: [{ x: 6.8, y: -5.6 }, { x: -6.8, y: -5.6 }] },
    { id: 'D', label: T('aircraft.gannet.hardpointGroups.i3.label'), kind: 'heavy', playerOnly: true, pts: [{ x: 2.1, y: -3.0 }, { x: -2.1, y: -3.0 }] },
    { id: 'E', label: T('aircraft.gannet.hardpointGroups.i4.label'), kind: 'belly', playerOnly: true, pts: [{ x: 0.9, y: -2.6 }, { x: -0.9, y: -2.6 }] }
  ],
  defaultLoadout: { A: 'hva', B: 'mrm', C: 'trm', D: 'v17', E: 'pgb' }
});
