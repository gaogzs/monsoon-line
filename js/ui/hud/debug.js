(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawAiDebug = drawAiDebug;

  /* ============================================================
     AI 调试可视化（仅开发；docs/POST2-0IMPL.md 5.7，批次 5f）

     地址栏带 ?debug=ai 时才画（HUD.debugAI），不进正式界面、不进 smoke、不影响黄金回放（只读状态）。
     每架屏幕内的 AI 飞机头上叠一块小标签：mode · 目标 · 位格/技能/性格 · 角色（bait/flank/ward/fm）·
     撤离 / 假撤退 / PSM / 照射（lockHeldOn、illum）· 撤离评估倒计时。
     文字是开发用的英文缩写，不走 T()。
     ============================================================ */
  HUD.debugAI = (function () {
    try { return typeof location !== 'undefined' && /[?&]debug=ai\b/.test(location.search || ''); } catch (e) { return false; }
  })();

  function nameOf(u) { return u ? (u.label || u.name || u.id || '?') : '-'; }

  function drawAiDebug(ctx, W, H, p, world) {
    if (!HUD.debugAI || !world) return;
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
