Registry.weapon({
  order: 380,
  id: 'e4', name: 'ZUN-4', cn: T('weapons.e4.cn'), kind: 'ecm',
  ecmBonus: 0.12,   // 每具吊舱叠加到机体 ECM 上（见 Ent.passiveEffects）
  model: 'pod',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0,salvo: 0, flare: 1.0,
  target: 'none', duration: 6.0, lockReduce: 0.40,
  desc: T('weapons.e4.desc'),
  stat: { dmg: 0.0, spd: 0.0, trn: 0.0, rng: 0.0, ecm: 1.0 },
  attr: { fits: ['light', 'belly'],        perPoint: 1,  mass: 215 },
  role: T('weapons.e4.role'),
  needs: ['ew'], // 主动电子战吊舱
  /* 吊舱：电子战设备要重新充能，仍然是全场最慢的一档 */
  cd: 50
});
