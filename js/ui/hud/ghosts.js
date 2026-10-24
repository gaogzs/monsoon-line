(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawGhosts = drawGhosts; $.ghostStep = ghostStep; $.ghostBlips = ghostBlips; $.glitch = glitch;

  /* ============================================================
     电磁干扰下的假目标与身份乱码（docs/POST2-0IMPL.md 2.3b）

     纯显示层：假目标不进 world.actors / world.targets，不能被锁定、不能被击中，
     不影响 AI 与胜负。触发源与 2.3 的无线电乱码相同：玩家的 suppressed。

     · 假目标放在闪烁带 [clear, hide] 之内 —— 真目标在 hide 之外根本不画，
       假目标若出现在更远处会立刻露馅。区间取自 Ent.jamRanges（共用，不各抄一份）。
     · 闪烁带里画出的所有敌方目标框（真假一视同仁），型号 / 呼号两行换成同形状的随机乱码，
       第三行距离保持真实；进到 clear 以内真目标的身份才读得出来。
     · 全走私有 PRNG（mulberry32），不碰 Math.random，不进逻辑状态。
     ============================================================ */
  var GHOST_MAX = 8;              // k = 1 时同时存在的假目标数
  var GHOST_GLITCH_HZ = 4;        // 乱码刷新频率
  var FADE_IN = 0.3, FADE_OUT = 0.5;
  var JAM_MIN = 0.05;             // 与 Ent.JAM_MIN（radiation.js 私有）同值，也是 JAMMED 阈值

  var ghosts = [];
  $.ghosts = ghosts;
  var lastWorld = null, lastT = 0, seq = 0;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32(20780314);

  var CJK = '电磁战术链路雷达导弹目标编队航空火控频谱干扰平台指挥侦察空域任务信号数据';

  /* 同形状乱码：字母 → 字母，数字 → 数字，汉字 → 汉字，其余（连字符、空格、点）原样。
     step 按 GHOST_GLITCH_HZ 取整，phase 让每个框各自错开，避免整屏同步闪。 */
  function glitch(str, time, phase) {
    if (!str) return str;
    var step = Math.floor(time * GHOST_GLITCH_HZ + (phase || 0) * 7);
    var h = step * 2654435761;
    for (var i = 0; i < str.length; i++) h = (h ^ str.charCodeAt(i)) * 16777619;
    var r = mulberry32(h >>> 0), out = '';
    for (i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (/[A-Z]/.test(c)) out += String.fromCharCode(65 + Math.floor(r() * 26));
      else if (/[a-z]/.test(c)) out += String.fromCharCode(97 + Math.floor(r() * 26));
      else if (/[0-9]/.test(c)) out += String.fromCharCode(48 + Math.floor(r() * 10));
      else if (/[一-鿿]/.test(c)) out += CJK.charAt(Math.floor(r() * CJK.length));
      else out += c;
    }
    return out;
  }

  /* 一条假目标的身份：借真实机型表里的名字，呼号取"词-编号" */
  var WORDS = ['FLINT', 'ASHPOND', 'EMPTYWELL', 'SANDCREST', 'DRYGULLY', 'SILENTBELL', 'BALDRIDGE', 'OLDLOCUST'];

  function fakeIdentity() {
    var ac = AIRCRAFT[Math.floor(rng() * AIRCRAFT.length)];
    return {
      ac: { name: ac.name, cn: ac.cn },
      label: WORDS[Math.floor(rng() * WORDS.length)] + '-' + (1 + Math.floor(rng() * 4))
    };
  }

  /* 假目标的亮度：与真目标同一套闪烁（占空比随距离线性掉到 0），各有自己的相位 */
  function duty(g, k, p) {
    var r = Ent.jamRanges(k, false), d = M3.dist(p.pos, g.pos);
    if (d <= r.clear) return 1;
    if (d >= r.hide) return 0;
    return 1 - (d - r.clear) / (r.hide - r.clear);
  }

  /* 推进假目标：生成 / 漂移 / 渐隐。只读 world.time、玩家与敌机位置，不改任何逻辑状态。 */
  function ghostStep(world, p) {
    var t = world.time || 0;
    if (world !== lastWorld || t < lastT) { ghosts.length = 0; lastWorld = world; lastT = t; }
    var dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    var k = (p && p.alive) ? (p.suppressed || 0) : 0;
    var i, g;

    var r = k >= JAM_MIN ? Ent.jamRanges(k, false) : null;
    for (i = ghosts.length - 1; i >= 0; i--) {
      g = ghosts[i];
      g.pos = M3.add(g.pos, M3.mul(g.vel, dt));
      if (!g.dying) {
        var d = M3.dist(p.pos, g.pos);
        /* 干扰解除；飞出闪烁带（再不消失会和"真目标在 hide 之外不画"矛盾）；
           玩家飞近到快进 clear —— 都渐隐 */
        if (!r || d > r.hide || d < r.clear + 600 || t - g.born > g.life) { g.dying = true; g.tDie = t; }
      }
      if (g.dying && t - g.tDie >= FADE_OUT) ghosts.splice(i, 1);
    }

    if (!r) return;
    var want = Math.round(k * GHOST_MAX), live = 0;
    for (i = 0; i < ghosts.length; i++) if (!ghosts[i].dying) live++;
    if (live < want && rng() < dt * 1.5) {
      var near = [];
      for (i = 0; i < world.actors.length; i++) {
        var e = world.actors[i];
        if (e.alive && e.team === 1) near.push(e);
      }
      var az = rng() * Math.PI * 2;
      if (near.length) {            // 偏向真实敌方所在的半球（只用到位置，不用任何别的信息）
        var e0 = near[Math.floor(rng() * near.length)];
        az = Math.atan2(e0.pos.x - p.pos.x, e0.pos.z - p.pos.z) + (rng() - 0.5) * Math.PI * 0.9;
      }
      var dist = r.clear * 1.02 + rng() * 0.95 * (r.hide - r.clear * 1.02);
      var dy = (rng() - 0.5) * 2 * Math.min(1500, dist * 0.1);
      var hz = Math.sqrt(Math.max(0, dist * dist - dy * dy));
      var id = fakeIdentity(), sp = 5 + rng() * 15, hd = rng() * Math.PI * 2;
      ghosts.push({
        pos: M3.V(p.pos.x + Math.sin(az) * hz, Math.max(300, p.pos.y + dy), p.pos.z + Math.cos(az) * hz),
        vel: M3.V(Math.sin(hd) * sp, 0, Math.cos(hd) * sp),
        born: t, life: 2 + rng() * 4, dying: false, tDie: 0,
        jamPhase: rng(), ac: id.ac, label: id.label,
        kind: 'air', team: 1, alive: true, isGhost: true, id: seq++
      });
    }
  }

  function alphaOf(g, t) {
    var a = Math.min(1, (t - g.born) / FADE_IN);
    if (g.dying) a = Math.min(a, 1 - (t - g.tDie) / FADE_OUT);
    return Math.max(0, a);
  }

  /* 主屏幕：与真目标同一条绘制路径（drawPlainMark / drawOffscreen），闪烁用同样的占空比 */
  function drawGhosts(ctx, W, H, cam, p, world) {
    ghostStep(world, p);
    if (!ghosts.length) return;
    var t = world.time || 0, k = p.suppressed || 0;
    var offRect = $.offscreenRect(W, H, p);
    for (var i = 0; i < ghosts.length; i++) {
      var g = ghosts[i];
      var a = alphaOf(g, t);
      if (a <= 0) continue;
      if (((t * 1.7 + g.jamPhase) % 1) >= duty(g, Math.max(k, JAM_MIN), p)) continue;
      var s = M3.projectUnclamped(cam, g.pos);
      var dist = M3.dist(p.pos, g.pos);
      ctx.save();
      ctx.globalAlpha *= a;
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        $.drawOffscreen(ctx, W, H, cam, g, false, dist, false, offRect, false);
      } else {
        $.drawPlainMark(ctx, s, g, dist, false, { time: t, phase: g.jamPhase });
      }
      ctx.restore();
    }
  }

  /* 雷达：按真敌机同一规则加噪声（丢点概率 k × 0.55、抖动 k × 9 px），范围 12 km 内才有意义 */
  function ghostBlips(ctx, cx, cy, R, range, p, jam, world) {
    var t = world.time || 0;
    for (var i = 0; i < ghosts.length; i++) {
      var g = ghosts[i];
      if (alphaOf(g, t) <= 0.05) continue;
      if (jam > 0.02 && Math.random() < jam * 0.55) continue;
      var s = $.radarXY(p, g.pos, cx, cy, R, range);
      if (jam > 0.02) {
        var jr = jam * 9;
        s.x += (Math.random() - 0.5) * jr;
        s.y += (Math.random() - 0.5) * jr;
      }
      ctx.fillStyle = $.RED;
      $.enemyTri(ctx, s.x, s.y);
    }
  }
})(HUD);
