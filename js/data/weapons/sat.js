Registry.weapon({
  order: 180,
  id: 'sat', name: 'SPO-6', cn: T('weapons.sat.cn'), kind: 'asm',
  model: 'missile',
  speed: 540, boost: 130, life: 9.0, vsLife: 20.0,
  turn: 1.05, seeker: 'radar', lockCone: 30 * Math.PI / 180, lockDist: 8200,
  dmg: 260,salvo: 1, flare: 0.68, blast: 20, blastCore: 6,
  target: 'ship',
  desc: T('weapons.sat.desc'),
  stat: { dmg: 0.76, spd: 0.42, trn: 0.42, rng: 0.58, ecm: 0.34 },
  attr: { fits: ['heavy'],                 perPoint: 3,  mass: 410 },
  look: { len: 4.8, dia: 0.34, fin: 'small', boost: true },
  role: T('weapons.sat.role'),
  needs: ['strike'], // 反浮空平台
  cd: 19,
  lead: 0.68,
  flareRD: 0.46 // SPO-6 云裂（对浮空平台）
});
