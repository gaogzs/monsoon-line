(function (AI) {
  'use strict';
  var $ = AI.$;
  $.attach = attach; $.update = update;

  /* ============================================================
     创建 AI 状态
     ============================================================ */
  function attach(a, opt) {
    opt = opt || {};
    a.ai = {
      role: opt.role || 'enemy',
      skill: opt.skill === undefined ? 0.6 : opt.skill,
      mode: 'pursue',
      modeT: 0,
      evadeT: 0,
      msl: null,
      flareT: 0,
      flareBurst: 0,      // 这一串诱饵还剩几组没放
      shootT: 0,
      burstT: 0,
      ewResist: 0,        // 对敌方电子战的适应度（设定 7.3"对手也在学"）
      target: null,
      retargetT: M3.rnd(0, 1.2),
      formation: opt.formation || null,   // {lead, dx, dy, dz}
      wander: M3.rnd(0, 6.28),
      /* 默认指令是 focus（只打长机授权的目标），不是 spread。

         无人僚机的设定是"没有自主判断力"，所以"什么都没说"时必须
         落在最保守的那一档；spread 要由玩家按 1 显式下达。 */
      cmd: opt.cmd || 'focus'
    };
    return a.ai;
  }

  /* ============================================================
     每帧
     ============================================================ */
  /* ============================================================
     航线型单位（轰炸机之类）

     它们不参与空战：没有目标选择、没有追击、没有规避机动。
     整个行为由一条航线定义 —— 飞到点、做一件事、再飞走。

     这比"给它们写一套 AI"简单得多，也更贴合它们在战场上的角色：
     它们不是战斗单位，是**事件**。
     ============================================================ */
  /* 航线型干扰机的自动开机（missions.js 的 jammerRoute）：
     玩家一方任何单位（飞机或水面 / 地面目标）进入干扰半径 × trigK、
     吊舱没在开、冷却也好了 —— 开机。每 0.25 s 查一次就够。
     每一波持续 J.dur 秒，强度从 1 衰减到 J.fadeTo（openEcm 的 wave 选项）；
     一波结束后隔 J.rekey 秒重开，回到满强度 —— 玩家感觉到的是"刚缓过来又被压满"。
     不用吊舱自己的 cd（40 s）：随队干扰机的活就是持续压着。无线电只在第一次开机时报。 */
  function jamAuto(a, J, world, dt) {
    if (a.spActive > 0 || a.spCd > 0) return;
    J.t = (J.t || 0) - dt;
    if (J.t > 0) return;
    J.t = 0.25;
    var w = WEAPONS[J.wid];
    var R = (w.jamRadius || 9000) * (J.trigK || 1), R2 = R * R;
    var hit = false, i;
    for (i = 0; i < world.actors.length && !hit; i++) {
      var e = world.actors[i];
      if (e.alive && Ent.hostile(e, a) && M3.dist2(e.pos, a.pos) < R2) hit = true;
    }
    var tl = world.targets || [];
    for (i = 0; i < tl.length && !hit; i++) {
      if (tl[i].alive && Ent.hostile(tl[i], a) && M3.dist2(tl[i].pos, a.pos) < R2) hit = true;
    }
    if (!hit) return;
    Ent.openEcm(a, J.wid, J.skill, { wave: { dur: J.dur, to: J.fadeTo } });
    a.spCd = J.dur + J.rekey;
    if (!J.n && J.msg && world.radio) {
      world.radio.raw({ who: a.label || a.name, cls: 'enemy', tx: J.msg, gap: 0.9 });
    }
    J.n = (J.n || 0) + 1;
  }

  function updateRoute(a, dt, world) {
    var r = a.route;
    var ctrl = a.ctrl;
    /* 分段航线（route.js）：执行器先决定这一帧往哪飞、多高、要不要开火，
       写进 r.wp / r.alt —— 下面的转向和高度保持照旧。 */
    if (r.legs && Route.step(a, r, dt, world) === 'gone') return;
    if (!r.wp) return;

    /* 航点只管水平位置，高度另有 r.alt 管 —— 所以到点和转向都按**水平**算。

       以前这里用的是三维距离，而大多数航点写的是海平面（y: 0）：
       巡航在 11 km 的干扰机从航点正上方飞过，三维距离仍有 9.8 km，
       永远够不到 arrive（3 km）—— onArrive 从不执行，干扰机从不开机、
       轰炸机从不投弹、预警机从不换边，全在航点上空打转。
       转向也一样：三维方向在接近航点时几乎垂直朝下，会把飞机往海里拽。 */
    var to = M3.V(r.wp.x - a.pos.x, 0, r.wp.z - a.pos.z);
    var dist = M3.len(to);
    var desired = dist > 1 ? M3.mul(to, 1 / dist) : M3.norm(M3.V(a.fwd.x, 0, a.fwd.z));

    // 巡航高度保持 —— 航线给了高度，它只负责回到那上面
    // （航线高度 r.alt 按离地高度算：飞过高地时跟着抬起来）
    var aglA = Ent.agl(a);
    if (aglA < r.alt - 150 && desired.y < 0.10) {
      desired = M3.norm(M3.V(desired.x, 0.34, desired.z));
    } else if (aglA > r.alt + 150 && desired.y > -0.10) {
      desired = M3.norm(M3.V(desired.x, -0.28, desired.z));
    }

    if (r.jam) jamAuto(a, r.jam, world, dt);

    $.steerTo(a, desired, ctrl, a);
    a.throttle = 0.95;
    a.ab = false;

    // 撞地保护（它很笨，别让它一头扎进海里）
    if (aglA < 500 && a.fwd.y < 0) {
      $.steerTo(a, M3.norm(M3.V(a.fwd.x, 0.4, a.fwd.z)), ctrl, a);
    }

    /* 到点：执行该点的动作，然后转到下一段。
       最后一段飞完就自行消失 —— 轰炸机不会掉头回来再打一遍。 */
    if (!r.legs && dist < r.arrive) {
      if (r.wps) {
        /* 巡视型（管理局勤务机）：一串航点挨个飞、飞完从头再来，
           每个航点自带高度 —— 永不退场，和预警机一样。 */
        r.wpIdx = ((r.wpIdx || 0) + 1) % r.wps.length;
        r.wp = r.wps[r.wpIdx];
        r.alt = r.wp.y;
        if (r.onArrive) r.onArrive(a, world);
      } else if (r.loiter) {
        /* 盘旋型（预警机）。

           轰炸机是**事件**：飞到点、扔完弹、退场。
           预警机不是 —— 它得一直在那儿看着。所以在两个航点之间
           来回飞，永不退场；击落它是唯一让它消失的方式。 */
        var swap = r.wp;
        r.wp = r.exit;
        r.exit = swap;
      } else if (r.phase === 'ingress') {
        if (r.onArrive) r.onArrive(a, world);
        r.phase = 'egress';
        r.wp = r.exit;
        r.alt = r.exitAlt === undefined ? r.alt : r.exitAlt;
      } else {
        a.alive = false;
        a.escaped = true;      // 飞完航线离场，不是被击落：战报不给任何人记功
        return;
      }
    }

    /* 尾炮改由炮塔模块（turret.js）负责：ROK-40 的 mounts 里有一门 tail20，
       game.js 每帧对带 turrets 的飞机调 Turret.step —— 自己索敌、转动、开火，不影响航向。 */
    a.firingGun = false;
  }

  /* ---------- 实用升限：性能不够就别硬追 ----------

     极高空空气稀薄，动压 q = ½ρv² 掉到几千时，操控权限只剩百分之十几。
     实测把玩家钉在 20500 米 40 秒，追击的敌机会停在这样的状态：

         ROK-27   17785 m   188 m/s   q=5793   ctrlFactor 0.26
         VAC-14   17162 m   157 m/s   q=4061   ctrlFactor 0.18

     它们没失速，但也没能上去 —— 就悬在半空慢慢挪，咬不住人也甩不掉。
     原来的 AI 只知道"y > 19000 就别抬太高（压到 0.35）"，可它并不知道
     "再上去就没有机动能力了"，所以会一路硬顶。

     现在按机型给一条实用升限（ac.ceiling，见 data.js）：
       接近升限（差 1200 米）→ 不许再抬头
       已经超过           → 主动压回来

     于是敌人会留在自己还有机动能力的高度层周旋，等对方自己下来 ——
     这比让它僵在 18 公里更像"识趣的对手"。 */
  function clampCeiling(a, dir) {
    if (!dir) return dir;
    var ceil = (a.ac && a.ac.ceiling) || 16000;
    if (a.pos.y > ceil && dir.y > -0.08) {
      /* 已经超了：主动压回来 —— 而且**超得越多压得越狠**。

         固定 -0.22 在低动压高度是不够的：十七公里上舵效只剩三成，
         "想压平"这个愿望执行不出来，于是一架为了追高目标而爬上来的
         敌机会停在既咬不到人、也甩不掉人的高度 —— smoke.js 里有一条
         断言专门盯着这件事（判据是 ctrlFactor 而不是 q）。
         这里按超出量线性加强，最多到 -0.45。 */
      var over = Math.min(1, (a.pos.y - ceil) / 1500);
      return M3.norm(M3.V(dir.x, -0.22 - 0.23 * over, dir.z));
    }
    if (a.pos.y > ceil - 1200 && dir.y > 0.08) {
      // 接近升限：不许再抬头
      return M3.norm(M3.V(dir.x, 0.08, dir.z));
    }
    return dir;
  }

  function update(a, dt, world) {
    if (!a.alive || !a.ai) return;
    // 航线型单位完全不走下面那套
    if (a.route) return updateRoute(a, dt, world);
    var s = a.ai;
    var ctrl = a.ctrl;

    if (s.retargetT > 0) s.retargetT -= dt;
    if (s.modeT > 0) s.modeT -= dt;
    if (s.evadeT > 0) s.evadeT -= dt;
    if (s.shootT > 0) s.shootT -= dt;
    s.envClock = (s.envClock || 0) + dt;      // 发射包线缓存的时钟（见 aiEnvelope）
    if (s.burstT > 0) s.burstT -= dt;
    if (s.flareT > 0) s.flareT -= dt;

    /* ---- 雷达告警（RWR）：谁在用主动雷达锁定我 ----

       AI 的"被照射感知"，决定它会不会专门回头咬那个正在照它的人。

       它真正服务的是玩家的两件被动吊舱（GUS-6「明瞳」/ GUS-9「夜枭」）：
       装上之后你的锁定属于**被动测距**，不辐射，对方收不到告警，
       于是不会因为"被你盯上了"而优先来打你。设定里那句
       "你不开雷达，我也不开"说的就是这件事 —— 在这段代码之前，
       那两件吊舱的这句说明没有对应的机制。

       它依赖 `e.target`：AI 每帧把 s.target 写回 a.target
       （见 update() 末尾），否则这里读到的永远是 null。 */
    a.rwrT = 0;
    a.rwrSrc = null;
    for (var ri = 0; ri < world.actors.length; ri++) {
      var rg = world.actors[ri];
      if (!rg.alive || !Ent.hostile(rg, a) || rg === a) continue;
      if (rg.target !== a) continue;
      /* 玩家：锁满才算照射。只是选中、锁定环还在走，对方收不到告警 ——
         贴近了再锁，就是为了不让对方太早警觉。AI 之间仍按"选中即照射"。 */
      if (rg.isPlayer && !rg.locked) continue;
      if (rg.silentLock) continue;                 // 被动测距，不告警
      if (rg.emcon) continue;                      // 完全电磁静默，更不告警
      var rw = WEAPONS[rg.special];
      if (!rw || rw.seeker !== 'radar') continue;  // 只有主动雷达才告警
      a.rwrT = 0.6;
      a.rwrSrc = rg;
      break;
    }

    /* 对手也在学（设定 7.3）。

       敌方干扰机开着的时候，我方对它的适应度逐步上升 —— 于是同一台
       吊舱反复对你开机，压制窗口会一次比一次短。干扰机一关，适应度
       慢慢回落（换个人、换个频道，那个优势就回来了）。

       它消费在 fireAtTarget() 里：
       `resist *= 1 - t.ewPower * lockReduce * (1 - s.ewResist)`。 */
    var jammedBy = null;
    for (var ji = 0; ji < world.actors.length; ji++) {
      var je = world.actors[ji];
      if (je.alive && Ent.hostile(je, a) && je.ewPower > 0) { jammedBy = je; break; }
    }
    if (jammedBy) {
      s.ewResist = Math.min(1, (s.ewResist || 0) + dt * (0.18 + s.skill * 0.30));
    } else if (s.ewResist > 0) {
      s.ewResist = Math.max(0, s.ewResist - dt * 0.08);
    }

    /* ---------- 1. 威胁规避优先级最高 ---------- */
    var inc = $.findIncoming(a, world);
    if (inc) {
      s.mode = 'evade';
      s.evadeT = Math.max(s.evadeT, 0.55);
      s.msl = inc;
    } else if (s.mode === 'evade' && s.evadeT <= 0) {
      s.mode = a.hp < a.maxHp * 0.28 ? 'extend' : 'pursue';
    }

    /* ---------- 2. 血量过低脱离 ---------- */
    if (s.mode !== 'evade' && a.hp < a.maxHp * 0.25 && Math.random() < 0.004) {
      s.mode = 'extend';
      s.modeT = M3.rnd(4, 9);
    }
    if (s.mode === 'extend' && s.modeT <= 0) s.mode = 'pursue';

    /* ---------- 3. 选择目标 ---------- */
    if (s.role === 'drone') {
      /* 无人僚机没有判断力：目标来自**长机的授权**，
         而授权规则由僚机指令决定（1/2/3，见 codex「本作的表现形式：
         僚机指令」—— 那条说明是写给玩家的承诺，行为必须与它一致）：

           focus   打长机当前锁定的目标；长机没锁定时，打离自己 WING_FREE_R 内最近的敌机
                   （仍守在编队槽位上，不追出去）—— 默认档
           cover   优先打正在锁定长机的敌机；没有时打离**长机** WING_FREE_R 内最近的敌机；
                   再没有才退回长机目标
           spread  在编队附近自主接战（"扩大搜索扇面，自动接战"）

         另有一条凌驾于指令之上的规则：**数据链中断时降级为完全自主防御**。
         设定集与资料库都写了 —— 强对抗环境下数据链会被切断，
         此时无人机只能规避和自卫，不能主动攻击。
         压制来自干扰机辐射场打在它身上的 suppressed（见 entities.js）。 */
      var dLead = world.player;
      var leadOk = dLead && dLead.alive && dLead.target && dLead.target.alive;
      /* 只看僚机自己是否被压制。长机电磁静默或被压制只是下不了令，
         已有的授权照旧，僚机仍会按当前指令攻击。 */
      if (a.suppressed > 0.35) {
        s.target = null;                       // 自主防御：只规避，不开火
      } else if (s.cmd === 'spread') {
        s.target = $.nearestEnemy(a, world, 9000);
      } else if (s.cmd === 'cover') {
        s.target = $.leadThreat(a, world) ||
          (dLead && dLead.alive ? $.nearestEnemyTo(dLead.pos, a, world, $.WING_FREE_R) : null) ||
          (leadOk ? dLead.target : null);
      } else {
        // 长机阵亡时不自主接战（设定：无人机没有接管战局的能力，只会盘旋）
        s.target = leadOk ? dLead.target : (dLead && dLead.alive ? $.nearestEnemy(a, world, $.WING_FREE_R) : null);
      }
    } else if (s.retargetT <= 0 || !s.target || !s.target.alive) {
      s.retargetT = 0.35 + (1 - s.skill) * 0.9;
      if (s.role === 'wingman' && s.cmd === 'focus' && world.player && world.player.target) {
        s.target = world.player.target;
      } else if (s.role === 'wingman' && s.cmd === 'cover') {
        // 掩护：优先打正在锁定长机的敌机
        s.target = $.leadThreat(a, world) || $.nearestEnemy(a, world, 9000);
      } else {
        /* 被主动雷达照射时优先咬照射者 —— "谁在照我，我先打谁"。

           被动测距（silentLock）的对手不会走到这里，所以带一件
           GUS-6 / GUS-9 就能安静地锁定别人，而不把仇恨引到自己身上。 */
        if (a.rwrSrc && M3.dist2(a.rwrSrc.pos, a.pos) < 12000 * 12000) {
          s.target = a.rwrSrc;
        } else {
          s.target = $.nearestEnemy(a, world, s.role === 'wingman' ? 11000 : 15000);
          /* 空中没目标、手上却带着对面弹 → 去挑海面上的打。

             以前 AI 完全看不见 world.targets（nearestEnemy 只扫 actors），
             于是"敌机炸你的前进基地"这件事在代码里根本不存在 ——
             下游的随队攻击机只能是摆设。 */
          if (!s.target) s.target = $.surfaceTargetFor(a, world);
        }
      }
    }

    // 诱饵连放：一串放完（或放光）之后才开始 1.8 s 的决策冷却
    if (s.flareBurst > 0) {
      if (a.flares <= 0) {
        s.flareBurst = 0;
        s.flareT = 1.8;
        s.flareFor = null;
      } else if (a.flareCd <= 0 && (s.flareFor ? Ent.breakLockFor(a, s.flareFor, world) : Ent.breakLock(a, world))) {
        s.flareBurst--;
        if (s.flareBurst === 0) { s.flareT = 1.8; s.flareFor = null; }
      }
    }

    /* 掩护撒干扰弹（仅 COVER 指令下）：有导弹正锁定长机、进入 3600 m 的告警距离时，
       每架僚机对每枚来袭弹只掷一次骰（概率 0.6）；中了就固定连放 3 轮，不管骗没骗中。
       替长机挡的是**锁定长机的弹**，不是自己的。 */
    if (s.role === 'drone' && s.cmd === 'cover' && !s.flareBurst && a.flares > 0 &&
        a.flareCd <= 0 && world.player && world.player.alive) {
      var lead = world.player, rk = a.name || 'drone';
      for (var mi = 0; mi < world.missiles.length; mi++) {
        var lm = world.missiles[mi];
        if (!lm.alive || lm.target !== lead || lm.team === a.team) continue;
        if (M3.dist(lm.pos, lead.pos) >= 3600) continue;
        lm.coverRolled = lm.coverRolled || {};
        if (lm.coverRolled[rk]) continue;
        lm.coverRolled[rk] = true;
        if (Math.random() < 0.6) {
          s.flareBurst = 3;
          s.flareFor = lead;
          world.events.push({ type: 'wingflare', unit: a.name });
          break;
        }
      }
    }

    /* ---------- 4. 分派行为 ---------- */
    var desired;
    var throttle = 0.85, ab = false;

    if (s.mode === 'evade' && s.msl) {
      var r = $.evade(a, s.msl, world);
      desired = r.dir;
      throttle = r.throttle;
      ab = r.ab;
      /* 决定放诱饵时不是只丢一组，而是随机连放 2–5 组（每组之间
         由 breakLock 的 flareCd 隔 0.45 s）。只丢一组在现在的诱饵规则下
         几乎骗不到弹 —— 同一枚弹被反复投放会越来越难骗，
         但一组都没骗到就等于没放。连放的后续几组在下面统一处理，
         这样中途切出 evade 也会把这一串放完。 */
      if (s.flareT <= 0 && !s.flareBurst && a.flares > 0 && a.flareCd <= 0) {
        s.flareBurst = 2 + Math.floor(Math.random() * 4);
      }
    } else if (s.mode === 'extend') {
      // 向低威胁方向脱离，同时保持能量
      var away = $.nearestEnemy(a, world, 20000);
      if (away) desired = M3.norm(M3.sub(a.pos, away.pos));
      else desired = a.fwd;
      desired = M3.norm(M3.V(desired.x, 0.06, desired.z));
      throttle = 1; ab = true;
    } else if (s.role === 'drone') {
      /* 无人僚机永远待在编队里，不追出去。

         它的价值在于替长机挡导弹、探路、把导弹挂架打空 ——
         一旦追出去，这三件事就都做不成了。
         所以它的机动**只跟编队位置有关**，目标只用于决定何时开火。 */
      var dLead2 = world.player;
      if (dLead2 && dLead2.alive) {
        var sl = s.formation || { dx: 140, dy: 25, dz: -190 };
        /* 指令同时改变站位 —— 这是 codex 里"分开"与"靠拢"的落点：

             cover   收进到 55%（向你靠拢、贴上去）
             spread  外拉到 160%（分开，扇面摊得更宽）
             focus   保持原槽位

           无论哪一档都仍然待在长机附近，不追出去 —— 那三条价值
           （替长机挡弹、探路、把挂架打空）全建立在"不脱离"上。 */
        var ek = s.cmd === 'cover' ? 0.55 : (s.cmd === 'spread' ? 1.6 : 1);
        var wpD = M3.add(dLead2.pos,
          M3.add(M3.mul(dLead2.right, sl.dx * ek),
            M3.add(M3.mul(dLead2.fwd, sl.dz * ek), M3.V(0, sl.dy, 0))));
        desired = M3.norm(M3.sub(wpD, a.pos));
        /* 油门：按长机当前速度 + 前后偏差连续调（速度匹配），而不是"700 m 外开加力、以内固定 0.75"。
           ahead > 0：槽位在前面，要比长机快；< 0：冲过头了，要比长机慢。
           目标速度超过军推才开加力。以前长机一开军推它就慢慢掉队，掉到 700 m 外才猛追，忽远忽近 */
        var ahead = M3.dot(M3.sub(wpD, a.pos), dLead2.fwd);
        /* 偏差按到槽位的实际距离算：槽位不在身后就按距离加速，冲过头才减速。
           只看沿航向的分量的话，偏在侧面 / 高度上时目标速度就等于长机速度，永远收不回来 */
        var gap = M3.dist(wpD, a.pos);
        var err = ahead > -100 ? gap : -gap;
        var vWant = (dLead2.speed || 0) + M3.clamp(err * 0.25, -120, 260);
        var vMil = (a.phys && a.phys.vMil) * loadoutPenalty(Ent.curLoadFactor(a)).vMil || 400;
        ab = vWant > vMil * 0.98;
        throttle = M3.clamp(vWant / vMil, 0.25, 1);
        if (ab) throttle = 1;
      } else {
        /* 长机没了：原地盘旋到燃料耗尽。

           它不会接管战局，也不会自己选目标 —— 这不是能力问题，
           是它压根没有那套东西。设定里就是这么写的。 */
        var tan = a.right;
        var climb = a.pos.y < 3200 ? 0.12 : -0.05;
        desired = M3.norm(M3.V(tan.x, climb, tan.z));
        throttle = 0.6;
      }
    } else if (s.role === 'wingman' && (!s.target || s.cmd === 'spread')) {
      // 编队 / 巡航
      var lead = world.player;
      if (lead && lead.alive) {
        var slot = s.formation || { dx: 120, dy: 30, dz: -180 };
        var wp = M3.add(lead.pos,
          M3.add(M3.mul(lead.right, slot.dx),
            M3.add(M3.mul(lead.fwd, slot.dz), M3.V(0, slot.dy, 0))));
        desired = M3.norm(M3.sub(wp, a.pos));
        if (M3.dist(wp, a.pos) > 900) { throttle = 1; ab = true; }
        else throttle = 0.7;
        // 有空战机会时仍要接战
        if (s.target) { desired = $.leadTo(a, s.target); throttle = 0.95; ab = true; }
      } else desired = a.fwd;
    } else if (s.target && s.target.kind === 'target') {
      /* 对面目标：**保持高度**，只把机头转过去。

         不能走 pursue()：那是为空战写的，`leadTo` 会一路指向海面，
         飞机就一头扎下去 —— 而下面有"离地 420 m 强行拉起"的保护，
         结果是在目标上方反复俯冲-拉起，永远进不了投放包线。 */
      desired = $.approachSurface(a, s.target);
      throttle = 0.9; ab = false;
    } else if (s.target) {
      var res = $.pursue(a, s.target, world);
      desired = res.dir;
      throttle = res.throttle;
      ab = res.ab;
    } else {
      // 无目标：巡逻
      s.wander += dt * 0.25;
      desired = M3.norm(M3.V(Math.cos(s.wander), 0.02, Math.sin(s.wander)));
      throttle = 0.62;
    }

    if (!desired) desired = a.fwd;

    /* 所有分支都汇到这里，所以升限钳制放在这一处就够了 ——
       无论是追击、规避还是编队，都不会为了追人钻到没有机动能力的高度。 */
    desired = clampCeiling(a, desired);

    $.steerTo(a, desired, ctrl, a);

    /* 机头过高时的改出：不滚转，沿最短的方向把机头压回地平线。

       追高目标时敌机会以很大的仰角冲过升限。到了那个高度舵效只剩一成多，
       steerTo 又会同时打滚转 —— 而机头竖直时滚转只是原地打转，俯仰的方向
       跟着一直变，于是它 40 秒都压不下机头，以约 160 m/s 挂在 15 公里上
       （剩余推力大于重力，掉不下来）。以前这件事被关卡里的中立飞机掩盖了：
       敌机一直在低空追它，根本不会冲高。

       方向：正飞（up 朝上）就推杆，倒飞就拉杆 —— 两种都是机头直接朝下。
       一律拉杆会翻过顶点，在一成多的舵效下要转一百多度，40 秒都翻不完。

       要有记忆：只在阈值上判断会在线附近来回摆 —— 压到线下，steerTo 接管
       又抬回去。一旦开始改出，就压到机头低于 0.2 才交还。 */
    if (a.fwd.y > 0.5 && desired.y < 0.3) s.vertRecover = true;
    if (s.vertRecover) {
      if (a.fwd.y < 0.2) s.vertRecover = false;
      else { ctrl.pitch = (a.up.y >= 0) ? -1 : 1; ctrl.roll = 0; }
    }

    // 硬性保护：撞地前强行拉起
    if (Ent.agl(a) < 420 && a.fwd.y < 0.05) {
      desired = M3.norm(M3.V(a.fwd.x, 0.5, a.fwd.z));
      $.steerTo(a, desired, ctrl, a);
      throttle = 1; ab = true;
    }

    a.throttle = throttle;
    a.ab = ab;

    /* 把 AI 的选择写回 actor 的公开字段。

       世界里的其它部分一直在读它：HUD 的"谁在照射我"（RWR 环）、
       僚机的掩护判定（leadThreat）、以及 AI 之间的相互感知。
       少了这一行，那些地方全都静默失效 —— 它们不报错，
       只是永远看不到东西。 */
    a.target = s.target;

    /* ---------- 5. 开火 ---------- */
    if (s.mode === 'evade' || s.mode === 'extend') {
      a.firingGun = false;
      return;
    }
    var t = s.target;
    if (!t || !t.alive) { a.firingGun = false; return; }

    // 侦察 / 播撒构型在受损前不主动接战
    if (a.behavior === 'recon' && a.hp >= a.maxHp * 0.88) {
      a.firingGun = false;
      return;
    }

    var toT = M3.sub(t.pos, a.pos);
    var dist = M3.len(toT);
    var losDir = M3.mul(toT, 1 / Math.max(1, dist));
    var off = M3.angleBetween(a.fwd, losDir);

    // --- 机炮 ---
    /* 没有机炮的机型是合法的（预警机、勤务机、重型轰炸机在数据里是
       `gun: null`）。没有炮只跳过机炮这一段，**不能 return** ——
       以前这里直接读 `WEAPONS[a.gun].range`，一架没有炮的飞机只要
       走到开火段就会抛异常；后来改成 return，又把下面的导弹段一起截掉了：
       M5 的巡航弹载机、M8 的轰炸机挂着弹却一发都没打出去过。 */
    var gunW = WEAPONS[a.gun];
    a.firingGun = false;
    if (gunW) {
      var gunRange = (a.pos.y > 18000 ? gunW.highRange : gunW.range);
      var gunCone = 0.028 + (1 - s.skill) * 0.02;
      a.firingGun = (dist < gunRange * 0.9 && off < gunCone * 3.2 && a.gunAmmo > 0);
    }
    if (a.firingGun) {
      Ent.fireGun(a, world);
      /* 别人开火的声音。

         以前只有玩家自己的机炮有音效，AI 打出去的子弹是**无声**的 ——
         而它们通常在视线的侧后方，于是玩家会以为"敌人从来不开炮"。
         实测 AI 每 30 秒开火约 490 次，多数就是被这样忽略掉的。

         gunShotAt 内部做了采样节流：这里每秒会被调用六十多次。 */
      if (world.player) SFX.gunShotAt(M3.dist(a.pos, world.player.pos));
    }

    // --- 导弹 / 对面弹 ---
    /* 开火前挑一件：先看目标类别（对空 / 对面），再看射程 ——
       够得着的里面取**射程最短**的那件（用远距弹打近目标，等于把一场
       只有几发的重弹浪费在格斗距离上）。挑中谁，`a.special` 就是谁：
       这就是"AI 换武器"的全部 —— 没有独立的选弹状态，只有这一次挑选。
       规则见 entities.js 的 chooseWeapon()。

       注意这里**不再**用 dist < 7200 一刀切：那是对空弹时代的写法，
       远距弹（CLA-17 的 12.5 km）与对地弹的投放包线差了好几倍，
       够不够得着由每件武器自己的 lockDist 判。 */
    var pick = Ent.chooseWeapon(a, t, dist);
    if (pick) {
      Ent.setWeapon(a, pick);
      var spW = WEAPONS[pick];
      if (s.shootT <= 0 && a.spAmmo > 0 && a.spCd <= 0) {
        var cone = spW.lockCone;
        // 高空时导引头视场收窄
        if (a.pos.y > 18000) cone *= 0.8;
        // 越高越难锁定（动压不足）
        var lockK = 1 - Math.min(0.25, Math.max(0, (a.pos.y - 15000) / 40000));
        /* 目标的反锁定条件有两个来源：

           1. 被动吊舱（拖曳诱饵 / 静默）—— 常驻，取 lockResist
           2. 主动电子战（ZUN-4「回声」）—— 正在干扰**且本弹是雷达制导**时
              锁定距离被压缩。红外弹打的是点源热信号，不吃雷达干扰。

           还有"对手也在学"这一层：ai.ewResist 是这名飞行员对同一台
           干扰机的适应程度，越高，同样的压制越不管用。 */
        var resist = (t && t.lockResist) ? (1 - t.lockResist) : 1;
        if (t && t.ewPower > 0 && spW.seeker === 'radar') {
          resist *= (1 - t.ewPower * (t.ewLockReduce || 0) * (1 - (s.ewResist || 0)));
        }
        /* 自己被干扰机压制（suppressed，友军敌军都一样）：只能锁"看得清"的距离以内的目标
           （Ent.jamLockOK，与玩家同一套门槛），锁定距离最多减半。 */
        var jamK = Ent.jamLockK(a);
        /* 射程取 min(锁定距离, 有效射程 × 0.9)（Ent.aiReach）：以前只看 lockDist，
           BOX-14、SPO-6 这类弹会在"锁得上但飞不到"的距离上开火。 */
        /* 对面弹按"本机高出目标多少"查射程（目标不在海平面时，不能拿海拔当投放高度） */
        var reachAlt = Ent.targetClass(spW, t) === 'surface' && spW.target !== 'air' && t.kind === 'target'
          ? Math.max(0, a.pos.y - t.pos.y) : a.pos.y;
        var okDist = dist < Ent.aiReach(spW, reachAlt) * lockK * resist * jamK && Ent.jamLockOK(a, t);
        /* 离轴角按武器分：对空弹三维夹角，对面弹只看水平方位（Ent.lockOff）—— 世界垂直方向不算 */
        var okAng = Ent.lockOff(a, t, spW) < cone * 0.85;
        /* 最小发射距离。对面目标给得比空中小目标保守一点：
           贴得太近，滑翔弹/炸弹的引信来不及开。 */
        var minR = spW.nezer ? 1400 : (t.kind === 'target' ? 1200 : 700);
        /* 锁定本身也更难：玩家那边是锁定速度变慢，AI 没有锁定进度条，折成开火意愿 */
        /* 动态射程：只对制导弹卡（炸弹、火箭靠它们自己的落点标记）。便宜的闸门先过，
           才去算包线。高 skill 要求进 nez（目标掉头逃也能打中），低 skill 进 rmax。 */
        var envOK = true;
        if (okDist && okAng && dist > minR && spW.seeker && spW.seeker !== 'none' && !spW.tags.unguided && !spW.tags.passive) {
          var env = $.aiEnvelope(a, s, spW, pick, t);
          var lim = Math.min(spW.lockDist || Infinity, s.skill >= 0.6 ? env.nez : env.rmax);
          envOK = dist < lim * (t.kind === "target" ? $.AI_RANGE_MARGIN_SURF : $.AI_RANGE_MARGIN_AIR);
        }
        if (okDist && okAng && envOK && dist > minR && Math.random() < (0.35 + s.skill * 0.45) * jamK) {
          if (world.fireMissile) world.fireMissile(a, t);
          s.shootT = M3.rnd(2.6, 5.2) * (1.6 - s.skill * 0.6);
        }
      }
    }
  }
})(AI);
