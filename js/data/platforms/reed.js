Registry.platform({
  order: 40,
  id: 'reed', model: 'reed', hull: T('platforms.reed.hull'), name: 'Reed', cn: T('platforms.reed.cn'),
  cls: T('platforms.reed.cls'), faction: T('platforms.reed.faction'), operator: T('platforms.reed.operator'),
  role: T('platforms.reed.role'), dim: [18, 20, 12], speed: 0, fixed: true, crew: 14,
  hp: 420, radius: 14, value: 200, gunResist: 0.6, label: T('platforms.reed.label'), sam: 'dl9',
  vials: [T('platforms.reed.vials.i0.s1'), T('platforms.reed.vials.i1.s1')],
  arms: [T('platforms.reed.arms.i0.s1'), T('platforms.reed.arms.i1.s1')],
  desc: T('platforms.reed.desc'),
  mounts: [
  _m('gun', 'n75', [-3, 13, 6], 0, ARC_BOW, 'tur75r', 'dual')
],
  launchers: [_L('sam', 'rotSam', [-3, 13, -5], 'turret', 0, ARC_CIWS, 'lnchr')]
});
