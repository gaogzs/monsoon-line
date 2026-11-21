(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.stepVtol = stepVtol; $.vtolWatch = vtolWatch; $.vtolWingK = vtolWingK; $.vtolSpeedTarget = vtolSpeedTarget;

  /* ============================================================
     垂直起降（批次 6.2，v3.7.1 重设计）：低速区的独立分支

     设计语义（玩家看到的）：
       推力  只代表玩家**期望的前进速度**（沿机体自己的前向，不是世界水平），不直接产生升力。
             喷口向后时（速度够高）它就是普通飞机的引擎推力 —— 主路径本来就是"推力 → 期望速度"，这里同一套算法。
       悬浮  推力 0% = 期望速度 0 = 静止悬浮（机身放平时；倾斜会像直升机一样平移，见下）；0 → 50% 期望速度从 0 升到 vStall（固定翼刚能平飞的速度），越低越接近悬浮。
       不下坠  只由**实际速度**决定：速度低于 vStall 时机翼托不住，喷口转向补上升力缺口；
               推力对应的期望速度不变，与油门挡位、机头俯仰都无关。
       下降  只有减速板（推力在慢车以下）才会悬浮下降；仰头在低速时按仰角给爬升率，低头不下降。

     实现：vtolOn 时整帧交给这里（stepAircraft 末尾的 vtolWatch 置位）。算法和主路径同形——标量速度沿机头、
     推力 / 阻力 / 重力沿航迹 / 转弯掉速——只多三件事：
       ① 期望速度曲线 vtolSpeedTarget（主路径对 VTOL 机型也用它，两个分支的油门含义连续）
       ② 升力缺口 Ld = G·(1 − wk)，wk = min(1,(v/vStall)²)（与主路径失速下沉同一个比值）由喷口垂直分量补上，
          喷口总推力预算 A = jetT·G × 挂载折扣 × η(高度)，剩给前向的 Af = √(A² − Ld²)：速度越低、缺口越大、能用于加速的越少，喷口越朝下
       ③ 只在低速生效的悬停能力（gate = 1 − wk）：减速板下降、仰头上升（a.vtolVy 以 vAccel 趋近目标，加到 vel.y）
     喷口出力上限：随空气密度衰减（η = (ρ/ρ₀)^jetExp），高处要推更高的指令才托得住，满指令仍不够就被迫下降（vtolSink），
     所以悬停有一个随挂载变化的升限（海马默认挂载约 6.3 km、空载约 9–10 km），不是想悬在哪就悬在哪。
     vStall 以上 wk = 1：Ld = 0、gate = 0、公式与主路径完全一致，所以交接连续。
     姿态：RCS 式固定角速率（ac.vtol.rcs），不吃动压；a.ctrlAuth 写 1（steerTo / HUD 读它）。
     本批不做着舰：触地和主路径一样直接坠毁。
     ============================================================ */
  var D = Math.PI / 180;
  var EXIT_K = 1.04;                      // 退出悬停分支的速度 = 进入速度 × EXIT_K（和进入点之间留一点滞回，别抖）
  var EXIT_ANGLE = 12 * D;                // 退出时速度矢量与机头的最大夹角
  var CEIL_FADE = 800;                    // 有效升限以上，喷口出力衰减到 0 的高度跨度（m）
  var SINK_MAX = 140;                     // 托不住时的下沉速度上限（与主路径失速下沉同一个量级）
  var PITCH_DOWN_K = 0.6;                 // 推杆（机头向下）比拉杆弱一点，沿用主路径"向上强于向下"的方向
  /* 与 Game.THR_IDLE 同值（Ent 读不到 Game 的变量）：油门轴的"慢车"点，HUD 推力 0%，其下是减速板；
     tools/test/probes/probe-vtol.js 会比较两者，改一边忘了另一边会报错 */
  $.VTOL_THR_IDLE = 0.04;

  /* 翼升力系数：0 = 纯喷流托举（悬停），1 = 机翼托住全部重量。vStall 取有效值（随高度） */
  function vtolWingK(vStall, v) {
    var r = v / Math.max(1, vStall);
    return Math.min(1, r * r);
  }

  /* 油门 → 期望速度（推力 0% 慢车 → 0；0 → 50% 从 0 升到 vStall；50% → 100% 升到军推；加力 = 极速）。
     p = effectivePhys(a)。慢车以下（减速板）也是 0。 */
  function vtolSpeedTarget(a, p, th) {
    var tk = $.thrustK(a, a.pos.y);
    if (a.ab) return p.vMax * tk;
    th = M3.clamp(th === undefined ? 1 : th, 0, 1);
    if (th <= $.VTOL_THR_IDLE) return 0;
    var x = (th - $.VTOL_THR_IDLE) / (1 - $.VTOL_THR_IDLE);
    if (x < 0.5) return p.vStall * (x / 0.5);
    return M3.lerp(p.vStall, p.vMil * tk, (x - 0.5) / 0.5);
  }

  /* 主路径每帧调用：速度掉到 vStall × transK 以下就进悬停分支。进入时 vel = fwd × speed，天然连续。 */
  function vtolWatch(a, p) {
    var vt = a.ac && a.ac.vtol;
    if (vt && !a.vtolOn && a.speed < p.vStall * vt.transK) { a.vtolOn = true; a.vtolVy = 0; a.vtolSink = 0; a.vtolVh = { x: 0, z: 0 }; }
  }

  function stepVtol(a, dt, world) {
    var vt = a.ac.vtol, ph = a.phys, p = $.effectivePhys(a), G = $.G;
    var vPrev = a.vel || M3.mul(a.fwd, a.speed);
    var v = a.speed;
    var wk = vtolWingK(p.vStall, v);
    a.vtolWk = wk;
    a.q = $.qOf(a.pos.y, v) / 1000;
    a.stall = false; a.sink = 0; a.ctrlAuth = 1;      // a.stall 下面按喷口是否托得住重写

    // ---- 姿态：固定角速率，按挂载打折（与主路径同一份 effectivePhys 比值）----
    var rc = vt.rcs;
    var pitchR = rc.pitch * (p.pitch / ph.pitch), rollR = rc.roll * (p.roll / ph.roll), yawR = rc.yaw;
    var pIn = M3.clamp(a.ctrl.pitch, -1, 1), rIn = M3.clamp(a.ctrl.roll, -1, 1), yIn = M3.clamp(a.ctrl.yaw, -1, 1);
    if (pIn) {                                     // 抬头为正 → 绕 right 转负角
      var ang = -pIn * (pIn >= 0 ? 1 : PITCH_DOWN_K) * pitchR * dt;
      a.fwd = M3.rotAxis(a.fwd, a.right, ang);
      a.up = M3.rotAxis(a.up, a.right, ang);
    }
    a.rollRate = (a.rollRate || 0) + (rIn * rollR - (a.rollRate || 0)) * Math.min(1, dt / 0.14);
    if (Math.abs(a.rollRate) > 1e-4) {             // 右滚为正 → 绕 fwd 转负角
      var ang2 = -a.rollRate * dt;
      a.right = M3.rotAxis(a.right, a.fwd, ang2);
      a.up = M3.rotAxis(a.up, a.fwd, ang2);
    }
    if (yIn) {
      var ang3 = yIn * yawR * dt;
      a.fwd = M3.rotAxis(a.fwd, a.up, ang3);
      a.right = M3.rotAxis(a.right, a.up, ang3);
    }
    var B = M3.orthonormalize(a.fwd, a.up);
    a.fwd = B.fwd; a.up = B.up; a.right = B.right;

    // ---- 速度：主路径同形的标量速度，沿机头 ----
    var brake = !!a.brake || (a.throttle !== undefined && a.throttle < $.VTOL_THR_IDLE);
    var vT = brake ? 0 : vtolSpeedTarget(a, p, a.throttle);
    /* 升力缺口由喷口垂直分量补上。喷口的出力随空气密度衰减：满指令的实际推力预算
       A = jetT·G × 挂载折扣（effectivePhys.accel / phys.accel）× η(高度)，η = (ρ/ρ₀)^jetExp。高处要托住同样的重量得推更高的指令（jetLoad = 需要的推力 / A），
       到满指令仍不够就托不住（见下面的 vtolSink：被迫下降，降到密度够了才停）。
       剩下的预算给前向：期望速度不变，缺口越大 Af 越小，加速变慢、喷口偏下；速度上去缺口缩小，喷口转回后方。 */
    var Ld = G * (1 - wk);
    var eta = Math.pow($.airDensity(a.pos.y) / $.RHO0, vt.jetExp === undefined ? 0.8 : vt.jetExp);
    /* 有效升限（Ent.ceilingEff，min(数据升限, 失速升限)）以上，喷口出力在 CEIL_FADE 米内衰减到 0：
       喷口只按空气密度衰减的话，空载的 VTOL 能飞到明显高于自己升限的地方（13.5 km、速度远低于 vStall 也有升力），
       绕过全机型统一的"升限"设定（probe-stall-alt：升限以上 2500 m 必须撑不住）。升限以下 fade = 1，不受影响。 */
    var fade = M3.clamp(1 - (a.pos.y - $.ceilingEff(a)) / CEIL_FADE, 0, 1);
    var A = vt.jetT * G * (p.accel / ph.accel) * eta * fade;
    /* 剩给前向的推力：喷口预算扣掉升力后剩的 √(A² − Ld²)，但不低于主发动机推力的 fwdMin 倍（海马 0.7）——
       升力由升力喷口承担，主发动机的前向推力不会因为"要托住重量"而被吃光。否则越接近悬停升限越加速不动
       （满指令负荷 ≈ 100% 时前向预算趋近 0，推到 100% 要 20 多秒才能转入平飞）。 */
    var Af = Math.max(Math.sqrt(Math.max(0, A * A - Ld * Ld)), (vt.fwdMin === undefined ? 0.7 : vt.fwdMin) * p.accel);
    var acc, used = 0;
    if (v < vT) {
      var r2 = (v * v) / Math.max(1, vT * vT);
      /* 过渡加力：喷口向后转的低速段，前向加速度乘 (1 + transBoost·(1 − wk))，wk → 1 时回到 1，
         所以 vStall 以上与主路径公式仍然完全一致（交接连续）；没有它，从悬停推到 100% 要十几秒才转入平飞 */
      acc = Af * (1 + (vt.transBoost === undefined ? 0.6 : vt.transBoost) * (1 - wk)) * Math.min(1, $.THRUST_TAPER * (1 - r2));
      used = acc;
    } else {
      /* 与主路径 −decel·min(1,(r²−1)·4) 同形；期望速度很小 / 为 0 时分母取 8 m/s，
         免得 0 附近出现反向加速的抖动（vT ≥ 8 时与主路径完全一致） */
      var dn = Math.max(vT, 8);
      acc = -p.decel * Math.min(1, Math.max(0, v * v - vT * vT) / (dn * dn) * 4);
      if (brake) acc *= 1.8;
    }
    // 重力沿航迹：喷口托着时不掉速，随翼升力系数混入（vStall 以上与主路径一致）
    acc -= G * a.fwd.y * wk;
    // 转弯掉速：同主路径，乘 wk（低速时舵效来自喷口，不再额外掉速）
    var wTurn = Math.abs(pIn) * pitchR + Math.abs(yIn) * yawR;
    acc -= $.TURN_BLEED * wTurn * v * wk;
    a.speed = M3.clamp(v + acc * dt, 0, p.vMax * 1.12);
    a.vtolNoz = Math.atan2(Ld, Math.max(0, used));        // 喷口转角：0 朝后 … 90° 朝下（HUD / 以后的模型动画读）

    /* 直升机式平移：升力喷口沿机体 up 推，倾斜时多推一点保住竖直分量（Tl = Ld / cosθ），
       多出来的就是水平分量 —— 机头低头向前、仰头向后、右滚向右、左滚向左（Ld 随翼升力系数消失，高速时没有）。
       水平漂移速度 vh 单独积分、有阻力，松开姿态后慢慢收住；速度上来后阻力随 wk 加大，在交接点前自然并入前飞。 */
    var need = Ld / Math.max(0.35, a.up.y);                 // 要托住竖直分量需要的实际推力
    var tl = Math.min(need, A);                             // 实际给出的（封顶当前高度的预算）
    a.vtolJet = A > 0 ? need / A : 9;                       // 喷口负荷：1 = 满指令（HUD 显示；≥ 1 就托不住了）
    /* 满指令仍不够：差额变成往下的加速度累积成下沉速度（和主路径的失速下沉同形：差额不在时 0.9 s 内散掉），
       降到密度够了（η 回升、差额消失）才停 —— 悬停升限由喷口出力决定，随挂载（phys.accel 打折）变化 */
    var def = Math.max(0, Ld - tl * a.up.y);
    if (def > 0) a.vtolSink = Math.min(SINK_MAX, (a.vtolSink || 0) + def * dt);
    else if (a.vtolSink) { a.vtolSink *= Math.exp(-dt / 0.9); if (a.vtolSink < 0.05) a.vtolSink = 0; }
    /* 喷口托不住、正在下沉：HUD 照常报「失速」（不是常规失速——没有舵效损失和失速下沉——只借用同一条警告和提示音，
       让玩家知道"现在掉高度是因为升力不够"）；差额消失、下沉散掉之后自动解除 */
    a.stall = def > 0 || (a.vtolSink || 0) > 1;
    var vh = a.vtolVh || (a.vtolVh = { x: 0, z: 0 });
    var kd = vt.drag + 3 * wk;
    vh.x += (a.up.x * tl - kd * vh.x) * dt;
    vh.z += (a.up.z * tl - kd * vh.z) * dt;

    // ---- 只在低速生效的悬停能力：减速板下降、仰头上升（gate = 1 − wk，高速时为 0）----
    var gate = 1 - wk;
    var tgt = ((brake ? -vt.vzDown : 0) + vt.vzUp * Math.max(0, a.fwd.y)) * gate;
    a.vtolVz = tgt;                                        // HUD：指令竖直速度
    var vy = a.vtolVy || 0;
    a.vtolVy = vy + M3.clamp(tgt - vy, -vt.vAccel * dt, vt.vAccel * dt);

    a.vel = M3.mul(a.fwd, a.speed);
    a.vel.x += vh.x; a.vel.y += a.vtolVy - (a.vtolSink || 0); a.vel.z += vh.z;

    // 载荷因数（G 表）：同 PSM —— 速度的实际变化量加 1G 投到机体 up 轴
    if (dt > 1e-4) {
      var aAct = M3.mul(M3.sub(a.vel, vPrev), 1 / dt);
      var nRaw = (M3.dot(aAct, a.up) + G * a.up.y) / G;
      if (a.gNow === undefined) a.gNow = 1;
      a.gNow += (nRaw - a.gNow) * Math.min(1, dt / 0.15);
    }
    a.pos = M3.add(a.pos, M3.mul(a.vel, dt));

    var gy = $.groundY(a.pos.x, a.pos.z);
    if (a.pos.y <= gy + 2) {
      a.pos.y = gy + 2;
      a.vtolOn = false;
      $.kill(a, world, true);
      return;
    }

    // ---- 退出：速度够了、竖直辅助速度已经散掉，交还主路径（vel = fwd × speed，连续）----
    if (a.speed > p.vStall * vt.transK * EXIT_K && Math.abs(a.vtolVy) < 1.5 && Math.hypot(vh.x, vh.z) < 1.5 &&
        M3.dot(M3.norm(a.vel), a.fwd) > Math.cos(EXIT_ANGLE)) { a.vtolOn = false; a.vtolVy = 0; a.vtolSink = 0; vh.x = vh.z = 0; }

    $.stepAircraftTail(a, dt, world);
  }
})(Ent);
