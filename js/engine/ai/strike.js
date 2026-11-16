(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     低空突防（docs/POST2-0IMPL.md 5.7，批次 5d）

     对面攻击机（机型 caps 含 'strike'，skill ≥ 0.6）打面目标：
       远（> 包线 × POP_K）或刚发射完：贴海面 / 地面飞（SKIM_AGL），躲对空雷达的视线与近防的反应时间
       近（≤ 包线 × POP_K）：拉起到投放高度，进包线投射
     返回期望方向，或 null（不适用：交回原来的 approachSurface）。
     与近地保护的关系：maneuver 里 s.lowStrike 为真时跳过"agl < 420 强拉起"；这里自己守 SKIM_FLOOR 下限。
     ============================================================ */
  $.SKIM = { AGL: 120, FLOOR: 70, POP_K: 1.3, POP_AGL: 1800 };

  $.skimDir = function (a, s, dir) {
    if (s.skill < 0.6 || !a.ac || !a.ac.caps || a.ac.caps.indexOf('strike') < 0) return null;
    var t = s.target;
    if (!t || t.kind !== 'target') return null;
    var w = WEAPONS[a.special];
    var reach = w ? Ent.aiReach(w, Math.max(500, Ent.agl(a))) : 6000;
    var d = M3.dist(a.pos, t.pos);
    var agl = Ent.agl(a);
    var hl = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
    var hx = dir.x / hl, hz = dir.z / hl;
    if (d <= reach * $.SKIM.POP_K && !(s.shootT > 0)) {            // 到包线边缘：拉起到投放高度
      if (agl < $.SKIM.POP_AGL) return M3.norm(M3.V(hx, 0.25, hz));
      return null;
    }
    var dy = Math.max(-0.3, Math.min(0.12, ($.SKIM.AGL - agl) / 400));
    if (agl < $.SKIM.FLOOR) dy = Math.max(dy, 0.25);
    return M3.norm(M3.V(hx, dy, hz));
  };
})(AI);
