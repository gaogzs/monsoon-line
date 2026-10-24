Registry.aircraft({
  order: 20,
  id: 'sailfish',
  model: 'sailfish',
  name: 'D-14',
  nick: 'Sailfish',
  cn: T('aircraft.sailfish.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 21000,
  // 第三涵道：稀薄空气里仍给得出控制力矩。低动压保底操控 0.34
  ctrlFloor: 0.34,
  role: T('aircraft.sailfish.role'),
  faction: T('aircraft.sailfish.faction'),
  planformType: T('aircraft.sailfish.planformType'),
  caps: ['intercept'],
  maker: T('aircraft.sailfish.maker'),
  stats: { spd: 0.96, mob: 0.84, stl: 0.86, fire: 0.54, dur: 0.32, rng: 0.48, ecm: 0.30 },
  phys: { vMax: 566, vMil: 448, vStall: 122, accel: 33, decel: 36, pitch: 0.80, roll: 2.65, yaw: 0.28, hp: 92 },
  gun: 'cel3',
  maxLoad: 4800,

  // D-14 没有翼尖挂架，但有多一处机腹重挂点
  hardpointGroups: [
    { id: 'A', label: T('aircraft.sailfish.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 2.6, y: -2.3 }, { x: -2.6, y: -2.3 }] },
    { id: 'B', label: T('aircraft.sailfish.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 4.2, y: -4.2 }, { x: -4.2, y: -4.2 }] },
    { id: 'C', label: T('aircraft.sailfish.hardpointGroups.i2.label'), kind: 'belly', pts: [{ x: 0.95, y: -4.2 }, { x: -0.95, y: -4.2 }] },
    { id: 'D', label: T('aircraft.sailfish.hardpointGroups.i3.label'), kind: 'tip', playerOnly: true, pts: [{ x: 6.0, y: -5.6 }, { x: -6.0, y: -5.6 }] }
  ],
  defaultLoadout: { A: 'mrm', B: 'hos', C: 'ecm2' },
  desc: T('aircraft.sailfish.desc')
});
