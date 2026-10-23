/* 中距重战斗部（2.0 计划 2.5）：以 mrm 为母型，速度 ×0.9、转向 ×0.8，
   换来 60 m 的爆炸半径。命中精度一般，近失也很疼 —— 打编队和大机。 */
Registry.weapon({
  order: 100,
  id: 'hwm', name: 'CLA-8', cn: T('weapons.hwm.cn'), kind: 'aam',
  model: 'missile',
  speed: 810, boost: 180, life: 8.0, vsLife: 20.0,
  turn: 1.16, seeker: 'radar', lockCone: 36 * Math.PI / 180, lockDist: 8000,
  dmg: 46, ammo: 2, salvo: 1, flare: 0.34, fuze: 22, blast: 60, blastCore: 10,
  target: 'air',
  desc: T('weapons.hwm.desc'),
  stat: { dmg: 0.56, spd: 0.62, trn: 0.40, rng: 0.66, ecm: 0.30 },
  attr: { fits: ['light', 'heavy'],        perPoint: 3,  mass: 240 },
  look: { len: 3.9, dia: 0.23, fin: 'small' },
  role: T('weapons.hwm.role'),
  cd: 19.5,
  lead: 0.74,
  flareRD: 0.34 // CLA-8 雷鼓
});
