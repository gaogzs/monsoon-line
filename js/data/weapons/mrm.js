Registry.weapon({
  order: 110,
  tags: ['decoyMemory', 'reAcquire'],
  id: 'mrm', name: 'CLA-4', cn: T('weapons.mrm.cn'), kind: 'aam',
  model: 'missile',
  speed: 900, boost: 200, life: 8.0, vsLife: 20.0,
  turn: 1.45, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 8600,
  dmg: 40, ammo: 4, salvo: 1, flare: 0.30, fuze: 18, blast: 30, blastCore: 4,
  target: 'air',
  /* 原句是"不吃干扰弹"。那是假的 —— 干扰弹是热焰弹与箔丝一起投放的，
     箔丝专门骗雷达导引头，CLA-4 一样会被骗。

     它真正的强项是**抗干扰**而不是免疫：flare 0.30 是全表第二低。
     再加上 reAcquire + decoyMemory：被骗之后盲飞一段，重新搜索时
     **不会再咬回骗过它的那团箔丝云**（entities.js 的 decoyRecheck），
     而是在锁定锥内重新捕获真目标 —— 包括刚才丢诱饵的那一架。
     （别处也写着"雷达弹不吃箔丝"，同批一起改掉了。） */
  desc: T('weapons.mrm.desc'),
  stat: { dmg: 0.48, spd: 0.70, trn: 0.52, rng: 0.72, ecm: 0.20 },
  // 中距弹可以进内埋弹舱 —— 隐形机就是靠这个保住隐身的
  attr: { fits: ['light', 'heavy', 'belly'], perPoint: 6, mass: 195 },
  look: { len: 3.7, dia: 0.18, fin: 'small' },
  role: T('weapons.mrm.role'),
  cd: 15,
  lead: 0.78,
  /* 空空：主动雷达导引头 + 抗干扰设备，整体比红外弹难骗 */
  flareRD: 0.30 // CLA-4 中继 —— 全场最难被箔丝骗到的一枚（设定点名）
});
