(function (Game) {
  'use strict';
  var $ = Game.$;
  $.aimDirNow = aimDirNow; $.toggleAimMode = toggleAimMode; $.controlPlayer = controlPlayer;

  /* ============================================================
     玩家控制
     ============================================================ */
  /** 当前瞄准方向（世界坐标单位向量） */
  function aimDirNow() {
    var cp = Math.cos($.aimPitch);
    return M3.V(Math.sin($.aimYaw) * cp, Math.sin($.aimPitch), Math.cos($.aimYaw) * cp);
  }

  /** 从机头重新取瞄准方向（重生、切换飞控模式时） */
  function resetAim() {
    var f = $.player.fwd;
    $.aimYaw = Math.atan2(f.x, f.z);
    $.aimPitch = M3.clamp(Math.asin(M3.clamp(f.y, -1, 1)), -$.AIM_PITCH_LIM, $.AIM_PITCH_LIM);
    $.aimInit = true;
  }

  /** 鼠标引导：把世界瞄准方向交给飞控（AI.steerTo）。
      传 dt 是为了让飞控估计瞄准方向自己的角速度 —— 鼠标拖动中的转弯
      需要前馈，否则只看误差会误以为是小修正（见 steerTo 的说明）。 */
  function updateMouseAim(dt) {
    if (!$.aimInit) resetAim();
    var dir = aimDirNow();
    // 传 player 自身作为状态容器（planAlpha / rollLock / 瞄准角速度）
    AI.steerTo($.player, dir, $.player.ctrl, $.player, dt);
    $.player.aimDir = dir;
  }

  function toggleAimMode() {
    $.aimMode = !$.aimMode;
    $.aimInit = false;
    if ($.aimMode) $.requestAimLock();
    $.player.aimDir = null;
    if (!$.aimMode && document.pointerLockElement === $.cv && document.exitPointerLock) document.exitPointerLock();
    $.cv.style.cursor = $.aimMode ? 'none' : 'default';
    Radio.raw({
      who: CALLSIGN.player, cls: 'ally',
      tx: $.aimMode
        ? T('engine.game.control.toggleAimMode.tx.s1')
        : T('engine.game.control.toggleAimMode.tx.s2'),
      gap: 0.7
    });
    SFX.confirm();
  }

  function controlPlayer(dt) {
    $.updateTargetKey();
    if (!$.player.alive) return;
    var c = $.player.ctrl;

    /* 失败停留期间：输入冻结，飞机交给平飞自动驾驶 ——
       免得玩家在失败提示下又被打死，或者又"救回来"。 */
    if ($.failing) {
      var f = $.player.fwd;
      var lvl = M3.norm(M3.V(f.x, 0, f.z));
      AI.steerTo($.player, lvl, c, null, 0);
      $.player.gLoad = M3.smooth($.player.gLoad || 1, 1, 6, dt);
      $.player.hiG = false;
      SFX.gun(false);
      return;
    }

    /* 干扰弹：按住 V 连续投放，一次一组。
       "组"才是战术单位 —— 真实中也是按一个程序打出去，
       而不是一发一发抠。投放节奏由 breakLock 里的 flareCd 控制（0.45 s），
       而同一枚弹被反复投放会越来越难骗（见 breakLock 的抗欺骗计数）。 */
    if ($.keys.KeyV) {
      if (Ent.breakLock($.player, $.world)) {
        /* 投放了但一枚都没骗到，而那枚弹其实已经被骗过一次 ——
           这是"继续丢没用"的唯一信号。每 10 秒最多提醒一次，
           否则一直按着 V 会把无线电刷满。 */
        if ($.player.decoysIneffective > 0) {
          if ($.player.decoyWarnT === undefined) $.player.decoyWarnT = 0;
          if ($.player.decoyWarnT <= 0) {
            $.player.decoyWarnT = 10;
            Radio.raw({
              who: CALLSIGN.wing2, cls: 'ally',
              tx: T('engine.game.control.controlPlayer.tx'), gap: 0.7
            });
          }
        }
      }
    }
    if ($.player.decoyWarnT > 0) $.player.decoyWarnT -= dt;

    if ($.aimMode) {
      // 鼠标引导：飞控把机头指向瞄准点，但照样受动压与失速限制
      updateMouseAim(dt);
      var kp = ($.keys.KeyW ? 1 : 0) + ($.keys.KeyS ? -1 : 0);
      var kr = ($.keys.KeyD ? 1 : 0) + ($.keys.KeyA ? -1 : 0);
      var ky = ($.keys.KeyE ? 1 : 0) + ($.keys.KeyQ ? -1 : 0);
      if (kp) c.pitch = kp;        // 键盘随时可以覆盖飞控
      if (kr) c.roll = kr;
      if (ky) c.yaw = ky;
    } else {
      c.pitch = ($.keys.KeyW ? 1 : 0) + ($.keys.KeyS ? -1 : 0);
      c.roll = ($.keys.KeyD ? 1 : 0) + ($.keys.KeyA ? -1 : 0);
      c.yaw = ($.keys.KeyE ? 1 : 0) + ($.keys.KeyQ ? -1 : 0);
    }

    // 单一油门轴：推满自动进加力，收到底自动张减速板。
    var thrIn = 0;
    if ($.keys.ShiftLeft || $.keys.ShiftRight) thrIn += 1;
    if ($.keys.ControlLeft || $.keys.ControlRight) thrIn -= 1;

    /* 加力和减速板都是"按住才有效"的临时状态。

       油门轴是连续的（0 → 1.25）：越过 1.0 进加力，低于 THR_IDLE 张减速板。
       但松手之后不该停在那个区间里 —— 否则玩家松开键，
       飞机还在烧加力（或者还挂着减速板），而他的预期是"回到常规推力"。

       所以松手时自动回落到军推区间的边界（1.0 / THR_IDLE）。
       回落比推进慢一些，免得一松手就"咔"地弹回来。 */
    if (thrIn) {
      $.player.throttle += thrIn * dt * 0.62;
    } else if ($.player.throttle > 1.0) {
      $.player.throttle = Math.max(1.0, $.player.throttle - dt * 1.6);
    } else if ($.player.throttle < $.THR_IDLE) {
      $.player.throttle = Math.min($.THR_IDLE, $.player.throttle + dt * 1.6);
    }


    /* ---- 高 G 机动 ----
       只有在"确实在使劲转"的时候才允许触发 —— 鼠标只偏一点点时
       按住 G 不会有任何效果，否则它会变成一个无脑常开的加速器。
       代价是动能：角速度放大后转弯掉速也跟着放大（见 stepAircraft），
       速度掉到 1.3 倍失速以下就自动退出。 */
    var demand = Math.abs(c.pitch) + Math.abs(c.roll);
    var canG = $.player.speed > $.player.phys.vStall * 1.30;
    var wantG = !!$.keys.KeyG && demand > 0.55 && canG;

    if (wantG) {
      $.player.gLoad = M3.smooth($.player.gLoad || 1, $.HIG_MAX, 9, dt);
    } else {
      $.player.gLoad = M3.smooth($.player.gLoad || 1, 1, 6, dt);
    }
    $.player.hiG = wantG;

    $.player.throttle = M3.clamp($.player.throttle, 0, $.THR_MAX);
    $.player.ab = $.player.throttle > 1.0;
    $.player.brake = $.player.throttle < $.THR_IDLE;

    var wantGun = $.mouse.left || $.keys.Space;
    if (wantGun) Ent.fireGun($.player, $.world);
    SFX.gun(wantGun && $.player.gunAmmo > 0);
  }
})(Game);
