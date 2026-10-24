/* ============================================================
   调节场管理局 —— 技术机构，状态不明
   ============================================================ */
Registry.aircraft({
  order: 140,
  id: 'datum',
  // 管理局是技术机构，它的飞机不挂军标，只有自己的批次名
  name: 'MERLI', nick: 'Datum', cn: T('aircraft.datum.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 21000,
  role: T('aircraft.datum.role'),
  faction: T('aircraft.datum.faction'),
  planformType: T('aircraft.datum.planformType'),
  caps: [],
  maker: T('aircraft.datum.maker'),
  npcOnly: true,
  model: 'sower',
  desc: T('aircraft.datum.desc'),
  stats: { spd: 0.29, mob: 0.22, stl: 0.20, fire: 0.10, dur: 0.72, rng: 0.86, ecm: 0.42 },
  phys: { vMax: 295, vMil: 250, vStall: 78, accel: 11, decel: 34, pitch: 0.34, roll: 1.56, yaw: 0.26, hp: 180 },
  gun: 'cel3v',
  maxLoad: 900,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.datum.hardpointGroups.i0.label'), kind: 'belly', hy: -1.85, pts: [{ x: 0.9, y: -1.4 }, { x: -0.9, y: -1.4 }] }
  ],
  defaultLoadout: {}
});
