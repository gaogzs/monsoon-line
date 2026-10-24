/* ============================================================
   任务 1 · 第一滴雨
   ============================================================ */
Registry.mission({
  order: 10,
  id: 'm1',
  no: 'OPERATION 01',
  name: T('missions.m1.name'),
  en: 'FIRST RAIN',
  loc: T('missions.m1.loc'),
  date: '2078.03.14 / 0612L',
  altStart: 7600,
  speedStart: 320,
  timeLimit: 0,
  axis: 190,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m1.prose'),

  objectives: [
    T('missions.m1.objectives.i0.s1'),
    T('missions.m1.objectives.i1.s1'),
    T('missions.m1.objectives.i2.s1'),
    T('missions.m1.objectives.i3.s1')
  ],
  threats: [
    T('missions.m1.threats.i0.s1'),
    T('missions.m1.threats.i1.s1'),
    T('missions.m1.threats.i2.s1'),
    T('missions.m1.threats.i3.s1'),
    T('missions.m1.threats.i4.s1')
  ],
  intel: T('missions.m1.intel'),
  map: [
    { x: 0, z: -2000, type: 'start', label: T('missions.m1.map.i0.label') },
    { x: 0, z: 20000, type: 'enemy', label: T('missions.m1.map.i1.label') },
    { x: 9000, z: 12000, type: 'site', label: T('missions.m1.map.i2.label') },
    { x: -3000, z: 30000, type: 'site', label: T('missions.m1.map.i3.label') }
  ],

  /* ---------------- 战场生成 ---------------- */
  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [0], zs: [10000] });
    /* 战场尺度：起飞点与目标编队之间留出约 22 km。
       中距弹的锁定距离是 8–12 km，把编队摆在 8 km 外等于一进任务
       就直接进包线 —— 没有任何进入段可言。 */
    p.pos = M3.V(0, 7600, -2000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 330;

    spawnWingman(w, 2, -220, 30, -320);
    spawnWingman(w, 3, 220, 30, -320);

    /* 上游预警机 J-2「鹈鹕」—— SEXTANT 的载机。
       你听得到他，战场上也能找到他：在后方 34 km 来回盘旋，
       会被干扰机压哑，也会被打下来。 */
    spawnAewc(w, {
      ac: 'pelican', team: 0, label: 'SEXTANT',
      x: 0, y: 6000, z: -34000,
      a: M3.V(8000, 0, -34000), b: M3.V(-8000, 0, -28000)
    });

    // 五个测绘机组，横队拉宽到 1800 m 间距
    var i, x;
    for (i = 0; i < 5; i++) {
      x = (i - 2) * 1800;
      var e = spawnEnemy(w, {
        x: x, y: 8100, z: 20000,
        fwd: M3.V(0, 0, -1),
        speed: 265,
        special: 'dl6', loadout: 'cap',
        skill: 0.32,
        behavior: 'recon',
        callsign: squadCallsign(30, i + 1)
      });
      e.recon = true;
      e.flee = false;
      e.bigTarget = false;
    }

    /* 两架 VAC-14 护航，拉到队形两翼各 3 km。 */
    for (i = 0; i < 2; i++) {
      spawnEnemy(w, {
        ac: 'sandstone',
        x: (i - 0.5) * 5200, y: 8600, z: 20800,
        fwd: M3.V(0, 0, -1),
        speed: 300,
        special: 'vbn', loadout: 'escort',
        skill: 0.40,
        behavior: 'escort',
        escort: true,
        callsign: squadCallsign(31 + i, 1),
        wave: 1
      });
    }

    /* 两架 ROK-27「片岩」从高处压下来 —— 这一关的"意外"。

       带 SAV-6「迷雾」吊舱（挂外侧 B 组，格斗弹在内侧 A 组）：玩家会先看到五个缓慢的测绘回波，
       在咬第一个目标时才发现有人从侧后方上来了。
       设定里"他们在测量，不是在打仗"说的是测绘队 —— 而一支测绘队
       从来不需要自己带保镖。 */
    for (i = 0; i < 2; i++) {
      spawnEnemy(w, {
        ac: 'schist',
        x: (i - 0.5) * 3000, y: 10200, z: 23500,
        fwd: M3.V(0, 0, -1), speed: 360,
        special: 'dl6', loadout: 'capPod',
        pods: ['vzu'],
        skill: 0.62,
        callsign: squadCallsign(31 + i, 2),
        wave: 2
      });
    }

    /* 一架群岛国的 XAMSI Mk.2「潮线」在海面附近游荡。

       它不属于任何一方：政变之后，群岛国那几架飞机挂着四面不同的旗。
       它不攻击谁，只是在那里 —— 而"那里"正好是交战空域的边缘。
       `behavior: 'recon'` 让它在满血时不主动接战，与"它不打架"一致
       （受创之后它才会自卫 —— 一支换了三次旗的空军也是这么反应的）。 */
    spawnEnemy(w, {
      ac: 'tideline', team: 2,
      x: 9000, y: 4200, z: 12000,
      fwd: M3.V(-1, 0, 0), speed: 240,
      special: 'otr', loadout: 'patrol', skill: 0.30,
      behavior: 'recon'
    });

    /* 同一片海面上的群岛国巡逻艇「屿」（屿级 DAPLU），31 米。

       政变之后，「屿」级一共四条，挂着四面不同的旗，其中一条的旗
       被撕掉了一半，一直没人去换。它也是**背景**：退出交战语法，
       玩家锁不到、AI 不认它。 */
    spawnShip(w, {
      model: 'daplu', team: 2, label: T('missions.m1.spawn.label'),
      x: 14000, z: 6000, hp: 260, weapon: null
    });

    w.objective = T('missions.m1.spawn.objective.s1');
    w.objectiveSub = T('missions.m1.spawn.objectiveSub.s1');
    w.flags.killed = 0;
  },

  /* ---------------- 每帧 ---------------- */
  tick: function (w, dt) {
    var i, alive = 0;
    for (i = 0; i < w.actors.length; i++) {
      var e = w.actors[i];
      if (e.team !== 1 || (e.ai && e.ai.escort)) continue;   // 护航不计入目标
      if (e.alive) alive++;
    }
    w.objectiveSub = T('missions.m1.tick.objectiveSub.s1') + alive;

    // 被击中后转为逃离
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive || !a.recon) continue;
      if (a.hp < a.maxHp * 0.75 && !a.flee) {
        a.flee = true;
        a.ai.mode = 'extend';
        a.ai.modeT = 60;
        a.ai.role = 'enemy';
      }
      // 测绘机不主动接战
      if (!a.flee) a.firingAllowed = false;
    }

    // 台词触发
    if (!w.flags.tallyDone && w.time > 6) {
      w.flags.tallyDone = true;
      w.radio.play('m1', 'tally');
    }
    var k = 5 - alive;
    if (k >= 1 && !w.flags['k' + k]) {
      w.flags['k' + k] = true;
      if (k === 1) w.radio.play('m1', 'kill1');
      if (k === 2) w.radio.play('m1', 'kill2');
      if (k === 3) w.radio.play('m1', 'kill3');
    }
    if (!w.flags.lowQ && w.player.q < 11 && w.player.pos.y > 15000 && w.time > 20) {
      w.flags.lowQ = true;
      w.radio.play('m1', 'lowQ');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.ai && a.ai.escort) continue;      // 护航机没打掉也能过关
      return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});
