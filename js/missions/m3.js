/* ============================================================
   任务 3 · 线
   ============================================================ */
Registry.mission({
  order: 30,
  id: 'm3',
  no: 'OPERATION 03',
  name: T('missions.m3.name'),
  en: 'THE LINE',
  loc: T('missions.m3.loc'),
  date: '2078.03.22 / 0740L',
  altStart: 19500,
  speedStart: 520,
  timeLimit: 0,
  axis: 165,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m3.prose'),

  objectives: [
    T('missions.m3.objectives.i0.s1'),
    T('missions.m3.objectives.i1.s1'),
    T('missions.m3.objectives.i2.s1'),
    T('missions.m3.objectives.i3.s1'),
    T('missions.m3.objectives.i4.s1'),
    T('missions.m3.objectives.i5.s1')
  ],
  threats: [
    T('missions.m3.threats.i0.s1'),
    T('missions.m3.threats.i1.s1'),
    T('missions.m3.threats.i2.s1'),
    T('missions.m3.threats.i3.s1'),
    T('missions.m3.threats.i4.s1')
  ],
  intel: T('missions.m3.intel'),
  map: [
    { x: 0, z: -6000, type: 'start', label: T('missions.m3.map.i0.label') },
    { x: 0, z: 15000, type: 'relay', label: T('missions.m3.map.i1.label') },
    { x: 10000, z: 9000, type: 'relay', label: T('missions.m3.map.i2.label') },
    { x: -10000, z: 9000, type: 'relay', label: T('missions.m3.map.i3.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 19500, -6000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 520;
    p.throttle = 0.95;
    p.ab = true;

    spawnWingman(w, 2, -190, 30, -300);
    spawnWingman(w, 3, 190, 30, -300);
    w.wings[2].pos.y = 19500;
    w.wings[3].pos.y = 19500;
    w.wings[2].speed = 500;
    w.wings[3].speed = 500;

    // 调节单元：一个编组（3×3，间距 10 km），播撒机群就在它中间穿行
    var i, j;
    spawnCellField(w, { xs: [0], zs: [9000] });

    /* 八架播撒机，两排四列。

       机体是 GAL-31 的改型：下游能把东西送到 19 公里的只有高峰军工
       那一型（升限 19 000 m）。原来用的是 ROK-27（升限 15 000 m），
       摆在 18 900 m 上，AI 的升限段会一直把它往下压 —— 而"降到
       16 000 以下"恰好就是这一关的投放判据。
       不带任何弹：它是运货的，special: null。

       原来六架挤在 3 km 宽的队形里，玩家一个高速通场就能扫掉一半 ——
       拉成 4 列 × 4.5 km 间距之后，每一次进入只能处理一个窗口。 */
    for (i = 0; i < 8; i++) {
      var sx = (i % 4 - 1.5) * 4500;
      var sz = 15000 + Math.floor(i / 4) * 3000;
      var s = spawnEnemy(w, {
        ac: 'basalt',
        x: sx, y: 18600, z: sz,
        fwd: M3.V(0, 0, -1), speed: 210,
        special: null, skill: 0.25,
        behavior: 'recon',
        callsign: i < 4 ? squadCallsign(5, i + 1) : squadCallsign(6, i - 3)
      });
      s.recon = true;
      s.model = 'sower';
      s.name = T('missions.m3.spawn.name.s1');
      s.phys = { vMax: 280, vMil: 240, vStall: 150, accel: 8, decel: 20, pitch: 0.30, roll: 1.2, yaw: 0.20, hp: 340 };
      s.maxHp = 340; s.hp = 340;
      s.radius = 22;
      s.bigTarget = true;
      s.weaponPod = true;
    }

    /* 下游预警机 ROK-2「石英」。

      它在，下游的中队才像一支军队：由它分配目标、集中火力。
       打掉它，剩下的人就退回各自为战 —— 他们本来也更习惯那样。
       它自己没有任何武器，位置也在战线后方，想打它得先穿过护航。 */
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: T('missions.m3.spawn.label'),
      x: 0, y: 9000, z: 21000,
      a: M3.V(6000, 0, 21000), b: M3.V(-6000, 0, 24000)
    });

    /* 下游随队干扰机 ROK-44「磁石」。

       它不空战：沿固定航线飞进来、开机、掉头走 —— 与轰炸机是同一套
       航线机制（`route`），只是到点之后干的事不同。

       开机那一刻，十二公里内所有人的雷达一起出雪花：玩家的光点会丢、
       僚机会提示数据链中断、预警机会闭嘴。这就是下游教条里
       "先让对手瞎掉，再打"的那一步 —— 而它自己的位置也因此暴露。 */
    var jammer = spawnEnemy(w, {
      ac: 'lodestone',
      /* 磁石的升限是 16 000 m（巨砾的机体）—— 贴着升限飞，在 18–19 km 主战场下方约 3 km。
         以前在 11 000 m，与主战场差 8 km，当时九公里的干扰半径连边都够不到。 */
      x: -9000, y: 15800, z: 21000,
      fwd: M3.V(0, 0, -1), speed: 340,
      special: 'vsc', skill: 0.55,
      // 呼号是村名（设定 8.7）。原来写的「焦炬 TORCH」是它挂的那台吊舱的名字
      callsign: T('missions.m3.spawn.jammer.callsign')
    });
    jammer.route = jammerRoute({
      wp: M3.V(-6000, 0, 11000), hold: M3.V(-10000, 0, 15000), alt: 15800,
      msg: T('missions.m3.spawn.route.msg')
    });

    /* 四架护航，下游的标准搭配：便宜的负责数量，贵的负责质量。

       两架 GAL-31 守在高处（升限 19 000 m，摆在 18–19 km），
       两架 ROK-27 在 15 公里以下托底（它的升限就是 15 000 m）——
       其中一架带 SAV-6 抗锁定吊舱。
       一架群岛国的「浪花」巡逻机在 9 公里处（它的升限是 10 000 m）——
       它不属于下游，但政变之后那座岛上的旗子已经换过三次了。

       每一架的高度都在自己的升限以下：早先 VAC-14（升限 13 000）
       摆在 19 800、浪花摆在 12 000，进场第一帧就被升限段往下压。
       吊舱必须挂在**有 light 或 belly 组**的机型上：SAV-6 的
       npcFits 是 ['light','belly']，ROK-27 挂在 B 组外侧。 */
    var escCs = [squadCallsign(7, 1), squadCallsign(8, 1), squadCallsign(7, 2),
      squadCallsign(8, 2), downstreamCallsign(9)];
    var escorts = [
      { ac: 'basalt', x: -6000, y: 18400, sp: 'dl4', loadout: 'cap', pod: null, sk: 0.62 },
      { ac: 'basalt', x: 6000, y: 18800, sp: 'dl4', loadout: 'cap', pod: null, sk: 0.66 },
      { ac: 'schist', x: -3000, y: 14600, sp: 'dl6', loadout: 'capPod', pod: ['vzu'], sk: 0.66 },
      { ac: 'schist', x: 0, y: 14200, sp: 'dl6', loadout: 'capLead', pod: null, sk: 0.70 },
      { ac: 'spray', team: 2, x: -9000, y: 9200, sp: 'otr', loadout: { A: 'otr' }, pod: null, sk: 0.30 }
    ];
    for (i = 0; i < escorts.length; i++) {
      var es = escorts[i];
      spawnEnemy(w, {
        ac: es.ac,
        team: es.team === undefined ? 1 : es.team,
        x: es.x, y: es.y, z: 13000,
        fwd: M3.V(0, 0, -1),
        /* 不写死 speed：浪花是巡逻机（vMax 340），给它 390 会一直
           骑在包线外。各型按自己的巡航速度进场更省事也更对。 */
        special: es.sp, loadout: es.loadout || null,
        /* 下游的教条是"先让对手瞎掉，再打"（设定集 5.1）——
           编队里永远有一架带干扰吊舱。SAV-6「迷雾」的锁抗让玩家
           更难锁定带它的那一架：想安静地咬它，就得先处理那台吊舱。 */
        pods: es.pod,
        skill: es.sk, callsign: escCs[i]
      });
    }

    w.objective = T('missions.m3.spawn.objective.s1');
    w.objectiveSub = T('missions.m3.spawn.objectiveSub.s1');
    w.flags.aceDone = false;
    w.aceSpawned = false;
  },

  tick: function (w, dt) {
    var i, sowers = 0, planes = 0, cellsAlive = 0;

    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team === 1 && a.alive) {
        if (a.model === 'sower') sowers++; else planes++;
      }
    }
    for (i = 0; i < w.targets.length; i++) {
      if (w.targets[i].model === 'cell' && w.targets[i].alive) cellsAlive++;
    }
    w.objectiveSub = T('missions.m3.tick.objectiveSub.s1') + sowers + T('missions.m3.tick.objectiveSub.s2') + planes + T('missions.m3.tick.objectiveSub.s3') + cellsAlive;

    // 播撒机降到 15000 以下开始投放（失败条件）
    for (i = 0; i < w.actors.length; i++) {
      var s = w.actors[i];
      if (s.alive && s.model === 'sower' && s.pos.y < 16000 && !w.flags.dropped) {
        w.flags.dropped = true;
        w.radio.play('m3', 'bossHit');
      }
    }

    // 播撒机少于 4 架 → 冬港进场
    if (!w.aceSpawned && sowers <= 4) {
      w.aceSpawned = true;
      w.radio.play('m3', 'aceAppears');
      spawnWinterport(w, { x: 500, y: 18600, z: 15000, skill: 0.96 });
    }

    // 王牌血量过半 → 阶段二台词
    if (w.ace && w.ace.alive && !w.flags.aceP2 && w.ace.hp < w.ace.maxHp * 0.5) {
      w.flags.aceP2 = true;
      w.radio.play('m3', 'bossPhase2');
      // 冬港开始向下带
      w.ace.ai.mode = 'pursue';
      w.ace.ai.skill = 1.0;
    }

    // 王牌被击落
    if (w.ace && !w.ace.alive && !w.flags.aceKilled) {
      w.flags.aceKilled = true;
      w.radio.play('m3', 'aceKill');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team === 1 && a.alive) return false;
    }
    return true;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    // 播撒机成功投放并脱离
    var i, escaped = 0;
    for (i = 0; i < w.actors.length; i++) {
      var s = w.actors[i];
      if (s.alive && s.model === 'sower' && s.pos.y < 14000) escaped++;
    }
    return escaped >= 2 && Mission.fail(w, 'm3.sowerEscaped');
  }
});
