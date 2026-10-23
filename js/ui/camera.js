(function (Game) {
  'use strict';
  var $ = Game.$;
  $.camPitchFor = camPitchFor; $.frameDeficit = frameDeficit; $.softClampFrame = softClampFrame; $.stepFrameExtra = stepFrameExtra; $.updateCamera = updateCamera;

  /* ============================================================
     相机
     ============================================================ */

  /* ---------- 追尾镜头的"出画处理" ----------

     飞机在镜头系里的位置是 −off：沿视线的深度 f、竖直偏移 u、水平偏移 r。
     u / f 除以 tan(半视场) 就是飞机在画面上的归一化纵坐标（±1 = 画面边缘），
     r / f 除以 tan(半视场)·宽高比 是横坐标。

     以前只有一种做法：用滞后的 camOff 判断，出画就瞬间沿视线后推。
     大机动时视线转得比 camOff 快，飞机横向偏到边 → 被推远 → 平滑又把
     深度拉回 → 又出画 → 又推远。纠正的是深度，误差却在横向，
     两者一直拉锯，镜头前后跳。现在拆成静态底座（三种模式共用）+
     动态处理（设置里三选一）：

       0 静态拉远   不做动态处理，只靠 camOff 平滑自然回中。
                    急转时飞机可能短暂贴边甚至出画一瞬，但镜头不会为了出画被额外推拉。
       1 侧滑软钳   画面 FRAME_FILL 以内不动，之外用 tanh 软压，渐近 FRAME_SOFT_LIM。
                    只改横向/竖向，不改深度：飞机大小不变、永不出画。
       2 拉远带滞回 需要时快速拉远（EXTRA_UP），需求消失后先保持 EXTRA_HOLD 秒
                    再慢慢收回（EXTRA_DOWN）。连续机动期间保持远距离，不来回跳。 */
  var FRAME_FILL = 0.7;

  // 静态底座 / C：飞机中心要落在画面中间 70% 以内
  $.FRAME_SOFT_LIM = 0.9;

  // B：软压的渐近上限，飞机中心不超过画面 90%
  var FRAME_MIN_DEPTH = 6;

  // 镜头最近不贴到机身 6 米以内
  var EXTRA_UP = 8;

  // C：拉远速率（约 0.12 s 跟上）
  var EXTRA_DOWN = 0.8;

  // C：收回速率（约 1–2 s 凑回）
  var EXTRA_HOLD = 0.6;

  // C：需求消失后保持多久才开始收回

  /* 鼠标引导时镜头俯仰与瞄准俯仰的映射：**天顶刚好卡在画面上沿**。

     瞄准方向（CMD）俯仰钳在 AIM_PITCH_LIM = 89°，永远过不了天顶；镜头若也
     跟到 89°，画面就是一片空天，而且离正交基退化只差 1°。反过来，镜头俯仰
     停在 90° − 半视场时，天顶正好投影在画面上沿 —— CMD 拉满时就贴着它，
     看起来能一直朝正上方飞，只是光标永远推不过那条边。天底同理卡在下沿。

     上限随 FOV 变（设置里实时拖 FOV 也对）：FOV 56° → 62°，38° → 71°，100° → 40°。

     映射：|瞄准| ≤ k 时镜头 = 瞄准（准星在画面正中）；之外
         镜头 = k + (A − k)·r·(1 − (1 − t)^(1/r))，t = (|瞄准| − k)/(A − k)，r = (上限 − k)/(A − k)
     在 k 处斜率为 1（衔接无折角），到 A 时正好等于上限且斜率为 0（平稳停住），全程单调。
     k = max(0, 2·上限 − A)：FOV 56° 时 k = 35°，35° 以下准星都在正中。 */
  function camPitchFor(aim, fovDeg) {
    var A = $.AIM_PITCH_LIM;
    var pMax = Math.PI / 2 - fovDeg * Math.PI / 360;
    var x = Math.min(Math.abs(aim), A);
    var k = Math.max(0, 2 * pMax - A);
    if (x <= k) return aim;
    var r = (pMax - k) / (A - k);
    var t = (x - k) / (A - k);
    return (aim < 0 ? -1 : 1) * (k + (A - k) * r * (1 - Math.pow(1 - t, 1 / r)));
  }

  function camBasis(camDir) {
    var r = M3.norm(M3.cross(M3.V(0, 1, 0), camDir));
    if (M3.len(r) < 0.5) r = M3.V(1, 0, 0);
    return { r: r, u: M3.cross(camDir, r) };
  }

  /* 偏移 off 下要把飞机放进画面 FRAME_FILL 以内（且深度不小于
     FRAME_MIN_DEPTH），镜头还得沿视线再退多少米。fr = { tanV, tanH }。 */
  function frameDeficit(off, camDir, fr) {
    var b = camBasis(camDir);
    var rel = M3.mul(off, -1);
    var need = Math.max(FRAME_MIN_DEPTH,
      Math.abs(M3.dot(rel, b.u)) / (fr.tanV * FRAME_FILL),
      Math.abs(M3.dot(rel, b.r)) / (fr.tanH * FRAME_FILL));
    return Math.max(0, need - M3.dot(rel, camDir));
  }

  // 软膝：|x| ≤ knee 原样返回，之外渐近 lim，连续且一阶导连续
  function softKnee(x, knee, lim) {
    var a = Math.abs(x);
    if (a <= knee) return x;
    var w = lim - knee;
    return (x < 0 ? -1 : 1) * (knee + w * Math.tanh((a - knee) / w));
  }

  /* B 侧滑软钳：保持深度，把飞机在画面上的坐标软压进 FRAME_SOFT_LIM。
     静态底座已经保证稳态位置在 FRAME_FILL 以内，所以玩家设的高度/距离不受影响。
     深度不足（视线甩得太快，镜头几乎到了飞机侧面甚至前方）时只能退到最小深度。 */
  function softClampFrame(off, camDir, fr) {
    var b = camBasis(camDir);
    var rel = M3.mul(off, -1);
    var f = Math.max(FRAME_MIN_DEPTH, M3.dot(rel, camDir));
    var y = softKnee(M3.dot(rel, b.u) / (f * fr.tanV), FRAME_FILL, $.FRAME_SOFT_LIM);
    var x = softKnee(M3.dot(rel, b.r) / (f * fr.tanH), FRAME_FILL, $.FRAME_SOFT_LIM);
    var rel2 = M3.add(M3.mul(camDir, f),
      M3.add(M3.mul(b.u, y * f * fr.tanV), M3.mul(b.r, x * f * fr.tanH)));
    return M3.mul(rel2, -1);
  }

  /* 追尾镜头相对飞机的偏移往目标走一步：方向球面插值、长度单独插值。
     以前对整个向量 lerpV —— 视线快速甩动时插值走的是弦，偏移长度变短，
     镜头被拉近；甩完又弹回去。急转时这是镜头前后伸缩的第二个来源。 */
  function smoothOffset(cur, want, k) {
    var lc = M3.len(cur), lw = M3.len(want);
    if (lc < 1e-6 || lw < 1e-6) return M3.lerpV(cur, want, k);
    var dir = M3.slerpDir(M3.mul(cur, 1 / lc), M3.mul(want, 1 / lw), k);
    return M3.mul(dir, lc + (lw - lc) * k);
  }

  // C 拉远带滞回：输入 { extra, hold } 与本帧需要的额外距离，返回新的 { extra, hold }
  function stepFrameExtra(st, need, dt) {
    if (need >= st.extra) {
      return { extra: st.extra + (need - st.extra) * (1 - Math.exp(-EXTRA_UP * dt)), hold: EXTRA_HOLD };
    }
    var hold = Math.max(0, st.hold - dt);
    if (hold > 0) return { extra: st.extra, hold: hold };
    return { extra: st.extra + (need - st.extra) * (1 - Math.exp(-EXTRA_DOWN * dt)), hold: 0 };
  }

  function updateCamera(dt) {
    var p = $.player;
    if (!p) return;

    // 方向键：自由视角，松开后缓慢回中
    if ($.keys.ArrowLeft) $.camYaw -= dt * 1.3;
    if ($.keys.ArrowRight) $.camYaw += dt * 1.3;
    if ($.keys.ArrowUp) $.camPitch = Math.min(1.5, $.camPitch + dt * 0.9);
    if ($.keys.ArrowDown) $.camPitch = Math.max(-1.5, $.camPitch - dt * 0.9);
    if (!$.keys.ArrowLeft && !$.keys.ArrowRight) $.camYaw = M3.smooth($.camYaw, 0, 2.2, dt);
    if (!$.keys.ArrowUp && !$.keys.ArrowDown) $.camPitch = M3.smooth($.camPitch, 0, 2.2, dt);

    if ($.S.camMode === 0) {
      /* 追尾：不跟随滚转，地平线永远水平。

         **镜头俯仰限制在 ±89°，飞机可以翻过去，镜头不跟。**
         空翻照样能做 —— 只是到了限位之后镜头停住，
         玩家会看到机身从视野上方（或下方）翻出去。

         为什么必须限：镜头的"上"参考只有在它与视线不共线时才有定义。
         机头压到正上/正下时视线本身是垂直的，世界 up 与它共线，
         正交基退化，退化保护只能临时换一根参考轴 —— 而 |f.y| 在
         极点附近逐帧抖动，参考轴就跟着反复横跳，画面来回侧翻。
         之前那套"混合参考"只能把跳变抹成旋转，抹不掉极点本身；
         把俯仰限住，镜头就永远不会到达那个位置。 */
      /* ---------- 追尾镜头：稳定的水平镜头 + 俯仰限位 ----------

         相机 up 恒为世界 up，所以地平线永远水平、画面不会跟着滚转乱转。
         俯仰限制在 ±89°：飞机可以翻过正上方/正下方，镜头不跟，
         到限位就停住。视线因此永远不会与世界 up 共线，正交基不会退化 ——
         这也正是"极点卡动"那个老问题的根治办法。

         限位附近最容易出的毛病是**来回抽动**。三件事必须一起做才能压住：

         ① 偏航按最短角差平滑
            翻越顶点时水平投影会瞬间反向 180°，直接跟就是瞬移。
         ② 俯仰也要平滑
            相机 up 是世界 up，而正交化之后 up 的长度是 cos(pitch)：
            俯仰越接近限位这个长度越小，同样的视线变化引起的 up 变化越大。
            所以俯仰直接阶跃时地平线会明显发抖。
         ③ 视线最后再钳一次
            camPos 是插值量、天生滞后，若用滞后的位置反推方向，
            视线会比基准朝向更陡，把限位绕过去。

         时间常数的取舍：偏航 1.2（约一秒转完 180°，够快也不甩），
         俯仰 9（俯仰是玩家直接控制的，太慢会显得操纵迟滞）。

         为什么是 89° 而不是 90°：正交化前 |up| = cos(限位)，
         而 orthonormalize 的退化阈值是 |up| < 1e-4。
         持续垂直压到限位时，89° 还剩 1.75e-2（175 倍余量），
         实测收敛后镜头帧间差为 0、没有任何抽动；
         89.9° 只剩 17 倍，89.999° 只剩 1 倍，到 90° 直接归零 ——
         参考轴反复横跳、"极点卡动"就回来了。
         89° 是"能看见最高"与"正交基始终远离退化"之间留够余量的位置。 */
      var CAM_PITCH_LIM = 89 * Math.PI / 180;
      var SIN_LIM = Math.sin(CAM_PITCH_LIM);

      /* 鼠标引导时镜头跟**瞄准方向**，不跟机头 —— 这是战雷式操纵的另一半：
         准星永远在画面中心，机头标记去追它；镜头若跟机头，准星就会跟着
         机头一起跑，机头永远追不上。键盘直控时仍跟机头。
         跟瞄准方向时平滑放快：它本来就是玩家直接拖的，慢了像在拖泥。 */
      var lookAim = $.aimMode && $.aimInit && p.alive;
      var lookDir = lookAim ? $.aimDirNow() : p.fwd;
      var yawRate = lookAim ? 14 : 1.2, pitchRate = lookAim ? 14 : 9;
      var hx = lookDir.x, hz = lookDir.z;
      var hlen = Math.sqrt(hx * hx + hz * hz);

      /* ① 偏航：最短角差平滑。
         键盘直控时从机头的水平投影反算，接近垂直时投影塌缩、沿用上一帧。
         鼠标引导时直接用 aimYaw —— 它在任何仰角都有定义。以前这里也走反算：
         CMD 顶在 89° 时水平投影只有 cos 89° ≈ 0.017，一直卡在冻结区，左右拖时
         罗盘和飞机在转、画面不转，一往下拖离开冻结区画面就猛地追过去。 */
      if (lookAim || hlen > 0.12) {
        var tYaw = lookAim ? $.aimYaw : Math.atan2(hx, hz);
        var dYaw = tYaw - $.camYawBase;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        $.camYawBase += dYaw * (1 - Math.exp(-yawRate * dt));
        if ($.camYawBase > Math.PI) $.camYawBase -= Math.PI * 2;
        if ($.camYawBase < -Math.PI) $.camYawBase += Math.PI * 2;
      }

      // ② 俯仰：先钳位，再平滑
      var camPitchAng = Math.atan2(lookDir.y, Math.max(hlen, 1e-4));
      // 跟瞄准方向时：天顶 / 天底刚好卡在画面上下沿，见 camPitchFor
      if (lookAim) camPitchAng = camPitchFor(camPitchAng, $.S.fov);
      camPitchAng = M3.clamp(camPitchAng, -CAM_PITCH_LIM, CAM_PITCH_LIM);
      if ($.camPitchSmooth === null) $.camPitchSmooth = camPitchAng;
      $.camPitchSmooth += (camPitchAng - $.camPitchSmooth) * (1 - Math.exp(-pitchRate * dt));

      var cpc = Math.cos($.camPitchSmooth), cps = Math.sin($.camPitchSmooth);
      var camDir = M3.V(Math.sin($.camYawBase) * cpc, cps, Math.cos($.camYawBase) * cpc);

      // ③ 视线钳位，保证 |y| 不超过限位
      var fy2 = M3.clamp(camDir.y, -SIN_LIM, SIN_LIM);
      var fh2 = camDir.x * camDir.x + camDir.z * camDir.z;
      if (fh2 > 1e-8) {
        var fhz = Math.sqrt(fh2);
        var fsc = Math.sqrt(Math.max(0, 1 - fy2 * fy2)) / fhz;
        camDir = M3.V(camDir.x * fsc, fy2, camDir.z * fsc);
      }

      /* 位置在**世界坐标**的后方（不是机体坐标系）——
         这样滚转时镜头不会绕着飞机转圈，是"稳定"的另一半。 */
      /* 跟随距离：以前直接对世界坐标 camPos 做一阶平滑，镜头稳态会落后
         v / 7.5 米 —— 高速时远、低速时近，失速下坠时这段滞后还变成竖直的，
         飞机就从画面里掉出去了。现在平滑的是**相对飞机的偏移**，
         速度感单独加一段沿视线向后的距离（有上限），
         飞得多慢、往哪个方向掉，飞机都留在画面里同一个位置附近。

         速度感按**空速** p.speed 算，再慢慢平滑（CAM_SPEED_RATE）。以前取的是
         速度在视线方向上的分量 dot(vel, camDir)：急转时视线先甩出去、速度方向
         还没跟上，这个分量一秒内能从 290 掉到 −110 再回到 200，镜头就在
         49 m → 21 m → 29 m → 20 m 之间来回伸缩 —— 三种出画处理都在它下游，
         选哪种都一样跳。空速本身同一段时间只是平滑地从 290 降到 200。 */
      var wantSpeedBack = M3.clamp(p.speed / 7.5, 0, 90);
      $.camSpeedBack = $.camSpeedBack === null ? wantSpeedBack
        : $.camSpeedBack + (wantSpeedBack - $.camSpeedBack) * (1 - Math.exp(-$.CAM_SPEED_RATE * dt));
      var back = $.S.camDist + $.camSpeedBack;
      var off0 = M3.rotAxis(M3.mul(camDir, -back), M3.V(0, 1, 0), $.camYaw);
      var wantOff = M3.add(off0, M3.V(0, $.S.camHeight + $.camPitch * 70, 0));

      /* 静态底座：设定本身放不下飞机时（例如距离 2、高度 10、FOV 38°，
         机身在画面外 60° 多）沿视线往后退。用的是**目标偏移**而不是滞后的
         camOff —— 设定不变，这段距离就不变，机动时不会跟着跳。 */
      var halfTan = Math.tan($.S.fov * Math.PI / 360);
      var aspect = ($.cv && $.cv.height) ? $.cv.width / $.cv.height : 16 / 9;
      var fr = { tanV: halfTan, tanH: halfTan * aspect };
      wantOff = M3.sub(wantOff, M3.mul(camDir, frameDeficit(wantOff, camDir, fr)));
      $.camOff = $.camOff ? smoothOffset($.camOff, wantOff, 1 - Math.exp(-7.5 * dt)) : wantOff;

      /* 动态：camOff 跟不上视线时飞机会偏向画面边缘，三种处理见上面"出画处理"的说明。
         修正只作用于本帧的镜头位置，不写回 camOff —— 平滑状态保持干净，
         中途切换模式也不会留下残余。 */
      var viewOff = $.camOff;
      if ($.S.camFrame === 1) {
        viewOff = softClampFrame($.camOff, camDir, fr);
      } else if ($.S.camFrame === 2) {
        var ex = stepFrameExtra({ extra: $.camExtra, hold: $.camExtraHold },
          frameDeficit($.camOff, camDir, fr), dt);
        $.camExtra = ex.extra;
        $.camExtraHold = ex.hold;
        viewOff = M3.sub($.camOff, M3.mul(camDir, $.camExtra));
      }
      if ($.S.camFrame !== 2) { $.camExtra = 0; $.camExtraHold = 0; }
      $.camPos = M3.add(p.pos, viewOff);

      $.camFwd = camDir;
      $.camUp = M3.V(0, 1, 0);
      Renderer.setCamera($.camPos, $.camFwd, $.camUp, $.S.fov);
    }

    /* 注意这里是 **else if**，必须挂在上面 camMode===0 的 else 链上。

       曾经被误改成独立的 if，后果是 camMode===0 时既不满足 camMode===1，
       就掉进了下面的 else（目标视角）—— 追尾镜头算出来的结果当场被覆盖，
       而且目标视角写死世界 up，于是画面看起来完全退回"地平线永远水平"。
       这个 bug 骗过了所有相机测试，因为那些测试只复现 camMode===0 的计算，
       不经过这里的分支。 */
    else if ($.S.camMode === 1) {
      // 座舱：跟随滚转
      var cp = M3.add(p.pos, M3.add(M3.mul(p.fwd, 3.4), M3.mul(p.up, 1.1)));
      Renderer.setCamera(cp, p.fwd, p.up, $.S.fov + 6);
    } else {
      /* 目标视角：从**侧上方**看玩家与目标。

         原来是正上方 90 米、垂直往下看 —— 视线与 up 完全共线，
         正交基退化，画面随机翻滚，玩家会"找不到自己的飞机"。
         侧向偏出去一点就永远不会共线。

         没有目标时同理：只往机身后上方放，一旦飞机本身垂直，
         p.pos − want2 也会变成垂直方向。所以也要带侧向分量。 */
      var t = p.target;
      if (t && t.alive) {
        var mid = M3.mul(M3.add(p.pos, t.pos), 0.5);
        var span = Math.max(140, M3.dist(p.pos, t.pos));
        // 玩家→目标的水平垂线方向
        var along = M3.sub(t.pos, p.pos);
        along.y = 0;
        var al = Math.sqrt(along.x * along.x + along.z * along.z);
        var side = al > 1e-4
          ? M3.V(-along.z / al, 0, along.x / al)
          : M3.V(1, 0, 0);
        var cp2 = M3.add(mid, M3.add(
          M3.mul(side, span * 0.40 + 40),
          M3.V(0, Math.max(60, span * 0.26), 0)
        ));
        Renderer.setCamera(cp2, M3.norm(M3.sub(mid, cp2)), M3.V(0, 1, 0), 55);
      } else {
        // 侧后上方 —— 侧向分量保证视线不会与 up 共线
        var want2 = M3.add(p.pos, M3.add(
          M3.mul(p.fwd, -120),
          M3.add(M3.mul(p.right, 55), M3.V(0, 50, 0))
        ));
        Renderer.setCamera(want2, M3.norm(M3.sub(p.pos, want2)), M3.V(0, 1, 0), $.S.fov);
      }
    }
  }
})(Game);
