(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     撤离（docs/POST2-0IMPL.md 5.4）

     只在关卡声明 mission.retreat = 'on' 时才有（world.retreatOn，缺省 off，13 关都没开）。
     触发不是每帧掷骰，而是"事件 → 延迟 → 评估一次"：
       事件：掉血 / 弹药池减少 —— 用轮询 hpSeen / ammoSeen 检测，不挂 Ent.damage
       事件之后等 EVAL_DELAY 秒再评估一次（让这一阵战斗的结果落定）；评估没中则 COOLDOWN 秒内不再评估
       概率：血量低 + 弹药见底，按位格系数缩放（ace ×0.5 / elite ×0.75 / rookie ×1.3）
     撤离中（s.retreating，mode 'retreat'）：往 Resupply.pointFor 给的去向飞——
       本队整备点：进范围后由 Resupply.npcStep 接管（走整备周期，补满后回来）
       出界口：飞出战区边界（Arena zone 'out'）就从战场移除：alive=false, retreated=true, leftBy='retreat', escaped=true
     威胁规避（evade）优先于撤离；规避结束后继续撤。有 ai.leader 的僚机跟着长机一起撤。
     ============================================================ */
  $.RETREAT = { EVAL_DELAY: 2.5, COOLDOWN: 8 };

  function missileAmmo(a) {
    var n = 0;
    if (a.ammoPool) for (var k in a.ammoPool) if (Object.prototype.hasOwnProperty.call(a.ammoPool, k)) n += a.ammoPool[k] || 0;
    return n;
  }

  function canRetreat(a, s) {
    return (s.role === 'enemy' || s.role === 'ally') && !(a.tags && a.tags.noRetreat) && !a.route;
  }

  // 评估时撤离的概率（0–0.9）
  $.retreatProb = function (a, s) {
    var h = a.hp / a.maxHp, p = 0;
    if (h < 0.35) p += 0.5; else if (h < 0.55) p += 0.2;
    var noMsl = $.weaponClass(a).cls === 'gunOnly';
    var base = a.rs && a.rs.base ? a.rs.base.gunAmmo : (WEAPONS[a.gun] ? WEAPONS[a.gun].ammo : 0);
    var gunLow = !(base > 0) || a.gunAmmo < base * 0.3;
    if (noMsl) p += gunLow ? 0.4 : 0.15;
    var rk = s.rank === 'ace' ? 0.5 : s.rank === 'elite' ? 0.75 : s.rank === 'rookie' ? 1.3 : 1;
    return Math.max(0, Math.min(0.9, p * rk));
  };

  /* 决策层调用（每帧）：检测事件、到点评估、长机带僚机。 */
  $.retreatWatch = function (a, s, world, dt) {
    if (!world.retreatOn || !canRetreat(a, s)) return;
    if (s.retreatCd > 0) s.retreatCd -= dt;
    if (s.hpSeen === undefined) { s.hpSeen = a.hp; s.ammoSeen = missileAmmo(a); }
    var am = missileAmmo(a);
    var event = a.hp < s.hpSeen - 0.5 || am < s.ammoSeen;
    s.hpSeen = a.hp; s.ammoSeen = am;
    if (!s.retreating) {
      if (event && !(s.evalT > 0) && !(s.retreatCd > 0)) s.evalT = $.RETREAT.EVAL_DELAY;
      if (s.evalT > 0) {
        s.evalT -= dt;
        if (s.evalT <= 0) {
          if ($.rnd01(s) < $.retreatProb(a, s)) s.retreating = true;
          else s.retreatCd = $.RETREAT.COOLDOWN;
        }
      }
      var L = s.leader;
      if (L && L.alive && L.ai && L.ai.retreating) s.retreating = true;      // 僚机跟长机
    }
    if (s.retreating && !Resupply.pointFor(world, a)) s.retreating = false;   // 无处可去（没有整备点也没有战区）
  };

  /* 机动层调用：返回期望方向；飞出战区边界的就地移除并返回 null。 */
  $.retreatDir = function (a, s, world) {
    var pt = Resupply.pointFor(world, a);
    if (!pt) return null;
    if (pt.exit && Arena.state(world.arenaDef, a.pos).zone === 'out') {
      a.alive = false; a.retreated = true; a.leftBy = 'retreat'; a.escaped = true;
      s.retreating = false;
      return null;
    }
    var dx = pt.x - a.pos.x, dz = pt.z - a.pos.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    return M3.norm(M3.V(dx / l, a.pos.y < 2500 ? 0.1 : 0.0, dz / l));
  };
})(AI);
