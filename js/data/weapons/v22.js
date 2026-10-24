Registry.weapon({
  order: 320,
  id: 'v22', name: 'SPO-22', cn: T('weapons.v22.cn'), kind: 'asm',
  model: 'missile',
  speed: 920, boost: 130, life: 12.0, vsLife: 45.0,
  turn: 0.55, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 8600,
  dmg: 260,salvo: 1, flare: 0.85, blast: 20, blastCore: 6,
  target: 'ship',
  desc: T('weapons.v22.desc'),
  stat: { dmg: 1.0, spd: 0.66, trn: 0.16, rng: 0.92, ecm: 0.86 },
  attr: { fits: ['heavy'],                 perPoint: 2,  mass: 640 },
  look: { len: 5.6, dia: 0.40, fin: 'small', boost: true },
  role: T('weapons.v22.role'),
  needs: ['strike'], // 反大型目标
  cd: 22,
  lead: 0.74,
  flareRD: 0.78 // SPO-22 锚
});
