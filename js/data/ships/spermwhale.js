Registry.ship({
  order: 40,
  id: 'spermwhale',
  model: 'spermwhale',
  hull: T('ships.spermwhale.hull'),
  name: 'Spermwhale',
  cn: T('ships.spermwhale.cn'),
  cls: T('ships.spermwhale.cls'),
  faction: T('ships.spermwhale.faction'),
  operator: T('ships.spermwhale.operator'),
  role: T('ships.spermwhale.role'),
  disp: 12500,
  dim: [168, 20.4, 4.8],
  speed: 32,
  crew: 380,
  hp: 1500, radius: 50, value: 900,
  gunResist: 0.93,
  label: T('ships.spermwhale.label'),
  vials: [T('ships.spermwhale.vials.i0.s1'), T('ships.spermwhale.vials.i1.s1'), T('ships.spermwhale.vials.i2.s1')],
  arms: [T('ships.spermwhale.arms.i0.s1'), T('ships.spermwhale.arms.i1.s1'), T('ships.spermwhale.arms.i2.s1'), T('ships.spermwhale.arms.i3.s1'), T('ships.spermwhale.arms.i4.s1')],
  desc: T('ships.spermwhale.desc'),
  mounts: [
  _m('bow', 'n75', [0, 7.2, 66], 0, ARC_BOW, 'tur75', 'dual'),
  _m('ciwsF', 'ciws20', [0, 21.5, 22], 0, ARC_CIWS, null, 'ciws'),
  _m('ciwsA', 'ciws20', [0, 9.2, -30], Math.PI, ARC_CIWS, null, 'ciws'),
  _m('n50L', 'n50', [-8.2, 6.4, -50], -Math.PI / 2, ARC_SIDE, 'tur50', 'dual'),
  _m('n50R', 'n50', [8.2, 6.4, -50], Math.PI / 2, ARC_SIDE, 'tur50', 'dual')
],
  launchers: [
  _L('vlsF', 'vlsSam', [0, 8.0, 52], 'vls'),
  _L('vlsA', 'vlsSam', [0, 8.0, -42], 'vls'),
  _L('ssmF', 'vlsSsm', [0, 8.0, 52], 'vls', 8),        // 96 单元里的 16 单元装反舰弹，前后各 8
  _L('ssmA', 'vlsSsm', [0, 8.0, -42], 'vls', 8)
]
});
