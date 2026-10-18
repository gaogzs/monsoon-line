/* ============================================================
   HUD 全屏滤镜：电子战干扰 + 受伤闪红

   两种效果都画在整套 HUD 之上，但都是**轻**的 —— 最强的时候
   也只是给画面蒙一层，仪表、目标框、告警照样读得清。

   干扰（jam）
     强度 = max(suppressed, ewPower × 0.8)，与雷达雪花同一个"脏度"。
     三层：缓慢下行的扫描线带、细密的静电噪点、偶尔一闪的横向撕裂线。
     噪点是一张预渲染的小图，每帧随机平移重复铺开，不逐像素画。

   受伤（hurt）
     不改 Ent.damage：每帧比较玩家 hp，掉了多少就是这一下的伤害。
     单次伤害占满血的比例越大，红色越重；很快退掉（HURT_DECAY）。
     告警栏的"受损警告"由 alertOn() 提供，退得比红色稍慢。

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
    hurtPerHp: 3.2,        // 单次掉血占满血的比例 × 这个数 = 红色强度
    hurtMin: 0.18,         // 再小的一下也要能看出来
    hurtEdgeA: 0.42,       // 强度 1 时屏幕边缘的红色不透明度
    hurtCenterA: 0.06,     // 强度 1 时屏幕中央的红色不透明度 —— 准星附近几乎不挡
    hurtDecay: 2.2,        // 每秒退多少强度：满强度约 0.45 s 退完
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
  var hurtK = 0;           // 当前红色强度 0..1
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
    if (p !== lastP) { lastP = p; lastHp = p.hp; hurtK = 0; alertT = 0; return dt; }
    if (p.alive && lastHp !== null && p.hp < lastHp - 1e-6) noteDamage(lastHp - p.hp, p.maxHp || 100);
    lastHp = p.hp;
    hurtK = Math.max(0, hurtK - FX.hurtDecay * dt);
    alertT = Math.max(0, alertT - dt);
    return dt;
  }

  /* 单次伤害：占满血比例越大越重。叠加取较大值，不累加 —— 机炮连击不会糊成一片红。 */
  function noteDamage(amt, maxHp) {
    var k = M3.clamp(FX.hurtMin + (amt / Math.max(1, maxHp)) * FX.hurtPerHp, FX.hurtMin, 1);
    hurtK = Math.max(hurtK, k);
    alertT = FX.alertHold;
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

  function drawHurt(ctx, W, H, k) {
    if (!ctx.createRadialGradient) return;
    var r0 = Math.min(W, H) * 0.32, r1 = Math.hypot(W, H) * 0.55;
    var g = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
    g.addColorStop(0, 'rgba(200,20,20,' + (FX.hurtCenterA * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(200,20,20,' + (FX.hurtEdgeA * k).toFixed(3) + ')');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* HUD.draw 的最后调一次。画到叠加层上；拿不到叠加层（工具脚本）就画在传进来的 ctx 上。 */
  function draw(ctx, W, H, p) {
    if (!p) return;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    step(p, now);
    var j = jamLevel(p);
    var on = j > FX.jamMin || hurtK > 0.01;
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
    if (hurtK > 0.01) drawHurt(g, W, H, hurtK);
    if (g !== ctx) setBlur(j > FX.jamMin ? FX.jamBlur * Math.min(1, j) : 0);
  }

  return {
    FX: FX, draw: draw, step: step, noteDamage: noteDamage, jamLevel: jamLevel, beginFrame: beginFrame,
    hurtLevel: function () { return hurtK; },
    alertOn: function () { return alertT > 0; },
    reset: function () { hurtK = 0; alertT = 0; lastHp = null; lastP = null; lastT = 0; }
  };
})();
