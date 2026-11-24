/* ============================================================
   ROK-6「砾石」—— 下游同盟的廉价无人机

   KA-7 的下游对应品：同样没有座舱、没有判断力，由长机（有人机、预警机或一艘无人机母舰）
   授权开火；区别是它**便宜到成群放出去**——挂的是最老的格斗弹，结构脆，速度也追不上有人机。
   它的价值在数量：几十架一起压上来，对手的弹药和注意力先耗光。
   一片挤在一起的无人机会被同一个干扰场同时压制，这正是玩家主动干扰最划算的时候。

   NPC 专用（npcOnly），带 unmanned 标签；用 spawnDrone(leader, { type: 'gravel' }) 放出。
   ============================================================ */
Registry.aircraft({
  order: 180,
  tags: ['unmanned'],
  id: 'gravel',
  name: 'ROK-6', nick: 'Gravel', cn: T('aircraft.gravel.cn'),
  ceiling: 12000,
  role: T('aircraft.gravel.role'),
  faction: T('aircraft.gravel.faction'),
  planformType: T('aircraft.gravel.planformType'),
  caps: [],
  maker: T('aircraft.gravel.maker'),
  npcOnly: true,
  model: 'gravel',
  desc: T('aircraft.gravel.desc'),
  stats: { spd: 0.52, mob: 0.58, stl: 0.18, fire: 0.40, dur: 0.14, rng: 0.30, ecm: 0.10 },
  /* 极速不求压过有人机（它跟的是下游长机，下游长机本来就慢）；hp 很低——一发近炸就没了 */
  // 没有加力：vMax = vMil（约定见 _schema.js；Ent.hasAfterburner 以此判断）
  phys: { vMax: 390, vMil: 390, vStall: 84, accel: 22, decel: 36, pitch: 0.70, roll: 2.30, yaw: 0.34, hp: 36 },
  gun: null,
  maxLoad: 800,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.gravel.hardpointGroups.i0.label'), kind: 'light', pts: [{ x: 1.8, y: -0.4 }, { x: -1.8, y: -0.4 }] }
  ],
  /* 一对最老的格斗弹（BIN-6，dl6 的 npcFits 含 light）。写在默认挂载里，spawnDrone 不用另传 loadout */
  defaultLoadout: { A: 'dl6' }
});
