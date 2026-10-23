Registry.weapon({
  order: 340,
  tags: ['unguided', 'ballistic'],
  id: 'v30', name: 'PEJ-30', cn: T('weapons.v30.cn'), kind: 'bomb',
  model: 'bomb',
  /* 无动力 / 无制导的集束炸弹（阶段 5.3 起；之前是光电制导）。
     比 PEJ-9 碎玉更重、覆盖更大，同样靠投放时的高度、速度和机头指向决定落点 ——
     瞄准交给 HUD 的预计落点标记（5.5）。精确制导的活交给 5.6 的新炸弹。 */
  speed: 280, life: 12.0, vsLife: 24.0,
  dmg: 210, ammo: 6, salvo: 1, blast: 80, blastCore: 80, blastAir: false,
  target: 'ground', cluster: 80,
  desc: T('weapons.v30.desc'),
  stat: { dmg: 0.90, spd: 0.10, trn: 0.00, rng: 0.20, ecm: 1.0 },
  attr: { fits: ['heavy', 'belly'],        perPoint: 2,  mass: 295 },
  look: { len: 2.8, dia: 0.40, fin: 'bomb' },
  role: T('weapons.v30.role'),
  cd: 16
});
