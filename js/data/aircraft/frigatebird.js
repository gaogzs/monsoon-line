Registry.aircraft({
  order: 10,
  id: 'frigatebird',
  model: 'frigatebird',
  name: 'DB-11',
  nick: 'Frigatebird',
  cn: T('aircraft.frigatebird.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 18000,
  role: T('aircraft.frigatebird.role'),
  faction: T('aircraft.frigatebird.faction'),
  planformType: T('aircraft.frigatebird.planformType'),
  // 能力标签：决定它能挂哪些"有门槛"的武器，见下面的 STORE_NEEDS
  caps: ['strike', 'ew'],
  maker: T('aircraft.frigatebird.maker'),
  stats: { spd: 0.72, mob: 0.72, stl: 0.55, fire: 0.70, dur: 0.62, rng: 0.76, ecm: 0.40 },
  phys: { vMax: 510, vMil: 372, vStall: 105, accel: 26, decel: 40, pitch: 0.76, roll: 2.34, yaw: 0.30, hp: 130 },
  gun: 'cel3',
  variableSweep: true,
  maxLoad: 6500,          // 最大挂载重量 kg，超过只会拖慢自己

  /* 挂载点分组。
     pts 是机体系俯视坐标（机头 +y，右翼 +x，单位米），
     同时也是机库俯视识别图上 Group 引线的锚点 —— 单一数据源。
     kind 决定这一组能挂什么，见文件末尾的挂载属性补丁。 */
  hardpointGroups: [
    /* 变后掠翼的活动翼段上不挂东西 —— 挂架得跟着机翼转、还要保持顺气流，
       现实里只有极少数机型这么做，而且代价很大。所以 DB-11 的挂载全在
       机身和固定的翼套（翼根）上：机身前侧一对、翼套下一对、机腹一对。
       早先机身后侧还有一对轻挂（共四组），对一架要上舰的飞机太多了 ——
       其他机型最多三组，舰载机的起降重量更紧，于是剪掉了。 */
    { id: 'A', label: T('aircraft.frigatebird.hardpointGroups.i0.label'), kind: 'light', pts: [{ x: 0.85, y: 2.6 }, { x: -0.85, y: 2.6 }] },
    { id: 'B', label: T('aircraft.frigatebird.hardpointGroups.i1.label'), kind: 'heavy', pts: [{ x: 1.85, y: -0.6 }, { x: -1.85, y: -0.6 }] },
    { id: 'C', label: T('aircraft.frigatebird.hardpointGroups.i2.label'), kind: 'belly', pts: [{ x: 0.45, y: -1.0 }, { x: -0.45, y: -1.0 }] }
  ],
  defaultLoadout: { A: 'srm', B: 'v11', C: 'oep' },
  desc: T('aircraft.frigatebird.desc')
});
