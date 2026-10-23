/* ============================================================
   ballistics.js —— 炮弹的外弹道（docs/2-0IMPL.md 阶段 5.2）

   炮弹受两个力：重力（g × 炮的 gravity 倍率），阻力（k × ρ/ρ0 × |v|·v）。
   k 写在炮的数据里（TURRET_GUNS 的 drag，海平面的 1/m），没写 drag 的炮
   （航空机炮）仍然只有重力，行为和以前一样。

   这个文件做三件事，全部用同一份积分：
     step(b, dt)          游戏里每帧推进一发炮弹（entities.js 的 stepBullet 调）
     aim(g, y0, D, H)     给定水平距离 D、目标高出炮口 H，解出发射仰角和飞行时间
                          —— 火控（turret.js 的 solve）用它代替"距离 / 弹速"
     airReach(g, elev)    射击包线：对仰角 elev 的目标，引信时间内仍有可用速度的最远斜距
                          —— 代替单一的 airRange。结果按炮缓存，第一次用到时才算

   积分是在铅垂面里做的二维 Heun（二阶），解算步长 0.15 s；游戏里用的步长是帧时间，
   两者的差别在几米量级。
   ============================================================ */
var Ballistics = (function () {
  'use strict';
  var G = 9.80665, RHO0 = 1.225;
  var SOLVE_DT = 0.15;
  var V_MIN_K = 0.3;                 // 到靶时速度低于初速的 30% 视为"没劲了"，不算有效射程
  var ELEVS = [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1.1, 1.25, 1.4];   // 包线的采样仰角（rad）

  function rhoRel(y) { return Ent.airDensity(y < 0 ? 0 : y) / RHO0; }
  function gOf(g) { return G * (g.gravity === undefined ? 1 : g.gravity); }

  /* 一发炮弹在世界里推进 dt（Heun）。b.drag 缺省 0 = 只有重力（旧行为，欧拉）。 */
  function step(b, dt) {
    var gv = G * (b.grav === undefined ? 1 : b.grav);
    var k = b.drag || 0;
    var v = b.vel;
    if (!k) {
      v.y -= gv * dt;
      b.pos = M3.add(b.pos, M3.mul(v, dt));
      return;
    }
    var s1 = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z), r1 = k * rhoRel(b.pos.y) * s1;
    var a1x = -r1 * v.x, a1y = -r1 * v.y - gv, a1z = -r1 * v.z;
    var v2x = v.x + a1x * dt, v2y = v.y + a1y * dt, v2z = v.z + a1z * dt;
    var p2y = b.pos.y + v.y * dt;
    var s2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z), r2 = k * rhoRel(p2y) * s2;
    var nx = v.x + 0.5 * (a1x - r2 * v2x) * dt;
    var ny = v.y + 0.5 * (a1y - r2 * v2y - gv) * dt;
    var nz = v.z + 0.5 * (a1z - r2 * v2z) * dt;
    b.pos = M3.V(b.pos.x + 0.5 * (v.x + nx) * dt, b.pos.y + 0.5 * (v.y + ny) * dt, b.pos.z + 0.5 * (v.z + nz) * dt);
    b.vel = M3.V(nx, ny, nz);
  }

  /* 铅垂面里飞一发：仰角 th、炮口高度 y0（世界），飞到水平距离 D。
     返回 { y: 到 D 时相对炮口的高度, t, v }；够不着（速度耗尽、先落水、超时）返回 null。 */
  function fly(g, y0, th, D, tMax) {
    var k = g.drag || 0, gv = gOf(g);
    var vx = g.speed * Math.cos(th), vy = g.speed * Math.sin(th);
    var x = 0, y = y0, t = 0, dt = SOLVE_DT;
    while (t < tMax) {
      var s1 = Math.sqrt(vx * vx + vy * vy), r1 = k * rhoRel(y) * s1;
      var a1x = -r1 * vx, a1y = -r1 * vy - gv;
      var v2x = vx + a1x * dt, v2y = vy + a1y * dt;
      var s2 = Math.sqrt(v2x * v2x + v2y * v2y), r2 = k * rhoRel(y + vy * dt) * s2;
      var nvx = vx + 0.5 * (a1x - r2 * v2x) * dt, nvy = vy + 0.5 * (a1y - r2 * v2y - gv) * dt;
      var nx = x + 0.5 * (vx + nvx) * dt, ny = y + 0.5 * (vy + nvy) * dt;
      if (nx >= D) {
        var f = nx > x ? (D - x) / (nx - x) : 0;
        var vv = Math.sqrt(nvx * nvx + nvy * nvy);
        return { y: y + (ny - y) * f - y0, t: t + dt * f, v: vv };
      }
      if (nvx < 0.5 || ny < -30) return null;
      x = nx; y = ny; vx = nvx; vy = nvy; t += dt;
    }
    return null;
  }

  /* 解仰角：打到水平距离 D、高出炮口 H 的点。取低弹道解。
     hint 是上一次的仰角（目标慢慢动，上次的解就在附近），省掉大半次试飞。
     返回 { th, t, v }；打不到返回 null。tMax 限制飞行时间（引信 / 寿命）。 */
  function aim(g, y0, D, H, tMax, hint) {
    if (D < 1) return { th: Math.atan2(H, 1), t: 0, v: g.speed };
    var los = Math.atan2(H, D);
    function f(th) { var r = fly(g, y0, th, D, tMax); return r ? r.y - H : -1e9; }
    var lo = los, hi, fl = f(lo);
    if (fl >= 0) { var r0 = fly(g, y0, lo, D, tMax); return { th: lo, t: r0.t, v: r0.v }; }
    if (hint !== undefined && hint > los) {
      var w = 0.004, a = Math.max(los, hint - w), b = hint + w, fa = f(a), fb = f(b);
      for (var e = 0; e < 5 && !(fa < 0 && fb >= 0); e++) {
        w *= 2;
        if (fa >= 0) { b = a; fb = fa; a = Math.max(los, a - w); fa = f(a); }
        else { a = b; fa = fb; b = b + w; fb = f(b); }
      }
      if (fa < 0 && fb >= 0) { lo = a; hi = b; }
    }
    if (hi === undefined) {
      hi = los + 0.3;
      while (hi < 1.5 && f(hi) < 0) { lo = hi; hi += 0.3; }
      if (f(Math.min(hi, 1.5)) < 0) return null;
      hi = Math.min(hi, 1.5);
    }
    for (var i = 0; i < 9; i++) {
      var mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid; else hi = mid;
    }
    var rr = fly(g, y0, hi, D, tMax);
    return rr ? { th: hi, t: rr.t, v: rr.v } : null;
  }

  /* ---------- 射击包线（按炮缓存） ---------- */
  var Y0 = 20;                       // 缓存按炮口高 20 m 算（舰上炮位）
  function bal(g) {
    if (g.__bal) return g.__bal;
    var airR = g.airRange || g.range || 1600, R = g.range || 1600;
    /* 引信 / 寿命：飞到名义射程所需的时间，再留一点余量 */
    var rs = aim(g, Y0, R, 0, 120), ra = aim(g, Y0, airR, 0, 120);
    var B = {
      surfLife: (rs ? rs.t : R / g.speed * 1.5) * 1.1,
      airLife: ra ? ra.t : airR / g.speed * 1.3,
      reach: null
    };
    g.__bal = B;
    return B;
  }

  /* 弹的寿命（秒）：没有引信限制时飞到名义射程为止 */
  function life(g) { return g.drag ? bal(g).surfLife : (g.range || 1600) / Math.max(1, g.speed); }
  /* 对空引信上限：飞到 airRange 的时间 */
  function airLife(g) { return bal(g).airLife; }

  function feasible(g, B, d, el) {
    var r = aim(g, Y0, d * Math.cos(el), d * Math.sin(el), B.airLife * 1.02);
    return !!r && r.v >= g.speed * V_MIN_K;
  }
  function buildReach(g) {
    var B = bal(g), cap = g.airRange || g.range || 1600, out = [];
    for (var i = 0; i < ELEVS.length; i++) {
      var lo = 0, hi = cap;
      if (feasible(g, B, hi, ELEVS[i])) { out.push(hi); continue; }
      for (var j = 0; j < 10; j++) {
        var mid = (lo + hi) / 2;
        if (feasible(g, B, mid, ELEVS[i])) lo = mid; else hi = mid;
      }
      out.push(lo);
    }
    /* 仰角越高射程不增：近垂直方向的数值解有毛刺，取单调下降 */
    for (var m = 1; m < out.length; m++) out[m] = Math.min(out[m], out[m - 1]);
    return out;
  }

  /* 对仰角 elev（目标相对炮口，rad，向下取 0）的目标，能打到的最远斜距 */
  function airReach(g, elev) {
    if (!g.drag) return g.airRange || g.range || 1600;
    var B = bal(g);
    if (!B.reach) B.reach = buildReach(g);
    var e = elev < 0 ? 0 : (elev > ELEVS[ELEVS.length - 1] ? ELEVS[ELEVS.length - 1] : elev);
    for (var i = 1; i < ELEVS.length; i++) {
      if (e <= ELEVS[i]) {
        var u = (e - ELEVS[i - 1]) / (ELEVS[i] - ELEVS[i - 1]);
        return B.reach[i - 1] + (B.reach[i] - B.reach[i - 1]) * u;
      }
    }
    return B.reach[B.reach.length - 1];
  }

  return { step: step, fly: fly, aim: aim, life: life, airLife: airLife, airReach: airReach, reachTable: function (g) { bal(g); var B = g.__bal; if (!B.reach) B.reach = buildReach(g); return { elev: ELEVS, reach: B.reach }; } };
})();
