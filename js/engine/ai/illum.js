(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     AI 的半主动照射（docs/POST2-0IMPL.md 5.6「AI 使用」）

     自己有半主动弹（标签 sarh）在途、目标还活着时，AI 要"持续照射"：每帧判一次"我现在是否持有对它的锁定"，
     写 a.lockHeldOn（弹读它，见 entities/missile.js 的 sarh 分支）。
       持有 = 目标就是当前 s.target、没被压制出 clear、没 emcon、在这件弹的有效射程内、
              且目标在锁定锥里（FovWatch 提供：进 0.85 倍锥、出 1.0 倍锥的迟滞）。
     照射期间（illumHolds）：不重选目标、来袭弹 > 2.5 km 不转身规避、不主动加力（brain.js 里三处读它）。
     来袭弹进 2.5 km 时一次性判断放不放弃（概率 0.4 + 0.5×skill）；放弃就 abandoned，恢复规避。
     丢锁 → 弹自己有 SARH_GRACE 宽限；这里的状态一直保持到弹失效或目标被弹置空（宽限满）为止，
     宽限内 AI 机头转回来重新进锥，a.lockHeldOn 恢复，弹就接回引导。
     ============================================================ */
  $.illumHolds = function (s) {
    var il = s.illum;
    return !!(il && !il.abandoned && il.missile.alive && il.missile.target && il.target.alive && s.target === il.target);
  };

  $.updateIllum = function (a, s, world, dt) {
    var mine = null, i, m;
    for (i = 0; i < world.missiles.length; i++) {
      m = world.missiles[i];
      if (m.alive && m.owner === a && m.w && m.w.tags && m.w.tags.sarh && m.target && m.target.alive) { mine = m; break; }
    }
    if (!mine) {
      if (s.illum) { FovWatch.unwatch(s.illum.watch); s.illum = null; }
      a.lockHeldOn = null;
      return;
    }
    var t = mine.target, w = mine.w;
    if (!s.illum || s.illum.missile !== mine) {
      if (s.illum) FovWatch.unwatch(s.illum.watch);
      s.illum = {
        missile: mine, target: t, abandoned: false, decided: false,
        watch: FovWatch.watch({ obs: a, tgt: t, cone: function () { return w.lockCone * (a.pos.y > 18000 ? 0.8 : 1); }, hyst: 0.85 })
      };
    }
    var il = s.illum;
    var dist = M3.dist(a.pos, t.pos);
    var ok = !il.abandoned && s.target === t && !a.emcon && Ent.jamState(a, t) === 'clear' && Ent.jamLockOK(a, t) &&
      dist < Ent.aiReach(w, a.pos.y) * Ent.jamLockK(a) && il.watch.inside;
    a.lockHeldOn = ok ? t : null;
  };
})(AI);
