/* ============================================================
   怪诞虫级无人机航母 · 下游同盟海军（批次 6.1b）
   一整块平甲板，三条并排的弹射轨道，机库里存放一批砾石无人机，按波次放飞。
   本身没什么火力（近防炮 + 一座垂发），价值全在放出去的那一群。
   机库、放飞、回收见 js/missions/_lib.js 的 tickHangar；起飞过程见 js/engine/entities/deck.js。
   ============================================================ */
Registry.ship({
  order: 80,
  tags: ['droneCarrier'],
  id: 'hallucigenia',
  model: 'hallucigenia',
  hull: T('ships.hallucigenia.hull'),
  name: 'Hallucigenia',
  cn: T('ships.hallucigenia.cn'),
  cls: T('ships.hallucigenia.cls'),
  faction: T('ships.hallucigenia.faction'),
  operator: T('ships.hallucigenia.operator'),
  role: T('ships.hallucigenia.role'),
  disp: 9800,
  dim: [180, 30, 5.2],
  speed: 24,
  crew: 160,
  /* 机库：capacity 架砾石；每 launchCd 秒一波、一波 waveSize 架、波内每隔 stagger 秒放一架；
     无人机弹药打空 / 血量低时飞回舰尾槽位（舰后 240 m），进入 dockR 且低于 recoverAlt 后收回（不计击毁、不计损失）。
     recoverAlt 要高于 AI 的离地保护（420 m），dockR 要大于无人机的盘旋半径余量 */
  hangar: { capacity: 12, launchCd: 25, waveSize: 3, stagger: 2.5, dockR: 400, recoverAlt: 600, droneType: 'gravel', cmd: 'sortie' },
  /* 三条并排的弹射轨道：(x, y, z) 是起飞端，起点往后退 80 m；与 js/models/ships/hallucigenia.js 的轨道对上 */
  runways: [
    { x: -8, y: 9.2, z: 78, yaw: 0 },
    { x: 0, y: 9.2, z: 78, yaw: 0 },
    { x: 8, y: 9.2, z: 78, yaw: 0 }
  ],
  hp: 760, radius: 52, value: 520,
  gunResist: 0.85,
  label: T('ships.hallucigenia.label'),
  vials: [T('ships.hallucigenia.vials.i0.s1'), T('ships.hallucigenia.vials.i1.s1'), T('ships.hallucigenia.vials.i2.s1')],
  arms: [T('ships.hallucigenia.arms.i0.s1'), T('ships.hallucigenia.arms.i1.s1'), T('ships.hallucigenia.arms.i2.s1')],
  desc: T('ships.hallucigenia.desc'),
  mounts: [
  _m('ciwsL', 'ciws20', [-12, 9.8, -22], -Math.PI / 2, ARC_CIWS, null, 'ciws'),
  _m('ciwsR', 'ciws20', [12, 9.8, -22], Math.PI / 2, ARC_CIWS, null, 'ciws'),
  _m('ciwsA', 'ciws20', [0, 10.4, -84], Math.PI, ARC_CIWS, null, 'ciws')
],
  launchers: [
  _L('sam', 'vlsSam', [0, 9.4, -56], 'vls')
]
});
