Registry.weapon({
  order: 360,
  tags: ['unguided', 'ballistic'],
  /* 轻型高爆炸弹（阶段 5.6）：无动力 / 无制导，普通高爆战斗部。
     多带多投，打小目标和分散目标；落点中心起爆，按 Combat.blast 距离衰减。 */
  id: 'hbl', name: 'PEJ-4', cn: T('weapons.hbl.cn'), kind: 'bomb',
  model: 'bomb',
  speed: 300, life: 12.0, vsLife: 24.0,
  dmg: 70, ammo: 8, salvo: 1, blast: 24, blastCore: 6,
  target: 'ground',
  desc: T('weapons.hbl.desc'),
  stat: { dmg: 0.30, spd: 0.18, trn: 0.00, rng: 0.40, ecm: 1.0 },
  attr: { fits: ['light', 'heavy', 'belly'], perPoint: 12, mass: 120 },
  look: { len: 2.0, dia: 0.30, fin: 'bomb' },
  role: T('weapons.hbl.role'),
  cd: 5
});
