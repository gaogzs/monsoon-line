/* ============================================================
   独角鲸级航空巡洋舰 · 上游公约海军（批次 6.3）
   前半是巡洋舰（75 mm 炮、旋转舰空弹架、近防炮），后半是斜角飞行甲板：
   不是航母，没有弹射器与机库，但能让飞机在后甲板补给，所以是整备点。
   ============================================================ */
Registry.ship({
  order: 40,
  tags: ['resupply'],
  id: 'narwhal',
  model: 'narwhal',
  hull: T('ships.narwhal.hull'),
  name: 'Narwhal',
  cn: T('ships.narwhal.cn'),
  cls: T('ships.narwhal.cls'),
  faction: T('ships.narwhal.faction'),
  operator: T('ships.narwhal.operator'),
  role: T('ships.narwhal.role'),
  disp: 24000,
  dim: [196, 28, 7.5],      // 长 × 后甲板最宽 × 吃水
  speed: 30,
  crew: 520,
  /* 甲板跑道（补给后 reset:'runway' 用）：本地坐标 x 右舷、z 舰首、y 甲板高。
     没有弹射器，取斜角甲板的前端起飞；yaw 与着舰轴线一致（≈5.2°），要和
     js/models/ships/narwhal.js 的 axisX 对上，probe-resupply 会拿模型表面核对 */
  runways: [
    { x: -1.8, y: 6.7, z: -14, yaw: 0.0907 }
  ],
  hp: 1100, radius: 62, value: 600,
  gunResist: 0.85,
  label: T('ships.narwhal.label'),
  vials: [T('ships.narwhal.vials.i0.s1'), T('ships.narwhal.vials.i1.s1'), T('ships.narwhal.vials.i2.s1')],
  arms: [T('ships.narwhal.arms.i0.s1'), T('ships.narwhal.arms.i1.s1'), T('ships.narwhal.arms.i2.s1')],
  desc: T('ships.narwhal.desc'),
  mounts: [
  _m('bow', 'n75', [0, 10.9, 72], 0, ARC_BOW, 'tur75', 'dual'),
  _m('ciwsF', 'ciws20', [0, 11.2, 38], 0, ARC_CIWS, null, 'ciws'),
  _m('ciwsA', 'ciws20', [-9, 7.1, -8], Math.PI, ARC_CIWS, null, 'ciws')
],
  launchers: [
  _L('samL', 'rotSam', [-5.5, 11.0, 42], 'turret', 0, { yawMin: -2.8, yawMax: 0.3, pitchMin: -0.1, pitchMax: 1.4 }, 'lnch'),
  _L('samR', 'rotSam', [5.5, 11.0, 44], 'turret', 0, { yawMin: -0.3, yawMax: 2.8, pitchMin: -0.1, pitchMax: 1.4 }, 'lnch')
]
});
