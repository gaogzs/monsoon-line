(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawCcip = drawCcip; $.drawFootprint = drawFootprint; $.computeEnvelope = computeEnvelope; $.computeNEZ = computeNEZ; $.offscreenRect = offscreenRect; $.edgePoint = edgePoint; $.drawOffscreen = drawOffscreen;

  /* ============================================================
     无制导炸弹 / 火箭的预计落点（CCIP，5.5）

     用 Ent.naturalPoint（stepMissile 同一套积分：重力、阻力、火箭推力）
     从本机当前状态前推到落海 / 落地，得到落点；落点和真实弹道是同一套计算。
     投影到屏幕画 pipper + 落点线；子母弹 / 高爆弹再画爆炸半径的地面椭圆；
     落点在屏外时在屏幕边缘给方向提示；锁定 / 选中的地面目标落进半径内就变红。
     ============================================================ */
  function drawCcip(ctx, W, H, cam, p) {
    var w = WEAPONS[p.special];
    if (!w || !w.tags.unguided || (w.target !== 'ground' && w.target !== 'ship')) return;

    var now = performance.now();
    /* 有选中的面目标：按它所在高度截弹道（陆地上的高地也准）；没有就按落点处地面高度 */
    var tsel = p.target && p.target.alive && p.target.kind === 'target' ? p.target : null;
    var plane = tsel ? tsel.pos.y : null;
    var c = p.__ccip;
    if (!c || c.w !== w.id || c.plane !== plane || now - c.at > 100) {
      c = p.__ccip = { w: w.id, at: now, plane: plane,
        pt: Ent.naturalPoint(w, { pos: p.pos, fwd: p.fwd, speed: (p.speed || 0) + 70 }, plane) };
    }
    var pt = c.pt;
    var R = w.cluster || w.blast || 0;
    var t = p.target && p.target.alive ? p.target : null;
    var hot = !!(t && t.kind === 'target' &&
      Math.hypot(t.pos.x - pt.x, t.pos.z - pt.z) <= Math.max(R, 15) + (t.radius || 0));
    var col = hot ? $.RED : 'rgba(255,176,58,0.85)';

    var q = M3.project(cam, M3.V(pt.x, pt.y, pt.z));
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = hot ? 2 : 1.4;
    if (!q || q.x < 0 || q.x > W || q.y < 0 || q.y > H) {
      /* 落点在屏外：从屏幕中心朝落点方向，在安全矩形边缘画箭头 */
      var dx = 0, dy = -1;
      if (q) { dx = q.x - W / 2; dy = q.y - H / 2; }
      else {
        var fx = pt.x - p.pos.x, fz = pt.z - p.pos.z;
        dy = (fx * p.fwd.x + fz * p.fwd.z) >= 0 ? -1 : 1;
      }
      var dl = Math.sqrt(dx * dx + dy * dy) || 1; dx /= dl; dy /= dl;
      var e = edgePoint(W / 2, H / 2, dx, dy, offscreenRect(W, H, p));
      var ang = Math.atan2(dy, dx), sz = $.U(9);
      ctx.translate(e.x, e.y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz, -sz * 0.7); ctx.lineTo(-sz, sz * 0.7);
      ctx.closePath(); ctx.stroke();
      ctx.restore();
      return;
    }

    /* 落点线：机头基准点（屏幕中心）→ pipper */
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(q.x, q.y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(q.x - 9, q.y); ctx.lineTo(q.x - 4, q.y);
    ctx.moveTo(q.x + 4, q.y); ctx.lineTo(q.x + 9, q.y);
    ctx.moveTo(q.x, q.y - 9); ctx.lineTo(q.x, q.y - 4);
    ctx.moveTo(q.x, q.y + 4); ctx.lineTo(q.x, q.y + 9);
    ctx.stroke();

    /* 爆炸 / 抛撒半径：地面圆投影成椭圆 */
    if (R > 0) {
      ctx.beginPath();
      var ok = true;
      for (var i = 0; i <= 24; i++) {
        var a = i / 24 * Math.PI * 2;
        var r = M3.project(cam, M3.V(pt.x + Math.sin(a) * R, pt.y, pt.z + Math.cos(a) * R));
        if (!r) { ok = false; break; }
        if (i === 0) ctx.moveTo(r.x, r.y); else ctx.lineTo(r.x, r.y);
      }
      if (ok) {
        if (!hot && ctx.setLineDash) ctx.setLineDash([5, 4]);
        if (hot) { ctx.fillStyle = 'rgba(255,80,60,0.10)'; ctx.fill(); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ============================================================
     精确制导炸弹的动态瞄准圈（泪滴形，5.3 第 3 条）

     拿着带弹翼的精确制导炸弹（ballistic + fin、无 glide，PEJ-14 之类）时，
     把弹翼能修正到的落点可达区域投影到屏幕上画成泪滴圈：
       后端（最远）= 自然抛物线落点（画一个 pipper）
       往前张开 = 弹翼能下压 / 横修到的范围
     目标（地面）套进圈内且已锁定 = 物理上必中。圈随本机高度、速度、俯仰
     实时变化：高、快时圈大，低、慢时圈小。

     和空空弹视场圈一样，落点按**机头朝向**投影（M3.project 同一套），
     不是按屏幕朝向 —— 圈在画面上跟着机头走，而不是跟着镜头走。
     ============================================================ */
  function drawFootprint(ctx, W, H, cam, p) {
    var w = WEAPONS[p.special];
    if (!w || !w.fin || !w.tags.ballistic) return;

    /* 可达区域每 1 s 重算一次（一次要跑上百份弹道）：像机载火控解算那样一秒一刷，
       两次之间圈钉在世界坐标上不动，换武器 / 换目标高度才立刻重算。 */
    var now = performance.now();
    var ft = p.target && p.target.alive && p.target.kind === 'target' ? p.target.pos.y : 0;
    var c = p.__fp;
    if (!c || c.w !== w.id || c.ty !== ft || now - c.at > 1000) {
      c = p.__fp = { w: w.id, ty: ft, at: now, spd: p.speed || 0, y: p.pos.y,
        fp: Ent.finFootprint(w, { pos: p.pos, fwd: p.fwd, speed: (p.speed || 0) + 70 }, undefined, ft) };
    }
    var fp = c.fp;
    if (!fp) return;

    /* 投影：natural + 边界点（地面 y=0 → 屏幕）。 */
    var nat = M3.project(cam, M3.V(fp.natural.x, fp.natural.y, fp.natural.z));
    var scr = [];
    for (var i = 0; i < fp.points.length; i++) {
      var q = M3.project(cam, M3.V(fp.points[i].x, ft, fp.points[i].z));
      if (q) scr.push(q);
    }
    if (!nat || scr.length < 3) return;

    /* 圈内必中：目标（地面）在世界坐标里落进可达区域多边形，且已锁定。 */
    var t = p.target && p.target.alive ? p.target : null;
    var poly = [[fp.natural.x, fp.natural.z]];
    for (i = 0; i < fp.points.length; i++) poly.push([fp.points[i].x, fp.points[i].z]);
    var hot = !!(t && t.kind === 'target' && p.locked &&
      $.pointInPolygon([t.pos.x, t.pos.z], poly));

    ctx.save();
    ctx.strokeStyle = hot ? $.RED : 'rgba(255,176,58,0.55)';
    ctx.lineWidth = hot ? 2 : 1.4;
    if (!hot && ctx.setLineDash) ctx.setLineDash([6, 5]);
    /* 泪滴轮廓：natural → 左 / 前（下压）/ 右边界 → 回到 natural */
    ctx.beginPath();
    ctx.moveTo(nat.x, nat.y);
    for (i = 0; i < scr.length; i++) ctx.lineTo(scr[i].x, scr[i].y);
    ctx.closePath();
    if (hot) { ctx.fillStyle = 'rgba(255,80,60,0.10)'; ctx.fill(); }
    ctx.stroke();
    ctx.setLineDash([]);

    /* 自然落点 pipper：一个小圆 + 十字，标"不修正也能落到这里"。 */
    ctx.beginPath();
    ctx.arc(nat.x, nat.y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nat.x - 6, nat.y); ctx.lineTo(nat.x + 6, nat.y);
    ctx.moveTo(nat.x, nat.y - 6); ctx.lineTo(nat.x, nat.y + 6);
    ctx.stroke();
    ctx.restore();
  }

  /** 发射包线：{ rmax, nez }，非对空弹给 null。

     rmax  导弹动力段能追上**按当前航向飞**的目标的距离
     nez   目标立刻掉头逃逸也甩不掉的距离（不可逃逸区）

     两者都不超过锁定距离 —— 锁不上的东西谈不上射程。 */
  function computeEnvelope(p, t) {
    var w = WEAPONS[p.special];
    if (!w) return null;
    /* 制导弹才有发射包线：空空弹（对空中目标），以及有导引头的对地 / 对海弹
       （对海面 / 地面目标）。无制导弹（炸弹、火箭）没有 —— 它们靠 5.5 的落点标记。 */
    var isAam = w.kind === 'aam' && t.kind === 'air';
    var isSurf = (w.target === 'ground' || w.target === 'ship' || w.target === 'any') && t.kind === 'target' &&
      w.seeker && w.seeker !== 'none' && !w.tags.unguided;
    if (!isAam && !isSurf) return null;

    /* rmax / nez 用真实弹道动态算（Ent.envelopeRange）：把目标高度、相对速度、
       航向都吃进 stepMissile 的模拟里，nez 按"目标掉头逃逸"（空空）或
       "目标最大航速"（对面）二分出来。一次要跑十几份弹道，按状态变化 + 0.3 s 节流缓存。 */
    var now = performance.now();
    var c = p.__env;
    var d = M3.dist(p.pos, t.pos);
    if (!c || c.w !== w.id || now - c.at > 300 ||
        Math.abs(d - c.d) > 150 || Math.abs((p.speed || 0) - c.spd) > 50 ||
        Math.abs(p.pos.y - c.y) > 500) {
      var e = Ent.envelopeRange(w, { pos: p.pos, fwd: p.fwd, speed: (p.speed || 0) + 70 }, t);
      var lock = w.lockDist || Infinity;
      var rmax = Math.min(lock, e.rmax);
      var nez = Math.min(lock, Math.min(e.nez, e.rmax));
      c = p.__env = { w: w.id, at: now, d: d, spd: p.speed || 0, y: p.pos.y, rmax: rmax, nez: nez };
    }
    return { rmax: c.rmax, nez: c.nez };
  }

  function computeNEZ(p, t) {
    var e = computeEnvelope(p, t);
    return e ? e.nez : 0;
  }

  /* ============================================================
     屏幕外标记的落点

     屏外箭头原来贴在一个 54 px 的固定页边距上，而屏幕四边全被仪表占着：
     上边是指南针与任务目标，左右是速度 / 高度 / 出力带，下边从左到右是
     雷达、武器面板、RWR + 挂载图。箭头横穿这些仪表时，本来只说
     "目标在那边"的提示，反而盖住了要读的数。

     所以先把可落点收进一个矩形：四条边各自让开那一侧最宽的元件，
     再让方向决定落在矩形的哪条边上。方向不变、位置统一 ——
     "指向"是箭头的全部含义，它离中心多远只是画法。

     间距全部由各元件自己的布局算出（gap / U / hmiLayout），不写死像素：
     哪边挪了，箭头跟着挪。锁定目标那只大箭头（sz = 11）与来袭导弹的
     箭头（尖端 14）都比 CLR 小，所以箭头本体不会越过安全线。
     ============================================================ */

  /** 屏外标记的安全矩形 —— 四条边都让开贴边的仪表 */
  function offscreenRect(W, H, p) {
    var CLR = $.U(18);                          // 让开的余量：箭头本体 + 一点呼吸
    var m = $.gap(132, W, 0.15);                // 速度带 / 高度带距边的间距（与 drawTapes 同源）

    // 左：空速带 + 引擎出力带（后者在空速带右边 U(104)，读数再往外）
    var left = m + $.U(168) + CLR;
    // 右：高度带 + 动压表（动压表以 x = W - m 为中心、半宽 62）
    var right = m + $.U(62) + CLR;
    // 上：指南针（含航向读数） + 两行任务目标
    var top = $.U(124) + CLR;
    // 下：武器面板（行数决定高度）与方位尺，取更靠上的那一个
    var rows = (p && p.loadoutList) ? p.loadoutList.length : 0;
    var panelTop = H - $.gap(74, H, 0.11) - $.U(31) - rows * $.U(15);
    var bearingTop = H * 0.82 - $.U(24);
    var bottom = H - Math.min(panelTop, bearingTop) + CLR;

    /* 极小窗口的兜底：仪表本身就占满屏幕时，上面那套间距会把矩形算反
       （x0 > x1）。这时退回按比例内缩，至少保证落点还落在屏内。 */
    if (W - left - right < W * 0.40) { left = right = W * 0.30; }
    if (H - top - bottom < H * 0.36) { top = bottom = H * 0.32; }

    return { x0: left, y0: top, x1: W - right, y1: H - bottom };
  }

  /** 从屏幕中心朝 (dx, dy) 走，取与安全矩形边界的交点（dx/dy 已是单位向量） */
  function edgePoint(cx, cy, dx, dy, r) {
    var kx = dx > 1e-6 ? (r.x1 - cx) / dx
      : (dx < -1e-6 ? (r.x0 - cx) / dx : Infinity);
    var ky = dy > 1e-6 ? (r.y1 - cy) / dy
      : (dy < -1e-6 ? (r.y0 - cy) / dy : Infinity);
    var k = Math.min(kx, ky);
    return { x: cx + dx * k, y: cy + dy * k };
  }

  /* isLock = 当前选中的目标；locked = 而且锁定环已经走满 */
  function drawOffscreen(ctx, W, H, cam, t, isLock, dist, isAlly, rect, locked) {
    var cx = W / 2, cy = H / 2;

    /* 方向取相机空间的横向分量 (x, -y)。它和投影点在屏幕上的偏移方向
       完全一致（投影只是把两者同乘一个正数），但对"只差一点就出屏"的点
       也稳定 —— 先把投影点夹进屏幕再求角度，会把右上角外面的目标
       拉成"正右方"。 */
    var c = M3.toCam(cam, t.pos);
    var dx = c.x, dy = -c.y;
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) { dx = 0; dy = 1; }      // 正后方：方向无意义，落到正下方
    else { dx /= l; dy /= l; }

    var pt = edgePoint(cx, cy, dx, dy, rect);
    var ang = Math.atan2(dy, dx);

    /* 屏幕外的箭头沿用同一套敌我语义：**友军蓝、敌人红**。

       以前这里地面目标用灰蓝、锁定状态用琥珀 —— 屏外本来就看不到
       NEZ 状态，用琥珀表示"够不着"没有意义，反而让同一种色系
       承担了三种含义（说明文字、中立物、锁定）。现在只剩两种：
       蓝色是我的，红色是别人的。

       ---- 已锁定：额外的小修饰 ----

       "当前锁定的那一架"是玩家唯一会追着看的目标，而它一旦飞出屏幕，
       就退化成和旁边十几只箭头长得一样的东西 —— 连"我锁的是哪一架"
       都要靠回忆。所以锁定态在屏外要能一眼认出来：

         · 颜色从半透明提到**实心**（其余箭头都是压暗的陪衬）
         · 加一圈随正弦脉动的外环 + 环内的核心点
         · 尺寸放大（11 → 13）
         · 读数带 `LOCK` 前缀，而不是一个裸距离

       脉动用 performance.now()：这个文件里所有闪烁都是这么写的。
       箭头画在安全矩形边界上，外环半径 +3.5 仍在 CLR 让出的余量里。 */
    var lockPulse = 0;
    var neutral = !isAlly && t.team > 1;
    var col = isAlly ? 'rgba(90,168,255,0.60)' : (neutral ? 'rgba(160,170,178,0.50)' : 'rgba(255,77,77,0.55)');
    var sz = isLock ? 11 : (isAlly ? 8 : 9);
    if (isLock) {
      lockPulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;   // 0..1
      col = isAlly ? 'rgba(90,168,255,0.98)' : 'rgba(255,96,96,0.98)';
      sz = 13;
    }
    var sz0 = isLock ? 11 : (isAlly ? 8 : 9);

    ctx.save();
    ctx.translate(pt.x, pt.y);

    if (isLock) {
      // 外环（脉动）+ 环心亮点：先画在箭头下面，避免盖住箭头本体
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, sz0 + 3.0 + lockPulse * 2.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      /* 锁满：在外环外切处加一个红色四角框（边长 = 外环脉动的最大直径，不跟着脉动） */
      if (locked) {
        var q = sz0 + 3.0 + 2.4 + 1.5, qc = 5;
        ctx.strokeStyle = $.RED; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-q, -q + qc); ctx.lineTo(-q, -q); ctx.lineTo(-q + qc, -q);
        ctx.moveTo(q - qc, -q); ctx.lineTo(q, -q); ctx.lineTo(q, -q + qc);
        ctx.moveTo(q, q - qc); ctx.lineTo(q, q); ctx.lineTo(q - qc, q);
        ctx.moveTo(-q + qc, q); ctx.lineTo(-q, q); ctx.lineTo(-q, q - qc);
        ctx.stroke();
      }
    }

    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.55, sz * 0.66); ctx.lineTo(-sz * 0.55, -sz * 0.66);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    /* 读数写在**朝屏幕中心**的一侧：贴边的标记若把读数写在更外一侧，
       就又压回刚让开的仪表上了。 */
    /* 只写距离。锁定状态由箭头外的红色四角框表示（见上），不再写 LOCK / TGT 前缀 */
    $.text(ctx, (dist / 1000).toFixed(1),
      pt.x - dx * (isLock ? 32 : 20), pt.y - dy * (isLock ? 32 : 20) + 4, col,   // 选中目标让开外环和四角框
      isLock ? 'bold ' + $.FS : $.FS, 'center');
  }
})(HUD);
