(function (AI) {
  'use strict';
  var $ = AI.$;
  $.steerTo = steerTo;

  /* ============================================================
     steerTo —— 把"想要去的方向"翻译成三轴杆量

     返回 {pitch, roll, yaw}，pitch>0 抬头、roll>0 右滚、yaw>0 右偏。
     st 可选：一个持久对象（玩家 / AI 实体本身），存上一帧的计划
     （planAlpha / lastRollCmd / 瞄准角速度），让决策有惯性、不来回跳。

     三个参考系必须分清：
       机体系   a.fwd / a.right / a.up，随滚转翻过来
       镜头系   追尾镜头不滚转，up 恒为世界 up —— 所以"相对镜头改平"
                就是机翼相对世界水平：right.y = 0 且 up.y > 0
       世界系   desired 本身就在这里

     ---------- 一个连续的代价函数，而不是几套规则拼起来 ----------

     目标在机体横截面上的方位 φ = atan2(rx, ux)：0 = 座舱正上方，
     ±π = 机腹正下方。离轴角 θ = 机头与目标的夹角。

     飞控在每一帧沿一条弧考虑"再滚多少 δ"（见下面的候选弧），滚完之后目标方位变成 φ−δ，
     剩下的离轴角按这个方位拆给俯仰和偏航：
         俯仰需求 θ·cos(φ−δ)   正 = 拉杆，负 = 推杆（推杆权限只有一半）
         偏航需求 θ·sin(φ−δ)
     三根轴各自要花的时间按**这架飞机此刻的真实角速率**算
     （phys × 动压舵效），合成耗时 T(δ)。再加两项：
         姿态代价   λ(θ)·(滚完之后的坡度)²   —— θ 越小 λ 越大
         负 G 代价  推杆另外扣一点（飞行员扛不住、机翼也先失速）

     于是从小到大推鼠标时会自然经过这几段（以左下方为例）：
         很小   姿态代价压倒一切 → 不滚，推杆 + 左偏航
         变大   滚转开始划算 → 慢慢左倾，推杆减少、偏航变成斜的
         越过   滚到目标方位越过机体横轴 → cos 过零，推杆连续地变成拉杆
         很大   δ → φ，偏航 → 0，纯拉杆 —— 用升力矢量去转
     没有任何阈值或开关 —— α 是离轴角的一个连续函数，交叉点由物理算出。

     鼠标停住（θ → 0）时只剩姿态代价，最小值就是"滚回镜头水平"，
     飞机会以一个温和的滚转速率自己改平 —— 不会再带着坡度一直飞。

     低动压、重挂载时各轴角速率按比例变，分配也跟着变。
     ============================================================ */
  var STEER_LAMBDA0 = 1.6;

  // θ=0 时的姿态代价系数（秒 / rad²）
  var STEER_THETA0 = 0.10;

  // 姿态代价随 θ 衰减的特征角（≈6°）
  var STEER_NEG_G = 0.35;

  // 推杆附加代价（秒 / rad）
  var STEER_ALPHA_RATE = 0.11;

  // α 每帧向目标走的比例（60 fps 下约 0.15 s）
  var STEER_YAW_W = 2.0;

  // 偏航耗时加权 —— 侧滑本身就不舒服
  var STEER_PUSH_K = 0.5;

  // 与 entities.js 的 PITCH_DOWN_K 一致

  /* 执行层增益（1/s）。飞机在这里没有转动惯量 —— 杆量直接就是角速率 ——
     所以"误差 × 增益 ÷ 最大角速率"就是一个无过冲的一阶收敛：
     机头会以时间常数 1/K 停在目标上，不会来回摆。 */
  var K_ROLL = 5.0, K_PITCH = 3.2, K_YAW = 3.2;

  var LEVEL_ROLL_CAP = 0.35;

  // 纯改平时的滚转杆量上限（不快不慢）

  // 没有 phys 的调用方（测试桩、临时实体）按一架中等战斗机算
  var STEER_DEF_PHYS = { pitch: 0.7, roll: 3.0, yaw: 0.3 };

  function wrapPi(x) {
    while (x > Math.PI) x -= Math.PI * 2;
    while (x < -Math.PI) x += Math.PI * 2;
    return x;
  }

  /* 瞄准方向的角速度前馈（只在调用方给了 dt 时启用 —— 也就是玩家）。

     鼠标在拖动时，瞄准点相对机头的**误差**其实不大（几度），
     但它在以每秒几十度的速度移动。只看误差的话，飞控会以为这是
     一次"小修正"，用推杆 + 偏航去侧滑着追，永远不压坡度。
     所以先估计瞄准方向自己的角速度，再往前看一小段：
         规划用 STEER_LEAD_PLAN —— 决定"要不要滚过去拉"
         执行用 STEER_LEAD_EXEC —— 抵消比例控制的稳态滞后，
                                   机头在持续转弯时也能压在准星上
     AI 的 desired 会在不同分支之间跳，不适合求导，所以不传 dt。 */
  var STEER_LEAD_PLAN = 1.2;

  var STEER_LEAD_EXEC = 1 / 3.2;

  // = 1 / K_PITCH
  var STEER_RATE_MAX = 1.6;

  // rad/s，估计值上限
  /* 角速度估计的低通时间常数（秒）。必须明显慢于一帧：鼠标增量是
     成块到达的，一次 40 px 的轻推落在一帧里就是几百 °/s，若直接拿去
     前瞻 1.2 s，飞控会以为玩家在急转、立刻滚过去。0.25 s 之后，
     一次性的轻推只留下几度的前瞻，持续拖动才会累积成真正的转弯需求。 */
  var STEER_RATE_TAU = 0.25;

  function leadDir(d, axis, w, t) {
    if (w < 1e-4) return d;
    return M3.norm(M3.rotAxis(d, axis, w * t));
  }

  function steerTo(a, desired, out, st, dt) {
    var desPlan = desired, desExec = desired;
    if (st && dt > 0) {
      if (st.prevDesired) {
        var cr = M3.cross(st.prevDesired, desired);
        var sn = M3.len(cr);
        var wRaw = sn > 1e-7 ? Math.min(Math.asin(Math.min(1, sn)) / dt, STEER_RATE_MAX) : 0;
        var vRaw = sn > 1e-7 ? M3.mul(cr, wRaw / sn) : M3.V(0, 0, 0);
        var kR = 1 - Math.exp(-dt / STEER_RATE_TAU);
        st.aimRate = st.aimRate ? M3.lerpV(st.aimRate, vRaw, kR) : M3.mul(vRaw, kR);
      }
      st.prevDesired = desired;
      if (st.aimRate) {
        var wA = M3.len(st.aimRate);
        if (wA > 1e-4) {
          var ax = M3.mul(st.aimRate, 1 / wA);
          desPlan = leadDir(desired, ax, wA, STEER_LEAD_PLAN);
          desExec = leadDir(desired, ax, wA, STEER_LEAD_EXEC);
        }
      }
    }

    // 规划几何（带前瞻）
    var fx = M3.dot(desPlan, a.fwd);
    var rx = M3.dot(desPlan, a.right);
    var ux = M3.dot(desPlan, a.up);
    var theta = Math.acos(M3.clamp(fx, -1, 1));
    var lateral = Math.sqrt(rx * rx + ux * ux);
    // 正后方 / 正前方时方位退化 —— 当作在座舱正上方（拉杆）
    var phi = lateral > 1e-5 ? Math.atan2(rx, ux) : 0;

    // 执行几何（短前馈）
    var ex = M3.dot(desExec, a.fwd);
    var erx = M3.dot(desExec, a.right);
    var eux = M3.dot(desExec, a.up);
    var thetaE = Math.acos(M3.clamp(ex, -1, 1));
    var phiE = Math.sqrt(erx * erx + eux * eux) > 1e-5 ? Math.atan2(erx, eux) : 0;

    /* ---- 这架飞机此刻每根轴能转多快（rad/s） ----
       与 entities.js stepAircraft 的公式一致；ctrlAuth 是它上一帧存下的
       舵效（动压 × 失速）。gLoad 只放大俯仰，这里不计 —— 它是玩家的选择。 */
    var p = a.phys || STEER_DEF_PHYS;
    var auth = (a.ctrlAuth === undefined) ? 1 : a.ctrlAuth;
    var wP = Math.max(1e-3, p.pitch * auth);
    var wR = Math.max(1e-3, p.roll * M3.clamp(auth * 1.8, 0.28, 1));
    var wY = Math.max(1e-3, p.yaw * auth);

    /* ---- 当前坡度（相对镜头水平），右倾为正 ----
       机头接近竖直时坡度无意义，姿态代价按水平分量衰减掉。 */
    var bank = Math.atan2(-a.right.y, a.up.y);
    var horiz = Math.sqrt(Math.max(0, 1 - a.fwd.y * a.fwd.y));
    var lam = STEER_LAMBDA0 * Math.exp(-theta / STEER_THETA0) * horiz;

    /* ---- 候选滚转只在一条弧上取 ----
       弧的一端是"改回镜头水平"（δL = −坡度），另一端是"把目标滚到
       座舱正上方"（δ = φ）。δ(α) = δL + α·(φ − δL)，α ∈ [0, 1]。

       为什么不在整圈上枚举：整圈里还有第三个局部最优 —— 往**反方向**
       滚，把目标放到机腹正下方纯推杆。它在物理上成立，但会让左下方的
       鼠标先引出一个右滚，再在某个幅度突然跳成左滚，正是要消掉的那种
       切换感。限制在这条弧上，从"推杆 + 偏航"到"纯拉杆"就是同一族解，
       α 随幅度单调连续地从 0 走到 1。 */
    var dL = wrapPi(-bank);
    /* 倒飞附近（|坡度| > 150°）往左改平和往右改平一样远，dL 会在 ±π 之间
       逐帧翻号。规则只有一条：**不要反着正在进行的滚转**。如果上一帧
       已经在往某边滚，就沿那边改平（必要时 dL ± 2π），而不是滚过倒飞点
       那一刻突然掉头、再从另一边转一大圈。 */
    var lastR = (st && st.lastRollCmd) || 0;
    if (Math.abs(bank) > 2.6 && Math.abs(lastR) > 0.05) {
      var side = lastR > 0 ? 1 : -1;
      if ((dL >= 0 ? 1 : -1) !== side) dL += side * Math.PI * 2;
    }
    /* 弧的另一端：把目标滚到头顶要滚 φ。目标接近机腹正下方（|φ| > 150°）时
       左滚右滚一样远，同样按"不反着正在进行的滚转"选边。
       弧直接取两端之差、不再取模 —— 两端各自已经选好了边，取模反而
       可能把它绕成长的那一边。 */
    var dT = phi;
    if (Math.abs(phi) > 2.6 && Math.abs(lastR) > 0.05) {
      var sideT = lastR > 0 ? 1 : -1;
      if ((phi >= 0 ? 1 : -1) !== sideT) dT += sideT * Math.PI * 2;
    }
    var span = dT - dL;
    if (Math.abs(span) > Math.PI * 1.5) span -= (span > 0 ? 1 : -1) * Math.PI * 2;

    /* 沿弧的代价：α = 0 是"保持（回到）水平，推拉杆 + 偏航"，
       α = 1 是"滚到目标在头顶，纯拉杆"。 */
    function cost(al, th) {
      var d = dL + al * span;
      var b = phi - d;
      var pNeed = th * Math.cos(b);
      var yNeed = th * Math.sin(b);
      var tr = Math.abs(d) / wR;
      var tp = pNeed >= 0 ? pNeed / wP : -pNeed / (wP * STEER_PUSH_K);
      var ty = Math.abs(yNeed) / wY * STEER_YAW_W;
      var bankAfter = wrapPi(bank + d);
      var lm = STEER_LAMBDA0 * Math.exp(-th / STEER_THETA0) * horiz;
      return Math.sqrt(tr * tr + tp * tp + ty * ty) + lm * bankAfter * bankAfter +
        (pNeed < 0 ? STEER_NEG_G * -pNeed : 0);
    }

    /* ---- 不取 argmin，而是求"交叉角" θc ----

       沿这条弧取最小值本来是最直接的做法，但偏航比滚转慢一个量级，
       "滚一半、靠偏航"的中间态永远最贵 —— 代价面是两个盆地，
       最优解会在某个幅度从 α≈0 一下跳到 α≈1。那正是要消掉的切换感。

       所以只用两个端点：求出 θc，使"保持水平去修"与"滚过去拉"
       在这架飞机此刻的角速率下耗时相同；然后 α 在 0.5θc → 1.5θc 之间
       用 smoothstep 连续过渡。θc 本身来自物理 —— 低动压、滚转慢、
       偏航强的飞机，它会自己变大或变小 —— 但 α 对鼠标幅度是连续的。 */
    var thC;
    var gLo = cost(0, 0) - cost(1, 0);
    if (Math.abs(span) < 1e-3) {
      thC = 0;
    } else if (gLo >= 0) {
      thC = 0;                                  // 连"保持水平"都比滚过去贵（已经大坡度）
    } else {
      var lo = 0, hi = Math.PI;
      if (cost(0, hi) - cost(1, hi) < 0) {
        thC = 1e9;                              // 永远不值得滚过去
      } else {
        for (var it = 0; it < 22; it++) {
          var mid = 0.5 * (lo + hi);
          if (cost(0, mid) - cost(1, mid) < 0) lo = mid; else hi = mid;
        }
        thC = 0.5 * (lo + hi);
      }
    }
    var alpha;
    // 弧长为零时 α 无意义，沿用上一帧，免得把计划状态冲掉
    if (Math.abs(span) < 1e-3) alpha = (st && st.planAlpha !== undefined) ? st.planAlpha : 0;
    else if (thC <= 0) alpha = 1;
    else if (thC >= 1e8) alpha = 0;
    else if (st && dt > 0) {
      /* 玩家（鼠标引导）在**左右转**时用更宽的过渡带：0.4θc → 3θc。
         典型战机 θc 只有 10° 左右，原来的 0.5θc → 1.5θc 意味着
         鼠标横移十几度就整机滚满再拉杆。拉宽之后小幅度左右转
         只压一部分坡度，剩下的交给偏航 + 斜拉杆，大幅度才滚满。
         按目标的侧向分量 |sin φ| 混合：正上 / 正下方的目标仍走原来的
         窄过渡带 —— 推杆俯冲时半滚不滚会在竖直附近原地连滚。 */
      var sw = Math.abs(Math.sin(phi));
      var uP = M3.clamp((theta / thC - (0.5 - 0.1 * sw)) / (1 + 1.6 * sw), 0, 1);
      alpha = uP * uP * (3 - 2 * uP);
    } else {
      var u = M3.clamp(theta / thC - 0.5, 0, 1);
      alpha = u * u * (3 - 2 * u);
    }

    /* 时间上再平滑一次（约 0.15 s）。偏航比滚转慢一个量级，
       所以"一半滚、一半偏航"这种中间态在代价上确实偏贵，最优解在
       某个幅度会从"推杆 + 偏航"一侧换到"滚过去拉"一侧。物理上这是对的，
       但不能是一帧之内的跳变 —— 平滑之后它是一个看得见的、渐进的滚入。 */
    if (st) {
      var aPrev = (st.planAlpha === undefined) ? 0 : st.planAlpha;
      alpha = aPrev + (alpha - aPrev) * STEER_ALPHA_RATE;
      st.planAlpha = alpha;
    }
    var delta = dL + alpha * span;

    /* 滚转有没有必要：两种理由取大者。
         改平的理由 —— 机头越接近竖直，"机翼水平"越没有意义
                       （坡度在那里只是数值噪声）
         转向的理由 —— 离轴角越大越需要把升力矢量对过去
       两者都弱（机头竖直 + 误差只有几度）时不滚，交给俯仰 / 偏航直接修。
       否则机头指着正下方时飞机会追着一个噪声坡度原地转好几圈。 */
    var hw = M3.clamp((horiz - 0.15) / 0.45, 0, 1);
    var tw = M3.clamp(theta / 0.14, 0, 1);
    var needRoll = Math.max(hw * hw * (3 - 2 * hw), tw * tw * (3 - 2 * tw));
    delta *= needRoll;

    // ---- 执行 ----
    // 滚转：纯改平时限速，真要转向时放开
    var tl = M3.clamp(theta / 0.09, 0, 1);
    var cap = LEVEL_ROLL_CAP + (1 - LEVEL_ROLL_CAP) * tl * tl * (3 - 2 * tl);
    var rollCmd = M3.clamp(delta * K_ROLL / wR, -cap, cap);

    /* 俯仰 / 偏航按**滚完之后**的方位分配，并随剩余滚转量淡入：
       还要滚 90° 以上时不拉不推（边滚边死拉会把升力甩到斜下方），
       滚到位时就是当前的真实误差。 */
    var bPlan = phiE - delta;
    var prog = Math.max(0, Math.cos(delta));
    var eP = thetaE * Math.cos(bPlan) * prog;
    var eY = thetaE * Math.sin(bPlan) * prog;
    var pitchCmd = eP >= 0 ? eP * K_PITCH / wP : eP * K_PITCH / (wP * STEER_PUSH_K);
    var yawCmd = eY * K_YAW / wY;

    out.pitch = M3.clamp(pitchCmd, -1, 1);
    out.roll = rollCmd;
    if (st) st.lastRollCmd = rollCmd;
    out.yaw = M3.clamp(yawCmd, -1, 1);
    return out;
  }
})(AI);
