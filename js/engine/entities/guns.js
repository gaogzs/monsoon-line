(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.fireGunFrom = fireGunFrom; $.detonateShell = detonateShell; $.shellFuze = shellFuze; $.gunLead = gunLead; $.fireGun = fireGun; $.flashRings = flashRings; $.gunMuzzle = gunMuzzle; $.stepBullet = stepBullet;

  /* ============================================================
     机炮
     ============================================================ */

  /* 标准正态样本（Box–Muller）。
     一次算出两个，第二个存着下次用 —— 机炮每秒要抽两百多个数，
     不值得为它每发建一个数组。 */
  var gaussSpare = null;

  function gauss() {
    if (gaussSpare !== null) { var v = gaussSpare; gaussSpare = null; return v; }
    var u = Math.random();
    if (u < 1e-12) u = 1e-12;
    var r = Math.sqrt(-2 * Math.log(u));
    var ang = Math.PI * 2 * Math.random();
    gaussSpare = r * Math.sin(ang);
    return r * Math.cos(ang);
  }

  /* 生成一发炮弹 / 子弹 —— 机炮、炮塔都走这里（2-0IMPL 3.1）。
     shooter  开火的单位（飞机或舰船，取 team / vel / owner）
     w        炮的武器数据：speed / dmg / cal / range，可选
                gravity  重力倍率（缺省 1）
                fuze / blast / blastCore  近炸引信与爆炸半径 —— 写了才会近炸 / 起爆，
                                          没写（航空机炮）就只有直接命中
     muzzle   炮口世界坐标；dir 单位方向（已含散布）
     opt      { life }：缺省 range / speed
     炮弹的武器数据挂在 b.gw，不挂 b.w：b.w 会让 warheadK 把普通机炮也当成战斗部打折。
     起爆时 Combat.detonate 要读 shot.w，见 detonateShell。 */
  function fireGunFrom(shooter, w, muzzle, dir, world, opt) {
    var life = (opt && opt.life) || Ballistics.life(w);
    var base = shooter.vel || M3.V(0, 0, 0);
    var b = {
      kind: 'bullet', team: shooter.team, alive: true,
      pos: M3.clone(muzzle), prev: M3.clone(muzzle),
      vel: M3.add(M3.mul(dir, w.speed), base),
      dmg: w.dmg, cal: w.cal || 0, life: life, owner: shooter,
      gw: w, grav: w.gravity === undefined ? 1 : w.gravity, drag: w.drag || 0,
      fuze: w.fuze || 0, blast: w.blast || 0
    };
    world.bullets.push(b);
    return b;
  }

  /* 带战斗部的炮弹起爆：直接命中 / 近炸 / 寿命到点空爆 / 落地，都走 Combat.detonate */
  function detonateShell(b, world, pos, direct, opt) {
    b.w = b.gw;
    Combat.detonate(b, world, pos, direct || null, opt);
  }

  /* 近炸：本帧弹道线段离某架敌机的最近距离小于 fuze 就在最近点起爆。
     只查飞机（炮弹对空才用近炸；打舰船靠直接命中）。 */
  function shellFuze(b, world) {
    if (!b.alive || !(b.fuze > 0)) return false;
    var p0 = b.prev, d = M3.sub(b.pos, p0), dd = M3.dot(d, d);
    var acts = world.actors;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a.alive || a.team === b.team) continue;
      var R = a.hitR || Combat.HIT_R_AIR;
      var rel = M3.sub(a.pos, p0);
      var s = dd > 1e-9 ? M3.clamp(M3.dot(rel, d) / dd, 0, 1) : 0;
      var cp = M3.add(p0, M3.mul(d, s));
      if (M3.dist(cp, a.pos) - R < b.fuze) { detonateShell(b, world, cp, null); return true; }
    }
    return false;
  }

  /* 机炮提前量：用真实弹道（Ballistics.step，与 fireGunFrom 同一套：载机速度叠加、重力、
     阻力）反解"机头该指向哪"。HUD 预测点和 AI 都应该读这个，而不是 距离 / 初速 的直线估算
     （那会漏掉载机速度、重力下坠和阻力）。
     迭代：猜方向 → 模拟弹到目标的最近接近点 → 按脱靶量修正方向（几次就收敛）。
     返回 { dir, tof, miss }；tof = 弹到最近接近点的时间。 */
  function gunLead(gw, P, base, tPos, tVel, maxT) {
    var speed = gw.speed, grav = gw.gravity === undefined ? 1 : gw.gravity;
    var to = M3.sub(tPos, P), d0 = M3.len(to) || 1;
    var tof = d0 / speed, dir = M3.norm(to), miss = Infinity;
    var tMax = maxT || Math.min(8, d0 / speed * 2 + 0.5);
    for (var it = 0; it < 12; it++) {
      var b = { pos: M3.clone(P), vel: M3.add(M3.mul(dir, speed), base), grav: grav, drag: gw.drag || 0 };
      var dt = 1 / 60, best = Infinity, bestT = 0, bestMiss = null, prevRel = M3.sub(tPos, P);
      for (var t = 0; t < tMax; t += dt) {
        Ballistics.step(b, dt);
        var rel = M3.sub(M3.add(tPos, M3.mul(tVel, t + dt)), b.pos);
        /* 一帧里弹相对目标走 20 m 以上：只比采样点会有量化误差，按线段取最近点 */
        var seg = M3.sub(rel, prevRel), sl = M3.dot(seg, seg);
        var u = sl > 1e-9 ? M3.clamp(-M3.dot(prevRel, seg) / sl, 0, 1) : 0;
        var cm = M3.add(prevRel, M3.mul(seg, u)), dd = M3.len(cm);
        if (dd < best) { best = dd; bestT = t + dt * u; bestMiss = cm; }
        else if (dd > best + 50) break;           // 已经飞过最近点
        prevRel = rel;
      }
      miss = best; tof = bestT;
      if (best < 0.5 || !bestMiss) break;
      /* 脱靶量 → 方向修正：把"目标未来点 − 弹到点"折成角度，叠到瞄准点上 */
      var aimPt = M3.add(M3.add(P, M3.mul(dir, d0)), bestMiss);
      dir = M3.norm(M3.sub(aimPt, P));
    }
    return { dir: dir, tof: tof, miss: miss };
  }

  function fireGun(a, world) {
    if (!a.alive || a.gunAmmo <= 0) return;
    var w = WEAPONS[a.gun];
    var rps = w.rpm / 60;
    if (a.gunTimer > 0) return;          // 由射速节流
    a.gunTimer = 1 / rps;
    var n = Math.max(1, Math.round(rps * 0.033));
    if (n > a.gunAmmo) n = a.gunAmmo;
    a.gunAmmo -= n;
    if (a.isPlayer && world) world.gunRounds = (world.gunRounds || 0) + n;

    /* 子弹寿命由**射程**算出，而不是写死 2.2 秒。

       以前两者是脱节的：数据里写着 range 1600 / highRange 2600，
       但子弹固定飞 2.2 秒，实际射程完全由 speed × 2.2 决定（约 2400 米）。
       于是 CEL-3「18 公里以上有效射程翻倍」这条设定从未生效，
       连它的基础射程 1600 也是假的 —— 那两个字段只有一个用处：
       让 AI 判断该在多远开火。

       现在 life = 射程 / 初速，并且 18 公里以上改用 highRange：
       高空空气稀薄、弹道平直，同样的弹药确实能打得更远。 */
    var gunRange = (a.pos.y > 18000 && w.highRange) ? w.highRange : (w.range || 1600);
    var bulletLife = gunRange / Math.max(1, w.speed);

    for (var i = 0; i < n; i++) {
      /* ---- 炮口散布 ----

         垂直于炮口轴的两个方向**各取一个独立的高斯样本**，
         标准差就是 w.spread（弧度）。合起来是一个圆形的角散布锥。

         以前是每轴取一个均匀随机数再归一化：那样"最外圈"和"正中心"
         的弹一样密，靶纸上是一个空心方块。高斯 → 半径是瑞利分布，
         中心密、边缘稀，才是实弹靶纸的样子。

         为什么做成锥形（散布随距离线性放大）：真枪的散布本来就是
         角度量，而这个形状正好给出想要的平衡 ——
         一千米以内 1σ 只有两三米，机炮还是精确武器；
         到最大射程它长成一片，打不打得中变成概率。
         远距离那一片不靠单发精度，靠**射速**兜住：CEL-3 每秒一百多发，
         即便最大射程上只有三成落靶，每秒仍有四十多发命中。
         数值、算式与"射速兜底"的余量见 docs/systems/weapons.md「机炮散布」。 */
      var dir = M3.norm(M3.add(a.fwd, M3.add(
        M3.mul(a.right, gauss() * w.spread),
        M3.mul(a.up, gauss() * w.spread))));
      /* 左右炮口交替。以前用 i % 2，而每轮通常只出 1 发 → 永远是左炮口，
         火光却画在右边，看上去子弹和火光不是一个地方出来的。
         现在按"发"轮换（a.gunSide 跨轮保留），火光跟着同一个点走。 */
      a.gunSide = a.gunSide ? 0 : 1;
      var b = fireGunFrom(a, w, gunMuzzle(a, a.gunSide), dir, world, { life: bulletLife });
      b.side = a.gunSide;           // 哪一侧炮口：曳光尾巴接回当前炮口，见 game.js drawTracers
    }

    /* 炮口火光：只记"正在开火"，真正的画法在 flashRings。
       以前每轮在炮口生成一对粒子、靠它们沿航迹漂开形成残影 ——
       可每一圈的出生时刻受帧率和射速节流的取整影响，位置和年龄都不齐，
       拖出来的是一串大小不一、间距忽大忽小的圆。 */
    a.gunFlashT = 0.05;
    a.gunFlashBoth = n >= 2;
  }

  /* 炮口火光的残影：每帧按**固定间距**沿机身向后排一串圆，
     越往后越大、越淡。它们挂在飞机上（按机体坐标算），
     所以无论帧率、射速、机动如何，间距永远均匀。
     只在本帧画一次（不进 world.particles），停火后 0.05 s 内消失。 */
  var FLASH_RINGS = 10;

  // 圈数
  var FLASH_STEP = 0.22;

  // 相邻两圈的间距（米）
  function flashRings(world) {
    var out = [];
    var acts = world.actors;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a.gunFlashT || a.gunFlashT <= 0) continue;
      if (!a.alive) continue;
      var sides = a.gunFlashBoth ? [0, 1] : [a.gunSide];
      for (var si = 0; si < sides.length; si++) {
        var mz = gunMuzzle(a, sides[si]);
        // 炮口白芯
        // 炮口白芯 —— 最亮的一点必须在炮口上，曳光也从这里接出去
        out.push({ pos: mz, size: 0.30, color: '#fff6d8', alive: true, life: 1, life0: 1, alpha: 0.95 });
        for (var k = 0; k < FLASH_RINGS; k++) {
          var t = k / (FLASH_RINGS - 1);
          out.push({
            pos: M3.add(mz, M3.mul(a.fwd, -k * FLASH_STEP)),
            size: 0.30 + 0.32 * t,
            color: '#ffd070', alive: true, life: 1, life0: 1,
            /* 加色混合下相邻几圈会叠在一起，单圈要淡：
               以前 0.44 起步，叠出来最亮的反而是炮口后面一截 */
            alpha: 0.20 * (1 - t) + 0.02
          });
        }
      }
    }
    return out;
  }

  /* 炮口位置（side 0 = 左，1 = 右）。子弹出膛与火光共用这一份。 */
  /* 机型数据里写了 muzzle（炮管口的机体坐标 [|x|, y, z]）的，按它出膛；
     没写的统一用"机头前 6 m、左右 0.7 m"。 */
  function gunMuzzle(a, side) {
    var g = a.ac && a.ac.muzzle;
    if (g) {
      return M3.add(a.pos, M3.add(M3.mul(a.right, side ? g[0] : -g[0]),
        M3.add(M3.mul(a.up, g[1]), M3.mul(a.fwd, g[2]))));
    }
    return M3.add(a.pos, M3.add(M3.mul(a.fwd, 6), M3.mul(a.right, side ? 0.7 : -0.7)));
  }

  function stepBullet(b, dt, world) {
    if (!b.alive) return;
    // 保留上一帧位置，渲染曳光弹时用它画线段。
    // M3.add 返回新对象，所以这里的引用不会被下一步覆盖。
    b.prev = b.pos;
    Ballistics.step(b, dt);
    b.steps = (b.steps || 0) + 1;      // 走了几帧：drawTracers 只让第一帧的曳光接回炮口
    b.life -= dt;
    var bgy = $.groundY(b.pos.x, b.pos.z);
    if (b.life <= 0 || b.pos.y <= bgy) {
      /* 带战斗部的炮弹：落水就地起爆，寿命到点在空中自毁（对空射击时天上一团团的烟） */
      if (b.blast > 0 && world) {
        var gnd = b.pos.y <= bgy;
        if (gnd) b.pos.y = bgy;
        detonateShell(b, world, null, null, { ground: gnd });
      } else b.alive = false;
    }
  }
})(Ent);
