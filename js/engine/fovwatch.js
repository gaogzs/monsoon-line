'use strict';

/* ============================================================
   FovWatch —— 视场 / 锥的进出调度（docs/POST2-0IMPL.md 5.6）

   回答"目标几何上进没进观察者的锥"，并在**进 / 出的那一刻**回调，下游不用每帧自己读角度、
   也不用各写一份"出框后 0.5 s 才算丢"的计时。

   省的不是单次计算，而是**不必每帧都算**：每次检查之后，用离边界的余量 margin = |角度 − 阈值|
   除以两者几何允许的最大角速度上界 ω_max，得到"最早可能越界的时刻" next；在 next 之前跳过检查。
   ω_max = (|v_观察者| + |v_目标|) / 距离 + 观察者的最大转向角速度（opts.turnMax，缺省 2.5 rad/s）。
   这是保守上界，所以不会漏事件；近、快时 ω_max 大 → next 很近 → 自然退化成每帧检查。

   迟滞：进框阈值 = cone × hyst（缺省 0.85），出框阈值 = cone（1.0 倍），防止边界上来回抖。
   "锁定"仍由各自的锁定逻辑决定（玩家的 updateLock、AI 的开火条件）；FovWatch 只提供锥进出这一个输入，
   并给"锁定状态翻转"一个广播口（lock / unlock / subscribe）。

   纯几何，不依赖任何后加载的模块。
   ============================================================ */
var FovWatch = (function () {
  var watches = [], subs = [];
  var stats = { checks: 0, skipped: 0 };
  var TURN_MAX = 2.5;

  /* 订阅一对（观察者, 目标）的锥进出。
     opts: { obs, tgt, cone（弧度，或返回弧度的函数）, hyst, turnMax, onEnter(h), onExit(h) }
     返回句柄 h：h.inside 随时可读。创建时立刻判一次初始状态（用进框阈值判，不触发 onEnter）。 */
  function watch(opts) {
    var h = {
      obs: opts.obs, tgt: opts.tgt, cone: opts.cone, hyst: opts.hyst || 0.85, turnMax: opts.turnMax || TURN_MAX,
      onEnter: opts.onEnter || null, onExit: opts.onExit || null,
      inside: false, next: -Infinity, alive: true
    };
    h.inside = angleOf(h) < coneOf(h) * h.hyst;
    watches.push(h);
    return h;
  }

  function unwatch(h) {
    if (!h) return;
    h.alive = false;
    var i = watches.indexOf(h);
    if (i >= 0) watches.splice(i, 1);
  }

  function coneOf(h) { return typeof h.cone === 'function' ? h.cone() : h.cone; }

  function angleOf(h) {
    var o = h.obs, t = h.tgt;
    var dx = t.pos.x - o.pos.x, dy = t.pos.y - o.pos.y, dz = t.pos.z - o.pos.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6) return 0;
    var c = (o.fwd.x * dx + o.fwd.y * dy + o.fwd.z * dz) / d;
    return Math.acos(c > 1 ? 1 : (c < -1 ? -1 : c));
  }

  function distOf(h) {
    var dx = h.tgt.pos.x - h.obs.pos.x, dy = h.tgt.pos.y - h.obs.pos.y, dz = h.tgt.pos.z - h.obs.pos.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /* 推进到时刻 now（秒）：到点的检查一遍，进 / 出框时回调，并排下一次检查的时间。 */
  function step(now) {
    for (var i = watches.length - 1; i >= 0; i--) {
      var h = watches[i];
      if (!h.alive) { watches.splice(i, 1); continue; }
      if (!h.obs.alive || !h.tgt.alive) continue;
      if (now < h.next) { stats.skipped++; continue; }
      stats.checks++;
      var ang = angleOf(h), cone = coneOf(h);
      var enterAt = cone * h.hyst, exitAt = cone;
      if (!h.inside && ang < enterAt) { h.inside = true; if (h.onEnter) h.onEnter(h); }
      else if (h.inside && ang > exitAt) { h.inside = false; if (h.onExit) h.onExit(h); }
      // 下一次检查：离"当前状态对应的边界"还有多少弧度，按最大角速度上界折成时间
      var margin = h.inside ? exitAt - ang : ang - enterAt;
      var d = Math.max(50, distOf(h));
      var vo = h.obs.speed || 0, vt = h.tgt.speed || 0;
      var omega = (vo + vt) / d + h.turnMax;
      h.next = now + Math.max(0, margin) / omega;
    }
  }

  /* 锁定状态翻转的广播口：由锁定逻辑在翻转那一刻调；订阅者收到 (type, obs, tgt)，type = 'lock' | 'lockLost'。 */
  function subscribe(fn) { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  function emit(type, obs, tgt) { for (var i = 0; i < subs.length; i++) subs[i](type, obs, tgt); }
  function lock(obs, tgt) { emit('lock', obs, tgt); }
  function unlock(obs, tgt) { emit('lockLost', obs, tgt); }

  function clear() { watches.length = 0; stats.checks = 0; stats.skipped = 0; }

  return {
    watch: watch, unwatch: unwatch, step: step, subscribe: subscribe, lock: lock, unlock: unlock, clear: clear,
    stats: stats, count: function () { return watches.length; }
  };
})();
