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
  disp: 100000,
  dim: [330, 78, 12],      // 长 × 飞行甲板最宽（含斜角甲板）× 吃水
  speed: 30,
  crew: 1200,              // 舰员约 700 + 航空联队约 500：人口少、自动化程度高，维修 / 弹药转运 / 甲板调度大多交给自动化系统
  /* 甲板跑道（补给后 reset:'runway' 用）：本地坐标 x 右舷、z 舰首、y 甲板高；z 是跑道的起飞端，
     yaw 是相对舰首的偏角（rad）。三条 = 三具弹射器的前端：艏部两具（左 / 右）与右舷腰部一具。
     坐标要和 js/models/ships/humpback.js 的弹射器轨道对上，probe-resupply 会拿模型表面核对。 */
  runways: [
    { x: -9, y: 19.4, z: 156, yaw: 0 },     // 艏 1（左）
    { x: 6, y: 19.4, z: 150, yaw: 0 },      // 艏 2（右）
    { x: 17, y: 19.4, z: 64, yaw: 0 }       // 腰部（右舷）
  ],
  hp: 2600, radius: 100, value: 1400,
  gunResist: 0.995,
  label: T('ships.humpback.label'),
  vials: [T('ships.humpback.vials.i0.s1'), T('ships.humpback.vials.i1.s1'), T('ships.humpback.vials.i2.s1')],
  arms: [T('ships.humpback.arms.i0.s1'), T('ships.humpback.arms.i1.s1'), T('ships.humpback.arms.i2.s1'), T('ships.humpback.arms.i3.s1')],
  desc: T('ships.humpback.desc'),
  mounts: [
  _m('ciwsFL', 'ciws20', [-24, 20.0, 112], -Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('ciwsFR', 'ciws20', [24, 20.0, 112], Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('ciwsAL', 'ciws20', [-38, 20.0, -140], -3 * Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('ciwsAR', 'ciws20', [28, 20.0, -140], 3 * Math.PI / 4, ARC_CIWS, null, 'ciws'),
  _m('n50L', 'n50', [-28, 19.2, 6], -Math.PI / 2, ARC_SIDE, 'tur50', 'dual'),
  _m('n50R', 'n50', [30, 19.2, 6], Math.PI / 2, ARC_SIDE, 'tur50', 'dual')
],
  launchers: [
  _L('samL', 'rotSam', [-22, 19.2, 96], 'turret', 0, { yawMin: -2.8, yawMax: 0.3, pitchMin: -0.1, pitchMax: 1.4 }, 'lnch'),
  _L('samR', 'rotSam', [22, 19.2, 96], 'turret', 0, { yawMin: -0.3, yawMax: 2.8, pitchMin: -0.1, pitchMax: 1.4 }, 'lnch')
]
});
