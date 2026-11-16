Registry.weapon({
  order: 115,
  /* 半主动：弹自己没有可靠的末制导，一路靠发射机的雷达"照"着走（见 entities/missile.js 的 sarh 分支）。
     没有 reAcquire：丢了照射不会自己重新找目标；也没有 decoyMemory。 */
  tags: ['sarh'],
  id: 'tether', name: 'CLA-6', cn: T('weapons.tether.cn'), kind: 'aam',
  model: 'missile',
  // 相对 CLA-4：射程远约 20%、速度同级、战斗部 +10%、携弹 +50%、冷却更短 —— 便宜好用，代价是发射机必须一直盯着
  speed: 900, boost: 200, life: 9.0, vsLife: 20.0,
  turn: 1.45, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 10300,
  dmg: 44, salvo: 1, flare: 0.38, fuze: 18, blast: 30, blastCore: 4,
  target: 'air',
  desc: T('weapons.tether.desc'),
  stat: { dmg: 0.52, spd: 0.70, trn: 0.52, rng: 0.86, ecm: 0.35 },
  attr: { fits: ['light', 'heavy', 'belly'], perPoint: 9, mass: 195 },
  look: { len: 3.7, dia: 0.18, fin: 'small' },
  role: T('weapons.tether.role'),
  cd: 12,
  lead: 0.78,
  // 箔丝对它有效：干扰弹里的箔丝会骗雷达导引头（半主动也一样），比 CLA-4 好骗
  flareRD: 0.38
});
