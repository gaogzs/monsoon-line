/* ============================================================
   战斗部：近炸 / 爆炸伤害 / 爆炸特效

   所有弹头起爆都走这里（Combat.detonate → Combat.blast → Combat.blastFx）。
   以前的规则是"进了 prox+6 就打满伤害、只打一个目标"，躲导弹没有
   "擦伤"这回事。现在：

     fuze       近炸触发半径（m，测到目标表面）。0 = 只有撞上才起爆
     blast      爆炸半径（m，测到受害者表面）。0 = 无溅射
     blastCore  满伤半径（m）
     blastAir   false = 只伤地表（子母弹：子弹药往下撒，打不到天上）

   伤害按到受害者表面的距离二次衰减（falloffK），半径内**所有**非同队单位
   都吃 —— 中立的调节单元照样会被炸到，与子弹的 `team !==` 规则一致。
   近炸判定（最近点起爆）本身在 entities.js 的 stepMissile 里。

   依赖：M3、Ent（hitAny / warheadK / isRadiating / explode / spawnParticle）。
   在 entities.js 之后加载；Ent 里的起爆点在运行时才调用这里。
   ============================================================ */
var Combat = (function () {
  'use strict';

  /* 飞机的受击半径。scanShot 的子弹判定也用这个数 —— 两处要一致 */
  var HIT_R_AIR = 7.5;
  /* "撞上"的判据：最近点距目标表面不到这么多米就算直接命中，满伤 */
  var CONTACT = 1.5;

  /* 爆炸特效参数。尺寸全部从 blast / blastCore 推出来，不逐个武器配 */
  var BLAST_FX = {
    ballK: 0.35,         // 火球目视半径 = blast × ballK …
    ballMaxK: 0.5,       // … 但不超过 blast × ballMaxK、不小于 blastCore
    ballMin: 4,
    ballRef: 26,         // explode(scale 1) 的火球大约扩散这么远（初速 ≤58 m/s，阻力 2.2）
    fragDrag: 3.5,       // 破片阻力：最远飞行距离 = 初速 / 阻力 ≈ blast
    fragInherit: 0.3,    // 破片继承弹体速度的比例 —— 高速掠过时是拉长的椭球
    fragN: { light: 24, mid: 36, heavy: 56, ground: 40 },
    lodSoft: 650,        // 粒子数超过它：破片减半
    lodHard: 800,        // 超过它：只画火球
    lodFar: 6000,        // 距玩家超过它：破片减半
    lodCull: 12000       // 超过它：不画破片
  };

  /* 一件武器的战斗部参数。数据里没写新字段的（工具脚本里的假武器、
     旧存档里的东西）从 prox / cluster 推一个兼容值。 */
  function spec(w) {
    w = w || {};
    var fuze = w.fuze !== undefined ? w.fuze : (w.prox || 0);
    var blast = w.blast !== undefined ? w.blast : (w.cluster || (fuze ? fuze + 6 : 0));
    var core = w.blastCore !== undefined ? w.blastCore : (w.cluster ? blast : Math.min(2, blast));
    var air = w.blastAir !== undefined ? w.blastAir : !w.cluster;
    return { fuze: fuze, blast: blast, core: Math.min(core, blast), air: air };
  }

  /* 距离衰减：core 内满伤，之后按 (1 − x)² 掉到 R 处为零。
     二次：破片密度（∝ 1/面积）和单片能量同时随距离下降。 */
  function falloffK(d, core, R) {
    if (d <= core) return 1;
    if (d >= R) return 0;
    var x = (d - core) / Math.max(1e-6, R - core);
    return (1 - x) * (1 - x);
  }

  function radiusOf(e) {
    return e.kind === 'target' ? (e.radius || 8) : (e.hitR || HIT_R_AIR);
  }

  /* 起爆：弹体就地结束，按战斗部结算一片。
     shot   导弹或无制导弹（要有 team / owner / dmg / w）
     pos    起爆点（缺省为 shot.pos）
     direct 直接撞上的那个单位（满伤，不看距离）
     opt    { ground: 撞地 / 落水 } —— 只影响特效 */
  function detonate(shot, world, pos, direct, opt) {
    shot.alive = false;
    if (pos) shot.pos = M3.clone(pos);
    blast(world, shot.pos, shot, direct || null);
    blastFx(world, shot.pos, shot.w, {
      ground: !!(opt && opt.ground), vel: shot.vel, direct: direct || null
    });
    if (!world.silent && typeof SFX !== 'undefined' && SFX.boom) SFX.boom(0.75);
  }

  /* 面杀伤。半径内每个非同队单位按衰减吃伤害；返回被打到的单位数。 */
  function blast(world, pos, shot, direct) {
    var w = shot.w || {};
    var s = spec(w);
    var R = s.blast;
    var dmg0 = shot.dmg !== undefined ? shot.dmg : (w.dmg || 0);
    var n = 0;
    /* 直接命中的那个单位先结算 —— 它不一定在 world 的列表里（工具脚本、断言） */
    var lists = [direct ? [direct] : []];
    if (s.air) lists.push(world.actors || [], world.targets || []);
    else lists.push(world.targets || []);
    for (var li = 0; li < lists.length; li++) {
      var L = lists[li];
      for (var i = 0; i < L.length; i++) {
        var e = L[i];
        if (!e || !e.alive) continue;
        if (e.team === shot.team || e === shot.owner) continue;
        if (li > 0 && e === direct) continue;
        var k;
        if (li === 0) {
          k = 1;
        } else {
          if (R <= 0) continue;
          var r = radiusOf(e), d;
          if (s.air) {
            d = Math.max(0, M3.dist(e.pos, pos) - r);
          } else {
            /* 子母弹：子弹药是往下铺开的一片，按水平距离算覆盖，
               高度只做粗筛（目标在弹下方或略高都算）。 */
            var dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
            if (Math.abs(e.pos.y - pos.y) > R + r + 60) continue;
            d = Math.max(0, Math.sqrt(dx * dx + dz * dz) - r);
          }
          k = falloffK(d, s.core, R);
          if (k <= 0) continue;
        }
        var amt = dmg0 * k * Ent.warheadK(w, e);
        /* 反辐射弹对**正在辐射**的目标伤害翻倍 —— 它找的就是那部雷达 */
        if (w.tags.antiRadar && Ent.isRadiating(e)) amt *= 2;
        Ent.hitAny(e, amt, world, shot.owner, {
          weapon: w.name || w.id || null, kind: shot.kind === 'missile' ? 'missile' : 'blast'
        });
        if (e.isPlayer && typeof Renderer !== 'undefined' && Renderer.addShake) {
          Renderer.addShake(3 + 12 * k);
        }
        n++;
      }
    }
    /* 玩家的弹（导弹 / 炸弹）打中了东西：报 HIT（game.js 的 combatEvents）。机炮不走这里 */
    if (n && shot.kind === 'missile' && shot.owner && shot.owner.isPlayer && world.events) {
      world.events.push({ type: 'hit' });
    }
    /* 没被炸到、但就在旁边：也抖一下 —— 玩家要能感觉到"刚才那一发很近" */
    var pl = world.player;
    if (pl && pl.alive && R > 0 && typeof Renderer !== 'undefined' && Renderer.addShake) {
      var dp = M3.dist(pl.pos, pos) - HIT_R_AIR;
      if (dp > R && dp < R * 2.5) Renderer.addShake(2 * (1 - (dp - R) / (R * 1.5)));
    }
    return n;
  }

  /* ============================================================
     爆炸特效：小火球 + 球形破片壳
     画面不必和伤害完全一致，但要成比例 —— 玩家应该能从画面上
     读出"这一发炸多大"。见 docs/2-0IMPL.md 2.6。
     ============================================================ */
  function fibDir(i, n, hemi) {
    // Fibonacci 球面：比纯随机更像一个均匀膨胀的壳，也不会出现空洞
    var ga = Math.PI * (3 - Math.sqrt(5));
    var y = hemi ? 1 - (i + 0.5) / n : 1 - 2 * (i + 0.5) / n;
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    var th = ga * i + M3.rnd(-0.25, 0.25);
    return M3.norm(M3.V(r * Math.cos(th) + M3.rnd(-0.08, 0.08), y, r * Math.sin(th) + M3.rnd(-0.08, 0.08)));
  }

  function fragCount(s, ground) {
    var N = BLAST_FX.fragN;
    if (ground && s.blast >= 30) return N.ground;
    if (s.blast <= 16) return N.light;
    if (s.blast <= 30) return N.mid;
    return N.heavy;
  }

  function lodK(world, pos) {
    var k = 1;
    var np = (world.particles || []).length;
    if (np > BLAST_FX.lodHard) return 0;
    if (np > BLAST_FX.lodSoft) k *= 0.5;
    var pl = world.player;
    if (pl) {
      var d = M3.dist(pl.pos, pos);
      if (d > BLAST_FX.lodCull) return 0;
      if (d > BLAST_FX.lodFar) k *= 0.5;
    }
    return k;
  }

  function ballRadius(s) {
    var R = s.blast;
    var b = M3.clamp(R * BLAST_FX.ballK, s.core, R * BLAST_FX.ballMaxK);
    return Math.max(BLAST_FX.ballMin, b);
  }

  /* 一团"火球 + 破片壳"。delay：起爆时间错开（子母弹） */
  function burst(list, pos, s, n, hemi, inherit, delay) {
    var ballR = ballRadius(s);
    var scale = ballR / BLAST_FX.ballRef;
    var count = Math.round(M3.clamp(16 * Math.sqrt(scale), 10, 28));
    var first = list.length;
    Ent.explode(list, pos, scale, count);
    if (delay) for (var j = first; j < list.length; j++) list[j].delay = delay;
    var drag = BLAST_FX.fragDrag;
    var v0 = s.blast * drag;
    var life = Math.log(10) / drag;          // 速度衰减到约 10% 时熄灭
    for (var i = 0; i < n; i++) {
      var dir = fibDir(i, n, hemi);
      var v = M3.mul(dir, v0 * M3.rnd(0.9, 1.08));
      if (inherit) v = M3.add(v, inherit);
      Ent.spawnParticle(list, pos, v, life * M3.rnd(0.9, 1.1), M3.rnd(0.5, 1.2), '#fff2c0',
        { drag: drag, streak: true, delay: delay || 0 });
    }
  }

  function blastFx(world, pos, w, opt) {
    opt = opt || {};
    var list = world.particles;
    if (!list) return;
    var s = spec(w);
    var lod = lodK(world, pos);

    /* 动能杀伤（blast 0）：没有火球和破片壳，只有撞上那一下的白闪和碎屑 */
    if (s.blast <= 0) {
      if (!opt.direct) return;
      Ent.spawnParticle(list, pos, M3.V(0, 0, 0), 0.12, 6, '#ffffff', { grow: true });
      for (var q = 0; q < 10; q++) {
        Ent.spawnParticle(list, pos, M3.mul(Ent.randUnit(), M3.rnd(30, 90)), M3.rnd(0.2, 0.45),
          M3.rnd(0.3, 0.7), '#ffe6a0', { drag: 3, streak: true });
      }
      return;
    }

    var inherit = opt.vel ? M3.mul(opt.vel, BLAST_FX.fragInherit) : null;

    /* 子母弹：不画一个大球，在覆盖半径里错开起爆一片小爆点 */
    if (!s.air) {
      var nb = M3.rndInt(6, 10);
      var sub = { fuze: 0, blast: Math.max(8, s.blast * 0.22), core: 2, air: true };
      for (var b = 0; b < nb; b++) {
        var ang = M3.rnd(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * s.blast;
        var p = M3.V(pos.x + Math.cos(ang) * rr, Math.max(0.5, pos.y + M3.rnd(-4, 4)), pos.z + Math.sin(ang) * rr);
        burst(list, p, sub, Math.round(8 * lod), true, null, M3.rnd(0, 0.3));
      }
      return;
    }

    var hemi = !!opt.ground;
    burst(list, pos, s, Math.round(fragCount(s, hemi) * lod), hemi, hemi ? null : inherit, 0);

    /* 炮弹空爆（w.cal，舰炮）：战斗部只有几公斤，火球按比例小到看不见。
       补一下闪光 + 一团久留的黑灰烟 —— 对空射击时天上该是一团团的烟 */
    if (w && w.cal && !hemi && lod > 0) {
      var k = Math.sqrt(w.cal / 75);
      Ent.spawnParticle(list, pos, M3.V(0, 0, 0), 0.14, 3.5 * k, '#fff0c0', { grow: true, minPx: 4 });
      Ent.spawnParticle(list, pos, M3.V(0, 0, 0), 0.3, 2.2 * k, '#ff9a40', { grow: true, minPx: 2.5 });
      for (var sm = 0; sm < 3; sm++) {
        Ent.spawnParticle(list, M3.add(pos, M3.mul(Ent.randUnit(), 1.5 * k)), M3.mul(Ent.randUnit(), 2),
          M3.rnd(2.5, 4), M3.rnd(2.5, 3.5) * k, '#4a4642', { grow: true, drag: 0.8, grav: -0.4, alpha: 0.7, minPx: 2 });
      }
    }

    /* 落水：一根竖直水柱，高度约 0.6 × blast */
    if (hemi && pos.y <= Ent.groundY(pos.x, pos.z) + 1.5 && !Ent.isLand(pos.x, pos.z)) {
      var h = 0.6 * s.blast, vUp = Math.sqrt(2 * 9.8 * h);
      for (var c = 0; c < 12; c++) {
        Ent.spawnParticle(list, M3.V(pos.x + M3.rnd(-2, 2), 0.5, pos.z + M3.rnd(-2, 2)),
          M3.V(M3.rnd(-3, 3), vUp * M3.rnd(0.6, 1.05), M3.rnd(-3, 3)),
          M3.rnd(1.4, 2.2), M3.rnd(2, 4) * Math.max(1, s.blast / 30), '#dfeef5',
          { grow: true, grav: 9.8, drag: 0.3, alpha: 0.8 });
      }
    }
  }

  return {
    HIT_R_AIR: HIT_R_AIR, CONTACT: CONTACT, BLAST_FX: BLAST_FX,
    spec: spec, falloffK: falloffK, radiusOf: radiusOf,
    detonate: detonate, blast: blast, blastFx: blastFx
  };
})();
