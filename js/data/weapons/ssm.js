/* ---------- 舰对舰：反舰导弹（2-0IMPL 4.3） ----------
   只给舰船发射器用。出管先助推 boostT 秒（垂发竖直、斜发架按架子角度），
   之后有限转率转平、爬到 loft 高度巡航，末段俯冲 —— 见 stepMissile 的 launchT 分支。 */
Registry.weapon({
  order: 510,
  id: 'ssm', name: 'SPO-30', cn: T('weapons.ssm.cn'), kind: 'asm', model: 'missile',
  /* 巡航发动机全程有动力（life 40 s）：以前按火箭弹的 14 s 动力段，
     16 km 发射的弹在离目标约 2.8 km 处掉到 170 m/s、寿命到期自爆 */
  speed: 620, boost: 160, life: 40.0, vsLife: 50.0,
  turn: 0.60, seeker: 'radar', lockCone: 30 * Math.PI / 180, lockDist: 16000,
  dmg: 260,cd: 6, salvo: 1, flare: 0.70, blast: 20, blastCore: 6,
  target: 'ship',
  boostT: 1.2,
  loft: { alt: 600, dive: 3000 },
  npcOnly: true,
  fits: [], perPoint: 0, mass: 0,
  desc: T('weapons.ssm.desc'),
  look: { len: 5.2, dia: 0.34, fin: 'small' },
  role: T('weapons.ssm.role'),
  lead: 0.70,
  flareRD: 0.60 // SPO-30 破浪（舰对舰，不装抗干扰）
});
