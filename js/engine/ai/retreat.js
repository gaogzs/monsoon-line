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
    return Math.max(0, Math.min(0.9, p * rk * ($.temper(s).retreat || 1)));
  };

  /* ---- 假撤退 / 撤向防空伞（批次 5d）---- */
  $.FAKE = { P: 0.08, MIN: 8, SPAN: 7, TURN_DIST: 3500 };

  function hdist(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }

  /* 己方防空伞：我方带对空火力的 world.targets（sam 标签 / 近防 / 对空武器），半径取对空弹有效射程（近防无武器时 5 km）。
     只在"被追击"（有敌机目标在 7 km 内，或被照射）且这个位置比追击者更靠近我时才算数。 */
  $.umbrellaPoint = function (a, s, world) {
    var ch = s.target && s.target.alive && s.target.kind !== 'target' ? s.target : null;
    if (!ch || M3.dist(a.pos, ch.pos) > 7000) { if (!(a.rwrT > 0)) return null; }
    var best = null, bd = 1e18;
    for (var i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      if (!t.alive || t.team !== a.team) continue;
      var wp = t.weapon && WEAPONS[t.weapon];
      var aa = (t.tags && t.tags.sam) || t.hasAA || (wp && wp.target === 'air');
      if (!aa) continue;
      var r = wp ? Ent.aiReach(wp, 3000) : 5000;
      var d = hdist(a.pos, t.pos);
      if (d >= bd || d > 40000) continue;
      if (ch && hdist(ch.pos, t.pos) <= d) continue;            // 追击者比我更靠近它：去了也是送人头
      bd = d; best = { x: t.pos.x, z: t.pos.z, r: r, d: d };
    }
    return best;
  };

  function startFake(a, s, world) {
    s.fake = { t: 0, dur: $.FAKE.MIN + $.FAKE.SPAN * $.rnd01(s), from: s.target };
    Chatter.emit(world, 'rtb', a);                  // 真 / 假撤退在玩家眼里不可区分（这是卖点）
  }

  function fakeOK(a, s) {
    if (s.rank !== 'elite' && s.rank !== 'ace') return false;
    if (a.hp < a.maxHp * 0.6 || s.leader) return false;
    var t = s.target;
    return !!(t && t.alive && t.kind !== 'target');
  }

  /* 决策层调用（每帧）：检测事件、到点评估（真撤离 / 假撤退）、长机带僚机、推进假撤退。
     真撤离只在 world.retreatOn 时才有；假撤退不移除单位，retreat 'off' 的关卡里也生效。 */
  $.retreatWatch = function (a, s, world, dt) {
    if (!canRetreat(a, s)) return;
    var real = !!world.retreatOn;
    if (s.retreatCd > 0) s.retreatCd -= dt;
    if (s.hpSeen === undefined) { s.hpSeen = a.hp; s.ammoSeen = missileAmmo(a); }
    var am = missileAmmo(a);
    var event = a.hp < s.hpSeen - 0.5 || am < s.ammoSeen;
    s.hpSeen = a.hp; s.ammoSeen = am;

    if (s.fake) {                                    // 假撤退进行中：到时间 / 对手追近了 → 急转回头
      var f = s.fake, ch = f.from;
      f.t += dt;
      var near = ch && ch.alive && M3.dist(a.pos, ch.pos) < $.FAKE.TURN_DIST && f.t > 3;
      if (f.t >= f.dur || !ch || !ch.alive || near) {
        s.fake = null; s.fakeBoostT = 3; s.standCool = 15; s.retargetT = 0; s.target = ch && ch.alive ? ch : null;
        s.missT = $.SKILL.reactT(s);                 // 回头第一枪不再等反应延迟（先机发射）
        if (s.target) $.psmTurnBack(a, s, world, s.target);   // ace：对手在机尾时用 PSM 甩头迎击
      }
      return;
    }
    if (!s.retreating) {
      if (event && !(s.evalT > 0) && !(s.retreatCd > 0)) s.evalT = $.RETREAT.EVAL_DELAY;
      if (s.evalT > 0) {
        s.evalT -= dt;
        if (s.evalT <= 0) {
          if (real && $.rnd01(s) < $.retreatProb(a, s)) { s.retreating = true; s.umbT = 0; Chatter.emit(world, 'rtb', a); }
          else if (fakeOK(a, s) && $.rnd01(s) < $.FAKE.P * (s.rank === 'ace' ? 1 : 0.7)) startFake(a, s, world);
          else s.retreatCd = $.RETREAT.COOLDOWN;
        }
      }
      var L = s.leader;
      if (real && L && L.alive && L.ai && L.ai.retreating) s.retreating = true;      // 僚机跟长机
    }
    if (s.retreating) {
      var um = $.umbrellaPoint(a, s, world);
      if (um && um.d < um.r * 0.7) { s.umbT = (s.umbT || 0) + dt; if (s.umbT > 6) { s.retreating = false; s.retreatCd = $.RETREAT.COOLDOWN; } }
      else if (!um && !Resupply.pointFor(world, a)) s.retreating = false;           // 无处可去（没有整备点也没有战区）
    }
  };

  /* 假撤退的期望方向：背着追击者水平飞 */
  $.fakeDir = function (a, s) {
    var from = s.fake && s.fake.from;
    if (!from) return a.fwd;
    var dx = a.pos.x - from.pos.x, dz = a.pos.z - from.pos.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    return M3.norm(M3.V(dx / l, 0.02, dz / l));
  };

  /* 机动层调用：返回期望方向；飞出战区边界的就地移除并返回 null。 */
  $.retreatDir = function (a, s, world) {
    var um = $.umbrellaPoint(a, s, world);
    if (um) {                                         // 被追击且有更近的己方防空伞：把对手引进火力网
      var ux = um.x - a.pos.x, uz = um.z - a.pos.z, ul = Math.sqrt(ux * ux + uz * uz) || 1;
      return M3.norm(M3.V(ux / ul, 0.0, uz / ul));
    }
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
