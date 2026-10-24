Registry.weapon({
  order: 200,
  tags: ['unguided', 'ballistic'],
  /* 子母弹本来是自由落体抛撒，之前却挂着 seeker: 'ir'（红外导引头）、
     turn: 0.42、boost: 60 —— 也就是说它在游戏里是一枚会自己追人的
     红外弹。整组制导属性都删掉了。 */
  id: 'clb', name: 'PEJ-9', cn: T('weapons.clb.cn'), kind: 'bomb',
  model: 'bomb',
  speed: 300, life: 12.0, vsLife: 24.0,
  dmg: 118,salvo: 1, blast: 60, blastCore: 60, blastAir: false,
  /* cluster = 覆盖半径（米），blast 与它同值、blastCore = blast（平伤）、
     blastAir: false（子弹药往下撒，打不到天上）。落地或撞上设施时，
     半径内所有水面/地面目标都吃满额伤害（combat.js 的 Combat.blast）。
     cluster 字段本身还留着：加固目标的打折（warheadK）和 desc 模板认它。 */
  target: 'ground', cluster: 60,
  desc: T('weapons.clb.desc'),
  stat: { dmg: 0.44, spd: 0.18, trn: 0.26, rng: 0.42, ecm: 0.66 },
  attr: { fits: ['heavy', 'belly'],        perPoint: 3,  mass: 350 },
  look: { len: 3.0, dia: 0.42, fin: 'bomb' },
  role: T('weapons.clb.role'),
  cd: 14
});
