'use strict';

/**
 * 估算一枚弹的"有效射程"（公里）—— 动力段能把它送多远。
 *
 * 为什么不直接用 speed × life：那样忽略了加速阶段。
 * 导弹发射时带着载机的速度（约 350 m/s），先加速到 speed，
 * 再匀速飞完动力段剩余时间。出动力段之后它只能滑翔，
 * 机动能力断崖式下降，所以这个数比"总飞行距离"更贴近实战。
 *
 * 返回 null 表示它不是一枚可以"打到某处"的东西（吊舱之类）。
 */
function missileRange(w) {
  if (!w) return null;
  if (w.passive) return null;
  if (!w.speed || !w.life) return null;

  var v0 = 350;                                   // 载机初速
  if (!w.boost) return w.speed * w.life / 1000;   // 无动力（火箭巢）

  var tAcc = Math.min(w.life, Math.max(0, (w.speed - v0) / w.boost));
  var rAcc = v0 * tAcc + 0.5 * w.boost * tAcc * tAcc;
  var rCruise = w.speed * Math.max(0, w.life - tAcc);
  return (rAcc + rCruise) / 1000;
}

/**
 * 这架飞机能不能挂这件武器。
 * 只看**能力门槛**，挂点类型（fits）由调用方另行判断 ——
 * 两者是独立的：位置对得上但机体撑不住，一样挂不了。
 */
function canCarry(ac, w) {
  if (!w || !w.needs || !w.needs.length) return true;
  var caps = (ac && ac.caps) || [];
  for (var i = 0; i < w.needs.length; i++) {
    if (caps.indexOf(w.needs[i]) < 0) return false;
  }
  return true;
}

/**
 * 挂载对飞行性能的影响系数。
 *
 * **界面和物理必须用这一份。** 它们各写一套数字的结果就是漂移：
 * 机库面板曾经只显示 `×18`（俯仰），而实际最狠的是加速的 −26%，
 * 玩家看到的损失比真实手感小得多。
 *
 * lf = loadFactor，挂载重量 / 最大挂载，0..1。
 * 返回值是**乘数**（失速速度那项大于 1，因为挂载让它变高）。
 */
function loadoutPenalty(lf) {
  lf = Math.max(0, Math.min(1, lf || 0));
  return {
    vMax: 1 - 0.08 * lf,
    vMil: 1 - 0.06 * lf,
    vStall: 1 + 0.05 * lf,
    accel: 1 - 0.26 * lf,
    decel: 1 + 0.10 * lf,     // 阻力变大，收油门时掉速更快
    pitch: 1 - 0.18 * lf,
    roll: 1 - 0.12 * lf
  };
}

/* ============================================================
   匿踪
   机体自带的 stats.stl（0..1）= 敌方锁定距离能被缩短的程度；
   外挂会破坏它：每个外露挂点吃掉 STEALTH_LOSS_PER_POINT（按 expose 折算）。
   满值 1.0 最多缩短锁定距离 STEALTH_LOCK_CUT，吊舱（lockResist）与它
   按 1 − (1−a)(1−b) 合并。界面与物理必须用这一份。
   ============================================================ */
var STEALTH_LOCK_CUT = 0.5;

var STEALTH_LOSS_PER_POINT = 0.05;

/** 外露挂点数。wids[i] 对应第 i 个挂点组，空 / 无效 = 没挂东西 */
function exposedPoints(ac, wids) {
  var groups = (ac && ac.hardpointGroups) || [], n = 0;
  for (var i = 0; i < groups.length; i++) {
    var wid = wids && wids[i];
    if (!wid || !WEAPONS[wid]) continue;
    var ex = groups[i].expose === undefined ? 1 : groups[i].expose;
    n += groups[i].pts.length * ex;
  }
  return n;
}

/** 挂载后的实际匿踪值 0..1 */
function stealthValue(ac, exposed) {
  var s = (ac && ac.stats && ac.stats.stl) || 0;
  return s * Math.max(0, 1 - STEALTH_LOSS_PER_POINT * (exposed || 0));
}

/** 敌方锁定距离被缩短的比例：机体匿踪 + 吊舱抗锁定 */
function lockCutOf(stealth, podResist) {
  return 1 - (1 - stealth * STEALTH_LOCK_CUT) * (1 - (podResist || 0));
}
