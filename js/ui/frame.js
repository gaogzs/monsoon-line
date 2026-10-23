(function (Game) {
  'use strict';
  var $ = Game.$;
  $.pushStores = pushStores; $.render = render;

  /* ============================================================
     挂架上的实物

     以前挂载只存在于 HUD 的俯视缩略图里，飞机模型永远是"干净"的 ——
     打出去多少弹，机身外观一点变化都没有。现在按挂点逐个渲染：
     **槽就绪时挂着弹，冷却中就是空的**。

     这样"还剩几发"不用盯 HUD 也知道，而且打完最后一发的瞬间
     整片机翼会明显变干净 —— 比数字更直观。

     坐标（含挂点高度）在 entities.js 的 Ent.storePos() 里，
     离线预览器 tools/render/render-mounts.js 用的是同一份。
     ============================================================ */
  function pushOneStore(a, g, pt, w) {
    var sc = MODELS.storeScale(w);
    var mdl = MODELS.store(w);
    var p = M3.add(Ent.storePos(a, g, pt), M3.mul(a.up, -MODELS.storeDrop(mdl, sc)));
    Renderer.pushModel(mdl, p, a.fwd, a.up, { scale: sc, store: true });
  }

  function pushStores(a) {
    /* 槽号 ↔ 挂点的对应在 Ent.forEachStoreSlot 里，launch 的出膛点用同一份。 */
    var slots = a.slotCd || {};
    Ent.forEachStoreSlot(a, function (g, pt, wid, si) {
      var w = WEAPONS[wid];
      // 已经打光：冷却早已归零，但挂架上不该再有任何东西
      var pool = a.ammoPool ? a.ammoPool[wid] : undefined;
      if (pool !== undefined && pool <= 0) return;
      /* 吊舱与定向能不是"打出去"的东西 —— 一直挂在挂架上（si 为 null）。 */
      if (si !== null) {
        var arr = slots[wid] || [];
        if ((arr[si] || 0) > 0) return;          // 这个发射槽还在装填 → 挂架空着
      }
      pushOneStore(a, g, pt, w);
    });
  }

  /* ============================================================
     渲染
     ============================================================ */
  var CELL_DRAW_RANGE2 = 30000 * 30000;

  function render() {
    if ($.state !== 'playing' || !$.world || !$.player) {
      // 菜单背景：慢速空镜头
      Renderer.begin();
      Renderer.end();
      return;
    }
    Renderer.begin();

    var i;
    // 目标物
    for (i = 0; i < $.world.targets.length; i++) {
      var t = $.world.targets[i];
      if (!t.alive) {
        // 海上平台的残骸留在原地，下沉一截（platformWreck）
        var wk = t.platform && MODELS[t.model + '_wreck'];
        if (wk) Renderer.pushModel(wk, M3.V(t.pos.x, t.pos.y - (t.wreckY || 0), t.pos.z), t.fwd, t.up, {});
        continue;
      }
      var mdl = MODELS[t.model];
      if (!mdl) continue;
      // 调节单元每关几十个、大多在 30 km 外 —— 远处那些画出来也只是雾里一个点
      if (t.tags.cullFar && M3.dist2(t.pos, $.player.pos) > CELL_DRAW_RANGE2) continue;
      Renderer.pushModel(mdl, t.pos, t.fwd, t.up, {});
      if (t.turrets) Turret.push(t, Renderer.pushModel);
    }
    // 飞机
    for (i = 0; i < $.world.actors.length; i++) {
      var a = $.world.actors[i];
      if (!a.alive) continue;
      var m2 = MODELS[a.model];
      if (!m2) continue;
      // sweep 只对带 morph 数据的模型（DB-11 的可变后掠翼）有意义
      Renderer.pushModel(m2, a.pos, a.fwd, a.up, { sweep: a.sweep || 0 });
      pushStores(a);
    }
    // 导弹
    for (i = 0; i < $.world.missiles.length; i++) {
      var ms = $.world.missiles[i];
      if (!ms.alive) continue;
      var mm = (ms.w && ms.w.look) ? MODELS.round(ms.w) : (MODELS[ms.model] || MODELS.missile);
      Renderer.pushModel(mm, ms.pos, ms.fwd, ms.up, {});
    }
    // 粒子要在 flush 之前交：WebGL 下它们和模型一起做深度测试（2D 下照旧直接画）
    /* minPx 粒子：按距离把世界尺寸撑到屏幕下限（两套渲染器都只认 size） */
    var pcam = Renderer.getCam();
    if (pcam) {
      for (var pi = 0; pi < $.world.particles.length; pi++) {
        var pp = $.world.particles[pi];
        if (pp.minPx) pp.size = Math.max(pp.size0, pp.minPx * M3.dist(pp.pos, pcam.pos) / pcam.focal);
      }
    }
    Renderer.drawParticles($.world.particles);
    Renderer.drawParticles(Ent.flashRings($.world));
    Renderer.flush();

    // 曳光弹画在模型之上并用加色混合 —— 弹道本来就该是亮线，
    // 被机翼挡掉反而看不清楚（所以 WebGL 下也留在 2D 层）
    drawTracers();
    Renderer.end();

    // HUD
    HUD.draw($.world, $.player, 0, $.S);

    // 横幅与提示
    var ctx = Renderer.ctx;
    if ($.banner.t > 0) {
      var al = $.banner.t > 3.0 ? (3.4 - $.banner.t) / 0.4 : Math.min(1, $.banner.t / 1.0);
      HUD.banner(ctx, Renderer.W, Renderer.H, $.banner.title, $.banner.sub, al, $.banner.col);
    }
    for (i = 0; i < $.hits.length; i++) {
      HUD.hitMark(ctx, Renderer.W, Renderer.H, $.hits[i].txt, $.hits[i].t / 1.1, $.hits[i].col);
    }
    // "被对空雷达截获"进了 HUD 的告警栈（hud.js drawAlerts），和失速、导弹逼近一起排

    // ---- 鼠标引导的瞄准环 ----
    if ($.aimMode && $.player.alive && $.S.camMode !== 2) {
      // 准星画在瞄准方向的投影上（跟镜头时就是画面中心）
      var aimS = ($.player.aimDir && Renderer.getCam())
        ? M3.project(Renderer.getCam(), M3.add($.player.pos, M3.mul($.player.aimDir, 1400))) : null;
      var ax = M3.clamp(aimS ? aimS.x : Renderer.W / 2, 14, Renderer.W - 14);
      var ay = M3.clamp(aimS ? aimS.y : Renderer.H / 2, 14, Renderer.H - 14);
      var qk = M3.clamp($.player.q / 22, 0, 1);
      var acol = $.player.q < 12 ? 'rgba(255,77,77,0.95)'
        : ($.player.q < 20 ? 'rgba(255,176,58,0.95)' : 'rgba(79,224,138,0.95)');

      ctx.save();
      // 动压越低，飞控越"软" —— 用开口大小表示权限
      var gap = 4 + (1 - qk) * 9;
      var rad = 15 + (1 - qk) * 5;
      ctx.strokeStyle = acol;
      ctx.lineWidth = 1.6;
      for (var oct = 0; oct < 4; oct++) {
        var a0 = oct * Math.PI / 2 + gap / rad;
        var a1 = (oct + 1) * Math.PI / 2 - gap / rad;
        ctx.beginPath();
        ctx.arc(ax, ay, rad, a0, a1);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(ax, ay, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = acol;
      ctx.fill();
      ctx.font = 'bold 10px Consolas,monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = acol;
      ctx.fillText('CMD', ax, ay + rad + 13);
      if (document.pointerLockElement !== $.cv) {
        ctx.fillStyle = 'rgba(255,176,58,0.9)';
        ctx.fillText(T('ui.frame.render.s1'), ax, ay + rad + 28);
      }
      ctx.restore();
    }
  }

  /* ============================================================
     曳光弹
     子弹本身是真实弹体（有位置和速度），但之前完全没有渲染，
     所以开火除了声音之外看不到任何东西。这里按上一帧到当前帧的
     线段画成曳光，并用加色混合让它发光。
     ============================================================ */
  function drawTracers() {
    if (!$.world || !$.world.bullets.length) return;
    var cam = Renderer.getCam();
    if (!cam) return;

    var ctx = Renderer.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';          // 圆头会把相邻弹丸的线"焊"在一起

    for (var i = 0; i < $.world.bullets.length; i++) {
      var b = $.world.bullets[i];
      if (!b.alive) continue;

      var head = M3.project(cam, b.pos);
      if (!head) continue;

      /* 曳光长度**按距离自适应**，让屏幕上的角长度保持恒定。

         原来固定 13 米（也与"上一帧位置"解耦，避免高射速下弹丸首尾
         相接连成一根面条）。近处刚好，但到 1500 米外投影只有 0.5° ——
         看起来就是一颗缓慢移动的小点，玩家会以为"弹速很慢"。
         实际上 30mm 的炮口初速是 1020 m/s，一点都不慢。

         尾迹取 dist × 0.045，对应屏幕上约 2.6° 的角长度，
         从 300 米到 2000 米都一样显眼。上限 90 米防止近处拉成面条。 */
      var dirv = M3.norm(b.vel);
      var bDist = M3.dist(b.pos, cam.pos);
      /* 航空机炮：随距离衰减，但比真实透视慢 —— 屏幕上的角长度按 1/√距离 缩小（真实是 1/距离）。
         290 m 内维持 13 m；更远世界长度按 √距离 增长，1.5 km 外约 30 m，上限 90 m。
         以前是角长度恒定（dist × 0.045），远处一串弹和眼前一样长 */
      var trailLen = Math.min(90, 13 * Math.sqrt(Math.max(290, bDist) / 290));
      /* 中大口径炮弹（> 30 mm）不做角长度自适应：长度、粗细都是世界尺寸，
         近大远小 —— 否则几公里外的一发炮弹在屏幕上和眼前的一样大 */
      /* 炮塔打出来的弹（近防炮、遥控炮、尾炮）也按世界尺寸画：它们大多是远处的旁观者，
         按角长度自适应会让几公里外的一串近防炮弹粗得不合常理。玩家 / 僚机的航炮仍自适应 —— 那是瞄准用的 */
      var cal = b.cal || 20, big = cal > 30 || !!b.turret;
      if (big) trailLen = (cal > 30 ? 16 : 10) * Math.sqrt(cal / 20);
      /* 尾巴不越过炮口，并且接在**当前**炮口上。
         刚出膛的子弹在生成那一帧就已经飞出去十几米，飞机也往前走了 ——
         若按世界坐标里的出膛点截，曳光会从炮口前方凭空出现；
         若不截，13 米的最短尾迹会伸回机身里，看着像从机腹打出来。
         所以尾巴长度取"子弹到当前炮口沿弹道的距离"：第一帧可伸，之后只截。 */
      if (b.owner && b.owner.alive && b.side !== undefined) {
        var mzNow = Ent.gunMuzzle(b.owner, b.side);
        var ahead = M3.dot(M3.sub(b.pos, mzNow), dirv);
        /* 只有出膛**第一帧**的子弹才接回炮口（补上它生成那一帧飞出去的空当）。
           以前是"离炮口 60 米以内都接"—— 机头一转，前两三帧的子弹也被
           硬连到新的炮口位置，扫出一把斜着的长线。之后的子弹只截不伸。 */
        var young = (b.steps || 0) <= 1;
        if (ahead > 0 && (young || ahead < trailLen)) trailLen = ahead;
      }
      var tail = M3.project(cam, M3.sub(b.pos, M3.mul(dirv, trailLen)));
      if (!tail) tail = head;

      var mine = $.player && b.team === $.player.team;

      // 航空机炮的粗细同样慢衰减：√(400 / 距离)，最细保留 0.6 倍
      var wMul = M3.clamp(Math.sqrt(400 / Math.max(1, bDist)), 0.6, 1);
      /* 炮弹 / 炮塔弹：曳光光晕半径按口径取世界尺寸（75 mm ≈ 0.55 m，20 mm ≈ 0.2 m），
         投影后不小于约 0.6 px —— 远处是一道细亮线，不会消失 */
      if (big) wMul = Math.max(0.5, cam.focal * (cal > 30 ? 0.28 : 0.2) * Math.sqrt(cal / 20) / Math.max(1, bDist));
      ctx.strokeStyle = mine ? 'rgba(255,228,150,0.92)' : 'rgba(255,148,88,0.85)';
      ctx.lineWidth = (mine ? 1.35 : 1.15) * wMul;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();

      ctx.fillStyle = mine ? 'rgba(255,250,215,1)' : 'rgba(255,196,150,1)';
      ctx.beginPath();
      ctx.arc(head.x, head.y, (mine ? 1.25 : 1.0) * wMul, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
})(Game);
