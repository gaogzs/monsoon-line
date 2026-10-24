/* ============================================================
   任务 4 · 空白海域

   战役的性质在这里第一次改变：下游发现打不下来那个中队，
   于是转向让那片海无法使用。舰船是这一关的主角。
   ============================================================ */
Registry.mission({
  order: 40,
  id: 'm4',
  no: 'OPERATION 04',
  name: T('missions.m4.name'),
  en: 'OPEN WATER',
  loc: T('missions.m4.loc'),
  date: '2078.03.27 / 1430L',
  altStart: 5200,
  speedStart: 360,
  timeLimit: 0,
  axis: 225,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m4.prose'),

  objectives: [
    T('missions.m4.objectives.i0.s1'),
    T('missions.m4.objectives.i1.s1'),
    T('missions.m4.objectives.i2.s1'),
    T('missions.m4.objectives.i3.s1'),
    T('missions.m4.objectives.i4.s1')
  ],
  threats: [
    T('missions.m4.threats.i0.s1'),
    T('missions.m4.threats.i1.s1'),
    T('missions.m4.threats.i2.s1'),
    T('missions.m4.threats.i3.s1'),
    T('missions.m4.threats.i4.s1')
  ],
  intel: T('missions.m4.intel'),
  map: [
    { x: 0, z: -18000, type: 'start', label: T('missions.m4.map.i0.label') },
    { x: 0, z: 16000, type: 'enemy', label: T('missions.m4.map.i1.label') },
    { x: -14000, z: 12000, type: 'enemy', label: T('missions.m4.map.i2.label') },
    { x: 13000, z: 13000, type: 'enemy', label: T('missions.m4.map.i3.label') },
    { x: 20000, z: 9000, type: 'enemy', label: T('missions.m4.map.i4.label') },
    { x: -6000, z: 24000, type: 'enemy', label: T('missions.m4.map.i5.label') },
    { x: -26000, z: 11000, type: 'sam', label: T('missions.m4.map.i6.label') },
    { x: 26000, z: 11000, type: 'sam', label: T('missions.m4.map.i7.label') },
    { x: 0, z: -11000, type: 'base', label: T('missions.m4.map.i8.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [-15000, 15000], zs: [10000] });
    p.pos = M3.V(0, 5200, -18000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 360;

    spawnWingman(w, 2, -200, 20, -300);
    spawnWingman(w, 3, 200, 20, -300);

    /* 下游水面编队 —— 这一关的目标。

       房角石级是核心：312 个垂发井装的是对海齐射，不是防空 ——
       它自己只有两座近防炮（weapon: null）。防空圈是周围画的：
       邓氏鱼与两条菊石都带 BAD-9 舰空弹（SHIPS 表的 arms）。
       想打武库舰，得先穿过它们。 */
    spawnShip(w, {
      model: 'cameroceras', callsign: NAVAL_NAMED.cameroceras1,
      x: 0, z: 16000, hp: 1800,
      weapon: null
    });
    spawnShip(w, {
      model: 'dunkleosteus', callsign: NAVAL_NAMED.dunkCmd,
      x: -14000, z: 12000, hp: 900, weapon: 'dl9', fireCd: 4,
      route: { wp: [{ x: -14000, z: 12000 }, { x: -14000, z: 24000 }], speed: 14, loop: true }
    });
    spawnShip(w, {
      model: 'ammonite',
      x: 13000, z: 13000, hp: 420, weapon: 'dl9',
      route: { wp: [{ x: 13000, z: 13000 }, { x: 24000, z: 6000 }], speed: 14, loop: true }
    });
    spawnShip(w, {
      model: 'ammonite',
      x: 20000, z: 9000, hp: 420, weapon: 'dl9'
    });
    spawnShip(w, {
      model: 'trilobite',
      x: -6000, z: 24000, hp: 240,
      route: { wp: [{ x: -6000, z: 24000 }, { x: 12000, z: 26000 }], speed: 20, loop: true }
    });

    // 两座雷达浮台（这片是纯海域，没有"岸"）
    var radars = [
      { x: -26000, z: 11000 }, { x: 26000, z: 11000 }
    ];
    for (var i = 0; i < radars.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'radar', label: T('missions.m4.spawn.label'),
        x: radars[i].x, y: 0, z: radars[i].z,
        hp: 220, radius: 10, ground: true, value: 200
      });
    }

    /* 我方护卫舰 —— 海豚级，编队里跑腿的那一条。

       team: 0 必须显式写：漏了的话它会进玩家的锁定循环，
       也会被下游带对地弹的飞机当成目标（ai.js 的面目标判据）。 */
    spawnShip(w, {
      model: 'dolphin', team: 0,
      x: 0, z: -11000, hp: 600, weapon: 'ss6', fireCd: 8   // 舰空弹 ×8：自卫级
    });

    /* 下游的空中掩护：三架，各带一件真的会去炸海面的东西。

       全是下游自己的弹：BOX-14「坍方」反舰弹是重挂专属（npcFits 只有
       heavy），挂在两架 ROK-27 的内侧 A 组；VAC-14 的 A 组挂 TUM-7
       「碎石」、外侧 B 组挂 BIN-9 自卫。早先这里飞的是上游的 DB-11
       与贼鸥，挂的也是上游的 SPO-6 / SPO-22。

       这一关里"海面上有什么"从此是双向的：你打他们的船，
       他们的飞机打你的船。 */
    spawnEnemy(w, {
      ac: 'schist', team: 1,
      x: 8000, y: 6000, z: 22000,
      fwd: M3.V(0, 0, -1), speed: 380,
      special: 'vsr', loadout: 'strikeLead',
      skill: 0.68,
      callsign: squadCallsign(10, 1)
    });
    spawnEnemy(w, {
      ac: 'schist', team: 1,
      x: 11000, y: 5200, z: 24000,
      fwd: M3.V(0, 0, -1), speed: 380,
      special: 'vsr', loadout: 'strikeShip',
      skill: 0.62,
      callsign: downstreamCallsign(11)
    });
    spawnEnemy(w, {
      ac: 'sandstone',
      x: -9000, y: 5500, z: 25000,
      fwd: M3.V(0, 0, -1), speed: 340,
      special: 'vgt', loadout: 'strike',
      skill: 0.64,
      callsign: squadCallsign(10, 2)
    });

    /* 三条不属于任何交战方的船。

       它们不是"中立目标"，是**海面本身**：南回契约的重货船（一个月
       两次，先卸上游的备件再卸下游的传感器）、高纬联合的水文调查船
       （采水、采沉积柱）、环外共同体的观察船（把天线架到尽可能高，
       记录，然后发回去）。

       `team: 2` 让它们退出交战语法：玩家锁不到（cycleTarget 只收 team 1），
       下游带对地弹的飞机也不认它们（ai.js 的 nearestSurfaceTarget 跳过
       team > 1）。这片海上的每一条商船都不该因为挡在编队中间而被顺手打掉。 */
    spawnShip(w, {
      model: 'cross', team: 2, label: T('missions.m4.spawn.label_2'),
      x: -16000, z: -8000, hp: 900, weapon: null,
      route: { wp: [{ x: -16000, z: -8000 }, { x: -24000, z: 6000 }], speed: 10, loop: true }
    });
    spawnShip(w, {
      model: 'icecore', team: 2, label: T('missions.m4.spawn.label_3'),
      x: 18000, z: -12000, hp: 500, weapon: null,
      route: { wp: [{ x: 18000, z: -12000 }, { x: 8000, z: -18000 }], speed: 8, loop: true }
    });
    spawnShip(w, {
      model: 'atoll', team: 2, label: T('missions.m4.spawn.label_4'),
      x: -20000, z: 20000, hp: 320, weapon: null
    });

    w.objective = T('missions.m4.spawn.objective.s1');
    w.objectiveSub = T('missions.m4.spawn.objectiveSub.s1');
    w.dangerAltitude = 2600;
    w.flags.shipLost = false;
  },

  tick: function (w, dt) {
    var i, ships = 0, radars = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'radar') radars++; else ships++;
    }
    w.objectiveSub = T('missions.m4.tick.objectiveSub.s1') + ships + T('missions.m4.tick.objectiveSub.s2') + radars;

    // 被下游编队雷达照射
    var detected = w.player.pos.y > 2600 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m4', 'spotted');
    }

    // 武库舰挨打 → 台词
    var hub = null;
    for (i = 0; i < w.targets.length; i++) {
      if (w.targets[i].model === 'cameroceras') hub = w.targets[i];
    }
    if (hub && hub.alive && hub.hp < hub.maxHp * 0.6 && !w.flags.hubHit) {
      w.flags.hubHit = true;
      w.radio.play('m4', 'hubHit');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1) return false;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});
