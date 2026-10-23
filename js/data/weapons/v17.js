Registry.weapon({
  order: 310,
  /* 数值是 CLA-9 与 CLA-17 合并后的结果：射程、速度、抗干扰取 CLA-9，
     过载取两者之间，其余保持原型。 */
  id: 'v17', name: 'CLA-17', cn: T('weapons.v17.cn'), kind: 'aam',
  model: 'missile',
  speed: 1150, boost: 160, life: 10.0, vsLife: 30.0,
  turn: 1.00, seeker: 'radar', lockCone: 24 * Math.PI / 180, lockDist: 12500,
  dmg: 62, ammo: 8, salvo: 1, flare: 0.72, fuze: 21, blast: 33, blastCore: 4,
  target: 'air', nezer: true, scramjet: true,
  desc: T('weapons.v17.desc'),
  stat: { dmg: 0.68, spd: 1.0, trn: 0.30, rng: 1.0, ecm: 0.80 },
  attr: { fits: ['heavy'],                 perPoint: 2,  mass: 285 },
  look: { len: 4.4, dia: 0.24, fin: 'small' },
  role: T('weapons.v17.role'),
  cd: 22,
  lead: 0.86,
  flareRD: 0.44 // CLA-17 长杆
});
