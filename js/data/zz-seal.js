'use strict';

Registry.sealData();

/* ============================================================
   desc 里的数字从数据里取

   desc 可以写 {{字段}}，加载时（所有挂载表都已合并之后）替换成
   当前数值 —— 改了数据，图鉴和机库里的文字跟着变，版本更新漏不掉。
   以前全是手写数字：转弯率、冷却、单点挂载量都和数据对不上过。
   ============================================================ */
(function () {
  function deg(r) { return Math.round(r * 180 / Math.PI); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function num(x) { return (Math.round(x * 100) / 100).toString(); }
  var HARD_K_TEXT = { cluster: 0.2, other: 0.6 };   // 与 entities.js 的 HARD_K 同值
  var DERIVED = {
    coneDeg: function (w) { return deg(w.lockCone || 0); },
    lockKm: function (w) { return num((w.lockDist || 0) / 1000); },
    flarePct: function (w) { return pct(w.flare || 0); },
    flareRDPct: function (w) { return pct(w.flareRD !== undefined ? w.flareRD : (w.flare || 0)); },
    lockResistPct: function (w) { return pct(w.lockResist || 0); },
    lockReducePct: function (w) { return pct(w.lockReduce || 0); },
    interceptConeDeg: function (w) { return deg(w.interceptCone || 0); },
    interceptPct: function (w) { return pct(w.interceptChance || 0); },
    highAltPct: function (w) { return pct(w.highAltChance || 0); },
    volleys: function (w) { return Math.floor((w.perPoint || 0) / Math.max(1, w.salvo || 1)); },
    hardPct: function (w) { return pct(w.cluster ? HARD_K_TEXT.cluster : HARD_K_TEXT.other); },
    loftAlt: function (w) { return w.loft ? w.loft.alt : 0; },
    loftDiveKm: function (w) { return w.loft ? num(w.loft.dive / 1000) : 0; }
  };
  for (var k in WEAPONS) {
    if (!Object.prototype.hasOwnProperty.call(WEAPONS, k)) continue;
    var w = WEAPONS[k];
    if (typeof w.desc !== 'string') continue;
    w.desc = w.desc.replace(/\{\{(\w+)\}\}/g, function (all, f) {
      if (DERIVED[f]) return String(DERIVED[f](w));
      if (typeof w[f] === 'number') return num(w[f]);
      return all;
    });
  }
})();
