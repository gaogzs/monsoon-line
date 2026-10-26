(function (Game) {
  'use strict';
  var $ = Game.$;
  $.updateEWAuto = updateEWAuto; $.updateJamming = updateJamming; $.updateAewc = updateAewc; $.updateLock = updateLock;

  /* ============================================================
     锁定
     ============================================================ */
  /* 玩家挂了哪一件**主动**电子战吊舱（没有就返回 null）。 */
  function playerEcmPod() {
    var lo = $.player.loadout;
    if (!lo) return null;
    for (var k in lo) {
      var w = WEAPONS[lo[k]];
      if (w && w.kind === 'ecm' && !w.tags.passive) return lo[k];
    }
    return null;
  }

  /* 电子战协处理器的自主决策。

     设定 7.3：这台协处理器"有权在没有飞行员指令的情况下自主改变干扰
     策略 —— 这是全机唯一被授予此权限的子系统"。落到玩法上就是：
     你被主动雷达盯上、而吊舱已经冷却好时，它自己开机，不等你按扳机。

     player.ewAuto 允许关掉（HUD 上显示 EW AUTO / EW MAN）；
     进了 EMCON-Δ 它也必须闭嘴 —— 静默状态不允许任何辐射。 */
  function updateEWAuto(dt) {
    if (!$.player.alive || $.player.emcon || !$.player.ewAuto) return;
    if ($.player.spActive > 0 || $.player.spCd > 0) return;
    var pod = playerEcmPod();
    if (!pod) return;
    for (var i = 0; i < $.world.actors.length; i++) {
      var e = $.world.actors[i];
      if (!e.alive || !Ent.hostile(e, $.player)) continue;
      if (e.target !== $.player) continue;                  // 它没在锁我
      if (M3.dist2(e.pos, $.player.pos) > 8000 * 8000) continue;
      $.fireEcm($.player, pod);
      Radio.raw({
        who: 'SEXTANT', cls: 'cmd',
        tx: T('engine.game.lock.updateEWAuto.tx'), gap: 0.8
      });
      return;
    }
  }

  /* ============================================================
     空中预警机
     ============================================================ */
  /* 预警机不是战斗机，是**眼睛**。它用四条现有链路干活，不新增系统：

       搜敌   与 nearestEnemy 同构的几何搜索，半径 30 km
              （普通 AI 只有 11–15 km —— 这就是"看得更远"）
       通报   现成的 bearing() + Radio.raw()
       调度   现成的 setWingCmd()（对自家僚机）/ a.ai.target（对敌方编队）
       沉默   被干扰机压制时闭嘴（新增的 suppressed）

     击落它，这些全部停止：没有通报，也没有人替你调度僚机。 */
  /* ============================================================
     范围压制（下游的"烧穿"路线）
     ============================================================ */
  function updateJamming(dt) {
    var i, j;
    /* 每帧重算：压制是"此刻被照着"，不是一种累积状态 ——
       离开那片空域，下一帧就恢复。 */
    for (i = 0; i < $.world.actors.length; i++) $.world.actors[i].suppressed = 0;
    var tl = $.world.targets || [];
    for (i = 0; i < tl.length; i++) tl[i].suppressed = 0;
    for (i = 0; i < $.world.actors.length; i++) {
      var a = $.world.actors[i];
      if (!a.alive || a.ewPower <= 0) continue;
      var r = a.ewFieldR || 0;
      if (r <= 0) continue;
      for (j = 0; j < $.world.actors.length; j++) {
        var e = $.world.actors[j];
        if (!e.alive || !Ent.hostile(e, a) || e === a) continue;
        var d = M3.dist(e.pos, a.pos);
        if (d > r) continue;
        // 越靠中心越强；乘 ewPower 是为了让"关机"自动归零
        var k = a.ewFieldK * (1 - d / r) * a.ewPower;
        e.suppressed = Math.max(e.suppressed, Math.min(1, k));
      }
      /* 舰船 / 地面设施也会被压，但只吃一半（Ent.JAM_SURF_K）：
         大功率雷达 + 多套传感器，比战斗机难压得多。 */
      for (j = 0; j < tl.length; j++) {
        var g = tl[j];
        if (!g.alive || !Ent.hostile(g, a)) continue;
        var dg = M3.dist(g.pos, a.pos);
        if (dg > r) continue;
        var kg = a.ewFieldK * (1 - dg / r) * a.ewPower * Ent.JAM_SURF_K;
        g.suppressed = Math.max(g.suppressed, Math.min(1, kg));
      }
    }
  }

  function updateAewc(dt) {
    for (var i = 0; i < $.world.actors.length; i++) {
      var a = $.world.actors[i];
      if (!a.aewc || !a.alive) continue;

      /* 被压制就闭嘴 —— 这是它与电子战体系的耦合点：
         干扰机压住预警机，玩家丢的不只是一部雷达，是整条指挥链。 */
      var jammed = (a.suppressed || 0) > 0.3;
      if (jammed !== !!a.aewcJammed) {
        a.aewcJammed = jammed;
        Radio.raw({
          who: a.label || a.name, cls: 'cmd',
          tx: jammed ? T('engine.game.lock.updateAewc.tx.s1')
            : T('engine.game.lock.updateAewc.tx.s2'),
          gap: 0.8
        });
      }
      if (jammed) continue;

      a.aewcT = (a.aewcT === undefined ? 3 : a.aewcT) - dt;
      if (a.aewcT > 0) continue;
      a.aewcT = 9 + M3.rnd(0, 1) * 4;

      if (a.team === $.player.team) aewcReportAlly(a);
      else aewcReportEnemy(a);
    }
  }

  /* 我方预警机：报出最近的敌机，并在必要时替你调度僚机。 */
  function aewcReportAlly(a) {
    var best = null, bd = 30000 * 30000;
    for (var i = 0; i < $.world.actors.length; i++) {
      var e = $.world.actors[i];
      if (!e.alive || !Ent.hostile(e, a)) continue;
      var d = M3.dist2(e.pos, a.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    var d = Math.sqrt(bd);
    Radio.raw({
      who: a.label || a.name, cls: 'cmd',
      tx: T('engine.game.lock.aewcReportAlly.tx.s1') + $.bearing(a.pos, best.pos) + T('engine.game.lock.aewcReportAlly.tx.s2') +
        (d / 1000).toFixed(1) + T('engine.game.lock.aewcReportAlly.tx.s3') + (Math.round(best.pos.y / 100) * 100) + T('engine.game.lock.aewcReportAlly.tx.s4'),
      gap: 1.0
    });

    /* 替你调度僚机 —— 这是"预警机在指挥"最直接的体现。
       你刚手动下过指令就不插手（8 秒内），支援单位不该抢操作。 */
    var near = M3.dist2(best.pos, $.player.pos) < 6000 * 6000;
    var next = near ? 'spread' : 'focus';
    if (next !== $.world.wingCmd && $.world.time - ($.world.lastWingCmdT || -99) > 8) {
      $.setWingCmd(next);
    }
  }

  /* 敌方预警机：给它自己的人分配目标 —— 下游的"有组织集火"。
     打掉它，他们就退回各自为战，这正是它值钱的地方。 */
  function aewcReportEnemy(a) {
    var best = null, bd = 30000 * 30000;
    for (var i = 0; i < $.world.actors.length; i++) {
      var e = $.world.actors[i];
      if (!e.alive || !Ent.hostile(e, a)) continue;
      var d = M3.dist2(e.pos, a.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    var n = 0;
    for (i = 0; i < $.world.actors.length; i++) {
      var m = $.world.actors[i];
      if (!m.alive || m.team !== a.team || !m.ai || m === a) continue;
      if (m.route) continue;                    // 航线型单位不参与空战
      if (m.behavior === 'recon') continue;     // 侦察 / 播撒构型不接战
      if (m.bigTarget) continue;                // 大型机不是用来格斗的
      /* 目标比它自己的升限还高一截时不派。

         派了也咬不到 —— 它只会硬爬到没有舵效的高度，
         最后停在那儿既打不着人、也甩不掉别人。 */
      if (m.ac && best.pos.y > ((m.ac.ceiling || 16000) + 1500)) continue;
      if (n >= 3) break;
      m.ai.target = best;
      m.ai.retargetT = 6;                       // 六秒内不自己重选
      n++;
    }
  }

  function updateLock(dt) {
    var t = $.player.target;
    $.player.lockInCone = false;            // HUD 用：目标在不在这件弹的锁定锥里（drawConeCue）
    $.player.lockInRange = false;           // HUD 用：目标在不在锁定距离内
    /* 视场锥每帧重算；提前返回的分支（没目标 / 类别不对）清零，HUD 退回当前武器的锥 ——
       否则切换武器后视场圈还停在上一件弹的大小 */
    $.player.lockCone = 0;
    if (!t || !t.alive) {
      if (t && !t.alive) $.player.target = null;
      $.player.lockProgress = 0;
      $.player.locked = false;
      return;
    }
    /* 被压制到看不清这个目标（flicker / hidden）：锁定强制取消，目标清空。
       要等飞进烧穿距离、或者离开压制场，再按 F 重新选。 */
    if (Ent.jamState($.player, t) !== 'clear') {
      $.player.target = null;
      $.player.lockProgress = 0;
      $.player.locked = false;
      return;
    }
    var w = WEAPONS[$.player.special];
    if (!w || w.kind === 'ecm' || w.kind === 'dew') { $.player.lockProgress = 1; return; }

    /* 目标类别和当前武器对不上（对空弹选着浮台 / 对面弹选着飞机）：
       **根本不开始锁定** —— 目标照样保留选中，换回对路的弹就接着锁。
       以前这一关放在开火那一刻：锁得满满的，按下去才被拦。 */
    if ($.targetMismatch(w, t)) {
      $.player.lockOk = false;
      $.player.lockProgress = 0;
      $.player.locked = false;
      return;
    }

    var toT = M3.sub(t.pos, $.player.pos);
    var dist = M3.len(toT);
    var dir = M3.mul(toT, 1 / Math.max(1, dist));
    var off = M3.angleBetween($.player.fwd, dir);

    // 高空导引头视场收窄
    var cone = w.lockCone;
    if ($.player.pos.y > 18000) cone *= 0.78;
    var lockDist = w.lockDist;
    // 光电 / 红外搜索吊舱提供的锁定距离加成
    if ($.player.lockRangeK) lockDist *= $.player.lockRangeK;

    /* 双向压制（设定 8.3「干扰是双向的」）。

       自己的干扰机在压制对方接收机的同一时刻，也在压制自己的 ——
       这是"认知电子战吊舱开机之后你自己的雷达同时被压制"的落点。
       强度取 ewPower（那条爬升→压制→被对抗掉的曲线），而不是
       一个开关：干扰刚开时你自己也最瞎，对手完成对抗之后两边一起恢复。

       注意这里**不再看 spActive** —— 玩家随时可以切走吊舱，
       但辐射还在持续。用 ewPower 才不会出现"切枪即免疫"。 */
    if ($.player.ewPower > 0) {
      lockDist *= (1 - ($.player.ewLockReduce || 0.40) * $.player.ewPower);
      // 雷达受扰时红外弹仍可发射，但锁定锥收窄到 ±20°
      cone = Math.min(cone, 20 * Math.PI / 180);
    }

    /* EMCON-Δ：雷达关机，只剩被动手段 —— 锁定距离直接砍半。
       这是"更难被发现"那一头的代价，与被动吊舱的 +45% 正好互为反面。 */
    if ($.player.emcon) lockDist *= 0.5;

    /* 被敌方干扰机压制（suppressed）：锁定距离最多砍一半，锁定也更慢（见下面的 rate）。 */
    lockDist *= Ent.jamLockK($.player);

    /* 目标自己的被动抗锁（SAV-6 / ZUN-8 这类吊舱汇总出来的 lockResist）。
       AI 锁玩家时一直在读它（ai.js），玩家锁 AI 时以前却不读 ——
       敌机挂的干扰吊舱对玩家完全没用。 */
    if (t.lockResist) lockDist *= (1 - t.lockResist);

    /* ---------- 对空与对面是两套完全不同的判据 ----------

       对空弹靠**导引头**：受视场锥角限制，目标偏出锥外就丢，
       而且丢失之后进度会掉。所以判据是"距离 + 离轴角"。

       对面弹靠**火控投放解算**：飞机不必把机头对准浮台 ——
       火控要算的是"这一下能不能扔到"。所以判据是"距离 + 俯角"，
       没有锥角这回事。

       以前这两个分支的代码一模一样（都是 dist < lockDist && off < cone），
       等于拿导引头的逻辑去锁海面：玩家得把机头死死指着浮台，
       稍微偏一点就"丢锁" —— 而对地武器本来就不是那么用的。 */
    var ok = false;
    $.player.lockCone = cone;
    if (Ent.targetClass(w, t) === 'air') {      // 对空对地通用（any）随目标类别走
      $.player.lockInCone = off < cone;
      $.player.lockInRange = dist < lockDist;
      ok = dist < lockDist && off < cone;
    } else if (w.target === 'any') {
      /* 对地一侧的 any 弹（TOR-3）：锁距离与对空一样，不乘 1.35，也不做俯角判据 */
      $.player.lockInCone = Ent.lockOff($.player, t, w) < cone;
      $.player.lockInRange = dist < lockDist;
      ok = dist < lockDist && $.player.lockInCone;
    } else {
      /* 投放包线：水平距离够近，并且目标在机头下方。
         dir 是指向目标的世界方向，dir.y 直接就是它的高低 ——
         dir.y 为正表示目标在机头上方，那是仰投，不该给解。 */
      /* 方位限制：只量水平方位（Ent.lockOff），世界垂直方向不算 ——
         与 AI、航线 strike 同一条规则。以前这里只看俯角，正后方的目标也锁得上。 */
      var dep = -dir.y;                       // 目标低于机头的程度（sin）
      $.player.lockInCone = Ent.lockOff($.player, t, w) < cone;
      $.player.lockInRange = dist < lockDist * 1.35;
      ok = dist < lockDist * 1.35 && dep > -0.10 && $.player.lockInCone;
    }

    /* 锁定速率按导引方式分档。

       红外最快 —— 它出膛之后还能自己找目标，火控不需要那么精确；
       雷达居中；激光最慢，因为它要求的是"稳住照射"，
       机头一偏照射就断，得重新建立。 */
    var rate = 1 / (w.nezer ? 1.5
      : (w.seeker === 'ir' ? 0.55
        : (w.seeker === 'eo' ? 0.60      // 光电与红外同属被动成像，都快
          : (w.seeker === 'laser' ? 1.6 : 1.1))));
    rate *= Ent.jamLockK($.player);
    if (ok) {
      if ($.player.lockProgress < 1 && $.player.lockProgress + rate * dt >= 1) {
        SFX.lock();
        $.player.audioLocked = true;
      }
      $.player.lockProgress = Math.min(1, $.player.lockProgress + rate * dt);
      $.player.locked = $.player.lockProgress >= 1;
      $.player.lockOk = true;
    } else {
      $.player.lockOk = false;
      $.player.lockProgress = Math.max(0, $.player.lockProgress - dt * 2.2);
      $.player.locked = false;
    }
  }
})(Game);
