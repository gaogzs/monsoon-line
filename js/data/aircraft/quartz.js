Registry.aircraft({
  order: 160,
  id: 'quartz',
  // 下游按制造商编号；石英是振荡器的材料，也是他们给这架飞机取的名字
  name: 'ROK-2', nick: 'Quartz', cn: T('aircraft.quartz.cn'),
  ceiling: 11000,
  // 机炮抗性（小口径航炮伤害减免比例），见 entities.js 的 gunResistK
  gunResist: 0.05,
  role: T('aircraft.quartz.role'),
  faction: T('aircraft.quartz.faction'),
  planformType: T('aircraft.quartz.planformType'),
  caps: [],
  maker: T('aircraft.quartz.maker'),
  npcOnly: true,
  model: 'boulder',
  desc: T('aircraft.quartz.desc'),
  stats: { spd: 0.21, mob: 0.14, stl: 0.08, fire: 0.04, dur: 0.80, rng: 0.90, ecm: 0.32 },
  phys: { vMax: 285, vMil: 240, vStall: 78, accel: 10, decel: 32, pitch: 0.30, roll: 1.4, yaw: 0.24, hp: 190 },
  /* 无武装，同 J-2 —— 预警机是眼睛，不是枪手。 */
  gun: null,
  maxLoad: 0,
  hardpointGroups: [
    // hy 同 ROK-44：机背天线阵在 -2.60 m，默认的 -1.95 会埋进去
    { id: 'A', label: T('aircraft.quartz.hardpointGroups.i0.label'), kind: 'belly', hy: -3.00, pts: [{ x: 1.0, y: -1.8 }, { x: -1.0, y: -1.8 }] }
  ],
  defaultLoadout: {}
});
