(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     甩脱来袭导弹的多策略（v3.6.4；技能值 SKILL.evade 决定会哪些、做得多狠）

     tactics.js 的 evade() 在 skill ≥ EVADE.MIN_SKILL 时先走这里；返回 null 才回退到旧的"3/9 线 + 俯冲"基线。
     每枚来袭弹选一个策略执行 PLAN_T 秒（私有 LCG，只在选 / 换时抽），到时、换弹、或进出末段（TERM 内）时重选。
     选择依据：导引头类型 × 距离 / TTI × 自身态势（高度 / 速度 / 弹在不在身后）× 技能 × 性格（TEMPER.evW）。

       beam      3/9 线：把来袭弹放在侧面，逼它不断修正（雷达弹基线）
       beamOwner 对半主动弹：相对**发射机**放 3/9 线，让发射机的锥追不上我（它丢锁，弹就瞎）
       climb     拉起爬升：高空空气稀薄，导弹转弯率随密度降低（turnFactor）；红外弹的首选（不开加力）
       dive      俯冲换速度（离地 > 2.5 km）
       jink      横向蛇行（每 0.5–0.9 s 换侧 + 上下起伏）：打乱导弹的一阶提前量，中远距用
       run       背向来袭弹全速跑（弹在身后、弹已掉速到 < 1.4 倍我速）：拖到弹的动能耗尽
       corkscrew 绕视线轴螺旋滚转：导弹要持续改变修正方向，转弯一直在耗速度
       breakIn   末段（< 1.5 km）朝来袭弹方向 + 侧向硬转：LOS 角速度骤增，弹转不过来
       splitS    半滚倒转俯冲（离地 > 3.5 km，k ≥ 0.7）：一口气换方向又换高度
     光电 / 激光弹箔条骗不到（flare 概率 0）：技能够的 AI 不再白放诱饵，只靠机动（brain.js 里按 $.flareUseless 判）。
     ============================================================ */
  $.EVADE = { MIN_SKILL: 0.4, PLAN_T0: 1.1, PLAN_T1: 1.1, TERM: 1500, JINK_T0: 0.5, JINK_T1: 0.4, SPIN: 2.6 };

  /* 光电 / 激光导引头不吃干扰弹 */
  $.flareUseless = function (s, m) {
    return !!(m && m.w && (m.w.seeker === 'eo' || m.w.seeker === 'laser') && $.SKILL.evade(s) > 0);
  };

  function seekerClass(m) {
    if (m.w && m.w.tags && m.w.tags.sarh && m.owner && m.owner.alive) return 'sarh';
    var sk = m.w && m.w.seeker;
    if (sk === 'ir') return 'ir';
    if (sk === 'eo' || sk === 'laser') return 'eo';
    return 'radar';
  }

  /* 候选策略与权重；每项都带前置条件，权重 0 = 不入选 */
  function weights(a, s, m, st) {
    var k = st.k, W = {}, ag = Ent.agl(a), cls = st.cls, T = $.temper(s).evW || {};
    W.beam = (cls === 'ir' ? 0.4 : (cls === 'eo' ? 0.5 : 1.0));
    if (cls === 'sarh') W.beamOwner = 3.0;
    if (k >= 0.3 && a.pos.y < 14000 && a.speed >= (a.phys.vMil || 300) * 0.6) W.climb = cls === 'ir' ? 1.6 : 0.45;
    if (ag > 2500) W.dive = 0.6;
    if (k >= 0.3 && st.dist > 1500) W.jink = st.dist > 2500 ? 1.6 : 1.0;        // 远距时蛇行最管用（实测：近距纯机动都躲不掉，要靠诱饵）
    if (k >= 0.4 && st.tti > 2 && st.behind && st.mSpeed < a.speed * 1.4) W.run = 1.4;    // 弹已经掉速到接近我速（< 1.4 倍）才值得跑：刚出膛、还在加速的弹跑不掉
    if (k >= 0.6 && st.dist > 900 && st.dist < 3300) W.corkscrew = cls === 'eo' ? 1.8 : (cls === 'ir' ? 1.5 : 1.1);
    if (k >= 0.45 && st.dist < $.EVADE.TERM) W.breakIn = 2.0;
    if (k >= 0.7 && st.dist < 2000 && ag > 3500) W.splitS = 1.0;
    for (var p in W) W[p] *= (T[p] || 1);
    // 技能越高越偏离最基础的 beam
    W.beam *= (1.2 - 0.7 * k);
    return W;
  }

  function pick(W, s) {
    var tot = 0, p;
    for (p in W) tot += Math.max(0, W[p]);
    var r = $.rnd01(s) * tot;
    for (p in W) { r -= Math.max(0, W[p]); if (r <= 0) return p; }
    return 'beam';
  }

  $.evadeStrat = function (a, s, m, world, dt) {
    if (s.skill < $.EVADE.MIN_SKILL || !m.w) return null;
    dt = dt || 1 / 60;
    var E = $.EVADE;
    var toV = M3.sub(m.pos, a.pos), dist = Math.max(1, M3.len(toV)), toM = M3.mul(toV, 1 / dist);
    var vrel = M3.sub(m.vel || M3.mul(m.fwd, m.speed || 800), a.vel || M3.V(0, 0, 0));
    var closing = Math.max(150, -M3.dot(vrel, toM));
    var st = { k: $.SKILL.evade(s), dist: dist, tti: dist / closing, cls: seekerClass(m),
      behind: M3.dot(a.fwd, toM) < -0.2, mSpeed: m.speed || 800 };

    var term = dist < E.TERM;
    if (s.evFor !== m || s.evT <= 0 || s.evTerm !== term || !s.evPlan) {
      s.evFor = m; s.evTerm = term;
      s.evPlan = pick(weights(a, s, m, st), s);
      s.evT = E.PLAN_T0 + E.PLAN_T1 * $.rnd01(s);
      s.evSide = $.rnd01(s) < 0.5 ? 1 : -1;
      s.evFlip = E.JINK_T0 + E.JINK_T1 * $.rnd01(s);
      s.evPhase = 0;
    }
    s.evT -= dt;
    var side = s.evSide, plan = s.evPlan, up = M3.V(0, 1, 0);
    var perp = M3.cross(toM, up);
    if (M3.len(perp) < 0.15) perp = M3.cross(toM, M3.V(0, 0, 1));
    if (M3.len(perp) < 0.15) perp = M3.V(1, 0, 0);
    perp = M3.norm(perp);

    var dir, throttle = 1, ab = dist < 2600;
    switch (plan) {
      case 'beamOwner': {
        var toO = m.owner && m.owner.alive ? M3.norm(M3.sub(m.owner.pos, a.pos)) : null;
        var pO = toO ? M3.cross(toO, up) : null;
        if (!pO || M3.len(pO) < 0.15) { dir = M3.norm(M3.V(a.fwd.x * 0.35 + perp.x * side * 1.5, dist < 900 ? -0.4 : -0.1, a.fwd.z * 0.35 + perp.z * side * 1.5)); break; }
        pO = M3.norm(pO);
        dir = M3.norm(M3.V(a.fwd.x * 0.2 + pO.x * side * 1.6, dist < 900 ? -0.4 : -0.05, a.fwd.z * 0.2 + pO.z * side * 1.6));
        break;
      }
      case 'climb':
        dir = M3.norm(M3.V(a.fwd.x * 0.25 + perp.x * side * 0.9, 1.0, a.fwd.z * 0.25 + perp.z * side * 0.9));
        ab = st.cls !== 'ir' && dist < 2600;
        break;
      case 'dive':
        dir = M3.norm(M3.V(a.fwd.x * 0.35 + perp.x * side * 0.8, -0.65, a.fwd.z * 0.35 + perp.z * side * 0.8));
        ab = true;
        break;
      case 'jink':
        s.evFlip -= dt;
        if (s.evFlip <= 0) { s.evSide = side = -side; s.evFlip = E.JINK_T0 + E.JINK_T1 * $.rnd01(s); s.evPhase += 1; }
        dir = M3.norm(M3.V(a.fwd.x * 0.45 + perp.x * side * 1.3, ((s.evPhase % 2) ? 0.3 : -0.3), a.fwd.z * 0.45 + perp.z * side * 1.3));
        ab = true;
        break;
      case 'run':
        dir = M3.norm(M3.V(-toM.x + perp.x * side * 0.25, Math.max(-0.1, -toM.y) + 0.05, -toM.z + perp.z * side * 0.25));
        ab = true;
        break;
      case 'corkscrew': {
        s.evPhase += dt * E.SPIN * side;
        var cp = Math.cos(s.evPhase), sp = Math.sin(s.evPhase);
        if (Ent.agl(a) < 1500 && sp < 0) sp = -sp * 0.3;           // 低空不往下拧
        dir = M3.norm(M3.V(a.fwd.x * 0.3 + perp.x * cp * 1.4, sp * 1.0, a.fwd.z * 0.3 + perp.z * cp * 1.4));
        ab = true;
        break;
      }
      case 'breakIn':
        dir = M3.norm(M3.V(toM.x * 0.55 + perp.x * side * 1.5, dist < 700 ? -0.3 : 0.3, toM.z * 0.55 + perp.z * side * 1.5));
        ab = dist > 700;
        break;
      case 'splitS':
        dir = M3.norm(M3.V(a.fwd.x * 0.15 + perp.x * side * 1.2, -0.9, a.fwd.z * 0.15 + perp.z * side * 1.2));
        ab = true;
        break;
      default: {                                                   // beam
        var dv = dist < 900 ? -0.55 : -0.12;
        dir = M3.norm(M3.V(a.fwd.x * 0.35 + perp.x * side * 1.5, dv, a.fwd.z * 0.35 + perp.z * side * 1.5));
      }
    }
    return { dir: dir, throttle: throttle, ab: ab, plan: plan };
  };
})(AI);
