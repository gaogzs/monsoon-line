(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.stepPSM = stepPSM; $.psmGate = psmGate; $.psmStart = psmStart; $.psmAbort = psmAbort; $.psmEnergy = energy; $.psmQLimit = qLimit; $.clRel = clRel; $.cdRel = cdRel;

  /* ============================================================
     过失速机动（PSM）：按住 X 进行，松开结束
     光标越过极点之后，机体姿态可以指向机头后方，但速度仍沿着机头 ——
     PSM 是**速度矢量与机头解耦**的独立分支：stepAircraft 开头判 a.psm 非空
     就整个交给这里，不碰主路径的姿态 / 速度段（不触发 PSM 的场景逐帧不变）。

     物理刻意不引入质量、推力这些现实量，全部以 vStall 为基准归一化：
       升力   G·(v / vStall)²·CLrel(α)·n̂      CLrel(临界攻角) = 1 = "vStall 时 1 g"，与现有失速定义一致
       阻力   (decel / vMax²)·v²·CDrel(α)      CDrel(0) = 1，90° 约 5 倍（平板）
       推力   accel·PSM_THRUST_K·throttle·fwd
       重力
       速度方向被机头拉着转（PSM_PULL·sin α）：只靠上面的升力，速度矢量在 vStall 附近
       1 g 的升力下几乎转不动，机头一掉头 α 就冲过 180°。这一项是"气流跟着机体走"的近似，
       速度大小不变（能量只由阻力与重力消耗）。文档原设计只有前四项，实测收敛不了。
     姿态不写新控制律：updateMouseAim 已经用 AI.steerTo 把机头指向 aimDir 并写 a.ctrl，
     这里只消费 a.ctrl，按 PSM_MAX_RATE 转机头，并随攻角降低舵效（a.ctrlAuth）。
     ============================================================ */
  $.PSM_MIN_AGL = 2000;            // 起手最低离地高度（m）
  $.PSM_SAFE_AGL = 600;            // 低于它且还在下降 → 中止并拉平（m）
  $.PSM_MAX_RATE = 2.2;            // 机头最大角速率（rad/s）
  $.PSM_MIN_ANGLE = 45;            // 光标与机头夹角至少这么大才能起手（度）；小于它用常规转弯就够了
  $.PSM_THRUST_K = 0.6;            // 推力加速度 = accel × K
  $.PSM_MIN_SPEED_K = 0.7;         // 速度 < K·vStall → 转入失速坠落段
  $.PSM_FALL_DROP = 2.4;           // 坠落段低头力矩（rad/s，按失速深度放大）
  $.PSM_FALL_VANE = 1.0;           // 坠落段风标：机头被拉向速度方向的角速率（rad/s）
  $.PSM_FALL_AUTH = 0.25;          // 坠落段舵效
  $.PSM_FALL_MAX_T = 12;           // 坠落段保险超时（s）
  $.PSM_BLEED_MIN = 0.35;          // 额外掉速随速度（v/vMax）变化，但低速也有这个下限，保证一直按住必然耗尽
  $.PSM_BLEED = 0.9;               // 额外掉速 = decel × 这个系数（沿速度反向）：PSM 的代价是能量，用久了必然失速
  $.PSM_RECOVER_S = 0.8;           // 结束后低舵效恢复（s），stepAircraft 读 a.psmRecover
  $.PSM_AUTH_MIN = 0.45;           // 90° 攻角时的舵效系数
  $.PSM_Q_K = 4;                   // 起手动压上限 = K × 失速速度下的海平面动压（Pa）；随机型与高度变化
  $.PSM_E_VK = 0.1;                // 起手所需速度 = vStall + K·(vMax − vStall)
  $.PSM_LIFT_MAX = 8;              // 升力加速度上限（g）
  $.PSM_LIFT_K = 1;                // 升力放大（高攻角下速度被拉向机头的快慢）
  $.PSM_PULL = 0.8;                // 机头带动速度方向转向机头的角速率上限（rad/s），随 sin α 变化
  $.PSM_ALPHA_MAX = 100;           // 机头相对速度的最大攻角（度）：机头领先速度不超过它
  $.PSM_LEVEL_AGL = 1000;          // 拉平模式在高于它且不再下降时解除（m）

  var D = Math.PI / 180;

  function smooth01(t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  /* 升力系数（相对）：α ≤ 20° 线性升到 1；20–35° 峰值 1.0–1.15；35–90° 缓降到 ≈ 0.55；
     超过 90° 按 180° − α 镜像（机体已经倒着迎风）。 */
  function clRel(deg) {
    var a = Math.abs(deg);
    if (a > 90) a = 180 - a;
    if (a <= 20) return a / 20;
    if (a <= 35) return 1 + 0.15 * Math.sin((a - 20) / 15 * Math.PI);
    return 1 - 0.45 * smooth01((a - 35) / 55);
  }
  /* 阻力系数（相对）：0° 为 1，90° 为 5，之后镜像。 */
  function cdRel(deg) {
    var a = Math.abs(deg);
    if (a > 90) a = 180 - a;
    var s = Math.sin(a * D);
    return 1 + 4 * s * s;
  }

  /* 比能（J/kg）：½v² + g·离地高度。 */
  function energy(a) {
    return 0.5 * a.speed * a.speed + $.G * Math.max(0, $.agl(a));
  }
  /* 起手所需的最小比能：速度至少是 vStall + K·(vMax − vStall)，且在最低起手高度之上。
     由机型 vStall / vMax 推导，保证结束时仍高于失速速度。 */
  function energyMin(a) {
    var p = $.effectivePhys(a);
    var v = p.vStall + $.PSM_E_VK * (p.vMax - p.vStall);
    return 0.5 * v * v + $.G * $.PSM_MIN_AGL;
  }

  /* 起手动压上限（Pa）：K × ½ρ₀·vStall²。以失速速度的动压为尺子：重型机失速快、上限也高，
     而且是**动压**不是空速 —— 海平面 K = 4 时是 2 倍 vStall，高空空气稀薄同样的上限对应更大的空速，
     HUD 的 Q 表（kPa）上能直接看到。 */
  function qLimit(a) {
    var p = $.effectivePhys(a);
    return $.PSM_Q_K * 0.5 * $.RHO0 * p.vStall * p.vStall;
  }

  /* 能不能起手。返回 { ok, reason }，reason 供 SysNote 选文案：
     noPSM / noAim / level / front / low / fast / energy（现在不再提示，调用方静默忽略） */
  function psmGate(a, world, aimDir) {
    if (a.tags && a.tags.noPSM) return { ok: false, reason: 'noPSM' };
    if (!aimDir) return { ok: false, reason: 'noAim' };
    if (a.psmLevel) return { ok: false, reason: 'level' };
    if (M3.dot(aimDir, a.fwd) > Math.cos($.PSM_MIN_ANGLE * D)) return { ok: false, reason: 'front' };
    if ($.agl(a) < $.PSM_MIN_AGL) return { ok: false, reason: 'low' };
    if ($.qOf(a.pos.y, a.speed) > qLimit(a)) return { ok: false, reason: 'fast' };
    if (energy(a) < energyMin(a)) return { ok: false, reason: 'energy' };
    return { ok: true };
  }

  function psmStart(a) {
    a.psm = { t: 0, e0: energy(a), v0: a.speed, aoa: 0, aoaMax: 0, phase: 'pull', hp0: a.hp };
    a.sink = 0;
    if (!a.vel) a.vel = M3.mul(a.fwd, a.speed);
  }

  /* 结束（正常收敛或中止）：速度投影回机头，出口速度连续；清控制量（player.ctrl 是持久对象，
     不清会残留旧值）；挂低舵效恢复。 */
  function psmFinish(a, world, why) {
    var st = a.psm;
    if (!st) return;
    var v = M3.len(a.vel);
    a.speed = v;
    a.vel = M3.mul(a.fwd, v);
    a.sink = 0;
    a.ctrl.pitch = 0; a.ctrl.roll = 0; a.ctrl.yaw = 0;
    a.psmRecover = $.PSM_RECOVER_S;
    var loss = st.e0 > 0 ? Math.max(0, 1 - energy(a) / st.e0) : 0;
    a.psmEnd = { why: why, loss: loss, t: st.t, aoaMax: st.aoaMax, dv: v - st.v0 };
    a.psm = null;
  }

  /* 松开 X、切到键盘模式、被击毁等外部结束。 */
  function psmAbort(a, world, why) {
    if (!a.psm) return;
    if (a.psm.fall && why === 'release') return;      // 坠落段松开 X 不改出，要靠速度回到 vStall
    psmFinish(a, world, why || 'abort');
  }

  /* 消费 a.ctrl 转机头；f = 当前舵效系数 */
  function applyCtrl(a, p, f, dt) {
    var pIn = M3.clamp(a.ctrl.pitch, -1, 1);
    var rIn = M3.clamp(a.ctrl.roll, -1, 1);
    var yIn = M3.clamp(a.ctrl.yaw, -1, 1);
    var rate = $.PSM_MAX_RATE * f;
    if (pIn) {                                    // 抬头为正 → 绕 right 转负角；推杆只有拉杆的一半（与主路径一致）
      var ang = -pIn * (pIn >= 0 ? 1 : 0.5) * rate * dt;
      a.fwd = M3.rotAxis(a.fwd, a.right, ang);
      a.up = M3.rotAxis(a.up, a.right, ang);
    }
    if (rIn) {
      var ang2 = -rIn * p.roll * M3.clamp(f * 1.8, 0.28, 1) * dt;
      a.right = M3.rotAxis(a.right, a.fwd, ang2);
      a.up = M3.rotAxis(a.up, a.fwd, ang2);
    }
    if (yIn) {
      var ang3 = yIn * rate * 0.6 * dt;
      a.fwd = M3.rotAxis(a.fwd, a.up, ang3);
      a.right = M3.rotAxis(a.right, a.up, ang3);
    }
  }

  /* 失速坠落段：速度耗到 PSM_MIN_SPEED_K·vStall 以下就接管，松开 X 也不再中断。
     不再有升力与"速度被机头拉着转"，只剩推力 / 阻力 / 重力：机头在低头力矩与风标效应下掉下去，
     速度矢量跟着重力走，不会像主路径那样沿着机头慢慢爬。速度回到 vStall 以上且机头已低于地平线约 24°（俯冲改出）才结束，
     出口时 vel 投影回 fwd，此时 fwd 已经朝下，连续。 */
  function stepFall(a, dt, world, p, st) {
    st.fallT = (st.fallT || 0) + dt;
    st.phase = 'fall';
    var f = $.PSM_FALL_AUTH;
    a.ctrlAuth = f;
    applyCtrl(a, p, f, dt);
    var vel0 = a.vel, v = Math.max(1, M3.len(vel0)), vh = M3.mul(vel0, 1 / v);
    var stK = M3.clamp((p.vStall - v) / p.vStall, 0, 1);
    var drop = $.PSM_FALL_DROP * (0.4 + stK) * dt;           // 低头力矩（与主路径同向，但更狠）
    a.fwd = M3.rotAxis(a.fwd, a.right, drop); a.up = M3.rotAxis(a.up, a.right, drop);
    var ang = Math.acos(M3.clamp(M3.dot(a.fwd, vh), -1, 1));  // 风标：机头被气流拉向速度方向
    if (ang > 1e-4) {
      var ax = M3.cross(a.fwd, vh), axl = M3.len(ax);
      if (axl > 1e-9) {
        var d = Math.min(ang, $.PSM_FALL_VANE * dt), axn = M3.mul(ax, 1 / axl);
        a.fwd = M3.rotAxis(a.fwd, axn, d); a.up = M3.rotAxis(a.up, axn, d); a.right = M3.rotAxis(a.right, axn, d);
      }
    }
    var B = M3.orthonormalize(a.fwd, a.up);
    a.fwd = B.fwd; a.up = B.up; a.right = B.right;
    var aoa = Math.acos(M3.clamp(M3.dot(a.fwd, vh), -1, 1)) / D;
    st.aoa = Math.atan2(M3.dot(a.fwd, M3.norm(M3.sub(a.up, M3.mul(vh, M3.dot(a.up, vh))))), M3.dot(a.fwd, vh)) || 0;
    st.aoaMax = Math.max(st.aoaMax, aoa);
    var th = M3.clamp(a.throttle === undefined ? 1 : a.throttle, 0.3, 1);
    var dragA = (p.decel / Math.max(1, p.vMax * p.vMax)) * v * v * cdRel(aoa);
    var acc = M3.mul(a.fwd, p.accel * $.PSM_THRUST_K * th);
    acc = M3.add(acc, M3.mul(vh, -dragA));
    acc.y -= $.G;
    var vel = M3.add(vel0, M3.mul(acc, dt));
    a.vel = vel; a.speed = M3.len(vel); a.sink = 0;
    if (dt > 1e-4) {
      var aAct = M3.mul(M3.sub(vel, vel0), 1 / dt);
      var nRaw = (M3.dot(aAct, a.up) + $.G * a.up.y) / $.G;
      if (a.gNow === undefined) a.gNow = 1;
      a.gNow += (nRaw - a.gNow) * Math.min(1, dt / 0.15);
    }
    a.pos = M3.add(a.pos, M3.mul(a.vel, dt));
    var gy = $.groundY(a.pos.x, a.pos.z);
    if (a.pos.y <= gy + 2) { a.pos.y = gy + 2; a.psm = null; $.kill(a, world, true); return; }
    st.off = a.aimDir ? Math.acos(M3.clamp(M3.dot(a.aimDir, a.fwd), -1, 1)) : 0;
    if ($.agl(a) < $.PSM_SAFE_AGL && a.vel.y < 0) { psmFinish(a, world, 'ground'); a.psmLevel = true; }
    else if ((a.speed >= p.vStall && a.fwd.y < -0.4) || st.fallT > $.PSM_FALL_MAX_T) psmFinish(a, world, 'recover');
    $.stepAircraftTail(a, dt, world);
  }

  function stepPSM(a, dt, world) {
    var st = a.psm;
    var p = $.effectivePhys(a);
    st.t += dt;
    if (st.fall) return stepFall(a, dt, world, p, st);

    // ---- 姿态：消费 a.ctrl（updateMouseAim 经 steerTo 写的），舵效随攻角降低 ----
    var f = 1 - (1 - $.PSM_AUTH_MIN) * Math.min(1, Math.abs(st.aoa) / (90 * D));
    a.ctrlAuth = f;
    applyCtrl(a, p, f, dt);
    var B = M3.orthonormalize(a.fwd, a.up);
    a.fwd = B.fwd; a.up = B.up; a.right = B.right;

    // ---- 速度：向量积分，与机头解耦 ----
    var vel = a.vel || M3.mul(a.fwd, a.speed);
    var v = Math.max(1, M3.len(vel));
    var vh = M3.mul(vel, 1 / v);

    /* 机头领先速度的角度封顶：速度靠升力 / 阻力追机头，追得上才叫机动；
       机头想转得比速度快时就停在 PSM_ALPHA_MAX 处等它（绕垂直于两者的轴把机头转回来）。 */
    var cosA = M3.dot(a.fwd, vh);
    var ang0 = Math.acos(M3.clamp(cosA, -1, 1));
    var aMax = $.PSM_ALPHA_MAX * D;
    if (ang0 > aMax) {
      var ax = M3.cross(vh, a.fwd);
      var axl = M3.len(ax);
      if (axl > 1e-6) {
        var back = M3.mul(ax, 1 / axl);
        var dRot = aMax - ang0;                   // 负：往速度方向转回
        a.fwd = M3.rotAxis(a.fwd, back, dRot);
        a.up = M3.rotAxis(a.up, back, dRot);
        a.right = M3.rotAxis(a.right, back, dRot);
        B = M3.orthonormalize(a.fwd, a.up);
        a.fwd = B.fwd; a.up = B.up; a.right = B.right;
      }
    }
    var upP = M3.sub(a.up, M3.mul(vh, M3.dot(a.up, vh)));
    var nl = M3.len(upP);
    var nHat = nl > 1e-4 ? M3.mul(upP, 1 / nl) : M3.norm(M3.cross(a.right, vh));
    var alpha = Math.atan2(M3.dot(a.fwd, nHat), M3.dot(a.fwd, vh));     // 带符号，抬头为正
    var aDeg = alpha / D;
    st.aoa = alpha;
    st.aoaMax = Math.max(st.aoaMax, Math.abs(aDeg));

    var vr = v / p.vStall;
    var liftA = Math.min($.PSM_LIFT_MAX * $.G, $.PSM_LIFT_K * $.G * vr * vr * clRel(aDeg));
    var sgn = Math.abs(aDeg) > 90 ? -1 : 1;                              // 倒着迎风时升力反向
    if (alpha < 0) sgn = -sgn;
    var dragA = (p.decel / Math.max(1, p.vMax * p.vMax)) * v * v * cdRel(aDeg);
    var th = M3.clamp(a.throttle === undefined ? 1 : a.throttle, 0.3, 1);
    var vel0 = vel;
    var acc = M3.mul(a.fwd, p.accel * $.PSM_THRUST_K * th);
    acc = M3.add(acc, M3.mul(nHat, liftA * sgn));
    acc = M3.add(acc, M3.mul(vh, -dragA - p.decel * $.PSM_BLEED * Math.max($.PSM_BLEED_MIN, v / p.vMax)));
    acc.y -= $.G;
    vel = M3.add(vel, M3.mul(acc, dt));
    /* 速度方向被机头拉着转：只用升力，速度矢量在 vStall 附近 1 g 的升力下几乎转不动
       （转弯率 = 加速度 / 速度），机头一掉头 α 就冲过 180°。这一项是"气流跟着机体走"的
       近似：速度大小不变（能量只由阻力与重力消耗），方向以 PSM_PULL·sin α 的角速率追机头。 */
    var ang1 = Math.acos(M3.clamp(M3.dot(M3.norm(vel), a.fwd), -1, 1));
    if (ang1 > 1e-4) {
      var ax2 = M3.cross(vel, a.fwd);
      var ax2l = M3.len(ax2);
      if (ax2l > 1e-9) {
        var dth = Math.min(ang1, $.PSM_PULL * Math.sin(Math.min(ang1, Math.PI / 2)) * dt);
        vel = M3.rotAxis(vel, M3.mul(ax2, 1 / ax2l), dth);
      }
    }
    a.vel = vel;
    a.speed = M3.len(vel);
    a.sink = 0;

    // 载荷因数（G 表）：用这一步速度的**实际**变化量（含"速度被机头拉着转"那一项）加 1G 投到机体 up 轴，同主路径的平滑
    if (dt > 1e-4) {
      var aAct = M3.mul(M3.sub(vel, vel0), 1 / dt);
      var nRaw = (M3.dot(aAct, a.up) + $.G * a.up.y) / $.G;
      if (a.gNow === undefined) a.gNow = 1;
      a.gNow += (nRaw - a.gNow) * Math.min(1, dt / 0.15);
    }
    a.pos = M3.add(a.pos, M3.mul(a.vel, dt));

    var aGy = $.groundY(a.pos.x, a.pos.z);
    if (a.pos.y <= aGy + 2) {
      a.pos.y = aGy + 2;
      a.psm = null;
      $.kill(a, world, true);
      return;
    }

    // ---- 阶段（只给 HUD / 统计）----
    var aim = a.aimDir;
    var off = aim ? Math.acos(M3.clamp(M3.dot(aim, a.fwd), -1, 1)) : 0;
    st.off = off;
    st.phase = (off < 20 * D) ? 'settle' : (Math.abs(aDeg) < 60 && M3.dot(a.fwd, vh) > 0.5 && st.t < 1.2 ? 'pull' : 'turn');

    // ---- 中止（正常结束由玩家松开 X：input.js keyup → psmAbort）----
    var agl = $.agl(a);
    if (agl < $.PSM_SAFE_AGL && a.vel.y < 0) {
      psmFinish(a, world, 'ground');
      a.psmLevel = true;                          // 屏蔽 PSM 直到脱离低空，控制层换成改平目标
    } else if (a.speed < $.PSM_MIN_SPEED_K * p.vStall) {
      st.fall = true;                              // 能量耗尽：转入失速坠落，松开 X 也不再中断
    }

    $.stepAircraftTail(a, dt, world);
  }
})(Ent);
