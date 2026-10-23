Registry.platform({
  order: 50,
  id: 'cairn', model: 'cairn', hull: T('platforms.cairn.hull'), name: 'Cairn', cn: T('platforms.cairn.cn'),
  cls: T('platforms.cairn.cls'), faction: T('platforms.cairn.faction'), operator: T('platforms.cairn.operator'),
  role: T('platforms.cairn.role'), dim: [48, 48, 24], speed: 0, fixed: true, crew: 60,
  hp: 2200, radius: 36, value: 400, gunResist: 0.9, label: T('platforms.cairn.label'),
  vials: [T('platforms.cairn.vials.i0.s1'), T('platforms.cairn.vials.i1.s1'), T('platforms.cairn.vials.i2.s1')],
  arms: [T('platforms.cairn.arms.i0.s1'), T('platforms.cairn.arms.i1.s1')],
  desc: T('platforms.cairn.desc'),
  mounts: [
  _m('gun', 'n75', [16, 25, 16], 0, ARC_BOW, 'tur75', 'dual'),
  _m('n50L', 'n50', [-18, 25, -12], -Math.PI / 2, ARC_SIDE, 'tur50', 'dual'),
  _m('n50R', 'n50', [20, 25, 4], Math.PI / 2, ARC_SIDE, 'tur50', 'dual')
]
});
