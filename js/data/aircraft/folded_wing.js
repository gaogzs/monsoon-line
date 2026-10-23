/* ============================================================
   KA-7「折翼」—— 无人僚机

   它不是"没有飞行员的战斗机"，而是战斗机的一件附件：
   由长机授权开火，替长机挡导弹、探路、消耗对手的弹药。

   此前它只有 3D 模型而没有机型条目，spawnWingman 用的还是 frigatebird ——
   于是设定里写着"两架无人僚机"，游戏里却飞着有人机，
   那个模型从头到尾没被引用过。
   ============================================================ */
Registry.aircraft({
  order: 70,
  tags: ['unmanned'],
  id: 'folded_wing',
  name: 'KA-7', nick: 'Folded Wing', cn: T('aircraft.folded_wing.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 16000,
  role: T('aircraft.folded_wing.role'),
  faction: T('aircraft.folded_wing.faction'),
  planformType: T('aircraft.folded_wing.planformType'),
  caps: [],
  maker: T('aircraft.folded_wing.maker'),
  npcOnly: true,
  model: 'folded_wing',
  desc: T('aircraft.folded_wing.desc'),
  stats: { spd: 0.96, mob: 0.76, stl: 0.32, fire: 0.62, dur: 0.28, rng: 0.62, ecm: 0.20 },
  /* 极速要压过最快的有人机（petrel 620）：跟不上长机的僚机替长机挡不了弹 */
  phys: { vMax: 660, vMil: 540, vStall: 96, accel: 34, decel: 44, pitch: 0.78, roll: 2.65, yaw: 0.40, hp: 58 },
  /* 没有机炮：它是"发射架"，自己看不见东西，目标参数全靠长机喂 ——
     机炮要的是自己对准、自己判断开火时机，这两样它都没有。 */
  gun: null,
  maxLoad: 4200,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.folded_wing.hardpointGroups.i0.label'), kind: 'light', pts: [{ x: 2.0, y: -0.5 }, { x: -2.0, y: -0.5 }] },
    /* 机身中线两侧的内埋弹舱：expose 0，不拉低匿踪。名义上在机身内，实际紧贴机腹挂着，hy 压到机腹下沿 */
    { id: 'B', label: T('aircraft.folded_wing.hardpointGroups.i1.label'), kind: 'belly', expose: 0, hy: -0.12, pts: [{ x: 0.55, y: -0.6 }, { x: -0.55, y: -0.6 }] }
  ],
  /* 僚机默认挂载：翼下 TOR-3（僚机专用，只有 npcFits）+ 内埋 CLA-4 中继（远距空战）。
     由 NPC 的逐组 loadout 落位，玩家的机库过滤不到它（npcOnly）。 */
  defaultLoadout: { A: 'drm', B: 'mrm' }
});
