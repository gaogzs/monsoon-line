Registry.weapon({
  order: 120,
  tags: ['antiRadar'],
  id: 'arm', name: 'SPO-8', cn: T('weapons.arm.cn'), kind: 'aam',
  model: 'missile',
  speed: 880, boost: 190, life: 7.5, vsLife: 18.0,
  turn: 1.35, seeker: 'radar', lockCone: 26 * Math.PI / 180, lockDist: 9500,
  dmg: 52, ammo: 2, salvo: 1, flare: 0.35, fuze: 22, blast: 44, blastCore: 7,
  target: 'air',
  /* 反辐射：对**正在辐射**的**空中**目标伤害翻倍（判据见 entities.js 的
     isRadiating）—— 未被压哑的预警机、开机中的干扰吊舱。
     它是对空弹（target: 'air'），锁不了地面 / 海面目标，地面雷达站
     不在反辐射范围内。

     这个字段被删过一次，理由写得很实在：全项目没有一处读它，
     世界里既没有"雷达开机状态"、也没有预警机，于是它只是一句
     文案。现在两样都有了（预警机 + ewPower + EMCON-Δ），
     这条语义才有落脚的地方。

     它的主定位仍然是**重型拦截弹**（数值本来就在说这件事）：
     战斗部 52 全场最大、爆炸半径 44 米在空空弹里数一数二，可用过载只有 1.35、
     锁定锥 26° —— 打机动的战斗机很吃力，打大目标是最好的一发。
     反辐射只是**在目标恰好开着雷达时**多给一倍。 */
  desc: T('weapons.arm.desc'),
  stat: { dmg: 0.62, spd: 0.68, trn: 0.48, rng: 0.80, ecm: 0.18 },
  attr: { fits: ['heavy'],                 perPoint: 3,  mass: 310 },
  look: { len: 4.2, dia: 0.24, fin: 'small' },
  role: T('weapons.arm.role'),
  cd: 18,
  lead: 0.72,
  flareRD: 0.32 // SPO-8 追云
});
