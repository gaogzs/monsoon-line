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

  /* ============================================================
     航线巡航的能量保护（按动压算）—— 给 brain.js 的 updateRoute 用

     以前航线的高度保持是开关式的：低了 150 m 就固定以 0.34（约 20°）爬升，油门固定 0.95，不看速度余量，
     也没有仰角上限。推力小、空气稀的飞机（勤务机、干扰机、运输机）会一路掉速直到失速，冲高再俯冲改出。

     飞行模型里剩余推力 = accel·(1 − (v/vT)²) = accel·(1 − q/q_T)，q = ½ρv² 是动压，q_T 是目标速度对应的动压；
     失速速度对应的动压 q_stall = ½ρ·vStall²，q/q_stall = (v/vStall)² 就是升力余量。爬升时重力沿航迹掉速 g·fwd.y。
       ① 能持续爬多陡：  sinγ_max = [accel·(1 − q/q_T) + (v − v_floor)/τ] / g
          v_floor = K·vStall(预测高度)，预测高度按**当前垂直速度**外推 τ 秒（不用固定前瞻）。
          速度比下限高多少，就多出多少「用动能换高度」的空间；已经低于下限，梯度变负（先降下来把速度找回来）
       ② 机头不得高过  min(0.42, sinγ_max + 0.05)：路线跟随不是空战机动，大角度转向时飞控「先滚转再拉杆」
          会把杆一直压在 1.0，机头冲到 50°，掉速失速（巨砾 @m8）
       ③ 航线高度钳到可持续高度：vT(y) ≥ K·vStall(y) 的最高 y —— 超过它平飞都撑不住
     限制不起作用时（sinγ_max ≥ 0.34、机头没超限、高度可持续）updateRoute 原样走旧公式，一位不差。

     实测排除过的做法（别再试）：把转弯阻力计入预算、按预算限拉杆量（水准反而更差）、单纯加大 K。
     K = CEIL_MARGIN（1.05，有效升限处军推速度比失速速度高 5%）+ 0.05 余量。 */
  var RT_THR = 0.95, RT_K = 1.10, RT_TAU = 10, RT_G = 9.81;
  var RT_CLIMB = 0.34, RT_NOSE_OVER = 0.08;
  $.RT_CLIMB = RT_CLIMB;

  function rtVT(a, y) { return Ent.vTargetAt(a, a._pe, y, RT_THR, false); }

  // 最高可持续高度（m）：vT(y) ≥ K·vStall(y)，比值随高度单调下降，二分
  $.routeAltMax = function (a) {
    Ent.vStallAt(a);                                      // 顺带刷新 a._pe（含挂载折算的 accel / vMil / vStall0）
    var pe = a._pe, lo = 0, hi = 30000, m, i;
    function ok(y) { return rtVT(a, y) >= RT_K * pe.vStall0 * Ent.stallK(y); }
    if (ok(hi)) return hi;
    for (i = 0; i < 14; i++) { m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return lo;
  };

  // 以航线油门能**持续**爬升的最大梯度（sinγ）。yTop = 想去的绝对高度（预测高度不超过它）
  $.routeClimbCap = function (a, yTop) {
    Ent.vStallAt(a);
    var pe = a._pe, y0 = a.pos.y, rho = Ent.airDensity(y0), v = a.speed;
    var vT = rtVT(a, y0);
    var q = 0.5 * rho * v * v, qT = 0.5 * rho * vT * vT;
    var yP = Math.min(Math.max(yTop, y0), y0 + Math.max(0, a.vel ? a.vel.y : 0) * RT_TAU);
    var vSP = pe.vStall0 * Ent.stallK(yP);
    var vFloor = RT_K * vSP;                               // √(2·q_floor/ρ)，q_floor = K²·q_stall(yP)
    var excess = pe.accel * Math.max(0, 1 - q / qT);
    return (excess + (v - vFloor) / RT_TAU) / RT_G;
  };

  // 路线跟随时机头 fwd.y 的上限（超过就按超出量压杆）
  $.routeNoseLimit = function (climbCap) { return Math.min(RT_CLIMB + RT_NOSE_OVER, climbCap + 0.05); };

  /* 机头超过上限时把杆压回去。机头 fwd.y 对杆量的响应取决于机体朝向：
       俯仰杆 ∝ up.y（正拉 = 机头朝机体上方转，倒飞时机体上方是世界下方）；
       偏航杆 ∝ right.y（右偏航把机头转向 right 方向，其 y 分量就是 right.y）。
     ① 俯仰：压杆的方向看 up.y 的符号，只在「这根杆正把机头往上推」（ctrl.pitch · up.y > 0）时压。
        正飞时与「杆量 > 0 就压成负」逐位一致。以前写成 ctrl.pitch > 0 就压负：steerTo 为了往下降翻成倒飞再拉杆时，
        这里反而把杆压成 −1，倒飞的 −1 是把机头往世界上方推，水准在 K = 1.4 时就这样一路冲到 21.5 km 再失速。
     ② 偏航：大坡度（|right.y| > 0.5，约 30° 以上）时俯仰杆几乎没有垂直操纵权（坡度 77° 时 up.y 只有 0.22），
        能放下机头的是偏航杆（|right.y| ≈ 0.97），右坡度（right.y < 0）要正偏航、左坡度要负偏航。
        巨砾 @m8 在大坡度转弯里被卡在 25° 仰角、直线爬了 50 秒（冲到 8.7 km），就是因为只有俯仰这一个通道。 */
  $.routeNoseGuard = function (a, ctrl, noseLim) {
    if (a.fwd.y > noseLim) {
      var ex = Math.min(1, (a.fwd.y - noseLim) * 3);
      if (ctrl.pitch * a.up.y > 0) ctrl.pitch = -(a.up.y > 0 ? 1 : -1) * ex;
      if (Math.abs(a.right.y) > 0.5) ctrl.yaw = (a.right.y < 0 ? 1 : -1) * ex;
    }
  };
})(AI);
