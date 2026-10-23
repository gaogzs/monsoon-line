Registry.ship({
  order: 100,
  id: 'dunkleosteus',
  model: 'dunkleosteus',
  hull: T('ships.dunkleosteus.hull'),
  name: 'Dunkleosteus',
  cn: T('ships.dunkleosteus.cn'),
  cls: T('ships.dunkleosteus.cls'),
  faction: T('ships.dunkleosteus.faction'),
  operator: T('ships.dunkleosteus.operator'),
  role: T('ships.dunkleosteus.role'),
  disp: 8200,
  dim: [152, 18.8, 4.6],
  speed: 28,
  crew: 290,
  hp: 1050, radius: 46, value: 700,
  gunResist: 0.93,
  label: T('ships.dunkleosteus.label'),
  vials: [T('ships.dunkleosteus.vials.i0.s1'), T('ships.dunkleosteus.vials.i1.s1'), T('ships.dunkleosteus.vials.i2.s1')],
  arms: [T('ships.dunkleosteus.arms.i0.s1'), T('ships.dunkleosteus.arms.i1.s1'), T('ships.dunkleosteus.arms.i2.s1'), T('ships.dunkleosteus.arms.i3.s1'), T('ships.dunkleosteus.arms.i4.s1')],
  desc: T('ships.dunkleosteus.desc'),
  mounts: [
  _m('bow', 'n120', [0, 6.4, 60], 0, { yawMin: -2.6, yawMax: 2.6, pitchMin: -0.1, pitchMax: 0.9 }, 'tur120r', 'dual'),
  _m('ciws', 'ciws20', [0, 7.5, -56], Math.PI, ARC_CIWS_ALL, null, 'ciws'),
  _m('n50L', 'n50', [-7.4, 5.8, -36], -Math.PI / 2, ARC_SIDE, 'tur50r', 'dual'),
  _m('n50R', 'n50', [7.4, 5.8, -36], Math.PI / 2, ARC_SIDE, 'tur50r', 'dual')
],
  launchers: [
  _L('ssmFL', 'railSsm', [-2.6, 10.8, 40], { yaw: 0, elev: 0.2 }, 8),
  _L('ssmFR', 'railSsm', [2.6, 10.8, 40], { yaw: 0, elev: 0.2 }, 8),
  _L('ssmAL', 'railSsm', [-2.6, 10.0, 11], { yaw: 0, elev: 0.2 }, 8),
  _L('ssmAR', 'railSsm', [2.6, 10.0, 11], { yaw: 0, elev: 0.2 }, 8),
  _L('sam', 'rotSam', [0, 7.5, -64], 'turret', 0, ARC_CIWS, 'lnchr')
]
});
