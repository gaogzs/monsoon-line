Registry.mission({
  order: 110,
  id: 'sk1',
  no: 'SKIRMISH',
  name: T('missions.sk1.name'),
  en: 'THE FOURTH WEEK',
  loc: T('missions.sk1.loc'),
  date: T('missions.sk1.date'),
  altStart: 6000,
  speedStart: 350,
  timeLimit: 0,
  axis: 180,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.sk1.prose'),

  objectives: [
    T('missions.sk1.objectives.i0.s1'),
    T('missions.sk1.objectives.i1.s1'),
    T('missions.sk1.objectives.i2.s1'),
    T('missions.sk1.objectives.i3.s1')
  ],
  threats: [
    T('missions.sk1.threats.i0.s1'),
    T('missions.sk1.threats.i1.s1'),
    T('missions.sk1.threats.i2.s1')
  ],
  intel: T('missions.sk1.intel'),
  map: [
    { x: 0, z: -6000, type: 'start', label: T('missions.sk1.map.i0.label') },
    { x: 0, z: 14000, type: 'site', label: T('missions.sk1.map.i1.label') },
    { x: -12000, z: 8000, type: 'site', label: T('missions.sk1.map.i2.label') },
    { x: 12000, z: 8000, type: 'site', label: T('missions.sk1.map.i3.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [-15000, 15000], zs: [-15000, 15000] });
    p.pos = M3.V(0, 6000, -6000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 350;

    spawnWingman(w, 2, -200, 24, -300);
    spawnWingman(w, 3, 200, 24, -300);

    // 上游预警机在远处看着 —— 这里唯一的"体系"
    spawnAewc(w, {
      ac: 'pelican', team: 0, label: 'SEXTANT',
      x: 0, y: 7000, z: -30000,
      a: M3.V(9000, 0, -30000), b: M3.V(-9000, 0, -25000)
    });

    /* 群岛国的一架「潮线」在海面附近游荡 —— 背景，team 2。
       早先它被放进敌方机型池（team 1），于是"不明回波"成了下游的僚机。 */
    spawnEnemy(w, {
      ac: 'tideline', team: 2,
      x: -9000, y: 3800, z: 9000,
      fwd: M3.V(1, 0, 0), speed: 240,
      special: 'otr', loadout: 'patrol', skill: 0.30,
      behavior: 'recon'
    });

    /* 六个批次，一次性掷骰。

       机型池只放**下游战机**（team 1 就是下游）：早先池里混着上游的
       F-9 / D-21 / D-33 和群岛国的潮线 —— 这里的敌人是下游的巡逻队。
       ROK-27 写两次：它是下游的主力，出现得最多。
       每型配自己的制式弹（SK_FITS），不再一律 dl6。
       数量随批次递增（2→6），技能与高度也随机。 */
    var pool = ['schist', 'schist', 'basalt', 'sandstone'];
    var queue = [];
    for (var b = 0; b < 6; b++) {
      var n = 2 + Math.floor(b * 0.8);            // 2,2,3,4,5,6
      var brg = M3.rnd(0, Math.PI * 2);           // 进场方位
      var spec = [];
      for (var k = 0; k < n; k++) {
        spec.push({
          ac: M3.pick(pool),
          skill: M3.rnd(0.45, 0.85),
          alt: M3.rnd(3500, 9000),
          off: M3.rnd(-2500, 2500)
        });
      }
      batchCallsigns(spec, 60 + b * 8);
      queue.push({ list: spec, bearing: brg, spawnT: 0, spawned: false });
    }
    w.skQueue = queue;
    w.skBatch = -1;          // 当前批次下标（-1 = 尚未开始）

    w.objective = T('missions.sk1.spawn.objective.s1');
    w.objectiveSub = T('missions.sk1.spawn.objectiveSub.s1');
  },

  tick: function (w, dt) {
    var q = w.skQueue;
    if (!q) return;

    /* 队列推进完全由这里读，不掷骰：上一批全灭 → 冷却 → 放下一批。
       冷却给了玩家一点收拾编队的时间，也让"6 批"听起来不是一口气。 */
    if (!w.flags.skCool) w.flags.skCool = 0;
    if (w.flags.skCool > 0) w.flags.skCool -= dt;

    var alive = 0, i;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team === 1 && a.alive) alive++;
    }

    var pending = false;
    for (i = 0; i < q.length; i++) if (!q[i].spawned) { pending = true; break; }

    if (w.skBatch < 0) {
      // 开局先歇几秒
      w.flags.skCool -= 0;      // 已在上面的递减里
      if (w.time > 3) { w.skBatch = 0; }
    } else if (alive === 0 && w.flags.skCool <= 0) {
      var next = w.skBatch + 1;
      if (next < q.length && !q[next].spawned) w.skBatch = next;
    }

    // 投放当前批次
    var bat = q[w.skBatch];
    if (bat && !bat.spawned) {
      bat.spawned = true;
      var dist = 16000;
      var fx = Math.sin(bat.bearing) * dist;
      var fz = Math.cos(bat.bearing) * dist;
      // 进场方向：朝原点
      var fl = Math.sqrt(fx * fx + fz * fz) || 1;
      var fwd = M3.V(-fx / fl, 0, -fz / fl);
      for (i = 0; i < bat.list.length; i++) {
        var e = bat.list[i];
        // 侧向错开，避免叠在一起
        var px = fx + Math.cos(bat.bearing) * e.off;
        var pz = fz - Math.sin(bat.bearing) * e.off;
        var foe = spawnEnemy(w, {
          ac: e.ac,
          x: px, y: e.alt, z: pz,
          fwd: fwd, speed: M3.rnd(280, 380),
          special: SK_FITS[e.ac].sp, loadout: SK_FITS[e.ac].lo,
          skill: e.skill,
          callsign: e.cs
        });
        foe.wave = w.skBatch + 1;
      }
      w.flags.skCool = 6;       // 下一批的间隔
      if (w.radio) w.radio.raw({
        who: 'SEXTANT', cls: 'cmd',
        tx: T('missions.sk1.tick.tx.s1') + (w.skBatch + 1) + T('missions.sk1.tick.tx.s2'), gap: 0.8
      });
    }

    var spawned = 0;
    for (i = 0; i < q.length; i++) if (q[i].spawned) spawned++;
    w.objectiveSub = T('missions.sk1.tick.objectiveSub.s1') + spawned + '/6' + (alive ? T('missions.sk1.tick.objectiveSub.s2') + alive : '');
  },

  win: function (w) {
    var q = w.skQueue, i;
    if (!q) return false;
    for (i = 0; i < q.length; i++) if (!q[i].spawned) return false;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});
