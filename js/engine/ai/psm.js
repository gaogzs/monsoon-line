(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     AI 过失速机动（docs/POST2-0IMPL.md 5.8，批次 5e）

     复用玩家那套 Ent.stepPSM / psmGate / psmStart / psmAbort 与同一个控制律（steerTo）：AI 只是替换"瞄准方向"的来源。
     AI 没有"松开按键"这个动作 —— 由这里在机头对准后（或超时、目标没了）自己 psmAbort。

     适用：rank ace（skill ≥ PSM_AI.SKILL）、非无人机、无 noPSM 标签、不在撤离 / 假撤退中。
     两个用途：
       counter 咬尾反击：被敌机咬住（攻击者在机尾 ±60° 内、< 3 km）→ 机头甩向攻击者，收敛后照常按开火门限开火
       break   摆脱锁定：有导弹来袭 / 被雷达照射 → 机头甩向"远离来袭弹 / 照射源"的方向，把机头甩出导引头视场
     触发：事件（新出现威胁）→ EVAL_DELAY 后评估一次（威胁还在、掷骰、门限）→ 否则要等威胁消失再出现才再评估；冷却 CD。
     来袭弹 TTI 必须 > TTI_MIN（来不及就不硬做）；同玩家的能量 / 高度 / 动压门限（psmGate）。
     ============================================================ */
  $.PSM_AI = { SKILL: 0.75, EVAL_DELAY: 0.8, CD: 15, TTI_MIN: 2.5, MAX_T: 4.5, ALIGN: 12 * Math.PI / 180, REAR_COS: -0.5, REAR_R: 3000 };

  function eligible(a, s) {
    return s.role !== 'drone' && s.rank === 'ace' && s.skill >= $.PSM_AI.SKILL &&
      !(a.tags && (a.tags.noPSM || a.tags.unmanned)) && !s.retreating && !s.fake && !a.stall;
  }

  // 当前威胁：{ kind, src }，或 null。咬尾优先（那是它能主动解决的）。
  function threatOf(a, world) {
    var i, e, P = $.PSM_AI;
    for (i = 0; i < world.actors.length; i++) {
      e = world.actors[i];
      if (!e.alive || e === a || !Ent.hostile(e, a) || e.target !== a) continue;
      var d = M3.dist(e.pos, a.pos);
      if (d > P.REAR_R) continue;
      if (M3.dot(a.fwd, M3.mul(M3.sub(e.pos, a.pos), 1 / Math.max(1, d))) < P.REAR_COS) return { kind: 'counter', src: e };
    }
    var inc = $.findIncoming(a, world);
    if (inc) return { kind: 'break', src: inc, tti: M3.dist(inc.pos, a.pos) / Math.max(200, inc.speed || (inc.w && inc.w.speed) || 800) };
    if (a.rwrT > 0 && a.rwrSrc) return { kind: 'break', src: a.rwrSrc, tti: 99 };
    return null;
  }

  // 瞄准方向：counter 指向攻击者；break 指向远离来袭弹 / 照射源
  $.psmAim = function (a, s) {
    var ai = s.psmAI;
    if (!ai || !ai.src || !ai.src.alive) return null;
    var to = M3.norm(M3.sub(ai.src.pos, a.pos));
    return ai.kind === 'counter' ? to : M3.norm(M3.V(-to.x, Math.max(-0.2, Math.min(0.2, -to.y)), -to.z));
  };

  $.psmActive = function (a, s) { return !!(a.psm && s.psmAI); };

  /* 决策层调用（每帧） */
  $.psmWatch = function (a, s, world, dt) {
    if (s.psmCd > 0) s.psmCd -= dt;
    if (a.psm && s.psmAI) {                                  // 进行中：对准 / 超时 / 目标没了 → 自己结束
      var ai = s.psmAI, aim = $.psmAim(a, s);
      ai.t += dt;
      if (!aim || ai.t > $.PSM_AI.MAX_T || M3.angleBetween(a.fwd, aim) < $.PSM_AI.ALIGN) {
        Ent.psmAbort(a, world, 'ai');
        s.psmAI = null;
      }
      return;
    }
    if (s.psmAI && !a.psm) s.psmAI = null;                   // 被坠落段 / 外部结束
    if (!eligible(a, s)) { s.psmEval = null; return; }
    var th = threatOf(a, world);
    if (!th) { s.psmSeen = false; s.psmEval = null; return; }
    if (!s.psmSeen && s.psmCd <= 0 && !s.psmEval) { s.psmSeen = true; s.psmEval = { t: $.PSM_AI.EVAL_DELAY }; }
    if (!s.psmEval) return;
    s.psmEval.t -= dt;
    if (s.psmEval.t > 0) return;
    s.psmEval = null;                                        // 评估一次，结果为否则等新事件
    var p = Math.max(0.25, Math.min(0.85, 0.25 + 0.6 * (s.skill - 0.75) / 0.25));
    if ($.rnd01(s) >= p) return;
    if (th.kind === 'break' && th.tti < $.PSM_AI.TTI_MIN) return;
    s.psmAI = { kind: th.kind, src: th.src, t: 0 };
    var aimDir = $.psmAim(a, s);
    if (!aimDir || !Ent.psmGate(a, world, aimDir).ok) { s.psmAI = null; return; }
    Ent.psmStart(a);
    s.psmCd = $.PSM_AI.CD;
  };
})(AI);
