/* ---------- 未参战三方 ---------- */
Registry.ship({
  order: 140,
  id: 'cross',
  model: 'cross',
  hull: T('ships.cross.hull'),
  name: 'Southern Cross',
  cn: T('ships.cross.cn'),
  cls: T('ships.cross.cls'),
  faction: T('ships.cross.faction'),
  operator: T('ships.cross.operator'),
  role: T('ships.cross.role'),
  disp: 24800,
  dim: [178, 27.4, 7.0],
  speed: 19,
  crew: 28,
  hp: 800, radius: 54, value: 0,
  gunResist: 0.9,
  neutral: true,
  label: T('ships.cross.label'),
  vials: [T('ships.cross.vials.i0.s1'), T('ships.cross.vials.i1.s1')],
  arms: [T('ships.cross.arms.i0.s1')],
  desc: T('ships.cross.desc')
});
