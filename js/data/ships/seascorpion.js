Registry.ship({
  order: 80,
  id: 'seascorpion',
  model: 'seascorpion',
  hull: T('ships.seascorpion.hull'),
  name: 'Seascorpion',
  cn: T('ships.seascorpion.cn'),
  cls: T('ships.seascorpion.cls'),
  faction: T('ships.seascorpion.faction'),
  operator: T('ships.seascorpion.operator'),
  role: T('ships.seascorpion.role'),
  disp: 4200,
  dim: [132, 20.4, 4.4],
  speed: 18,
  crew: 90,
  hp: 560, radius: 40, value: 260,
  gunResist: 0.85,
  label: T('ships.seascorpion.label'),
  vials: [T('ships.seascorpion.vials.i0.s1'), T('ships.seascorpion.vials.i1.s1'), T('ships.seascorpion.vials.i2.s1')],
  arms: [T('ships.seascorpion.arms.i0.s1')],
  desc: T('ships.seascorpion.desc'),
  mounts: [
  _m('rwsF', 'aa30', [0, 8.6, 40], 0, ARC_CIWS, null, 'aa'),
  _m('rwsA', 'aa30', [0, 7.0, -55], Math.PI, ARC_CIWS, null, 'aa')
]
});
