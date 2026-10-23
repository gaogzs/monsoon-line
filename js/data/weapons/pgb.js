Registry.weapon({
  order: 350,
  tags: ['ballistic'],
  /* 精确光电制导高爆炸弹（阶段 5.3 第 3 条 · 5.6 的第三种）。
     无动力、有轴对称弹翼（fin）、光电导引头（eo，热焰弹 / 箔丝都骗不到），
     ballistic 但**不加升阻比** —— 区别于 GUT-9 滑翔锤：不滑翔，弹道就是
     投放速度决定的抛物线 + 弹翼修正。弹翼只能横向修和往下压（托不住重力），
     修正范围几百米到一两公里量级。HUD 画泪滴形动态瞄准圈（5.3 第 3 条），
     目标套进圈内且锁定 = 物理上必中。 */
  id: 'pgb', name: 'PEJ-14', cn: T('weapons.pgb.cn'), kind: 'bomb',
  model: 'bomb',
  speed: 300, life: 12.0, vsLife: 24.0,
  turn: 0.30, seeker: 'eo', lockCone: 30 * Math.PI / 180, lockDist: 12000,
  dmg: 165, ammo: 2, salvo: 1, flare: 0, blast: 40, blastCore: 10,
  target: 'ground', fin: 10,
  desc: T('weapons.pgb.desc'),
  stat: { dmg: 0.60, spd: 0.18, trn: 0.18, rng: 0.40, ecm: 1.0 },
  attr: { fits: ['heavy', 'belly'],        perPoint: 6,  mass: 280 },
  look: { len: 3.2, dia: 0.38, fin: 'cruise' },
  role: T('weapons.pgb.role'),
  cd: 16,
  lead: 0.70
});
