/* 动能杀伤（2.0 计划 2.5）：没有破片战斗部，只有撞上才算数。
   fuze 0 / blast 0 —— 最近点距目标表面不到 Combat.CONTACT 才命中。
   设定上是"直接碰撞的动能杀伤"，代码里是固定伤害，不按相对速度算。
   转向是格斗弹里最高的（hos 的 1.05 倍）：它必须靠末端机动真的打中。 */
Registry.weapon({
  order: 90,
  id: 'kkv', name: 'TOR-8', cn: T('weapons.kkv.cn'), kind: 'aam',
  model: 'missile',
  speed: 760, boost: 220, life: 4.5, vsLife: 12.0,
  turn: 2.73, seeker: 'ir', lockCone: 34 * Math.PI / 180, lockDist: 3800,
  dmg: 48,salvo: 1, flare: 0.40, fuze: 0, blast: 0, blastCore: 0,
  target: 'air',
  desc: T('weapons.kkv.desc'),
  stat: { dmg: 0.50, spd: 0.50, trn: 0.98, rng: 0.30, ecm: 0.40 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 12, mass: 90 },
  look: { len: 2.6, dia: 0.12, fin: 'strake' },
  role: T('weapons.kkv.role'),
  cd: 3.4,
  lead: 0.45
});
