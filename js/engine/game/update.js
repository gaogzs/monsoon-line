(function (Game) {
  'use strict';
  var $ = Game.$;
  $.update = update;

  /* ============================================================
     更新
     ============================================================ */
  /* ============================================================
     看门狗

     有飞机在空中"钉住"过 —— 位置完全不动，但速度读数还是正常的。
     根因没定位到，所以这里先放一道兜底：任何一架飞机静止超过
     1.5 秒，就把它的姿态与速度重置回可飞状态，并在控制台留记录。

     为什么值得兜底：玩家没法分辨"这架飞机卡住了"和"我打不着它"，
     一架悬在空中的敌机会让整场战斗都显得坏了。
     为什么留 console：万一真被触发，那条记录（含当时的速度、
     姿态、操控输入）就是下次定位根因的起点。

     注意任务结束后 update() 不再运行，所以不会把"结算时的静止"
     误判成卡死。
     ============================================================ */
  var WD_LIMIT = 1.5;

  function watchdog(dt) {
    if (!$.world) return;
    for (var i = 0; i < $.world.actors.length; i++) {
      var a = $.world.actors[i];
      if (!a.alive) { a.wdStill = 0; continue; }

      var moved = a.wdPrev
        ? Math.abs(a.pos.x - a.wdPrev.x) + Math.abs(a.pos.y - a.wdPrev.y) +
          Math.abs(a.pos.z - a.wdPrev.z)
        : 1e9;
      if (!a.wdPrev) a.wdPrev = { x: 0, y: 0, z: 0 };
      a.wdPrev.x = a.pos.x; a.wdPrev.y = a.pos.y; a.wdPrev.z = a.pos.z;

      if (moved < 0.02) a.wdStill = (a.wdStill || 0) + dt;
      else a.wdStill = 0;

      if (a.wdStill > WD_LIMIT) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[季风线] 看门狗触发：' + (a.name || a.id) +
            ' 静止 ' + a.wdStill.toFixed(1) + 's' +
            ' | speed=' + a.speed +
            ' | fwd=' + JSON.stringify(a.fwd) +
            ' | ctrl=' + JSON.stringify(a.ctrl) +
            ' | pos=' + JSON.stringify(a.pos) +
            ' | hp=' + a.hp + '/' + a.maxHp);
        }
        a.fwd = M3.V(0, 0, 1);
        a.up = M3.V(0, 1, 0);
        a.right = M3.V(1, 0, 0);
        a.speed = Math.max(a.phys.vStall * 1.4, 180);
        a.vel = M3.mul(a.fwd, a.speed);
        a.stall = false;
        a.wdStill = 0;
      }
    }
  }

  function update(dt) {
    $.world.time += dt;
    Radio.update(dt);

    /* 关卡时限。超时由 loss 分支统一判负（见下面 mission.lose 那一段）——
       任务脚本不需要自己写倒计时，只要在 mission 上声明 timeLimit。 */
    if ($.world.timeLimit > 0 && $.world.timeLeft > 0) {
      $.world.timeLeft -= dt;
      if ($.world.timeLeft <= 0) $.world.timeLeft = 0;
      if ($.world.timeLeft === 0 && !$.world.flags.timeUp) {
        $.world.flags.timeUp = true;
        Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: T('engine.game.update.update.tx'), gap: 1.0 });
      }
    }

    if ($.player.alive) $.controlPlayer(dt);
    else SFX.gun(false);

    // 玩家
    Ent.stepAircraft($.player, dt, $.world);
    $.updateEWAuto(dt);            // 协处理器可能在你按扳机之前就开机了
    $.updateLock(dt);
    $.updateDEW(dt, $.player);
    $.updateJamming(dt);           // 范围压制场（下游的烧穿路线）
    $.updateAewc(dt);              // 预警机：通报、调度、被压制时沉默

    /* AI。玩家也在 world.actors 里（startMission 把它推进去，好让 AI 的选敌、碰撞都看得见它），
       但它上面已经单独 stepAircraft 过一次 —— 这里必须跳过。
       以前没跳：从第一个版本起玩家每帧被推进两次，实际位移、转弯、加减速都是显示值的两倍，
       无人僚机开满加力也追不上（v2.3 修）。 */
    for (var i = 0; i < $.world.actors.length; i++) {
      var a = $.world.actors[i];
      if (!a.alive || a.isPlayer) continue;
      if (a.ai) AI.update(a, dt, $.world);
      Ent.stepAircraft(a, dt, $.world);
      $.updateDEW(dt, a);
    }

    watchdog(dt);

    // 导弹（先放出到点的连射延迟弹）
    $.stepShotQueue(dt);
    for (i = 0; i < $.world.missiles.length; i++) Ent.stepMissile($.world.missiles[i], dt, $.world);
    // 子弹
    for (i = 0; i < $.world.bullets.length; i++) Ent.stepBullet($.world.bullets[i], dt, $.world);

    $.resolveBullets(dt);
    $.updateTargets(dt);
    // 飞机上的炮塔（ROK-40 尾炮）
    for (i = 0; i < $.world.actors.length; i++) {
      if ($.world.actors[i].alive && $.world.actors[i].turrets) Turret.stepAll($.world.actors[i], $.world, dt);
    }
    Ent.stepParticles($.world.particles, dt);

    /* 附近飞机的引擎声：取**最近的一架**驱动那条共享音链。

       不可能每架 NPC 各建一条（11 架 × 4 个振荡器 = 44 个节点），
       而绝大多数时候它们根本听不见。战场环境里最该被听见的，
       恰好就是最近的那一架 —— 无论敌机咬尾还是僚机归队，
       都是这个音最先起变化。 */
    var nBest = null, nBd = 1e9;
    for (i = 0; i < $.world.actors.length; i++) {
      var na = $.world.actors[i];
      if (!na.alive || na === $.player) continue;
      var nd = M3.dist(na.pos, $.player.pos);
      if (nd < nBd) { nBd = nd; nBest = na; }
    }
    if (nBest && nBd < 1500) SFX.nearby(nBd, nBest.throttle || 0.8, !!nBest.ab);
    else SFX.nearby(99999, 0, false);

    // 导弹告警
    /* 判据：**当前锁定本机的**，或者**刚被诱饵骗掉、还在本机附近飞**的弹。

       以前只认 `m.target === player`，于是撒出诱饵、导弹丢了锁的那一瞬间，
       "滴滴滴"就没了 —— 可那枚弹并没有消失：它只是被诱饵带偏了，而且
       盲飞期一过还可能重新咬回来（v11 / mrm / wasp 带 reAcquire）。
       玩家听到静音就以为威胁解除，这是最危险的一类假信号。

       注意排除已经失效或飞远的弹：告警不能在诱饵起作用之后一直响到
       天荒地老，那样它也会失去意义。 */
    var warn = false;
    for (i = 0; i < $.world.missiles.length; i++) {
      var m = $.world.missiles[i];
      if (!m.alive || m.team === $.player.team) continue;
      var md = M3.dist(m.pos, $.player.pos);
      if (md >= 3600) continue;
      var lockedOn = (m.target === $.player);
      var stillAround = (m.spoofed === $.player && m.reLockT > 0);
      if (lockedOn || stillAround) warn = true;
    }
    SFX.warning(warn);

    // 引擎音
    if ($.player.alive) SFX.engine($.player.throttle, $.player.ab, true);
    else SFX.engine(0, false, false);

    // 撞击告警
    if ($.player.alive && $.player.pos.y < 260 && $.player.fwd.y < -0.1) SFX.terrain();
    if ($.player.stall) SFX.stall();

    // 任务逻辑
    $.mission.tick($.world, dt);

    // 清理
    compact();

    // 统计：按击杀者分开记功（Ent.kill 写的 killedBy）
    var k = 0, kw = 0, ks = 0;
    for (i = 0; i < $.world.actors.length; i++) {
      var deadA = $.world.actors[i];
      if (deadA.team !== 1 || deadA.alive) continue;
      var credit = $.killCredit(deadA);
      if (credit === 'player') k++;
      else if (credit === 'wing') kw++;
      else if (credit === 'ship') ks++;
    }
    $.world.wingKilled = kw;
    $.world.shipKilled = ks;
    /* KILL：飞机（含机炮击落）和地面 / 海面目标都算；同一帧有 KILL 就不再报 HIT */
    var gkNow = $.world.groundKilled || 0, killedNow = false;
    if (k > $.world.killed) {
      $.hits.push({ txt: 'KILL  ' + k, t: 1.1, col: HUD.AMBER });
      SFX.confirm();
      killedNow = true;
    }
    if (gkNow > ($.world.gkSeen || 0)) {
      $.hits.push({ txt: 'KILL', t: 1.1, col: HUD.AMBER });
      if (!killedNow) SFX.confirm();
      killedNow = true;
    }
    $.world.gkSeen = gkNow;
    $.world.killed = k;
    $.combatEvents(killedNow);

    /* 玩家受击台词（VOICES.<关>.playerHit，目前只有 m1 写了）：血量掉了且没死，25 s 限频一次 */
    var f2 = $.world.flags2, php = $.player.hp;
    if ($.player.alive && f2.hpSeen !== undefined && php < f2.hpSeen - 1 &&
        $.world.time - (f2.hitRadioT === undefined ? -99 : f2.hitRadioT) > 25) {
      f2.hitRadioT = $.world.time;
      Radio.play($.mission.id, 'playerHit');
    }
    f2.hpSeen = php;

    // 胜负
    /* 时限判负在同一处兜住：声明了 timeLimit 的关卡不需要在自己的 lose()
       里再写一遍倒计时判断，避免十个关卡十种写法。 */
    /* 失败不直接结算：先 beginFail —— 停在游戏画面上，弹失败提示、播失败无线电，
       FAIL_HOLD_S 之后（或点"结束"）才进结算页。停留期间世界照常推进、相机照常跟，
       所以这里不能 return 跳过后面的 updateCamera；也不再判胜负。 */
    if ($.failing) {
      if ($.world.time - $.failing.t0 >= $.failing.hold) $.endFail();
    } else if ($.world.timeLimit > 0 && $.world.timeLeft <= 0) {
      $.beginFail();
    } else if ($.mission.lose($.world)) {
      $.beginFail();
    } else if ($.mission.win($.world)) {
      $.finish(true); return;
    }
    if ($.state !== 'playing') return;      // endFail 已经进了结算页

    // 僚机损失台词
    if (!$.world.flags.allyDown && $.world.wings[3] && !$.world.wings[3].alive) {
      $.world.flags.allyDown = true;
      Radio.play($.mission.id, 'allyDown');
    }

    $.updateCamera(dt);

    for (i = 0; i < $.hits.length; i++) $.hits[i].t -= dt;
    $.hits = $.hits.filter(function (h) { return h.t > 0; });
    if ($.banner.t > 0) $.banner.t -= dt;
  }

  function compact() {
    var i;
    var arr = $.world.missiles, out = [];
    for (i = 0; i < arr.length; i++) if (arr[i].alive) out.push(arr[i]);
    $.world.missiles = out;

    arr = $.world.bullets; out = [];
    for (i = 0; i < arr.length; i++) if (arr[i].alive) out.push(arr[i]);
    $.world.bullets = out;

    arr = $.world.particles; out = [];
    for (i = 0; i < arr.length; i++) if (arr[i].alive) out.push(arr[i]);
    if (out.length > 900) out.splice(0, out.length - 900);
    $.world.particles = out;
  }
})(Game);
