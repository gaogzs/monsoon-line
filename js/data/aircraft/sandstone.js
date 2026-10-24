/* ============================================================
   VAC-14「砂岩」—— 气动设计实验室的轻型攻击机

   便宜、结构简单、能在半条跑道上起飞。下游造了四千多架，
   损失掉的那些从来没让编制表空过。
   ============================================================ */
Registry.aircraft({
  order: 100,
  id: 'sandstone',
  name: 'VAC-14', nick: 'Sandstone', cn: T('aircraft.sandstone.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 13000,
  role: T('aircraft.sandstone.role'),
  faction: T('aircraft.sandstone.faction'),
  planformType: T('aircraft.sandstone.planformType'),
  caps: ['strike'],
  maker: T('aircraft.sandstone.maker'),
  npcOnly: true,
  model: 'sandstone',
  desc: T('aircraft.sandstone.desc'),
  stats: { spd: 0.36, mob: 0.50, stl: 0.12, fire: 0.62, dur: 0.60, rng: 0.44, ecm: 0.20 },
  phys: { vMax: 395, vMil: 330, vStall: 92, accel: 20, decel: 42, pitch: 0.60, roll: 1.95, yaw: 0.32, hp: 130 },
  gun: 'cel11',
  maxLoad: 3400,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.sandstone.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 2.6, y: -0.6 }, { x: -2.6, y: -0.6 }] },
    { id: 'B', label: T('aircraft.sandstone.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 4.6, y: -1.2 }, { x: -4.6, y: -1.2 }] },
    { id: 'C', label: T('aircraft.sandstone.hardpointGroups.i2.label'), kind: 'light', playerOnly: true, pts: [{ x: 6.0, y: -1.0 }, { x: -6.0, y: -1.0 }] }
  ],
  defaultLoadout: {}
});
