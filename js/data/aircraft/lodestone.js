Registry.aircraft({
  order: 170,
  id: 'lodestone',
  // 下游的电子战机。石林拿 ROK-40 巨砾的机体改的，机腹塞一台烧穿吊舱。
  // 升限与母型同为 16 000 m；曾经写作 GAL-44（高峰军工）、升限 14 000 m。
  name: 'ROK-44', nick: 'Lodestone', cn: T('aircraft.lodestone.cn'),
  ceiling: 16000,
  // 机炮抗性（小口径航炮伤害减免比例），见 entities.js 的 gunResistK
  gunResist: 0.05,
  role: T('aircraft.lodestone.role'),
  faction: T('aircraft.lodestone.faction'),
  planformType: T('aircraft.lodestone.planformType'),            // 巨砾的机体，平直翼
  caps: ['ew'],
  maker: T('aircraft.lodestone.maker'),
  npcOnly: true,
  model: 'boulder',
  desc: T('aircraft.lodestone.desc'),
  stats: { spd: 0.34, mob: 0.12, stl: 0.06, fire: 0.05, dur: 0.88, rng: 0.72, ecm: 0.56 },
  phys: { vMax: 390, vMil: 330, vStall: 122, accel: 14, decel: 30, pitch: 0.40, roll: 1.17, yaw: 0.22, hp: 260 },
  /* 没有机炮：设定写明"它不参加空战"，机体又是 ROK-40 轰炸机改的
     （ROK-40 同样 gun: null）。早先挂着 cel11，于是会凑上去跟人对射。 */
  gun: null,
  maxLoad: 0,
  hardpointGroups: [
    /* 机腹干扰吊舱。hy 是这架飞机的机腹下表面（-2.60 m）再减一点余量 ——
       默认的 belly 高度 -1.95 是按战斗机定的，在这架 12 米高的机身上
       等于把吊舱塞进机身里，图上完全看不见。 */
    { id: 'A', label: T('aircraft.lodestone.hardpointGroups.i0.label'), kind: 'belly', hy: -3.00,
      pts: [{ x: 1.2, y: -2.0 }, { x: -1.2, y: -2.0 }] }
  ],
  defaultLoadout: {}
});
