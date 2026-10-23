/* ---------- 调节场管理局 ---------- */
Registry.ship({
  order: 120,
  id: 'skori',
  model: 'skori',
  hull: T('ships.skori.hull'),
  name: 'Skori',
  cn: T('ships.skori.cn'),
  cls: T('ships.skori.cls'),
  faction: T('ships.skori.faction'),
  operator: T('ships.skori.operator'),
  role: T('ships.skori.role'),
  disp: 3600,
  dim: [102, 18.4, 4.4],
  speed: 15,
  crew: 54,
  hp: 300, radius: 32, value: 200,
  gunResist: 0.6,
  label: T('ships.skori.label'),
  vials: [T('ships.skori.vials.i0.s1'), T('ships.skori.vials.i1.s1'), T('ships.skori.vials.i2.s1')],
  arms: [T('ships.skori.arms.i0.s1')],
  desc: T('ships.skori.desc')
});
