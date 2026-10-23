Registry.ship({
  order: 70,
  id: 'ammonite',
  model: 'ammonite',
  hull: T('ships.ammonite.hull'),
  name: 'Ammonite',
  cn: T('ships.ammonite.cn'),
  cls: T('ships.ammonite.cls'),
  faction: T('ships.ammonite.faction'),
  operator: T('ships.ammonite.operator'),
  role: T('ships.ammonite.role'),
  disp: 1850,
  dim: [118, 15.2, 3.4],
  speed: 27,
  crew: 110,
  hp: 420, radius: 36, value: 320,
  gunResist: 0.8,
  label: T('ships.ammonite.label'),
  vials: [T('ships.ammonite.vials.i0.s1'), T('ships.ammonite.vials.i1.s1'), T('ships.ammonite.vials.i2.s1')],
  arms: [T('ships.ammonite.arms.i0.s1'), T('ships.ammonite.arms.i1.s1'), T('ships.ammonite.arms.i2.s1'), T('ships.ammonite.arms.i3.s1')],
  desc: T('ships.ammonite.desc'),
  mounts: [
  _m('bow', 'n75', [0, 5.5, 48], 0, ARC_BOW, 'tur75r', 'dual'),
  _m('ciws', 'ciws20', [0, 9.5, -30], Math.PI, ARC_CIWS_ALL, null, 'ciws')
],
  launchers: [
  _L('ssmFL', 'railSsm', [-6.0, 7.8, 1], { yaw: 0, elev: 0.5 }, 2),
  _L('ssmFR', 'railSsm', [6.0, 7.8, 1], { yaw: 0, elev: 0.5 }, 2),
  _L('ssmAL', 'railSsm', [-6.0, 7.8, -11], { yaw: 0, elev: 0.5 }, 2),
  _L('ssmAR', 'railSsm', [6.0, 7.8, -11], { yaw: 0, elev: 0.5 }, 2),
  _L('sam', 'vlsSam', [0, 8.4, -30], 'vls')
]
});
