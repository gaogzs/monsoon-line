(function (AI) {
  'use strict';
  var $ = AI.$;
  $.aiEnvelope = aiEnvelope; $.leadTo = leadTo; $.pursue = pursue; $.evade = evade; $.strafeTarget = strafeTarget;

  /* ============================================================
     追击
     ============================================================ */
  /* 发射包线（动态射程）：静态 aiReach 只是上界，过了上界再用真实弹道的 rmax / nez 卡一次。
     每架 AI 自己存一份，0.1 s 刷新；换弹、换目标时作废。步长 1/5（误差约射程的 5%，
     余量（对空 1.0、对地 0.8）吃掉这部分）。 */
  // 发射包线的保守余量：对空 1.0（v3.6.2 由 0.9 放宽：之前迎头段几乎来不及开火；仍受 aiReach 的 0.9 约束），对地 0.8（移动慢的地面目标打偏更丢人，对地多留余量）
  $.AI_RANGE_MARGIN_AIR = 1.0;
  $.AI_RANGE_MARGIN_SURF = 0.8;
  var AI_ENV_T = 0.1;

  function aiEnvelope(a, s, w, wid, t) {
    return Ent.envelopeCached(s, s.envClock, { pos: a.pos, fwd: a.fwd, speed: a.speed + 70 }, w, wid, t, AI_ENV_T);
  }

  function leadTo(a, t) {
    var toT = M3.sub(t.pos, a.pos);
    var dist = M3.len(toT);
    var tGo = dist / Math.max(60, a.speed);
    var tv = t.vel || M3.V(0, 0, 0);
    var aim = M3.add(t.pos, M3.mul(tv, tGo * $.SKILL.leadK()));
    return M3.norm(M3.sub(aim, a.pos));
  }

  function pursue(a, t, world) {
    var desired = leadTo(a, t);
    var dist = M3.dist(a.pos, t.pos);
    var throttle = 0.9, ab = false;

    if (dist > 2600) { throttle = 1; ab = true; }
    else if (dist < 800) { throttle = 0.55; }
    else throttle = 0.82;

    // 高度管理：太低就抬起来
    if (Ent.agl(a) < 900 && a.fwd.y < 0) {
      desired = M3.norm(M3.V(desired.x, Math.max(desired.y, 0.25), desired.z));
    }
    // 高空：避免过度爬升损失动压
    if (a.pos.y > 19000 && desired.y > 0.35) {
      desired = M3.norm(M3.V(desired.x, 0.35, desired.z));
    }
    // 防止陷入纯垂直爬升（会失速）
    if (a.fwd.y > 0.82 && a.speed < Ent.vStallAt(a) * 1.5) {
      desired = M3.norm(M3.V(a.fwd.x, -0.3, a.fwd.z));
      ab = true; throttle = 1;
    }
    return { dir: desired, throttle: throttle, ab: ab };
  }

  /* ============================================================
     规避：把来袭导弹放在 3/9 线，同时保能量
     ============================================================ */
  function evade(a, m, world) {
    var toM = M3.norm(M3.sub(m.pos, a.pos));
    var dist = M3.dist(m.pos, a.pos);

    // 垂直于导弹方向（水平面内）的规避方向
    var perp = M3.cross(toM, M3.V(0, 1, 0));
    if (M3.len(perp) < 0.15) perp = M3.cross(toM, M3.V(0, 0, 1));
    if (M3.len(perp) < 0.15) perp = M3.V(1, 0, 0);
    perp = M3.norm(perp);

    // 用位置相关的常数选一边，避免左右横跳
    var side = (Math.sin(a.pos.x * 0.01 + a.pos.z * 0.013) > 0) ? 1 : -1;

    /* 按来袭弹的类型选防御（批次 5d；只给 skill ≥ 0.6，低技能保持下面统一的"3/9 线 + 俯冲"）：
         半主动（sarh）→ 打断锁定：相对**发射机**把自己放在 3/9 线，让它的锥追不上我（它丢锁，弹就瞎）
         红外        → 硬拉爬升 + 不开加力（加力的热信号只会让它咬得更紧）
         其余雷达    → 照旧（3/9 线凹口 + 箔条）*/
    if (a.ai && a.ai.skill >= 0.6 && m.w) {
      if (m.w.tags && m.w.tags.sarh && m.owner && m.owner.alive) {
        var toO = M3.norm(M3.sub(m.owner.pos, a.pos));
        var pO = M3.cross(toO, M3.V(0, 1, 0));
        if (M3.len(pO) > 0.15) {
          pO = M3.norm(pO);
          return { dir: M3.norm(M3.V(a.fwd.x * 0.2 + pO.x * side * 1.6, dist < 900 ? -0.4 : -0.05, a.fwd.z * 0.2 + pO.z * side * 1.6)), throttle: 1, ab: dist < 2600 };
        }
      } else if (m.w.seeker === 'ir' || m.w.seeker === 'eo') {
        return { dir: M3.norm(M3.V(a.fwd.x * 0.25 + perp.x * side * 1.2, 0.45, a.fwd.z * 0.25 + perp.z * side * 1.2)), throttle: 1, ab: false };
      }
    }
    // 太近时改为向下俯冲把导弹拖入稠密大气
    var dive = -0.12;
    if (dist < 900) dive = -0.55;

    var dir = M3.norm(M3.V(
      a.fwd.x * 0.35 + perp.x * side * 1.5,
      dive,
      a.fwd.z * 0.35 + perp.z * side * 1.5
    ));

    // 保能量：俯冲时加油门
    return { dir: dir, throttle: 1, ab: dist < 2600 };
  }

  /* ============================================================
     超调失误（低技能，v3.6.2）

     进到近距（MIN..MAX）又在接近时，**登记一次**：之后 HOLD 秒内期望方向向"继续直飞"混入 BLEND，
     转弯收得不干净，自然飞过头再回头。目标本来就在机头正前时混入没有差别，所以迎头的正常接近不受影响。
     登记之后 CD 秒内不再登记；时长随技能递减（SKILL.overshoot），≥ 0.7 的不触发。
     随机只用私有 LCG，且只在登记那一刻抽一次。
     ============================================================ */
  $.OVERSHOOT = { MIN: 500, MAX: 1800, HOLD0: 0.6, HOLD_SPAN: 1.2, CD: 10, BLEND: 0.6 };
  $.overshoot = function (a, s, desired, dT) {
    var O = $.OVERSHOOT, k = $.SKILL.overshoot(s);
    if (k <= 0) return desired;
    if (!(s.overT > 0) && !(s.overCd > 0) && dT > O.MIN && dT < O.MAX && s.target && s.target.kind !== 'target' && !s.searching) {
      var tv = s.target.vel || M3.V(0, 0, 0);
      if (M3.dot(M3.sub(a.vel, tv), M3.sub(s.target.pos, a.pos)) > 0) {         // 正在接近
        s.overT = (O.HOLD0 + O.HOLD_SPAN * $.rnd01(s)) * k;
        s.overCd = O.CD;
        s.overshoots = (s.overshoots || 0) + 1;
      }
    }
    if (s.overT > 0) return M3.norm(M3.add(M3.mul(desired, 1 - O.BLEND), M3.mul(a.fwd, O.BLEND)));
    return desired;
  };

  /* ============================================================
     咬尾攻防（v3.6.3，技能值 SKILL.shakeTail / holdTail）

     摆脱咬尾：有敌机把我当目标、落在机尾锥（REAR_COS）内且 < SHAKE_R 时开始计时 tailT（离开则快速衰减）；
       超过反应延迟 reactT(s) 后，期望方向向"垂直于攻击者视线的横向 + 略俯冲"混入 k×MIX（k = shakeTail），
       技能高的（≥ SCISSOR）每 FLIP 秒换一侧（剪刀机动）；速度不足时给满油门。不碰 Math.random：转向侧只在开始时用私有 LCG 抽一次。
     保持咬尾：目标在机头前方锥内、同向、< HOLD_R 时，期望方向向"提前量点"混入 k×MIX，
       并按目标速度调油门（目标速度 + 距离差修正），避免冲过头；返回 { dir, throttle } 或 null。
     ============================================================ */
  $.TAIL = { SHAKE_R: 2600, REAR_COS: -0.5, SHAKE_MIX: 0.85, SCISSOR: 0.75, FLIP: 2.4, HOLD_R: 2600, HOLD_COS: 0.8, HOLD_MIX: 0.8 };

  $.shakeTail = function (a, s, world, dt, desired) {
    var T = $.TAIL, k = $.SKILL.shakeTail(s), chaser = null, bd = T.SHAKE_R, i, e;
    for (i = 0; i < world.actors.length; i++) {
      e = world.actors[i];
      if (!e.alive || e === a || !Ent.hostile(e, a) || e.target !== a) continue;
      var d = M3.dist(e.pos, a.pos);
      if (d >= bd) continue;
      if (M3.dot(a.fwd, M3.mul(M3.sub(e.pos, a.pos), 1 / Math.max(1, d))) < T.REAR_COS) { bd = d; chaser = e; }
    }
    if (!chaser) { s.tailT = Math.max(0, (s.tailT || 0) - dt * 2); if (s.tailT <= 0) s.tailSide = 0; return null; }
    s.tailT = (s.tailT || 0) + dt;
    if (k <= 0 || s.tailT < $.SKILL.reactT(s)) return null;
    if (!s.tailSide) { s.tailSide = $.rnd01(s) < 0.5 ? -1 : 1; s.tailFlip = T.FLIP; s.tailBreaks = (s.tailBreaks || 0) + 1; }
    if (k >= T.SCISSOR) { s.tailFlip -= dt; if (s.tailFlip <= 0) { s.tailSide = -s.tailSide; s.tailFlip = T.FLIP; } }
    var los = M3.norm(M3.sub(a.pos, chaser.pos));                         // 攻击者 → 我
    var perp = M3.norm(M3.cross(M3.V(0, 1, 0), los));
    var dive = a.pos.y > 2500 ? -0.3 : 0.05;
    var brk = M3.norm(M3.add(M3.mul(perp, s.tailSide), M3.V(0, dive, 0)));
    var m = k * T.SHAKE_MIX;
    return { dir: M3.norm(M3.add(M3.mul(desired, 1 - m), M3.mul(brk, m))), ab: k > 0.5 };
  };

  $.holdTail = function (a, s, desired, dT, res) {
    var T = $.TAIL, k = $.SKILL.holdTail(s), t = s.target;
    if (k <= 0 || !t || !t.alive || t.kind === 'target' || s.searching || dT >= T.HOLD_R || !t.fwd) return null;
    var los = M3.mul(M3.sub(t.pos, a.pos), 1 / Math.max(1, dT));
    if (M3.dot(a.fwd, los) < T.HOLD_COS || M3.dot(a.fwd, t.fwd) < 0.3) return null;          // 没咬住 / 迎头
    var tv = t.vel || M3.mul(t.fwd, t.speed || 0);
    var tl = Math.max(0.2, Math.min(1.5, dT / Math.max(200, a.speed || 300)));
    var aimDir = M3.norm(M3.sub(M3.add(t.pos, M3.mul(tv, tl)), a.pos));
    var m = k * T.HOLD_MIX;
    var vMil = (a.phys && a.phys.vMil) || 400;
    var vWant = (t.speed || 0) + Math.max(-100, Math.min(150, (dT - 700) * 0.25));
    var thr = Math.max(0.3, Math.min(1, vWant / vMil));
    return { dir: M3.norm(M3.add(M3.mul(desired, 1 - m), M3.mul(aimDir, m))), throttle: res.throttle * (1 - k) + thr * k, ab: vWant > vMil * 0.98 };
  };

  /* ============================================================
     对地攻击（M2 里敌方地面设施不需要，但玩家僚机需要打平台）
     ============================================================ */
  function strafeTarget(a, t, world) {
    var desired = leadTo(a, t);
    return { dir: desired, throttle: 0.9, ab: false };
  }
})(AI);
