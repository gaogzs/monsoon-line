/* ---------- 下游武器：远程主动雷达空空弹 ----------
   下游此前最远的空空弹是 DAR-4 砾石（7.2 km）。战略制空支援机（黑曜岩，批次 6.4）要在后方十几公里
   对好几个目标各放一发，需要一件下游自己的远程弹 —— 不再借用上游的 CLA 系列。
   主动雷达（发射后不用照射，所以一次齐射能打好几个不同的目标）；射程取 CLA-17 与 CLA-12 之间，
   过载低、速度中等：打得远，但追不上机动目标。
   下游专用：fits 为空，玩家挂不上；只给重挂点，每点 2 发。 */
Registry.weapon({
  order: 495,
  id: 'tephra', name: 'DAR-12', cn: T('weapons.tephra.cn'), kind: 'aam', model: 'missile',
  speed: 1000, boost: 170, life: 11.0, vsLife: 26.0,
  turn: 0.85, seeker: 'radar', lockCone: 20 * Math.PI / 180, lockDist: 14000,
  dmg: 56, salvo: 1, flare: 0.60, fuze: 24, blast: 40, blastCore: 5,
  target: 'air',
  fits: [], perPoint: 2, mass: 260,
  npcFits: ['heavy', 'belly'],      // 重挂点与弹舱（黑曜岩的机腹弹舱）
  desc: T('weapons.tephra.desc'),
  look: { len: 4.2, dia: 0.22, fin: 'small' },
  role: T('weapons.tephra.role'),
  cd: 18,
  lead: 0.80,
  flareRD: 0.40 // DAR-12 火山灰
});
