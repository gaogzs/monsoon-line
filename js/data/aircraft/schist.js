/* ============================================================
   下游同盟的制式机（不可驾驶）

   以前它只作为模型键 schist 存在，AIRCRAFT 表里查不到 ——
   于是 makeAircraft() 会静默回退到 AIRCRAFT[0]，
   HUD 上把 ROK-27 标成"DB-11 军舰鸟"。
   现在它有正式条目：npcOnly 让它不出现在机库，
   但资料库和 HUD 都能正确引用它。
   ============================================================ */
Registry.aircraft({
  order: 80,
  id: 'schist',
  name: 'ROK-27', nick: 'Schist', cn: T('aircraft.schist.cn'),
  // 实用升限（米）：AI 不会为了追人硬爬过这里，见 ai.js 的升限段
  ceiling: 15000,
  /* 满操控所需动压 22000 → 18000：升限处（15 km、约 210 m/s）的舵效与升限一致。
     默认值下它在升限只剩 0.20，追高目标爬到 13.5 km 就已经"咬不住也甩不掉"。 */
  ctrlFull: 18000,
  role: T('aircraft.schist.role'),
  faction: T('aircraft.schist.faction'),
  planformType: T('aircraft.schist.planformType'),
  caps: ['strike'],
  // 设计局用中文名，后面备注逻辑语名 —— 型号前缀取的是逻辑语名的缩写
  maker: T('aircraft.schist.maker'),
  npcOnly: true,
  model: 'schist',
  desc: T('aircraft.schist.desc'),
  stats: { spd: 0.64, mob: 0.58, stl: 0.18, fire: 0.68, dur: 0.55, rng: 0.52, ecm: 0.26 },
  phys: { vMax: 520, vMil: 398, vStall: 118, accel: 25, decel: 38, pitch: 0.58, roll: 2.11, yaw: 0.30, hp: 120 },
  gun: 'cel11',
  maxLoad: 4000,
  // 挂点只用于资料库展示；下游弹的 fits 为空，所以 defaultLoadout 留空
  hardpointGroups: [
    { id: 'A', label: T('aircraft.schist.hardpointGroups.i0.label'), kind: 'heavy', pts: [{ x: 2.9, y: -1.0 }, { x: -2.9, y: -1.0 }] },
    { id: 'B', label: T('aircraft.schist.hardpointGroups.i1.label'), kind: 'light', pts: [{ x: 5.2, y: -1.6 }, { x: -5.2, y: -1.6 }] },
    { id: 'C', label: T('aircraft.schist.hardpointGroups.i2.label'), kind: 'light', pts: [{ x: 4.0, y: -1.3 }, { x: -4.0, y: -1.3 }] },
    { id: 'D', label: T('aircraft.schist.hardpointGroups.i3.label'), kind: 'light', pts: [{ x: 6.4, y: -2.6 }, { x: -6.4, y: -2.6 }] }
  ],
  defaultLoadout: {},
  /* 敌机挂载预设（关卡里 `loadout: 'cap'`，见 js/missions/_lib.js 的 spawnEnemy）。
     逐组写、可以留空组、可以同弹多组；下游弹的池只看武器，同弹多挂只增加同时就绪的发数。
       cap         BIN-6 挂 A、B 两对（与开放新挂点之前"special: dl6 自动铺满"一致）
       capMix      DAR-4 + BIN-6
       capPod      只挂 A 的 BIN-6，另有吊舱时由关卡写 pods（吊舱落在最后一个挂得住的组）
       strikeShip  BOX-14 + BIN-6 自卫
       capLead     领队：DAR-4 + BIN-6 分挂到 B、C 两对，池不变
       strikeLead  领队：BOX-14 + BIN-6 分挂到 B、C 两对，池不变 */
  npcLoadouts: {
    cap: { A: 'dl6', B: 'dl6' },
    capMix: { A: 'dl4', B: 'dl6' },
    capPod: { A: 'dl6' },
    capLead: { A: 'dl4', B: 'dl6', C: 'dl6' },
    strikeShip: { A: 'vsr', B: 'dl6' },
    strikeLead: { A: 'vsr', B: 'dl6', C: 'dl6' }
  },
});
