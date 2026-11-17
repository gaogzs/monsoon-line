/* ============================================================
   HUD 全屏滤镜：电子战干扰 + 受损玻璃裂痕

   两种效果都画在整套 HUD 之上，但都是**轻**的 —— 最强的时候
   也只是给画面蒙一层，仪表、目标框、告警照样读得清。

   干扰（jam）
     强度 = max(suppressed, ewPower × 0.8)，与雷达雪花同一个"脏度"。
     三层：缓慢下行的扫描线带、细密的静电噪点、偶尔一闪的横向撕裂线。
     噪点是一张预渲染的小图，每帧随机平移重复铺开，不逐像素画。

   受损（玻璃裂痕；v3.6.2 起取代旧的红屏，免得和负 G 的红视混淆）
     不改 Ent.damage：每帧比较玩家 hp，掉了多少就是这一下的伤害。
     每次受击在屏幕上随机裂开一簇玻璃裂痕：放射主裂纹 + 随机游走折线 + 分叉 +（较重时）蛛网环 + 撞击核碎屑。
     严重度 = 本次伤害占满血的比例 与 累计已受伤害占满血的比例 的加权叠加 —— 伤得越多，同样一下裂得越狠。
     满可见保持 crackHold 秒后线性消退（越重消退越久）；消退前又受伤：现有裂痕立刻回满可见，
     并按新伤害在已有簇上长出新分支 / 延长末梢，或另起一簇（大伤害必定另起）。
     随机用私有 PRNG（时间 + 计数播种）：每次都不一样，且不碰 Math.random，不扰动游戏的随机流。
     静息时一笔都不画（没有裂痕就不进 on）。
     告警栏的"受损警告"由 alertOn() 提供，退得比裂痕早。

   过载视觉（v3.6.2；只是显示，没有任何实际惩罚，不改控制、不碰玩家状态）
     读 p.gNow（带符号的体感 G）与机型 gLimit（缺省 9）。
     持续高正 G（> gLimit × 0.8 且持续 gSustain 秒才拉满）：边缘向内收缩的暗灰渐变（灰视 / 黑视，上限很轻）；
     负 G（< -2）：沿边缘的淡红渐变（红视）。
     告警栏另有 OVERLOAD / NEG-G：gAlert() 给出 0 / 1（琥珀）/ 2（红色快闪）。
     1 G 附近一笔都不画（golden-render 不变）。

   画在**单独一层全屏画布**上（z-index 300）：盖住游戏画布上的 HUD，
   也盖住无线电记录、系统提示这些 HTML 面板（200 / 210）——
   干扰时整个界面都该"花"。暂停菜单（800）在它上面，不受影响。
   干扰还给这一层加一点 backdrop-filter 模糊，强度跟着压制走，最重 1.2 px。
   这一层每帧开始时清空（Renderer.begin → beginFrame），离开战斗自动消失。

   HUD.draw 拿到的 dt 恒为 0（game.js 里画的是"当前状态"），
   所以这里自己用 performance.now() 算帧间隔。
   ============================================================ */
var HudFx = (function () {
  'use strict';

  var FX = {
    jamMin: 0.04,          // 低于它不画
    jamScanA: 0.10,        // 扫描线带的最大不透明度
    jamNoiseA: 0.13,       // 噪点层的最大不透明度
    jamTearA: 0.22,        // 撕裂线的最大不透明度（只有一两条细线）
    crackPerHp: 3.2,       // 单次掉血占满血的比例 × 这个数 = 本次的"冲击"（0..1）
    crackMin: 0.12,        // 再小的一下也要能看出来
    crackHold: 1.2,        // 受击后满可见保持多久（s）
    crackBase: 3,          // 消退时长 = crackBase + crackSpan × 严重度（s）
    crackSpan: 5,
    crackGrow: 0.15,       // 新裂痕从撞击点"裂开"到最远端的时间（s）
    crackMax: 900,         // 线段总数封顶
    crackAlpha: 0.6,       // 冷白主线的最大不透明度
    crackFogA: 0.05,       // 严重时那层极淡白雾的最大不透明度（不是红色）
    gLimDefault: 9,        // 机型没写 gLimit 时的过载上限（与 AI 的 gTrack 一致）
    gGreyFrom: 0.8,        // 持续正 G 超过 gLimit × 这个数开始灰视
    gGreySpan: 0.25,       // 再多 gLimit × 这个数达到满强度
    gSustain: 4,           // 持续多久才拉满（s）
    gGreyMax: 0.35,        // 灰视边缘最大不透明度（轻微）
    gRedFrom: -2,          // 低于它开始红视
    gRedSpan: 3,           // 再低多少达到满强度
    gRedMax: 0.30,         // 红视边缘最大不透明度
    gWarnFrac: 0.85,       // 告警：gNow ≥ gLimit × 这个数（琥珀）
    gNegWarn: -2.5,        // 告警：gNow ≤ 这个数（琥珀）
    gNegCrit: -4,          // 告警：gNow ≤ 这个数（红色）
    alertHold: 1.4,        // "受损警告"在最后一次掉血后保留多久（s）
    jamBlur: 1.2,          // 干扰最强时整层界面的模糊半径（px）
    layerZ: 300            // 叠加层的 z-index：无线电面板之上、暂停菜单之下
  };

  /* ---------- 叠加层 ---------- */
  var layer = null, lctx = null, layerDirty = false, curBlur = 0;
  function getLayer() {
    if (layer) return lctx;
    if (typeof document === 'undefined' || !document.body || !document.createElement) return null;
    layer = document.createElement('canvas');
    if (!layer || !layer.getContext) { layer = null; return null; }
    var st = layer.style || {};
    st.position = 'fixed'; st.left = '0'; st.top = '0'; st.width = '100%'; st.height = '100%';
    st.pointerEvents = 'none'; st.zIndex = String(FX.layerZ);
    if (document.body.appendChild) document.body.appendChild(layer);
    lctx = layer.getContext('2d');
    return lctx;
  }
  function setBlur(px) {
    if (!layer || Math.abs(px - curBlur) < 0.05) return;
    curBlur = px;
    var v = px > 0.05 ? 'blur(' + px.toFixed(2) + 'px)' : 'none';
    layer.style.backdropFilter = v;
    layer.style.webkitBackdropFilter = v;
  }
  /* 每帧开始（不管在不在战斗里）：清掉上一帧 */
  function beginFrame() {
    if (!layer || !layerDirty) return;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    setBlur(0);
    layerDirty = false;
  }

  var lastT = 0;
  var vis = 0;             // 裂痕整体可见度 0..1
  var holdT = 0, fadeDur = 4;
  var cracks = [], segCount = 0;
  var gT = 0, gGrey = 0, gRed = 0, gLevel = 0, gNeg = false;   // 过载视觉状态
  var cumDmg = 0, lastSev = 0, seedCtr = 0, lastAsp = 16 / 9, lastNow = 0;
  var arenaK = 0;          // 越界渐黑进度 0..1（Game 的 arenaTick 推进，经 setArenaFade 推进来）
  var alertT = 0;          // 告警剩余时间
  var lastHp = null, lastP = null;
  var noise = null;        // 预渲染噪点图

  function makeNoise() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext && c.getContext('2d');
    if (!g || !g.createImageData) return null;
    var img = g.createImageData(128, 128);
    if (!img || !img.data) return null;        // 工具脚本里的假画布
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.random() < 0.5 ? 0 : 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = Math.random() < 0.35 ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function jamLevel(p) {
    return Math.max(p.suppressed || 0, (p.ewPower || 0) * 0.8);
  }

  /* 每帧一次：量掉血、推进衰减。在 draw 里调。 */
  function step(p, now) {
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    lastNow = now;
    if (p !== lastP) { lastP = p; lastHp = p.hp; clearCracks(); gT = 0; cumDmg = 0; lastSev = 0; alertT = 0; return dt; }
    if (p.alive && lastHp !== null && p.hp < lastHp - 1e-6) noteDamage(lastHp - p.hp, p.maxHp || 100);
    lastHp = p.hp;
    stepG(p, dt);
    if (cracks.length && holdT > 0) holdT -= dt;
    else if (cracks.length) { vis -= dt / fadeDur; if (vis <= 0) clearCracks(); }
    alertT = Math.max(0, alertT - dt);
    return dt;
  }

  /* ---------- 过载视觉 ---------- */
  function stepG(p, dt) {
    var g = typeof p.gNow === 'number' && isFinite(p.gNow) ? p.gNow : 1;
    var lim = (p.ac && p.ac.gLimit) || FX.gLimDefault;
    var hi = lim * FX.gGreyFrom;
    if (g > hi) gT = Math.min(FX.gSustain, gT + dt); else gT = Math.max(0, gT - dt * 2);
    var posK = M3.clamp((g - hi) / Math.max(0.1, lim * FX.gGreySpan), 0, 1);
    gGrey = p.alive === false ? 0 : posK * M3.clamp(gT / FX.gSustain, 0, 1) * FX.gGreyMax;
    gRed = p.alive === false ? 0 : M3.clamp((FX.gRedFrom - g) / FX.gRedSpan, 0, 1) * FX.gRedMax;
    gNeg = g < 0;
    gLevel = p.alive === false ? 0 : (g >= lim || g <= FX.gNegCrit) ? 2 : (g >= lim * FX.gWarnFrac || g <= FX.gNegWarn) ? 1 : 0;
  }

  /* 边缘渐变：中心近乎透明（不挡读数），k 是边缘不透明度；shrink 0..1 让透明区随强度收缩（隧道视野） */
  function drawEdge(ctx, W, H, rgb, k, shrink) {
    if (!ctx.createRadialGradient) return;
    var r0 = Math.min(W, H) * (0.58 - 0.26 * shrink), r1 = Math.hypot(W, H) * 0.55;
    var g = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
    g.addColorStop(0, 'rgba(' + rgb + ',0)');
    g.addColorStop(1, 'rgba(' + rgb + ',' + k.toFixed(3) + ')');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ---------- 玻璃裂痕 ---------- */
  function clearCracks() { cracks.length = 0; segCount = 0; vis = 0; holdT = 0; }

  function mulberry(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 生成上下文（一次生成调用内有效）：撞击点 / 生长起点、最大伸展、出生时刻
  var gO = null, gReach = 0.3, gBorn = 0;

  function addSeg(cl, x1, y1, x2, y2, b) {
    var dx = x2 - gO.x, dy = y2 - gO.y;
    var delay = FX.crackGrow * 1000 * Math.min(1, Math.sqrt(dx * dx + dy * dy) / gReach);
    cl.segs.push({ x1: x1, y1: y1, x2: x2, y2: y2, b: b, t0: gBorn + delay });
    segCount++;
  }

  /* 一条随机游走的裂纹，沿途分叉。返回折线点（含起点）。 */
  function walk(cl, rnd, x, y, ang, len, depth) {
    var n = 5 + Math.floor(rnd() * 5), st = len / n, pts = [{ x: x, y: y }];
    var b = depth > 2 ? 2 : depth;
    for (var i = 0; i < n; i++) {
      ang += (rnd() - 0.5) * 0.55;
      var l = st * (0.7 + rnd() * 0.6);
      var nx = x + Math.cos(ang) * l, ny = y + Math.sin(ang) * l;
      addSeg(cl, x, y, nx, ny, b);
      cl.nodes.push({ x: nx, y: ny, a: ang, tip: i === n - 1 });
      pts.push({ x: nx, y: ny });
      if (depth < 3 && i < n - 1 && rnd() < 0.35 * (1 - depth * 0.3)) {
        var side = rnd() < 0.5 ? -1 : 1;
        walk(cl, rnd, nx, ny, ang + side * (0.45 + rnd() * 0.75), len * (0.3 + 0.25 * rnd()) * (1 - i / n), depth + 1);
      }
      x = nx; y = ny;
    }
    return pts;
  }

  function nearPt(pts, o, r) {
    var best = pts[0], bd = 1e9;
    for (var i = 0; i < pts.length; i++) {
      var d = Math.abs(Math.sqrt((pts[i].x - o.x) * (pts[i].x - o.x) + (pts[i].y - o.y) * (pts[i].y - o.y)) - r);
      if (d < bd) { bd = d; best = pts[i]; }
    }
    return best;
  }

  function newCluster(rnd, sev, now) {
    var asp = lastAsp, ix = asp * (0.12 + 0.76 * rnd()), iy = 0.12 + 0.76 * rnd();
    if (Math.abs(ix - asp / 2) < 0.08 * asp && Math.abs(iy - 0.5) < 0.08 && rnd() < 0.7) { ix = asp * (0.12 + 0.76 * rnd()); iy = 0.12 + 0.76 * rnd(); }   // 尽量别正压在准星上
    var cl = { asp: asp, x: ix, y: iy, segs: [], nodes: [], chips: [], reach: 0.18 + 0.75 * sev };
    gO = { x: ix, y: iy }; gReach = cl.reach; gBorn = now;
    var n = 3 + Math.round(sev * 7), base = rnd() * Math.PI * 2, rays = [], i;
    for (i = 0; i < n; i++) {
      var ang = base + i * Math.PI * 2 / n + (rnd() - 0.5) * 0.6;
      rays.push(walk(cl, rnd, ix, iy, ang, cl.reach * (0.6 + 0.4 * rnd()), 0));
    }
    if (sev > 0.4) {                                           // 蛛网环：相邻放射裂纹之间按 0.25 / 0.5 半径连起来
      var rs = [0.25, 0.5];
      for (var k = 0; k < rs.length; k++) {
        for (i = 0; i < n; i++) {
          var A = nearPt(rays[i], gO, cl.reach * rs[k]), B = nearPt(rays[(i + 1) % n], gO, cl.reach * rs[k]);
          var mx = (A.x + B.x) / 2 + (rnd() - 0.5) * 0.02, my = (A.y + B.y) / 2 + (rnd() - 0.5) * 0.02;
          addSeg(cl, A.x, A.y, mx, my, 2); addSeg(cl, mx, my, B.x, B.y, 2);
        }
      }
    }
    var core = 6 + Math.floor(rnd() * 5);                      // 撞击核：短而密的碎纹 + 碎屑
    for (i = 0; i < core; i++) {
      var ca = rnd() * Math.PI * 2, cr = 0.012 + rnd() * 0.022;
      addSeg(cl, ix, iy, ix + Math.cos(ca) * cr, iy + Math.sin(ca) * cr, 1);
    }
    var nc = 4 + Math.floor(rnd() * 5);
    for (i = 0; i < nc; i++) { var pa = rnd() * Math.PI * 2, pr = 0.01 + rnd() * 0.07; cl.chips.push({ x: ix + Math.cos(pa) * pr, y: iy + Math.sin(pa) * pr, t0: now + 20 }); }
    return cl;
  }

  /* 在已有簇上生长：随机已有节点长出新分支，或把某个末梢接着延长 */
  function growCluster(rnd, cl, sev, now) {
    gO = { x: cl.x, y: cl.y }; gReach = cl.reach; gBorn = now;
    var k = 1 + Math.round(sev * 3);
    for (var i = 0; i < k && cl.nodes.length; i++) {
      var nd = cl.nodes[Math.floor(rnd() * cl.nodes.length)];
      if (rnd() < 0.5) {                                        // 找一个末梢延长
        for (var j = 0; j < 6; j++) { var c = cl.nodes[Math.floor(rnd() * cl.nodes.length)]; if (c.tip) { nd = c; break; } }
      }
      var wasTip = nd.tip, side = rnd() < 0.5 ? -1 : 1;
      nd.tip = false;
      walk(cl, rnd, nd.x, nd.y, wasTip && rnd() < 0.6 ? nd.a : nd.a + side * (0.4 + rnd() * 0.8), cl.reach * (0.25 + 0.3 * rnd()), 1);
    }
  }

  /* 单次伤害：严重度 = 本次冲击与累计伤害的加权叠加；已有裂痕回满可见并生长，或另起一簇。 */
  function noteDamage(amt, maxHp) {
    maxHp = Math.max(1, maxHp);
    var hit = Math.min(1, (amt / maxHp) * FX.crackPerHp);
    cumDmg += amt;
    var cum = Math.min(1, cumDmg / maxHp);
    var sev = M3.clamp(FX.crackMin + 0.55 * hit + 0.45 * cum, FX.crackMin, 1);
    lastSev = sev;
    alertT = FX.alertHold;
    var rnd = mulberry(((Math.floor(lastNow) ^ Math.imul(++seedCtr, 0x9E3779B1)) >>> 0));
    var now = lastNow;
    vis = 1; holdT = FX.crackHold;
    fadeDur = FX.crackBase + FX.crackSpan * sev;
    if (cracks.length && segCount < FX.crackMax * 0.8 && amt / maxHp < 0.25 && rnd() < 0.6) {   // 单次 > 25% 满血必定另起一簇
      growCluster(rnd, cracks[Math.floor(rnd() * cracks.length)], sev, now);
    } else {
      cracks.push(newCluster(rnd, sev, now));
    }
    while (segCount > FX.crackMax && cracks.length > 1) segCount -= cracks.shift().segs.length;
  }

  function drawJam(ctx, W, H, j, now) {
    var t = now / 1000;
    ctx.save();
    // 1) 扫描线带：几条宽的暗带缓慢下行
    ctx.globalAlpha = FX.jamScanA * j;
    ctx.fillStyle = '#9fb8a8';
    var band = Math.max(18, H * 0.06), gap = band * 3.2;
    var off = (t * 40) % gap;
    for (var y = -gap + off; y < H; y += gap) ctx.fillRect(0, y, W, band * 0.35);
    // 细扫描线
    ctx.globalAlpha = FX.jamScanA * 0.6 * j;
    ctx.fillStyle = '#000';
    for (var y2 = 0; y2 < H; y2 += 3) ctx.fillRect(0, y2, W, 1);
    // 2) 静电噪点：预渲染图随机平移铺满
    if (!noise) noise = makeNoise();
    if (noise && ctx.drawImage) {
      ctx.globalAlpha = FX.jamNoiseA * j;
      var ox = Math.floor(Math.random() * 128), oy = Math.floor(Math.random() * 128);
      for (var x = -ox; x < W; x += 128) {
        for (var y3 = -oy; y3 < H; y3 += 128) ctx.drawImage(noise, x, y3);
      }
    }
    // 3) 撕裂线：压得越重越常出现
    if (Math.random() < 0.08 + 0.35 * j) {
      ctx.globalAlpha = FX.jamTearA * j;
      ctx.fillStyle = '#d8efe0';
      var n = 1 + (j > 0.6 ? 1 : 0);
      for (var k = 0; k < n; k++) ctx.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2);
    }
    ctx.restore();
  }

  /* 按线宽档（主裂纹 / 分支 / 细纹）合批：每档每遍一个 path 一次 stroke */
  var LW = [1, 0.65, 0.4];
  function strokeBucket(ctx, W, H, now, bk, dx, dy) {
    ctx.beginPath();
    for (var c = 0; c < cracks.length; c++) {
      var cl = cracks[c], sx = W / cl.asp, ss = cl.segs;
      for (var i = 0; i < ss.length; i++) {
        var g = ss[i];
        if (g.b !== bk || now < g.t0) continue;
        ctx.moveTo(g.x1 * sx + dx, g.y1 * H + dy);
        ctx.lineTo(g.x2 * sx + dx, g.y2 * H + dy);
      }
    }
    ctx.stroke();
  }

  function drawCracks(ctx, W, H, now) {
    var a = Math.pow(Math.max(0, Math.min(1, vis)), 1.5);
    if (a <= 0.003) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var bk;
    for (bk = 0; bk < 3; bk++) {                               // 1) 深色底，亮线在天空上也读得出
      ctx.strokeStyle = 'rgba(8,14,22,' + (0.35 * a).toFixed(3) + ')';
      ctx.lineWidth = 2.4 * LW[bk];
      strokeBucket(ctx, W, H, now, bk, 0, 0);
    }
    for (bk = 0; bk < 3; bk++) {                               // 2) 偏 1 px 的淡青高光（玻璃边缘折光）
      ctx.strokeStyle = 'rgba(150,220,255,' + (0.28 * a).toFixed(3) + ')';
      ctx.lineWidth = 0.6 * LW[bk] + 0.2;
      strokeBucket(ctx, W, H, now, bk, 1, 1);
    }
    for (bk = 0; bk < 3; bk++) {                               // 3) 冷白主线
      ctx.strokeStyle = 'rgba(225,238,248,' + (FX.crackAlpha * a).toFixed(3) + ')';
      ctx.lineWidth = 1.0 * LW[bk] + 0.3;
      strokeBucket(ctx, W, H, now, bk, 0, 0);
    }
    ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * a).toFixed(3) + ')';   // 4) 碎屑
    for (var c = 0; c < cracks.length; c++) {
      var cl = cracks[c], ch = cl.chips, sx = W / cl.asp;
      for (var i = 0; i < ch.length; i++) if (now >= ch[i].t0) ctx.fillRect(ch[i].x * sx - 0.75, ch[i].y * H - 0.75, 1.5, 1.5);
    }
    if (lastSev > 0.55 && ctx.createRadialGradient) {          // 5) 严重时一层极淡的白雾（不是红色）
      var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(235,245,255,0)');
      g.addColorStop(1, 'rgba(235,245,255,' + (FX.crackFogA * a * lastSev).toFixed(3) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* 越界渐黑：整层盖一层黑，k = 0..1。盖在干扰 / 受伤之上。 */
  function drawFade(ctx, W, H, k) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + k.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* HUD.draw 的最后调一次。画到叠加层上；拿不到叠加层（工具脚本）就画在传进来的 ctx 上。 */
  function draw(ctx, W, H, p) {
    if (!p) return;
    if (H > 0) lastAsp = W / H;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    step(p, now);
    var j = jamLevel(p);
    var on = j > FX.jamMin || cracks.length > 0 || gGrey > 0.005 || gRed > 0.005 || arenaK > 0.01;
    var g = on ? getLayer() : null;
    if (g) {
      var dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
      var pw = Math.floor(W * dpr), ph = Math.floor(H * dpr);
      if (layer.width !== pw || layer.height !== ph) { layer.width = pw; layer.height = ph; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      layerDirty = true;
    } else {
      g = ctx;
    }
    if (j > FX.jamMin) drawJam(g, W, H, Math.min(1, j), now);
    if (gGrey > 0.005) drawEdge(g, W, H, '16,18,22', gGrey, gGrey / FX.gGreyMax);
    if (gRed > 0.005) drawEdge(g, W, H, '170,20,20', gRed, gRed / FX.gRedMax);
    if (cracks.length) drawCracks(g, W, H, now);
    if (arenaK > 0.01) drawFade(g, W, H, arenaK);
    if (g !== ctx) setBlur(j > FX.jamMin ? FX.jamBlur * Math.min(1, j) : 0);
  }

  return {
    FX: FX, draw: draw, step: step, noteDamage: noteDamage, jamLevel: jamLevel, beginFrame: beginFrame,
    hurtLevel: function () { return cracks.length ? vis : 0; },
    gAlert: function () { return gLevel; },
    gNegative: function () { return gNeg; },
    gGreyLevel: function () { return gGrey; },
    gRedLevel: function () { return gRed; },
    crackSeverity: function () { return lastSev; },
    crackSegments: function () { return segCount; },
    crackClusters: function () { return cracks.length; },
    crackSignature: function () {                    // 形状指纹（探针 / 调试用）：把全部线段坐标折成一个整数
      var h = 0;
      for (var c = 0; c < cracks.length; c++) for (var i = 0; i < cracks[c].segs.length; i++) {
        var g = cracks[c].segs[i];
        h = (Math.imul(h, 31) + Math.round(g.x2 * 1e4) + Math.imul(Math.round(g.y2 * 1e4), 7)) | 0;
      }
      return h;
    },
    alertOn: function () { return alertT > 0; },
    setArenaFade: function (k) { arenaK = k < 0 ? 0 : k > 1 ? 1 : k; },
    arenaLevel: function () { return arenaK; },
    reset: function () { clearCracks(); gT = 0; gGrey = 0; gRed = 0; gLevel = 0; gNeg = false; cumDmg = 0; lastSev = 0; arenaK = 0; alertT = 0; lastHp = null; lastP = null; lastT = 0; }
  };
})();
