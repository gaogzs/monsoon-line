/* ============================================================
   空中预警机 —— 四方里只有两家养得起

   它们不是战斗机，是**眼睛**。飞到战线后方盘旋几个小时，
   把雷达看到的东西说给所有人听。没有武器、不会规避、
   被打掉就是一整条编队同时变瞎。

   在这两架出现之前，"预警机"在这个项目里只活在台词里：
   SEXTANT 说了整场战役的话，却没有一架飞机是他。
   ============================================================ */
Registry.aircraft({
  order: 150,
  id: 'pelican',
  // 前缀 J- 取自 jundi（注意 / 警觉）—— 空中预警的活就是"一直看着"
  name: 'J-2', nick: 'Pelican', cn: T('aircraft.pelican.cn'),
  ceiling: 12000,
  // 机炮抗性（小口径航炮伤害减免比例），见 entities.js 的 gunResistK
  gunResist: 0.05,
  role: T('aircraft.pelican.role'),
  faction: T('aircraft.pelican.faction'),
  planformType: T('aircraft.pelican.planformType'),
  caps: [],
  maker: T('aircraft.pelican.maker'),
  npcOnly: true,
  model: 'sower',
  desc: T('aircraft.pelican.desc'),
  stats: { spd: 0.24, mob: 0.18, stl: 0.10, fire: 0.05, dur: 0.84, rng: 0.94, ecm: 0.26 },
  phys: { vMax: 300, vMil: 255, vStall: 80, accel: 11, decel: 33, pitch: 0.32, roll: 1.48, yaw: 0.25, hp: 200 },
  /* 无武装。上面那段描述写了好几个版本，数值这里一直挂着 cel3 ——
     所谓"没有任何武器"在数据里其实是有武器。现在对齐。 */
  gun: null,
  maxLoad: 0,
  hardpointGroups: [
    { id: 'A', label: T('aircraft.pelican.hardpointGroups.i0.label'), kind: 'belly', hy: -1.85, pts: [{ x: 0.9, y: -1.6 }, { x: -0.9, y: -1.6 }] }
  ],
  defaultLoadout: {}
});
