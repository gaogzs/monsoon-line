(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     能量管理与加力策略（docs/POST2-0IMPL.md 5.7，批次 5d）

     项目里没有燃油，所以不做油耗模型：用"角点速度门限"决定加力，而不是"远了就开"。
     只给 skill ≥ ELITE_SKILL 的飞行员；低技能保持 pursue() 原来的行为（> 2600 m 就开）。
       收敛（> 2600 m）：速度低于角点 × 1.15 才开加力（够快就省着，进狗斗时能量更足）
       狗斗（≤ 2600 m）：速度低于角点 × 0.9 才开加力（保住转弯能量）
       红外威胁（有红外弹以我为目标，< 6000 m）：不开加力（irSignature 的 ab 项 ×3）
     yo-yo：近距缠斗、速度掉到角点 × 0.8 以下时，压机头俯冲换速度；速度 > 角点 × 1.25 且转不进去时上升 yo-yo（抬高期望方向爬升掉速，防飞过头）。
     ============================================================ */
  $.ELITE_SKILL = 0.72;

  $.energy = function (a) { return 0.5 * a.speed * a.speed + 9.81 * a.pos.y; };

  // 角点速度（转弯最有效的速度）的估计：失速速度与军推最大速度的中点
  $.cornerSpeed = function (a) { return 0.5 * (Ent.vStallAt(a) + (a.phys.vMil || a.phys.vMax)); };

  $.irThreat = function (a, world) {
    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (m.alive && m.target === a && m.w && (m.w.seeker === 'ir' || m.w.seeker === 'eo') && M3.dist(m.pos, a.pos) < 6000) return true;
    }
    return false;
  };

  // pursue 给出的 res 之上，elite 以上按能量重新定加力；返回新的 ab
  $.abPolicy = function (a, s, res, dist, world) {
    if (s.skill < $.ELITE_SKILL) return res.ab;
    if ($.irThreat(a, world)) return false;
    var corner = $.cornerSpeed(a);
    var k = $.temper(s).abK || 1;                  // 性格：激进更爱开加力、谨慎更省
    return dist > 2600 ? a.speed < corner * 1.15 * k : a.speed < corner * 0.9 * k;
  };

  // yo-yo：缠斗中速度太低，压机头换速度
  $.yoyo = function (a, s, dir, dist) {
    if (s.skill < $.ELITE_SKILL || dist > 1800) return dir;
    var corner = $.cornerSpeed(a);
    if (a.speed < corner * 0.8) return M3.norm(M3.V(dir.x, Math.min(dir.y, -0.2), dir.z));       // 低速：压机头换速度
    /* 上升 yo-yo：太快且这一圈转不进去（目标在机头 > 32° 之外）→ 把期望方向抬高，用爬升吃掉多余速度，
       避免飞过头；爬升掉速到 1.25 倍角点以下自然结束。过低（< 1200 m）不抬，免得和近地保护打架。 */
    if (a.speed > corner * 1.25 && dist > 300 && a.pos.y > 1200 && M3.dot(a.fwd, dir) < 0.85) {
      return M3.norm(M3.V(dir.x, Math.max(dir.y, 0.5), dir.z));
    }
    return dir;
  };
})(AI);
