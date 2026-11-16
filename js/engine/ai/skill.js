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
    fireWill: function (s) { return 0.35 + s.skill * 0.45; },
    // 射击间隔系数（乘在 rnd(2.6, 5.2) 上）
    shootGap: function (s) { return 1.6 - s.skill * 0.6; },
    // 高技能要求进 nez（目标掉头逃也能打中），低技能进 rmax
    useNez: function (s) { return s.skill >= 0.6; },
    // 对敌方电子战的适应速度（每秒）
    ewRate: function (s) { return 0.18 + s.skill * 0.30; },
    // 提前量折扣（目前与技能无关）
    leadK: function () { return 0.85; }
  };
})(AI);
