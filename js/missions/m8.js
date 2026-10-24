/* ============================================================
   任务 8 · 燧石

   敌机第一次真的来炸东西：VAC-14 攻击机带着 TUM-7 进场。
   玩家在这一关是替海面上的东西挡弹的人。
   ============================================================ */
/* m8 第二波：东面进场的两架 ROK-40 + 两架 ROK-27（都挂 BOX-14），两架护航。
   轰炸机和 ROK-27 都走 strike 航线：按射程放弹后离场 */
function m8Wave2(w) {
  for (var i = 0; i < 4; i++) {
    var bomber = i < 2;
    var e = spawnEnemy(w, {
      ac: bomber ? 'boulder' : 'schist',
      x: 26000, y: bomber ? 5000 : 2800, z: -4000 + i * 3000,
      fwd: M3.V(-1, 0, 0), speed: bomber ? 250 : 300,
      special: 'vsr', loadout: bomber ? { B1: 'vsr' } : { A: 'vsr', B: 'dl6' },
      skill: bomber ? 0.3 : 0.6,
      callsign: bomber ? squadCallsign(40, i + 1) : squadCallsign(41 + i, 1)
    });
    if (bomber) e.bigTarget = true; else e.striker = true;
    e.route = Route.plan([
      { do: 'strike', weapon: 'vsr', pick: 'nearest', rangeK: 0.8, alt: bomber ? 4500 : 2500, shots: 1, timeout: 150 },
      { do: 'egress', wp: M3.V(34000, 0, -4000 + i * 3000), alt: 6000 }
    ]);
  }
  for (i = 0; i < 2; i++) {
    spawnEnemy(w, {
      ac: 'basalt', x: 28000, y: 8000, z: -2000 + i * 5000,
      fwd: M3.V(-1, 0, 0), special: 'dl4', loadout: { A: 'dl4', B: 'vbn' },
      skill: 0.62, callsign: squadCallsign(43 + i, 2)
    });
  }
}

Registry.mission({
  order: 80,
  id: 'm8',
  no: 'OPERATION 08',
  name: T('missions.m8.name'),
  en: 'FLINT',
  loc: T('missions.m8.loc'),
  date: '2078.04.14 / 0815L',
  altStart: 6000,
  speedStart: 380,
  timeLimit: 0,
  axis: 170,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: T('missions.m8.prose'),

  objectives: [
    T('missions.m8.objectives.i0.s1'),
    T('missions.m8.objectives.i1.s1'),
    T('missions.m8.objectives.i2.s1'),
    T('missions.m8.objectives.i3.s1')
  ],
  threats: [
    T('missions.m8.threats.i0.s1'),
    T('missions.m8.threats.i1.s1'),
    T('missions.m8.threats.i2.s1'),
    T('missions.m8.threats.i3.s1'),
    T('missions.m8.threats.i4.s1')
  ],
  intel: T('missions.m8.intel'),
  map: [
    { x: 0, z: 4000, type: 'start', dir: 180, label: T('missions.m8.map.i0.label') },
    { x: 0, z: -6000, type: 'base', label: T('missions.m8.map.i1.label') },
    { x: -9000, z: -3000, type: 'base', label: T('missions.m8.map.i2.label') },
    { x: 9000, z: -3000, type: 'base', label: T('missions.m8.map.i3.label') },
    { x: 0, z: 24000, type: 'enemy', label: T('missions.m8.map.i4.label') },
    { x: 6000, z: 30000, type: 'site', label: T('missions.m8.map.i5.label') }
  ],

  spawn: function (w) {
    var p = w.player;
    spawnCellField(w, { xs: [0], zs: [0, 30000] });
    p.pos = M3.V(0, 6000, 4000);
    p.fwd = M3.V(0, 0, -1);        // 面朝北（本关 +z 真方位 170°），敌机从南面来
    p.speed = 380;

    spawnWingman(w, 2, -220, 24, 320);
    spawnWingman(w, 3, 220, 24, 320);

    /* 上游编队 —— 这一关必须保护的东西，全部 team: 0。

       两条战舰按 SHIPS 表的 arms 带 FAN-6「海墙」舰空弹：抹香鲸 96 单元
       垂发（fireCd 短），座头鲸有 16 发舰空弹。它们会打来袭的敌机
       （从不朝玩家打）—— 但攻击机贴海进、放完弹就走，拦截主要还是玩家的事。
       蓝鲸只有近防炮，不算防空火力（weapon: null）。 */
    var fb = spawnShip(w, {
      model: 'humpback', team: 0, callsign: NAVAL_NAMED.humpback,
      x: 0, z: -6000, hp: 2600, weapon: 'ss6', fireCd: 8
    });
    w.baseTarget = fb;
    w.baseHpFull = fb.maxHp;
    w.guarded = [];
    w.guarded.push(spawnShip(w, {
      model: 'spermwhale', team: 0, callsign: NAVAL_NAMED.spermwhale,
      x: -9000, z: -3000, hp: 1500, weapon: 'ss6', fireCd: 3
    }));
    w.guarded.push(spawnShip(w, {
      model: 'bluewhale', team: 0, callsign: NAVAL_NAMED.bluewhale,
      x: 9000, z: -3000, hp: 1200, weapon: null
    }));

    /* 六架攻击机：两条线，每线三架。五架 VAC-14「砂岩」+ 一架 ROK-27。

       VAC-14 内侧 A 组挂 TUM-7「碎石」（下游通用对面弹，有导引头），
       外侧 B 组挂 BIN-9 自卫。AI 会自己去找海面目标 —— 这就是这一关
       第一次出现的机制：**敌机会真的去炸船**。
       最后一架换成 ROK-27，A 组挂 BOX-14「坍方」反舰弹 —— 打大型目标的
       那一发，重挂专属。早先这六架是上游的 G-6，挂的是上游的 GUT-9 / GUT-12。 */
    var i;
    for (i = 0; i < 6; i++) {
      var lane = Math.floor(i / 3);
      var isSledge = (i === 5);
      var st = spawnEnemy(w, {
        ac: isSledge ? 'schist' : 'sandstone',
        x: (i % 3 - 1) * 3500 + (lane ? 1500 : -1500),
        y: lane ? 3000 : 2600,
        z: 22000 + lane * 3000,
        fwd: M3.V(0, 0, -1),
        special: isSledge ? 'vsr' : 'vgt',
        loadout: isSledge ? { A: 'vsr', B: 'dl6' } : { A: 'vgt', B: 'vbn' },
        skill: 0.6, callsign: isSledge ? squadCallsign(45, 6) : squadCallsign(45, i + 1)
      });
      st.striker = true;
    }

    /* 两架 ROK-40 轰炸机：沿航线飞，目标是编队。

       轰炸机不空战、不规避（ai.js 的 updateRoute），所以走 route：
       低空进到编队北面约 9 km 的投放点，各放一枚 BOX-14「坍方」，
       然后掉头。投放由 onArrive 直接调 fireMissile —— 航线单位不走
       空战 AI 的开火段。原来它们没有航线、挂的是上游的 GUT-30，
       于是两架四发轰炸机在跟战斗机缠斗。 */
    for (i = 0; i < 2; i++) {
      var bmb = spawnEnemy(w, {
        ac: 'boulder',
        x: (i - 0.5) * 5000, y: 5000, z: 26000,
        fwd: M3.V(0, 0, -1), speed: 250,
        special: 'vsr', loadout: { B1: 'vsr' },
        skill: 0.3,
        callsign: squadCallsign(46, i + 1)
      });
      bmb.bigTarget = true;
      /* 以前：飞到固定点（离舰队约 9 km）就放 —— BOX-14 实际只飞得到 8.2 km，
         两枚弹都在舰队前方 1.9 km 的空中自爆。现在按射程放（route.js 的 strike）：
         朝最近的我方舰船飞，进入有效射程 × 0.8 才发射，打完掉头离场。 */
      bmb.route = Route.plan([
        { do: 'strike', weapon: 'vsr', pick: 'nearest', rangeK: 0.8, alt: 4500, shots: 1, timeout: 150 },
        { do: 'egress', wp: M3.V((i - 0.5) * 16000, 0, 34000), alt: 6000 }
      ]);
    }

    // 四架护航
    for (i = 0; i < 4; i++) {
      var heavy = (i < 2);
      spawnEnemy(w, {
        ac: heavy ? 'basalt' : 'sandstone',
        x: -9000 + i * 6000, y: heavy ? 9000 : 4000, z: 28000,
        fwd: M3.V(0, 0, -1),
        special: heavy ? 'dl4' : 'vbn',
        loadout: heavy ? { A: 'dl4', B: 'vbn' } : null,
        skill: 0.62, callsign: heavy ? squadCallsign(47 + i, 1) : squadCallsign(45 + i, 2)
      });
    }

    // 敌方预警机在后方调度窗口
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: T('missions.m8.spawn.label'),
      x: 6000, y: 10000, z: 30000,
      a: M3.V(10000, 0, 30000), b: M3.V(0, 0, 32000)
    });

    w.objective = T('missions.m8.spawn.objective.s1');
    w.objectiveSub = T('missions.m8.spawn.objectiveSub.s1');
  },

  tick: function (w, dt) {
    var i, attackers = 0, bombers = 0;
    /* 第二波（v2.3）：编队的近防炮现在会替玩家拦反舰弹，只有一波太轻松。
       第一波的攻击机和轰炸机打光、或开场 150 s 后（先到者），东面再上一波。
       tick 在胜负判定之前跑，所以第一波清空的那一帧不会先判胜。 */
    if (!w.flags.wave2) {
      var w1 = 0;
      for (i = 0; i < w.actors.length; i++) {
        var a1 = w.actors[i];
        if (a1.team === 1 && a1.alive && (a1.striker || a1.type === 'boulder')) w1++;
      }
      if (w1 === 0 || w.time > 150) {
        w.flags.wave2 = true;
        m8Wave2(w);
        w.radio.raw({ who: 'SEXTANT', cls: 'cmd',
          tx: T('missions.m8.tick.tx'), gap: 1.0 });
      }
    }
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.striker) attackers++;
      else if (a.type === 'boulder') bombers++;
    }
    var fl = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.team !== 0 || !t.alive) continue;
      if (t.model === 'humpback' || t.model === 'spermwhale' || t.model === 'bluewhale') fl++;
    }
    w.objectiveSub = T('missions.m8.tick.objectiveSub.s1') + attackers + T('missions.m8.tick.objectiveSub.s2') + bombers +
      T('missions.m8.tick.objectiveSub.s3') + fl + '/3';

    // 编队挨打
    var hurt = false, sunk = null;
    for (i = 0; i < w.targets.length; i++) {
      var s = w.targets[i];
      if (s.team !== 0 || !s.model) continue;
      if (s.model === 'humpback' || s.model === 'spermwhale' || s.model === 'bluewhale') {
        if (s.alive && s.hp < s.maxHp) hurt = true;
        if (!s.alive && !s._lost) { sunk = s; s._lost = true; }
      }
    }
    if (hurt && !w.flags.fleetHit) {
      w.flags.fleetHit = true;
      w.radio.play('m8', 'fleetHit');
    }
    if (sunk && !w.flags.shipLost) {
      w.flags.shipLost = true;
      w.radio.play('m8', 'shipLost');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    /* 编队里任意一条沉了就算输 —— 这是这一关存在的全部理由。 */
    for (var i = 0; i < w.guarded.length; i++) {
      if (w.guarded[i] && !w.guarded[i].alive) return Mission.fail(w, 'm8.guardLost');
    }
    if (w.baseTarget && !w.baseTarget.alive) return Mission.fail(w, 'm8.baseLost');
    return false;
  }
});
