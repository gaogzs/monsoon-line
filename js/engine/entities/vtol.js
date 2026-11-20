(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.stepVtol = stepVtol; $.vtolWatch = vtolWatch; $.vtolWingK = vtolWingK;

  /* ============================================================
     垂直起降（批次 6.2）：低速区的独立飞行分支

     主路径（stepAircraft）是运动学模型：vel = fwd × speed，速度钳在 [0.42 vStall, 1.12 vMax]，
     没有侧滑和竖直速度，装不下悬停。带 ac.vtol 的机型在速度掉到 transSpeed 以下时
     由 stepAircraft 末尾的 vtolWatch 置 a.vtolOn，之后每帧整个交给本文件；
     速度回到 transSpeed × EXIT_K 以上且机头与速度基本对齐时，a.vtolOn 清掉，主路径接着飞。

     速度是自由矢量 a.vel（与机头解耦），每帧写回 a.speed = |vel|，武器 / 相机 / HUD 读的还是 a.speed、a.vel。
     受力（加速度，m/s²）：
       重力        (0, −G, 0)，机翼升力随速度混入，抵消**垂直于速度方向**的那一部分（wingK）
       升力推力    沿机体 up（推力矢量朝下），大小由"辅助悬停"给：按竖直速度追踪油门指令，
                   并按 1/cosθ 补偿倾斜 —— 倾斜后推力的水平分量就是**横向漂移**，不另外加
       前向推力    沿机头 fwd，油门推到 0.85 以上才开（发动机喷口转向后方）
       阻力        −drag × vel，翼升力起来后减弱
     速度大于 wingV 之后机翼托住全部重量，升力推力随 (1 − wingK) 归零；
     速度矢量以 align 的时间常数被拉向机头（气流跟着机体走），与主路径的 vel = fwd × speed 在交接点连续。

     油门轴语义（控制层 control.js 对 vtolOn 的特例）：
       0.50   定高悬停；0.50 → 0.85 爬升（到 vzUp），0.50 → 0.04 下降（到 vzDown）
       0.85 → 1.25  前向推力渐开（松手回落到 0.85）
     姿态：RCS 式固定角速率（ac.vtol.rcs），不吃动压与 ctrlFactor；a.ctrlAuth 写 1（steerTo / HUD 读它）。
     本批不做着舰：触地和主路径一样直接坠毁。
     ============================================================ */
  var D = Math.PI / 180;
  var EXIT_K = 1.08;                      // 退出悬停分支的速度 = transSpeed × EXIT_K（和进入点之间留滞回）
  var EXIT_ANGLE = 12 * D;                // 退出时速度矢量与机头的最大夹角（再大就继续留在本分支里对齐）
  var VZ_GAIN = 1.6;                      // 竖直速度误差 → 竖直加速度（1/s）
  var AZ_UP = 9, AZ_DOWN = 6;             // 辅助悬停给出的竖直加速度上下限（m/s²）
  var PITCH_DOWN_K = 0.6;                 // 推杆（机头向下）比拉杆弱一点，沿用主路径"向上强于向下"的方向

  /* 机翼升力系数：0 = 纯喷流托举（悬停），1 = 机翼托住全部重量 */
  function vtolWingK(vt, v) {
    var r = v / Math.max(1, vt.wingV);
    return Math.min(1, r * r);
  }

  /* 主路径每帧调用：速度掉到 transSpeed 以下就进悬停分支。进入时 vel = fwd × speed，天然连续。 */
  function vtolWatch(a) {
    var vt = a.ac && a.ac.vtol;
    if (vt && !a.vtolOn && a.speed < vt.transSpeed) a.vtolOn = true;
  }

  function stepVtol(a, dt, world) {
    var vt = a.ac.vtol, ph = a.phys, p = $.effectivePhys(a), G = $.G;
    var vel = a.vel || M3.mul(a.fwd, a.speed);
    var vPrev = vel;
    var v = M3.len(vel);
    var wk = vtolWingK(vt, v);
    a.vtolWk = wk;
    a.q = $.qOf(a.pos.y, v) / 1000;
    a.stall = false; a.sink = 0; a.ctrlAuth = 1;

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

    // ---- 受力 ----
    var vh = v > 1e-3 ? M3.mul(vel, 1 / v) : a.fwd;
    var gVec = M3.V(0, -G, 0);
    var gPerp = M3.sub(gVec, M3.mul(vh, M3.dot(gVec, vh)));
    var acc = M3.sub(gVec, M3.mul(gPerp, wk));                 // 机翼升力抵消垂直于速度的那部分重力
    var th = M3.clamp(a.throttle === undefined ? 0.5 : a.throttle, 0, 1.25);
    var vzFrac = th >= 0.5 ? M3.clamp((th - 0.5) / 0.35, 0, 1) : -M3.clamp((0.5 - th) / 0.46, 0, 1);
    var vzCmd = vzFrac >= 0 ? vzFrac * vt.vzUp : vzFrac * vt.vzDown;
    a.vtolVz = vzCmd;                                          // HUD：指令竖直速度
    var tf = vt.fwdAccel * M3.clamp((th - 0.85) / 0.4, 0, 1);
    if (tf) acc = M3.add(acc, M3.mul(a.fwd, tf));
    acc = M3.sub(acc, M3.mul(vel, vt.drag * (1 - 0.7 * wk)));
    var lk = 1 - wk;
    if (lk > 0.02 && a.up.y > 0.1) {
      var azDes = M3.clamp((vzCmd - vel.y) * VZ_GAIN, -AZ_DOWN, AZ_UP);
      var tl = M3.clamp((azDes - acc.y) / (lk * Math.max(0.35, a.up.y)), 0, vt.liftG * G);
      acc = M3.add(acc, M3.mul(a.up, tl * lk));
    }
    vel = M3.add(vel, M3.mul(acc, dt));

    // ---- 气流跟着机体走：速度矢量被拉向机头（大小不变），翼升力越足越快 ----
    if (wk > 0.01) {
      var v2 = M3.len(vel);
      if (v2 > 1) {
        var vn = M3.mul(vel, 1 / v2);
        var cosA = M3.clamp(M3.dot(vn, a.fwd), -1, 1), ang1 = Math.acos(cosA);
        if (ang1 > 1e-4) {
          var ax = M3.cross(vn, a.fwd), axl = M3.len(ax);
          if (axl > 1e-9) vel = M3.rotAxis(vel, M3.mul(ax, 1 / axl), ang1 * (1 - Math.exp(-vt.align * wk * dt)));
        }
      }
    }
    a.vel = vel;
    a.speed = M3.len(vel);

    // 载荷因数（G 表）：同 PSM —— 速度的实际变化量加 1G 投到机体 up 轴
    if (dt > 1e-4) {
      var aAct = M3.mul(M3.sub(vel, vPrev), 1 / dt);
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

    // ---- 退出：速度够了、速度矢量与机头基本对齐，交还主路径（vel = fwd × speed，此时夹角 ≤ EXIT_ANGLE，连续）----
    if (a.speed > vt.transSpeed * EXIT_K && M3.dot(M3.norm(a.vel), a.fwd) > Math.cos(EXIT_ANGLE)) a.vtolOn = false;

    $.stepAircraftTail(a, dt, world);
  }
})(Ent);
