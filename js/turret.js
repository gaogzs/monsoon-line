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
   就出一发 Ent.makeMissile，按 cd 冷却、按 ammo 计数（0 = 不限）。目前没有舰船装它，留着备用。

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
        yaw: m.yaw0 || 0, pitch: 0, wYaw: 0, wPitch: 0,
        target: null, scanT: Math.random() * 0.6, cd: 0,
        vEst: null, nY: 0, nP: 0, firing: false,
        ammo: gun.kind === 'launcher' ? (gun.ammo || 0) : 0, fired: 0
      });
    }
    return out.length ? out : null;
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
  /* 这门炮能打什么：air（缺省 true）管飞机，surface 管舰船 / 大型设施（目前炮里只有 50 mm） */
  function canEngage(tu, host, e) {
    if (!e || !e.alive || e === host || e.team === host.team) return false;
    if (e.team === 2) return false;                       // 中立（调节单元之类）
    if (isAir(e)) return tu.gun.air !== false && !e.escaped;
    return !!tu.gun.surface && !!e.big;
  }
  function isLauncher(tu) { return tu.gun.kind === 'launcher'; }
  function rangeOf(tu) {
    var g = tu.gun;
    if (g.range) return g.range;
    var w = isLauncher(tu) ? WEAPONS[g.weapon] : null;
    return w ? (w.lockDist || 8000) : 2000;
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
    var acc = tu.aEst || M3.V(0, 0, 0), AK = 0.15;    // 加速度只信一点点（也是滤过的，本来就迟钝）
    var aim = t.pos, tof = 0;
    for (var k = 0; k < 2; k++) {
      tof = M3.dist(aim, P0) / v;
      aim = M3.add(t.pos, M3.add(M3.mul(rel, tof), M3.mul(acc, 0.5 * AK * tof * tof)));
    }
    var drop = 0.5 * 9.81 * (g.gravity === undefined ? 1 : g.gravity) * tof * tof;
    return { p: M3.add(aim, M3.V(0, drop, 0)), tof: tof };
  }

  function score(tu, host, B, P0, e) {
    var d = M3.dist(e.pos, P0), R = rangeOf(tu);
    // airRange：对飞机只在这个距离内开火（近防炮 800 m —— 再远打出去的弹只会被躲开）
    if (isAir(e) && tu.gun.airRange) R = Math.min(R, tu.gun.airRange);
    if (d > R) return -1;
    var a = anglesOf(B, M3.norm(M3.sub(e.pos, P0)));
    if (!inArc(tu, a.yaw, a.pitch)) return -1;
    var turn = Math.abs(wrapPi(a.yaw - tu.yaw)) / tu.slew.yaw + Math.abs(a.pitch - tu.pitch) / tu.slew.pitch;
    // 对空优先：两用炮手边同时有飞机和船时先打飞机
    return turn + d / R * 2 + (isAir(e) ? 0 : 3);
  }

  function pick(tu, host, B, P0, world) {
    var best = null, bs = 1e9, i, e, s;
    var lists = [tu.gun.air !== false ? world.actors : null, tu.gun.surface ? world.targets : null];
    for (var L = 0; L < 2; L++) {
      var list = lists[L];
      if (!list) continue;
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!canEngage(tu, host, e)) continue;
        s = score(tu, host, B, P0, e);
        if (s < 0) continue;
        if (e === tu.target) s -= 0.6;                   // 滞回：手上的目标还有效就别换
        if (s < bs) { bs = s; best = e; }
      }
    }
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
      if (!wake && g.surface) {
        for (i = 0; i < world.targets.length && !wake; i++) {
          var tt = world.targets[i];
          if (tt.alive && tt.big && tt.team !== host.team && tt.team !== 2 && M3.dist2(tt.pos, P0) < R2) wake = true;
        }
      }
      var nt = wake ? pick(tu, host, B, P0, world) : null;
      if (nt !== tu.target) { tu.target = nt; tu.vEst = nt && nt.vel ? M3.clone(nt.vel) : null; tu.aEst = null; }
    }
    var t = tu.target;
    if (t && !canEngage(tu, host, t)) t = tu.target = null;

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
      var a = anglesOf(B, M3.norm(M3.sub(sol.p, P0)));
      wantYaw = a.yaw + tu.nY; wantPitch = a.pitch + tu.nP;
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
    if (isAir(t) && g.airRange && M3.dist(t.pos, P0) > g.airRange) return;
    var dAim = M3.norm(M3.sub(sol.p, P0));
    var dGun = dirOf(B, tu.yaw, tu.pitch);
    var tol = Math.max(0.006, tu.aim.err * 2.5);
    if (M3.dot(dAim, dGun) < Math.cos(tol)) return;
    if (tu.cd > 0) return;
    if (isLauncher(tu)) { launch(tu, host, world, P0, dGun, t); return; }
    var rps = g.rpm / 60, n = 0;
    // 对空 / 对海面两套散布：大口径对空散得很开，打舰船另算（spreadSurface，缺省同 spread）
    var spr = (!isAir(t) && g.spreadSurface !== undefined) ? g.spreadSurface : g.spread;
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
    tu.firing = true;
  }

  /* 发射架出一发：从发射口沿发射架方向出膛，目标交给导弹自己 */
  function launch(tu, host, world, P0, dGun, t) {
    var g = tu.gun;
    if (g.ammo && tu.ammo <= 0) return;
    var mz = tu.barrel ? M3.add(P0, M3.mul(dGun, tu.barrel)) : P0;
    var hs = host.vel ? M3.len(host.vel) : 0;
    var m = Ent.makeMissile({
      weapon: g.weapon, team: host.team, pos: mz, fwd: dGun,
      speed: Math.max(hs, g.launchSpeed || 140), target: t, owner: host
    });
    world.missiles.push(m);
    tu.cd = g.cd || 4;
    if (g.ammo) tu.ammo--;
    tu.fired++;
    tu.firing = true;
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
    make: make, step: step, stepAll: stepAll, push: push,
    muzzlePos: function (tu, host) { return muzzlePos(tu, host, hostBasis(host)); },
    pivotPos: function (tu, host) { return pivotPos(tu, host, hostBasis(host)); },
    dirOf: function (host, yaw, pitch) { return dirOf(hostBasis(host), yaw, pitch); },
    inArc: inArc, clampArc: clampArc, wrapPi: wrapPi
  };
})();
