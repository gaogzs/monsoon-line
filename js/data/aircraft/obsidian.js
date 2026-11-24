/* ============================================================
   GAL-52「黑曜岩」—— 下游高峰军工制造局的战略制空支援机（批次 6.4）

   不进缠斗：守在己方战斗机后方十几公里，一次对好几个目标各放一发远程弹，
   同时撑开一片大范围干扰场，把对面的锁定距离压下去。
   AI 行为见 js/engine/ai/support.js（role: 'support'，关卡 spawnEnemy 传 role: 'support'）。
   ============================================================ */
Registry.aircraft({
  order: 95,
  tags: ['ewfield'],
  id: 'obsidian',
  name: 'GAL-52', nick: 'Obsidian', cn: T('aircraft.obsidian.cn'),
  ceiling: 20000,
  role: T('aircraft.obsidian.role'),
  faction: T('aircraft.obsidian.faction'),
  planformType: T('aircraft.obsidian.planformType'),
  caps: ['intercept', 'ew'],
  maker: T('aircraft.obsidian.maker'),
  npcOnly: true,
  rank: 'elite',
  model: 'obsidian',
  desc: T('aircraft.obsidian.desc'),
  /* 大范围电子战场：敌方进入 R 米就自动开机（走 brain.js 的 jamAuto）。
     SAV-14 的 12 km 是外挂吊舱；这一台是机载专用的，半径更大 */
  ewField: { wid: 'vsc', R: 18000 },
  /* 极速比海燕还高，加速和机动都很差：快但转不动，靠速度脱身、靠射程和齐射输出 */
  stats: { spd: 0.92, mob: 0.06, stl: 0.08, fire: 0.95, dur: 0.88, rng: 0.99, ecm: 0.90 },
  exhaust: { color: 'smoky' },
  phys: { vMax: 680, vMil: 560, vStall: 180, accel: 12, decel: 20, pitch: 0.18, roll: 0.50, yaw: 0.10, hp: 480 },
  hitR: 13,                     // 大靶面（缺省 7.5，boulder 11.5）
  gun: null,
  maxLoad: 12000,
  /* 机腹三个长弹舱（belly，弹在舱里：expose 0）+ 翼下两组重挂点 + 翼尖一组自卫弹。
     pts 的 y 是前后位置；机腹点 x = ±1.0，避开 x 2.4–5.4 的发动机短舱 */
  hardpointGroups: [
    { id: 'A', label: T('aircraft.obsidian.hardpointGroups.i0.label'), kind: 'belly', expose: 0, pts: [{ x: 1.0, y: 10.0 }, { x: -1.0, y: 10.0 }] },
    { id: 'B', label: T('aircraft.obsidian.hardpointGroups.i1.label'), kind: 'belly', expose: 0, pts: [{ x: 1.0, y: 0.0 }, { x: -1.0, y: 0.0 }] },
    { id: 'C', label: T('aircraft.obsidian.hardpointGroups.i2.label'), kind: 'belly', expose: 0, pts: [{ x: 1.0, y: -10.0 }, { x: -1.0, y: -10.0 }] },
    { id: 'D', label: T('aircraft.obsidian.hardpointGroups.i3.label'), kind: 'heavy', pts: [{ x: 6.5, y: -15.0 }, { x: -6.5, y: -15.0 }] },
    { id: 'E', label: T('aircraft.obsidian.hardpointGroups.i4.label'), kind: 'heavy', pts: [{ x: 8.3, y: -19.0 }, { x: -8.3, y: -19.0 }] },
    { id: 'F', label: T('aircraft.obsidian.hardpointGroups.i5.label'), kind: 'light', pts: [{ x: 9.2, y: -20.8 }, { x: -9.2, y: -20.8 }] }
  ],
  /* TEPHRA：三个弹舱 3 × 4 + 翼下两组 2 × 4 = 20 发；F 组 DAR-4 自卫 8 发 */
  defaultLoadout: { A: 'tephra', B: 'tephra', C: 'tephra', D: 'tephra', E: 'tephra', F: 'dl4' },
  /* 关卡里这样生成：spawnEnemy(w, { ac: 'obsidian', role: 'support', loadout: 'support', special: null, ... })
     （不写 special 会退回 dl6，defaultLoadout 就不生效了） */
  npcLoadouts: { support: { A: 'tephra', B: 'tephra', C: 'tephra', D: 'tephra', E: 'tephra', F: 'dl4' } }
});
