(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.effRange = effRange; $.maxReach = maxReach; $.glideReach = glideReach; $.flyTo = flyTo; $.envelopeRange = envelopeRange; $.envelopeCached = envelopeCached; $.displayRange = displayRange; $.naturalPoint = naturalPoint; $.finFootprint = finFootprint; $.lockOff = lockOff; $.aiReach = aiReach; $.effectiveLife = effectiveLife;

  /* ============================================================
     有效射程：这件弹从 alt 高度平飞发射，**真的能飞到多远**

     lockDist 只是导引头能锁多远。弹飞不飞得到，看的是速度、动力段、
     滑翔掉速、高抛弹道 —— BOX-14 锁得到 9 km，实际只飞得到 8.2 km。
     以前 AI 一律拿 lockDist 当射程，于是在"锁得上但打不到"的距离上开火。

     算法：用 stepMissile 本身对一个远在 60 km 外、正前方的假目标飞一次，
     记下弹体结束（寿命到、撞地）时离发射点的距离（对面弹取水平距离）。
     和实战用同一份弹道代码 —— 改了速度、寿命、loft，射程自动跟着变。
     结果按 2 km 高度分档缓存在武器上，第一次用到时才算（一次 < 2400 步）。
     ============================================================ */
  // 步数上限 5 分钟：不按寿命自爆的滑翔弹从高空投放要飞一分多钟
  var EFF_BAND = 2000, EFF_LAUNCH_V = 250, EFF_MAX_FRAMES = 60 * 300;

  /* effRange 是"平地、离地高度 alt"下的抽象射程（按高度分档缓存）：模拟里的坐标是虚构的，
     不能读真实地形 —— 否则弹会撞上不存在的山，缓存也跟着地形变。所以模拟期间临时把地形关掉，
     调用方按"本机高出目标多少"传 alt。 */
  function effRange(w, alt) {
    if (!w || !w.vsLife) return w ? (w.lockDist || 0) : 0;
    var saved = $.terrainFn; $.terrainFn = null;
    try { return effRangeFlat(w, alt); } finally { $.terrainFn = saved; }
  }

  function effRangeFlat(w, alt) {
    var band = Math.max(0, Math.round((alt || 0) / EFF_BAND));
    var c = w.__eff || (w.__eff = {});
    if (c[band] !== undefined) return c[band];
    var y0 = Math.max(200, band * EFF_BAND);
    var surf = w.target === 'ground' || w.target === 'ship';
    var far = 200000;   // 足够远：从 24 km 高空投放的滑翔弹也飞不到
    var dummy = surf
      ? { kind: 'target', alive: true, team: 99, radius: 10, pos: M3.V(0, 0, far), vel: M3.V(0, 0, 0) }
      : { kind: 'dummy', alive: true, team: 99, pos: M3.V(0, y0, far), vel: M3.V(0, 0, 0) };
    // silent：结束时的起爆不出声（Combat.detonate 认这个标记）
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = $.makeMissile({ weapon: w.id, team: 98, pos: M3.V(0, y0, 0),
      fwd: M3.norm(M3.sub(dummy.pos, M3.V(0, y0, 0))), speed: EFF_LAUNCH_V, target: dummy });
    m.owner = null;
    var last = M3.clone(m.pos);
    for (var f = 0; f < EFF_MAX_FRAMES && m.alive; f++) {
      last = M3.clone(m.pos);
      $.stepMissile(m, 1 / 60, world);
      world.particles.length = 0;
    }
    var r = surf ? Math.sqrt(last.x * last.x + last.z * last.z) : M3.len(M3.sub(last, M3.V(0, y0, 0)));
    /* 高抛弹（loft）：远处假目标让它一路高飞、到不了俯冲段，平飞估计偏大 15% 左右。
       在 [0.6 r, r] 里对真目标二分几次，取"真的打得到"的最远距离。 */
    if (w.loft && surf) r = loftReach(w, y0, r);
    return (c[band] = Math.round(r));
  }

  /* 从**当前投放 / 发射状态**出发，弹沿发射方向能飞到的最大水平距离（米）。
     这是 5.4 发射包线的基础：和 effRange 同一份弹道代码（stepMissile），
     但初始位置、速度、方向都取本机此刻的真实值，不按高度分档。
     假目标放在发射方向水平延长线上 200 km 外、高度 targetY 处，
     弹一路追到落地 / 寿命结束，量水平位移。
     步长 1/30 s（HUD 每 0.3 s 才重算一次，精度够用）。 */
  function maxReach(w, la, targetY) {
    var fwd = la.fwd, pos = la.pos;
    var hx = fwd.x, hz = fwd.z, hl = Math.sqrt(hx * hx + hz * hz);
    if (hl < 1e-3) { hx = 0; hz = 1; hl = 1; }
    hx /= hl; hz /= hl;
    var far = 200000;
    var dummy = { kind: 'target', alive: true, team: 98, radius: 10,
      pos: M3.V(pos.x + hx * far, targetY, pos.z + hz * far), vel: M3.V(0, 0, 0) };
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = $.makeMissile({ weapon: w.id, team: 98, pos: pos, fwd: fwd, speed: la.speed, target: dummy });
    m.owner = null;
    var last = M3.clone(m.pos);
    for (var f = 0; f < EFF_MAX_FRAMES / 2 && m.alive; f++) {
      last = M3.clone(m.pos);
      $.stepMissile(m, 1 / 10, world);
      world.particles.length = 0;
    }
    var dx = last.x - pos.x, dz = last.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* 滑翔弹专用入口（向后兼容）：同 maxReach，目标在投放方向的海面上。 */
  function glideReach(w, pos, fwd, speed) {
    return maxReach(w, { pos: pos, fwd: fwd, speed: speed }, 0);
  }

  /* ============================================================
     5.4 发射包线：从当前发射状态出发，弹**追不追得到**目标

     以前 rmax / NEZ 是解析式（动力段距离 + 目标背离速度的经验系数），
     目标高度、爬升 / 俯冲的射程损耗、"掉头逃逸"都算不准。现在换成
     真实弹道：flyTo 用 stepMissile 追一个会动的目标跑一遍，命中 / 够得着
     就返回 true，再二分出 rmax（目标保持航向）与 nez（目标掉头逃逸）。

     目标和实战用同一份 stepMissile —— 改了弹道、速度、loft，包线自动跟着变。
     ============================================================ */

  /* 目标逃逸 / 巡航时的最大航速：飞机取 vMax（加力上限），舰船取航速。 */
  function targetMaxSpeed(tg) {
    if (tg.phys && tg.phys.vMax) return tg.phys.vMax;
    if (tg.speed) return tg.speed;
    return (tg.kind === 'target') ? 12 : 300;
  }

  /* 单次可达性：从 la 发射 w，追 tg（克隆，不污染原实体），flee 时目标
     每帧掉头、以最大航速背离弹逃逸。返回是否命中 / 够得着。 */
  function flyTo(w, la, tg, flee, dtFix) {
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    /* 克隆目标 team 与弹同号（98）：起爆结算时会跳过同队，不触发
       game.js 注册的 hitTarget（那需要完整的 world）。这里只看"够不够得着"，
       不结算伤害。 */
    var t = { kind: tg.kind, alive: true, team: 98, radius: tg.radius || 10,
      pos: M3.clone(tg.pos), vel: tg.vel ? M3.clone(tg.vel) : M3.V(0, 0, 0) };
    if (tg.fwd) t.fwd = M3.clone(tg.fwd);
    var m = $.makeMissile({ weapon: w.id, team: 98, pos: M3.clone(la.pos), fwd: M3.clone(la.fwd), speed: la.speed, target: t, owner: null });
    var vMax = targetMaxSpeed(tg);
    var isAir = $.targetClass(w, tg) === 'air';
    var dt = 1 / 10, simT = 0;      // 包线 / 瞄准圈估算步长（见 estDt；近炸按线段最近点，不漏判）
    /* 目标的初始水平距离：弹一旦飞过它一段距离还没命中，就追不上了（滑翔过头 /
       逃逸甩掉），可以提前退出，不必等它滑到落地或烧完寿命。 */
    var ox = t.pos.x - m.pos.x, oz = t.pos.z - m.pos.z;
    var hit = false, minD = Infinity;
    for (var f = 0; f < EFF_MAX_FRAMES && m.alive; f++) {
      dt = dtFix || estDt(w, simT); simT += dt;
      if (flee) {
        /* 掉头逃逸：机头**水平**背离弹、保持高度、以最大航速跑。方向每帧重算 ——
           弹在追，目标永远往背离它的方向逃，这是"甩掉"的最坏情况。
           （不能用三维背离：那样目标会沿"爬升 / 俯冲"方向逃，爬升掉速反而逃不快。） */
        var away = M3.sub(t.pos, m.pos);
        var ah = Math.sqrt(away.x * away.x + away.z * away.z);
        if (ah > 1) {
          var dir = M3.V(away.x / ah, 0, away.z / ah);
          t.fwd = dir; t.vel = M3.mul(dir, vMax);
          t.pos = M3.add(t.pos, M3.mul(dir, vMax * dt));
        }
      } else if (t.vel) {
        t.pos = M3.add(t.pos, M3.mul(t.vel, dt));   // 保持当前航向 / 航速
      }
      $.stepMissile(m, dt, world);
      world.particles.length = 0;
      if (!m.alive) {
        /* 起爆（命中 / 近炸 / 寿命到 / 落地）。判它是否够得着目标：
           对空看近炸 / 直接命中距离，对面看落地时是否进了溅射半径。 */
        if (isAir) {
          hit = M3.dist(m.pos, t.pos) - Combat.radiusOf(t) < (w.fuze || Combat.CONTACT) + 5;
        } else {
          var dx = m.pos.x - t.pos.x, dz = m.pos.z - t.pos.z;
          hit = Math.sqrt(dx * dx + dz * dz) < Combat.radiusOf(t) + (w.blast || 15);
        }
        break;
      }
      /* 提前退出：弹距目标已经从最近点拉开 2.5 km —— 追不上了（目标太远、
         逃逸甩掉，或滑翔过头），后面的弹道只会越来越远。用"弹距目标"而不是
         "弹距发射点"，是因为尾追时目标也在跑，弹飞过发射方向一段距离是正常的。 */
      var dd = M3.dist(m.pos, t.pos);
      if (dd < minD) minD = dd;
      if (f > 10 && dd > minD + 2500) break;
    }
    return hit;
  }

  /* 找"最远命中距离"。pred(D) 在距离上不是单调的：loft / 滑翔弹需要一段
     距离俯冲 / 滑翔，太近反而打不中 —— 命中区间是 [近界, rmax] 的一段。
     所以在区间里先采样定位命中段的右端，再在它和相邻的失手点之间二分，
     取最远命中距离（rmax）。 */
  function bisectFar(pred, lo, hi, iters) {
    iters = iters || 3;
    if (pred(hi)) return hi;                        // 上界都够得着：rmax = 上界
    var N = 4, step = (hi - lo) / N, lastHit = -1;
    for (var i = 0; i <= N; i++) {
      var d = lo + step * i;
      if (pred(d)) lastHit = d; else if (lastHit >= 0) break;   // 命中段结束
    }
    if (lastHit < 0) return 0;                      // 全程打不中
    var l = lastHit, r = Math.min(hi, lastHit + step);
    for (var j = 0; j < iters; j++) {
      var mid = (l + r) / 2;
      if (pred(mid)) l = mid; else r = mid;
    }
    return l;
  }

  /* 发射包线：{ rmax, nez }（米，斜距，与 HUD 的 M3.dist 同单位）。la = { pos, fwd, speed }，
     tg = 目标实体。rmax = 目标保持航向能命中的最远距离，nez = 目标掉头
     逃逸仍能命中的最远距离。不夹 lockDist（锁不锁得上由 HUD / AI 各自处理）。 */
  function envelopeRange(w, la, tg, dtFix) {
    /* 水平视线方向：目标高度固定 tg.pos.y，只沿水平方向缩放距离 ——
       否则目标会"穿过地面"（对地弹）或让二分在无意义的斜距上浪费。
       lo 端俯角过大丢目标由 bisectFar 的采样跳过，不在这里特判。 */
    var tox = tg.pos.x - la.pos.x, toz = tg.pos.z - la.pos.z;
    var tdl = Math.sqrt(tox * tox + toz * toz) || 1;
    var dx = tox / tdl, dz = toz / tdl;
    var dh = la.pos.y - tg.pos.y;               // 发射高度 − 目标高度（斜距换算用）
    function at(D) {
      var nt = { kind: tg.kind, radius: tg.radius || 10,
        pos: M3.V(la.pos.x + dx * D, tg.pos.y, la.pos.z + dz * D),
        vel: tg.vel ? M3.clone(tg.vel) : M3.V(0, 0, 0) };
      if (tg.fwd) nt.fwd = M3.clone(tg.fwd);
      if (tg.phys) nt.phys = tg.phys;
      if (tg.speed) nt.speed = tg.speed;
      return nt;
    }
    var hi = maxReach(w, la, tg.pos.y);         // 弹最大水平射程
    var lo = 400;                               // 最小有效射程（太近俯角过大 / 出膛还追不上）
    var rmaxFlat = bisectFar(function (D) { return flyTo(w, la, at(D), false, dtFix); }, lo, hi);
    var nezFlat = bisectFar(function (D) { return flyTo(w, la, at(D), true, dtFix); }, lo, rmaxFlat);
    /* 校验：二分在非单调区间（滑翔 / 高抛）可能落在一个打不中的点上。
       0.9 倍处若已经打不中，就逐步往回收，保证调用方取 0.9× 时确实命中。 */
    /* 对外的距离是斜距（见上面的 rmax / nez 返回值），校验也按斜距来：
       斜距 S 对应的水平距离 = sqrt(S² − dh²)。 */
    var flatOf = function (S) { var v = S * S - dh * dh; return v > 0 ? Math.sqrt(v) : 0; };
    var rmS = Math.sqrt(rmaxFlat * rmaxFlat + dh * dh), nzS = Math.sqrt(nezFlat * nezFlat + dh * dh), q;
    for (q = 0; q < 12 && rmS > 0 && !flyTo(w, la, at(0.9 * flatOf(rmS)), false, dtFix); q++) rmS *= 0.9;
    for (q = 0; q < 12 && nzS > 0 && !flyTo(w, la, at(0.9 * flatOf(nzS)), true, dtFix); q++) nzS *= 0.9;
    /* 收不回来（滑翔弹从高空投放，逃逸的目标追不上）：nez 只剩"目标正下方"这一点，即斜距 = 高度差 */
    if (!flyTo(w, la, at(0.9 * flatOf(nzS)), true, dtFix)) nzS = Math.max(nzS, dh);
    return {
      rmax: rmS,
      nez: nzS
    };
  }

  /* 发射包线的缓存版（AI、打击航线共用）：结果挂在 holder 上，interval 秒内复用；
     换弹、换目标时作废。步长 1/5（实测误差约射程的 5%，由调用方的余量吃掉）。 */
  function envelopeCached(holder, clock, la, w, wid, t, interval) {
    var c = holder.env;
    if (c && c.wid === wid && c.tgt === t && clock - c.t < interval) return c;
    var e = envelopeRange(w, la, t, 1 / 5);
    return (holder.env = { t: clock, wid: wid, tgt: t, rmax: e.rmax, nez: e.nez });
  }

  /* 机库 / 图鉴的"标称射程"（公里）：读 effRange（真实弹道，与 AI、HUD 同一套），
     按弹种取一个代表性的平飞发射高度 —— 对地 / 对海弹取中高空（滑翔、巡航能发挥），
     空空弹取中空。无制导弹、吊舱、定向能返回 null（不显示"射程"）。
     以前这里用 data.js 的 missileRange（速度 × 寿命的解析式），滑翔弹被严重低估。 */
  function displayRange(w) {
    if (!w || w.tags.passive) return null;
    if (w.kind === 'dew') return null;
    if (w.tags.unguided || !w.seeker || w.seeker === 'none') return null;
    var alt = (w.target === 'ground' || w.target === 'ship') ? 8000 : 6000;
    var r = effRange(w, alt);
    return r > 0 ? r / 1000 : null;
  }

  /* ============================================================
     5.3 第 3 条：精确制导炸弹的落点可达区域（泪滴形瞄准圈）

     精确制导炸弹（PEJ-14 之类：ballistic + fin、无 glide）弹翼只能
     横向修 + 往下压，托不住重力 —— 落点可达区域天然不对称：
       后端（最远）= 自然抛物线落点，弹翼一步都越不过去；
       前端（最近）= 弹翼全力下压的落点；
       左右     = 弹翼全力横修的落点。
     所以它是一个近窄远宽的泪滴形。HUD 把它投影到屏幕画成圈，
     "目标套进圈内 = 物理上必中"。计算必须和真实弹道（stepMissile）
     是同一套，否则圈会骗人。
     ============================================================ */

  /* 估算用的步长：包线 / 瞄准圈 / 落点标记都是"每隔一会儿才算一次"的粗估，
     取 1/10；但火箭的动力段只有零点几秒，粗步长会把推力积分漏掉几百米（实测 PEJ-6
     在 1/10 下落点差 250 m），所以动力段内细到 1/60，之后再放粗。 */
  /* 滑翔 / 高抛弹（w.glide、w.loft）的落点对步长敏感：1/10 会让 asl 的 rmax 偏到打不中，
     所以它们仍用 1/60；其余弹道用 1/10 足够。 */
  function estDt(w, t) {
    if (w.burn && t < w.burn + 0.1) return 1 / 60;
    return (w.glide || w.loft) ? 1 / 60 : 1 / 10;
  }

  /* 自然落点：弹翼不修（无目标），纯抛物线落地。 */
  function naturalPoint(w, la, planeY) {
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = $.makeMissile({ weapon: w.id, team: 98, pos: M3.clone(la.pos), fwd: M3.clone(la.fwd), speed: la.speed, owner: null });
    for (var f = 0, tt = 0; f < EFF_MAX_FRAMES / 2 && m.alive; f++) {
      var edt = estDt(w, tt); tt += edt;
      $.stepMissile(m, edt, world);
      world.particles.length = 0;
      /* planeY：HUD 指定目标所在高度时按这个平面截；否则按落点处的地面高度 */
      if (m.pos.y <= (planeY != null ? planeY : $.groundY(m.pos.x, m.pos.z))) break;
    }
    return { x: m.pos.x, y: Math.max(m.pos.y, planeY != null ? planeY : $.groundY(m.pos.x, m.pos.z)), z: m.pos.z };
  }

  /* 沿水平角 φ（0 = 前方，±90° = 左右），二分求"能命中"（flyTo）的最远地面目标
     水平距离。用真实命中判定，而不是弹翼满偏落点 —— 满偏上修会把抛物线掰成平飞
     （等于偷偷滑翔），那不是精确制导炸弹的"修正范围"。 */
  function reachAtAngle(w, la, phi, hi, ty) {
    var hx = Math.sin(phi), hz = Math.cos(phi);
    function at(D) {
      return { kind: 'target', radius: 20,
        pos: M3.V(la.pos.x + hx * D, ty || 0, la.pos.z + hz * D), vel: M3.V(0, 0, 0), speed: 0 };
    }
    return bisectFar(function (D) { return flyTo(w, la, at(D), false); }, 400, hi || maxReach(w, la, ty || 0));
  }

  /* 可达区域：{ natural, points }。natural = 自然落点（弹翼不修）；
     points = 沿各水平角 flyTo 二分出的"能命中"最远地面目标 —— 用真实命中判定
     （flyTo / stepMissile 同一套），所以目标套进圈内就真的打得中。返回 null 表示
     这枚弹没有弹翼修正（不画圈）。 */
  function finFootprint(w, la, n, ty) {
    if (!w || !w.fin) return null;
    n = n || 12;
    var pts = [], hi = maxReach(w, la, ty || 0);
    for (var i = 0; i <= n; i++) {
      var phi = (i / n - 0.5) * (90 * Math.PI / 180);   // -45°..45°（前方扇区）
      var D = reachAtAngle(w, la, phi, hi, ty);
      /* 该方向"能命中"距离 < 最小射程（弹翼横修不到那么侧）：跳过，不画进圈。 */
      if (D <= 400) continue;
      var hx = Math.sin(phi), hz = Math.cos(phi);
      pts.push({ x: la.pos.x + hx * D, z: la.pos.z + hz * D });
    }
    return { natural: naturalPoint(w, la, ty), points: pts };
  }

  function hitsAt(w, y0, D) {
    // 与弹同队：起爆照常判，但不结算伤害（不会碰到 game.js 的 hitTarget）
    var tg = { kind: 'target', alive: true, team: 98, radius: 10, pos: M3.V(0, 0, D), vel: M3.V(0, 0, 0) };
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = $.makeMissile({ weapon: w.id, team: 98, pos: M3.V(0, y0, 0),
      fwd: M3.norm(M3.sub(tg.pos, M3.V(0, y0, 0))), speed: EFF_LAUNCH_V, target: tg });
    for (var f = 0; f < EFF_MAX_FRAMES && m.alive; f++) { $.stepMissile(m, 1 / 60, world); world.particles.length = 0; }
    return M3.dist(m.pos, tg.pos) < tg.radius + 15;
  }

  function loftReach(w, y0, r0) {
    var lo = r0 * 0.6, hi = r0;
    if (hitsAt(w, y0, hi)) return hi;
    for (var i = 0; i < 7; i++) {
      var mid = (lo + hi) / 2;
      if (hitsAt(w, y0, mid)) lo = mid; else hi = mid;
    }
    return lo;
  }

  /* 发射时的离轴角（玩家锁定、AI 开火、航线 strike 共用）。

     对空弹：机头与视线的三维夹角 —— 导引头在机头上。
     对面弹：只量**水平方位**，世界坐标的垂直方向不算。飞机保持高度飞，
     地面 / 海面目标在机头下方几十度是常态；俯冲是弹自己的事。 */
  function lockOff(a, t, w) {
    var to = M3.sub(t.pos, a.pos);
    if (w && $.targetClass(w, t) === 'surface') {
      var hx = to.x, hz = to.z, fx = a.fwd.x, fz = a.fwd.z;
      var hl = Math.sqrt(hx * hx + hz * hz), fl = Math.sqrt(fx * fx + fz * fz);
      if (hl < 1 || fl < 1e-3) return 0;          // 正上方 / 机头垂直：方位无从谈起，不拦
      return Math.acos(M3.clamp((hx * fx + hz * fz) / (hl * fl), -1, 1));
    }
    var d = M3.len(to);
    return d > 1 ? M3.angleBetween(a.fwd, M3.mul(to, 1 / d)) : 0;
  }

  /* AI 用的射程：min(锁定距离, 有效射程)。rangeK 留余量（目标在动、不一定正对着飞）。 */
  $.AI_RANGE_K = 0.9;

  function aiReach(w, alt, k) {
    if (!w) return 0;
    var L = w.lockDist || Infinity;      // 无制导弹没有 lockDist：只看飞得到多远
    if (!w.vsLife) return w.lockDist || 0;
    return Math.min(L, effRange(w, alt) * (k === undefined ? $.AI_RANGE_K : k));
  }

  /** 动力段时长。冲压弹随空气密度连续变化（阶段 5.1）：
      10–16 km 效率最好；往上推力逐渐不足，16 km → 26 km 平滑降到 24%；
      往下推力足但阻力大、烧得更快，海平面只有 80% 的有效燃烧时间。 */
  function effectiveLife(w, y) {
    if (!w.scramjet) return w.life;
    var k;
    if (y >= 16000) {
      var u = M3.clamp((y - 16000) / 10000, 0, 1);
      k = 1 - 0.76 * u * u * (3 - 2 * u);
    } else if (y < 10000) {
      k = 0.8 + 0.2 * M3.clamp(y / 10000, 0, 1);
    } else {
      k = 1;
    }
    return Math.max(1.2, w.life * k);
  }
})(Ent);
