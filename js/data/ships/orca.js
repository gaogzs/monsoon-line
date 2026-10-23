/* ---------- 上游公约 ---------- */
Registry.ship({
  order: 10,
  id: 'orca',
  model: 'orca',
  hull: T('ships.orca.hull'),
  name: 'Orca',
  cn: T('ships.orca.cn'),
  cls: T('ships.orca.cls'),
  faction: T('ships.orca.faction'),
  operator: T('ships.orca.operator'),
  role: T('ships.orca.role'),
  disp: 6800,
  dim: [148, 18.4, 4.4],
  speed: 31,
  crew: 210,
  hp: 900, radius: 44, value: 600,
  gunResist: 0.9,
  label: T('ships.orca.label'),
  vials: [T('ships.orca.vials.i0.s1'), T('ships.orca.vials.i1.s1'), T('ships.orca.vials.i2.s1')],
  arms: [T('ships.orca.arms.i0.s1'), T('ships.orca.arms.i1.s1'), T('ships.orca.arms.i2.s1'), T('ships.orca.arms.i3.s1')],
  desc: T('ships.orca.desc'),
  mounts: [
  _m('bow', 'n75', [0, 6.2, 58], 0, ARC_BOW, 'tur75', 'dual'),
  _m('ciwsF', 'ciws20', [0, 15.0, 27], 0, ARC_CIWS, null, 'ciws'),
  _m('ciwsA', 'ciws20', [0, 7.8, -14], Math.PI, ARC_CIWS, null, 'ciws')
],
  launchers: [
  _L('vlsF', 'vlsSam', [0, 7.0, 47], 'vls'),
  _L('vlsSsm', 'vlsSsm', [0, 7.0, 47], 'vls', 8)       // 同一块垂发盖板：32 单元里的 8 单元装反舰弹
]
});
