Registry.weapon({
  order: 150,
  tags: ['reAcquire'],
  id: 'wasp', name: 'SUT-7', cn: T('weapons.wasp.cn'), kind: 'aam',
  model: 'missile',
  speed: 860, boost: 260, life: 4.8, vsLife: 12.0,
  turn: 2.15, seeker: 'ir', lockCone: 36 * Math.PI / 180, lockDist: 5200,
  dmg: 38,salvo: 1, flare: 0.36, fuze: 13, blast: 19, blastCore: 2,
  target: 'air',
  /* 原文"推力更猛、加速更快"与数据相反（boost 260 < 锥刺的 280）。
     它真正快的是**最高速**（860 > 790）与锁定距离。 */
  desc: T('weapons.wasp.desc'),
  stat: { dmg: 0.44, spd: 0.62, trn: 0.78, rng: 0.50, ecm: 0.26 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 4,  mass: 145 },
  look: { len: 3.2, dia: 0.16, fin: 'small' },
  role: T('weapons.wasp.role'),
  cd: 8.4,
  lead: 0.55
});
