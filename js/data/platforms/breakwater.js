Registry.platform({
  order: 20,
  id: 'breakwater', model: 'breakwater', hull: T('platforms.breakwater.hull'), name: 'Breakwater', cn: T('platforms.breakwater.cn'),
  cls: T('platforms.breakwater.cls'), faction: T('platforms.breakwater.faction'), operator: T('platforms.breakwater.operator'),
  role: T('platforms.breakwater.role'), dim: [56, 48, 15], speed: 0, fixed: true, crew: 80,
  hp: 1600, radius: 40, value: 450, gunResist: 0.92, label: T('platforms.breakwater.label'),
  vials: [T('platforms.breakwater.vials.i0.s1'), T('platforms.breakwater.vials.i1.s1'), T('platforms.breakwater.vials.i2.s1')],
  arms: [T('platforms.breakwater.arms.i0.s1'), T('platforms.breakwater.arms.i1.s1')],
  desc: T('platforms.breakwater.desc'),
  mounts: [
  _m('ciws', 'ciws20', [18, 24, -14], Math.PI, ARC_CIWS_ALL, null, 'ciws'),
  _m('n50L', 'n50', [-26, 16, 0], -Math.PI / 2, ARC_SIDE, 'tur50', 'dual'),
  _m('n50R', 'n50', [26, 16, 10], Math.PI / 2, ARC_SIDE, 'tur50', 'dual')
]
});
