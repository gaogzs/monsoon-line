Registry.weapon({
  order: 280,
  id: 'lcm', name: 'GUT-30', cn: T('weapons.lcm.cn'), kind: 'agm',
  model: 'missile',
  // 涡扇是全程工作的，所以 life（动力段）要够长，
  // 否则"远程巡航弹"的射程会算得还不如一枚中距弹
  speed: 480, boost: 110, life: 30.0, vsLife: 42.0,
  turn: 0.48, seeker: 'radar', lockCone: 26 * Math.PI / 180, lockDist: 14000,
  dmg: 300, ammo: 1, salvo: 1, flare: 0.85, blast: 45, blastCore: 10,
  target: 'ground',    desc: T('weapons.lcm.desc'),
  stat: { dmg: 0.86, spd: 0.30, trn: 0.14, rng: 1.00, ecm: 0.36 },
  attr: { fits: ['heavy', 'belly'],        perPoint: 2,  mass: 780 },
  look: { len: 6.0, dia: 0.42, fin: 'cruise', boost: true },
  role: T('weapons.lcm.role'),
  needs: ['strike'], // 远程巡航弹
  cd: 36,
  lead: 0.62,
  flareRD: 0.80 // GUT-30 远帆
});
