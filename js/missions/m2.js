/* ============================================================
   任务 2 · 铁砧之下
   ============================================================ */
Registry.mission({
  order: 20,
  id: 'm2',
  no: 'OPERATION 02',
  name: T('missions.m2.name'),
  en: 'UNDER THE ANVIL',
  loc: T('missions.m2.loc'),
  date: '2078.03.19 / 0520L',
  altStart: 1400,
  speedStart: 340,
  timeLimit: 0,
  axis: 200,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m2.prose'),

  objectives: [
    T('missions.m2.objectives.i0.s1'),
    T('missions.m2.objectives.i1.s1'),
    T('missions.m2.objectives.i2.s1'),
    T('missions.m2.objectives.i3.s1'),
    T('missions.m2.objectives.i4.s1')
  ],
  threats: [
    T('missions.m2.threats.i0.s1'),
    T('missions.m2.threats.i1.s1'),
    T('missions.m2.threats.i2.s1'),
    T('missions.m2.threats.i3.s1'),
    T('missions.m2.threats.i4.s1')
  ],
  intel: T('missions.m2.intel'),
  map: [
    { x: 0, z: -16000, type: 'start', label: T('missions.m2.map.i0.label') },
    { x: 0, z: -19000, type: 'base', label: T('missions.m2.map.i1.label') },
    { x: -7200, z: 11000, type: 'relay', label: T('missions.m2.map.i2.label') },
    { x: 600, z: 17000, type: 'relay', label: T('missions.m2.map.i3.label') },
    { x: 8200, z: 9600, type: 'relay', label: T('missions.m2.map.i4.label') },
    { x: -6000, z: 4000, type: 'site', label: T('missions.m2.map.i5.label') },
    { x: 6200, z: 6600, type: 'site', label: T('missions.m2.map.i6.label') },
    { x: -9000, z: 1400, type: 'sam', label: 'SAM' },
    { x: 9400, z: 4200, type: 'sam', label: 'SAM' },
    { x: -4400, z: 13000, type: 'sam', label: 'SAM' },
    { x: 8600, z: 15000, type: 'sam', label: 'SAM' }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [0], zs: [-15000, 15000] });
    /* 这一关整条链条被拉长到约 30 km：进场点在东北端，
       中继网铺在中间，前进基地在你身后。进入段有了，
       而"来不及拦轰炸机"也才真的成立。 */
    p.pos = M3.V(0, 1400, -16000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 340;

    spawnWingman(w, 2, -180, 14, -300);
    spawnWingman(w, 3, 180, 14, -300);

    // 三座浮空中继平台，间距拉到 6–8 km
    var relays = [
      { x: -7200, y: 4000, z: 11000 },
      { x: 600, y: 4000, z: 17000 },
      { x: 8200, y: 4000, z: 9600 }
    ];
    for (var i = 0; i < relays.length; i++) {
      var r = relays[i];
      var t = spawnTarget(w, {
        ttype: 'air', model: 'relay', label: T('missions.m2.spawn.t.label'),
        x: r.x, y: r.y, z: r.z, hp: 260, radius: 30,
        drift: 9, value: 250, big: true
      });
      t.vital = true;
    }

    // 两座地面测控平台
    var sites = [
      { x: -6000, z: 4000, label: T('missions.m2.spawn.sites.i0.label') },
      { x: 6200, z: 6600, label: T('missions.m2.spawn.sites.i1.label') }
    ];
    for (i = 0; i < sites.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'radar', label: sites[i].label,
        x: sites[i].x, y: 0, z: sites[i].z,
        hp: 200, radius: 10, ground: true, value: 200
      });
    }

    // 四个防空浮台，拉开成一张网
    var sams = [
      { x: -9000, z: 1400 }, { x: 9400, z: 4200 },
      { x: -4400, z: 13000 }, { x: 8600, z: 15000 }
    ];
    for (i = 0; i < sams.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'sam', label: T('missions.m2.spawn.label'),
        x: sams[i].x, y: 0, z: sams[i].z,
        hp: 90, radius: 5, ground: true,
        fireCd: M3.rnd(3, 8), weapon: 'dl9', value: 150
      });
    }

    /* ---- 我方前进基地：这一关唯一"必须保护"的东西 ----
       一座 96 米级的浮式平台，也是玩家在这片海域的落脚点。 */
    /* team: 0 —— 这是**我方**设施。

       makeTarget 的 team 默认值是 1（敌方），而 cycleTarget 只把
       team === 1 的设施纳入锁定循环；更要紧的是 ai.js 的
       nearestSurfaceTarget 判据是 `t.team === a.team || t.team > 1` ——
       漏写 team: 0 的话，**下游带对地弹的飞机也会把它当目标打**，
       那就不是"基地被轰炸机炸了"，而是"基地被路过的敌机随手拆了"。 */
    var baseT = spawnTarget(w, {
      ttype: 'ground', model: 'station', label: T('missions.m2.spawn.baseT.label'),
      x: 0, y: 0, z: -19000, team: 0,
      hp: 900, radius: 56, ground: true, value: 0
    });
    w.baseTarget = baseT;
    w.baseHpFull = baseT.maxHp;

    /* 护航的虎鲸：上游在这片海域只有两艘驱逐舰，这是其中一艘。
       它不参与走位，只是停在那儿 —— 但这片海域从此不只有浮台。 */
    spawnShip(w, {
      model: 'orca', team: 0,
      x: -2600, z: -20000, hp: 900,
      // 32 单元舰空弹垂发（SHIPS 表的 arms）：会替基地打来袭的敌机
      weapon: 'ss6', fireCd: 5
    });

    /* ---- 两架 ROK-40：这一关真正的威胁 ----
       从进入点一侧（东北）进场、投弹、脱离，全程沿航线飞 ——
       不选目标、不追人、不做规避。玩家要么拦住它们，要么看基地被炸。 */
    var bombRun = [
      { x: -3400, z: 13000, ox: -11000, oz: 24000 },
      { x: 4200, z: 13000, ox: 11000, oz: 24000 }
    ];
    for (i = 0; i < bombRun.length; i++) {
      var br = bombRun[i];
      var bmb = spawnEnemy(w, {
        ac: 'boulder',
        x: br.x, y: 4300, z: -14000,
        fwd: M3.V(0, 0, 1), speed: 250,
        special: null, skill: 0.30,        // 弹舱里的东西由 onArrive 结算，不走导弹
        callsign: squadCallsign(4, i + 1)
      });
      // 弹舱里的东西不是武器，投弹由 bombTheBase 直接结算 —— 所以这里是 goto + call，不是 strike
      bmb.route = Route.plan([
        { do: 'goto', wp: M3.V(br.x, 0, br.z), alt: 4300, arrive: 3000 },
        { do: 'call', fn: bombTheBase },
        { do: 'egress', wp: M3.V(br.ox, 0, br.oz), alt: 6500 }
      ]);
      // 尾炮自卫：ROK-40 的 mounts 里有 tail20（turret.js），不用在航线里配
      bmb.bigTarget = true;
    }

    /* 下游两艘船在海面上 —— 菊石级巡逻护卫舰与三叶虫级导弹快艇。

       它们不是这一关的目标，是"海面上还有别的船"这件事本身：
       一艘 27 节的护卫舰沿着封锁线来回巡逻，一艘 40 节的快艇
       贴着水面目视接触。菊石带 BAD-9 舰空弹，会向被照到的目标开火；
       三叶虫只有反舰弹和一门遥控炮，没有防空。 */
    spawnShip(w, {
      model: 'ammonite',
      x: -9000, z: 22000, hp: 420, weapon: 'dl9',
      route: { wp: [{ x: -9000, z: 22000 }, { x: 9000, z: 22000 }], speed: 14, loop: true }
    });
    spawnShip(w, {
      model: 'trilobite',
      x: 12000, z: -2000, hp: 240,
      route: { wp: [{ x: 12000, z: -2000 }, { x: -2000, z: 14000 }], speed: 20, loop: true }
    });

    /* 下游预警机 ROK-2「石英」：它把各自为战的防空阵地
       连成一张空情图。打掉它，伏击就会晚到几分钟。 */
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: T('missions.m2.spawn.label_2'),
      x: 0, y: 8000, z: 26000,
      a: M3.V(8000, 0, 26000), b: M3.V(-8000, 0, 21000)
    });

    w.objective = T('missions.m2.spawn.objective.s1');
    w.objectiveSub = T('missions.m2.spawn.objectiveSub.s1');
    w.flags.ambushDone = false;
    w.dangerAltitude = 1500;
  },

  tick: function (w, dt) {
    var i, relays = 0, sites = 0, sams = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive) continue;
      if (t.model === 'relay') relays++;
      else if (t.model === 'radar') sites++;
      else if (t.model === 'sam') sams++;
    }
    /* 基地血量：这是玩家唯一"必须保护"的东西，所以要一直摆在眼前。
       否则轰炸机投完弹玩家才发现，那就成了"突然失败"。 */
    var basePct = 0;
    if (w.baseTarget && w.baseTarget.alive) {
      basePct = Math.max(0, Math.round(w.baseTarget.hp / w.baseTarget.maxHp * 100));
    }
    w.objectiveSub = T('missions.m2.tick.objectiveSub.s1') + relays + T('missions.m2.tick.objectiveSub.s2') + sites + T('missions.m2.tick.objectiveSub.s3') + sams +
      T('missions.m2.tick.objectiveSub.s4') + basePct + '%';

    if (w.baseWarnT > 0) w.baseWarnT -= dt;
    if (w.baseTarget && w.baseTarget.alive) {
      if (w.baseTarget.hp < w.baseTarget.maxHp && !w.flags.baseHit) {
        w.flags.baseHit = true;
        w.radio.play('m2', 'baseHit');
      }
      // 血量过低时反复提醒，但别刷屏
      if (w.baseTarget.hp < w.baseTarget.maxHp * 0.55 &&
        !w.flags.baseLow && w.baseWarnT <= 0) {
        w.flags.baseLow = true;
        w.baseWarnT = 14;
        w.radio.play('m2', 'baseLow');
      }
    } else if (w.baseTarget && !w.baseTarget.alive && !w.flags.baseLost) {
      w.flags.baseLost = true;
      w.radio.play('m2', 'baseLost');
    }

    // 中继平台被打击后触发台词
    if (!w.flags.relayDown && relays < 3 && w.time > 4) {
      w.flags.relayDown = true;
      w.radio.play('m2', 'relayDown');
    }

    // 被雷达照射
    var detected = w.player.pos.y > 1500 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m2', 'spotted');
    }

    // 控制平台全毁 → 触发伏击
    if (sites === 0 && !w.flags.ambushDone) {
      w.flags.ambushDone = true;
      w.radio.play('m2', 'radarDown');
      // 下游截击机从北面进场
      var k;
      /* 三架 GAL-31 打头、两架 ROK-27 跟进、第四架 GAL-31 在高空看着。
         高峰军工制造局的重型截击机专为这种场合造的：
         从高空俯冲下来打一轮中距弹，然后脱离再爬升。 */
      /* 伏击六架拆成四队，每队内机型不同：旱沟 / 石桥 各一基一中，空井、灰塘单机 */
    var ambCs = [squadCallsign(0, 1), squadCallsign(1, 1), downstreamCallsign(2),
      squadCallsign(0, 2), squadCallsign(1, 2), downstreamCallsign(3)];
    for (k = 0; k < 6; k++) {
        var isHeavy = (k < 3);
        var isHigh = (k === 5);
        var e = spawnEnemy(w, {
          ac: (isHigh || isHeavy) ? 'basalt' : 'schist',
          x: -2200 + k * 900, y: isHigh ? 17500 : (isHeavy ? 7600 : 3200), z: 24000,
          fwd: M3.V(0, 0, -1), speed: isHigh ? 470 : (isHeavy ? 430 : 340),
          special: (isHigh || isHeavy) ? 'dl4' : 'dl6',
          loadout: (isHigh || isHeavy) ? { A: 'dl4', B: 'vbn' } : null,
          skill: k === 0 ? 0.72 : 0.5,
          callsign: ambCs[k]
        });
        e.wave = 2;
      }
      w.radio.play('m2', 'ambush');
    }
  },

  win: function (w) {
    var i, relays = 0, sites = 0, planes = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive) continue;
      if (t.model === 'relay') relays++;
      else if (t.model === 'radar') sites++;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) planes++;
    }
    // 必须等伏击发生
    if (!w.flags.ambushDone) return false;
    /* 海面上的那两艘巡逻舰不打掉也能收工（它们是这一关的"环境"）；
       空中敌机（含预警机）必须清空 —— 简报目标里写明了这一条。 */
    return relays === 0 && sites === 0 && planes === 0;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    /* 基地没了就算输 —— 哪怕中继网已经拆干净了。
       这是这一关唯一"必须保护"的东西，也是轰炸机存在的全部理由。 */
    if (w.baseTarget && !w.baseTarget.alive) return Mission.fail(w, 'm2.baseLost');
    return false;
  }
});
