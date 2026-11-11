Registry.ship({
  order: 30,
  tags: ['resupply'],
  id: 'humpback',
  model: 'humpback',
  hull: T('ships.humpback.hull'),
  name: 'Humpback',
  cn: T('ships.humpback.cn'),
  cls: T('ships.humpback.cls'),
  faction: T('ships.humpback.faction'),
  operator: T('ships.humpback.operator'),
  role: T('ships.humpback.role'),
  disp: 48000,
  dim: [280, 40, 11],
  speed: 30,
  crew: 2400,
  /* 甲板跑道（补给后 reset:'runway' 用）：本地坐标 x 右舷、z 舰首、y 甲板高；z 是跑道的
     起飞端，yaw 是相对舰首的偏角（rad）。平甲板 40 × 276 m，左右两条平行跑道，起飞端都在舰首。 */
  runways: [{ x: -9, y: 19.2, z: 128, yaw: 0 }, { x: 9, y: 19.2, z: 128, yaw: 0 }],
  hp: 2600, radius: 84, value: 1400,
  gunResist: 0.995,
  label: T('ships.humpback.label'),
  vials: [T('ships.humpback.vials.i0.s1'), T('ships.humpback.vials.i1.s1'), T('ships.humpback.vials.i2.s1')],
  arms: [T('ships.humpback.arms.i0.s1'), T('ships.humpback.arms.i1.s1'), T('ships.humpback.arms.i2.s1'), T('ships.humpback.arms.i3.s1')],
  desc: T('ships.humpback.desc'),
  mounts: [
  _m('ciwsFL', 'ciws20', [-18, 20.0, 120], -Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('ciwsFR', 'ciws20', [18, 20.0, 120], Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('ciwsAL', 'ciws20', [-18, 20.0, -125], -3 * Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('ciwsAR', 'ciws20', [18, 20.0, -125], 3 * Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('n50L', 'n50', [-18.5, 19.2, -60], -Math.PI / 2, ARC_SIDE, 'tur50', 'dual'),
  _m('n50R', 'n50', [18.5, 19.2, -60], Math.PI / 2, ARC_SIDE, 'tur50', 'dual')
],
  launchers: [
  _L('samL', 'rotSam', [-17, 19.2, 104], 'turret', 0, { yawMin: -2.8, yawMax: 0.3, pitchMin: -0.1, pitchMax: 1.4 }, 'lnch'),
  _L('samR', 'rotSam', [17, 19.2, 104], 'turret', 0, { yawMin: -0.3, yawMax: 2.8, pitchMin: -0.1, pitchMax: 1.4 }, 'lnch')
]
});
