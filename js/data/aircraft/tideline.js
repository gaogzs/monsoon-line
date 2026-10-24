/* ============================================================
   分水群岛国 —— 名义中立的当地武装
   ============================================================ */
Registry.aircraft({
  order: 120,
  id: 'tideline',
  // 商品名体系：系列名取自逻辑语（xamsi 海），后面跟世代号 ——
  // 就像 Mirage III 那样，名字本身就是牌子，不带军标前缀
  name: 'XAMSI Mk.2', nick: 'Tideline', cn: T('aircraft.tideline.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 16000,
  role: T('aircraft.tideline.role'),
  faction: T('aircraft.tideline.faction'),
  planformType: T('aircraft.tideline.planformType'),
  caps: ['intercept'],
  maker: T('aircraft.tideline.maker'),
  npcOnly: true,
  model: 'sailfish',
  desc: T('aircraft.tideline.desc'),
  stats: { spd: 0.47, mob: 0.62, stl: 0.14, fire: 0.40, dur: 0.44, rng: 0.48, ecm: 0.18 },
  phys: { vMax: 460, vMil: 370, vStall: 102, accel: 21, decel: 40, pitch: 0.62, roll: 2.26, yaw: 0.32, hp: 100 },
  gun: 'cel1',
  maxLoad: 2600,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.tideline.hardpointGroups.i0.label'), kind: 'light', pts: [{ x: 2.4, y: -0.6 }, { x: -2.4, y: -0.6 }] },
    { id: 'B', label: T('aircraft.tideline.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 4.2, y: -4.2 }, { x: -4.2, y: -4.2 }] }
  ],
  defaultLoadout: {},
  /* 敌机挂载预设：patrol 只挂 A 一对老式短程弹（B 空着）。中立机，不参与战斗。 */
  npcLoadouts: {
    patrol: { A: 'otr' }
  },
});
