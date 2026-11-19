(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     AI 技能参数表（docs/POST2-0IMPL.md 5.1）

     以前这些魔数散在 brain.js / tactics.js 里，每处都是"skill 的某个线性式"。
     提到这里，数值与原公式逐位相同（golden 不变）；以后加位格 / 性格偏移只改这一处。
     参数都吃 s（= a.ai），读 s.skill（0–1）。
     ============================================================ */
  $.SKILL = {
    // 选目标：两次重选之间的最小间隔（s）
    retarget: function (s) { return 0.35 + (1 - s.skill) * 0.9; },
    // 机炮锥（弧度）；开火门限是它的 3.2 倍
    gunCone: function (s) { return 0.028 + (1 - s.skill) * 0.02; },
    // 导弹射击意愿（每次满足条件时掷骰的概率）
    fireWill: function (s) { return 0.35 + s.skill * 0.45 + (s.counterT > 0 ? $.TAIL.COUNTER_FIRE : 0) + ($.temper(s).fire || 0) + ($.temper(s).rage || 0) * (1 - (s.hpFrac === undefined ? 1 : s.hpFrac)); },
    // 射击间隔系数（乘在 rnd(2.6, 5.2) 上）
    shootGap: function (s) { return (1.6 - s.skill * 0.6) * (1 - ($.temper(s).rage || 0) * (1 - (s.hpFrac === undefined ? 1 : s.hpFrac))); },
    // 高技能要求进 nez（目标掉头逃也能打中），低技能进 rmax
    useNez: function (s) { return s.skill >= 0.6; },
    // 对敌方电子战的适应速度（每秒）
    ewRate: function (s) { return 0.18 + s.skill * 0.30; },
    // 外围游走（standoff）只给 elite 以上；低位格直接冲上去
    standoff: function (s) { var t = $.temper(s); return !t.noStandoff && s.skill >= (t.standoffMin || 0.7) && s.role !== 'drone'; },
    // 提前量折扣（目前与技能无关）
    leadK: function () { return 0.85; },

    /* ---- 反应延迟与机炮偏移（docs/POST2-0IMPL.md 5.7「反应延迟与机炮偏移」） ---- */
    REACT_MIN: 0.2, REACT_MAX: 1.6,
    // 反应延迟（s）：rookie≈1.1 / pawn≈0.8 / elite≈0.5 / ace≈0.3
    reactT: function (s) { return this.REACT_MIN + (1 - s.skill) * (this.REACT_MAX - this.REACT_MIN); },
    AIM_TAU: 1.5,          // 准星偏移的漂移时间常数（s）
    AIM_JITTER: 0.06,      // 偏移的稳态标准差系数（rad，乘 1 − skill）
    aimSigma: function (s) { return this.AIM_JITTER * (1 - s.skill); },
    AIM_RANGE: 2500,       // 偏移只在这个距离以内加到瞄准点上（远距接近不受影响）
    STRAFE_EXIT: 1.3       // 扫射滞回：e > r × 1.3 退出
  };

  /* 飞行员性格（docs/POST2-0IMPL.md 5.7「个体模型」）：与 skill 正交，给参数表一组偏移。缺省 null = 中性（不偏移）。
       aggressive  开火意愿高、脱离阈值低、撤离概率 ×0.7、不玩外围游走（贴近狗斗）
       cautious    skill ≥ 0.55 就玩外围游走、撤离概率 ×1.3、开火意愿略低
       sniper      skill ≥ 0.5 就玩外围游走、环半径 ×1.2、偏爱远程弹（开火意愿略高）
       loyal       僚机 / 护航：不离开长机 / 被护卫者超过 leash 米 */
  $.TEMPER = {
    /* v3.6.3 新增字段（缺省 = 中性）：
         evW     甩脱来袭导弹各策略的权重乘子（evade.js）
         tailW   反咬尾各策略的权重乘子（tactics.js pickTailPlan）   react  被咬后的反应延迟系数
         lagDist 保持咬尾时"太近、改瞄身后"的触发距离（缺省 500 m）
         longK   射程外远射概率乘子   longCap  远射技能上限增量（缺省 0.65 → +longCap）   overK  超调时长乘子
         fakeK   假撤退概率乘子
         playerK 选目标时对玩家本人的评分乘子（< 1 更专注玩家）  closeK  对近距目标的评分加罚（< 2 km 加 closeK×1500 m（狙击 1.0 = 1.5 km） 的等效距离，到 3 km 渐退为 0）：不爱贴脸缠斗
         isoK    对"周围 4 km 有其友机"的目标加罚（1 + isoK·min(4, n)）  helpK  对"正在打求援友军的敌机"的评分乘子（缺省 0.6）
         abK     能量加力门限乘子（角点速度 × abK；> 1 更爱开加力，仅 skill ≥ ELITE_SKILL）
         rage    受伤后的开火意愿 / 射击间隔变化：fireWill += rage×(1−血量比)，shootGap ×= 1 − rage×(1−血量比)（< 0 = 越伤越保守） */
    aggressive: { fire: 0.10, extend: 0.7, retreat: 0.7, noStandoff: true,
      tailW: { scissors: 1.6, brake: 0.7, dive: 0.5, drag: 0.4, jink: 0.8 }, react: 1, lagDist: 350, longK: 1.6, longCap: 0.1, overK: 1.3, fakeK: 0.3, playerK: 0.8, helpK: 0.5, abK: 1.15, rage: 0.15,
      evW: { breakIn: 1.6, corkscrew: 1.3, run: 0.4, climb: 0.8 } },
    cautious: { fire: -0.05, retreat: 1.3, standoffMin: 0.55,
      tailW: { dive: 1.6, drag: 1.8, jink: 1.4, scissors: 0.7 }, react: 0.8, lagDist: 650, longK: 0.5, overK: 0.6, fakeK: 1.6, isoK: 0.15, helpK: 0.8, abK: 0.85, rage: -0.1,
      evW: { run: 1.7, climb: 1.3, dive: 1.2, breakIn: 0.7 } },
    sniper: { fire: 0.05, ring: 1.2, standoffMin: 0.5,
      tailW: { zoom: 1.8, brake: 1.6, drag: 1.2, scissors: 0.6 }, lagDist: 500, longK: 0.3, overK: 0.5, closeK: 1.0,
      evW: { run: 1.3, climb: 1.3, jink: 0.8 } },
    loyal: { leash: 6000, tailW: { drag: 1.5 }, helpK: 0.4 },
    steady: {}                                  // 显式中性：关卡 / 探针传它即可关掉生成时的随机性格
  };

  /* 生成时的随机性格（保底）：关卡没写 temperament 时由 missions/_lib.js 的 spawnEnemy 调（AI.rollTemperament）。
     AI.attach 本身不抽，所以直接 attach 的探针行为不变。
     选择用 a.ai.rs（attach 时确定性播种）的一次哈希，**不推进 rs**，所以不会让该机后续任何私有抽签错位。
     池：aggressive 0.30 / cautious 0.25 / sniper 0.20（仅机上有远距对空弹）/ loyal 0.25（仅有 leader 或 ward）；
     无人僚机、航线型、support 不抽。 */
  $.TEMPER_POOL = { aggressive: 0.30, cautious: 0.25, sniper: 0.20, loyal: 0.25 };
  function hash01(x) {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x ^= x >>> 16;
    return ((x >>> 0) + 0.5) / 4294967296;
  }
  $.rollTemperament = function (a, hint) {
    var s = a && a.ai;
    if (!s || s.temperament) return s ? s.temperament : null;
    if (s.role === 'drone' || s.role === 'support' || a.route) return null;
    hint = hint || {};
    var w = [], tot = 0, k, v;
    for (k in $.TEMPER_POOL) {
      if (!Object.prototype.hasOwnProperty.call($.TEMPER_POOL, k)) continue;
      if (k === 'loyal' && !(s.leader || s.ward || hint.leader || hint.ward)) continue;
      if (k === 'sniper' && $.weaponClass(a).cls !== 'longRange') continue;
      v = $.TEMPER_POOL[k]; w.push([k, v]); tot += v;
    }
    var r = hash01(s.rs ^ 0x7f4a7c15) * tot, i;
    s.temperament = w[w.length - 1][0];
    for (i = 0; i < w.length; i++) { r -= w[i][1]; if (r <= 0) { s.temperament = w[i][0]; break; } }
    return s.temperament;
  };
  var NEUTRAL = {};
  $.temper = function (s) { return (s.temperament && $.TEMPER[s.temperament]) || NEUTRAL; };

  /* 人为失误（低技能，skill < 0.7）：晚发现来袭弹 / 被晃出视线后多花一阵才重新找目标。
     触发走"登记一次 + 延迟"，不逐帧掷骰；延迟随技能单调递减，高技能为 0。 */
  /* 射程外"浪费的远射"（v3.6.2）：低技能的飞行员沉不住气，目标还在包线外就把弹放出去。
     概率随技能递减，≥ SKILL 为 0（高技能绝不乱放）。每 ROLL 秒最多掷一次（私有 LCG），放了之后 COOL 秒不再掷；
     只在包线外、锁定带 BAND 倍以内的区间，且至少留一枚（弹药 > 1）。 */
  $.LONGSHOT = { SKILL: 0.65, K: 0.9, ROLL: 1.5, COOL: 6, BAND: 1.4 };
  $.SKILL.longShot = function (s) { var t = $.temper(s), cap = $.LONGSHOT.SKILL + (t.longCap || 0); return s.skill < cap ? (cap - s.skill) * $.LONGSHOT.K * (t.longK === undefined ? 1 : t.longK) : 0; };
  /* 超调失误（v3.6.2）：低技能的飞行员进近时收不住转弯，沿原航向多飞一阵再回头（见 tactics.js $.overshoot）。0..1，≥ 0.7 为 0 */
  $.SKILL.overshoot = function (s) { return s.skill < 0.7 ? Math.min(1, (0.7 - s.skill) / 0.35 * ($.temper(s).overK || 1)) : 0; };
  /* 咬尾攻防（v3.6.3）：技术值里新增两项能力，0..1，随 skill 单调递增。
       shakeTail  摆脱咬尾：被敌机咬住（攻击者在机尾锥内、近距）持续超过反应延迟后，横向急转 + 俯冲甩开；skill ≤ 0.3 为 0，≥ 0.9 为 1
       holdTail   保持咬尾：自己咬着对手时用提前量追击并按对手速度调油门（不冲过头）；skill ≤ 0.35 为 0，≥ 0.9 为 1 */
  $.SKILL.shakeTail = function (s) { return Math.max(0, Math.min(1, (s.skill - 0.3) / 0.6)); };
  $.SKILL.evade = function (s) { return Math.max(0, Math.min(1, (s.skill - 0.35) / 0.55)); };     // 甩脱来袭导弹的策略深度（evade.js）；skill ≤ 0.35 为 0
  $.SKILL.holdTail = function (s) { return Math.max(0, Math.min(1, (s.skill - 0.35) / 0.55)); };
  $.SKILL.misjudgeT = function (s) { return s.skill < 0.7 ? (0.7 - s.skill) * 2.0 * $.rnd01(s) : 0; };
  $.SKILL.lostExtra = function (s) { return s.skill < 0.7 ? (0.7 - s.skill) * 3.0 * $.rnd01(s) : 0; };
  $.G_SUSTAIN = 6; $.G_BLACKOUT = 1.5;

  /* 私有随机流（线性同余 + Box–Muller）：新特性不碰 Math.random，
     不改变原有决策抽签的顺序。每架 AI 一份状态 s.rs（attach 时播种，确定性）。 */
  var seedCtr = 12345;
  $.seedRng = function () { seedCtr = (Math.imul(seedCtr, 1664525) + 1013904223) >>> 0; return seedCtr; };
  $.rnd01 = function (s) {
    s.rs = (Math.imul(s.rs, 1664525) + 1013904223) >>> 0;
    return (s.rs + 0.5) / 4294967296;
  };
  $.gauss = function (s) {
    var u = $.rnd01(s), v = $.rnd01(s);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
  };
  /* 准星偏移 a.ai.aim = {x,y}（相对目标视线的两个分量，rad）：
     有目标时 OU 漂移，稳态标准差 σ；没目标时衰减回 0。 */
  $.aimStep = function (s, dt, hasTarget) {
    var aim = s.aim, k = Math.exp(-dt / $.SKILL.AIM_TAU);
    if (!hasTarget) { aim.x *= k; aim.y *= k; return; }
    var sg = $.SKILL.aimSigma(s) * Math.sqrt(1 - k * k);
    aim.x = aim.x * k + sg * $.gauss(s);
    aim.y = aim.y * k + sg * $.gauss(s);
  };
  // 重新从稳态分布抽一个新值（换目标 / 开始新一串射击）
  $.aimReset = function (s) {
    var sg = $.SKILL.aimSigma(s);
    s.aim.x = sg * $.gauss(s); s.aim.y = sg * $.gauss(s);
  };
})(AI);
