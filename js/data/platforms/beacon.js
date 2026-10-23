Registry.platform({
  order: 60,
  id: 'beacon', model: 'beacon', hull: T('platforms.beacon.hull'), name: 'Beacon', cn: T('platforms.beacon.cn'),
  cls: T('platforms.beacon.cls'), faction: T('platforms.beacon.faction'), operator: T('platforms.beacon.operator'),
  role: T('platforms.beacon.role'), dim: [12, 12, 9], speed: 0, fixed: true, crew: 0,
  hp: 300, radius: 10, value: 0, gunResist: 0.5, label: T('platforms.beacon.label'), neutral: true,
  vials: [T('platforms.beacon.vials.i0.s1'), T('platforms.beacon.vials.i1.s1')],
  arms: [T('platforms.beacon.arms.i0.s1')],
  desc: T('platforms.beacon.desc')
});
