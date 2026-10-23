/* ---------- 下游同盟 ---------- */
Registry.ship({
  order: 60,
  id: 'trilobite',
  model: 'trilobite',
  hull: T('ships.trilobite.hull'),
  name: 'Trilobite',
  cn: T('ships.trilobite.cn'),
  cls: T('ships.trilobite.cls'),
  faction: T('ships.trilobite.faction'),
  operator: T('ships.trilobite.operator'),
  role: T('ships.trilobite.role'),
  disp: 240,
  dim: [42, 8.4, 1.8],
  speed: 40,
  crew: 21,
  hp: 120, radius: 13, value: 120,
  gunResist: 0.2,
  label: T('ships.trilobite.label'),
  vials: [T('ships.trilobite.vials.i0.s1'), T('ships.trilobite.vials.i1.s1'), T('ships.trilobite.vials.i2.s1')],
  arms: [T('ships.trilobite.arms.i0.s1'), T('ships.trilobite.arms.i1.s1')],
  desc: T('ships.trilobite.desc'),
  mounts: [
  _m('rws', 'aa30', [0, 3.8, 14], 0, ARC_CIWS, null, 'aa')
],
  launchers: [
  _L('ssmL', 'railSsm', [-1.9, 4.8, -8], { yaw: 0, elev: 0.23 }, 4),
  _L('ssmR', 'railSsm', [1.9, 4.8, -8], { yaw: 0, elev: 0.23 }, 4)
]
});
