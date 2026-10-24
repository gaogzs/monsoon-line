/* ---- CLA-9「长杆-B · LONGROD-B」已并入 CLA-17「长杆」----

   原来有两枚固体冲压远距拦截弹，但它们是同一件武器的强弱两档，
   而不是两种武器：

                     CLA-9        CLA-17
     锁定距离        12500         9200
     速度             1150         1060
     每点弹数            2            1
     过载 / 伤害   0.92 / 58    1.02 / 62

   CLA-9 在射程、速度、载弹量上全面领先，CLA-17 只在过载、伤害上
   各略胜一点 —— 玩家没有任何理由去选后者，这不是取舍。
   而且编号还倒挂着：CLA-9 才叫「-B」（改进型），编号却比"原型"
   CLA-17 更小；英文名也对不上（LONGROD-B 对 LANCE）。

   合并成 CLA-17「长杆 · LANCE」一枚，数值取两者之长。
   它和真正的高空专用弹 SPO-9 仍然分工明确：

     CLA-17   18 km 以下最难甩掉（12500 m / 1150 m/s），但上空动力段骤减
     SPO-9    高空专用（highAltImmune，过载不随空气变稀而衰减）

   ============================================================ */
Registry.weapon({
  order: 130,
  id: 'vlar', name: 'CLA-12', cn: T('weapons.vlar.cn'), kind: 'aam',
  model: 'missile',
  speed: 980, boost: 150, life: 12.0, vsLife: 30.0,
  turn: 0.78, seeker: 'radar', lockCone: 18 * Math.PI / 180, lockDist: 16000,
  dmg: 66,salvo: 1, flare: 0.66, fuze: 27, blast: 49, blastCore: 7,
  target: 'air',
  desc: T('weapons.vlar.desc'),
  stat: { dmg: 0.82, spd: 0.78, trn: 0.24, rng: 1.00, ecm: 0.16 },
  attr: { fits: ['heavy'],                 perPoint: 2,  mass: 720 },
  look: { len: 5.2, dia: 0.32, fin: 'small', boost: true },
  role: T('weapons.vlar.role'),
  needs: ['intercept'], // 超远距空空弹：需要大孔径雷达
  cd: 32,
  lead: 0.90,
  flareRD: 0.42 // CLA-12 极远
});
