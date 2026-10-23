Registry.ship({
  order: 50,
  id: 'dolphin',
  model: 'dolphin',
  hull: T('ships.dolphin.hull'),
  name: 'Dolphin',
  cn: T('ships.dolphin.cn'),
  cls: T('ships.dolphin.cls'),
  faction: T('ships.dolphin.faction'),
  operator: T('ships.dolphin.operator'),
  role: T('ships.dolphin.role'),
  disp: 3400,
  dim: [108, 14.4, 3.0],
  speed: 29,
  crew: 140,
  hp: 520, radius: 33, value: 340,
  gunResist: 0.8,
  label: T('ships.dolphin.label'),
  vials: [T('ships.dolphin.vials.i0.s1'), T('ships.dolphin.vials.i1.s1'), T('ships.dolphin.vials.i2.s1')],
  arms: [T('ships.dolphin.arms.i0.s1'), T('ships.dolphin.arms.i1.s1'), T('ships.dolphin.arms.i2.s1'), T('ships.dolphin.arms.i3.s1')],
  desc: T('ships.dolphin.desc'),
  mounts: [
  _m('bow', 'n75', [0, 5.0, 44], 0, ARC_BOW, 'tur75', 'dual')
],
  launchers: [
  _L('ssmL', 'railSsm', [-1.4, 6.6, -9], { yaw: 0, elev: 0.36 }, 2),
  _L('ssmR', 'railSsm', [1.4, 6.6, -9], { yaw: 0, elev: 0.36 }, 2),
  _L('sam', 'rotSam', [0, 4.8, -22], 'turret', 0, ARC_CIWS, 'lnch')
]
});
