Registry.weapon({
  order: 20,
  id: 'cel7',
  name: 'CEL-7', cn: T('weapons.cel7.cn'), kind: 'gun',
  /* 口径大、弹重 → 炮口跳动更大，散布比 CEL-3 再大一档。 */
  cal: 30, rpm: 1950, speed: 1020, dmg: 17, spread: 0.0036, ammo: 14000,
  range: 2000, highRange: 3100,
  desc: T('weapons.cel7.desc')
});
