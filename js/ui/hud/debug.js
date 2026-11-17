(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawAiDebug = drawAiDebug;

  /* ============================================================
     AI 调试可视化（仅开发；docs/POST2-0IMPL.md 5.7，批次 5f）

     地址栏带 ?debug=ai 时才画（HUD.debugAI），不进正式界面、不进 smoke、不影响黄金回放（只读状态）。
     每架屏幕内的 AI 飞机头上叠一块小标签：mode · 目标 · 位格/技能/性格 · 角色（bait/flank/ward/fm）·
     撤离 / 假撤退 / PSM / 照射（lockHeldOn、illum）· 撤离评估倒计时。
   Director 的友机扇区环（≥ 2 架友机时）：以友机队质心为圆心、半径 SECTOR_R、玩家高度，
     每个友机的扇区画成两条半径线 + 一段弧，弧中点标 S<序号>/<总数>。
     文字是开发用的英文缩写，不走 T()。
     ============================================================ */
  HUD.debugAI = (function () {
    try { return typeof location !== 'undefined' && /[?&]debug=ai\b/.test(location.search || ''); } catch (e) { return false; }
  })();

  var SECTOR_R = 8000;     // 扇区环的半径（m），只是画出来给人看，不参与分派

  /* 世界空间的一段线：先在近平面裁剪再投影，不会在镜头后面拉出横穿屏幕的线 */
  function seg3(ctx, cam, a, b) {
    var c = M3.clipSeg(cam, a, b);
    if (!c) return;
    ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]);
  }

  /* Director 扇区环：d.cx / d.cz 是友机队质心，方位约定 0 = +z、向 +x 增大（与 director.js 的 atan2(x, z) 一致） */
  function drawSectors(ctx, W, H, p, world) {
    var d = world.aiDir;
    if (!d || !d.allies || d.allies.length < 2 || !AI.sectorOf) return;
    var cam = Renderer.getCam(), n = d.allies.length, y = p.pos.y, STEPS = 10;
    var at = function (th, r) { return M3.V(d.cx + r * Math.sin(th), y, d.cz + r * Math.cos(th)); };
    var o = M3.V(d.cx, y, d.cz);
    ctx.save();
    ctx.strokeStyle = 'rgba(79,224,138,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var sec = AI.sectorOf(d, d.allies[i]);
      if (!sec) continue;
      var lo = sec[0] - sec[1], hi = sec[0] + sec[1];
      seg3(ctx, cam, o, at(lo, SECTOR_R));
      for (var k = 0; k < STEPS; k++) seg3(ctx, cam, at(lo + (hi - lo) * k / STEPS, SECTOR_R), at(lo + (hi - lo) * (k + 1) / STEPS, SECTOR_R));
      seg3(ctx, cam, at(hi, SECTOR_R), o);
    }
    ctx.stroke();
    ctx.restore();
    for (var j = 0; j < n; j++) {
      var sc = AI.sectorOf(d, d.allies[j]);
      if (!sc) continue;
      var s = M3.projectUnclamped(cam, at(sc[0], SECTOR_R));
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
      $.text(ctx, 'S' + (j + 1) + '/' + n, s.x, s.y, 'rgba(79,224,138,0.75)', $.FS, 'center');
    }
  }

  function nameOf(u) { return u ? (u.label || u.name || u.id || '?') : '-'; }

  function drawAiDebug(ctx, W, H, p, world) {
    if (!HUD.debugAI || !world) return;
    drawSectors(ctx, W, H, p, world);
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive || a === p || !a.ai || a.route) continue;
      var s = M3.projectUnclamped(Renderer.getCam(), a.pos);
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
      var ai = a.ai, flags = [];
      if (ai.subrole) flags.push(ai.subrole);
      if (ai.ward) flags.push('ward');
      if (ai.fm) flags.push('fm:' + ai.fm.mode);
      if (ai.retreating) flags.push('RTB');
      if (ai.fake) flags.push('FAKE');
      if (a.psm) flags.push('PSM');
      if (ai.searching) flags.push('SEARCH');
      if (ai.blackT > 0) flags.push('GLOC');
      if (a.lockHeldOn) flags.push('LOCK>' + nameOf(a.lockHeldOn));
      if (ai.illum) flags.push('illum' + (ai.illum.abandoned ? '(x)' : ''));
      var l1 = ai.mode + ' > ' + nameOf(ai.target) + (ai.evalT > 0 ? '  eval ' + ai.evalT.toFixed(1) : '');
      var l2 = (ai.rank || '-') + ' ' + ai.skill.toFixed(2) + (ai.temperament ? ' ' + ai.temperament : '') + (ai.wclass ? ' ' + ai.wclass : '') + (ai.role !== 'enemy' ? ' [' + ai.role + ']' : '');
      var l3 = flags.join(' ');
      var col = a.team === p.team ? $.GREEN : $.AMBER;
      $.text(ctx, l1, s.x, s.y + 34, col, $.FS, 'center');
      $.text(ctx, l2, s.x, s.y + 48, 'rgba(185,200,212,0.8)', $.FS, 'center');
      if (l3) $.text(ctx, l3, s.x, s.y + 62, $.CY, $.FS, 'center');
    }
  }
})(HUD);
