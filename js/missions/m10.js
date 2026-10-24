/* ============================================================
   任务 10 · 登陆窗口

   第一次给出"时限"：下游的两栖船团正在横渡海峡。
   掩护火网五分钟后展开（timeLimit 300 秒）；在那之前不打断它，
   岛上就会多出一个他们不需要谈判的据点。
   ============================================================ */
Registry.mission({
  order: 90,
  id: 'm10',
  no: 'OPERATION 10',
  name: T('missions.m10.name'),
  en: 'THE WINDOW',
  loc: T('missions.m10.loc'),
  date: '2078.04.19 / 1005L',
  altStart: 4800,
  speedStart: 340,
  timeLimit: 300,
  axis: 15,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m10.prose'),

  objectives: [
    T('missions.m10.objectives.i0.s1'),
    T('missions.m10.objectives.i1.s1'),
    T('missions.m10.objectives.i2.s1'),
    T('missions.m10.objectives.i3.s1')
  ],
  threats: [
    T('missions.m10.threats.i0.s1'),
    T('missions.m10.threats.i1.s1'),
    T('missions.m10.threats.i2.s1'),
    T('missions.m10.threats.i3.s1'),
    T('missions.m10.threats.i4.s1'),
    T('missions.m10.threats.i5.s1')
  ],
  intel: T('missions.m10.intel'),
  map: [
    { x: 0, z: -16000, type: 'start', label: T('missions.m10.map.i0.label') },
    { x: 0, z: 13800, type: 'enemy', label: T('missions.m10.map.i1.label') },
    { x: -8000, z: 18000, type: 'enemy', label: T('missions.m10.map.i2.label') },
    { x: 8000, z: 22000, type: 'enemy', label: T('missions.m10.map.i3.label') },
    { x: -10500, z: 11000, type: 'enemy', label: T('missions.m10.map.i4.label') },
    { x: 10500, z: 11000, type: 'enemy', label: T('missions.m10.map.i5.label') },
    { x: 0, z: 38000, type: 'site', label: T('missions.m10.map.i6.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [0], zs: [0, 30000] });
    p.pos = M3.V(0, 4800, -16000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 340;

    spawnWingman(w, 2, -200, 18, -300);
    spawnWingman(w, 3, 200, 18, -300);

    /* 三条登陆舰，排成一列往北走。它们的 route 是**真的航路** ——
       这一关的时间压力来自这里：船在动，而窗口是固定的。 */
    var i;
    for (i = 0; i < 3; i++) {
      spawnShip(w, {
        model: 'seascorpion',
        x: (i - 1) * 2500, z: 12000 + i * 1800, hp: 520,
        route: {
          wp: [{ x: (i - 1) * 2500, z: 12000 + i * 1800 },
            { x: (i - 1) * 2500, z: 40000 + i * 1800 }],
          speed: 8, loop: false
        }
      });
    }

    // 两艘护卫舰
    for (i = 0; i < 2; i++) {
      spawnShip(w, {
        model: 'ammonite',
        x: (i - 0.5) * 16000, z: 18000 + i * 4000, hp: 420,
        route: {
          wp: [{ x: (i - 0.5) * 16000, z: 18000 + i * 4000 },
            { x: (i - 0.5) * 16000, z: 34000 + i * 4000 }],
          speed: 13, loop: false
        },
        weapon: 'dl9', fireCd: 5
      });
    }

    /* 四艘三叶虫快艇在两翼来回穿插 —— 它们是这一关最烦的东西：
       单发反舰弹够不着那么快的目标，而它们会一直贴着你。 */
    for (i = 0; i < 4; i++) {
      var sx = (i < 2) ? -1 : 1;
      spawnShip(w, {
        model: 'trilobite',
        x: sx * (9000 + (i % 2) * 3000), z: 8000 + (i % 2) * 6000, hp: 240,
        route: {
          wp: [{ x: sx * (9000 + (i % 2) * 3000), z: 8000 + (i % 2) * 6000 },
            { x: -sx * (9000 + (i % 2) * 3000), z: 16000 + (i % 2) * 6000 }],
          speed: 20, loop: true
        }
      });
    }

    /* 两架 ROK-27 在船团上空掩护。

       一架挂格斗弹 + SAV-6 吊舱（掩护），一架挂 BOX-14「坍方」反舰弹 ——
       它们不只是来护航的，也会去打你的东西。BOX-14 的 npcFits 是
       ['heavy']，挂在 ROK-27 的内侧 A 组。反舰弹归多用途机，
       不归 GAL-31 那种截击机（早先挂在 GAL-31 上）。 */
    spawnEnemy(w, {
      ac: 'schist',
      x: -2000, y: 8000, z: 20000,
      fwd: M3.V(0, 0, -1),
      special: 'dl6', loadout: 'capPod',
      pods: ['vzu'],
      skill: 0.7, callsign: squadCallsign(49, 1)
    });
    spawnEnemy(w, {
      ac: 'schist',
      x: 3000, y: 8500, z: 22000,
      fwd: M3.V(0, 0, -1),
      special: 'vsr', loadout: 'strikeLead',
      skill: 0.72, callsign: downstreamCallsign(50)
    });

    /* 一架 VAC-14「砂岩」在低空压着登陆船团的头顶。
       A 组挂 TUM-7「碎石」对面弹，B 组挂 BIN-9 自卫。
       （早先是上游的 G-6 挂上游的 PEJ-30。） */
    spawnEnemy(w, {
      ac: 'sandstone',
      x: 6000, y: 2800, z: 26000,
      fwd: M3.V(0, 0, -1),
      special: 'vgt', loadout: 'strike',
      skill: 0.62, callsign: squadCallsign(49, 2)
    });

    w.objective = T('missions.m10.spawn.objective.s1');
    w.objectiveSub = T('missions.m10.spawn.objectiveSub.s1');
    w.dangerAltitude = 2000;
  },

  tick: function (w, dt) {
    var i, landers = 0, escorts = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'seascorpion') landers++; else escorts++;
    }
    var left = Math.max(0, Math.ceil(w.timeLeft));
    w.objectiveSub = T('missions.m10.tick.objectiveSub.s1') + landers + T('missions.m10.tick.objectiveSub.s2') + escorts +
      T('missions.m10.tick.objectiveSub.s3') + left + T('missions.m10.tick.objectiveSub.s4');

    var detected = w.player.pos.y > 2000 && w.player.alive;
    w.detected = detected;

    if (!w.flags.warned && w.timeLeft < 90) {
      w.flags.warned = true;
      w.radio.play('m10', 'windowClosing');
    }
    if (landers === 1 && !w.flags.lastOne) {
      w.flags.lastOne = true;
      w.radio.play('m10', 'lastOne');
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
  lose: function (w) {
    /* 超时（火网展开）由 game.js 的统一分支判负。登陆舰要将近一小时才到滩头，
       时限之内上不了岸，所以这里不再检查登陆点。 */
    return !w.player.alive;
  }
});
