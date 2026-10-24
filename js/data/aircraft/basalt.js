/* ============================================================
   GAL-31「玄武岩」—— 高峰军工制造局的重型截击机

   下游的机型前缀取自**设计局**（参照苏联按 MiG / Su / Tu 分的做法），
   而 galtu（高）正是这家厂的招牌（下游的随队干扰机 ROK-44 不是它的 —— 那是石林拿巨砾改的）。它存在的理由也只有一个：
   让那批在 15 公里以上飞了半辈子的老兵有东西可开。
   ============================================================ */
Registry.aircraft({
  order: 90,
  id: 'basalt',
  name: 'GAL-31', nick: 'Basalt', cn: T('aircraft.basalt.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 19000,
  role: T('aircraft.basalt.role'),
  faction: T('aircraft.basalt.faction'),
  planformType: T('aircraft.basalt.planformType'),
  caps: ['intercept'],
  maker: T('aircraft.basalt.maker'),
  npcOnly: true,
  model: 'basalt',
  desc: T('aircraft.basalt.desc'),
  stats: { spd: 0.83, mob: 0.32, stl: 0.16, fire: 0.78, dur: 0.68, rng: 0.58, ecm: 0.24 },
  phys: { vMax: 610, vMil: 490, vStall: 142, accel: 30, decel: 30, pitch: 0.44, roll: 1.56, yaw: 0.22, hp: 150 },
  gun: 'cel11',
  maxLoad: 6200,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.basalt.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 3.6, y: -1.4 }, { x: -3.6, y: -1.4 }] },
    { id: 'B', label: T('aircraft.basalt.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 6.0, y: -2.2 }, { x: -6.0, y: -2.2 }] },
    { id: 'C', label: T('aircraft.basalt.hardpointGroups.i2.label'), kind: 'light', playerOnly: true, pts: [{ x: 4.2, y: -3.0 }, { x: -4.2, y: -3.0 }] }
  ],
  defaultLoadout: {}
});
