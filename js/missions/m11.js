Registry.mission({
  order: 130,
  id: 'm11',
  no: 'OPERATION 11',
  name: T('missions.m11.name'),
  en: 'BROADSIDE',
  loc: T('missions.m11.loc'),
  date: '2078.04.22 / 1610L',
  altStart: 6000,
  speedStart: 380,
  timeLimit: 0,
  axis: 175,

  prose: T('missions.m11.prose'),
  objectives: [
    T('missions.m11.objectives.i0.s1'),
    T('missions.m11.objectives.i1.s1'),
    T('missions.m11.objectives.i2.s1')
  ],
  threats: [
    T('missions.m11.threats.i0.s1'),
    T('missions.m11.threats.i1.s1'),
    T('missions.m11.threats.i2.s1'),
    T('missions.m11.threats.i3.s1')
  ],
  intel: T('missions.m11.intel'),
  map: [
    { x: 0, z: -9000, type: 'start', dir: 0, label: T('missions.m11.map.i0.label') },
    { x: 0, z: -3000, type: 'base', label: T('missions.m11.map.i1.label') },
    { x: -6000, z: -4500, type: 'base', label: T('missions.m11.map.i2.label') },
    { x: 6000, z: -4500, type: 'base', label: T('missions.m11.map.i3.label') },
    { x: 0, z: 19000, type: 'enemy', label: T('missions.m11.map.i4.label') },
    { x: -7000, z: 18000, type: 'enemy', label: T('missions.m11.map.i5.label') },
    { x: 7000, z: 18000, type: 'enemy', label: T('missions.m11.map.i6.label') },
    { x: 7000, z: 30000, type: 'site', label: T('missions.m11.map.i7.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [-15000, 15000], zs: [-2000, 26000] });
    p.pos = M3.V(0, 6000, -9000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 380;
    spawnWingman(w, 2, -220, 24, -320);
    spawnWingman(w, 3, 220, 24, -320);

    /* 两个二维阵型，各自往前开 4.5 km 停下。航速 14 m/s（约 27 节），对向合计 28 m/s。
         我方（向北）：旗舰居中；两条虎鲸在前方两侧（前卫 / 对空屏障）；两条海豚在后方两翼（护航）
         敌方（向南）：一条快艇打前哨；两条菊石在前方两侧；房角石在后方居中；两翼各一条快艇
       开场最近的一对（敌前哨快艇 ↔ 我方虎鲸）相距约 17.8 km，反舰弹开火距离 16 km ——
       第一枪最早在开场约 60 s 后。停下时前沿相距约 8.5 km、主力相距约 13 km。 */
    var mine = [
      { model: 'spermwhale', cs: NAVAL_NAMED.spermwhale, x: 0, z: -3000, hp: 1500, sam: 'ss6', cd: 3, flag: true },
      { model: 'orca', x: -3000, z: -1500, hp: 900, sam: 'ss6', cd: 5 },
      { model: 'orca', x: 3000, z: -1500, hp: 900, sam: 'ss6', cd: 5 },
      { model: 'dolphin', x: -6000, z: -4500, hp: 520, sam: 'ss6', cd: 8 },
      { model: 'dolphin', x: 6000, z: -4500, hp: 520, sam: 'ss6', cd: 8 }
    ];
    w.myFleet = [];
    for (var i = 0; i < mine.length; i++) {
      var q = mine[i];
      var t = spawnShip(w, {
        model: q.model, callsign: q.cs, team: 0, x: q.x, z: q.z, hp: q.hp,
        weapon: q.sam, fireCd: q.cd,
        route: { wp: [{ x: q.x, z: q.z + 4500 }], speed: 14 }
      });
      if (q.flag) { w.flagship = t; w.guarded = [t]; }
      w.myFleet.push(t);
    }
    var foe = [
      /* ssmK 每条船单独给：房角石 200 发反舰弹只带一小部分进这一关（它的齐射节奏是一波 6 发 / 20 s），
         其余船满弹，靠整舰齐射节奏控制速度 */
      { model: 'cameroceras', cs: NAVAL_NAMED.cameroceras2, x: 0, z: 19000, hp: 900, sam: 'dl9', k: 0.2, arsenal: true },
      // 护航编队：菊石 ×4（前方两侧各一前一后）、快艇 ×6（前哨 2、两翼各 2）
      { model: 'ammonite', x: -3500, z: 17000, hp: 420, sam: 'dl9', k: 1 },
      { model: 'ammonite', x: 3500, z: 17000, hp: 420, sam: 'dl9', k: 1 },
      { model: 'ammonite', x: -5000, z: 18500, hp: 420, sam: 'dl9', k: 1 },
      { model: 'ammonite', x: 5000, z: 18500, hp: 420, sam: 'dl9', k: 1 },
      { model: 'trilobite', x: -7000, z: 18000, hp: 120, k: 1 },
      { model: 'trilobite', x: 7000, z: 18000, hp: 120, k: 1 },
      { model: 'trilobite', x: -9000, z: 19500, hp: 120, k: 1 },
      { model: 'trilobite', x: 9000, z: 19500, hp: 120, k: 1 },
      { model: 'trilobite', x: -1500, z: 16000, hp: 120, k: 1 },
      { model: 'trilobite', x: 1500, z: 16000, hp: 120, k: 1 }
    ];
    w.fleet = [];
    for (i = 0; i < foe.length; i++) {
      q = foe[i];
      var es = spawnShip(w, {
        model: q.model, callsign: q.cs, team: 1, x: q.x, z: q.z, hp: q.hp,
        weapon: q.sam || null, fireCd: 6,
        ssmK: q.k, ssmStagger: 30,
        route: { wp: [{ x: q.x, z: q.z - 4500 }], speed: 14 }
      });
      if (q.arsenal) w.arsenal = es;
      /* 对舰火力优先打我方旗舰（prefer，不是 only：旗舰不在射界里时照样打别的船）。
         不下这道命令的话，反舰弹按"最好打"分配，打光之前根本轮不到居中的旗舰 */
      es.orders = { surface: { target: w.flagship, mode: 'prefer', weight: 2 } };
      w.fleet.push(es);
    }
    for (i = 0; i < 4; i++) {
      var striker = i >= 2;
      var e = spawnEnemy(w, {
        ac: striker ? 'sandstone' : 'basalt',
        x: -6000 + i * 4000, y: striker ? 3000 : 9000, z: 22000,
        fwd: M3.V(0, 0, -1), special: striker ? 'vgt' : 'dl4',
        loadout: striker ? { A: 'vgt', B: 'vbn' } : { A: 'dl4', B: 'vbn' },
        skill: 0.6, callsign: striker ? squadCallsign(54 + i, 2) : squadCallsign(56 + i, 1)
      });
      if (striker) e.striker = true;
    }
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: T('missions.m11.spawn.label'),
      x: 7000, y: 10000, z: 30000,
      a: M3.V(13000, 0, 30000), b: M3.V(1000, 0, 32000)
    });
    w.objective = T('missions.m11.spawn.objective.s1');
    w.objectiveSub = '';
  },

  tick: function (w, dt) {
    var i, left = 0, mine = 0;
    for (i = 0; i < w.fleet.length; i++) if (w.fleet[i].alive) left++;
    for (i = 0; i < w.myFleet.length; i++) if (w.myFleet[i].alive) mine++;
    /* 房角石的打法和别的船不一样：进入反舰弹射程（离我方任一舰 16 km）就停船，原地按批次齐射。
       它没有装甲、没有像样的防空，再往前开只会进别人的射程 —— 设定里它就是"打完掉头跑"的船。
       其余船照旧边打边靠近（航线走完在约 8.5 km 处停下） */
    var ars = w.arsenal;
    if (ars && ars.alive && !w.flags.arsenalHold) {
      for (i = 0; i < w.myFleet.length; i++) {
        var my = w.myFleet[i];
        if (my.alive && M3.dist(my.pos, ars.pos) < 16000) {
          w.flags.arsenalHold = true;
          ars.wpIdx = ars.route.wp.length;       // 走完航线 = 原地停住（stepTarget）
          w.radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: T('missions.m11.tick.tx_'), gap: 1.0 });
          break;
        }
      }
    }
    /* 护航编队全灭、只剩房角石：我方舰队把停船点往前推，开到离它 6 km 停下 ——
       在 75 mm 主炮的 8 km 射程内，全舰队都能用舰炮打它。各舰按自己相对房角石的方位停，不挤成一团 */
    if (ars && ars.alive && !w.flags.closeIn && left === 1) {
      w.flags.closeIn = true;
      for (i = 0; i < w.myFleet.length; i++) {
        var ms = w.myFleet[i];
        if (!ms.alive) continue;
        var dir = M3.norm(M3.V(ms.pos.x - ars.pos.x, 0, ms.pos.z - ars.pos.z));
        ms.route = { wp: [{ x: ars.pos.x + dir.x * 6000, z: ars.pos.z + dir.z * 6000 }], speed: 14 };
        ms.wpIdx = 0; ms.arrived = false;
      }
      w.radio.raw({ who: T('missions.m11.tick.who'), cls: 'ally', tx: T('missions.m11.tick.tx_2'), gap: 1.0 });
    }
    var f = w.flagship, frac = f.alive ? Math.max(0, f.hp) / f.maxHp : 0;
    w.flags.flagMark = w.flags.flagMark || 0;
    while (f.alive && w.flags.flagMark < M11_FLAG_MARKS.length && frac < M11_FLAG_MARKS[w.flags.flagMark]) {
      var pct = Math.round(M11_FLAG_MARKS[w.flags.flagMark] * 100);
      w.flags.flagMark++;
      w.radio.raw({ who: T('missions.m11.tick.who_2'), cls: 'ally',
        tx: pct > 50 ? T('missions.m11.tick.tx.s1') :
          (pct > 25 ? T('missions.m11.tick.tx.s2') : T('missions.m11.tick.tx.s3')), gap: 0.8 });
    }
    // 我方非旗舰沉没：报一声
    for (i = 0; i < w.myFleet.length; i++) {
      var s = w.myFleet[i];
      if (!s.alive && !s._lost && s !== f) {
        s._lost = true;
        w.radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>' + shipName(s) + T('missions.m11.tick.tx.s4'), gap: 0.9 });
      }
    }
    // 任意一对敌我舰船进入 16 km（反舰弹开火距离）就报
    var inRange = false;
    for (i = 0; i < w.fleet.length && !inRange; i++) {
      if (!w.fleet[i].alive) continue;
      for (var j = 0; j < w.myFleet.length; j++) {
        if (w.myFleet[j].alive && M3.dist(w.fleet[i].pos, w.myFleet[j].pos) < 16000) { inRange = true; break; }
      }
    }
    if (!w.flags.contact && inRange) {
      w.flags.contact = true;
      w.radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: T('missions.m11.tick.tx_3'), gap: 1.0 });
    }
    w.objectiveSub = T('missions.m11.tick.objectiveSub.s1') + left + '/' + w.fleet.length + T('missions.m11.tick.objectiveSub.s2') + mine + '/' + w.myFleet.length +
      T('missions.m11.tick.objectiveSub.s3') + Math.round(frac * 100) + '%';
  },

  win: function (w) {
    for (var i = 0; i < w.fleet.length; i++) if (w.fleet[i].alive) return false;
    return true;
  },
  lose: function (w) {
    return !w.player.alive || !w.flagship.alive;
  }
});
