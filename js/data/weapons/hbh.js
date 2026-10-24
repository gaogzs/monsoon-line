Registry.weapon({
  order: 370,
  tags: ['unguided', 'ballistic'],
  /* 重型高爆炸弹（阶段 5.6）：一发重创护卫舰级目标，只能挂重挂点。 */
  id: 'hbh', name: 'PEJ-22', cn: T('weapons.hbh.cn'), kind: 'bomb',
  model: 'bomb',
  speed: 280, life: 12.0, vsLife: 24.0,
  dmg: 420,salvo: 1, blast: 110, blastCore: 45,
  target: 'ground',
  desc: T('weapons.hbh.desc'),
  stat: { dmg: 1.00, spd: 0.10, trn: 0.00, rng: 0.20, ecm: 1.0 },
  attr: { fits: ['heavy'],                 perPoint: 3,  mass: 900 },
  look: { len: 3.4, dia: 0.60, fin: 'bomb' },
  role: T('weapons.hbh.role'),
  cd: 24
});
