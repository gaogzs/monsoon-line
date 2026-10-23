Registry.weapon({
  order: 390,
  id: 'l2', name: 'GUS-2', cn: T('weapons.l2.cn'), kind: 'dew',
  model: 'pod',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  /* 没有充能储备：每拦截一次，这个吊舱的发射槽进入 cd 秒冷却，
     冷却条画在右下角的挂载缩略图里（和导弹同一套 slotCd）。 */
  dmg: 0, ammo: 99, salvo: 0, flare: 1.0,
  target: 'none',
  interceptRange: 1200, interceptCone: 35 * Math.PI / 180,
  interceptChance: 0.55, highAltChance: 0.35,
  desc: T('weapons.l2.desc'),
  stat: { dmg: 0.0, spd: 0.0, trn: 0.0, rng: 0.0, ecm: 1.0 },
  attr: { fits: ['light', 'belly'],        perPoint: 1,  mass: 190 },
  role: T('weapons.l2.role'),
  needs: ['ew'], // 定向能：耗电巨大
  cd: 36
});
