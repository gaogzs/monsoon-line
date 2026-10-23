(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.spawnParticle = spawnParticle; $.wakeSpray = wakeSpray; $.stepParticles = stepParticles; $.randUnit = randUnit; $.explode = explode;

  /* ============================================================
     粒子
     ============================================================ */
  function spawnParticle(list, pos, vel, life, size, color, opt) {
    opt = opt || {};
    list.push({
      pos: M3.clone(pos),
      vel: M3.clone(vel),
      life: life, life0: life,
      size: size, color: color, alive: true,
      /* minPx：屏幕上至少这么多像素（半径）。炮口焰、空爆闪光要在几公里外也看得见，
         game.js 每帧按到相机的距离把 size 撑到这个下限（size0 是原值） */
      size0: size, minPx: opt.minPx || 0,
      grow: !!opt.grow, alpha: opt.alpha === undefined ? 1 : opt.alpha,
      drag: opt.drag || 0, grav: opt.grav || 0,
      /* streak：按速度拉成短线（破片）；delay：先隐身这么多秒再开始（子母弹错开起爆） */
      streak: !!opt.streak, delay: opt.delay || 0
    });
  }

  /* ============================================================
     舰尾螺旋桨水花（2-0IMPL 4.8）—— 纯演出

     每根轴每秒发 WAKE_RATE × (航速 / 最大航速) 个白色水花粒子，
     出生在螺旋桨后方 2–4 m 的水面上，往上溅一点再被重力拉回去，
     随寿命放大、淡出 —— 连起来是一条从舰尾往后拖开的翻腾白带。
     螺旋桨位置：SHIPS[].props（模型局部坐标 { x, z }），没写的按 dim 推导：
       舰尾 −len/2 × 0.92；船长 60 m 以上双轴（左右 beam × 0.18），以下单轴。
     转弯时外侧那根轴 ×1.3；航速 < 2 m/s 不发；离玩家 3 km 外减半、6 km 外不画；
     全场粒子太多（> WAKE_CAP）时停发，给爆炸特效让路。
     ============================================================ */
  var WAKE_RATE = 30, WAKE_CAP = 500, KNOT = 0.5144;

  function shipProps(s) {
    if (s.props) return s.props;
    var len = s.dim ? s.dim[0] : 100, beam = s.dim ? s.dim[1] : 12;
    var z = -len / 2 * 0.92;
    s.props = len >= 60 ? [{ x: -beam * 0.18, z: z }, { x: beam * 0.18, z: z }] : [{ x: 0, z: z }];
    return s.props;
  }

  function wakeSpray(t, world, dt) {
    var s = t.ship;
    if (!s || !t.alive || !t.vel || !world.particles) return;
    var spd = Math.sqrt(t.vel.x * t.vel.x + t.vel.z * t.vel.z);
    if (spd < 2 || world.particles.length > WAKE_CAP) return;
    var lod = 1, pl = world.player;
    if (pl) {
      var dp = M3.dist(pl.pos, t.pos);
      if (dp > 6000) return;
      if (dp > 3000) lod = 0.5;
    }
    var f = t.fwd || M3.norm(t.vel);
    var fh = M3.norm(M3.V(f.x, 0, f.z));
    var r = M3.V(fh.z, 0, -fh.x);                         // 右舷（与炮塔的 hostBasis 同一手性）
    // 转弯方向：船头往右舷偏 → 左舷那根是外侧
    var turn = 0;
    if (t.wakePrevF) turn = M3.dot(M3.sub(fh, t.wakePrevF), r) / Math.max(1e-4, dt);
    t.wakePrevF = fh;
    var k = M3.clamp(spd / Math.max(1, (s.speed || 30) * KNOT), 0, 1);
    var P = shipProps(s);
    for (var i = 0; i < P.length; i++) {
      var outer = (turn > 0.01 && P[i].x < 0) || (turn < -0.01 && P[i].x > 0);
      t.wakeAcc = t.wakeAcc || [];
      t.wakeAcc[i] = (t.wakeAcc[i] || 0) + WAKE_RATE * k * lod * (outer ? 1.3 : 1) * dt;
      while (t.wakeAcc[i] >= 1) {
        t.wakeAcc[i] -= 1;
        var back = P[i].z - M3.rnd(2, 4);
        var px = t.pos.x + r.x * P[i].x + fh.x * back, pz = t.pos.z + r.z * P[i].x + fh.z * back;
        var side = M3.rnd(-1.5, 1.5);
        spawnParticle(world.particles, M3.V(px + r.x * side * 0.4, 0.3, pz + r.z * side * 0.4),
          M3.V(r.x * side, M3.rnd(1, 3), r.z * side),
          M3.rnd(0.6, 1.2), M3.rnd(1.2, 2.0) * (0.6 + 0.4 * k), Math.random() < 0.7 ? '#e8f4f8' : '#cfe8ee',
          { grow: true, grav: 9.8, drag: 0.6, alpha: 0.55 });
      }
    }
  }

  function stepParticles(list, dt) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.pos = M3.add(p.pos, M3.mul(p.vel, dt));
      if (p.drag) { var k = Math.exp(-p.drag * dt); p.vel = M3.mul(p.vel, k); }
      if (p.grav) p.vel.y -= p.grav * dt;
    }
  }

  function randUnit() {
    var z = M3.rnd(-1, 1), t = M3.rnd(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
    return M3.V(r * Math.cos(t), z, r * Math.sin(t));
  }

  /** 爆炸：多色粒子 + 黑烟 */
  function explode(list, pos, scale, count) {
    scale = scale || 1;
    count = count || 16;
    var cols = ['#fff6d0', '#ffcf5c', '#ff8b2a', '#e2451c', '#8a2b12'];
    for (var i = 0; i < count; i++) {
      var dir = randUnit();
      var sp = M3.rnd(6, 58) * scale;
      spawnParticle(list, pos, M3.mul(dir, sp),
        M3.rnd(0.28, 0.95) * (0.7 + scale * 0.4),
        M3.rnd(1.6, 5.5) * scale,
        cols[M3.rndInt(0, cols.length - 1)],
        { grow: true, drag: 2.2, grav: 3 });
    }
    for (i = 0; i < Math.max(3, count >> 2); i++) {
      var d2 = randUnit();
      spawnParticle(list, pos, M3.mul(d2, M3.rnd(3, 22) * scale),
        M3.rnd(1.4, 3.4), M3.rnd(3, 9) * scale, '#3a3632',
        { grow: true, drag: 1.1, grav: -0.5 });
    }
  }
})(Ent);
