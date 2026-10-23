Registry.weapon({
  order: 220,
  tags: ['passive'],
  id: 'dec', name: 'ZUN-12', cn: T('weapons.dec.cn'), kind: 'ecm',
  ecmBonus: 0.05,   // 每具吊舱叠加到机体 ECM 上（见 Ent.passiveEffects）
  model: 'pod',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0, ammo: 0, cd: 0, salvo: 0, flare: 1.0,
  target: 'none',
  flareBonus: 40,
  desc: T('weapons.dec.desc'),
  stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.74 },
  attr: { fits: ['light', 'belly'],        perPoint: 1,  mass: 210 },
  role: T('weapons.dec.role')
});
