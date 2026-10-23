Registry.weapon({
  order: 140,
  id: 'qsr', name: 'GIR-5', cn: T('weapons.qsr.cn'), kind: 'aam',
  model: 'missile',
  speed: 740, boost: 190, life: 4.2, vsLife: 11.0,
  turn: 1.70, seeker: 'ir', lockCone: 30 * Math.PI / 180, lockDist: 4000,
  dmg: 24, ammo: 12, salvo: 3, flare: 0.40, fuze: 10, blast: 16, blastCore: 2,
  target: 'air',
  desc: T('weapons.qsr.desc'),
  stat: { dmg: 0.26, spd: 0.46, trn: 0.64, rng: 0.34, ecm: 0.22 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 16, mass: 92 },
  look: { len: 2.2, dia: 0.11, fin: 'strake', nest: 'box', cells: 3 },
  role: T('weapons.qsr.role'),
  cd: 7.6,
  lead: 0.42
});
