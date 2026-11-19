(function (AI) {
  'use strict';
  var $ = AI.$;
  $.attach = attach; $.update = update; $.gTrack = gTrack;

  /* ============================================================
     创建 AI 状态
     ============================================================ */
  function attach(a, opt) {
    opt = opt || {};
    a.ai = {
      temperament: opt.temperament || null,   // aggressive / cautious / sniper / loyal（skill.js TEMPER）；缺省中性
      role: opt.role || 'enemy',
      skill: opt.skill === undefined ? (opt.rank && RANKS[opt.rank] ? RANKS[opt.rank].skill : 0.6) : opt.skill,
      rank: opt.rank || null,
      rs: $.seedRng(),     // 私有随机流（skill.js）
      aim: { x: 0, y: 0 }, // 机炮准星偏移（OU 漂移）
      aimFor: null,        // 偏移当前针对的目标（变了就重抽）
      gunT: 0,             // 机炮反应计时（持续式）
      strafe: false,       // 扫射状态（带滞回）
      missT: 0,            // 导弹反应计时（持续式）
      flareReact: 0,       // 干扰弹首发的反应计时（登记式）
      lostT: null,         // 目标丢失后的换目标反应计时（null = 没在等）
      furT: 0,             // 与目标缠斗（< 1800 m）累计时间；缠斗太久就脱离重来（Director，$.DIR.T_FURBALL）
      standT: 0,           // 在外围游走（standoff）里待了多久
      closeT: 0,           // 回头近战（closeIn）里待了多久
      standCool: 0,        // 冷却：closeIn 之后这么久不再进 standoff
      orbit: 1,            // standoff 绕圈方向（±1）
      ringR: 0,            // standoff 的环半径
      wclass: null,        // 武器分类：longRange / shortRange / gunOnly
      illum: null,         // 半主动弹的照射状态 {missile, target, w, abandoned}（updateIllum）
      lowStrike: false,    // 低空突防中（跳过近地保护，$.skimDir 自己守 80 m 下限）
      blackT: 0, gT: 0, pDir: null,   // 过载 / 视野变窄（gTrack）
      incId: null, incWait: 0, incDelay: 0, lostX: 0, lostXSet: false,   // 人为失误（skill.js misjudgeT / lostExtra）
      fm: opt.fm || null,            // 巡航队形 {mode, lead, idx}（coord.js）
      jamAway: null, jammer: null, helpT: 0, escortT: null, escortOK: null,
      ward: opt.ward || null,        // 护航：被护卫者（loyal 性格的 leash 参照）
      jam: opt.jam || null,          // 自由飞行的干扰机（v3.6.2）：{ wid, skill, trigK, dur, fadeTo, rekey, msg }；跟着 ward 走，进范围自动开吊舱，不主动接战
      lastKnown: null, lostSightT: 0, searching: false,   // 态势记忆（memory.js）
      subrole: null,       // 'bait' / 'flank'（Director 给成对的 skill>=0.6 敌机分配）
      flankSide: 1,
      psmAI: null,         // AI 过失速机动 {kind: counter|break, src, t}（ai/psm.js）
      psmCd: 0, psmEval: null, psmSeen: false,
      fake: null,          // 假撤退 {t, dur, from}（retreat.js）
      fakeBoostT: 0,
      umbT: 0,
      retreating: false,   // 撤离中（retreat.js；mission.retreat 为 'on' 才会置真）
      evalT: 0,            // 撤离评估倒计时（事件之后 RETREAT.EVAL_DELAY 秒评估一次）
      retreatCd: 0,        // 评估没中之后的冷却
      mode: 'pursue',
      modeT: 0,
      evadeT: 0,
      evPlan: null, evT: 0, evFor: null, evTerm: false, evSide: 1, evFlip: 0, evPhase: 0, evadePlanShown: null,     // 甩脱来袭弹的策略状态（evade.js）
      msl: null,
      flareT: 0,
      flareBurst: 0,      // 这一串诱饵还剩几组没放
      shootT: 0,
      longT: 0,
      overT: 0,
      tailT: 0, tailSide: 0, tailFlip: 0, tailPlan: null, planT: 0, holdPlan: null,
      counterT: 0, counterFor: null, reversals: 0, planPhase: 0, planClock: 0, tailChaser: null,     // 转守为攻（tactics.js $.counterStep）     // 被咬尾计时 / 摆脱转向侧（tactics.js $.shakeTail）
      overCd: 0,
      burstT: 0,
      ewResist: 0,        // 对敌方电子战的适应度（设定 7.3"对手也在学"）
      target: null,
      retargetT: M3.rnd(0, 1.2),
      formation: opt.formation || null,   // {lead, dx, dy, dz}
      /* 长机（僚机—长机关系，docs/POST2-0IMPL.md 批次 4.2）：有长机的飞机是僚机。
         决定"谁跟着谁整备"（Resupply.leaderOf / wingmenOf），也是无人机跟随 / 掩护 / 取目标的长机（$.leaderOf，
         批次 6.1 长机泛化）；长机可以是飞机或舰船。没写 leader 的 role drone 默认跟玩家。 */
      leader: opt.leader || null,
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
    var ceil = Ent.ceilingEff(a);               // min(数据升限, 失速升限)，见 physics.js
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

  /* 战区边界软转向（docs/POST2-0IMPL.md 4.1）：
     警告区内把期望方向的水平分量朝战区中心拉，权重 = 深度 × ARENA_PULL_K（封顶 1，深度到 1/K 就取满），
     越界则取满；规避中（evade）在警告区内权重减半 —— 躲导弹优先，但越过真边界就不再让步。
     只改水平方向，俯仰（高度）照旧。僚机 / 无人机跟着长机，不单独处理；
     航线型单位走 updateRoute，根本不经过这里（沿航线飞出去的轰炸机不受影响）。 */
  /* 起拉要早：高空低动压时转弯半径大，等权重涨起来再掉头就来不及了 */
  var ARENA_PULL_K = 1.8;
  var ARENA_BUFFER_K = 2.2;       // 缓冲带宽度 = 警告区宽度 × 它（外沿；内沿 = 警告区外沿）
  var ARENA_BUFFER_W = 0.5;       // 缓冲带内最大拉回权重（到警告区外沿时）
  function arenaSteer(a, dir, world) {
    var s = a.ai;
    if (!dir || !world.arenaDef || s.role === 'drone') return dir;
    var st = Arena.state(world.arenaDef, a.pos);
    var w;
    if (st.zone === 'in') {
      /* 缓冲带（v3.6.3）：警告区外再宽一圈（BUFFER_K × warn），朝外飞的 NPC 提前被往里拉，权重随深入平方增长。
         NPC 没有特别理由（真撤离出界）就不该把正在缠斗的玩家一路带出界；朝里飞的不管。 */
      var edgeD = st.edgeDist, B = world.arenaDef.warn * ARENA_BUFFER_K;
      if (edgeD >= B || (s.mode === 'retreat' && !s.fake) || s.role === 'support') { s.arenaSide = 0; return dir; }
      var ccx = world.arenaDef.cx - a.pos.x, ccz = world.arenaDef.cz - a.pos.z, ccl = Math.sqrt(ccx * ccx + ccz * ccz) || 1;
      var dl = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
      if (dl < 1e-6 || (dir.x * ccx + dir.z * ccz) / (dl * ccl) >= 0) { s.arenaSide = 0; return dir; }     // 本来就朝里
      var dpt = 1 - (edgeD - world.arenaDef.warn) / (B - world.arenaDef.warn);
      w = ARENA_BUFFER_W * dpt * dpt;
    } else w = st.zone === 'out' ? 1 : Math.max(ARENA_BUFFER_W, Math.min(1, st.depth * ARENA_PULL_K));   // 与缓冲带在警告区外沿衔接（不跳变）
    if (s.mode === 'evade' && st.zone === 'warn') w *= 0.5;     // 越过真边界就不再让步
    var cx = world.arenaDef.cx - a.pos.x, cz = world.arenaDef.cz - a.pos.z;
    var cl = Math.sqrt(cx * cx + cz * cz);
    if (cl < 1) return dir;
    cx /= cl; cz /= cl;
    var hl = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    var hx = hl > 1e-6 ? dir.x / hl : cx, hz = hl > 1e-6 ? dir.z / hl : cz;
    var bx = hx * (1 - w) + cx * w, bz = hz * (1 - w) + cz * w;
    var bl = Math.sqrt(bx * bx + bz * bz);
    if (bl < 1e-6) { bx = cx; bz = cz; bl = 1; }       // 正好背向中心且权重 0.5：直接朝中心
    bx /= bl; bz /= bl;
    /* 机头背着中心冲出去时，期望方向正对机尾：转向控制没有明确的转弯侧，
       只会沿竖直面拉杆爬升而不转弯。所以往靠中心的一侧（机体左 / 右）连续地偏：
       偏量 k 随"机头与回中心方向的夹角"从 0（夹角 ≤ 90°）平滑加到 1.5（正相反，约偏 56°）。
       转弯侧在整个出界期间固定（s.arenaSide，回到界内才清除），否则两侧来回切会让操纵抖动。 */
    var fl = Math.sqrt(a.fwd.x * a.fwd.x + a.fwd.z * a.fwd.z);
    if (fl > 0.2) {
      var fc = (a.fwd.x * cx + a.fwd.z * cz) / fl;          // 机头水平朝向与"回中心"的余弦
      if (fc < 0) {
        var rl = Math.sqrt(a.right.x * a.right.x + a.right.z * a.right.z) || 1;
        var rx = a.right.x / rl, rz = a.right.z / rl;
        if (!s.arenaSide) s.arenaSide = (rx * cx + rz * cz) >= 0 ? 1 : -1;
        var k = Math.min(1.5, -fc * 1.5) * s.arenaSide;
        bx = bx + rx * k; bz = bz + rz * k;
        bl = Math.sqrt(bx * bx + bz * bz) || 1; bx /= bl; bz /= bl;
      }
    }
    var hh = Math.sqrt(Math.max(0, 1 - dir.y * dir.y));  // 保持原俯仰：水平分量长度不变
    return M3.V(bx * hh, dir.y, bz * hh);
  }

  function update(a, dt, world) {
    if (!a.alive || !a.ai) return;
    // 航线型单位完全不走下面那套
    if (a.route) return updateRoute(a, dt, world);
    var s = a.ai;

    s.hpFrac = a.maxHp > 0 ? Math.max(0, Math.min(1, a.hp / a.maxHp)) : 1;      // 性格 rage 用（skill.js fireWill / shootGap）
    if (s.retargetT > 0) s.retargetT -= dt;
    if (s.modeT > 0) s.modeT -= dt;
    if (s.evadeT > 0) s.evadeT -= dt;
    if (s.counterT > 0) { s.counterT -= dt; if (s.counterT <= 0 || !(s.counterFor && s.counterFor.alive)) { s.counterT = 0; s.counterFor = null; } }
    if (s.standCool > 0) s.standCool -= dt;
    if (s.fakeBoostT > 0) s.fakeBoostT -= dt;
    if (s.shootT > 0) s.shootT -= dt;
    if (s.longT > 0) s.longT -= dt;
    if (s.overT > 0) s.overT -= dt;
    if (s.overCd > 0) s.overCd -= dt;
    if (s.jam) jamAuto(a, s.jam, world, dt);        // 自由飞行的干扰机：与航线型干扰机同一套自动开机
    s.envClock = (s.envClock || 0) + dt;      // 发射包线缓存的时钟（见 aiEnvelope）
    if (s.burstT > 0) s.burstT -= dt;
    if (s.flareT > 0) s.flareT -= dt;

    /* 三层（docs/POST2-0IMPL.md 5.0）：感知 → 决策 → 机动 → 开火。
       mode 取值：pursue / evade / extend / standoff（外围游走）/ closeIn（回头近战）/ retreat（撤离，retreat.js）。 */
    gTrack(a, s, dt);
    perceive(a, s, world, dt);
    decide(a, s, world, dt);
    maneuver(a, s, world, dt);
    if (!a.alive) return;                    // 撤离飞出战区被移除
    fire(a, s, world, dt);
  }

  /* 过载与体能（有人机）：由速度方向的转动速率估算持续 G；持续高 G 超过 G_SUSTAIN 秒 → 视野变窄 G_BLACKOUT 秒，
     期间机动放缓（maneuver 里不转向）。无人机（tags.unmanned）没有这个限制。gLimit 取机型 ac.gLimit，缺省 9。 */
  function gTrack(a, s, dt) {
    if (a.tags && a.tags.unmanned) { s.blackT = 0; return; }
    if (s.blackT > 0) s.blackT -= dt;
    var v = a.vel || null;
    if (!v || dt <= 0) return;
    var sp = M3.len(v);
    if (sp < 50) return;
    var dir = M3.mul(v, 1 / sp);
    if (s.pDir) {
      var om = M3.angleBetween(s.pDir, dir) / dt;
      var g = 1 + sp * om / 9.81, lim = (a.ac && a.ac.gLimit) || 9;
      if (g > lim * 0.85) s.gT = (s.gT || 0) + dt; else s.gT = Math.max(0, (s.gT || 0) - dt * 0.5);
      if (s.gT > $.G_SUSTAIN) { s.gT = 0; s.blackT = $.G_BLACKOUT; }
    }
    s.pDir = dir;
  }

  /* 目标丢了 / 死了之后要等一个反应延迟才重选（登记一次，持续式）；返回 true = 还在等。 */
  function lostWait(s, dt) {
    if (s.target && !s.target.alive) { s.target = null; s.lostT = 0; }
    if (s.lostT === null) return false;
    if (s.lostT === 0 && !s.lostXSet) { s.lostXSet = true; s.lostX = $.SKILL.lostExtra(s); }     // 低技能：被晃出视线后多花一阵才重新找到
    s.lostT += dt;
    if (s.lostT < $.SKILL.reactT(s) + s.lostX) return true;
    s.lostXSet = false; s.lostX = 0;
    return false;
  }

  /* 感知层：把"谁在照我、我被压制多久"这类状态算进 a / s，不做任何决策。 */
  function perceive(a, s, world, dt) {
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
    s.jammer = jammedBy;
    if (jammedBy) {
      s.ewResist = Math.min(1, (s.ewResist || 0) + dt * $.SKILL.ewRate(s));
    } else if (s.ewResist > 0) {
      s.ewResist = Math.max(0, s.ewResist - dt * 0.08);
    }
  }

  /* 决策层：威胁规避 → 脱离 → 选目标 → 诱饵连放。只改 s.mode / s.target / s.*T，不碰操纵量。 */
  function decide(a, s, world, dt) {
    $.updateIllum(a, s, world, dt);
    /* ---------- 1. 威胁规避优先级最高 ---------- */
    var inc = $.findIncoming(a, world);
    /* 人为失误：低技能晚发现来袭弹（新来的一枚登记一次延迟，延迟内当没看见） */
    if (inc) {
      if (s.incId !== inc) { s.incId = inc; s.incWait = 0; s.incDelay = $.SKILL.misjudgeT(s); }
      s.incWait += dt;
      if (s.incWait < s.incDelay) inc = null;
    } else s.incId = null;
    /* 半主动照射中：来袭弹还远（> 2.5 km）就不转身规避，免得把自己的弹甩丢；进了 2.5 km 一次性判断放不放弃（按技能） */
    if (inc && $.illumHolds(s)) {
      if (M3.dist(inc.pos, a.pos) > 2500) inc = null;
      else if (!s.illum.decided) {
        s.illum.decided = true;
        if ($.rnd01(s) < 0.4 + 0.5 * s.skill) s.illum.abandoned = true;
      }
    }
    if (inc) {
      s.mode = 'evade';
      s.evadeT = Math.max(s.evadeT, 0.55);
      s.msl = inc;
    } else if (s.mode === 'evade' && s.evadeT <= 0) {
      s.mode = a.hp < a.maxHp * 0.28 ? 'extend' : 'pursue';
    }

    /* ---------- 2. 血量过低脱离 ---------- */
    if (s.role !== 'drone' && s.mode !== 'evade' && a.hp < a.maxHp * 0.25 * ($.temper(s).extend || 1) && Math.random() < 0.004) {
      s.mode = 'extend';
      s.modeT = M3.rnd(4, 9);
    }
    if (s.mode === 'extend' && s.modeT <= 0) s.mode = 'pursue';

    /* ---------- 2b. 撤离（mission.retreat 'on'）：evade 优先，其余时间 mode = retreat ---------- */
    $.retreatWatch(a, s, world, dt);
    if ((s.retreating || s.fake) && s.mode !== 'evade') s.mode = 'retreat';
    else if (!s.retreating && !s.fake && s.mode === 'retreat') s.mode = 'pursue';

    /* ---------- 2c. 过失速机动（5.8）：进行中的 PSM 凌驾于规避 / 追击之上；结束后回 pursue ---------- */
    $.psmWatch(a, s, world, dt);
    if ($.psmActive(a, s)) s.mode = 'psm';
    else if (s.mode === 'psm') s.mode = 'pursue';

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
      var dLead = $.leaderOf(s, world);
      var leadOk = dLead && dLead.alive && $.leadTarget(dLead);
      /* 只看僚机自己是否被压制。长机电磁静默或被压制只是下不了令，
         已有的授权照旧，僚机仍会按当前指令攻击。 */
      if (a.suppressed > 0.35) {
        s.target = null;                       // 自主防御：只规避，不开火
      } else if (s.cmd === 'spread') {
        s.target = $.nearestEnemy(a, world, 9000);
      } else if (s.cmd === 'cover') {
        s.target = $.leadThreat(a, world) ||
          (dLead && dLead.alive ? $.nearestEnemyTo(dLead.pos, a, world, $.WING_FREE_R) : null) ||
          (leadOk ? $.leadTarget(dLead) : null);
      } else {
        // 长机阵亡时不自主接战（设定：无人机没有接管战局的能力，只会盘旋）
        s.target = leadOk ? $.leadTarget(dLead) : (dLead && dLead.alive ? $.nearestEnemy(a, world, $.WING_FREE_R) : null);
      }
    } else if (s.counterT > 0 && s.counterFor && s.counterFor.alive) {
      /* 转守为攻（反击窗口）：死死盯住刚被甩过头的攻击者，不被 Director / STICKY 抢走 */
      s.target = s.counterFor; s.retargetT = Math.max(s.retargetT, 0.8);
    } else if ((s.retargetT <= 0 || !s.target || !s.target.alive) && !lostWait(s, dt) && !$.illumHolds(s)) {
      s.lostT = null;
      s.retargetT = s.role === 'ally' ? 8 + 7 * $.rnd01(s) : $.SKILL.retarget(s);   // ally 的重评估间隔 8–15 s（Director）
      /* 被主动雷达照射时优先咬照射者 —— "谁在照我，我先打谁"。

         被动测距（silentLock）的对手不会走到这里，所以带一件
         GUS-6 / GUS-9 就能安静地锁定别人，而不把仇恨引到自己身上。 */
      if (a.rwrSrc && M3.dist2(a.rwrSrc.pos, a.pos) < 12000 * 12000) {
        s.target = a.rwrSrc;
      } else {
        s.target = $.director.pick(a, world, 15000);
        /* 空中没目标、手上却带着对面弹 → 去挑海面上的打。

           以前 AI 完全看不见 world.targets（nearestEnemy 只扫 actors），
           于是"敌机炸你的前进基地"这件事在代码里根本不存在 ——
           下游的随队攻击机只能是摆设。 */
        if (!s.target) s.target = $.surfaceTargetFor(a, world);
      }
    }

    $.coordStep(a, s, world, dt);                 // 编队解散 / 脱离干扰区 / 友军呼救（coord.js）
    s.searching = $.memStep(a, s, world, dt);
    decideRange(a, s, world, dt);

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
        a.flareCd <= 0 && $.leaderOf(s, world) && $.leaderOf(s, world).alive) {
      var lead = $.leaderOf(s, world), rk = a.name || 'drone';
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
  }

  /* 距离层（Director，docs/POST2-0IMPL.md 5.2）：外围游走（standoff）/ 回头近战（closeIn）/ 缠斗太久脱离。
     只对 SKILL.standoff 为真（elite 以上）的、带远距对空弹的飞机生效；其余照旧一路 pursue。
       pursue  → standoff：目标是空中单位、进到环内（d < 1.1 R_s）、不在冷却、没缠斗太久
       standoff → closeIn：远距弹打光 / 离目标 < 1500 m（已经贴上了）/ 游走超过 T_STANDOFF
       closeIn → pursue ：20 s 后（"回头"：重新按 pursue 打，之后可以再次进环）
       缠斗（< 1800 m）累计 T_FURBALL 以上：脱离（extend）4–7 s 再重来 */
  function decideRange(a, s, world, dt) {
    var D = $.DIR, t = s.target;
    if (s.mode === 'retreat' || s.mode === 'psm') return;
    var air = t && t.alive && t.kind !== 'target';
    if (!air || s.mode === 'evade' || s.mode === 'extend' || !$.SKILL.standoff(s)) {
      if (s.mode === 'standoff' || s.mode === 'closeIn') s.mode = 'pursue';
      if (!air) { s.furT = 0; s.standT = 0; s.closeT = 0; }
      return;
    }
    var d = M3.dist(a.pos, t.pos);
    if (d < 1800) s.furT += dt; else s.furT = Math.max(0, s.furT - dt * 0.5);
    var wc = $.weaponClass(a);
    s.wclass = wc.cls;
    s.ringR = M3.clamp(wc.reach * D.RING_K * ($.temper(s).ring || 1), 2500, 9000);
    if (s.mode === 'standoff') {
      s.standT += dt;
      if (wc.cls !== 'longRange' || s.standT > D.T_STANDOFF || d < 1500) { s.mode = 'closeIn'; s.closeT = 0; s.standCool = 20; }
    } else if (s.mode === 'closeIn') {
      s.closeT += dt;
      if (s.closeT > 20) s.mode = 'pursue';
    } else if (s.standCool <= 0 && wc.cls === 'longRange' && d < s.ringR * 1.1 && s.furT < D.T_FURBALL) {
      s.mode = 'standoff'; s.standT = 0; s.orbit = $.rnd01(s) < 0.5 ? -1 : 1;
    }
    if (s.furT > D.T_FURBALL && wc.cls === 'longRange') {
      s.mode = 'extend'; s.modeT = 4 + 3 * $.rnd01(s); s.furT = 0; s.standCool = 15;
    }
  }

  /* 机动层：按模式 / 角色出期望方向与油门，过覆盖链（升限、战区边界、垂直改出、近地保护），写 a.throttle / a.ab / a.target。 */
  function maneuver(a, s, world, dt) {
    var ctrl = a.ctrl;
    if (s.mode !== 'evade') { s.flareReact = 0; s.evPlan = null; s.evFor = null; s.evadePlanShown = null; }      // 干扰弹首发的反应计时 / 规避策略：威胁没了就清零
    // 机炮准星偏移：换目标时重抽；之后 OU 漂移；没有（空中）目标时衰减
    if (s.aimFor !== s.target) { s.aimFor = s.target; if (s.target) $.aimReset(s); }
    $.aimStep(s, dt, !!(s.target && s.target.alive && s.target.kind !== 'target'));
    /* ---------- 4. 分派行为 ---------- */
    var desired;
    var throttle = 0.85, ab = false;
    s.lowStrike = false;

    if (s.blackT > 0 && s.mode !== 'psm') {
      desired = a.fwd; throttle = 0.8; ab = false;       // 视野变窄：机动被迫放缓（不转向）
    } else if (s.mode === 'psm') {
      /* 过失速机动：机头去对准 psmAim（甩向攻击者 / 远离来袭弹），推力全开；stepAircraft 看 a.psm 转 stepPSM，消费这里 steerTo 写的 ctrl */
      desired = $.psmAim(a, s) || a.fwd;
      throttle = 1; ab = false;
    } else if (s.mode === 'evade' && s.msl) {
      var r = $.evade(a, s.msl, world, dt);
      s.evadePlanShown = r.plan || null;
      desired = r.dir;
      throttle = r.throttle;
      ab = r.ab;
      /* 决定放诱饵时不是只丢一组，而是随机连放 2–5 组（每组之间
         由 breakLock 的 flareCd 隔 0.45 s）。只丢一组在现在的诱饵规则下
         几乎骗不到弹 —— 同一枚弹被反复投放会越来越难骗，
         但一组都没骗到就等于没放。连放的后续几组在下面统一处理，
         这样中途切出 evade 也会把这一串放完。 */
      s.flareReact += dt;
      if (s.flareReact >= $.SKILL.reactT(s) && s.flareT <= 0 && !s.flareBurst && a.flares > 0 && a.flareCd <= 0 && !$.flareUseless(s, s.msl)) {
        s.flareBurst = 2 + Math.floor(Math.random() * 4);
      }
    } else if (s.mode === 'extend') {
      s.flareReact = 0;
      // 向低威胁方向脱离，同时保持能量
      var away = (s.jamAway && s.jamAway.alive) ? s.jamAway : $.nearestEnemy(a, world, 20000);
      if (away) desired = M3.norm(M3.sub(a.pos, away.pos));
      else desired = a.fwd;
      desired = M3.norm(M3.V(desired.x, 0.06, desired.z));
      throttle = 1; ab = true;
    } else if (s.mode === 'retreat') {
      s.flareReact = 0;
      desired = s.fake ? $.fakeDir(a, s) : $.retreatDir(a, s, world);        // 真撤离飞出战区的会在这里被移除（返回 null）
      throttle = 1; ab = true;
    } else if (s.role === 'drone') {
      /* 无人僚机永远待在编队里，不追出去。

         它的价值在于替长机挡导弹、探路、把导弹挂架打空 ——
         一旦追出去，这三件事就都做不成了。
         所以它的机动**只跟编队位置有关**，目标只用于决定何时开火。 */
      var dLead2 = $.leaderOf(s, world);
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
          M3.add(M3.mul($.leadRight(dLead2), sl.dx * ek),
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
        var vWant = $.leadSpeed(dLead2) + M3.clamp(err * 0.25, -120, 260);
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
    } else if (s.mode === 'standoff' && s.target && s.target.alive) {
      /* 外围游走：沿环（半径 ringR）绕目标飞，机头离视线一个偏角 θ —— 在环上很小（导弹锁得住），
         进到环内就加大（边绕边向外让），环外则收小（边绕边靠近）。 */
      var rs0 = $.pursue(a, s.target, world);
      var toS = M3.sub(s.target.pos, a.pos), dS = M3.len(toS);
      var losS = M3.mul(toS, 1 / Math.max(1, dS));
      var sideS = M3.norm(M3.V(-losS.z * s.orbit, 0, losS.x * s.orbit));
      var th = M3.clamp(0.35 + (s.ringR - dS) / Math.max(1, s.ringR) * 1.6, 0.2, 1.2);
      if (s.shootT <= 0 && a.spAmmo > 0) th = Math.min(th, 0.1);      // 弹已就绪：机头对正目标等锁定 / 发射，齐射后才继续绕
      var dv = M3.add(M3.mul(losS, Math.cos(th)), M3.mul(sideS, Math.sin(th)));
      desired = M3.norm(M3.V(dv.x, losS.y * 0.6, dv.z));
      throttle = rs0.throttle; ab = rs0.ab;
    } else if (s.target && s.target.kind === 'target') {
      /* 对面目标：**保持高度**，只把机头转过去。

         不能走 pursue()：那是为空战写的，`leadTo` 会一路指向海面，
         飞机就一头扎下去 —— 而下面有"离地 420 m 强行拉起"的保护，
         结果是在目标上方反复俯冲-拉起，永远进不了投放包线。 */
      desired = $.approachSurface(a, s.target);
      throttle = 0.9; ab = false;
      /* 低空突防（批次 5d）：strike 机型、skill ≥ 0.6 —— 进投放包线前贴海面飞，到包线边缘才拉起、发射后回到低空 */
      var sk = $.skimDir(a, s, desired);
      if (sk) { desired = sk; s.lowStrike = true; throttle = 1; }
    } else if (s.fm && $.fmDir(a, s, world)) {
      /* 巡航队形（未交战）：跟着队长走槽位；交战判据成立后 coord.js 会解散（s.fm = null），回到各自的战术角色 */
      var fd = $.fmDir(a, s, world);
      desired = fd.dir; throttle = fd.throttle; ab = fd.ab;
    } else if (s.jam && s.ward && s.ward.alive) {
      /* 干扰机：留在己方编队旁（离远了飞回去、近了绕着转），靠吊舱压制进入范围的敌人，不去追击 */
      desired = $.escortDir(a, s);
      throttle = 0.8; ab = false;
    } else if (s.target) {
      var res = $.pursue(a, (s.searching && $.searchGhost(s)) || s.target, world);
      desired = res.dir;
      /* loyal 性格：不离开长机 / 被护卫者超过 leash（缺省长机 = ai.leader，护航 = ai.ward）*/
      var lead0 = s.leader || s.ward, lash = $.temper(s).leash || (s.ward ? $.ESCORT.LEASH : 0);
      if (lash && lead0 && lead0.alive && M3.dist(a.pos, lead0.pos) > lash) desired = M3.norm(M3.sub(lead0.pos, a.pos));
      /* 机炮瞄准偏移：机头去对准"提前量点 + aim"，子弹跟着机头打偏。只在近距、对空、有炮时叠加。 */
      if (WEAPONS[a.gun] && M3.dist(a.pos, s.target.pos) < $.SKILL.AIM_RANGE) {
        desired = M3.norm(M3.add(desired, M3.add(M3.mul(a.right, s.aim.x), M3.mul(a.up, s.aim.y))));
      }
      throttle = res.throttle;
      ab = res.ab;
      // 5d：诱饵 / 侧击；elite 以上按能量定加力与 yo-yo
      var dT = M3.dist(a.pos, s.target.pos);
      if (s.searching) { dT = 99999; }         // 搜索中：按"远"处理，不做近距的 yo-yo / 侧击
      if (s.subrole === 'flank' && dT > 1200 && s.target.kind !== 'target') {
        var tg = s.target;
        var aim = M3.add(tg.pos, M3.add(M3.mul(tg.right, 2500 * (s.flankSide || 1)), M3.mul(tg.fwd, -1500)));
        desired = M3.norm(M3.sub(aim, a.pos));
      }
      /* 半主动照射中的高技能（ace）：保持目标在锥内的同时往一侧偏出一个角度（偏置转向），拉开距离、不迎着对手冲 */
      if (s.skill >= 0.85 && $.illumHolds(s)) {
        var bc = Math.cos(0.28 * (s.flankSide || 1)), bs = Math.sin(0.28 * (s.flankSide || 1));
        desired = M3.norm(M3.V(desired.x * bc + desired.z * bs, desired.y, -desired.x * bs + desired.z * bc));
      }
      ab = $.abPolicy(a, s, res, dT, world);
      if (s.fakeBoostT > 0) ab = true;            // 假撤退回头：短时加力，缩短回转时间窗
      desired = $.yoyo(a, s, desired, dT);
      desired = $.overshoot(a, s, desired, dT);   // 低技能：进近时收不住转弯，飞过头
      var hold = $.holdTail(a, s, desired, dT, res);              // 保持咬尾：提前量 + 按对手速度调油门
      if (hold) { desired = hold.dir; throttle = hold.throttle; ab = hold.ab && !$.illumHolds(s); s.holdingTail = true; } else s.holdingTail = false;
      var shake = $.shakeTail(a, s, world, dt, desired);          // 摆脱咬尾：被咬住超过反应延迟后横向急转
      if (shake) { desired = shake.dir; throttle = shake.throttle; ab = shake.ab || (ab && shake.throttle >= 1); }
    } else {
      // 无目标：护航机绕着被护卫者转，其余巡逻
      var wd = s.ward && s.ward.alive ? $.escortDir(a, s) : null;
      if (wd) { desired = wd; throttle = 0.75; } else {
      s.wander += dt * 0.25;
      desired = M3.norm(M3.V(Math.cos(s.wander), 0.02, Math.sin(s.wander)));
      throttle = 0.62;
      }
    }

    if (!desired) desired = a.fwd;

    /* 所有分支都汇到这里，所以升限钳制放在这一处就够了 ——
       无论是追击、规避还是编队，都不会为了追人钻到没有机动能力的高度。 */
    var inPsm = s.mode === 'psm';             // PSM 期间显式跳过升限、战区软转向、垂直改出、近地保护（5.0 / 5.8）
    if (!inPsm) desired = clampCeiling(a, desired);
    if ((s.mode !== 'retreat' || s.fake) && !inPsm) desired = arenaSteer(a, desired, world);   // 撤离就是要出去，不被软转向拉回来

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
    if (inPsm) s.vertRecover = false;
    else if (a.fwd.y > 0.5 && desired.y < 0.3) s.vertRecover = true;
    if (s.vertRecover) {
      if (a.fwd.y < 0.2) s.vertRecover = false;
      else { ctrl.pitch = (a.up.y >= 0) ? -1 : 1; ctrl.roll = 0; }
    }

    // 硬性保护：撞地前强行拉起
    if (Ent.agl(a) < 420 && a.fwd.y < 0.05 && !s.lowStrike && !inPsm) {
      desired = M3.norm(M3.V(a.fwd.x, 0.5, a.fwd.z));
      $.steerTo(a, desired, ctrl, a);
      throttle = 1; ab = true;
    }

    if ($.illumHolds(s)) ab = false;            // 照射期间不主动加力，免得把目标甩出锥而丢锁
    a.throttle = throttle;
    a.ab = ab;

    /* 把 AI 的选择写回 actor 的公开字段。

       世界里的其它部分一直在读它：HUD 的"谁在照射我"（RWR 环）、
       僚机的掩护判定（leadThreat）、以及 AI 之间的相互感知。
       少了这一行，那些地方全都静默失效 —— 它们不报错，
       只是永远看不到东西。 */
    a.target = s.target;
  }

  /* 开火层：机炮与导弹。读 s.target / s.mode，写 a.firingGun，经 world.fireMissile 发射。 */
  function fire(a, s, world, dt) {
    /* ---------- 5. 开火 ---------- */
    if (s.mode === 'evade' || s.mode === 'extend' || s.mode === 'retreat') {
      a.firingGun = false; s.gunT = 0; s.missT = 0; s.strafe = false;
      return;
    }
    var t = s.target;
    if (!t || !t.alive || s.searching) { a.firingGun = false; s.gunT = 0; s.missT = 0; s.strafe = false; return; }     // 看不见目标就不开火

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
    var wasFiring = a.firingGun;
    a.firingGun = false;
    if (gunW) {
      var gunRange = (a.pos.y > 18000 ? gunW.highRange : gunW.range);
      var gunCone = $.SKILL.gunCone(s);
      var inRange = dist < gunRange * 0.9 && a.gunAmmo > 0;
      var inCone = inRange && off < gunCone * 3.2;      // 门限按真实视线角判，不含准星偏移
      /* 扫射（"气氛组"）：机头误差 e 落在当前偏移散布圈 r 以内就继续打，不看 gunCone；
         进入 e ≤ r，退出 e > r × 1.3（滞回）。 */
      var aimR = Math.sqrt(s.aim.x * s.aim.x + s.aim.y * s.aim.y);
      if (!inRange) s.strafe = false;
      else if (s.strafe) { if (off > aimR * $.SKILL.STRAFE_EXIT) s.strafe = false; }
      else if (off <= aimR) s.strafe = true;
      // 反应延迟（持续式）：满足开火条件开始计时，任一不成立清零
      if (inCone || s.strafe) s.gunT += dt; else s.gunT = 0;
      a.firingGun = (inCone || s.strafe) && s.gunT >= $.SKILL.reactT(s);
    }
    if (a.firingGun) {
      if (!wasFiring) $.aimReset(s);                    // 每一串新的射击都是新的一次掷骰
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
    var missEval = false;
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
          var lim = Math.min(spW.lockDist || Infinity, $.SKILL.useNez(s) ? env.nez : env.rmax);
          envOK = dist < lim * (t.kind === "target" ? $.AI_RANGE_MARGIN_SURF : $.AI_RANGE_MARGIN_AIR);
        }
        var lockOK = okDist && okAng && envOK && dist > minR;
        missEval = true;
        if (lockOK) s.missT += dt; else s.missT = 0;          // 反应延迟（持续式）
        if (lockOK && s.missT >= $.SKILL.reactT(s) && Math.random() < $.SKILL.fireWill(s) * jamK) {
          if (world.fireMissile) world.fireMissile(a, t);
          s.shootT = M3.rnd(2.6, 5.2) * $.SKILL.shootGap(s);
        } else if (!lockOK && s.longT <= 0 && $.SKILL.longShot(s) > 0 && a.spAmmo > 1 && okAng && dist > minR && t.kind !== 'target' &&
                   spW.seeker && spW.seeker !== 'none' && !spW.tags.unguided && !spW.tags.passive && !spW.tags.sarh &&
                   Ent.jamLockOK(a, t) && dist < Math.max(spW.lockDist || 0, Ent.aiReach(spW, reachAlt)) * $.LONGSHOT.BAND) {
          /* 低技能的射程外远射：只在这个分支里才抽私有 LCG，不扰动上面 Math.random 的抽签顺序 */
          s.longT = $.LONGSHOT.ROLL;
          if ($.rnd01(s) < $.SKILL.longShot(s)) {
            if (world.fireMissile) world.fireMissile(a, t);
            s.shootT = M3.rnd(2.6, 5.2) * $.SKILL.shootGap(s);
            s.longT = $.LONGSHOT.COOL;
            s.longShots = (s.longShots || 0) + 1;
          }
        }
      }
    }
    if (!missEval) s.missT = 0;
  }
})(AI);
