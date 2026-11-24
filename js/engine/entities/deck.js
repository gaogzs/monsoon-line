(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.stepDeck = stepDeck; $.deckSlot = deckSlot; $.deckPose = deckPose; $.putOnDeck = putOnDeck;

  /* ============================================================
     甲板起飞（批次 6.1b）：任何飞机都可以从带跑道的宿主（舰船 / 平台）上放飞

     引擎里的飞机一出生就在空中（运动学飞行，没有地面状态）。这里补一个独立分支：
     stepAircraft 开头判 a.deck 非空就整个交给 stepDeck，不碰主路径的姿态 / 速度段
     （不放飞的场景逐帧不变）。

     过程（弹射式，没有滑行阶段）：
       ① 飞机完整地出现在跑道起点（起点 = 跑道的起飞端往后退 len 米），速度 0，机头沿跑道
       ② 沿跑道匀加速：加速度按"到起飞端时对空速度 = LIFT_K × 失速速度"算出，
          所以任何机型都能起得来（大飞机加速度小、小飞机大）
       ③ 机体位置每帧按宿主当前位姿重算 —— 宿主在开、在转，甲板上的飞机跟着走
       ④ 最后 ROT_FROM 之后逐渐抬头；到跑道末端交还给主路径，AI 接手
     宿主中途被打掉：当场放开，按离舰速度飞出去。

     跑道数据：SHIPS / PLATFORMS 的 runways = [{ x, y, z, yaw, len? }]，(x, y, z) 是**起飞端**
     （与 resupply.js 的 reset:'runway' 同一份数据），len 缺省 DECK_K.LEN。
     同一条跑道同一时刻只放一架：deckSlot 找空闲的那条，没有就返回 -1，调用者下一帧再试。
     ============================================================ */
  var DECK_K = {
    LEN: 80,          // 跑道长度缺省值（m）
    GEAR_H: 1.5,      // 机体原点离甲板（m）：没有起落架，取半个机身高
    LIFT_K: 1.4,      // 离舰对空速度 = LIFT_K × 失速速度（与 resupply.js 的 LAUNCH_K 一致）
    MIN_REL: 25,      // 相对甲板的末速下限（宿主很快时也要有一次看得见的加速）
    PITCH: 0.07,      // 离舰时的抬头角（rad，与 resupply.js 的 RUNWAY_PITCH 一致）
    ROT_FROM: 0.85,   // 跑道走完这个比例之后开始抬头
    SPACING: 1.5      // 一架离舰之后，这条跑道隔多久才放下一架（s）
  };
  $.DECK = DECK_K;

  function runwaysOf(host) {
    var u = host && (host.ship || host.platform);
    return (u && u.runways) || null;
  }

  /* 宿主的水平基：f = 舰首、r = 右舷（cross(up, f)，与 resupply.js 一致） */
  function basis(host) {
    var fl = Math.sqrt(host.fwd.x * host.fwd.x + host.fwd.z * host.fwd.z) || 1;
    var fx = host.fwd.x / fl, fz = host.fwd.z / fl;
    return { fx: fx, fz: fz, rx: fz, rz: -fx };
  }
  function toWorld(host, B, x, y, z) {
    return M3.V(host.pos.x + B.rx * x + B.fx * z, (host.pos.y || 0) + y, host.pos.z + B.rz * x + B.fz * z);
  }
  /* 跑道方向（宿主局部 → 世界水平单位向量） */
  function dirWorld(B, rw) {
    var dx = Math.sin(rw.yaw || 0), dz = Math.cos(rw.yaw || 0);
    return M3.V(B.rx * dx + B.fx * dz, 0, B.rz * dx + B.fz * dz);
  }

  /* 第 ri 条跑道的起点：{ pos, fwd }（世界系），给调用者把飞机生成在这里 */
  function deckPose(host, ri) {
    var rws = runwaysOf(host), rw = rws && rws[ri];
    if (!rw) return null;
    var B = basis(host), len = rw.len || DECK_K.LEN;
    var x0 = rw.x - Math.sin(rw.yaw || 0) * len, z0 = rw.z - Math.cos(rw.yaw || 0) * len;
    return { pos: toWorld(host, B, x0, rw.y + DECK_K.GEAR_H, z0), fwd: dirWorld(B, rw) };
  }

  /* 找一条空闲的跑道：want 给了就只看那一条。-1 = 没有（宿主没了 / 没跑道 / 都占着 / 刚有飞机离开）。 */
  function deckSlot(host, want, now) {
    var rws = runwaysOf(host);
    if (!rws || !host.alive) return -1;
    now = now || 0;
    for (var i = 0; i < rws.length; i++) {
      if (want !== undefined && want !== null && want !== i) continue;
      var use = host.deckUse && host.deckUse[i];
      if (use && use.alive && use.deck) continue;
      if (host.deckFreeAt && host.deckFreeAt[i] > now) continue;
      return i;
    }
    return -1;
  }

  /* 把一架已经造好的飞机放到第 ri 条跑道的起点，进入甲板状态（位置由 stepDeck 逐帧写） */
  function putOnDeck(a, host, ri) {
    var rws = runwaysOf(host), rw = rws[ri];
    var B = basis(host), len = rw.len || DECK_K.LEN;
    var dirW = dirWorld(B, rw), hv = host.vel || M3.V(0, 0, 0);
    var vLift = Ent.vStallAt(a) * DECK_K.LIFT_K;
    var vRel = Math.max(DECK_K.MIN_REL, vLift - M3.dot(hv, dirW));
    a.deck = {
      host: host, ri: ri, len: len, s: 0, v: 0, acc: vRel * vRel / (2 * len),
      x0: rw.x - Math.sin(rw.yaw || 0) * len, z0: rw.z - Math.cos(rw.yaw || 0) * len,
      dx: Math.sin(rw.yaw || 0), dz: Math.cos(rw.yaw || 0), y: rw.y + DECK_K.GEAR_H
    };
    a.throttle = 1; a.ab = $.hasAfterburner(a);       // 没有加力的机型弹射起飞也只推军推
    (host.deckUse || (host.deckUse = []))[ri] = a;
    stepDeck(a, 0, null);        // 立刻摆好位置与姿态：生成的这一帧就在起点上
    return a;
  }

  function leave(a, world, pitch) {
    var d = a.deck, host = d.host;
    var vel = a.vel ? M3.clone(a.vel) : M3.mul(a.fwd, a.speed || 0);
    var sp = M3.len(vel) || 1;
    var fwd = M3.norm(M3.add(M3.mul(vel, 1 / sp), M3.V(0, Math.sin(pitch), 0)));
    a.deck = null;
    a.fwd = fwd; a.up = M3.norm(M3.cross(M3.cross(fwd, M3.V(0, 1, 0)), fwd));
    a.right = M3.cross(a.fwd, a.up);
    a.speed = sp; a.vel = M3.mul(fwd, sp);
    (host.deckFreeAt || (host.deckFreeAt = []))[d.ri] = ((world && world.time) || 0) + DECK_K.SPACING;
  }

  function stepDeck(a, dt, world) {
    var d = a.deck, host = d.host;
    if (!host || !host.alive) { leave(a, world, 0); return; }          // 宿主没了：按当前速度飞出去
    var B = basis(host), rw = runwaysOf(host)[d.ri];
    d.s += d.v * dt + 0.5 * d.acc * dt * dt;
    d.v += d.acc * dt;
    var done = d.s >= d.len;
    var s = Math.min(d.s, d.len);
    a.pos = toWorld(host, B, d.x0 + d.dx * s, d.y, d.z0 + d.dz * s);
    var dirW = dirWorld(B, rw), hv = host.vel || M3.V(0, 0, 0);
    var vel = M3.add(hv, M3.mul(dirW, d.v));
    var p = s / d.len > DECK_K.ROT_FROM ? DECK_K.PITCH * (s / d.len - DECK_K.ROT_FROM) / (1 - DECK_K.ROT_FROM) : 0;
    a.fwd = M3.norm(M3.add(M3.mul(dirW, Math.cos(p)), M3.V(0, Math.sin(p), 0)));
    a.up = M3.norm(M3.add(M3.V(0, Math.cos(p), 0), M3.mul(dirW, -Math.sin(p))));
    a.right = M3.cross(a.fwd, a.up);
    a.vel = vel; a.speed = M3.len(vel);
    if (done) leave(a, world, DECK_K.PITCH);
  }
})(Ent);
