/* ---------- 空空导弹家族 ----------
   编号前缀取自逻辑语词根，中文代号是给玩家看的那一层。
   参数之间刻意留出取舍：射程远的转弯差，机动好的打不远，
   抗干扰强的弹头小。没有一发通吃的弹。 */
Registry.weapon({
  order: 70,
  id: 'trm', name: 'TOR-4', cn: T('weapons.trm.cn'), kind: 'aam',
  model: 'missile',
  speed: 820, boost: 210, life: 5.0, vsLife: 13.0,
  turn: 1.95, seeker: 'ir', lockCone: 30 * Math.PI / 180, lockDist: 4800,
  dmg: 32, ammo: 6, salvo: 1, flare: 0.24, fuze: 12, blast: 18, blastCore: 2,
  target: 'air',    desc: T('weapons.trm.desc'),
  stat: { dmg: 0.36, spd: 0.56, trn: 0.72, rng: 0.42, ecm: 0.58 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 8,  mass: 105 },
  look: { len: 2.9, dia: 0.13, fin: 'strake' },
  role: T('weapons.trm.role'),
  cd: 5.6,
  lead: 0.48
});
