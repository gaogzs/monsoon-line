/* ---------- 分水群岛国 ---------- */
Registry.ship({
  order: 110,
  id: 'daplu',
  model: 'daplu',
  hull: T('ships.daplu.hull'),
  name: 'Daplu',
  cn: T('ships.daplu.cn'),
  cls: T('ships.daplu.cls'),
  faction: T('ships.daplu.faction'),
  operator: T('ships.daplu.operator'),
  role: T('ships.daplu.role'),
  disp: 96,
  dim: [31, 6.6, 1.4],
  speed: 26,
  crew: 12,
  hp: 90, radius: 10, value: 80,
  gunResist: 0,
  label: T('ships.daplu.label'),
  vials: [T('ships.daplu.vials.i0.s1'), T('ships.daplu.vials.i1.s1')],
  arms: [T('ships.daplu.arms.i0.s1')],
  desc: T('ships.daplu.desc'),
  mounts: [
  _m('rws', 'tail20', [0, 3.5, 10.5], 0, ARC_CIWS, null, 'aa')
]
});
