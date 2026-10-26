(function (Game) {
  'use strict';
  var $ = Game.$;
  $.fireEcm = fireEcm; $.launch = launch; $.stepShotQueue = stepShotQueue;

  /* ============================================================
     齐射的出膛扇面
     ============================================================ */
  /* 巢式武器（GIR-5 三枚 / GIR-9 两枚 / GIR-12 四枚 / PEJ-6 七枚）
     按一下打出去的那几枚，必须各有各的出膛指向与出膛点。

     以前是"同一个点、同一个指向、同一个初速"复制 n 份 —— 它们完全
     重合：画面上只有一条烟迹、一个模型，按一下打三发和打一发看不出
     区别，齐射这个动作等于没有发生。

     现在按发射巢本来的样子把它们铺开：

       ① 指向：以机头为中线左右对称地扇形展开（相邻两发差 1.8°），
          奇偶发再上下交错 0.4 倍，最后叠一点随机抖动 ——
          不给抖动的话每一次齐射都是同一张完全对称的图。
       ② 出膛点：巢内横向错开 0.8 米。

     ②不是装饰：带导引头的弹出膛后一两帧内就把机头掰回视线，
     只给①的话几枚弹立刻并回同一条线；出膛点错开才会让它们在中段
     航路上保持一整个发射巢的宽度。

     ①对**无制导弹**要单独收窄（0.2°）。无制导弹的出膛指向就是它的
     整条弹道，1.8° 的扇面等于把"七发打在同一个点"变成"七发撒在
     半径 60 米的一圈里" —— 那是数值改动，不是视觉改动，火箭巢的
     命中率会凭空掉一大截。火箭巢的管子本来就是平行的，该错开的
     是管子本身（②的位置），不是指向。

     偏移左右对称，平均指向仍是机头方向，命中逻辑不变；
     单发（n ≤ 1）不做任何偏移。 */
  var SALVO_FAN = 1.8 * Math.PI / 180;

  // 制导弹：相邻两发的出膛夹角
  var SALVO_FAN_UG = 0.2 * Math.PI / 180;

  // 无制导弹：管子基本平行
  var SALVO_DISK_UG = 0.45 * Math.PI / 180;

  // 无制导弹：随机散布圆盘的角半径
  var SALVO_VER = 0.4;

  // 上下交错量，相对 FAN
  var SALVO_NEST = 0.8;

  // 巢内两发的横向间距（米）
  function salvoShots(actor, wp, n) {
    var base = M3.orthonormalize(actor.fwd, actor.up);
    var fan = (wp && wp.tags.unguided) ? SALVO_FAN_UG : SALVO_FAN;
    var out = [];
    for (var q = 0; q < n; q++) {
      if (n <= 1) {
        out.push({ fwd: base.fwd, off: M3.V(0, 0, 0) });
        continue;
      }
      if (wp && wp.tags.unguided) {
        /* 无制导弹：指向与出膛点都在圆盘内均匀随机（半径取 sqrt 才是面均匀），
           落点撒成一个圆，而不是两排整齐的长方形。 */
        var ra = Math.sqrt(M3.rnd(0, 1)) * SALVO_DISK_UG, th = M3.rnd(0, 1) * Math.PI * 2;
        var f2 = M3.rotAxis(base.fwd, base.up, ra * Math.cos(th));
        f2 = M3.norm(M3.rotAxis(f2, base.right, ra * Math.sin(th)));
        var rb = Math.sqrt(M3.rnd(0, 1)) * SALVO_NEST * 1.5, tb = M3.rnd(0, 1) * Math.PI * 2;
        out.push({ fwd: f2, off: M3.add(M3.mul(base.right, rb * Math.cos(tb)), M3.mul(base.up, rb * Math.sin(tb))) });
        continue;
      }
      var k = q - (n - 1) / 2;                       // 以中线为 0 左右对称
      var lat = k * fan + M3.rnd(-0.25, 0.25) * fan;
      var vert = ((q % 2) ? 1 : -1) * fan * SALVO_VER;
      var fwd = M3.rotAxis(base.fwd, base.up, lat);
      fwd = M3.norm(M3.rotAxis(fwd, base.right, vert));
      out.push({ fwd: fwd, off: M3.mul(base.right, k * SALVO_NEST) });
    }
    return out;
  }

  /* 当前最危险的对手有多强 —— 电子战的窗口长度取决于**对手**，
     不是取决于自己的吊舱。取最近的敌方 AI；没有对手时给 0.5。 */
  function vsSkill(actor) {
    if (!$.world || !$.world.actors) return 0.5;
    var best = -1, bd = 1e12;
    for (var i = 0; i < $.world.actors.length; i++) {
      var e = $.world.actors[i];
      if (!e.alive || !Ent.hostile(e, actor) || !e.ai) continue;
      var d = M3.dist2(e.pos, actor.pos);
      if (d < bd) { bd = d; best = e.ai.skill; }
    }
    return best < 0 ? 0.5 : best;
  }

  /* 开一件电子战吊舱：生效状态 + 冷却 + 播报。

     **唯一**的开机入口。手动扣扳机（launch 的 ecm 分支）、协处理器的
     自主决策（updateEWAuto）、任务脚本里干扰机航线到站，全部走它 ——
     以前这段逻辑只存在于 launch 里，任何"绕过扳机"的开机方式都得抄一遍。

     ewBurnT 描述的不是吊舱而是**对手**：信号处理能力强的部队能在 3 秒内
     完成对抗，差的要 8 秒（见 entities.js 的 openEcm）。 */
  function fireEcm(actor, wid) {
    var w = WEAPONS[wid];
    if (!w || w.kind !== 'ecm' || w.tags.passive) return false;
    Ent.openEcm(actor, wid, vsSkill(actor));
    actor.spCd = w.cd;
    if (actor.slotCd && actor.slotCd[wid]) actor.slotCd[wid][0] = w.cd;
    SFX.laser();
    Radio.raw({
      who: actor.isPlayer ? CALLSIGN.player : (actor.label || actor.name),
      cls: 'ally',
      tx: T('engine.game.launch.fireEcm.tx'), gap: 0.6
    });
    return true;
  }

  /* 放出到点的延迟发射。载机沿机头方向前进 elapsed × 速度，出膛点跟着走。 */
  function stepShotQueue(dt) {
    var q = $.world.shotQueue;
    if (!q || !q.length) return;
    var keep = [];
    for (var i = 0; i < q.length; i++) {
      var e = q[i];
      e.t -= dt;
      if (e.t > 0) { keep.push(e); continue; }
      var o = e.spec.owner;
      if (o && o.alive) e.spec.pos = M3.add(e.spec.pos, M3.mul(o.fwd, (o.speed || 0) * -e.t));
      var m = Ent.makeMissile(e.spec);
      m.salvo = e.salvo;
      $.world.missiles.push(m);
    }
    $.world.shotQueue = keep;
  }

  function launch(actor, target, w) {
    var wp = WEAPONS[actor.special];
    if (!wp) return false;

    /* ECM 吊舱 —— 交给 fireEcm()，协处理器的自主开机走同一个入口。 */
    if (wp.kind === 'ecm') {
      if (actor.spCd > 0) return false;
      return fireEcm(actor, actor.special);
    }
    /* DEW 是自动系统，不能手动发射 */
    if (wp.kind === 'dew') return false;

    if (actor.spAmmo <= 0) return false;

    /* 找一个冷却完毕的发射槽。找不到就按不出去 ——
       这就是"每个冷却单独计算"：连打几发之后要挨个等它们装填。 */
    var slotIdx = -1;
    var slotArr = actor.slotCd ? actor.slotCd[actor.special] : null;
    if (slotArr) {
      for (var si = 0; si < slotArr.length; si++) {
        if (slotArr[si] <= 0) { slotIdx = si; break; }
      }
      if (slotIdx < 0) return false;
    } else if (actor.spCd > 0) {
      return false;                       // 没有槽表就退回旧的单冷却
    }

    /* 无目标也允许发射。

       无制导弹本来就不需要目标；有导引头的弹打出去之后直飞，
       或者靠 reAcquire 自己找 —— 那是玩家自己的选择，不该被拦。 */

    /* 一次按键只打 1 枚。
       挂载点决定的是"能同时装填几发"（也就是 slotArr 的长度），
       不是一次打几发 —— "齐射数"的含义就是：
       连按几次能打出几枚，之后要挨个等它们装填。 */
    var si2 = Math.max(0, slotIdx);
    var side = (si2 % 2) ? 1 : -1;
    var rank = Math.floor(si2 / 2);
    /* 出膛点 = 这个槽对应的那个挂架（与 pushStores 画的是同一个位置）。
       没有挂点表的单位（任务脚本里的航线单位等）退回旧的估算。 */
    var st = Ent.storeForSlot(actor, actor.special, si2);
    var hp = st ? Ent.storePos(actor, st.g, st.pt) : M3.add(actor.pos, M3.add(
      M3.mul(actor.fwd, 4),
      M3.mul(actor.right, side * (2.4 + rank * 1.9))));

    /* 一次按键打出 wp.salvo 枚，共用同一个冷却槽。

       "三联装"（GIR-5）的语义就是**按一下出三枚**，而不是"一个挂点
       占三个冷却槽" —— 后者会让槽数和挂点数脱钩，右下角的俯视缩略图、
       武器纵列表的圆点指示、3D 挂载的下标都得改成"一点多槽"。
       共用一槽则架构完全不用动，玩家看到的也仍然是"按一下，三枚出去"。

       出膛的那几枚各自偏开一点，见上面的 salvoShots() ——
       同一点、同一指向出去的弹会完全重叠成一发。 */
    var nShot = Math.max(1, Math.min(wp.salvo || 1, actor.spAmmo));
    var shots = salvoShots(actor, wp, nShot);
    /* 红外齐射：只有第一枚接手锁定的目标，其余几枚出膛后各自在
       导引头视场（lockCone）里找 —— 并避开兄弟弹已经咬住的那几架，
       一次齐射才能分打一个编队。雷达弹要靠载机交接，不走这条。 */
    var irSalvo = (nShot > 1 && wp.seeker === 'ir') ? { claimed: [] } : null;
    if (irSalvo && target) irSalvo.claimed.push(target);
    /* 连射延迟 wp.salvoGap：第 q 发在按键后 q × salvoGap 秒出膛（火箭巢是
       依次点火的，不是同一帧齐出）。0 / 不写 = 同时。延迟的几发进 world.shotQueue，
       由 stepShotQueue 到点放出 —— 位置顺着载机当时的航向推进，指向沿用按键那一刻的。 */
    var gap = wp.salvoGap || 0;
    for (var q = 0; q < nShot; q++) {
      var spec = {
        weapon: actor.special,
        team: actor.team,
        pos: M3.add(hp, shots[q].off),
        fwd: shots[q].fwd,
        speed: actor.speed + 70,
        target: (irSalvo && q > 0) ? null : (target || null),
        owner: actor
      };
      if (gap > 0 && q > 0) {
        w.shotQueue.push({ t: q * gap, spec: spec, salvo: irSalvo });
        continue;
      }
      var m = Ent.makeMissile(spec);
      m.salvo = irSalvo;
      w.missiles.push(m);
    }

    actor.spAmmo -= nShot;
    if (slotArr) {
      slotArr[si2] = wp.cd;
      // spCd 取"最快就绪的那个槽"，供 HUD 与 AI 判断还能不能再打
      actor.spCd = Math.min.apply(null, slotArr);
    } else {
      actor.spCd = wp.cd;
    }

    /* 弹药池的回写对**玩家与 NPC 都要做** —— 实体挂载靠它判断
       "这一发还在不在"（pushStores 的 pool <= 0）。以前只在玩家分支里
       回写，NPC 的池子永远停在初始值，于是敌机打光了翼下还挂着弹。 */
    if (actor.ammoPool) actor.ammoPool[actor.special] = actor.spAmmo;

    if (actor.isPlayer) {
      w.shotsFired += 1;
      SFX.missile();
    } else {
      var d = M3.dist(actor.pos, w.player.pos);
      if (d < 6000) SFX.missileFar();
    }
    return true;
  }
})(Game);
