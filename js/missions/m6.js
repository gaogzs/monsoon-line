/* ============================================================
   任务 6 · 第二梯队

   下游把压箱底的那批人放进来了：开 GAL-31 的老兵，
   一个在这条高度上飞了半辈子的人才有的编队纪律。
   （早先这里飞的是上游的 F-9 —— 对面的飞机。）
   ============================================================ */
Registry.mission({
  order: 60,
  id: 'm6',
  no: 'OPERATION 06',
  name: T('missions.m6.name'),
  en: 'SECOND ECHELON',
  loc: T('missions.m6.loc'),
  date: '2078.04.04 / 0620L',
  altStart: 18000,
  speedStart: 500,
  timeLimit: 0,
  axis: 150,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m6.prose'),

  objectives: [
    T('missions.m6.objectives.i0.s1'),
    T('missions.m6.objectives.i1.s1'),
    T('missions.m6.objectives.i2.s1'),
    T('missions.m6.objectives.i3.s1')
  ],
  threats: [
    T('missions.m6.threats.i0.s1'),
    T('missions.m6.threats.i1.s1'),
    T('missions.m6.threats.i2.s1'),
    T('missions.m6.threats.i3.s1')
  ],
  intel: T('missions.m6.intel'),
  map: [
    { x: 0, z: -14000, type: 'start', label: T('missions.m6.map.i0.label') },
    { x: 0, z: 24000, type: 'enemy', label: T('missions.m6.map.i1.label') },
    { x: 0, z: 32000, type: 'site', label: T('missions.m6.map.i2.label') },
    { x: 8000, z: 26000, type: 'enemy', label: T('missions.m6.map.i3.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [5000], zs: [0, 30000] });
    p.pos = M3.V(0, 18000, -14000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 500;
    p.throttle = 0.95;
    p.ab = true;

    spawnWingman(w, 2, -220, 30, -320);
    spawnWingman(w, 3, 220, 30, -320);
    w.wings[2].pos.y = 18000;
    w.wings[3].pos.y = 18000;
    w.wings[2].speed = 480;
    w.wings[3].speed = 480;

    /* 四架 GAL-31 老兵，两两一组拉开 6 km。

       高度压在升限（19 000 m）以下：17 800–18 700 m，正好比玩家高一层。
       GAL-31 的格斗性能比原来的 F-9 差，所以 skill 比原来各高一点 ——
       这一关难在"人"，与设定一致。 */
    var i;
    for (i = 0; i < 4; i++) {
      var vet = spawnEnemy(w, {
        ac: 'basalt',
        x: -3000 + (i % 2) * 6000, y: 17800 + Math.floor(i / 2) * 900,
        z: 22000 + Math.floor(i / 2) * 4000,
        fwd: M3.V(0, 0, -1),
        special: 'dl4',
        loadout: i === 0 ? 'lead' : 'cap',
        skill: i === 0 ? 0.88 : 0.72,
        callsign: squadCallsign(15 + i, 1)
      });
      vet.veteran = true;
    }

    /* 四架 ROK-27 护航，压在自己的升限（15 000 m）以下。
       两架带 SAV-6 —— 下游教条是"编队里永远有一架带干扰吊舱"。 */
    for (i = 0; i < 4; i++) {
      spawnEnemy(w, {
        ac: 'schist',
        x: 3000 + i * 3500, y: 14200 + (i % 2) * 500, z: 26000,
        fwd: M3.V(0, 0, -1),
        special: 'dl6',
        loadout: (i % 2) ? 'capPod' : 'capMix',
        pods: (i % 2) ? ['vzu'] : null,
        skill: 0.6, callsign: squadCallsign(15 + i, 2)
      });
    }

    /* 下游预警机：它在，下游的增援就会准时到。
       位置放得很后（35 km），想打它得先穿过整个敌编队。 */
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: T('missions.m6.spawn.label'),
      x: 0, y: 11000, z: 32000,
      a: M3.V(7000, 0, 32000), b: M3.V(-7000, 0, 35000)
    });

    w.objective = T('missions.m6.spawn.objective.s1');
    w.objectiveSub = T('missions.m6.spawn.objectiveSub.s1');
  },

  tick: function (w, dt) {
    var i, f9 = 0, others = 0;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.veteran) f9++; else others++;
    }
    w.objectiveSub = T('missions.m6.tick.objectiveSub.s1') + f9 + T('missions.m6.tick.objectiveSub.s2') + others;

    if (!w.flags.contact && w.time > 4) {
      w.flags.contact = true;
      w.radio.play('m6', 'contact');
    }
    if (!w.flags.highQ && w.player.q < 14 && w.player.pos.y > 17000 && w.time > 20) {
      w.flags.highQ = true;
      w.radio.play('m6', 'lowQ');
    }
    if (f9 <= 2 && !w.flags.halfDone) {
      w.flags.halfDone = true;
      w.radio.play('m6', 'half');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});
