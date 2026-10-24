Registry.weapon({
  order: 300,
  tags: ['hobs'],
  id: 'v9', name: 'GIR-9', cn: T('weapons.v9.cn'), kind: 'aam',
  model: 'missile',
  speed: 830, boost: 200, life: 4.0, vsLife: 9.0,
  turn: 1.90, seeker: 'ir', lockCone: 75 * Math.PI / 180, lockDist: 3800,
  dmg: 44,salvo: 2, flare: 0.50, fuze: 13, blast: 19, blastCore: 2,
  target: 'air',
  desc: T('weapons.v9.desc'),
  stat: { dmg: 0.50, spd: 0.60, trn: 0.76, rng: 0.32, ecm: 0.40 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 4,  mass: 110 },
  look: { len: 3.0, dia: 0.15, fin: 'strake', rack: 2 },
  role: T('weapons.v9.role'),
  cd: 6,
  lead: 0.52
});
