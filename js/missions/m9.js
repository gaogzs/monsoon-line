/* ============================================================
   任务 9 · 补给线（资产保卫，2-0IMPL 4.11）
   下游的护卫舰编队开到防波堤平台群外 7 km 停下炮击。三座平台全毁即失败；
   击沉编队长或打掉大半舰船，剩下的就掉头撤退 —— 撤出 26 km 或全沉即胜。
   剧情：接 m8（燧石）—— 打不到浮岛，就打给浮岛加油的东西。
   邓氏鱼留给 m12（指挥所）当指挥舰，所以这里是菊石编队。
   平台受损到 75 / 50 / 25% 时友军报告（单位血量看不见，靠这个提醒）。
   ============================================================ */
var M9_ASSET_MARKS = [0.75, 0.5, 0.25];

function m9Retreat(w) {
  for (var i = 0; i < w.fleet.length; i++) {
    var t = w.fleet[i];
    if (!t.alive) continue;
    t.route = { wp: [{ x: t.pos.x, z: 40000 }], speed: 16 };
    t.wpIdx = 0; t.arrived = false;
    t.orders = null;
  }
}

Registry.mission({
  order: 120,
  id: 'm9',
  no: 'OPERATION 09',
  name: T('missions.m9.name'),
  en: 'SUPPLY LINE',
  loc: T('missions.m9.loc'),
  date: '2078.04.16 / 1430L',
  altStart: 5000,
  speedStart: 360,
  timeLimit: 0,
  axis: 160,

  prose: T('missions.m9.prose'),
  objectives: [
    T('missions.m9.objectives.i0.s1'),
    T('missions.m9.objectives.i1.s1'),
    T('missions.m9.objectives.i2.s1')
  ],
  threats: [
    T('missions.m9.threats.i0.s1'),
    T('missions.m9.threats.i1.s1'),
    T('missions.m9.threats.i2.s1')
  ],
  intel: T('missions.m9.intel'),
  map: [
    { x: 0, z: -9000, type: 'start', dir: 0, label: T('missions.m9.map.i0.label') },
    { x: 0, z: 0, type: 'base', label: T('missions.m9.map.i1.label') },
    { x: -3200, z: 1600, type: 'base', label: T('missions.m9.map.i2.label') },
    { x: 3200, z: 1600, type: 'base', label: T('missions.m9.map.i3.label') },
    { x: 0, z: 12000, type: 'enemy', label: T('missions.m9.map.i4.label') },
    { x: 8000, z: 30000, type: 'site', label: T('missions.m9.map.i5.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [-14000, 14000], zs: [-4000, 26000] });
    p.pos = M3.V(0, 5000, -9000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 360;
    spawnWingman(w, 2, -220, 24, -320);
    spawnWingman(w, 3, 220, 24, -320);

    w.guarded = [
      /* 血量比 PLATFORMS 的默认值低：这三座是满载油罐的补给平台，挨炮比空平台脆 ——
         也让"玩家不管就 3–4 分钟失守"成立 */
      spawnPlatform(w, { platform: 'breakwater', x: 0, z: 0, team: 0, label: T('missions.m9.spawn.guarded.i0.label'), hp: 800 }),
      spawnPlatform(w, { platform: 'shoal', x: -3200, z: 1600, team: 0, label: T('missions.m9.spawn.guarded.i1.label'), hp: 650 }),
      spawnPlatform(w, { platform: 'breakwater', x: 3200, z: 1600, yaw: Math.PI, team: 0, label: T('missions.m9.spawn.guarded.i2.label'), hp: 800 })
    ];
    var full = 0;
    for (var g = 0; g < w.guarded.length; g++) full += w.guarded[g].maxHp;
    w.assetFull = full;

    /* 炮击编队：开到 z ≈ 6–7 km 停下（离最远的平台也在 75 mm 的 8 km 射程里），命令炮塔优先打平台。
       反舰弹备弹按 ssmK 缩减：满弹的话平台一分钟就没了，玩家来不及。 */
    var plan = [
      { model: 'ammonite', cs: NAVAL_NAMED.ammoniteLead, x: 0, z: 12000, stop: 7000, hp: 520, flag: true },
      { model: 'ammonite', x: -5000, z: 11500, stop: 6500, hp: 420 },
      { model: 'ammonite', x: 5000, z: 11500, stop: 6500, hp: 420 },
      { model: 'trilobite', x: -9000, z: 11000, stop: 6000, hp: 120 },
      { model: 'trilobite', x: 9000, z: 11000, stop: 6000, hp: 120 }
    ];
    w.fleet = [];
    for (var i = 0; i < plan.length; i++) {
      var q = plan[i];
      var sh = spawnShip(w, {
        model: q.model, callsign: q.cs, team: 1, x: q.x, z: q.z, hp: q.hp,
        weapon: q.model === 'trilobite' ? null : 'dl9', fireCd: 6,
        ssmK: 0.5, ssmStagger: 240,
        route: { wp: [{ x: q.x * 0.6, z: q.stop }], speed: 16 }
      });
      if (q.flag) w.flagship = sh;
      w.fleet.push(sh);
    }
    for (i = 0; i < 4; i++) {
      var heavy = i < 2;
      spawnEnemy(w, {
        ac: heavy ? 'basalt' : 'sandstone',
        x: -9000 + i * 6000, y: heavy ? 9000 : 5000, z: 24000,
        fwd: M3.V(0, 0, -1), special: heavy ? 'dl4' : 'vbn',
        loadout: heavy ? { A: 'dl4', B: 'vbn' } : null,
        skill: 0.6, callsign: heavy ? squadCallsign(54 + i, 1) : squadCallsign(52 + i, 2)
      });
    }
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: T('missions.m9.spawn.label'),
      x: 8000, y: 10000, z: 30000,
      a: M3.V(14000, 0, 30000), b: M3.V(2000, 0, 32000)
    });
    w.objective = T('missions.m9.spawn.objective.s1');
    w.objectiveSub = '';
  },

  tick: function (w, dt) {
    var i, alive = 0, hp = 0;
    for (i = 0; i < w.guarded.length; i++) {
      var a = w.guarded[i];
      if (a.alive) { alive++; hp += Math.max(0, a.hp); }
    }
    // 命令：每艘还在打的船优先炮击离它最近的完好平台
    for (i = 0; i < w.fleet.length; i++) {
      var t = w.fleet[i];
      if (!t.alive || w.flags.retreat) continue;
      var best = null, bd = 1e12;
      for (var j = 0; j < w.guarded.length; j++) {
        var g = w.guarded[j];
        if (!g.alive) continue;
        var d = M3.dist2(g.pos, t.pos);
        if (d < bd) { bd = d; best = g; }
      }
      if (best && (!t.orders || t.orders.target !== best)) t.orders = { target: best, mode: 'prefer', weight: 3 };
    }
    // 平台受损报告
    var frac = hp / w.assetFull;
    w.flags.assetMark = w.flags.assetMark || 0;
    while (w.flags.assetMark < M9_ASSET_MARKS.length && frac < M9_ASSET_MARKS[w.flags.assetMark]) {
      var pct = Math.round(M9_ASSET_MARKS[w.flags.assetMark] * 100);
      w.flags.assetMark++;
      w.radio.raw({ who: T('missions.m9.tick.who'), cls: 'ally',
        tx: pct > 50 ? T('missions.m9.tick.tx.s1') + pct + T('missions.m9.tick.tx.s2') :
          (pct > 25 ? T('missions.m9.tick.tx.s3') : T('missions.m9.tick.tx.s4')), gap: 0.8 });
    }
    // 撤退：旗舰沉了，或者五艘里沉了三艘
    var sunk = 0, left = 0;
    for (i = 0; i < w.fleet.length; i++) { if (!w.fleet[i].alive) sunk++; else left++; }
    if (!w.flags.retreat && left && (!w.flagship.alive || sunk >= 3)) {
      w.flags.retreat = true;
      m9Retreat(w);
      w.radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: T('missions.m9.tick.tx_'), gap: 1.0 });
    }
    w.objectiveSub = T('missions.m9.tick.objectiveSub.s1') + alive + T('missions.m9.tick.objectiveSub.s2') + Math.round(frac * 100) + T('missions.m9.tick.objectiveSub.s3') + left + '/' + w.fleet.length;
  },

  win: function (w) {
    for (var i = 0; i < w.fleet.length; i++) {
      var t = w.fleet[i];
      if (t.alive && (!w.flags.retreat || t.pos.z < 26000)) return false;
    }
    return true;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    for (var i = 0; i < w.guarded.length; i++) if (w.guarded[i].alive) return false;
    return Mission.fail(w, 'm9.guardLost');
  }
});
