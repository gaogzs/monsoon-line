Registry.aircraft({
  order: 30,
  id: 'booby',
  model: 'booby',
  name: 'G-6',
  nick: 'Booby',
  cn: T('aircraft.booby.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 12000,
  role: T('aircraft.booby.role'),
  faction: T('aircraft.booby.faction'),
  planformType: T('aircraft.booby.planformType'),
  caps: ['strike'],
  /* CEL-7 的两根炮管画在机头下方，炮口的机体坐标 [|x|, y, z]。
     以前统一用"机头前 6 m、左右 0.7 m"，火光和弹道都落在机身里面。 */
  muzzle: [0.28, -0.78, 10.2],
  maker: T('aircraft.booby.maker'),
  stats: { spd: 0.3, mob: 0.44, stl: 0.30, fire: 0.98, dur: 0.98, rng: 0.60, ecm: 0.24 },
  phys: { vMax: 340, vMil: 295, vStall: 88, accel: 18, decel: 44, pitch: 0.62, roll: 1.72, yaw: 0.34, hp: 250 },
  gun: 'cel7',
  maxLoad: 7200,

  // 攻击机：挂点最多，但全是翼下，没有机腹舱
  hardpointGroups: [
    { id: 'A', label: T('aircraft.booby.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 3.8, y: -0.4 }, { x: -3.8, y: -0.4 }] },
    { id: 'B', label: T('aircraft.booby.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 6.2, y: -1.0 }, { x: -6.2, y: -1.0 }] },
    { id: 'C', label: T('aircraft.booby.hardpointGroups.i2.label'), kind: 'light', pts: [{ x: 7.8, y: -1.05 }, { x: -7.8, y: -1.05 }] },
    { id: 'D', label: T('aircraft.booby.hardpointGroups.i3.label'), kind: 'belly', playerOnly: true, pts: [{ x: 0.9, y: 1.0 }, { x: -0.9, y: 1.0 }] }
  ],
  /* D（2.4 新增）机腹中线挂 PEJ-14 精确制导炸弹：近距支援机的标准配置，与火箭 / 防区外弹互补 */
  defaultLoadout: { A: 'asl', B: 'rkt', C: 'hdp', D: 'pgb' },
  desc: T('aircraft.booby.desc')
});
