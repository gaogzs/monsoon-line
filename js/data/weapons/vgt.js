/* --- 下游：对地 --- */
Registry.weapon({
  order: 420,
  id: 'vgt', name: 'TUM-7', cn: T('weapons.vgt.cn'), kind: 'agm',
  model: 'missile',
  speed: 430, boost: 120, life: 9.0, vsLife: 20.0,
  turn: 0.62, seeker: 'ir', lockCone: 40 * Math.PI / 180, lockDist: 7000,
  dmg: 190, ammo: 2, cd: 11, salvo: 1, flare: 0.62, blast: 30, blastCore: 8,
  target: 'ground',
  fits: [], perPoint: 0, mass: 0,
  /* 对地弹挂重型挂点或机腹 —— 下游的随队攻击机都是重型/机腹布局 */
  npcFits: ['heavy', 'belly'],
  /* 原文写"精度比不上上游的 GUT-9"，但 GUT-9 是一枚**无动力滑翔弹**
     （扔出去就只能等，目标挪了就打空），拿它当精度基准说不通 ——
     碎石是有发动机的导弹，两者根本不是一类东西。
     改成和"上游同级弹"比，才是一致的。 */
  desc: T('weapons.vgt.desc'),
  stat: { dmg: 0.62, spd: 0.34, trn: 0.22, rng: 0.56, ecm: 0.30 },
  look: { len: 4.0, dia: 0.32, fin: 'small' },
  role: T('weapons.vgt.role'),
  lead: 0.58
});
