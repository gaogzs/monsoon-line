/* ============================================================
   J-6 蝠鲼 —— 上游公约的重型运输机（批次 6.5）

   不武装、又大又慢，关卡里当护航对象用：命它从 A 飞到 B（spawnEnemy 的 route），
   再让战斗机去护它（o.ward / escort）。它被打掉就是任务失败，所以血量厚、靶面大。
   外形是真的蝠鲼：宽扁的飞翼式机体，机头两侧各一片向前的头鳍，一根细长的尾刺。
   ============================================================ */
Registry.aircraft({
  order: 56,
  id: 'manta',
  name: 'J-6', nick: 'Manta', cn: T('aircraft.manta.cn'),
  ceiling: 9000,
  role: T('aircraft.manta.role'),
  faction: T('aircraft.manta.faction'),
  planformType: T('aircraft.manta.planformType'),
  caps: [],
  maker: T('aircraft.manta.maker'),
  npcOnly: true,
  model: 'manta',
  desc: T('aircraft.manta.desc'),
  stats: { spd: 0.20, mob: 0.06, stl: 0.04, fire: 0.0, dur: 0.95, rng: 0.55, ecm: 0.15 },
  phys: { vMax: 300, vMil: 250, vStall: 80, accel: 8, decel: 22, pitch: 0.20, roll: 0.70, yaw: 0.14, hp: 700 },
  hitR: 14,                     // 很大的靶面（缺省 7.5，boulder 11.5）
  gun: null,
  maxLoad: 0,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.manta.hardpointGroups.i0.label'), kind: 'belly', pts: [{ x: 2.0, y: -2.0 }, { x: -2.0, y: -2.0 }] }
  ],
  defaultLoadout: {}
});
