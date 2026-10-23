Registry.weapon({
  order: 480,
  id: 'dl9', name: 'BAD-9', cn: T('weapons.dl9.cn'), kind: 'aam', model: 'missile',
  speed: 940, boost: 320, life: 9.0, vsLife: 22.0,
  turn: 1.50, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 9000,
  dmg: 48, ammo: 4, salvo: 1, flare: 0.60, fuze: 24, blast: 36, blastCore: 4,
  target: 'air',
  fits: [], perPoint: 0, mass: 0,
  desc: T('weapons.dl9.desc'),
  look: { len: 4.3, dia: 0.25, fin: 'small' },
  role: T('weapons.dl9.role'),
  cd: 14,
  lead: 0.80,
  flareRD: 0.42 // BAD-9 高墙（下游的防空拦截弹）
});
