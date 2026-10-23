/* ============================================================
   任务 5 · 静默的航标

   打"会说话的东西"：雷达、干扰机、预警机。舰体不是目标 ——
   一艘不说话的战舰在空情图上等于不存在。
   ============================================================ */
Registry.mission({
  order: 50,
  id: 'm5',
  no: 'OPERATION 05',
  name: T('missions.m5.name'),
  en: 'SILENT BEACONS',
  loc: T('missions.m5.loc'),
  date: '2078.03.31 / 0410L',
  altStart: 9000,
  speedStart: 400,
  timeLimit: 0,
  axis: 175,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m5.prose'),

  objectives: [
    T('missions.m5.objectives.i0.s1'),
    T('missions.m5.objectives.i1.s1'),
    T('missions.m5.objectives.i2.s1'),
    T('missions.m5.objectives.i3.s1'),
    T('missions.m5.objectives.i4.s1')
  ],
  threats: [
    T('missions.m5.threats.i0.s1'),
    T('missions.m5.threats.i1.s1'),
    T('missions.m5.threats.i2.s1'),
    T('missions.m5.threats.i3.s1'),
    T('missions.m5.threats.i4.s1')
  ],
  intel: T('missions.m5.intel'),
  map: [
    { x: 0, z: -16000, type: 'start', label: T('missions.m5.map.i0.label') },
    { x: -9000, z: 12000, type: 'sam', label: T('missions.m5.map.i1.label') },
    { x: 9000, z: 12000, type: 'sam', label: T('missions.m5.map.i2.label') },
    { x: 0, z: 22000, type: 'sam', label: T('missions.m5.map.i3.label') },
    { x: -4000, z: 8000, type: 'relay', label: T('missions.m5.map.i4.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    var cellGroups = spawnCellField(w, { xs: [-15000, 15000], zs: [5000, 35000] });
    p.pos = M3.V(0, 9000, -16000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 400;

    spawnWingman(w, 2, -220, 24, -320);
    spawnWingman(w, 3, 220, 24, -320);

    // 三座对空雷达站
    var radars = [
      { x: -9000, z: 12000 }, { x: 9000, z: 12000 }, { x: 0, z: 22000 }
    ];
    for (var i = 0; i < radars.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'radar', label: T('missions.m5.spawn.label'),
        x: radars[i].x, y: 0, z: radars[i].z,
        hp: 260, radius: 12, ground: true, value: 220
      });
    }

    // 两套远程防空阵地
    var sams = [{ x: -5000, z: 6000 }, { x: 5000, z: 9000 }];
    for (i = 0; i < sams.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'sam', label: T('missions.m5.spawn.label_2'),
        x: sams[i].x, y: 0, z: sams[i].z,
        hp: 110, radius: 6, ground: true,
        fireCd: M3.rnd(2, 6), weapon: 'dl9', value: 180
      });
    }

    /* 管理局的布缆船「准绳」—— 中立，不能打，也躲不开。

       team: 2，与同属管理局的「标杆」一致：管理局是中立方，不是上游。
       原来写 team: 0，等于把它算成**上游的**船 —— 下游带对面弹的飞机
       会把它当目标（ai.js 的 nearestSurfaceTarget 只跳过 team > 1）。
       team 2 退出交战语法：玩家锁不到，AI 不认它。
       friendlyAsset：玩家误伤要扣分 —— 简报里"误击将失去上游信用"的落点。 */
    var skori = spawnShip(w, {
      model: 'skori', team: 2, label: T('missions.m5.spawn.skori.label'),
      x: -4000, z: 8000, hp: 700, weapon: null
    });
    skori.friendlyAsset = true;

    /* 下游随队干扰机 ROK-44「磁石」。
       沿航线飞进来、开机、掉头走 —— 与轰炸机是同一套 route 机制。 */
    var jammer = spawnEnemy(w, {
      ac: 'lodestone',
      x: -14000, y: 11000, z: 24000,
      fwd: M3.V(0, 0, -1), speed: 340,
      special: 'vsc', skill: 0.55,
      callsign: T('missions.m5.spawn.jammer.callsign')
    });
    jammer.route = jammerRoute({
      wp: M3.V(-6000, 0, 11000), hold: M3.V(-11000, 0, 16000), alt: 11000,
      msg: T('missions.m5.spawn.route.msg')
    });

    // 截击编队
    for (i = 0; i < 3; i++) {
      var heavy = (i === 0);
      spawnEnemy(w, {
        ac: heavy ? 'basalt' : 'schist',
        x: -4000 + i * 4000, y: heavy ? 13000 : 7000, z: 26000,
        fwd: M3.V(0, 0, -1),
        special: heavy ? 'dl4' : 'dl6',
        loadout: heavy ? { A: 'dl4', B: 'vbn' } : null,
        skill: 0.58, callsign: i === 2 ? downstreamCallsign(13) : squadCallsign(12, i + 1)
      });
    }

    /* 一架 ROK-40 在防线后方过境，翼下重挂点挂两枚 BOX-14「坍方」。

       它不来找你，也不空战（轰炸机不做规避）：沿航线从网的背后
       横穿过去，目标是网**外面**的上游补给线（不在这张图上），
       到点之后掉头回南边。它是一个**会自己走掉**的机会目标 ——
       赶在它离场前打掉，那两枚弹就不会落到补给船上。
       原来它挂的是上游的 GUT-30，且没有航线，于是被当成战斗机去缠斗。 */
    var cruise = spawnEnemy(w, {
      ac: 'boulder',
      x: 12000, y: 12000, z: 34000,
      fwd: M3.V(-1, 0, 0), speed: 250,
      special: 'vsr', loadout: { B: 'vsr' },
      skill: 0.4, callsign: downstreamCallsign(14)
    });
    cruise.bigTarget = true;
    cruise.route = Route.plan([
      { do: 'goto', wp: M3.V(-14000, 0, 18000), alt: 12000, arrive: 2500 },
      { do: 'call', fn: function (a, w2) {
        if (w2 && w2.radio) {
          w2.radio.raw({
            who: 'SEXTANT', cls: 'cmd',
            tx: T('missions.m5.spawn.route.i1.fn.tx'), gap: 0.9
          });
        }
      } },
      { do: 'egress', wp: M3.V(-20000, 0, 40000), alt: 12000 }
    ]);

    /* 调节场管理局自己的高空勤务机 MERLI「水准」。

       它不打架：任务是沿着编组逐个巡视、检查调节单元的状态 ——
       所以它的航线就是这一关头顶那几个编组的中心，蛇形串起来，
       飞完一圈从头再来（ai.js updateRoute 的 wps 分支）。
       巡视高度压在各组基准高度以下 1.5 km：从下方仰视检查，
       也不会一头钻进单元里。

       **不挂武器**：它的挂载组只有机腹一个（belly），而机腹挂不了
       任何空空弹（可用的适配都是 tip / light / heavy）—— 这恰好与
       设定里那句"名义上没有武器"一致，也省掉了"AI 拿着不在机翼上的
       弹开火"那种看不见的错误。
       `behavior: 'recon'` 让它在满血时不主动接战（见 ai.js 的开火段）。 */
    var patrol = [];
    var half = cellGroups.length / 2;          // xs 两列：先沿左列往北，再沿右列往南
    for (i = 0; i < half; i++) patrol.push(cellGroups[i]);
    for (i = cellGroups.length - 1; i >= half; i--) patrol.push(cellGroups[i]);
    var wps = patrol.map(function (g) { return M3.V(g.x, g.y - 1500, g.z); });
    var datum = spawnEnemy(w, {
      ac: 'datum', team: 2, special: null,   // 显式 null：不拿 spawnEnemy 缺省的 dl6
      x: wps[0].x, y: wps[0].y, z: wps[0].z - 8000,
      fwd: M3.V(0, 0, 1), speed: 240,
      skill: 0.30,
      behavior: 'recon'
    });
    datum.route = { wps: wps, wpIdx: 0, wp: wps[0], alt: wps[0].y, arrive: 1500 };

    /* 管理局的海洋测量船 DIKLO「标杆」——双体船，正在这片海盆上
       重测锚位。它和「准绳」是同一批船：一个在水下敲，一个在水上量。

       中性：不设 team（默认 1 会被 AI 当敌方设施打），用 team 2 让它
       退出交战语法 —— 玩家锁不到它，AI 也不认它，它只负责在场上。 */
    spawnShip(w, {
      model: 'diklo', team: 2, label: T('missions.m5.spawn.label_3'),
      x: 11000, z: 9000, hp: 700, weapon: null
    });

    w.objective = T('missions.m5.spawn.objective.s1');
    w.objectiveSub = T('missions.m5.spawn.objectiveSub.s1');
    w.dangerAltitude = 1800;
  },

  tick: function (w, dt) {
    var i, radars = 0, sams = 0, jammers = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'radar') radars++; else if (t.model === 'sam') sams++;
    }
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      // 以前还要求 a.ecmOn —— 那个字段全项目没人写，状态栏永远显示"沉默"
      if (a.team === 1 && a.alive && a.ewPower > 0) jammers++;
    }
    w.objectiveSub = T('missions.m5.tick.objectiveSub.s1') + radars + T('missions.m5.tick.objectiveSub.s2') + sams +
      (jammers ? T('missions.m5.tick.objectiveSub.s3') : T('missions.m5.tick.objectiveSub.s4'));

    var detected = w.player.pos.y > 1800 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m5', 'spotted');
    }

    // 雷达站全灭 → 台词
    if (radars === 0 && !w.flags.radarDown) {
      w.flags.radarDown = true;
      w.radio.play('m5', 'radarDown');
    }
  },

  win: function (w) {
    var i, radars = 0, sams = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'radar') radars++; else if (t.model === 'sam') sams++;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return radars === 0 && sams === 0;
  },
  lose: function (w) { return !w.player.alive; }
});
