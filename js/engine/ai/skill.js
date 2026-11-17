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
    fireWill: function (s) { return 0.35 + s.skill * 0.45 + ($.temper(s).fire || 0); },
    // 射击间隔系数（乘在 rnd(2.6, 5.2) 上）
    shootGap: function (s) { return 1.6 - s.skill * 0.6; },
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
    aggressive: { fire: 0.10, extend: 0.7, retreat: 0.7, noStandoff: true },
    cautious: { fire: -0.05, retreat: 1.3, standoffMin: 0.55 },
    sniper: { fire: 0.05, ring: 1.2, standoffMin: 0.5 },
    loyal: { leash: 6000 }
  };
  var NEUTRAL = {};
  $.temper = function (s) { return (s.temperament && $.TEMPER[s.temperament]) || NEUTRAL; };

  /* 人为失误（低技能，skill < 0.7）：晚发现来袭弹 / 被晃出视线后多花一阵才重新找目标。
     触发走"登记一次 + 延迟"，不逐帧掷骰；延迟随技能单调递减，高技能为 0。 */
  /* 射程外"浪费的远射"（v3.6.2）：低技能的飞行员沉不住气，目标还在包线外就把弹放出去。
     概率随技能递减，≥ SKILL 为 0（高技能绝不乱放）。每 ROLL 秒最多掷一次（私有 LCG），放了之后 COOL 秒不再掷；
     只在包线外、锁定带 BAND 倍以内的区间，且至少留一枚（弹药 > 1）。 */
  $.LONGSHOT = { SKILL: 0.65, K: 0.9, ROLL: 1.5, COOL: 6, BAND: 1.4 };
  $.SKILL.longShot = function (s) { return s.skill < $.LONGSHOT.SKILL ? ($.LONGSHOT.SKILL - s.skill) * $.LONGSHOT.K : 0; };
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
