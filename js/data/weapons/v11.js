/* ---------- 上游公约特殊武器 ---------- */
Registry.weapon({
  order: 290,
  tags: ['reAcquire'],
  id: 'v11', name: 'SUT-11', cn: T('weapons.v11.cn'), kind: 'aam',
  model: 'missile',
  speed: 790, boost: 280, life: 5.0, vsLife: 11.0,
  turn: 2.45, seeker: 'ir', lockCone: 35 * Math.PI / 180, lockDist: 4600,
  dmg: 56,salvo: 1, flare: 0.35, fuze: 16, blast: 22, blastCore: 2,
  target: 'air',
  desc: T('weapons.v11.desc'),
  stat: { dmg: 0.62, spd: 0.55, trn: 1.0, rng: 0.40, ecm: 0.25 },
  attr: { fits: ['light', 'heavy'],        perPoint: 3,  mass: 135 },
  look: { len: 3.4, dia: 0.17, fin: 'small' },
  role: T('weapons.v11.role'),
  cd: 9.2,
  lead: 0.62
});
