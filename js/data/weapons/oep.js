Registry.weapon({
  order: 230,
  tags: ['passive', 'silentLock'],
  id: 'oep', name: 'GUS-6', cn: T('weapons.oep.cn'), kind: 'ecm',
  model: 'pod_eo',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0, cd: 0, salvo: 0, flare: 1.0,
  target: 'none',
  lockRangeBonus: 0.45,
  /* 被动测距：用光电方式锁定时不辐射，对方的 RWR 收不到告警。
     见 ai.js 里 rwrT 的判定 —— 它决定敌人会不会因为你锁了它而回头咬你。 */
  desc: T('weapons.oep.desc'),
  stat: { dmg: 0, spd: 0, trn: 0, rng: 0.90, ecm: 0.40 },
  attr: { fits: ['light', 'belly'],        perPoint: 1,  mass: 175 },
  role: T('weapons.oep.role')
});
