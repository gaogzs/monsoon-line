/* ============================================================
   任务 7 · 雾里

   没有夜战渲染，所以"夜里"这件事靠别的东西表达：
   低云、低空、以及"一开机就被看见"的雷达暴露。
   ============================================================ */
Registry.mission({
  order: 70,
  id: 'm7',
  no: 'OPERATION 07',
  name: T('missions.m7.name'),
  en: 'IN THE FOG',
  loc: T('missions.m7.loc'),
  date: '2078.04.09 / 2340L',
  altStart: 2200,
  speedStart: 330,
  timeLimit: 0,
  axis: 215,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m7.prose'),

  objectives: [
    T('missions.m7.objectives.i0.s1'),
    T('missions.m7.objectives.i1.s1'),
    T('missions.m7.objectives.i2.s1'),
    T('missions.m7.objectives.i3.s1')
  ],
  threats: [
    T('missions.m7.threats.i0.s1'),
    T('missions.m7.threats.i1.s1'),
    T('missions.m7.threats.i2.s1'),
    T('missions.m7.threats.i3.s1')
  ],
  intel: T('missions.m7.intel'),
  map: [
    { x: 0, z: -14000, type: 'start', label: T('missions.m7.map.i0.label') },
    { x: -2000, z: 12000, type: 'enemy', label: T('missions.m7.map.i1.label') },
    { x: 8000, z: 16000, type: 'enemy', label: T('missions.m7.map.i2.label') },
    { x: -9000, z: 24000, type: 'relay', label: T('missions.m7.map.i3.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [0], zs: [-15000, 15000] });
    p.pos = M3.V(0, 2200, -14000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 330;

    spawnWingman(w, 2, -180, 12, -280);
    spawnWingman(w, 3, 180, 12, -280);

    /* 巡洋舰在正面画防空圈 —— 邓氏鱼（邓氏鱼级），下游唯一的巡洋舰。
       原来这里放的是房角石（房角石级），而它是武库舰，不是巡洋舰；
       "96 单元垂发"则是上游抹香鲸的数字。 */
    spawnShip(w, {
      model: 'dunkleosteus', callsign: NAVAL_NAMED.dunkCmd,
      x: -2000, z: 12000, hp: 1600,
      route: { wp: [{ x: -2000, z: 12000 }, { x: 6000, z: 14000 }], speed: 13, loop: true },
      weapon: 'dl9', fireCd: 4
    });

    /* 两条登陆舰 —— 这一关的目标。它们武装薄弱，跑得也慢。 */
    spawnShip(w, {
      model: 'seascorpion',
      x: 8000, z: 16000, hp: 500,
      route: { wp: [{ x: 8000, z: 16000 }, { x: -2000, z: 18000 }], speed: 9, loop: true }
    });
    spawnShip(w, {
      model: 'seascorpion',
      x: 11000, z: 14000, hp: 500,
      route: { wp: [{ x: 11000, z: 14000 }, { x: 2000, z: 12000 }], speed: 9, loop: true }
    });

    // 干扰机
    var jammer = spawnEnemy(w, {
      ac: 'lodestone',
      x: -9000, y: 7000, z: 24000,
      fwd: M3.V(0, 0, -1), speed: 320,
      special: 'vsc', skill: 0.5,
      // 「灰烬」是第 3 关播撒机的级名，不能再拿来当呼号
      callsign: T('missions.m7.spawn.jammer.callsign')
    });
    jammer.route = jammerRoute({
      wp: M3.V(-6000, 0, 14000), hold: M3.V(-10000, 0, 19000), alt: 7000,
      msg: T('missions.m7.spawn.route.msg')
    });

    // 一架夜间巡逻的片岩
    spawnEnemy(w, {
      ac: 'schist',
      x: 14000, y: 5000, z: 20000,
      fwd: M3.V(0, 0, -1), speed: 320,
      special: 'dl6', loadout: 'cap', skill: 0.5,
      callsign: downstreamCallsign(35)
    });

    w.objective = T('missions.m7.spawn.objective.s1');
    w.objectiveSub = T('missions.m7.spawn.objectiveSub.s1');
    w.dangerAltitude = 1500;
  },

  tick: function (w, dt) {
    var i, landers = 0, cruisers = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'seascorpion') landers++;
      else cruisers++;
    }
    w.objectiveSub = T('missions.m7.tick.objectiveSub.s1') + landers + T('missions.m7.tick.objectiveSub.s2') + cruisers +
      T('missions.m7.tick.objectiveSub.s3') + Math.round(w.player.pos.y) + ' m';

    var detected = w.player.pos.y > 1500 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m7', 'spotted');
    }
    if (landers === 0 && !w.flags.landersDown) {
      w.flags.landersDown = true;
      w.radio.play('m7', 'landersDown');
    }
  },

  win: function (w) {
    var i, landers = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'seascorpion') landers++;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return landers === 0;
  },
  lose: function (w) { return !w.player.alive; }
});
