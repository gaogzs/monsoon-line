(function (Game) {
  'use strict';
  var $ = Game.$;
  $.bindInput = bindInput; $.setWingCmd = setWingCmd; $.updateTargetKey = updateTargetKey; $.cycleTarget = cycleTarget; $.targetMismatch = targetMismatch;

  /* ============================================================
     输入
     ============================================================ */
  function bindInput() {
    document.addEventListener('keydown', function (e) {
      $.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();

      if ($.state === 'playing' && $.failing && e.code === 'KeyH') $.endFail();   // 失败提示期间 H / Esc 都当作"结束"
      if ($.state === 'playing' && !$.failing) {
        if (e.code === 'KeyH') $.togglePause();
        if (e.code === 'KeyM') $.toggleAimMode();
        /* F / Tab：松开时切换目标；按住超过 TGT_HOLD 秒则取消选择（见 updateTargetKey）。
           切换放在松开时，长按才不会先切一次再取消。 */
        if ((e.code === 'KeyF' || e.code === 'Tab') && !e.repeat) {
          tgtKey.down = performance.now(); tgtKey.cleared = false;
        }
        if (e.code === 'KeyR') cycleSpecial();
        // V 改成按住连发，见 controlPlayer()
        if (e.code === 'Enter') fireSpecial();
        if (e.code === 'Digit1' && $.player) setWingCmd('spread');
        if (e.code === 'Digit2' && $.player) setWingCmd('focus');
        if (e.code === 'Digit3' && $.player) setWingCmd('cover');
        if (e.code === 'KeyN' && $.player) toggleEmcon();
      }
      if (e.code === 'Escape') {
        if ($.state === 'playing') { if ($.failing) $.endFail(); else $.togglePause(); }
        else if (['hangar', 'codex', 'help', 'brief', 'campaign', 'changelog'].indexOf($.state) >= 0) $.show('title');
      }
    });
    document.addEventListener('keyup', function (e) {
      $.keys[e.code] = false;
      if ((e.code === 'KeyF' || e.code === 'Tab') && tgtKey.down) {
        if ($.state === 'playing' && !$.failing && !tgtKey.cleared) cycleTarget();
        tgtKey.down = 0;
      }
    });

    window.addEventListener('blur', function () {
      $.keys = {};
      $.mouse.left = $.mouse.right = false;
      if ($.state === 'playing' && !$.paused && !$.failing) $.togglePause();
    });

    $.cv.addEventListener('mousedown', function (e) {
      SFX.unlock();
      // 鼠标引导要锁定指针：瞄准方向由位移驱动，指针跑出窗口就断了
      if ($.state === 'playing' && !$.paused && !$.failing) $.requestAimLock();
      if (e.button === 0) $.mouse.left = true;
      if (e.button === 2) { $.mouse.right = true; fireSpecial(); }
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) $.mouse.left = false;
      if (e.button === 2) $.mouse.right = false;
    });
    $.cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    $.cv.addEventListener('mousemove', function (e) {
      var r = $.cv.getBoundingClientRect();
      $.mouse.x = e.clientX - r.left;
      $.mouse.y = e.clientY - r.top;
      /* 鼠标位移转动瞄准方向。没拿到指针锁时 movementX/Y 照样有，
         只是指针会碰到窗口边缘 —— 能飞，但锁定后才是完整的手感。 */
      if ($.state === 'playing' && $.aimMode && !$.paused && !$.failing && $.aimInit) {
        var mx = e.movementX || 0, my = e.movementY || 0;
        /* 丢掉位移尖峰。浏览器偶尔会报一个几百上千像素的 movementX/Y：
           Chrome 锁定指针时的已知毛病，以及没锁定时光标移出画布再移回来的
           第一下。它会把准星瞬间甩到一个"随机"方向，镜头跟过去，看起来就是
           镜头被重置。正常甩鼠标单个事件远到不了 AIM_SPIKE_PX。 */
        if (Math.abs(mx) > $.AIM_SPIKE_PX || Math.abs(my) > $.AIM_SPIKE_PX) return;
        var fovK = ($.S.fov || 56) / 56;      // 放大视野时灵敏度跟着降，屏幕上的手感一致
        $.aimYaw += mx * $.AIM_SENS * fovK;
        $.aimPitch = M3.clamp($.aimPitch - my * $.AIM_SENS * fovK,
          -$.AIM_PITCH_LIM, $.AIM_PITCH_LIM);
      }
    });

    $.cv.addEventListener('wheel', function (e) {
      if ($.state !== 'playing' || !$.player) return;
      $.player.throttle = M3.clamp($.player.throttle - e.deltaY * 0.0007, 0, $.THR_MAX);
    }, { passive: true });

    window.addEventListener('resize', function () { Renderer.resize(); });
  }

  /* EMCON-Δ：完全电磁静默。

     术语表里的定义是"雷达关机、数据链断开、干扰机停止辐射"。
     玩法上它是一笔明确的交易：更难被对方发现，代价是自己也几乎瞎了
     （锁定距离减半，见 updateLock()）。干扰机必须停下来 ——
     一个还在辐射的平台不叫静默。 */
  function toggleEmcon() {
    if (!$.player || !$.player.alive) return;
    $.player.emcon = !$.player.emcon;
    if ($.player.emcon) {
      $.player.spActive = 0;          // 干扰机停辐射
      $.player.ewPower = 0;
      $.player.ewWid = null;
    }
    SysNote.show($.player.emcon
      ? T('ui.input.toggleEmcon.s1')
      : T('ui.input.toggleEmcon.s2'));
    SFX.confirm();
  }

  function setWingCmd(cmd) {
    /* 发不出指令的两种情况（都只管"下令"，不动僚机的攻击授权）：
         电磁静默   —— 数据链是自己断的
         长机被压制 —— 数据链被敌方干扰机压断
       僚机自己被压制才会停火，见 ai.js 的 drone 分支。 */
    if ($.player && $.player.emcon) {
      SysNote.show(T('ui.input.setWingCmd.s1'));
      return;
    }
    if ($.player && ($.player.suppressed || 0) > 0.35) {
      SysNote.show(T('ui.input.setWingCmd.s2'), { warn: true });
      return;
    }
    var names = { spread: T('ui.input.setWingCmd.names.spread'), focus: T('ui.input.setWingCmd.names.focus'), cover: T('ui.input.setWingCmd.names.cover') };
    for (var k in $.world.wings) {
      if ($.world.wings[k] && $.world.wings[k].ai) $.world.wings[k].ai.cmd = cmd;
    }
    /* 记下玩家最后一次手动下令的时刻与档位。

       预警机（updateAewc）在 8 秒内不再自动下指令 —— 支援单位可以
       替你操心，但不该抢你的操作。HUD 也读这个值画当前指令。 */
    $.world.lastWingCmdT = $.world.time;
    $.world.wingCmd = cmd;
    Radio.raw({ who: CALLSIGN.player, cls: 'ally', tx: T('ui.input.setWingCmd.tx.s1') + names[cmd] + '</b>', gap: 0.5 });
    SFX.confirm();
  }

  /* 长按 F / Tab 取消选择目标：想贴近了再锁（不让对方太早收到照射告警）就先把目标放掉。 */
  var TGT_HOLD = 0.45;

  var tgtKey = { down: 0, cleared: false };

  function updateTargetKey() {
    if (!tgtKey.down || tgtKey.cleared || !$.player) return;
    if ((performance.now() - tgtKey.down) / 1000 < TGT_HOLD) return;
    tgtKey.cleared = true;
    if ($.player.target) {
      $.player.target = null;
      $.player.lockProgress = 0;
      $.player.locked = false;
      SysNote.show(T('ui.input.updateTargetKey.s1'));
      SFX.lockTone && SFX.lockTone(false);
    }
  }

  function cycleTarget() {
    if (!$.world || !$.player) return;

    /* 候选按**当前武器的目标类别**分成两组。

       带对空弹时按 F/Tab 该在飞机之间循环，带对地弹时该在海面目标
       之间循环 —— 否则会出现"锁到一个浮台、切到对空弹打不出去，
       还要再按好几下才转回飞机"。地上和天上的东西本来就该分开选。 */
    var w = WEAPONS[$.player.special];
    var wantAir = !w || w.target === 'air' || w.target === 'any';

    var air = [], surf = [];
    for (var i = 0; i < $.world.actors.length; i++) {
      var a = $.world.actors[i];
      // 中立飞机不进锁定循环；被压制得看不清的（jamState 非 clear）也不进
      if (a.alive && Ent.hostile(a, $.player) && Ent.jamState($.player, a) === 'clear') air.push(a);
    }
    for (i = 0; i < $.world.targets.length; i++) {
      // 只把真正的敌方目标纳入锁定循环；中立的调节单元不可被选为目标
      var tg = $.world.targets[i];
      if (tg.alive && tg.team === 1 && Ent.jamState($.player, tg) === 'clear') surf.push(tg);
    }

    /* 当前武器能打的那一类**排在前面**，另一类接在后面。

       注意是 concat 而不是二选一：两类都要能锁到。
       否则带对空弹时按 F 永远转不到海面目标 —— 而机炮打浮台、
       或者临时切弹打地面，本来都是正常用法。
       排前面的那类先循环，符合"我现在拿着什么弹"的直觉。 */
    if (!air.length && !surf.length) return;

    /* 连按：1.5 s 内再按，沿上一次排好的顺序往下走（第二近、第三近……），
       这样一堆目标挤在准星附近时也挑得出来。排序冻结在第一次按下的那一刻，
       不然目标一动，"下一个"就会跳回刚才那个。 */
    var cur = $.player.target, at;
    if (tgtCycle.world === $.world && $.world.time - tgtCycle.t < TARGET_REPEAT_T) {
      var live = tgtCycle.list.filter(function (t) {
        return t.alive && Ent.jamState($.player, t) === 'clear';
      });
      at = live.indexOf(cur);
      if (live.length) {
        $.player.target = live[(at + 1) % live.length];
        tgtCycle.list = live;
        tgtCycle.t = $.world.time;
        $.player.lockProgress = 0;
        SFX.lockTone(false);
        return;
      }
    }

    var order = rankTargets(wantAir ? air : surf, wantAir ? surf : air);
    // 最近的那个就是当前目标时，直接给第二个 —— 不然按 F 没有任何反应
    var next = (order[0] === cur && order.length > 1) ? order[1] : order[0];
    tgtCycle = { world: $.world, list: order, t: $.world.time };

    $.player.target = next;
    $.player.lockProgress = 0;
    SFX.lockTone(false);
  }

  /* F 键的排序：**屏幕内**的按离瞄准点的屏幕距离（鼠标引导 = CMD 瞄准环，
     键盘直控 = 鼠标光标），**屏幕外**的按离本机的距离。
     先屏幕内、后屏幕外；同一档里当前武器能打的那一类（prim）排前面。 */
  var TARGET_REPEAT_T = 1.5;

  var tgtCycle = { world: null, list: [], t: -99 };

  function rankTargets(prim, sec) {
    var cam = Renderer.getCam();
    var ref = aimRef(cam);
    function split(list) {
      var on = [], off = [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var s = cam ? M3.project(cam, t.pos) : null;
        if (s && s.x >= 0 && s.x <= Renderer.W && s.y >= 0 && s.y <= Renderer.H) {
          on.push({ t: t, k: (s.x - ref.x) * (s.x - ref.x) + (s.y - ref.y) * (s.y - ref.y) });
        } else {
          off.push({ t: t, k: M3.dist2(t.pos, $.player.pos) });
        }
      }
      var byK = function (a, b) { return a.k - b.k; };
      return { on: on.sort(byK), off: off.sort(byK) };
    }
    var p = split(prim), s = split(sec);
    return p.on.concat(s.on, p.off, s.off).map(function (e) { return e.t; });
  }

  /** 瞄准参考点（屏幕坐标） */
  function aimRef(cam) {
    if ($.aimMode && $.player.aimDir) {
      var s = cam ? M3.project(cam, M3.add($.player.pos, M3.mul($.player.aimDir, 1400))) : null;
      return { x: s ? s.x : Renderer.W / 2, y: s ? s.y : Renderer.H / 2 };
    }
    // 键盘直控：指针没锁，屏幕上有光标 —— 就用它
    return { x: $.mouse.x, y: $.mouse.y };
  }

  function cycleSpecial() {
    if (!$.player || !$.player.alive) return;
    if (!$.player.loadoutList || $.player.loadoutList.length < 2) {
      SFX.loseLock();
      return;
    }
    $.player.wpIdx = ($.player.wpIdx + 1) % $.player.loadoutList.length;
    $.syncWeapon($.player);
    var w = WEAPONS[$.player.special];
    // 注意不重置 spCd —— syncWeapon 已经从 slotCd 取回这把武器最快就绪的槽
    $.player.spActive = 0;

    /* 切枪**不清零锁定进度**。

       不同武器的锁定锥、锁定距离、寻的头速率都不一样，但"还能不能
       继续锁着"本来就该由 updateLock 按**新武器**的参数重新判 ——
       锁不住时进度会自己以 -2.2/s 衰减，不需要在这里手动清零。

       而清零的代价很大：锁定一架敌机之后想换另一种弹打同一架，
       得重新等整圈转完。可"对同一个敌人连打几种弹"正是多挂载的意义 ——
       先一枚雷达弹逼它做机动，再补一枚红外弹，这一套打不出来，
       挂载系统就只剩下"选一发威力最大的"这一个玩法了。 */
    SysNote.show(T('ui.input.cycleSpecial.s1') + w.name + T('ui.input.cycleSpecial.s2') + w.cn + T('ui.input.cycleSpecial.s3'));
    SFX.confirm();
  }

  /* 这件武器能不能打这个目标。

     可以就打回 null，否则返回一句给玩家看的话。

     为什么要专门做这件事：以前只有"有没有目标"的检查，于是带着
     对空弹锁住一个海面浮台，按下发射键——**弹照样打出去了**，
     然后从浮台旁边直接飞过去。玩家不会觉得"我用错了弹"，
     只会觉得"这游戏的导弹坏了"。 */
  function targetMismatch(w, t) {
    if (!w || !t) return null;
    /* 不锁目标的武器（吊舱 / 定向能）不参与这条判断 —— 它们本来就不选目标 */
    if (w.target !== 'air' && w.target !== 'ground' && w.target !== 'ship' && w.target !== 'any') return null;
    /* 真正的判据只有一处：Ent.weaponMatchesTarget —— AI 的选弹读的是同一个
       函数。两边各写一套的话，玩家会被提示"换对地弹"、而 AI 拿格斗弹去打
       海面平台，这类不一致不会报错，只会让行为看起来"有点笨"。 */
    if (Ent.weaponMatchesTarget(w, t)) return null;
    if (t.kind === 'target') {
      return w.name + T('ui.input.targetMismatch.s1') + w.cn + T('ui.input.targetMismatch.s2') +
        T('ui.input.targetMismatch.s3');
    }
    return w.name + T('ui.input.targetMismatch.s4') + w.cn + T('ui.input.targetMismatch.s5') +
      T('ui.input.targetMismatch.s6');
  }

  function fireSpecial() {
    if ($.failing) return;
    if ($.state !== 'playing' || !$.player || !$.player.alive) return;
    var w = WEAPONS[$.player.special];
    if (w.kind === 'ecm') { $.launch($.player, null, $.world); return; }
    if (w.kind === 'dew') {
      SysNote.show(T('ui.input.fireSpecial.s1'));
      return;
    }
    if ($.player.spAmmo <= 0) { SFX.loseLock(); return; }
    if ($.player.spCd > 0) { SFX.loseLock(); return; }

    /* ---------- 不再要求"必须先锁定才能开火" ----------

       这一条以前拦掉两种完全正当的用法：

       ① 无制导武器。火箭巢和炸弹没有导引头，出膛之后往哪飞只看
          投放那一刻的机头指向 —— 要求先锁定，等于给一件从原理上
          就不需要锁定的武器加了一道锁定门槛。

       ② 俯冲扫射式的对地攻击。玩家压低机头对准目标，按下去却只
          得到一句"没有锁定目标"。

       目标类别和武器对不上（拿对空弹打浮台）也不再拦 —— 类别不对时
       锁定根本不会开始（updateLock），这里允许强制开火，
       但按**无锁定**处理：弹不带这个目标出膛。"打不打得中"是玩家自己的判断。 */
    var t = $.player.target;
    if (t && !t.alive) t = null;

    if (t) {
      var mism = targetMismatch(w, t);
      if (mism) {
        SysNote.show(T('ui.input.fireSpecial.s2') + mism, { warn: true });
        t = null;
      }
    }

    /* 锁定不拦发射，但**决定导弹认不认这个目标**：

         锁满（player.locked）   导弹带着选中的目标出膛
         没锁满                 不带目标 —— 红外弹自己在视场里找热源，
                                雷达 / 对地弹直飞，只有带 reAcquire 的会自己重新捕获
         无制导弹               本来就不认目标，不受影响

       以前出膛一律把选中目标交给导弹，锁定环走不走满对结果没有任何影响。 */
    var guided = w.seeker && w.seeker !== 'none' && !w.tags.unguided;
    var lt = (t && (!guided || $.player.locked)) ? t : null;
    if (t && guided && !$.player.locked) {
      SysNote.show(T('ui.input.fireSpecial.s3') + (w.seeker === 'ir' ? T('ui.input.fireSpecial.s4') : T('ui.input.fireSpecial.s5')), { warn: true });
    }
    if ($.launch($.player, lt, $.world)) launchCall(w);
  }

  /* 发射呼叫。

     按导引头报标准简令：红外 Fox 2、雷达 Fox 3；
     对地 / 反舰 / 炸弹 / 火箭一律报"投弹"。

     连续开火时**冷却期内的发射一律不喊**：以前每一发都排进无线电队列，
     连打十几发之后队列里堆着一长串 Fox 2，换了武器也要等它们播完 ——
     听起来就像"不管打什么都在喊 Fox 2"。冷却按真实时间算，暂停不影响。 */
  var CALL_CD = 3.0;

  var lastCallT = -1e9;

  function launchCall(w) {
    var now = performance.now() / 1000;
    if (now - lastCallT < CALL_CD) return;
    lastCallT = now;
    var tx;
    if (w.kind !== 'aam' || w.tags.unguided) tx = T('ui.input.launchCall.s1');
    else if (w.seeker === 'radar') tx = '<b>Fox 3</b>';
    else tx = '<b>Fox 2</b>';
    Radio.raw({ who: CALLSIGN.player, cls: 'ally', tx: tx, gap: 0.4 });
  }
})(Game);
