/* ============================================================
   turret.js —— 旋转炮塔（docs/2-0IMPL.md 阶段 3）

   舰船（SHIPS[].mounts）和飞机（AIRCRAFT[].mounts，目前只有 ROK-40 的尾炮）
   身上的炮位。每门炮自己索敌、按受限的角速度转过去、解算提前量、开火；
   开火走 Ent.fireGunFrom，和机炮共用一套子弹（大口径带近炸 / 空爆）。

   "打得中 / 打不中"不靠概率掷骰，靠三处刻意的迟钝：
     · 提前量用滤波后的目标速度 vEst（时间常数 lag）—— 匀速直线时收敛必中，
       一机动 vEst 就落后
     · 瞄准方向叠一个缓慢漂移的 OU 噪声（σ = err）
     · 转动受角速度 / 角加速度限制，追不上贴近横穿的目标

   发射架：TURRET_GUNS 里 kind: 'launcher' 的"炮"打的是导弹（weapon = WEAPONS 的 id）。
   同一套索敌 / 转动，不算提前量（导弹自己导引），对准目标方向（可加 loft 抬高）
   就出一发 Ent.makeMissile，按 cd 冷却、按 ammo 计数（0 = 不限，mount.cells 可覆盖）。
   mount.fixed 的是固定发射器（垂发 / 斜置架），不转动，沿固定方向出管；
   其余照炮塔转向目标（旋转发射架，对空 lnchSam / 对舰 lnchSsm）。

   坐标：炮位 pos 是宿主模型空间（+z 船头、+x 右、+y 上），
   宿主基 right = up × fwd（与渲染器同一套）。
   方位角 yaw 从 +z 往 +x 转为正，俯仰 pitch 向上为正，都相对宿主。
   ============================================================ */
var Turret = (function () {
  'use strict';

  var DEF_SLEW = {
    ciws20: { yaw: 2.2, pitch: 1.8, accel: 6.0 },
    aa30:   { yaw: 1.6, pitch: 1.3, accel: 4.0 },
    tail20: { yaw: 1.4, pitch: 1.2, accel: 4.0 },
    n50:    { yaw: 1.0, pitch: 0.9, accel: 2.5 },
    n75:    { yaw: 0.7, pitch: 0.6, accel: 1.6 },
    n120:   { yaw: 0.45, pitch: 0.4, accel: 1.0 }
  };
  /* 火控：口径越大越迟钝（速度滤波更慢、瞄准漂移更大）。fuzeErr = 定时引信的相对误差（σ），
     大口径炮弹靠空爆，引信差几个百分点，起爆点就前后错开十几、几十米 */
  var DEF_AIM = { err: 0.003, lag: 0.7, react: 0.6 };
  var AIM_BY_GUN = {
    ciws20: { err: 0.003, lag: 0.6, react: 0.5 },
    aa30:   { err: 0.0035, lag: 0.7, react: 0.6 },
    tail20: { err: 0.004, lag: 0.7, react: 0.6 },
    n50:    { err: 0.004, lag: 0.9, react: 0.7, fuzeErr: 0.05 },
    n75:    { err: 0.005, lag: 1.1, react: 0.8, fuzeErr: 0.06 },
    n120:   { err: 0.006, lag: 1.3, react: 1.0, fuzeErr: 0.07 }
  };
  var WAKE_MARGIN = 1500;        // 射程外这么远之内才索敌，否则整门炮休眠
  var OU_TAU = 0.8;              // 瞄准噪声的漂移时间常数（秒）

  function wrapPi(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
  var spareG = null;
  function gauss() {
    if (spareG !== null) { var g = spareG; spareG = null; return g; }
    var u = Math.max(1e-9, Math.random()), v = Math.random();
    var r = Math.sqrt(-2 * Math.log(u));
    spareG = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  /* 由 mounts 生成运行时状态 */
  /* host.hasAA：同舰有专职对空炮（aa / ciws），两用主炮更倾向打船 */
  function make(mounts) {
    if (!mounts || !mounts.length) return null;
    var out = [];
    for (var i = 0; i < mounts.length; i++) {
      var m = mounts[i], gun = TURRET_GUNS[m.gun];
      if (!gun) continue;
      var spec = (m.model && typeof MODELS !== 'undefined' && MODELS.TURRET_SPEC) ? MODELS.TURRET_SPEC[m.model] : null;
      out.push({
        m: m, gun: gun,
        slew: m.slew || DEF_SLEW[m.gun] || DEF_SLEW.aa30,
        aim: m.aim || AIM_BY_GUN[m.gun] || DEF_AIM,
        pivot: spec ? spec.pivot : 0, barrel: spec ? spec.barrel : (m.barrel || 0),
        yaw: m.yaw0 || 0, pitch: fixedPitch(m), wYaw: 0, wPitch: 0,
        target: null, scanT: Math.random() * 0.6, cd: 0,
        vEst: null, nY: 0, nP: 0, firing: false,
        ammo: gun.kind === 'launcher' && !gun.cued ? (m.cells || gun.ammo || 0) : 0, fired: 0
      });
    }
    return out.length ? out : null;
  }
  /* 固定发射器（m.fixed）不转：vls 竖直，斜置架按 elev */
  function fixedPitch(m) {
    if (!m.fixed) return 0;
    return m.fixed === 'vls' ? Math.PI / 2 : (m.fixed.elev || 0);
  }
  /* launchers：舰船发射器（SHIP_LAUNCHERS），接在炮位后面一起跑 */
  function attach(host, mounts, launchers) {
    if (launchers && launchers.length) mounts = (mounts || []).concat(launchers);
    host.turrets = make(mounts);
    host.hasAA = !!(mounts && mounts.some(function (m) { return m.role === 'aa' || m.role === 'ciws'; }));
    /* 齐射节奏（gun.salvo 的发射器，见 launch）：一波打几发按全舰这类备弹算，1–4 发 */
    var tot = 0, T = host.turrets || [];
    for (var i = 0; i < T.length; i++) if (T[i].gun.salvo) tot += T[i].ammo;
    host.salvoN = tot ? M3.clamp(Math.round(tot / 4), 1, 4) : 0;
    host.salvoShots = 0;
    host.salvoUntil = 0;
    return host.turrets;
  }

  function hostBasis(h) {
    var f = h.fwd, u = h.up || M3.V(0, 1, 0);
    var r = M3.norm(M3.cross(u, f));
    return { f: f, u: u, r: r };
  }
  function toWorld(h, B, p) {
    return M3.add(h.pos, M3.add(M3.mul(B.r, p[0]), M3.add(M3.mul(B.u, p[1]), M3.mul(B.f, p[2]))));
  }
  function dirOf(B, yaw, pitch) {
    var cp = Math.cos(pitch);
    return M3.add(M3.mul(B.r, Math.sin(yaw) * cp), M3.add(M3.mul(B.u, Math.sin(pitch)), M3.mul(B.f, Math.cos(yaw) * cp)));
  }
  /* 耳轴位置（炮弹从这里沿炮管出去 barrel 米） */
  function pivotPos(tu, h, B) {
    var p = toWorld(h, B, tu.m.pos);
    return tu.pivot ? M3.add(p, M3.mul(B.u, tu.pivot)) : p;
  }
  function muzzlePos(tu, h, B) {
    var p = pivotPos(tu, h, B);
    return tu.barrel ? M3.add(p, M3.mul(dirOf(B, tu.yaw, tu.pitch), tu.barrel)) : p;
  }
  /* 世界方向 → 宿主的 (yaw, pitch) */
  function anglesOf(B, d) {
    var x = M3.dot(d, B.r), y = M3.dot(d, B.u), z = M3.dot(d, B.f);
    return { yaw: Math.atan2(x, z), pitch: Math.atan2(y, Math.sqrt(x * x + z * z)) };
  }
  function inArc(tu, yaw, pitch) {
    var a = tu.m.arc, ry = wrapPi(yaw - (tu.m.yaw0 || 0));
    return ry >= a.yawMin && ry <= a.yawMax && pitch >= a.pitchMin && pitch <= a.pitchMax;
  }
  function clampArc(tu, yaw, pitch) {
    var a = tu.m.arc, y0 = tu.m.yaw0 || 0;
    var ry = M3.clamp(wrapPi(yaw - y0), a.yawMin, a.yawMax);
    return { yaw: wrapPi(y0 + ry), pitch: M3.clamp(pitch, a.pitchMin, a.pitchMax) };
  }

  function isAir(e) { return e.kind !== 'target'; }
  /* 对空火控要先有航迹（与舰空弹同一条规矩，game.js pickTargetFor）：
     敌方（team 1）的炮只在本方被对空雷达截获（world.detected）后才打，
     或者目标低空（< dangerAltitude）并且近到目视 / 光电看得见（5.2 km）。
     近防炮自带搜索 + 跟踪雷达，不受这一条限制。我方舰船不设门槛（与舰空弹一致） */
  var VISUAL_R = 5200;
  function airTracked(tu, host, e, world) {
    // 受控发射器（cued）：打不打已经由 updateTargets 按同一条规矩判过了
    if (!world || host.team !== 1 || tu.m.role === 'ciws' || tu.gun.cued) return true;
    if (world.detected) return true;
    return e.pos.y < (world.dangerAltitude || 1500) && M3.dist(e.pos, host.pos) < VISUAL_R;
  }

  /* ---------- 近防炮拦截导弹（2-0IMPL 4.7，混合方案）----------
     候选：1800 m 内、在射界里、敌方的导弹，目标是本舰或预计航迹在 300 m 内掠过本舰。
     每门近防同时只打 1 枚（m.ciwsBy 认领），按预计到达时间排队。
     概率只在炮管真的对准开火时累计（见 step 里的 fireT）。 */
  /* CIWS_CUE：搜索雷达在这个距离就把来袭弹交给近防，提前转过去跟踪；真正开火 / 掷骰仍在 CIWS_R 以内 */
  var CIWS_R = 1800, CIWS_CUE = 3000, CIWS_PASS = 300, ROLL_DT = 0.25, P_BASE = 0.08;
  function pickMissile(tu, host, B, P0, world) {
    var best = null, bt = 1e9, L = world.missiles;
    for (var i = 0; i < L.length; i++) {
      var m = L[i];
      if (!m.alive || m.ciwsKill || m.team === host.team || m.team > 1) continue;
      if (m.ciwsBy && m.ciwsBy !== tu && m.ciwsBy.target === m) continue;   // 别的近防已经在打
      var rel = M3.sub(host.pos, m.pos), d = M3.len(rel);
      if (d > CIWS_CUE) continue;
      var v = m.vel && M3.len(m.vel) > 1 ? m.vel : M3.mul(m.fwd, m.speed || 300);
      var vv = M3.dot(v, v), ts = M3.dot(rel, v) / vv;
      if (ts < 0) continue;                                       // 已经飞过去了
      if (m.target !== host && M3.len(M3.sub(rel, M3.mul(v, ts))) > CIWS_PASS + (host.radius || 0)) continue;
      var a = anglesOf(B, M3.norm(M3.sub(m.pos, P0)));
      if (!inArc(tu, a.yaw, a.pitch)) continue;
      if (ts < bt) { bt = ts; best = m; }
    }
    if (best) best.ciwsBy = tu;
    return best;
  }
  /* 单次掷骰：p = P_BASE × speedK × aspectK × 压制折扣 */
  function interceptP(host, m) {
    var spd = m.speed || 600;
    var speedK = M3.clamp(600 / spd, 0.5, 1.2);
    var v = m.vel && M3.len(m.vel) > 1 ? M3.norm(m.vel) : m.fwd;
    var toH = M3.norm(M3.sub(host.pos, m.pos));
    var aspectK = 0.7 + 0.3 * Math.abs(M3.dot(v, toH));          // 正对来袭 1.0，横穿 0.7
    return P_BASE * speedK * aspectK * (1 - 0.6 * (host.suppressed || 0));
  }

  /* 能打海面：炮自己标了 surface（50 mm），或者炮位 role 是 dual（两用主炮） */
  function surfaceOK(tu) { return !!tu.gun.surface || tu.m.role === 'dual'; }
  /* 这门炮能打什么：air（缺省 true）管飞机，surfaceOK 管舰船 / 大型设施。
     宿主所在关卡关了舰对舰（world.surfaceFire === false）就不打海面 */
  function canEngage(tu, host, e, world) {
    if (!e || !e.alive || e === host || e.team === host.team) return false;
    if (e.team === 2) return false;                       // 中立（调节单元之类）
    if (e.kind === 'missile') return tu.m.role === 'ciws' && !e.ciwsKill && e.team < 2;
    if (isAir(e)) return tu.gun.air !== false && !e.escaped && airTracked(tu, host, e, world);
    if (world && world.surfaceFire === false) return false;
    if (tu.orders && tu.orders.mode === 'only' && tu.orders.target !== e) return false;
    return surfaceOK(tu) && !!e.big && e.ttype !== 'air';
  }

  /* 命令（2-0IMPL 4.4）：host.orders = { target, mode:'prefer'|'only', weight, until, surface?, air? }。
     按炮位 role 也可以分开写：host.orders.surface / host.orders.air（各自同结构）。
     until：游戏时间（秒）或函数 (host, world) → true 表示命令结束。 */
  function ordersFor(tu, host, world) {
    var O = host.orders;
    if (!O) return null;
    var o = O.target ? O : (O.surface && surfaceOK(tu) ? O.surface : (O.air || null));
    if (!o || !o.target) return null;
    var done = !o.target.alive ||
      (typeof o.until === 'number' && world.time >= o.until) ||
      (typeof o.until === 'function' && o.until(host, world));
    return done ? null : o;
  }
  function isLauncher(tu) { return tu.gun.kind === 'launcher'; }
  function rangeOf(tu) {
    var g = tu.gun;
    if (g.range) return g.range;
    var w = isLauncher(tu) ? WEAPONS[g.weapon] : null;
    /* 发射器：和 AI 同一套 —— min(锁定距离, 有效射程 × 余量)，不在打不到的距离上放弹 */
    return w ? Ent.aiReach(w, 30) : 2000;
  }

  /* 拦截点：tof = 距离 / 弹速，迭代两次；相对宿主速度外推，再补炮弹下坠 */
  function solve(tu, host, P0, t) {
    var g = tu.gun, v = g.speed;
    /* 发射架：导弹自己导引，只需朝目标方向（加 loft 抬高，给舰空 / 反舰弹一个爬升角） */
    if (isLauncher(tu)) {
      var dd = M3.dist(t.pos, P0);
      return { p: M3.add(t.pos, M3.V(0, dd * (g.loft || 0), 0)), tof: 0 };
    }
    var vt = tu.vEst || t.vel || M3.V(0, 0, 0);
    var hv = host.vel || M3.V(0, 0, 0);
    var rel = M3.sub(vt, hv);
    if (!isAir(t)) return solveSurface(tu, P0, t, rel);
    var acc = tu.aEst || M3.V(0, 0, 0), AK = 0.15;    // 加速度只信一点点（也是滤过的，本来就迟钝）
    var aim = t.pos, tof = 0;
    if (g.drag) return solveAirBallistic(tu, P0, t, rel, acc, AK);
    for (var k = 0; k < 2; k++) {
      tof = M3.dist(aim, P0) / v;
      aim = M3.add(t.pos, M3.add(M3.mul(rel, tof), M3.mul(acc, 0.5 * AK * tof * tof)));
    }
    var drop = 0.5 * 9.81 * (g.gravity === undefined ? 1 : g.gravity) * tof * tof;
    return { p: M3.add(aim, M3.V(0, drop, 0)), tof: tof };
  }

  /* 对空，带阻力的炮弹（阶段 5.2）：tof 迭代四次（目标横穿时少一次就差几十米提前量），每次用 Ballistics.aim 解仰角和真实飞行时间。
     返回沿解算方向 1 km 处的点（同 solveSurface）；打不到（超出包线）返回 null。 */
  function solveAirBallistic(tu, P0, t, rel, acc, AK) {
    var g = tu.gun, aim = t.pos, tof = 0, r = null, hx = 0, hz = 0, D = 0;
    for (var k = 0; k < 4; k++) {
      hx = aim.x - P0.x; hz = aim.z - P0.z;
      D = Math.sqrt(hx * hx + hz * hz);
      r = Ballistics.aim(g, P0.y, D, aim.y - P0.y, Ballistics.airLife(g) * 1.05, tu.thHint);
      if (!r) return null;
      tu.thHint = r.th;
      tof = r.t;
      aim = M3.add(t.pos, M3.add(M3.mul(rel, tof), M3.mul(acc, 0.5 * AK * tof * tof)));
    }
    if (D < 1) return { p: M3.add(P0, M3.V(0, 1000, 0)), tof: tof };
    var c = Math.cos(r.th);
    return { p: M3.add(P0, M3.V(hx / D * c * 1000, Math.sin(r.th) * 1000, hz / D * c * 1000)), tof: tof };
  }

  /* 对海面：低伸弹道（4.2）。tanθ = (v² − √(v⁴ − g(g·d² + 2h·v²))) / (g·d)，
     tof 迭代三次求拦截点；超射程（无解）返回 null —— 不开火。
     瞄准点取目标水线上方一点（舰体中段），p 返回沿解算方向 1 km 处的点，供转角用。 */
  function solveSurface(tu, P0, t, rel) {
    var g = tu.gun, v = g.speed, G0 = 9.81 * (g.gravity === undefined ? 1 : g.gravity);
    var aimY = t.pos.y + Math.min(6, (t.radius || 10) * 0.12);
    var tof = 0, th = 0, hx = 0, hz = 0, d = 0;
    if (g.drag) {
      /* 带阻力：数值解仰角（Ballistics.aim），tof 迭代三次。超出射程 / 速度耗尽返回 null */
      for (var kb = 0; kb < 3; kb++) {
        hx = t.pos.x + rel.x * tof - P0.x; hz = t.pos.z + rel.z * tof - P0.z;
        d = Math.sqrt(hx * hx + hz * hz);
        if (d < 1) return null;
        var rb = Ballistics.aim(g, P0.y, d, aimY - P0.y, Ballistics.life(g), tu.thHint);
        if (!rb) return null;
        tu.thHint = th = rb.th; tof = rb.t;
      }
      var cb = Math.cos(th);
      return { p: M3.add(P0, M3.mul(M3.V(hx / d * cb, Math.sin(th), hz / d * cb), 1000)), tof: tof, surface: true };
    }
    for (var k = 0; k < 3; k++) {
      var ax = t.pos.x + rel.x * tof, az = t.pos.z + rel.z * tof;
      hx = ax - P0.x; hz = az - P0.z;
      d = Math.sqrt(hx * hx + hz * hz);
      var h = aimY - P0.y;
      if (G0 < 1e-6) { th = Math.atan2(h, d); tof = Math.sqrt(d * d + h * h) / v; continue; }
      var disc = v * v * v * v - G0 * (G0 * d * d + 2 * h * v * v);
      if (disc < 0 || d < 1) return null;
      th = Math.atan((v * v - Math.sqrt(disc)) / (G0 * d));
      tof = d / (v * Math.cos(th));
    }
    var c = Math.cos(th);
    var dir = M3.V(hx / d * c, Math.sin(th), hz / d * c);
    return { p: M3.add(P0, M3.mul(dir, 1000)), tof: tof, surface: true };
  }

  /* 威胁度（4.4）：6 km 内、正在接近或锁定本舰的飞机 1.0，其他飞机 0.4 */
  function threatOf(host, e) {
    var d = M3.dist(e.pos, host.pos);
    if (d > 6000) return 0.4;
    if (e.target === host) return 1;
    var cl = e.vel ? -M3.dot(M3.norm(M3.sub(e.pos, host.pos)), e.vel) : 0;
    return cl > 30 ? 1 : 0.4;
  }

  /* 射击包线：对 e 的仰角下，这门炮对空最远能打多远（Ballistics.airReach） */
  function airReachTo(tu, P0, e) {
    var d = M3.dist(e.pos, P0);
    return Ballistics.airReach(tu.gun, d > 1 ? Math.asin(M3.clamp((e.pos.y - P0.y) / d, -1, 1)) : 0);
  }

  function score(tu, host, B, P0, e) {
    var d = M3.dist(e.pos, P0), R = rangeOf(tu);
    // 对飞机只在射击包线内开火：按目标仰角查（平射远、仰射近），近防炮再远打出去的弹只会被躲开
    if (isAir(e) && tu.gun.airRange) R = Math.min(R, airReachTo(tu, P0, e));
    if (d > R) return -1;
    var a = anglesOf(B, M3.norm(M3.sub(e.pos, P0)));
    if (!inArc(tu, a.yaw, a.pitch)) return -1;
    var turn = tu.m.fixed ? 0 :
      Math.abs(wrapPi(a.yaw - tu.yaw)) / tu.slew.yaw + Math.abs(a.pitch - tu.pitch) / tu.slew.pitch;
    /* 分数越高越优先（4.4）：
         空中   威胁度 × 1/(转到所需时间 + 0.5)
         海面   0.6 × 1/(…)；同舰有专职对空炮时两用主炮 ×1.5（主炮更倾向打船）
       距离只做小幅修正（近的略优先） */
    var base = 1 / (turn + 0.5) * (1.2 - 0.4 * d / R);
    if (isAir(e)) return threatOf(host, e) * base;
    return 0.6 * base * (tu.m.role === 'dual' && host.hasAA ? 1.5 : 1);
  }

  function pick(tu, host, B, P0, world) {
    var best = null, bs = 0, i, e, s;
    var ord = ordersFor(tu, host, world);
    var lists = [tu.gun.air !== false && !(ord && ord.mode === 'only') ? world.actors : null,
      surfaceOK(tu) && world.surfaceFire !== false ? world.targets : null];
    /* 6 km 内有威胁度 1.0 的飞机时，地表候选不参与（先自卫） */
    var hot = false;
    if (lists[0] && tu.m.role === 'dual') {
      for (i = 0; i < world.actors.length && !hot; i++) {
        e = world.actors[i];
        if (canEngage(tu, host, e, world) && threatOf(host, e) >= 1 && score(tu, host, B, P0, e) > 0) hot = true;
      }
    }
    for (var L = 0; L < 2; L++) {
      var list = lists[L];
      if (!list) continue;
      if (L === 1 && hot && !(ord && ord.mode === 'only')) continue;
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!canEngage(tu, host, e, world)) continue;
        if (ord && ord.mode === 'only' && e !== ord.target) continue;
        s = score(tu, host, B, P0, e);
        if (s <= 0) continue;
        if (ord && e === ord.target) s *= ord.weight || 2.5;
        if (e === tu.target) s *= 1.25;                  // 滞回：手上的目标还有效就别换
        if (s > bs) { bs = s; best = e; }
      }
    }
    /* 模式（对空 / 对海）切换至少隔 3 s：切换后要重新转动和解算，开火自然有延迟 */
    if (best && tu.target && isAir(best) !== isAir(tu.target) && canEngage(tu, host, tu.target, world) &&
        world.time - (tu.modeT || -1e9) < 3) return tu.target;
    return best;
  }

  /* 每轴：角加速度受限的速度控制器。ff = 瞄准点自己在转的角速度（前馈）——
     只按角差追的话，跟一个横穿的目标会永远落后"角速度 / 增益"那么一截，炮管始终对不上 */
  function slewAxis(cur, w, want, vmax, acc, dt, ff) {
    var err = want - cur;
    var wd = M3.clamp(err * 6 + (ff || 0), -vmax, vmax);
    w += M3.clamp(wd - w, -acc * dt, acc * dt);
    var st = w * dt;
    if (!ff && Math.abs(st) > Math.abs(err) && err * st >= 0) { st = err; w = 0; }
    return { a: cur + st, w: w };
  }

  function step(tu, host, world, dt) {
    if (!host.alive) return;
    var B = hostBasis(host);
    var P0 = pivotPos(tu, host, B);
    var g = tu.gun, i;
    tu.firing = false;
    if (tu.cd > 0) tu.cd -= dt;

    /* 受控发射器不自己索敌：目标只来自 cue，过期（6 s 内没转到位）就作废 */
    if (g.cued) {
      var cu = tu.cue;
      if (cu && (!cu.t.alive || world.time > cu.until)) cu = tu.cue = null;
      tu.target = cu ? cu.t : null;
      tu.scanT = 1e9;
    }

    /* 1. 索敌：每 react 秒一次（带抖动错开）；射程 + 1.5 km 内没有敌人就整门休眠 */
    tu.scanT -= dt;
    if (tu.scanT <= 0) {
      tu.scanT = tu.aim.react * (0.8 + 0.4 * Math.random());
      if (isLauncher(tu) && g.ammo && tu.ammo <= 0) { tu.target = null; tu.scanT = 1e9; }
      var wake = false, Rw = rangeOf(tu) + WAKE_MARGIN, R2 = Rw * Rw;
      var acts = world.actors;
      for (i = 0; i < acts.length && !wake; i++) {
        if (acts[i].alive && acts[i].team !== host.team && M3.dist2(acts[i].pos, P0) < R2) wake = true;
      }
      if (!wake && tu.m.role === 'ciws') {
        for (i = 0; i < world.missiles.length && !wake; i++) {
          var wm = world.missiles[i];
          if (wm.alive && wm.team !== host.team && M3.dist2(wm.pos, P0) < (CIWS_CUE + 500) * (CIWS_CUE + 500)) wake = true;
        }
      }
      if (!wake && surfaceOK(tu)) {
        for (i = 0; i < world.targets.length && !wake; i++) {
          var tt = world.targets[i];
          if (tt.alive && tt.big && tt.team !== host.team && tt.team !== 2 && M3.dist2(tt.pos, P0) < R2) wake = true;
        }
      }
      /* 命令下达 / 改变：各炮塔错开 0.5–1.5 s 才反应，不会整齐地同一帧转向 */
      var ord = ordersFor(tu, host, world), ok = ord ? ord.target : null;
      if (ok !== tu.ordSeen) { tu.ordSeen = ok; tu.ordWait = 0.5 + Math.random(); }
      var nt = wake && !(tu.ordWait > 0) ? pick(tu, host, B, P0, world) : tu.target;
      /* 近防炮：来袭导弹永远优先，命令也管不到它（4.7） */
      if (tu.m.role === 'ciws') {
        var mt = pickMissile(tu, host, B, P0, world);
        if (mt) nt = mt;
        /* 受压制：火控确认目标要更久 */
        tu.scanT *= 1 + (host.suppressed || 0);
      }
      if (nt !== tu.target) {
        if (nt && tu.target && isAir(nt) !== isAir(tu.target)) tu.modeT = world.time;
        if (nt && !isAir(nt) && nt !== tu.target) tu.salvo = 0;     // 换船：重新从试射开始
        tu.target = nt; tu.vEst = nt && nt.vel ? M3.clone(nt.vel) : null; tu.aEst = null;
      }
    }
    if (tu.ordWait > 0) tu.ordWait -= dt;
    var t = tu.target;
    if (t && !canEngage(tu, host, t, world)) t = tu.target = null;

    var wantYaw = tu.m.yaw0 || 0, wantPitch = 0, sol = null;
    if (t) {
      /* 2. 提前量：滤波速度 + OU 噪声 */
      var tv = t.vel || M3.V(0, 0, 0);
      if (!tu.vEst) tu.vEst = M3.clone(tv);
      var v0 = tu.vEst;
      tu.vEst = M3.add(tu.vEst, M3.mul(M3.sub(tv, tu.vEst), Math.min(1, dt / tu.aim.lag)));
      /* 加速度估计：滤波速度的变化率再滤一次（时间常数同 lag）。转弯 / 加速时补一部分，乱机动时它永远是错的 */
      var araw = M3.mul(M3.sub(tu.vEst, v0), 1 / Math.max(1e-4, dt));
      if (!tu.aEst) tu.aEst = M3.V(0, 0, 0);
      tu.aEst = M3.add(tu.aEst, M3.mul(M3.sub(araw, tu.aEst), Math.min(1, dt / tu.aim.lag)));
      var sig = tu.aim.err, kk = Math.sqrt(2 * dt / OU_TAU);
      tu.nY += -tu.nY / OU_TAU * dt + sig * kk * gauss();
      tu.nP += -tu.nP / OU_TAU * dt + sig * kk * gauss();
      sol = solve(tu, host, P0, t);
      if (sol) {
        var a = anglesOf(B, M3.norm(M3.sub(sol.p, P0)));
        wantYaw = a.yaw + tu.nY; wantPitch = a.pitch + tu.nP;
      }
    }

    /* 固定发射器：不转动、不对准。目标在扇区内（score 已经查过 arc）、冷却好了就沿固定方向出管，
       之后的转向交给导弹自己（助推段 + 转平，见 stepMissile 的 launchT） */
    if (tu.m.fixed) {
      if (!g.cued && t && sol && tu.cd <= 0) launch(tu, host, world, P0, dirOf(B, tu.yaw, tu.pitch), t);
      return;
    }

    /* 3. 转动：在"相对零位"的角度里转 —— 射界从不跨过零位背面，所以不会绕远路；越界夹在射界边上 */
    var c = clampArc(tu, wantYaw, wantPitch);
    var y0 = tu.m.yaw0 || 0;
    var ffY = 0, ffP = 0;
    if (t && tu.prevWant && dt > 0) {
      ffY = wrapPi(c.yaw - tu.prevWant.yaw) / dt;
      ffP = (c.pitch - tu.prevWant.pitch) / dt;
    }
    tu.prevWant = t ? { yaw: c.yaw, pitch: c.pitch } : null;
    var sy = slewAxis(wrapPi(tu.yaw - y0), tu.wYaw, wrapPi(c.yaw - y0), tu.slew.yaw, tu.slew.accel, dt, ffY);
    var sp = slewAxis(tu.pitch, tu.wPitch, c.pitch, tu.slew.pitch, tu.slew.accel, dt, ffP);
    var cl = clampArc(tu, y0 + sy.a, sp.a);
    tu.yaw = cl.yaw; tu.pitch = cl.pitch; tu.wYaw = sy.w; tu.wPitch = sp.w;

    /* 4. 开火：炮管指向与解算方向夹角 < fireTol，目标在射界内、冷却好了。转动途中照样能开火 */
    if (!t || !sol || !inArc(tu, wantYaw, wantPitch)) return;
    if (isAir(t) && t.kind !== 'missile' && g.airRange && M3.dist(t.pos, P0) > airReachTo(tu, P0, t)) return;
    var dAim = M3.norm(M3.sub(sol.p, P0));
    var dGun = dirOf(B, tu.yaw, tu.pitch);
    var tol = Math.max(0.006, tu.aim.err * 2.5);
    if (M3.dot(dAim, dGun) < Math.cos(tol)) return;
    if (t.kind === 'missile' && M3.dist(t.pos, P0) > CIWS_R) return;     // 提前跟踪中，还没进开火距离
    /* 对准了来袭导弹、在打：有效射击计时累加，每满 ROLL_DT 掷一次骰（4.7）。
       没对准 / 出射界时上面已经 return，计时暂停、不清零 */
    if (t.kind === 'missile') {
      tu.fireT = (tu.fireT || 0) + dt;
      while (tu.fireT >= ROLL_DT && t.alive && !t.ciwsKill) {
        tu.fireT -= ROLL_DT;
        if (Math.random() < interceptP(host, t)) {
          t.ciwsKill = M3.rnd(0.1, 0.3);         // 0.1–0.3 s 后空爆（stepMissile）
          t.ciwsHost = host;
        }
      }
    }
    if (tu.cd > 0) return;
    if (isLauncher(tu)) { launch(tu, host, world, P0, dGun, t); return; }
    var rps = g.rpm / 60, n = 0;
    // 对空 / 对海面两套散布：大口径对空散得很开，打舰船另算（spreadSurface，缺省同 spread）
    var spr = (!isAir(t) && g.spreadSurface !== undefined) ? g.spreadSurface : g.spread;
    /* 对海面"试射—修正"：首轮散布 ×1.5，之后每轮收敛，第 4 轮起回到正常值 */
    if (!isAir(t)) { spr *= 1 + 0.5 * Math.max(0, 1 - (tu.salvo || 0) / 3); tu.salvo = (tu.salvo || 0) + 1; }
    var mz = tu.barrel ? M3.add(P0, M3.mul(dGun, tu.barrel)) : P0;
    /* 带近炸的炮弹打飞机用"定时引信"：在预计到达目标的那一刻空爆；打舰船不定时，撞上才炸 */
    var life = (g.fuze && isAir(t)) ? sol.tof : 0;
    while (tu.cd <= 0 && n < 8) {
      tu.cd += 1 / rps;
      n++;
      var dir = M3.norm(M3.add(dGun, M3.add(M3.mul(B.r, gauss() * spr), M3.mul(B.u, gauss() * spr))));
      var lf = life ? Math.max(0.05, life * (1 + gauss() * (tu.aim.fuzeErr || 0))) : 0;
      var b = Ent.fireGunFrom(host, g, mz, dir, world, lf ? { life: lf } : null);
      b.turret = tu;
    }
    if (n) muzzleFlash(world, mz, dGun, host, g.cal || 20);
    tu.firing = true;
  }

  /* 炮口焰（≥ 40 mm）：一团白黄闪光 + 沿炮管往前喷的火舌 + 一小团烟。
     minPx 让它在目视距离内（几公里）都至少有几个像素 —— 看得见船就该看得见它开火 */
  function muzzleFlash(world, mz, d, host, cal) {
    var L = world.particles;
    if (!L) return;
    var hv = host.vel || M3.V(0, 0, 0);
    /* 小口径（近防、遥控炮、尾炮）：每一帧开火只出一小团，位置、大小、亮度都随机抖一点 ——
       连射时是一团闪动的火光，而不是一颗定住的光点 */
    if (cal < 40) {
      var side = M3.norm(M3.cross(d, M3.V(0, 1, 0)));
      var j = M3.add(M3.mul(d, M3.rnd(0.2, 1.2)), M3.add(M3.mul(side, M3.rnd(-0.25, 0.25)), M3.V(0, M3.rnd(-0.25, 0.25), 0)));
      Ent.spawnParticle(L, M3.add(mz, j), hv, M3.rnd(0.03, 0.06), M3.rnd(0.35, 0.8),
        Math.random() < 0.5 ? '#fff0c0' : '#ffc070', { minPx: M3.rnd(1.0, 2.2) });
      return;
    }
    var k = Math.sqrt(cal / 75);
    var at = M3.add(mz, M3.mul(d, 1.5 * k));
    Ent.spawnParticle(L, at, hv, 0.09, 2.6 * k, '#fff6d8', { grow: true, minPx: 3.5 });
    for (var i = 0; i < 4; i++) {
      Ent.spawnParticle(L, M3.add(mz, M3.mul(d, (1 + i) * 1.2 * k)), M3.add(hv, M3.mul(d, M3.rnd(20, 50))),
        M3.rnd(0.06, 0.12), (1.6 - i * 0.25) * k, '#ffb050', { grow: true, drag: 6, minPx: 2 });
    }
    Ent.spawnParticle(L, at, M3.add(hv, M3.mul(d, 8)), M3.rnd(1.2, 1.8), 2.2 * k, '#6a6660',
      { grow: true, drag: 1.5, grav: -0.3, alpha: 0.45, minPx: 1.5 });
  }

  /* 发射架出一发：从发射口沿发射架方向出膛，目标交给导弹自己 */
  /* 齐射间隔：一波打完之后等这么久（±20%）再打下一波 —— 打一波、看效果、留着备弹 */
  var SALVO_GAP = 40;

  function launch(tu, host, world, P0, dGun, t) {
    var g = tu.gun;
    if (g.ammo && tu.ammo <= 0) return;
    // 一口一弹的发射器（垂发 / 斜置架）按整舰齐射节奏；旋转架按自己的装填（g.reload）
    if (g.salvo && host.salvoN && world.time < (host.salvoUntil || 0)) return;
    var mz = tu.barrel ? M3.add(P0, M3.mul(dGun, tu.barrel)) : P0;
    var hs = host.vel ? M3.len(host.vel) : 0;
    var wid = (tu.cue && tu.cue.w) || g.weapon;
    var W = WEAPONS[wid];
    /* 助推段：武器自己的 boostT；垂发出管至少竖直飞 0.6 s 再转（舰空弹没有 boostT） */
    var lt = (W && W.boostT) || 0;
    if (tu.m.fixed === 'vls') lt = Math.max(lt, 0.6);
    var m = Ent.makeMissile({
      weapon: wid, team: host.team, pos: mz, fwd: dGun,
      speed: Math.max(hs, g.launchSpeed || 140), target: t, owner: host,
      launchT: lt
    });
    tu.cue = null;
    world.missiles.push(m);
    /* 带弹库的旋转架单独装填：g.reload = [最短, 最长] 秒，每发一次随机取一个（10–30 s） */
    tu.cd = g.reload ? M3.rnd(g.reload[0], g.reload[1]) : (g.cd || 4);
    if (g.ammo) tu.ammo--;
    tu.fired++;
    tu.firing = true;
    if (g.salvo && host.salvoN && ++host.salvoShots >= host.salvoN) {
      host.salvoShots = 0;
      host.salvoUntil = world.time + (host.salvoGap || SALVO_GAP) * M3.rnd(0.8, 1.2);
    }
  }

  /* 受控发射（舰空弹，game.js 的 updateTargets 调）：把一发 wid 交给本舰的受控发射器。
     射界里有旋转发射架就交给它（转到位再打），否则用垂发单元当场出管。
     本舰没有受控发射器返回 false —— 调用方沿用旧的"从舰体中心朝目标上方"出膛。 */
  function cue(host, tgt, wid, world) {
    var T = host.turrets;
    if (!T || !host.alive) return false;
    var B = hostBasis(host), rot = null, vls = null;
    for (var i = 0; i < T.length; i++) {
      var tu = T[i];
      if (!tu.gun.cued) continue;
      if (tu.m.fixed) { if (!vls) vls = tu; continue; }
      if (tu.cue) continue;                                   // 手上已经有一发在等转到位
      var a = anglesOf(B, M3.norm(M3.sub(tgt.pos, pivotPos(tu, host, B))));
      if (inArc(tu, a.yaw, a.pitch) && !rot) rot = tu;
    }
    if (rot) { rot.cue = { t: tgt, w: wid, until: world.time + 6 }; return true; }
    if (vls) {
      vls.cue = { t: tgt, w: wid, until: world.time };
      var P0 = pivotPos(vls, host, B);
      launch(vls, host, world, P0, dirOf(B, vls.yaw, vls.pitch), tgt);
      return true;
    }
    return false;
  }

  function stepAll(host, world, dt) {
    var T = host.turrets;
    if (!T) return;
    for (var i = 0; i < T.length; i++) step(T[i], host, world, dt);
  }

  /* 渲染：有实体模型的炮塔各推两件（底座随方位转，炮身随方位 + 俯仰） */
  function push(host, pushModel) {
    var T = host.turrets;
    if (!T || !host.alive) return;
    var B = hostBasis(host);
    for (var i = 0; i < T.length; i++) {
      var tu = T[i], mdl = tu.m.model;
      if (!mdl || !MODELS[mdl + '_base']) continue;
      var base = toWorld(host, B, tu.m.pos);
      pushModel(MODELS[mdl + '_base'], base, dirOf(B, tu.yaw, 0), B.u, {});
      pushModel(MODELS[mdl + '_gun'], M3.add(base, M3.mul(B.u, tu.pivot)),
        dirOf(B, tu.yaw, tu.pitch), dirOf(B, tu.yaw, tu.pitch + Math.PI / 2), {});
    }
  }

  return {
    make: make, attach: attach, step: step, cue: cue, threatOf: threatOf, solveSurface: solveSurface, stepAll: stepAll, push: push,
    muzzlePos: function (tu, host) { return muzzlePos(tu, host, hostBasis(host)); },
    pivotPos: function (tu, host) { return pivotPos(tu, host, hostBasis(host)); },
    dirOf: function (host, yaw, pitch) { return dirOf(hostBasis(host), yaw, pitch); },
    inArc: inArc, clampArc: clampArc, wrapPi: wrapPi
  };
})();
