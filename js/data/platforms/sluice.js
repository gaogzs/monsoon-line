Registry.platform({
  order: 30,
  id: 'sluice', model: 'sluice', hull: T('platforms.sluice.hull'), name: 'Sluice', cn: T('platforms.sluice.cn'),
  cls: T('platforms.sluice.cls'), faction: T('platforms.sluice.faction'), operator: T('platforms.sluice.operator'),
  role: T('platforms.sluice.role'), dim: [50, 40, 18], speed: 0, fixed: true, crew: 120,
  hp: 1800, radius: 36, value: 700, gunResist: 0.93, label: T('platforms.sluice.label'),
  vials: [T('platforms.sluice.vials.i0.s1'), T('platforms.sluice.vials.i1.s1'), T('platforms.sluice.vials.i2.s1')],
  arms: [T('platforms.sluice.arms.i0.s1'), T('platforms.sluice.arms.i1.s1'), T('platforms.sluice.arms.i2.s1')],
  desc: T('platforms.sluice.desc'),
  mounts: [
  _m('gunF', 'n120', [0, 19, 14], 0, { yawMin: -2.6, yawMax: 2.6, pitchMin: -0.1, pitchMax: 0.9 }, 'tur120r', 'dual'),
  _m('gunA', 'n120', [0, 19, -14], Math.PI, { yawMin: -2.6, yawMax: 2.6, pitchMin: -0.1, pitchMax: 0.9 }, 'tur120r', 'dual'),
  _m('aa', 'aa30', [0, 26, 0], 0, ARC_CIWS, null, 'aa')
],
  launchers: [
  _L('ssmRF', 'railSsm', [21, 21.8, 7], { yaw: Math.PI / 2, elev: 0.3 }, 1),
  _L('ssmRA', 'railSsm', [21, 21.8, -7], { yaw: Math.PI / 2, elev: 0.3 }, 1),
  _L('ssmLF', 'railSsm', [-21, 21.8, 7], { yaw: -Math.PI / 2, elev: 0.3 }, 1),
  _L('ssmLA', 'railSsm', [-21, 21.8, -7], { yaw: -Math.PI / 2, elev: 0.3 }, 1)
]
});
