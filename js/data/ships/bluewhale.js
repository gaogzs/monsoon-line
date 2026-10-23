Registry.ship({
  order: 20,
  id: 'bluewhale',
  model: 'bluewhale',
  hull: T('ships.bluewhale.hull'),
  name: 'Bluewhale',
  cn: T('ships.bluewhale.cn'),
  cls: T('ships.bluewhale.cls'),
  faction: T('ships.bluewhale.faction'),
  operator: T('ships.bluewhale.operator'),
  role: T('ships.bluewhale.role'),
  disp: 21400,
  dim: [210, 26.6, 7.0],
  speed: 25,
  crew: 180,
  hp: 1200, radius: 62, value: 700,
  gunResist: 0.95,
  label: T('ships.bluewhale.label'),
  vials: [T('ships.bluewhale.vials.i0.s1'), T('ships.bluewhale.vials.i1.s1'), T('ships.bluewhale.vials.i2.s1')],
  arms: [T('ships.bluewhale.arms.i0.s1'), T('ships.bluewhale.arms.i1.s1'), T('ships.bluewhale.arms.i2.s1')],
  desc: T('ships.bluewhale.desc'),
  mounts: [
  _m('ciwsF', 'ciws20', [0, 18.0, 82], 0, ARC_CIWS, null, 'ciws'),
  _m('ciwsA', 'ciws20', [0, 13.0, -100], Math.PI, ARC_CIWS, null, 'ciws'),
  _m('n50L', 'n50', [-11.6, 11.0, 40], -Math.PI / 2, ARC_SIDE, 'tur50', 'dual'),
  _m('n50R', 'n50', [11.6, 11.0, 40], Math.PI / 2, ARC_SIDE, 'tur50', 'dual')
]
});
