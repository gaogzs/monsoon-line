/* --- 下游：反大型 --- */
Registry.weapon({
  order: 430,
  id: 'vsr', name: 'BOX-14', cn: T('weapons.vsr.cn'), kind: 'asm',
  model: 'missile',
  speed: 560, boost: 150, life: 11.0, vsLife: 24.0,
  turn: 0.55, seeker: 'radar', lockCone: 32 * Math.PI / 180, lockDist: 9000,
  dmg: 260, ammo: 1, cd: 15.6, salvo: 1, flare: 0.72, blast: 20, blastCore: 6,
  target: 'ship',
  /* 高抛剖面 + 末段俯冲（entities.js 的 loft 分支） */
  loft: { alt: 2500, dive: 3500 },
  fits: [], perPoint: 0, mass: 0,
  /* 反大型弹只有重挂点撑得住（与上游的 SPO-22 同一档） */
  npcFits: ['heavy'],
  desc: T('weapons.vsr.desc'),
  stat: { dmg: 0.76, spd: 0.46, trn: 0.20, rng: 0.70, ecm: 0.34 },
  look: { len: 5.0, dia: 0.34, fin: 'small', boost: true },
  role: T('weapons.vsr.role'),
  lead: 0.70,
  flareRD: 0.50 // BOX-14 坍方（下游）
});
