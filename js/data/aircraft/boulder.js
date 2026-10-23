/* ============================================================
   ROK-40「巨砾」—— 石林的重型轰炸机

   下游同盟唯一的重型打击平台。它不参与空战 ——
   从进场到投弹到脱离，全程沿剧本给的航线飞。

   护航要靠战斗机，而下游的护航历来不够 ——
   这句话在下游航空军内部是一句牢骚，也是一个事实。

   `gun: null` 是刻意的：它**没有任何武器**。早先这里挂着 `cel11`，
   尾部那门炮便借着通用的 fireGun 打出去 —— 而 fireGun 的炮口在机头、
   弹丸方向写死机鼻朝向，根本不构成炮塔。见 docs/systems/ai.md「已知问题」。
   ============================================================ */
Registry.aircraft({
  order: 110,
  id: 'boulder',
  name: 'ROK-40', nick: 'Boulder', cn: T('aircraft.boulder.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 16000,
  // 机炮抗性（小口径航炮伤害减免比例），见 entities.js 的 gunResistK
  gunResist: 0.15,
  role: T('aircraft.boulder.role'),
  faction: T('aircraft.boulder.faction'),
  planformType: T('aircraft.boulder.planformType'),
  caps: ['strike'],
  maker: T('aircraft.boulder.maker'),
  npcOnly: true,
  model: 'boulder',
  desc: T('aircraft.boulder.desc'),
  stats: { spd: 0.15, mob: 0.05, stl: 0.06, fire: 0.18, dur: 0.95, rng: 0.74, ecm: 0.34 },
  phys: {
    vMax: 305, vMil: 260, vStall: 132,
    accel: 8, decel: 16, pitch: 0.15, roll: 0.66, yaw: 0.10, hp: 420
  },
  /* 无武装。理由与做法见上面那段注释 —— 这不是漏写。 */
  gun: null,
  maxLoad: 22000,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.boulder.hardpointGroups.i0.label'), kind: 'belly', expose: 0, hy: -2.30, pts: [{ x: 1.6, y: -2.2 }, { x: -1.6, y: -2.2 }] },
    { id: 'B', label: T('aircraft.boulder.hardpointGroups.i1.label'), kind: 'heavy', pts: [{ x: 6.0, y: -1.5 }, { x: -6.0, y: -1.5 }] }
  ],
  defaultLoadout: {},
  /* ROK-40 的尾炮：没有实体，从尾锥射出，管后半球。它本身没有前射机炮（gun: null） */
  mounts: [_m('tail', 'tail20a', [0, 0.4, -22.2], Math.PI,
    { yawMin: -1.5, yawMax: 1.5, pitchMin: -0.9, pitchMax: 0.9 }, null, 'aa')]
});
