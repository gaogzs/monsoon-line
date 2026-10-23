/* ============================================================
   「浪花」SPRAY Mk.1 —— 海上巡逻机

   群岛国不叫它战斗机，因为它的确不是：一架飞得慢、转得笨、
   但能在海上待很久的机器，机腹挂一副搜救吊舱，机头一门 20 mm 炮。
   它和屿级巡逻艇是这片海域里少数还会回应求救信号的东西。
   ============================================================ */
Registry.aircraft({
  order: 130,
  id: 'spray',
  name: 'DJACU Mk.1', nick: 'Spray', cn: T('aircraft.spray.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 10000,
  role: T('aircraft.spray.role'),
  faction: T('aircraft.spray.faction'),
  planformType: T('aircraft.spray.planformType'),
  caps: [],
  maker: T('aircraft.spray.maker'),
  npcOnly: true,
  model: 'spray',
  desc: T('aircraft.spray.desc'),
  stats: { spd: 0.26, mob: 0.30, stl: 0.10, fire: 0.26, dur: 0.52, rng: 0.92, ecm: 0.30 },
  phys: { vMax: 320, vMil: 275, vStall: 82, accel: 14, decel: 36, pitch: 0.38, roll: 1.64, yaw: 0.30, hp: 110 },
  gun: 'cel1',
  maxLoad: 1400,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.spray.hardpointGroups.i0.label'), kind: 'light', pts: [{ x: 3.0, y: -0.8 }, { x: -3.0, y: -0.8 }] },
    { id: 'B', label: T('aircraft.spray.hardpointGroups.i1.label'), kind: 'belly', pts: [{ x: 0.8, y: -1.6 }, { x: -0.8, y: -1.6 }] }
  ],
  defaultLoadout: {}
});
