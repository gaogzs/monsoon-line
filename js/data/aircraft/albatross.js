/* ============================================================
   D-33 信天翁 —— 高机动格斗机
   ============================================================ */
Registry.aircraft({
  order: 60,
  id: 'albatross',
  name: 'D-33', nick: 'Albatross', cn: T('aircraft.albatross.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 17000,
  role: T('aircraft.albatross.role'),
  faction: T('aircraft.albatross.faction'),
  planformType: T('aircraft.albatross.planformType'),
  caps: [],                    // 纯格斗机：没有对地火控，也不带电子战设备
  maker: T('aircraft.albatross.maker'),
  model: 'albatross',
  desc: T('aircraft.albatross.desc'),
  stats: { spd: 0.46, mob: 0.93, stl: 0.24, fire: 0.60, dur: 0.62, rng: 0.80, ecm: 0.30 },
  phys: { vMax: 470, vMil: 380, vStall: 96, accel: 24, decel: 42, pitch: 0.80, roll: 2.81, yaw: 0.36, hp: 118 },
  gun: 'cel3',
  maxLoad: 5000,
  hardpointGroups: [
    // 跟着后移后的前掠翼走：每个挂点落在该处翼弦的中段
    { id: 'A', label: T('aircraft.albatross.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 3.0, y: -1.8 }, { x: -3.0, y: -1.8 }] },
    { id: 'B', label: T('aircraft.albatross.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 5.2, y: -0.3 }, { x: -5.2, y: -0.3 }] },
    { id: 'C', label: T('aircraft.albatross.hardpointGroups.i2.label'), kind: 'tip', pts: [{ x: 7.4, y: 1.0 }, { x: -7.4, y: 1.0 }] },
    { id: 'D', label: T('aircraft.albatross.hardpointGroups.i3.label'), kind: 'light', playerOnly: true, pts: [{ x: 1.7, y: -3.0 }, { x: -1.7, y: -3.0 }] }
  ],
  defaultLoadout: { A: 'wasp', B: 'qsr', C: 'irp' }
});
