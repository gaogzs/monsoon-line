/* --- 下游：烧穿路线（与上游的"认知"是两种哲学） ---

   同一件事的两个答案：
     上游  感知—建模—合成干扰，在对手的波形里找缝，省功率、难发现
     下游  把功率堆到能烧穿接收前端。粗暴、耗电、亮得像支火炬，
           但在这个高度上极其有效（设定 7.3）

   落到数值上，这就是"没有闭环、不可对抗"：它不写 ewPower 那条
   "爬升→压制→被对手对抗掉"的曲线，而是直接给辐射范围内的人
   打上 suppressed —— 也就是你能做的只有离开那片空域。 */
Registry.weapon({
  order: 410,
  id: 'vsc', name: 'SAV-14', cn: T('weapons.vsc.cn'), kind: 'ecm',
  ecmBonus: 0.10,   // 每具吊舱叠加到机体 ECM 上（见 Ent.passiveEffects）
  model: 'pod',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0, cd: 40, salvo: 0, flare: 1.0,
  target: 'none', duration: 8,
  /* 范围压制：半径内的人被压住，越靠中心越狠（见 game.js updateJamming） */
  jamRadius: 12000, jamK: 0.85,
  /* 辐射特征：开机期间 ewPower > 0，entities.js 的 isRadiating 据此
     把它当反辐射目标（SPO-8 伤害翻倍）。原来这里另有一个 emitter 字段，
     没有任何代码读它，删掉。 */
  fits: [], perPoint: 1, mass: 210,
  npcFits: ['light', 'belly'],
  desc: T('weapons.vsc.desc'),
  stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.86 }
});
