/* ============================================================
   任务 12 · 指挥所

   压轴：把下游的指挥链从中间摘掉。
   预警机调度、巡洋舰指挥、以及那个用活地名做呼号的人。
   ============================================================ */
Registry.mission({
  order: 100,
  id: 'm12',
  no: 'OPERATION 12',
  name: T('missions.m12.name'),
  en: 'COMMAND POST',
  loc: T('missions.m12.loc'),
  date: '2078.04.25 / 0550L',
  altStart: 17000,
  speedStart: 480,
  timeLimit: 0,
  axis: 140,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m12.prose'),

  objectives: [
    T('missions.m12.objectives.i0.s1'),
    T('missions.m12.objectives.i1.s1'),
    T('missions.m12.objectives.i2.s1'),
    T('missions.m12.objectives.i3.s1')
  ],
  threats: [
    T('missions.m12.threats.i0.s1'),
    T('missions.m12.threats.i1.s1'),
    T('missions.m12.threats.i2.s1'),
    T('missions.m12.threats.i3.s1'),
    T('missions.m12.threats.i4.s1')
  ],
  intel: T('missions.m12.intel'),
  map: [
    { x: 0, z: -18000, type: 'start', label: T('missions.m12.map.i0.label') },
    { x: 0, z: 18000, type: 'enemy', label: T('missions.m12.map.i1.label') },
    { x: -12000, z: 14000, type: 'enemy', label: T('missions.m12.map.i2.label') },
    { x: 12000, z: 14000, type: 'enemy', label: T('missions.m12.map.i3.label') },
    { x: 0, z: 34000, type: 'site', label: T('missions.m12.map.i4.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [-15000, 15000], zs: [0, 30000] });
    p.pos = M3.V(0, 17000, -18000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 480;
    p.throttle = 0.95;
    p.ab = true;

    spawnWingman(w, 2, -220, 28, -320);
    spawnWingman(w, 3, 220, 28, -320);
    w.wings[2].pos.y = 17000;
    w.wings[3].pos.y = 17000;

    /* 指挥舰：邓氏鱼（邓氏鱼级），下游分水编队的旗舰（SHIPS 表的 role）。
       它带 8 发 BAD-9 舰空弹 —— 只够自保，够不到一万七千米的你；
       真正的防空靠护航与预警机，所以它是一个"必须在护航被撕开、
       自己降下来之后才能碰到"的目标。
       早先这里写的是房角石（房角石级，武库舰）。 */
    spawnShip(w, {
      model: 'dunkleosteus', callsign: NAVAL_NAMED.dunkCmd,
      x: 0, z: 18000, hp: 2000, weapon: 'dl9', fireCd: 5
    });

    // 两层护航
    var i;
    for (i = 0; i < 6; i++) {
      var inner = (i < 3);
      var heavy = (i % 2 === 0);
      spawnEnemy(w, {
        ac: heavy ? 'basalt' : 'schist',
        x: (inner ? -12000 : 12000) + (i % 3 - 1) * 3000,
        y: heavy ? 16500 : 14000,
        z: 14000 + (i % 3) * 2500,
        fwd: M3.V(0, 0, -1),
        special: heavy ? 'dl4' : 'dl6',
        loadout: heavy ? 'cap' : 'capPod',
        pods: heavy ? null : ['vzu'],
        skill: 0.68 + (i > 3 ? 0.08 : 0),
        callsign: squadCallsign(51 + Math.floor(i / 2), (i % 2) + 1)
      });
    }

    // 预警机
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: T('missions.m12.spawn.label'),
      x: 0, y: 11000, z: 34000,
      a: M3.V(8000, 0, 34000), b: M3.V(-8000, 0, 37000)
    });

    /* 冬港。与第 3 关同一架 GAL-31（见 spawnWinterport），
       起始高度比玩家高一层、压在升限以下。
       skill 0.98 意味着他几乎不犯决策错误。 */
    spawnWinterport(w, { x: 2000, y: 18600, z: 26000, skill: 0.98 });

    w.objective = T('missions.m12.spawn.objective.s1');
    w.objectiveSub = T('missions.m12.spawn.objectiveSub.s1');
  },

  tick: function (w, dt) {
    var i, aews = 0, ships = 0, escorts = 0;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.aewc) aews++;
      else if (!a.isAce) escorts++;
    }
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'dunkleosteus') ships++;
    }
    w.objectiveSub = T('missions.m12.tick.objectiveSub.s1') + aews + T('missions.m12.tick.objectiveSub.s2') + ships +
      T('missions.m12.tick.objectiveSub.s3') + escorts + T('missions.m12.tick.objectiveSub.s4') + (w.ace && w.ace.alive ? T('missions.m12.tick.objectiveSub.s5') : T('missions.m12.tick.objectiveSub.s6'));

    if (!w.flags.contact && w.time > 5) {
      w.flags.contact = true;
      w.radio.play('m12', 'contact');
    }
    // 预警机被打掉 → 下游各机失去调度
    if (aews === 0 && !w.flags.aewDown) {
      w.flags.aewDown = true;
      w.radio.play('m12', 'aewDown');
    }
    // 指挥舰被打掉 → 下游开始撤
    if (ships === 0 && !w.flags.cpDown) {
      w.flags.cpDown = true;
      w.radio.play('m12', 'cpDown');
    }
    // 冬港血量过半 → 阶段二
    if (w.ace && w.ace.alive && !w.flags.aceP2 && w.ace.hp < w.ace.maxHp * 0.5) {
      w.flags.aceP2 = true;
      w.radio.play('m12', 'bossPhase2');
      w.ace.ai.mode = 'pursue';
      w.ace.ai.skill = 1.0;
    }
    if (w.ace && !w.ace.alive && !w.flags.aceKilled) {
      w.flags.aceKilled = true;
      w.radio.play('m12', 'aceKill');
    }
  },

  win: function (w) {
    var i;
    if (w.ace && w.ace.alive) return false;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'dunkleosteus') return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});
