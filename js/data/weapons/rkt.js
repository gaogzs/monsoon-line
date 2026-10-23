/* ---- 无制导弹药：没有导引头，没有可用过载，不受干扰 ----

   这一类武器身上**不该出现**下面这些字段。它们描述的是"弹怎么找目标"，
   而无制导弹根本不找目标 —— 留着只会让人以为它有什么追踪能力：

       seeker   导引头类型
       turn     可用过载
       lead     提前量预测质量
       flare    被干扰概率（干扰弹骗的是导引头，无制导的骗不了）
       lockCone / lockDist   锁定锥角与距离
       boost    发动机推力（它们没有发动机）

   取而代之的是一个 unguided: true，交给 stepMissile 决定走弹道而不是导引。
   真正决定它们打不打得到的只有三件事：初速、重力、以及投放时的机头指向。 */
Registry.weapon({
  order: 190,
  tags: ['unguided'],
  id: 'rkt', name: 'PEJ-6', cn: T('weapons.rkt.cn'), kind: 'bomb',
  model: 'bomb',
  speed: 620, life: 3.0, vsLife: 3.0,
  /* 有动力 / 无制导。

     **火箭是有发动机的** —— 它靠自身的推进飞出去，正是这一点让它
     能覆盖一整片区域而不是自由落体。它没有的只是导引头。
     我先前把"无制导"当成了"无动力"，把推进也删了，那是错的：
     没发动机的是滑翔弹和激光制导炸弹，不是火箭。 */
  boost: 520, burn: 0.7,      // 推力只持续 burn 秒，之后和炸弹一样走重力 + 阻力
  dmg: 22, ammo: 28, salvo: 7, blast: 14, blastCore: 4,
  target: 'ground',
  desc: T('weapons.rkt.desc'),
  stat: { dmg: 0.22, spd: 0.34, trn: 0.10, rng: 0.16, ecm: 1.00 },
  attr: { fits: ['light', 'heavy'],        perPoint: 36, mass: 280 },
  look: { len: 2.6, dia: 0.48, fin: 'small', nest: 'tube', cells: 7, rdia: 0.12 },
  role: T('weapons.rkt.role'),
  cd: 4
});
