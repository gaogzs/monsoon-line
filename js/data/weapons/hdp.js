Registry.weapon({
  order: 250,
  tags: ['passive'],
  id: 'hdp', name: 'JDA-3', cn: T('weapons.hdp.cn'), kind: 'ecm',
  model: 'pod_armor',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0, cd: 0, salvo: 0, flare: 1.0,
  target: 'none',
  armorBonus: 0.22,
  desc: T('weapons.hdp.desc'),
  stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.50 },
  attr: { fits: ['light', 'belly'],        perPoint: 1,  mass: 320 },
  role: T('weapons.hdp.role')
});
