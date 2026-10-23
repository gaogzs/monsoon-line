(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.makeMissile = makeMissile; $.stepMissile = stepMissile;

  /* ============================================================
     导弹
     ============================================================ */
  function makeMissile(o) {
    var w = WEAPONS[o.weapon];
    var m = {
      kind: 'missile',
      team: o.team === undefined ? 0 : o.team,
      weapon: o.weapon,
      w: w,
      model: w.model || 'missile',
      alive: true,
      pos: M3.clone(o.pos),
      fwd: M3.norm(o.fwd),
      up: M3.V(0, 1, 0),
      right: M3.V(1, 0, 0),
      speed: o.speed || 120,
      /* 无动力弹的初速**必须在这里给**。

         有发动机的弹每帧都会用 vel = fwd × speed 重算速度，所以初始
         零向量无所谓。无动力弹的速度却完全靠 vel 自己累积 ——
         初值给 0 的话它是"从空中静止开始往下掉"，扔出去的动能全丢了。 */
      vel: (w.tags.ballistic || w.burn)
        ? M3.mul(M3.norm(o.fwd), o.speed || 120)
        : M3.V(0, 0, 0),
      target: o.target || null,
      age: 0,
      life: w.vsLife,
      dmg: w.dmg,
      turn: w.turn,
      /* 近炸：上一帧弹相对目标的位置（fuzeRel），以及它是对谁量的（fuzeRef）。
         换目标时要重新开始量，否则一帧之内会"瞬移"出一条假的最近点线段。 */
      fuze: Combat.spec(w).fuze,
      fuzeRel: null, fuzeRef: null,
      owner: o.owner || null,
      trailTimer: 0,
      /* 双导引头（BIN-9 `twinSeeker`）：一次诱饵只能骗掉其中一个，
         剩下的那个继续咬着 —— 要骗走这枚弹得连中两次。见 breakLock。 */
      seekers: w.tags.twinSeeker ? 2 : 1,
      /* 本机第一次进入定向能拦截包线时已经掷过骰（见 game.js 的 updateDEW）。 */
      dewRolled: null,
      seekerOn: true,
      lostTime: 0,
      /* 这一枚弹被同一次交战里的诱饵骗过几次。
         每投一组都会被记一次（不管骗没骗到）—— 见 breakLock。 */
      decoyTries: 0,
      /* 被诱饵骗走之后的"盲飞"时间。

         这一位取代了原来用 `reDone` 兼职的做法：那时 breakLock 把
         `reDone = true`，于是带 reAcquire 的弹**永久**失去重捕获能力，
         而 IR 弹那边靠 `m.spoofed` 永久排除骗过它的那一架 ——
         一次诱饵等于让这枚弹再也咬不到你。

         诱饵应该只买到**一段时间**，不是永久免疫。 */
      reLockT: 0,
      /* 出膛助推段（舰船发射器，4.3）：launchT 秒内强制无制导，沿出管方向飞；
         之后 pitchOver 期间转平，导引头视场暂不判丢失，直到第一次把目标转进视场。 */
      launchT: o.launchT || 0,
      pitchOver: (o.launchT || 0) > 0
    };
    /* 垂发时 fwd 竖直，和缺省 up 平行 —— 换一个水平的 up，免得基底退化 */
    if (Math.abs(m.fwd.y) > 0.95) m.up = M3.V(0, 0, 1);
    m.right = M3.cross(m.up, m.fwd);
    return m;
  }

  /* ============================================================
     红外导引头的自主寻的

     红外弹和雷达弹的根本差别：它不需要对方"被锁定"才能发现对方 ——
     它只是**看谁更热**。所以它可以盲射：出膛之后在自己的视场角里
     找一个热源咬上去。

     这也解释了为什么大离轴格斗弹值钱：TOR-6「环刃」的视场是 ±88°，
     机头都不用转过去；而基础弹只有 28°，得先把机头带过去。

     "更热"怎么算 —— 这里没有热力学模型，用三个现有量凑：
       ab         加力尾焰是最大的热源（3 倍权重）
       throttle   油门越大，尾喷温度越高
       phys.hp    机体越大，被照到的辐射面越大（大飞机更亮）

     再按离轴角和距离衰减：视场边缘、越远的目标越难咬住。
     ============================================================ */
  function irSignature(e) {
    var s = (e.ab ? 3.0 : 1.0) * (0.4 + (e.throttle === undefined ? 0.7 : e.throttle));
    var hp = (e.phys && e.phys.hp) ? e.phys.hp : 100;
    s *= 0.6 + hp / 300;
    return s;
  }

  /* 在导引头的视场与捕获距离内，挑"红外特征最明显"的那一架。 */
  function irAcquire(m, world) {
    var w = m.w;
    var cone = w.lockCone || 0.6;
    var maxD = (w.lockDist || 4000) * 1.5;
    var best = null, bs = 0;
    /* 对地 / 对海的红外弹（GUT-9、TUM-7）找的是**地面热源**，不是飞机。
       以前这里一律扫 world.actors —— 一枚滑翔锤丢了地面目标之后，
       会转头去追天上路过的敌机。现在对面弹只在 world.targets 里挑。 */
    if (w.target !== 'air') {     // 'any' 先看地面，没有再回落到下面的空中扫描
      var tl = world.targets || [];
      for (var j = 0; j < tl.length; j++) {
        var g = tl[j];
        if (!g.alive || g.team === m.team || g.team > 1) continue;   // 中立（team 2）谁都不认
        if (!$.weaponMatchesTarget(w, g)) continue;
        var tg = M3.sub(g.pos, m.pos);
        var dg = M3.len(tg);
        if (dg > maxD) continue;
        var og = M3.angleBetween(m.fwd, M3.mul(tg, 1 / Math.max(1, dg)));
        if (og > cone) continue;
        var sg = (0.6 + (g.radius || 10) / 30) * (1 - og / cone) / (1 + dg / 1500);
        if (sg > bs) { bs = sg; best = g; }
      }
      /* 对空对地通用（any）：地面热源没有就回落到空中，见下面 */
      if (w.target !== 'any' || best) return best;
    }
    var taken = m.salvo ? m.salvo.claimed : null;
    var best2 = null, bs2 = 0;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === m.team || e.team > 1) continue;   // 中立（team 2）谁都不认

      /* 骗过它的那一架：只在**盲飞期**内放过，之后照样可以重新咬住。
         以前这里是无条件 `continue` —— 一次诱饵 = 这枚弹永久咬不到你，
         而诱饵本该只买到一段时间（见 makeMissile 的 reLockT 注释）。 */
      if (e === m.spoofed && m.reLockT > 0) continue;

      var to = M3.sub(e.pos, m.pos);
      var d = M3.len(to);
      if (d > maxD) continue;
      var off = M3.angleBetween(m.fwd, M3.mul(to, 1 / Math.max(1, d)));
      if (off > cone) continue;                 // 不在导引头视场里
      var score = irSignature(e) * (1 - off / cone) / (1 + d / 1500);
      /* 齐射：兄弟弹已经咬住的目标排在后面 —— 视场里只剩它们时照样可以重复。 */
      if (taken && taken.indexOf(e) >= 0) {
        if (score > bs2) { bs2 = score; best2 = e; }
        continue;
      }
      if (score > bs) { bs = score; best = e; }
    }
    if (!best) best = best2;
    if (best && taken && taken.indexOf(best) < 0) taken.push(best);
    return best;
  }

  /* 盲飞期结束的那一帧：导引头重新睁眼，骗走它的诱饵云还亮不亮？

     还亮、还在视场里 → 没有记忆的导引头可能**再咬回那团云**（概率是
     当初被骗概率的一半），盲飞延长到云熄灭为止。每次被骗只判一次。
     带 `decoyMemory` 的弹（CLA-4）认得那团云，不会被它第二次骗走 ——
     它重新搜索时只看真目标。 */
  $.DECOY_LIFE = 2.6;

  function decoyRecheck(m) {
    var dc = m.decoy;
    dc.done = true;
    if (m.w.tags.decoyMemory) return;
    var tau = m.age - dc.t0;
    var remain = $.DECOY_LIFE - tau;
    if (remain <= 0.05) return;
    var cp = M3.add(dc.p, M3.mul(dc.v, tau));
    var to = M3.sub(cp, m.pos);
    var d = M3.len(to);
    if (d < 1) return;
    if (M3.angleBetween(m.fwd, M3.mul(to, 1 / d)) > (m.w.lockCone || 0.6)) return;
    if (Math.random() < dc.p2) m.reLockT = remain;
  }

  function stepMissile(m, dt, world) {
    if (!m.alive) return;
    var w = m.w;
    m.age += dt;
    /* 被诱饵骗走之后的盲飞计时；归零之后才重新允许捕获。
       递减必须发生在导引段**之前**，否则捕获分支永远读不到 0。 */
    if (m.reLockT > 0) m.reLockT -= dt;
    if (m.decoy && !m.decoy.done && m.reLockT <= 0) decoyRecheck(m);
    /* 寿命到期：在空中自爆（包括被电子干扰骗走、盲飞到期的弹）—— 以前是哑弹 */
    /* 无动力弹和火箭不按寿命自爆：重力迟早让它落地，动能耗尽砸偏也只是打空。
       有动力弹的滑翔段有 170 m/s 保底、不会自己落下，仍然要靠寿命收场。 */
    if (m.age > m.life && !w.tags.ballistic && !w.burn) { $.killMissile(m, world, false); return; }
    /* 被近防炮判定拦截（turret.js 4.7）：短暂延迟后空爆，并报一个事件给 HUD / 无线电 */
    if (m.ciwsKill > 0) {
      m.ciwsKill -= dt;
      if (m.ciwsKill <= 0) {
        m.intercepted = true;
        $.killMissile(m, world, false);
        if (world && world.events) world.events.push({ type: 'intercept', m: m, host: m.ciwsHost });
        return;
      }
    }

    // ---- 动力段 ----
    if (w.tags.ballistic || w.burn) {
      /* 无动力弹：出膛之后只剩重力和阻力。
         火箭（`w.burn`，PEJ-6）走同一条积分，只是前 burn 秒多一份沿弹轴的推力。

         以前它们和导弹走同一条路（speed 恒定、vel = fwd × speed），
         所以炸弹是"贴着机头平飞出去"的 —— 不加速也不下坠，
         完全不像扔出去的东西。现在它是一条真正的抛物线：
         初速来自载机，之后每一次下坠都由重力累积。 */
      m.vel.y -= $.G * dt;
      if (w.burn && m.age < w.burn) m.vel = M3.add(m.vel, M3.mul(m.fwd, w.boost * dt));
      var sp0 = M3.len(m.vel);
      if (sp0 > 1) {
        var rho0 = $.airDensity(m.pos.y);
        /* 滑翔弹的升力（`w.glide` = 升阻比）：垂直于速度、在铅垂面内向上，
           大小 = 升阻比 × 阻力加速度，封顶在 g·cosγ（刚好托住重力的法向分量，
           不会把弹往上拉）。高空稀薄升力小、先自由下落，进了稠密空气才滑得起来；
           速度越快动压越大、封顶越早到，滑得越远。 */
        var vh2 = m.vel.x * m.vel.x + m.vel.z * m.vel.z;
        /* 导引上一帧要往下修（目标在弹道下方）→ 卸掉升力（压低迎角），弹道变陡 */
        if (w.glide && vh2 > 1 && !m.glideOff) {
          var hs = Math.sqrt(vh2);
          var lift = Math.min(w.glide * $.BOMB_DRAG * rho0 * sp0 * sp0, $.G * hs / sp0);
          var lk = lift * dt / (hs * sp0);
          m.vel = M3.V(m.vel.x - m.vel.x * m.vel.y * lk, m.vel.y + hs * hs * lk, m.vel.z - m.vel.z * m.vel.y * lk);
        }
        // 阻力与动压同量级：低空稠密掉速快，高空稀薄掉得慢
        var dragK = $.BOMB_DRAG * rho0 * sp0;
        m.glideOff = false;
        m.vel = M3.mul(m.vel, Math.max(0.2, 1 - dragK * dt));
      }
      m.speed = M3.len(m.vel);
    } else {
      var powered = m.age < $.effectiveLife(w, m.pos.y);
      /* 高空专用弹（highAltImmune，SPO-9）的大舵面在稠密空气里是负担：
         低空加速慢、滑翔段掉速快。按相对密度插值 —— 两万米以上不受影响，
         海平面推力只剩 55%、滑翔阻力 ×1.6。这就是 desc 里那句
         "低空阻力大、加速慢"的落点。 */
      var rhoR = w.tags.highAltImmune ? Math.min(1, $.airDensity(m.pos.y) / $.RHO0) : 0;
      if (powered) {
        /* 速度上限：低空不再有加成（稠密空气里极速更低不更高），
           高空略高（最多 +10%，4–16 km 线性爬升） */
        m.speed = Math.min(m.speed + w.boost * (1 - 0.45 * rhoR) * dt,
          w.speed * (1 + 0.1 * M3.clamp((m.pos.y - 4000) / 12000, 0, 1)));
      } else {
        /* 滑翔掉速随空气密度：低空快、高空慢（highAltImmune 的低空惩罚
           已经包含在密度系数里，不再单列 rhoR 项） */
        m.speed = Math.max(m.speed - 140 * $.airDragK(m.pos.y) * dt, 170);
      }
    }

    // ---- 导引 ----
    var t = m.target;
    if (t && (!t.alive || t.dead)) { t = null; }

    if (w.tags.unguided) {
      /* 无制导：不找目标，也不做任何修正 ——
         出膛那一刻的指向就是它的一生。有 target 引用也当没有。 */
      m.target = null;
      t = null;
    }

    /* ---------- 红外弹的自主寻的 ----------

       出膛时没指定目标（玩家对着大概方向盲射），或者目标刚丢出视场，
       就在导引头的视场与捕获距离内重新挑一个**红外特征最明显**的。
       雷达弹不走这条路 —— 它得先有人把目标"锁定"给它。

       **盲飞期（`reLockT`）内不寻的**：那是诱饵买到的时间。
       这一条与下面雷达弹的重捕获共用同一个计时器。

       注意它跑在激光制导之前、制导段之前，所以这一帧挑中的目标
       当帧就能被修正。 */
    var boosting = m.launchT > 0;
    if (boosting) m.launchT -= dt;

    if (!boosting && w.seeker === 'ir' && (!t || !m.seekerOn) && m.reLockT <= 0 && world) {
      var acq = irAcquire(m, world);
      if (acq) {
        t = acq;
        m.target = acq;
        m.seekerOn = true;
        m.lostTime = 0;
      }
    }

    /* ---------- 激光制导：弹没有导引头，靠的是载机的照射 ----------

       **当前处于休眠状态** —— 没有任何武器在使用 seeker: 'laser'
       （PEJ-30 先改 eo 光电制导、5.3 起又改成无制导）。整段代码留着是因为机制本身是
       完整的、验证过的，将来要用直接给某件弹填上 'laser' 即可。

       原理：弹每一帧都去问投放它的那架飞机"你还在照着目标吗"。
       载机把机头转开、目标跑出照射锥，弹就立刻停止修正 ——
       但**不会消失**，它带着已有的速度和弹道继续往下掉，砸在哪算哪。
       这正是激光制导武器最真实的弱点：炸弹本身是瞎的。

       （写这段之前全项目只有 ir 和 radar 两种导引方式，
       "激光"只出现在文案里 —— 那时填个 'laser' 进数据也没人读。）
       ============================================================ */
    if (w.seeker === 'laser' && t) {
      var lit = false;
      var shooter = m.owner;
      if (shooter && shooter.alive) {
        var toSh = M3.sub(t.pos, shooter.pos);
        var dSh = M3.len(toSh);
        if (dSh > 1) {
          lit = M3.angleBetween(shooter.fwd, M3.mul(toSh, 1 / dSh)) < $.LASER_CONE;
        }
      }
      if (!lit) {
        m.laserLost = true;
        t = null;                 // 停止修正，继续自由落体
      } else {
        m.laserLost = false;
      }
    }

    /* 被诱饵骗走的盲飞期：把那团诱饵云当作虚拟目标继续追（见 decoyTarget），
       而不是直飞 —— 追上了就在云里起爆，爆炸照样会波及旁边的人。 */
    if (!t && world && !boosting) {
      var dcT = $.decoyTarget(m);
      if (dcT) { t = dcT; m.seekerOn = true; }
    }

    if (boosting) {
      /* 助推段：不导引、不重捕获，沿出管方向直飞 */
    } else if (t && m.seekerOn) {
      var toT = M3.sub(t.pos, m.pos);
      var dist = M3.len(toT);
      var los = M3.mul(toT, 1 / Math.max(1, dist));

      // 命中点预测（一阶提前量）
      var tGo = dist / Math.max(60, m.speed);
      var tvel = t.vel || M3.V(0, 0, 0);

      /* 导引品质（w.lead）：
         0 = 纯追踪，傻追着目标当前的位置，目标一横向机动就跟丢；
         1 = 完全预测，飞向解算出来的最优拦截点。

         这个系数比转弯率更能体现"这枚弹聪不聪明"：一枚转弯率一般
         但预测准的弹，打机动目标反而比一枚只会死咬尾巴的灵活弹更有效。 */
      var lead = (w.lead === undefined) ? 0.6 : w.lead;
      /* 目标的 ECM（机体 + 吊舱）压低预测品质：满值 ECM 把提前量砍掉 ECM_LEAD_K。 */
      if (t.ecm) lead *= 1 - $.ECM_LEAD_K * Math.min(1, t.ecm);
      var aim = M3.add(t.pos, M3.mul(tvel, tGo * lead));

      /* 高抛 / 攻顶弹道（`w.loft`，GUT-25、BOX-14）。

         水平距离还大于 `loft.dive` 时，瞄准点被抬到目标上方 `loft.alt` 米
         （不超过水平距离的 0.4 倍，免得近距发射也去爬高）——
         弹先爬升、平飞过去，进入末段才压头俯冲。只对水面 / 地面目标生效。 */
      if (w.loft && t.kind === 'target') {
        var hx = aim.x - m.pos.x, hz = aim.z - m.pos.z;
        var hd = Math.sqrt(hx * hx + hz * hz);
        if (hd > w.loft.dive) {
          aim = M3.V(aim.x, aim.y + Math.min(w.loft.alt, hd * 0.4), aim.z);
        }
      }
      var desired = M3.norm(M3.sub(aim, m.pos));

      /* 视场限制：目标偏出导引头视场视为丢失。

         视场取 max(±77°, 锁定锥)。以前写死 1.35 rad —— 于是 TOR-6
         （hobs，锁定锥 ±88°）在 77–88° 之间锁住的目标，出膛半秒就被判丢失，
         大离轴这项卖点在最需要它的那一段反而不成立。 */
      var fov = w.tags.hobs ? Math.max(1.35, w.lockCone || 0) : 1.35;
      var off = M3.angleBetween(m.fwd, los);
      /* 转平中：目标还在视场外是正常的，不算丢失 */
      if (m.pitchOver && off <= fov) m.pitchOver = false;
      if (off > fov && !m.pitchOver) {
        m.lostTime += dt;
        if (m.lostTime > 0.5) m.seekerOn = false;
      } else {
        m.lostTime = 0;
        /* 有些弹是专门为稀薄大气造的（舵面比同级大一倍），
           它们的过载不随空气变稀而崩塌 —— 在这个游戏里
           这就是"高空拦截弹"唯一说得通的定义，
           否则所有弹在上两万米之后都退化成同一种东西。 */
        var tf = $.turnFactor(m.pos.y);
        if (w.tags.highAltImmune) tf = Math.max(tf, 0.78);
        var maxTurn = m.turn * tf * dt;
        /* 偏差要在转之前量：转完之后再量，得到的是"还剩多少没转"，
           快对准时趋近零，转弯就几乎不花速度了。 */
        var want = M3.angleBetween(m.fwd, desired);
        var B = M3.turnToward(m.fwd, m.up, desired, maxTurn);
        m.fwd = B.fwd; m.up = B.up;
        m.right = M3.cross(m.up, m.fwd);
        var Bo = M3.orthonormalize(m.fwd, m.up);
        m.fwd = Bo.fwd; m.up = Bo.up; m.right = Bo.right;

        /* 无动力制导弹（GUT-9 滑翔锤）：修正的是**速度矢量**。

           以前这里只转了 m.fwd，而 ballistic 弹的位置靠 vel 积分、
           每帧末尾又把 fwd 掰回 vel 方向 —— 等于导引头算完了、舵面没动，
           "有制导"的炸弹其实全是自由落体。现在把 vel 转到新的 fwd 上、
           保持速率不变：能量仍然只来自投放初速与重力，弹翼只负责改方向。 */
        if (w.tags.ballistic && w.fin) {
          /* 带弹翼的无动力制导弹（`w.fin`）：弹翼产生受动压（ρ·v²）限制的
             侧向加速度，只改方向不加能量 —— 能量仍只来自投放初速与重力。

             有 glide（GUT-9 滑翔锤）与无 glide（PEJ-14 精确制导炸弹）在这里分道：
               · 有 glide：往上托只靠升阻比那份升力（有 g·cosγ 封顶），弹翼不能再
                 往上修，否则会变成第二份升力把抛物线掰成平飞 —— 往上只留横向分量，
                 往下修则卸掉升力（glideOff）。
               · 无 glide：没有升力可卸，弹翼就是全向的（上下左右都能修）。不限制
                 向上分量，否则弹一下压过头就"上拉不回来"，圈内目标打不中 ——
                 这恰恰是精确制导炸弹"能精确命中"的来由。 */
          var spv = M3.len(m.vel);
          if (spv > 1) {
            var vh = M3.mul(m.vel, 1 / spv);
            var dv = M3.sub(M3.mul(desired, spv), m.vel);
            var perp = M3.sub(dv, M3.mul(vh, M3.dot(dv, vh)));
            if (w.glide) {
              if (perp.y < 0) m.glideOff = true;
              else {
                var lat = M3.cross(vh, M3.V(0, 1, 0)), ll = M3.len(lat);
                perp = ll > 1e-3 ? M3.mul(lat, M3.dot(perp, lat) / (ll * ll)) : M3.V(0, 0, 0);
              }
            }
            var pl = M3.len(perp);
            if (pl > 1e-3) {
              var aFin = w.fin * ($.airDensity(m.pos.y) / $.RHO0) * (spv / 250) * (spv / 250);
              var dvFin = Math.min(pl, aFin * dt);
              var nv = M3.add(m.vel, M3.mul(perp, dvFin / pl));
              /* 修正同样耗速：诱导阻力 ≈ 实际侧向加速度 × FIN_BLEED。
                 按弹翼真正用了多少力算，不按机头转角 —— 机头永远追不上重力，
                 按转角算会让滑翔弹一路持续掉速。 */
              var spn = Math.max(0, spv - dvFin * $.FIN_BLEED);
              m.vel = M3.mul(nv, spn / Math.max(1, M3.len(nv)));
            }
          }
        } else if (w.tags.ballistic) {
          m.vel = M3.mul(m.fwd, M3.len(m.vel));
        }

        /* 转弯消耗动能。
           没有这一条，导弹的动力段之外照样能满过载无限机动，
           玩家的桶滚和 3/9 线规避全都没有意义 —— 因为对手不累。
           现在它必须为每一次急转付出速度。 */
        var used = Math.min(want, maxTurn) / Math.max(1e-5, dt);   // 实际转弯率 rad/s
        var load = M3.clamp(used / 3.0, 0, 1);
        if (!w.tags.ballistic) m.speed = Math.max(170, m.speed - load * 62 * $.airDragK(m.pos.y) * dt);
      }

    } else if (!t) {
      /* 无目标时：直线飞一会儿，然后按各自的规则重新捕获。

         两种导引头走两条路，但**共用同一个盲飞计时**：
           ir     → irAcquire（在视场与捕获距离里挑红外特征最明显的）
           radar  → 只有 reAcquire 型才重获（目前只有 CLA-4；SUT-11 / SUT-7
                    也带这个标记，但它们是红外弹，走的是上面那条）

         盲飞期内谁都别想重锁 —— 那正是诱饵买到的时间。 */
      m.seekerOn = false;

      // 红外弹：冷却结束就允许自主寻的（irAcquire 内部会按盲飞期跳过欺骗源）
      if (w.seeker === 'ir' && m.reLockT <= 0 && world) {
        var acq2 = irAcquire(m, world);
        if (acq2) {
          m.target = acq2;
          m.seekerOn = true;
          m.lostTime = 0;
          t = acq2;
        }
      }

      // 雷达弹：只有 reAcquire 型会重获，而且同样要等在盲飞期之后
      if (!t && w.tags.reAcquire && m.reLockT <= 0 && world) {
        var best = null, bd = 1e9;
        var rcone = w.lockCone || 0.6;
        for (var i = 0; i < world.actors.length; i++) {
          var e = world.actors[i];
          if (!e.alive || e.team === m.team || e.team > 1) continue;   // 中立（team 2）谁都不认
          /* 欺骗源在盲飞期后**可以被重新咬住** —— 只要它还在
             导引头的捕获距离与锁定锥内。这一条以前写成"永久跳过"，
             等于一次诱饵换来永久免疫。锥角限制是后加的：导引头只看得见
             弹头前方，不能捕获身后的东西。 */
          var d2 = M3.dist2(e.pos, m.pos);
          if (!(d2 < bd && d2 < 2600 * 2600)) continue;
          var dd = Math.sqrt(d2);
          if (dd > 1 && M3.angleBetween(m.fwd, M3.mul(M3.sub(e.pos, m.pos), 1 / dd)) > rcone) continue;
          bd = d2; best = e;
        }
        if (best) {
          m.target = best;
          m.seekerOn = true;
          m.turn = w.turn;
          m.lostTime = 0;
        }
      }
    }

    // ---- 位置 ----
    if (!w.tags.ballistic && !w.burn) m.vel = M3.mul(m.fwd, m.speed);
    m.pos = M3.add(m.pos, M3.mul(m.vel, dt));

    if (w.tags.ballistic || w.burn) {
      // 弹体顺着弹道走 —— 自由落体的炸弹是"跟着速度矢量"的，不是昂着头的
      var sp2 = M3.len(m.vel);
      if (sp2 > 1) {
        var Bb = M3.orthonormalize(M3.mul(m.vel, 1 / sp2), m.up);
        m.fwd = Bb.fwd; m.up = Bb.up; m.right = Bb.right;
      }
    }

    /* 近炸 / 撞上：按本帧的相对运动做线段最近点（见 fuzeCheck）。
       无制导弹不走这里 —— 它们的命中靠 game.js 的 scanShot。 */
    if (t && m.seekerOn && !w.tags.unguided && world && $.fuzeCheck(m, t, world)) return;
    /* 碰炸与拟真近炸：所有弹通用（见 contactScan），对象不包括干扰弹粒子 */
    if (world && $.contactScan(m, dt, world)) return;

    var gy = $.groundY(m.pos.x, m.pos.z);
    if (m.pos.y <= gy) {
      /* 撞地 / 落水：就地起爆。子母弹落地就是抛撒完成，按覆盖半径结算一片。 */
      if (world) { m.pos.y = gy; Combat.detonate(m, world, null, null, { ground: true }); }
      else m.alive = false;
      return;
    }

    /* ---- 尾迹：只有带发动机的才拉烟 ----

       这里必须按 **ballistic（无动力）** 判断，不能按 unguided（无制导）——
       两者是正交的，"没发动机"和"不找目标"根本不是一回事：

         PEJ-6 撒星    有发动机 / 无制导  → 拉烟（火箭当然有排气）
         GUT-9 滑翔锤  无发动机 / 有制导  → 不拉烟
         PEJ-30 铁蒺藜 无发动机 / 无制导  → 不拉烟
         PEJ-9 碎玉    无发动机 / 无制导  → 不拉烟

       之前按 unguided 判断，结果正好反了：火箭巢被当成纯炸弹不冒烟，
       而滑翔弹和激光制导炸弹一路拖着尾焰，看起来像有动力。 */
    if (w.tags.ballistic) return;

    m.trailTimer -= dt;
    if (m.trailTimer <= 0) {
      m.trailTimer = 0.012;
      var whitish = m.age < $.effectiveLife(w, m.pos.y);
      $.spawnParticle(world.particles, m.pos,
        M3.mul(m.vel, -0.02),
        whitish ? M3.rnd(0.30, 0.75) : M3.rnd(0.8, 1.7),
        M3.rnd(0.7, 1.5), whitish ? '#e8e2d0' : '#b9b4a6',
        { grow: true, drag: 1.4 });
    }
  }
})(Ent);
