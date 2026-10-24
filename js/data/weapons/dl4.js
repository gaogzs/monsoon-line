/* ---------- 下游武器 ---------- */
Registry.weapon({
  order: 460,
  id: 'dl4', name: 'DAR-4', cn: T('weapons.dl4.cn'), kind: 'aam', model: 'missile',
  speed: 880, boost: 210, life: 6.5, vsLife: 16.0,
  turn: 1.25, seeker: 'radar', lockCone: 36 * Math.PI / 180, lockDist: 7200,
  dmg: 30, salvo: 1, flare: 0.45, fuze: 20, blast: 32, blastCore: 4,
  target: 'air',    // 下游专用弹：fits 为空表示玩家挂不上它
  fits: [], perPoint: 4, mass: 150,    // 弹数 = 挂点数 × perPoint（玩家与敌机同一套）
  npcFits: ['light', 'heavy'],
  desc: T('weapons.dl4.desc'),
  look: { len: 3.6, dia: 0.18, fin: 'small' },
  role: T('weapons.dl4.role'),
  cd: 6.8,
  lead: 0.74,
  flareRD: 0.34 // DAR-4 砾石
});
