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
  /* 命中半径（米）：所有飞机缺省 7.5（Combat.HIT_R_AIR）。重型轰炸机机体大得多
     （58 × 54 m），再用 7.5 会显得"贴着机翼打不中"，所以放大到 11.5；hp 不动，
     靠更大的靶面自然变脆。quartz / lodestone 共用这个机体，但它们各有自己的数据，
     没写就仍是 7.5。 */
  hitR: 11.5,
  /* 弹舱 4 点（沿机身前后两对）+ 翼下 4 点（发动机内外各一对）。
     2.5 之前是 A 弹舱一对 / B 翼下一对；关卡里的 loadout 同步改成 B1（见 m5 / m8）。 */
  hardpointGroups: [
    { id: 'A1', label: T('aircraft.boulder.hardpointGroups.i0.label'), kind: 'belly', expose: 0, hy: -2.65, pts: [{ x: 1.0, y: 5.0 }, { x: -1.0, y: 5.0 }] },
    { id: 'A2', label: T('aircraft.boulder.hardpointGroups.i1.label'), kind: 'belly', expose: 0, hy: -2.65, pts: [{ x: 1.0, y: -2.0 }, { x: -1.0, y: -2.0 }] },
    { id: 'B1', label: T('aircraft.boulder.hardpointGroups.i2.label'), kind: 'heavy', pts: [{ x: 5.4, y: 0.0 }, { x: -5.4, y: 0.0 }] },
    { id: 'B2', label: T('aircraft.boulder.hardpointGroups.i3.label'), kind: 'heavy', pts: [{ x: 13.5, y: 0.2 }, { x: -13.5, y: 0.2 }] }
  ],
  defaultLoadout: {},
  /* ROK-40 的尾炮：没有实体，从尾锥射出，管后半球。它本身没有前射机炮（gun: null） */
  mounts: [_m('tail', 'tail20a', [0, 0.4, -32.2], Math.PI,
    { yawMin: -1.5, yawMax: 1.5, pitchMin: -0.9, pitchMax: 0.9 }, null, 'aa')]
});
