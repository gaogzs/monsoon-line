Registry.ship({
  order: 90,
  id: 'cameroceras',
  model: 'cameroceras',
  hull: T('ships.cameroceras.hull'),
  name: 'Cameroceras',
  cn: T('ships.cameroceras.cn'),
  cls: T('ships.cameroceras.cls'),
  faction: T('ships.cameroceras.faction'),
  operator: T('ships.cameroceras.operator'),
  role: T('ships.cameroceras.role'),
  disp: 18000,
  dim: [195, 24, 5.2],
  speed: 24,
  crew: 210,
  hp: 900, radius: 58, value: 1100,
  gunResist: 0.92,
  label: T('ships.cameroceras.label'),
  vials: [T('ships.cameroceras.vials.i0.s1'), T('ships.cameroceras.vials.i1.s1'), T('ships.cameroceras.vials.i2.s1')],
  arms: [T('ships.cameroceras.arms.i0.s1'), T('ships.cameroceras.arms.i1.s1')],
  /* 专属齐射节奏（turret.js launch）：弹库舰一波 6 发、约 8 s 一波 —— 每分钟约 45 发，
     有压制力，但不会一百多发一口气打光 */
  salvo: { n: 6, gap: 8 },
  desc: T('ships.cameroceras.desc'),
  mounts: [
  _m('ciwsF', 'ciws20', [0, 10.0, 80], 0, ARC_CIWS, null, 'ciws'),
  _m('ciwsA', 'ciws20', [0, 10.0, -85], Math.PI, ARC_CIWS, null, 'ciws')
],
  launchers: [
  /* 312 单元里 200 单元是反舰弹（三段模块按长度分），其余是舰空弹（前段，受控）。
     它是为一次齐射造的：专属齐射节奏见 SHIPS 里的 salvo（一波 6 发、约 8 s 一波） */
  _L('vlsF', 'vlsSsm', [0, 9.2, 68], 'vls', 50),
  _L('vlsM', 'vlsSsm', [0, 9.2, 10], 'vls', 80),
  _L('vlsA', 'vlsSsm', [0, 9.2, -58], 'vls', 70),
  _L('vlsSam', 'vlsSam', [0, 9.2, 60], 'vls')
]
});
