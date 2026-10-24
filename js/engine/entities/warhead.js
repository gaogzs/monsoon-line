(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.isHard = isHard; $.warheadK = warheadK; $.setTargetHitHandler = setTargetHitHandler; $.hitSurface = hitSurface; $.gunResistK = gunResistK; $.hitAny = hitAny; $.fuzeCheck = fuzeCheck; $.contactScan = contactScan; $.decoyTarget = decoyTarget; $.detonate = detonate; $.killMissile = killMissile; $.breakLock = breakLock; $.breakLockFor = breakLockFor;

  /* ============================================================
     加固目标与战斗部

     数据里带 `hard` 标签的设施（js/data/targets/）是**加固**的。对它们：
       penetrator（GUT-12）   全额伤害 —— 侵彻战斗部就是为这个造的
       cluster（子母 / 集束）  只剩 HARD_CLUSTER_K —— 破片啃不开混凝土
       其他战斗部              HARD_K
     ============================================================ */
  var HARD_K = 0.6, HARD_CLUSTER_K = 0.2;

  function isHard(t) {
    return !!(t && t.kind === 'target' &&
      (t.hard || (t.tags && t.tags.hard)));
  }

  function warheadK(w, t) {
    if (!w || !isHard(t)) return 1;
    if (w.tags.penetrator) return 1;
    return w.cluster ? HARD_CLUSTER_K : HARD_K;
  }

  /* 对设施 / 舰船结算伤害。game.js 会通过 setTargetHitHandler 注册它的
     hitTarget（击毁计数、无线电、误击调节单元的处罚都在那里）；
     没注册时（工具脚本里）退回最小实现。 */
  var targetHitHandler = null;

  function setTargetHitHandler(fn) { targetHitHandler = fn; }

  function hitSurface(tg, dmg, world, source) {
    if (!tg.alive) return;
    if (targetHitHandler) { targetHitHandler(tg, dmg, source); return; }
    tg.hp -= dmg;
    if (tg.hp <= 0) $.killGround(tg, world);
  }

  /* 机炮抗性系数：小口径航炮弹（bullet 且 cal ≤ SMALL_CAL）打在 ent 上的伤害倍率。
     导弹、炸弹、大口径炮弹不受影响 —— 抗性模拟的是"弹丸太小、对方太大太结实"。
     上限 0.999：再硬的东西也不该是完全无敌的。数值见 js/data/targets/ 的 gunResist。 */
  $.SMALL_CAL = 40;

  function gunResistK(ent, shot) {
    if (!shot || shot.kind !== 'bullet' || (shot.cal || 0) > $.SMALL_CAL) return 1;
    return 1 - M3.clamp(ent.gunResist || 0, 0, 0.999);
  }

  function hitAny(e, dmg, world, source, info) {
    if (e.kind === 'target') hitSurface(e, dmg, world, source);
    else $.damage(e, dmg, world, source, info);
  }

  /* 近炸 / 撞上的判定：在**最近的那一刻**起爆。

     每帧量一次"弹相对目标"的位置，上一帧到这一帧连成一条线段，
     求线段上离原点最近的那一点 —— 700 m/s 的弹一帧走 12 m，
     只看端点会从目标身边穿过去而判不到。

       最近点距目标表面 < CONTACT          直接撞上，当帧起爆，满伤
       < fuze，且最近点落在本帧内           相对距离已由减转增：在最近点起爆
       否则                                 记下这一帧，下一帧再看

     起爆点放在"目标当前位置 + 最近点的相对位置"：这样 blast 量到的
     弹目距离正好就是最近点距离。 */
  function fuzeCheck(m, t, world) {
    var rel1 = M3.sub(m.pos, t.pos);
    var rel0 = (m.fuzeRef === t && m.fuzeRel) ? m.fuzeRel : null;
    m.fuzeRel = rel1; m.fuzeRef = t;
    if (!rel0) return false;
    var d = M3.sub(rel1, rel0);
    var dd = M3.dot(d, d);
    var s = dd > 1e-9 ? M3.clamp(-M3.dot(rel0, d) / dd, 0, 1) : 1;
    var cp = M3.add(rel0, M3.mul(d, s));
    var r = t.kind === 'decoy' ? DECOY_R : Combat.radiusOf(t);
    var gap = M3.len(cp) - r;
    var isDecoy = t.kind === 'decoy';
    if (gap < Combat.CONTACT) {
      Combat.detonate(m, world, M3.add(t.pos, cp), isDecoy ? null : t);
      return true;
    }
    if (m.fuze > 0 && gap < m.fuze && s < 1) {
      Combat.detonate(m, world, M3.add(t.pos, cp), null);
      return true;
    }
    return false;
  }

  /* 碰炸与拟真近炸（所有弹通用：有制导与无制导都走这里）。

     对象只有 world.actors（飞机）与 world.targets（设施、舰船）。干扰弹的热焰 / 箔丝是粒子，
     诱饵云是挂在弹上的 m.decoy，都不在这两张表里，所以它们天然不会触发。

       碰炸  最近点距对象表面 < CONTACT，任何对象（敌我以外、中立也算）：满伤，直接命中。
       近炸  只对敌方飞机（中立与友机不触发）；需要：已解保（age ≥ FUZE_ARM_T）、
             最近点距离 < w.fuze、最近点落在本帧内、目标在引信锥内（不含正后方）。
             起爆点在最近点，不设 direct：伤害按 Combat.blast 的距离衰减。

     m.target 由 fuzeCheck 先管（它的近炸是对"自己的目标"的），这里跳过它。
     返回 true 表示本弹已经起爆。 */
  var FUZE_ARM_T = 0.6, FUZE_CONE = 110 * Math.PI / 180;

  function contactScan(m, dt, world) {
    if (!world || !m.alive) return false;
    var fz = m.w.fuze || 0;
    var lists = [world.actors || [], world.targets || []];
    for (var li = 0; li < lists.length; li++) {
      var L = lists[li];
      for (var i = 0; i < L.length; i++) {
        var e = L[i];
        if (!e.alive || e === m.owner || e === m.target || e.team === m.team) continue;
        var rel1 = M3.sub(m.pos, e.pos);
        var d = M3.mul(M3.sub(m.vel, e.vel || M3.V(0, 0, 0)), dt);
        var rel0 = M3.sub(rel1, d);
        var dd = M3.dot(d, d);
        var s = dd > 1e-9 ? M3.clamp(-M3.dot(rel0, d) / dd, 0, 1) : 1;
        var cp = M3.add(rel0, M3.mul(d, s));
        var r = Combat.radiusOf(e);
        var gap = M3.len(cp) - r;
        /* 粗筛：离得远到不可能在本帧碰上 / 近炸，就不做后面的运算 */
        if (M3.len(rel1) > M3.len(d) + r + Math.max(Combat.CONTACT, fz) + 20) continue;
        var hit = false;
        if (gap < Combat.CONTACT) {
          hit = true;                                   // 碰炸：任何对象
        } else if (fz > 0 && li === 0 && e.team !== 2 && m.age >= FUZE_ARM_T &&
                   gap < fz && s < 1) {
          /* 近炸：只看飞机，且要在引信锥内（弹头朝向目标那一侧，不含正后方） */
          var len = M3.len(cp);
          if (len > 1e-6) {
            var toE = M3.mul(cp, -1 / len);             // 弹 → 目标的方向
            hit = M3.angleBetween(m.fwd, toE) <= FUZE_CONE;
          }
        }
        if (!hit) continue;
        var at = M3.add(e.pos, cp);
        if (gap < Combat.CONTACT) Combat.detonate(m, world, at, e);
        else Combat.detonate(m, world, at, null);
        if (m.owner && m.owner.isPlayer) world.hitsLanded = (world.hitsLanded || 0) + 1;
        if (!world.silent && typeof SFX !== 'undefined' && SFX.hit) SFX.hit();
        return true;
      }
    }
    return false;
  }

  /* 盲飞期内追的那团诱饵云：外推位置 p + v × (age − t0)。
     云熄灭了、或者盲飞期已经结束（重新搜索 / 咬回真目标）就不再追。 */
  var DECOY_R = 4;

  function decoyTarget(m) {
    var dc = m.decoy;
    if (!dc || m.reLockT <= 0 || m.w.tags.unguided) return null;
    var tau = m.age - dc.t0;
    if (tau < 0 || tau > $.DECOY_LIFE) return null;
    if (!dc.ent) dc.ent = { kind: 'decoy', alive: true, pos: dc.p, vel: dc.v };
    dc.ent.pos = M3.add(dc.p, M3.mul(dc.v, tau));
    return dc.ent;
  }

  /* 兼容入口：t 是直接命中的单位（可为空）。所有起爆都走 Combat.detonate。 */
  function detonate(m, t, world) {
    Combat.detonate(m, world, null, t || null);
  }

  /* 弹体结束：hit = 撞上了东西。寿命到期也会起爆（Combat.blast） —— 以前是哑弹。 */
  function killMissile(m, world, hit) {
    if (!m.alive) return;
    if (world) { Combat.detonate(m, world, null, null); return; }
    m.alive = false;
  }

  /** 干扰弹：尝试把追踪本机的红外弹骗走 */
  function breakLock(a, world) { return breakLockFor(a, a, world); }

  /* 干扰弹的通用版：载机 a 投放，保护的是 protectee（a 自己，或编队里的长机）。
     对象是锁定 protectee 的来袭弹；欺骗概率按载机与 protectee 的距离衰减（600 m 外为 0），
     诱饵云从载机位置放出。自保时距离因子为 1，行为与原来完全一致。 */
  function breakLockFor(a, protectee, world) {
    if (a.flares <= 0 || a.flareCd > 0) return false;
    a.flares--;                      // 单位是"组"，一次投放一组诱饵
    /* 投放节奏。

       原来是 0.12 s —— 那等于"按住 V 就以每秒八组的速度连续丢"，
       而 `flares` 有 80 组：一枚已经咬住你的弹会在眨眼之间被
       反复掷骰，直到骗中为止。这既不像真的诱饵，也让来袭导弹
       失去了威胁。

       现在按**一次投放一次判定**来配节奏：
       0.45 s 的间隔给出一段可感知的"投放—观察—再投"的循环，
       而下面的抗欺骗机制保证这不会退化成"连点必脱锁"。 */
    a.flareCd = 0.45;
    /* 自保按原来的满音量；掩护投放按载机离玩家的距离衰减 */
    if (protectee === a) SFX.flare();
    else if (world.player) SFX.flareAt(M3.dist(a.pos, world.player.pos));

    var i;
    /* 热焰弹：橙黄色，烧得亮、掉得快。

       初速必须有一个明确的**向机体下方**的分量。原来只有
       "载机速度 ×0.35 + 随机方向"，而相机就在飞机正后方，
       于是整团火被机速带着往前、直接糊在镜头上。
       现在继承的机速比例降到 0.22，再沿机体下方抛出去 ——
       视觉上就是真正"投"下去的一组火球。 */
    /* 颜色与数量按"鲜艳的橙色"调：热焰是主体，箔丝只是退到背景的淡白丝。 */
    for (i = 0; i < 10; i++) {
      var dir = $.randUnit();
      var v = M3.add(M3.mul(a.vel, 0.22), M3.mul(dir, M3.rnd(26, 62)));
      v = M3.add(v, M3.mul(a.up, -M3.rnd(42, 78)));
      $.spawnParticle(world.particles, M3.add(a.pos, M3.mul(a.fwd, -6)), v,
        M3.rnd(1.3, 2.1), 1.1, '#ff8a1f', { grow: true, drag: 0.5, grav: 0.6 });
    }
    /* 箔丝（chaff）：淡白色的金属丝云，散得更开、下落更慢、停留更久。
       现代干扰弹是热焰弹与箔丝一起投放的 —— 前者骗红外，后者骗雷达，
       所以视觉上也该是两种东西，而不是一团橙色火光。

       尺寸比热焰弹小得多：它是丝，不是火球。上一轮把热焰弹从 2.2 缩到
       0.85 时漏掉了这里（1.25），结果丝团看着比火球还大。 */
    for (i = 0; i < 6; i++) {
      var cd2 = $.randUnit();
      var v2 = M3.add(M3.mul(a.vel, 0.28), M3.mul(cd2, M3.rnd(14, 44)));
      v2 = M3.add(v2, M3.mul(a.up, -M3.rnd(24, 48)));
      $.spawnParticle(world.particles, M3.add(a.pos, M3.mul(a.fwd, -5.5)), v2,
        M3.rnd(2.2, 3.4), 0.34, '#ffe2c4', { drag: 1.15, grav: 0.10, alpha: 0.6 });
    }

    var broke = 0, ineffective = 0;
    var distK = protectee === a ? 1 :
      Math.max(0, Math.min(1, 1 - M3.dist(a.pos, protectee.pos) / 600));
    for (i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.target !== protectee) continue;

      /* 干扰弹是**热焰弹 + 箔丝**一起投放的：
         前者骗红外导引头，后者骗雷达导引头 —— 两种都能被干扰。

         早先这里写的是"雷达制导不吃干扰弹"，那句话是错的，
         等于把箔丝当成了不存在的东西。

         **flare 字段本身就是"被干扰的概率"**：越小越难骗。
         这一点也曾经被理解反过 —— 公式写成 1 − flare·k，等于把
         「抗干扰改型」TOR-4（flare 0.24，全表最低）变成了最容易
         被骗的那一枚。数据一直是对的，是公式错了。

         现在按**导引头**分流，因为两种干扰弹骗的不是同一种东西：

             ir         → flare      热焰弹
             radar      → flareRD    箔丝（缺省回退 flare）
             eo / laser → 0          成像导引头，两种都骗不到

         `flareRD` 是一张补丁表（见 data.js 的 FLARE_RD）。它修的是
         设定 8.3 里那句"雷达导引头有多普勒滤波，能滤掉静止的箔丝回波，
         所以雷达弹整体比红外弹难骗"—— 在那张表出现之前，flare 值是
         逐个手调的、没有按导引头排序，于是**雷达弹反而平均更好骗**。
         数值现状与那句设定的矛盾到此为止。 */
      var chance;
      if (m.w.seeker === 'radar') {
        chance = m.w.flareRD !== undefined ? m.w.flareRD : m.w.flare;
      } else if (m.w.seeker === 'eo' || m.w.seeker === 'laser') {
        chance = 0;
      } else {
        chance = m.w.flare;
      }

      /* ---- 抗欺骗：同一枚弹，第二次投放就明显更难骗 ----

         只按 `flare` 掷一次骰的话，80 组诱饵在 0.12 s 的间隔下
         等于"必脱锁" —— 玩家连点几组就能把任何导弹打发掉，
         而诱饵本来应该是**争取一次脱离机会**的东西。

         所以每一枚弹记下自己被投过几次诱饵（`decoyTries`），
         每投一次成功率乘 0.62：一枚 65% 的弹依次是
         65% → 40% → 25% → 15%…… 要么第一两组就成功，
         要么就得靠机动而不是靠继续丢。

         这个计数器**不会因为一次成功而清零**：导引头一旦学会了
         这架飞机丢诱饵的方式，重捕获之后它不会再被骗第二次。 */
      m.decoyTries = (m.decoyTries || 0) + 1;
      var k = Math.pow(0.62, m.decoyTries - 1);
      // 地板：永远留一点希望，但不让"连投"变成必胜
      // （chance 为 0 的 —— 光电 / 激光制导 —— 不设地板，否则"完全免疫"其实有 3% 会被骗）
      chance = (chance > 0 ? Math.max(0.03, chance * k) : 0) * distK;
      if (!(Math.random() < chance)) {
        if (!m.spoofed) ineffective++;      // 已经被骗过的弹不再重复报
        continue;
      }

      /* 双导引头（BIN-9）：这一组只骗掉了其中一个，另一个还咬着。
         下一组再骗中才真正脱锁 —— 而那一组同样吃上面的抗欺骗递减。 */
      if (m.seekers > 1) {
        m.seekers--;
        ineffective++;
        continue;
      }

      m.target = null;
      m.seekerOn = false;
      m.lostTime = 1;
      /* 盲飞一段时间再允许重捕获 —— **不要**再用 reDone 兼职：
         那一位置同时被 `reAcquire`（雷达弹）和"刚被骗过"两种语义共用，
         结果一次诱饵就永久关掉了这枚弹的重捕获。见 makeMissile 的注释。 */
      m.reLockT = 1.4;
      m.spoofed = a;        // 记住是谁骗的：重捕获时优先避开它
      /* 骗走它的那一团诱饵云。它跟着载机的 0.22 倍速度往后、往下飘，
         亮 DECOY_LIFE 秒。盲飞期结束时它要是还亮着、还在视场里，
         没有记忆的导引头有一半原概率**再咬回这团云**（见 decoyRecheck）；
         带 decoyMemory 的（CLA-4）认得它，直接略过。 */
      m.decoy = {
        p: M3.clone(a.pos),
        v: M3.add(M3.mul(a.vel, 0.22), M3.mul(a.up, -40)),
        t0: m.age,
        p2: chance * 0.5,
        done: false
      };
      broke++;
    }
    /* 把"这组诱饵没起作用"告诉上层（玩家 HUD / 无线电）。
       返回值仍然表示**投放动作是否发生**，与命中数无关。 */
    a.decoysIneffective = ineffective;
    a.decoysBroke = broke;
    return true;
  }
})(Ent);
