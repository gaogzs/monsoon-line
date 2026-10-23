Registry.weapon({
  order: 80,
  tags: ['hobs'],
  id: 'hos', name: 'TOR-6', cn: T('weapons.hos.cn'), kind: 'aam',
  model: 'missile',
  speed: 700, boost: 240, life: 4.0, vsLife: 11.0,
  turn: 2.60, seeker: 'ir', lockCone: 88 * Math.PI / 180, lockDist: 3200,
  dmg: 28, ammo: 4, salvo: 1, flare: 0.42, fuze: 11, blast: 17, blastCore: 2,
  target: 'air',
  desc: T('weapons.hos.desc'),
  stat: { dmg: 0.32, spd: 0.42, trn: 0.95, rng: 0.24, ecm: 0.24 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 6,  mass: 100 },
  look: { len: 2.6, dia: 0.14, fin: 'strake' },
  role: T('weapons.hos.role'),
  cd: 5.2,
  lead: 0.30
});
