Registry.platform({
  order: 10,
  id: 'shoal', model: 'shoal', hull: T('platforms.shoal.hull'), name: 'Shoal', cn: T('platforms.shoal.cn'),
  cls: T('platforms.shoal.cls'), faction: T('platforms.shoal.faction'), operator: T('platforms.shoal.operator'),
  role: T('platforms.shoal.role'), dim: [36, 36, 20], speed: 0, fixed: true, crew: 46,
  hp: 1400, radius: 30, value: 500, gunResist: 0.9, label: T('platforms.shoal.label'), sam: 'ss6',
  vials: [T('platforms.shoal.vials.i0.s1'), T('platforms.shoal.vials.i1.s1'), T('platforms.shoal.vials.i2.s1')],
  arms: [T('platforms.shoal.arms.i0.s1'), T('platforms.shoal.arms.i1.s1')],
  desc: T('platforms.shoal.desc'),
  mounts: [
  _m('ciwsA', 'ciws20', [-15, 21, 15], 0, ARC_CIWS, null, 'ciws'),
  _m('ciwsB', 'ciws20', [15, 21, -15], Math.PI, ARC_CIWS, null, 'ciws')
],
  launchers: [_L('vls', 'vlsSam', [8, 22, 9], 'vls')]
});
