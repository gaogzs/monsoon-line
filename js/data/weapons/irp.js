Registry.weapon({
  order: 240,
  tags: ['passive', 'silentLock'],
  id: 'irp', name: 'GUS-9', cn: T('weapons.irp.cn'), kind: 'ecm',
  ecmBonus: 0.03,   // 每具吊舱叠加到机体 ECM 上（见 Ent.passiveEffects）
  model: 'pod',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0, ammo: 0, cd: 0, salvo: 0, flare: 1.0,
  target: 'none',
  lockRangeBonus: 0.25, lockResist: 0.15,
  desc: T('weapons.irp.desc'),
  stat: { dmg: 0, spd: 0, trn: 0, rng: 0.62, ecm: 0.58 },
  attr: { fits: ['tip', 'light', 'belly'], perPoint: 1,  mass: 160 },
  role: T('weapons.irp.role')
});
