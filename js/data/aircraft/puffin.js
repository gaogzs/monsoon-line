/* ============================================================
   J-4 海鹦 —— 上游公约的空中整备机（批次 6.5）

   一架不武装的大飞机，在战区后方慢速盘旋：它本身就是一个**移动的整备点**（tags: ['resupply']）。
   关卡里写 mission.resupply: [{ ref: 'puffin', r: 2200, hold: 5, swap: true }]，
   玩家飞到它附近停留几秒就能补满弹药、重选挂载。
   生成见 js/missions/_lib.js 的 spawnTanker（盘旋航线，登记 w.refs）。
   ============================================================ */
Registry.aircraft({
  order: 55,
  tags: ['resupply'],
  id: 'puffin',
  name: 'J-4', nick: 'Puffin', cn: T('aircraft.puffin.cn'),
  ceiling: 11000,
  role: T('aircraft.puffin.role'),
  faction: T('aircraft.puffin.faction'),
  planformType: T('aircraft.puffin.planformType'),
  caps: [],
  maker: T('aircraft.puffin.maker'),
  npcOnly: true,
  model: 'puffin',
  desc: T('aircraft.puffin.desc'),
  stats: { spd: 0.30, mob: 0.12, stl: 0.05, fire: 0.0, dur: 0.70, rng: 0.60, ecm: 0.20 },
  // 没有加力：vMax = vMil（约定见 _schema.js；Ent.hasAfterburner 以此判断）
  phys: { vMax: 280, vMil: 280, vStall: 85, accel: 9, decel: 24, pitch: 0.28, roll: 1.0, yaw: 0.20, hp: 260 },
  hitR: 10,                     // 大型机：靶面比战斗机大（缺省 7.5）
  gun: null,
  maxLoad: 0,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.puffin.hardpointGroups.i0.label'), kind: 'belly', pts: [{ x: 1.2, y: 0 }, { x: -1.2, y: 0 }] }
  ],
  defaultLoadout: {}
});
