/* ============================================================
   ai.js —— 敌我与僚机的行为

   核心控制律：先把目标的机体侧向分量滚转到零（bank to target），
   再拉杆对准 —— 也就是真实空战里的"追击转弯"。
   直接拉杆会让飞机滚转错位并陷入螺旋。
   ============================================================ */
'use strict';

var AI = (function () {

  var _tmp = M3.V(0, 0, 0);

  /* ============================================================
     工具
     ============================================================ */
  function findIncoming(a, world) {
    var best = null, bd = 1e9;
    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.team === a.team) continue;
      if (m.target !== a) continue;
      var d = M3.dist(m.pos, a.pos);
      if (d < bd && d < 4200) { bd = d; best = m; }
    }
    return best;
  }

  function nearestEnemy(a, world, maxR) {
    var best = null, bd = (maxR || 16000) * (maxR || 16000);
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === a.team) continue;
      var d = M3.dist2(e.pos, a.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* 最近的**敌方面目标**（海上平台 / 地面设施）。

     敌我判据与玩家锁定循环一致：0 与 1 互为敌，2 是中立
     （双方流弹都可能伤到它，但没人主动去打）。以前 AI 眼里只有
     `world.actors`，世界里的面目标对它是不存在的。 */
  function nearestSurfaceTarget(a, world, maxR) {
    if (!world.targets) return null;
    var best = null, bd = (maxR || 12000) * (maxR || 12000);
    for (var i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      if (!t.alive || t.team === a.team || t.team > 1) continue;
      var d = M3.dist2(t.pos, a.pos);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /* 这架飞机该不该去找面目标打：得真带着能用的对面弹（有导引头、还有弹）。

     射程用它自己那几件里最远的一件 —— "够不够得着"由开火那一段逐件判，
     这里只负责别让它追一个根本打不到的东西。 */
  function surfaceTargetFor(a, world) {
    if (!a.ammoPool) return null;
    var reach = 0;
    for (var wid in a.ammoPool) {
      if (!Object.prototype.hasOwnProperty.call(a.ammoPool, wid)) continue;
      if (!(a.ammoPool[wid] > 0)) continue;
      var w = WEAPONS[wid];
      if (!w || !w.seeker || w.seeker === 'none') continue;
      if (w.target !== 'ground' && w.target !== 'ship') continue;
      if ((w.lockDist || 0) > reach) reach = w.lockDist;
    }
    if (reach <= 0) return null;
    return nearestSurfaceTarget(a, world, reach * 1.15);
  }

  /* 对面目标的接近方向：**保持高度**，只把机头转过去。

     不能用 pursue()：它是为空战写的，`leadTo` 会把机头一路指向海面，
     飞机就一头扎下去；而下面的"离地 420 m 强行拉起"会把它拉回来，
     于是变成在目标上方反复俯冲-拉起，永远进不了投放包线。
     所以这里只给水平方向与一点沉稳的下压 —— 对地弹也要机头大致
     对准目标才锁得住。 */
  function approachSurface(a, t) {
    var toT = M3.sub(t.pos, a.pos);
    var d = M3.len(toT);
    if (d < 1) return a.fwd;
    var dir = M3.mul(toT, 1 / d);
    return M3.norm(M3.V(dir.x, d > 6000 ? -0.06 : -0.02, dir.z));
  }

  /* 正在锁定长机的敌机 —— "掩护"这条指令的核心。
     两个分支（wingman 的 cover、drone 的 cover）共用它。
     它以前直接写在 wingman 的 cover 分支里面，而那条分支
     因为僚机都是 drone 而从来没跑到过（见 docs/systems/ai.md）。

     注意 `e.target === lead` 要求 **AI 每帧把 s.target 写回 a.target**
     （update() 末尾那一行）—— 在补上那行之前，这里永远找不到人，
     掩护会静默退化成"随便打一个最近的"。 */
  function leadThreat(a, world) {
    var lead = world.player;
    if (!lead || !lead.alive) return null;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === a.team) continue;
      if (e.target === lead) return e;
    }
    return null;
  }

  /**
   * 把"想要去的方向"翻译成操纵输入 —— 最少时间转向。
   *
   * 真实飞控与战雷式鼠标瞄准都是这个逻辑，分两步：
   *   ① 先滚转，把目标滚进机体的俯仰平面（让它出现在"正上"方向）
   *   ② 滚转一对齐，立刻全力拉杆做最大过载转向
   *
   * 反过来做（边滚边死拉杆）会让升力矢量指向斜下方，
   * 飞机一边转一边掉高度，还转不快。
   *
   * 返回 {pitch, roll, yaw}，pitch>0 抬头、roll>0 右滚。
   * st 可选，提供一个带 rollLock 字段的对象用于滚转方向锁存。
   */
  /* 鼠标的这些界限都按**屏幕归一化距离**定（1 = 屏幕边缘，
     屏幕角落约 1.41），所以与 FOV 无关。 */
  /* 满杆点：鼠标到这个屏幕半径时杆量给足。比它更靠近中心就整体缩杆，
     而且是平方衰减 —— 中心附近掉得极快（见 steerTo 里的 gain）。 */
  var AIM_FULL_MAG = 0.35;

  /* 推杆自己的幅度轴 —— 比滚转的柔和区**宽得多**。

     为什么需要两条轴：滚转/偏航的"柔和"要的是细腻（稍微一动就给
     一点点），所以 AIM_BLEND_MAG 取得很小(0.225)。但推杆是完全不同
     的一件事 —— 玩家"略微朝正下方"想让机头压下去，那个"略微"通常
     已经是屏幕纵向 15% 上下，用 0.225 的轴算出来 pushW 只剩 0.16，
     等于没推。

     实测（真实游戏，鼠标从中心往下移）：
       dy=40px  aimMag=0.111  pitch=-0.045  roll=0.024
       dy=60px  aimMag=0.167  pitch=-0.023  roll=0.157   ← 推杆已经快没了
       dy=90px  aimMag=0.250  pitch= 0.000  roll=0.510
     换成 0.5 之后同样位置 pushW 分别是 0.87 / 0.74 / 0.50。 */
  var AIM_PUSH_AXIS = 0.85;

  /* "柔和转向"与"快速转向"之间的过渡轴。

     刻意取得很小（0.225，约合屏幕纵向 22%）：有意把鼠标稳在中心附近
     就是柔和转向；一旦离开这片区域，很快过渡到完全滚转。

       AIM_FULL_MAG(0.35) 管"力气多大"—— 靠近中心整体缩杆，平方衰减
       AIM_BLEND_MAG(0.225) 管"力气怎么分"—— 滚转占比，smoothstep 过渡
     两者分开，因为"想省力"和"想转得猛"不是一回事。 */
  var AIM_BLEND_MAG = 0.225;

  /* ============================================================
     关于三个"方向"，这里必须分清楚，否则很容易写出看着对、
     飞起来不对的判据：

       世界方向   哪边是上，飞机和镜头共用同一个世界
       镜头方向   追尾机位的相机上方向**恒为世界上方**（会随俯仰
                  倾斜，但永远不会倒过来）。所以"鼠标在屏幕下方"
                  对应的是**世界下方**，和机体姿态无关。
       机体方向   a.fwd / a.up / a.right，会随滚转翻过来

     于是同一个鼠标位置，落到机体坐标里是不同的方向：

       姿态        屏幕下方 → 机体系 ux     屏幕右 → 机体系 ux
       正飞              -0.169                  0.000
       左滚 90°          -0.000                 -0.169
       倒飞              +0.169                 -0.000
       右滚 90°          -0.000                 +0.169

     "推杆"是绕机体 right 轴转，让机头朝**机体下方**。所以判据只有
     一条：ux < 0（目标确实在机体下方）。倒飞时 ux 自动变正，
     不需要特殊处理 —— 但也**绝不能用 |ux| 或 |up.y|** 去判，
     那会把倒飞误当成正飞。
     ============================================================ */
  function steerTo(a, desired, out, st) {
    var fx = M3.dot(desired, a.fwd);
    var rx = M3.dot(desired, a.right);
    var ux = M3.dot(desired, a.up);

    var off0 = Math.acos(M3.clamp(fx, -1, 1));
    var mag0 = M3.clamp(off0 * 2.3, 0, 1);

    /* ---------- 靠近中心时整体缩杆（没有死区） ----------

       鼠标越靠近画面中心，所有转向杆量越小，而且是**平方衰减** ——
       中心附近掉得极快：

          半径 0.35（满杆点） → gain 1.00
          半径 0.175          → gain 0.25
          半径 0.05           → gain 0.02

       刻意不做成死区：死区里"完全不动"会让飞机带着歪斜姿态一直飞，
       而硬边界的另一侧又突然满杆。平方衰减两头都平滑，
       鼠标在中心时杆量趋近于 0，飞机自然就稳住当前姿态，
       但玩家真要微调也还留得下一点点。

       注意 gain 乘的是**所有**分支的输出，包括推杆那一支。 */
    var aimMag = (st && st.aimMag !== undefined) ? st.aimMag : null;
    var gain = 1;
    if (aimMag !== null) {
      var kk = M3.clamp(aimMag / AIM_FULL_MAG, 0, 1);
      gain = kk * kk;
    }

    /* ============================================================
       滚转 / 偏航 按鼠标幅度渐变分配

       **为什么不用"纯物理最优"**：按各轴角速度算耗时确实能得出
       一个最快解，但那个解在鼠标刚离开中心时给的是几乎**纯偏航** ——
       机头转过去而机身还是平的。听起来合理，手感却很怪：玩家想
       "稍微往左转"，期待的是飞机稍微往左倾一点、转完接着平飞，
       而不是机身纹丝不动地横着飘；等鼠标再挪远一点，那个解又会
       突然切到满滚转，中间没有过渡。

       所以这里不按耗时分配，而是按幅度渐变：

           滚转量 = 满杆 × blend        blend 随鼠标幅度线性 0 → 1
           偏航量 = 侧向误差 × (1 - blend)

       鼠标刚离开中心 → 一点点滚转 + 偏航补足，机身轻微侧倾、转向柔和
       鼠标推到满杆   → 完全滚转对齐，偏航归零，动作干脆
       ============================================================ */

    /* 滚转对齐所需的角度：把目标在机体横向平面里的分量转到正上方。 */
    var rollErr = Math.atan2(-rx, ux);            // ∈ [-π, π]

    // 目标接近正下方时 rx 会左右抖，导致满左滚/满右滚来回跳。
    // 用一次锁存钉住转向，等转过半圈再解锁。
    if (st) {
      if (Math.abs(rollErr) > 2.55) {
        if (!st.rollLock) st.rollLock = (rollErr >= 0) ? 1 : -1;
        rollErr = st.rollLock * 3.14;
      } else {
        st.rollLock = 0;
      }
    }

    /* 这里**没有推杆分支**。

       目标在下方时不做"直接压杆"，而是走同一套滚转对齐 ——
       机体会滚转半圈变成倒飞，然后仰起去咬目标。这不是绕远：
       推杆权限只有拉杆的一半（见 entities.js 的俯仰不对称），
       而且俯冲攻击在空战里本来就该靠滚转把机腹对准目标。

       更重要的是它统一了所有方向的手感 —— 不管鼠标指向哪里，
       飞机都是"滚转过去、然后拉"，玩家不需要记两套行为。 */

    /* ---------- 滚转 / 偏航 按鼠标幅度插值过渡 ----------

       两种模式要靠鼠标幅度平滑地互相转化，中间不能有切换感：

         鼠标在中心附近 → 少量滚转 + 偏航补足（轻微侧倾，转向柔和）
         鼠标推向屏幕边缘 → 滚转占比升到 100%
                            （狗斗时能完全滚转对准任何方向，偏航归零）

       过渡轴取 0.225（smoothstep），也就是鼠标一到屏幕纵向 22% 附近
       就基本完成过渡 —— 有意把鼠标稳在中心附近才是柔和转向，
       一旦离开就很快变成完全滚转。smoothstep 两端导数为 0，
       所以两头都不会有"忽然开始变"的拐点。

       注意与 gain 的分工：
         gain（AIM_FULL_MAG = 0.35，平方）管"力气多大"
         blend（AIM_BLEND_MAG = 0.225，smoothstep）管"力气怎么分" */
    var blend = 1;
    if (aimMag !== null) {
      var tb = M3.clamp(aimMag / AIM_BLEND_MAG, 0, 1);
      blend = tb * tb * (3 - 2 * tb);       // smoothstep
    }

    /* ---------- 目标在下方：推杆 ↔ 滚转仰起 用同一个轴插值 ----------

       目标落在机腹一侧时有两条路：
         直接推杆                 —— 立刻见效，适合小幅修正
         滚转半圈（倒飞）后仰起   —— 绕远但快，是狗斗里的标准动作

       两者之间同样不能有切换点，所以用同一个 blend：
           鼠标在中心附近 → pushW 接近 1，几乎全推杆
           离开中心       → pushW 归零，交给滚转 + 仰起

       ---------- 但推杆有个几何前提：机体得相对镜头正着飞 ----------

       追尾机位下相机的上方向就是世界正上方，所以"相对镜头正着飞"
       就是**机体 up 朝上**（机翼大致水平）。这正是 a.up.y 接近 +1。

       为什么必须有这个前提："推杆"是绕机体 right 轴转，只有机体正着
       时它才真的是"把机头压下去"。侧飞时 up 指向水平，绕 right 转
       其实是**水平转向**；而且鼠标在屏幕下方对应的世界方向正好落进
       机体的"下半空间"，会被误判成推杆。那种情况下玩家要的只是常规的
       柔和转向 —— 略微滚转 + 略微偏航，鼠标移到哪边就朝哪边。

       不用绝对值：倒飞（up.y ≈ -1）不算"相对镜头正着飞"，
       那时鼠标往下该走常规滚转，而不是推杆。

       判据用的是**相对镜头**，不是相对世界 —— 追尾机位有俯仰角
       （低头看飞机），camUp 并不等于世界正上方。玩家对象带进来
       aimUpright = dot(机体 up, 镜头 up)。用 a.up.y 的话，镜头俯得
       深一点就会把一个"相对镜头正着飞"的飞机误判成不正。

       AI 没有镜头这一层，退回世界 up（它们的控制律本来就不经过镜头）。 */
    /* 目标在机体横向平面里偏向哪一侧：+1 = 正上，0 = 正侧方，-1 = 正下。
       方位判定（推杆锥）和俯仰段都要用，所以先算。 */
    var lateral = Math.sqrt(rx * rx + ux * ux);
    var up = lateral > 1e-4 ? M3.clamp(ux / lateral, -1, 1) : 1;

    var upright = (st && st.aimUpright !== undefined) ? st.aimUpright : a.up.y;

    /* 推杆区是"正下方 ±60° 的锥"，用方位角判定。

       up 是目标在机体横向平面里相对机体上方的位置：
           up = -1  正下方
           up =  0  正侧方
       所以 up < -0.5 正好对应"正下方 ±60°以内"。

       范围内：柔和时纯推杆（不带滚转），滚转权重随幅度逐渐升上来；
       范围外：完全不推，交给滚转对齐。
       这条边界是**离散**的，和滚转/偏航那种连续过渡不同 ——
       按用户的模型，策略切换本来就是一个离散决定。 */
    var downCone = (up < -0.5);

    /* 推杆权重用立方衰减（"后降"），不是 smoothstep。

       推杆的**强度**要到离轴角 25°（屏幕纵向约 46%）才封顶，而
       smoothstep 在中段掉得太快 —— 两者刚好错开，结果永远在还没
       推满的时候就被滚转接走。立方曲线把大部分幅度都留给推杆：

           aimMag   0.25  →  pushW 0.98
           aimMag   0.47  →  pushW 0.84   ← 推杆强度刚封顶，权重仍高
           aimMag   0.70  →  pushW 0.44
           aimMag   0.85+ →  pushW 0        （交给滚转） */
    var pushW = 0;
    if (downCone && upright > 0.7) {
      var tp = M3.clamp(aimMag === null ? 1 : aimMag / AIM_PUSH_AXIS, 0, 1);
      pushW = 1 - tp * tp * tp;
    }

    /* 走推杆的时候**不能同时滚转**。

       目标落在机体正下方时 rollErr 会给出 ±π（要滚 180° 才能把它
       转到机体上方），所以一边推杆一边还在缓慢滚转 —— 手感就是
       "鼠标往下推，飞机却先侧着慢慢转"，完全不是压机头。

       乘 (1 - pushW)：推杆权重越高，滚转越少；纯推杆时滚转为 0。 */
    var rollCmd = M3.clamp(-rollErr * 2.8, -1, 1) * blend * (1 - pushW);

    // 还没被滚转消掉的侧向分量，用偏航补上
    var yawErr = Math.atan2(rx, fx);
    var yawCmd = 0;
    if (fx < -0.45) {
      // 目标在正后方：偏航是唯一有效手段，不参与混合
      yawCmd = M3.clamp(rx * 1.8, -1, 1);
    } else if (blend < 0.99) {
      yawCmd = M3.clamp(yawErr * 1.6, -1, 1) * (1 - blend);
    }

    /* ---------- ② 俯仰：对齐度越高，拉得越满 ---------- */
    var off = Math.acos(M3.clamp(fx, -1, 1));     // 机头与目标的夹角

    var mag = M3.clamp(off * 2.3, 0, 1);
    var pitchCmd;
    if (up >= 0) {
      // 已在上半平面：拉杆量随对齐度迅速升满
      pitchCmd = mag * (0.55 + 0.45 * Math.sqrt(up));
    } else {
      // 还在下半平面：交给滚转去解决，只保留很小的杆量维持姿态
      pitchCmd = mag * 0.18 * (1 + up);
    }

    /* 目标在下方时按 pushW 把"推杆"混进来：
       pushW = 1 → 纯推杆；pushW = 0 → 完全不推，交给滚转后仰起。
       两者共用同一个 blend，所以从中心往外推鼠标时，
       动作会自己从"压杆"平滑过渡到"滚半圈再拉"。 */
    if (pushW > 0.01) pitchCmd = pitchCmd * (1 - pushW);

    /* 推杆那一份**不乘 gain**。

       gain 是"靠近中心整体缩杆"，用来防止小幅鼠标造成大动作；
       但推杆本身就已经是柔和动作，再压一遍就彻底看不见了 ——
       实测乘完只剩 -0.009，角速度 0.4°/s，和不动没区别。
       所以滚转/偏航照旧缩杆，推杆单独给足。 */
    out.pitch = pitchCmd * gain;
    if (pushW > 0.01) {
      /* 推杆的**强度**由方位决定：目标越接近正下方，机头压得越狠。

         这里原来乘的是 mag0 = clamp(off0 × 2.3, 0, 1)，也就是用
         **离轴角**定量。但两者刚好错开：off0 要到 25° 才封顶，而
         25° 离轴角对应的 aimMag 已经是 0.875 —— 那时 pushW 早就归零，
         推杆**永远到不了满幅度**（实测峰值只有 -0.28）。

         改用方位 up（-1 = 正下方，0 = 正侧方）：
             正下方  → 强度 1.00
             锥边缘  → 强度 0.70（up = -0.5）
         鼠标幅度只管 pushW（推杆 vs 滚转的比例），不再管推杆多狠。 */
      var pushAmt = 0.4 + 0.6 * M3.clamp(-up, 0, 1);
      out.pitch -= pushAmt * pushW;
    }
    out.roll = rollCmd * gain;
    out.yaw = yawCmd * gain;
    return out;
  }

  /* ============================================================
     创建 AI 状态
     ============================================================ */
  function attach(a, opt) {
    opt = opt || {};
    a.ai = {
      role: opt.role || 'enemy',
      skill: opt.skill === undefined ? 0.6 : opt.skill,
      mode: 'pursue',
      modeT: 0,
      evadeT: 0,
      msl: null,
      flareT: 0,
      shootT: 0,
      burstT: 0,
      ewResist: 0,        // 对敌方电子战的适应度（设定 7.3"对手也在学"）
      target: null,
      retargetT: M3.rnd(0, 1.2),
      formation: opt.formation || null,   // {lead, dx, dy, dz}
      wander: M3.rnd(0, 6.28),
      /* 默认指令是 focus（只打长机授权的目标），不是 spread。

         无人僚机的设定是"没有自主判断力"，所以"什么都没说"时必须
         落在最保守的那一档；spread 要由玩家按 1 显式下达。 */
      cmd: opt.cmd || 'focus'
    };
    return a.ai;
  }

  /* ============================================================
     每帧
     ============================================================ */
  /* ============================================================
     航线型单位（轰炸机之类）

     它们不参与空战：没有目标选择、没有追击、没有规避机动。
     整个行为由一条航线定义 —— 飞到点、做一件事、再飞走。

     这比"给它们写一套 AI"简单得多，也更贴合它们在战场上的角色：
     它们不是战斗单位，是**事件**。
     ============================================================ */
  function updateRoute(a, dt, world) {
    var r = a.route;
    var ctrl = a.ctrl;

    var to = M3.sub(r.wp, a.pos);
    var dist = M3.len(to);
    var desired = dist > 1 ? M3.mul(to, 1 / dist) : a.fwd;

    // 巡航高度保持 —— 航线给了高度，它只负责回到那上面
    if (a.pos.y < r.alt - 150 && desired.y < 0.10) {
      desired = M3.norm(M3.V(desired.x, 0.34, desired.z));
    } else if (a.pos.y > r.alt + 150 && desired.y > -0.10) {
      desired = M3.norm(M3.V(desired.x, -0.28, desired.z));
    }

    steerTo(a, desired, ctrl, a);
    a.throttle = 0.95;
    a.ab = false;

    // 撞地保护（它很笨，别让它一头扎进海里）
    if (a.pos.y < 500 && a.fwd.y < 0) {
      steerTo(a, M3.norm(M3.V(a.fwd.x, 0.4, a.fwd.z)), ctrl, a);
    }

    /* 到点：执行该点的动作，然后转到下一段。
       最后一段飞完就自行消失 —— 轰炸机不会掉头回来再打一遍。 */
    if (dist < r.arrive) {
      if (r.loiter) {
        /* 盘旋型（预警机）。

           轰炸机是**事件**：飞到点、扔完弹、退场。
           预警机不是 —— 它得一直在那儿看着。所以在两个航点之间
           来回飞，永不退场；击落它是唯一让它消失的方式。 */
        var swap = r.wp;
        r.wp = r.exit;
        r.exit = swap;
      } else if (r.phase === 'ingress') {
        if (r.onArrive) r.onArrive(a, world);
        r.phase = 'egress';
        r.wp = r.exit;
        r.alt = r.exitAlt === undefined ? r.alt : r.exitAlt;
      } else {
        a.alive = false;
        return;
      }
    }

    /* 尾炮：只打正后方很近的东西，而且**绝不为了开火改变航向**。
       这是它唯一的自卫手段 —— 设定里"遇到拦截只能靠护航机和尾炮"。 */
    a.firingGun = false;
    if (!r.tailGun || a.gunAmmo <= 0) return;

    var t = null, best = 1e9;
    var i;
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === a.team) continue;
      var d = M3.dist(e.pos, a.pos);
      if (d > r.tailGun || d > best) continue;
      // 必须在尾后锥内
      var back = M3.norm(M3.sub(e.pos, a.pos));
      if (M3.dot(back, a.fwd) > -0.72) continue;
      best = d; t = e;
    }
    if (!t) return;

    var off = M3.angleBetween(a.fwd, M3.norm(M3.sub(t.pos, a.pos)));
    if (off < 0.30) {
      a.firingGun = true;
      Ent.fireGun(a, world);
    }
  }

  /* ---------- 实用升限：性能不够就别硬追 ----------

     极高空空气稀薄，动压 q = ½ρv² 掉到几千时，操控权限只剩百分之十几。
     实测把玩家钉在 20500 米 40 秒，追击的敌机会停在这样的状态：

         ROK-27   17785 m   188 m/s   q=5793   ctrlFactor 0.26
         VAC-14   17162 m   157 m/s   q=4061   ctrlFactor 0.18

     它们没失速，但也没能上去 —— 就悬在半空慢慢挪，咬不住人也甩不掉。
     原来的 AI 只知道"y > 19000 就别抬太高（压到 0.35）"，可它并不知道
     "再上去就没有机动能力了"，所以会一路硬顶。

     现在按机型给一条实用升限（ac.ceiling，见 data.js）：
       接近升限（差 1200 米）→ 不许再抬头
       已经超过           → 主动压回来

     于是敌人会留在自己还有机动能力的高度层周旋，等对方自己下来 ——
     这比让它僵在 18 公里更像"识趣的对手"。 */
  function clampCeiling(a, dir) {
    if (!dir) return dir;
    var ceil = (a.ac && a.ac.ceiling) || 16000;
    if (a.pos.y > ceil && dir.y > -0.08) {
      /* 已经超了：主动压回来 —— 而且**超得越多压得越狠**。

         固定 -0.22 在低动压高度是不够的：十七公里上舵效只剩三成，
         "想压平"这个愿望执行不出来，于是一架为了追高目标而爬上来的
         敌机会停在既咬不到人、也甩不掉人的高度 —— smoke.js 里有一条
         断言专门盯着这件事（判据是 ctrlFactor 而不是 q）。
         这里按超出量线性加强，最多到 -0.45。 */
      var over = Math.min(1, (a.pos.y - ceil) / 1500);
      return M3.norm(M3.V(dir.x, -0.22 - 0.23 * over, dir.z));
    }
    if (a.pos.y > ceil - 1200 && dir.y > 0.08) {
      // 接近升限：不许再抬头
      return M3.norm(M3.V(dir.x, 0.08, dir.z));
    }
    return dir;
  }

  function update(a, dt, world) {
    if (!a.alive || !a.ai) return;
    // 航线型单位完全不走下面那套
    if (a.route) return updateRoute(a, dt, world);
    var s = a.ai;
    var ctrl = a.ctrl;

    if (s.retargetT > 0) s.retargetT -= dt;
    if (s.modeT > 0) s.modeT -= dt;
    if (s.evadeT > 0) s.evadeT -= dt;
    if (s.shootT > 0) s.shootT -= dt;
    if (s.burstT > 0) s.burstT -= dt;
    if (s.flareT > 0) s.flareT -= dt;

    /* ---- 雷达告警（RWR）：谁在用主动雷达锁定我 ----

       AI 的"被照射感知"，决定它会不会专门回头咬那个正在照它的人。

       它真正服务的是玩家的两件被动吊舱（GUS-6「明瞳」/ GUS-9「夜枭」）：
       装上之后你的锁定属于**被动测距**，不辐射，对方收不到告警，
       于是不会因为"被你盯上了"而优先来打你。设定里那句
       "你不开雷达，我也不开"说的就是这件事 —— 在这段代码之前，
       那两件吊舱的这句说明没有对应的机制。

       它依赖 `e.target`：AI 每帧把 s.target 写回 a.target
       （见 update() 末尾），否则这里读到的永远是 null。 */
    a.rwrT = 0;
    a.rwrSrc = null;
    for (var ri = 0; ri < world.actors.length; ri++) {
      var rg = world.actors[ri];
      if (!rg.alive || rg.team === a.team || rg === a) continue;
      if (rg.target !== a) continue;
      if (rg.silentLock) continue;                 // 被动测距，不告警
      if (rg.emcon) continue;                      // 完全电磁静默，更不告警
      var rw = WEAPONS[rg.special];
      if (!rw || rw.seeker !== 'radar') continue;  // 只有主动雷达才告警
      a.rwrT = 0.6;
      a.rwrSrc = rg;
      break;
    }

    /* 对手也在学（设定 7.3）。

       敌方干扰机开着的时候，我方对它的适应度逐步上升 —— 于是同一台
       吊舱反复对你开机，压制窗口会一次比一次短。干扰机一关，适应度
       慢慢回落（换个人、换个频道，那个优势就回来了）。

       它消费在 fireAtTarget() 里：
       `resist *= 1 - t.ewPower * lockReduce * (1 - s.ewResist)`。 */
    var jammedBy = null;
    for (var ji = 0; ji < world.actors.length; ji++) {
      var je = world.actors[ji];
      if (je.alive && je.team !== a.team && je.ewPower > 0) { jammedBy = je; break; }
    }
    if (jammedBy) {
      s.ewResist = Math.min(1, (s.ewResist || 0) + dt * (0.18 + s.skill * 0.30));
    } else if (s.ewResist > 0) {
      s.ewResist = Math.max(0, s.ewResist - dt * 0.08);
    }

    /* ---------- 1. 威胁规避优先级最高 ---------- */
    var inc = findIncoming(a, world);
    if (inc) {
      s.mode = 'evade';
      s.evadeT = Math.max(s.evadeT, 0.55);
      s.msl = inc;
    } else if (s.mode === 'evade' && s.evadeT <= 0) {
      s.mode = a.hp < a.maxHp * 0.28 ? 'extend' : 'pursue';
    }

    /* ---------- 2. 血量过低脱离 ---------- */
    if (s.mode !== 'evade' && a.hp < a.maxHp * 0.25 && Math.random() < 0.004) {
      s.mode = 'extend';
      s.modeT = M3.rnd(4, 9);
    }
    if (s.mode === 'extend' && s.modeT <= 0) s.mode = 'pursue';

    /* ---------- 3. 选择目标 ---------- */
    if (s.role === 'drone') {
      /* 无人僚机没有判断力：目标来自**长机的授权**，
         而授权规则由僚机指令决定（1/2/3，见 codex「本作的表现形式：
         僚机指令」—— 那条说明是写给玩家的承诺，行为必须与它一致）：

           focus   只打长机当前锁定的目标 —— 最保守，也是默认档
           cover   优先打正在威胁长机的敌机，找不到就退回长机目标
           spread  在编队附近自主接战（"扩大搜索扇面，自动接战"）

         另有一条凌驾于指令之上的规则：**数据链中断时降级为完全自主防御**。
         设定集与资料库都写了 —— 强对抗环境下数据链会被切断，
         此时无人机只能规避和自卫，不能主动攻击。
         压制来自干扰机辐射场打在它身上的 suppressed（见 entities.js）。 */
      var dLead = world.player;
      var leadOk = dLead && dLead.alive && dLead.target && dLead.target.alive;
      if (a.suppressed > 0.35) {
        s.target = null;                       // 自主防御：只规避，不开火
      } else if (s.cmd === 'spread') {
        s.target = nearestEnemy(a, world, 9000);
      } else if (s.cmd === 'cover') {
        s.target = leadThreat(a, world) || (leadOk ? dLead.target : null);
      } else {
        s.target = leadOk ? dLead.target : null;
      }
    } else if (s.retargetT <= 0 || !s.target || !s.target.alive) {
      s.retargetT = 0.35 + (1 - s.skill) * 0.9;
      if (s.role === 'wingman' && s.cmd === 'focus' && world.player && world.player.target) {
        s.target = world.player.target;
      } else if (s.role === 'wingman' && s.cmd === 'cover') {
        // 掩护：优先打正在锁定长机的敌机
        s.target = leadThreat(a, world) || nearestEnemy(a, world, 9000);
      } else {
        /* 被主动雷达照射时优先咬照射者 —— "谁在照我，我先打谁"。

           被动测距（silentLock）的对手不会走到这里，所以带一件
           GUS-6 / GUS-9 就能安静地锁定别人，而不把仇恨引到自己身上。 */
        if (a.rwrSrc && M3.dist2(a.rwrSrc.pos, a.pos) < 12000 * 12000) {
          s.target = a.rwrSrc;
        } else {
          s.target = nearestEnemy(a, world, s.role === 'wingman' ? 11000 : 15000);
          /* 空中没目标、手上却带着对面弹 → 去挑海面上的打。

             以前 AI 完全看不见 world.targets（nearestEnemy 只扫 actors），
             于是"敌机炸你的前进基地"这件事在代码里根本不存在 ——
             下游的随队攻击机只能是摆设。 */
          if (!s.target) s.target = surfaceTargetFor(a, world);
        }
      }
    }

    /* ---------- 4. 分派行为 ---------- */
    var desired;
    var throttle = 0.85, ab = false;

    if (s.mode === 'evade' && s.msl) {
      var r = evade(a, s.msl, world);
      desired = r.dir;
      throttle = r.throttle;
      ab = r.ab;
      if (s.flareT <= 0 && a.flares > 0 && a.flareCd <= 0) {
        s.flareT = 1.8;
        Ent.breakLock(a, world);
      }
    } else if (s.mode === 'extend') {
      // 向低威胁方向脱离，同时保持能量
      var away = nearestEnemy(a, world, 20000);
      if (away) desired = M3.norm(M3.sub(a.pos, away.pos));
      else desired = a.fwd;
      desired = M3.norm(M3.V(desired.x, 0.06, desired.z));
      throttle = 1; ab = true;
    } else if (s.role === 'drone') {
      /* 无人僚机永远待在编队里，不追出去。

         它的价值在于替长机挡导弹、探路、把导弹挂架打空 ——
         一旦追出去，这三件事就都做不成了。
         所以它的机动**只跟编队位置有关**，目标只用于决定何时开火。 */
      var dLead2 = world.player;
      if (dLead2 && dLead2.alive) {
        var sl = s.formation || { dx: 140, dy: 25, dz: -190 };
        /* 指令同时改变站位 —— 这是 codex 里"分开"与"靠拢"的落点：

             cover   收进到 55%（向你靠拢、贴上去）
             spread  外拉到 160%（分开，扇面摊得更宽）
             focus   保持原槽位

           无论哪一档都仍然待在长机附近，不追出去 —— 那三条价值
           （替长机挡弹、探路、把挂架打空）全建立在"不脱离"上。 */
        var ek = s.cmd === 'cover' ? 0.55 : (s.cmd === 'spread' ? 1.6 : 1);
        var wpD = M3.add(dLead2.pos,
          M3.add(M3.mul(dLead2.right, sl.dx * ek),
            M3.add(M3.mul(dLead2.fwd, sl.dz * ek), M3.V(0, sl.dy, 0))));
        desired = M3.norm(M3.sub(wpD, a.pos));
        var dWp = M3.dist(wpD, a.pos);
        // 落后就开加力追，到位就收油门省油
        if (dWp > 700) { throttle = 1; ab = true; }
        else throttle = 0.75;
      } else {
        /* 长机没了：原地盘旋到燃料耗尽。

           它不会接管战局，也不会自己选目标 —— 这不是能力问题，
           是它压根没有那套东西。设定里就是这么写的。 */
        var tan = a.right;
        var climb = a.pos.y < 3200 ? 0.12 : -0.05;
        desired = M3.norm(M3.V(tan.x, climb, tan.z));
        throttle = 0.6;
      }
    } else if (s.role === 'wingman' && (!s.target || s.cmd === 'spread')) {
      // 编队 / 巡航
      var lead = world.player;
      if (lead && lead.alive) {
        var slot = s.formation || { dx: 120, dy: 30, dz: -180 };
        var wp = M3.add(lead.pos,
          M3.add(M3.mul(lead.right, slot.dx),
            M3.add(M3.mul(lead.fwd, slot.dz), M3.V(0, slot.dy, 0))));
        desired = M3.norm(M3.sub(wp, a.pos));
        if (M3.dist(wp, a.pos) > 900) { throttle = 1; ab = true; }
        else throttle = 0.7;
        // 有空战机会时仍要接战
        if (s.target) { desired = leadTo(a, s.target); throttle = 0.95; ab = true; }
      } else desired = a.fwd;
    } else if (s.target && s.target.kind === 'target') {
      /* 对面目标：**保持高度**，只把机头转过去。

         不能走 pursue()：那是为空战写的，`leadTo` 会一路指向海面，
         飞机就一头扎下去 —— 而下面有"离地 420 m 强行拉起"的保护，
         结果是在目标上方反复俯冲-拉起，永远进不了投放包线。 */
      desired = approachSurface(a, s.target);
      throttle = 0.9; ab = false;
    } else if (s.target) {
      var res = pursue(a, s.target, world);
      desired = res.dir;
      throttle = res.throttle;
      ab = res.ab;
    } else {
      // 无目标：巡逻
      s.wander += dt * 0.25;
      desired = M3.norm(M3.V(Math.cos(s.wander), 0.02, Math.sin(s.wander)));
      throttle = 0.62;
    }

    if (!desired) desired = a.fwd;

    /* 所有分支都汇到这里，所以升限钳制放在这一处就够了 ——
       无论是追击、规避还是编队，都不会为了追人钻到没有机动能力的高度。 */
    desired = clampCeiling(a, desired);

    steerTo(a, desired, ctrl, a);

    // 硬性保护：撞地前强行拉起
    if (a.pos.y < 420 && a.fwd.y < 0.05) {
      desired = M3.norm(M3.V(a.fwd.x, 0.5, a.fwd.z));
      steerTo(a, desired, ctrl, a);
      throttle = 1; ab = true;
    }

    a.throttle = throttle;
    a.ab = ab;

    /* 把 AI 的选择写回 actor 的公开字段。

       世界里的其它部分一直在读它：HUD 的"谁在照射我"（RWR 环）、
       僚机的掩护判定（leadThreat）、以及 AI 之间的相互感知。
       少了这一行，那些地方全都静默失效 —— 它们不报错，
       只是永远看不到东西。 */
    a.target = s.target;

    /* ---------- 5. 开火 ---------- */
    if (s.mode === 'evade' || s.mode === 'extend') {
      a.firingGun = false;
      return;
    }
    var t = s.target;
    if (!t || !t.alive) { a.firingGun = false; return; }

    // 侦察 / 播撒构型在受损前不主动接战
    if (a.behavior === 'recon' && a.hp >= a.maxHp * 0.88) {
      a.firingGun = false;
      return;
    }

    var toT = M3.sub(t.pos, a.pos);
    var dist = M3.len(toT);
    var losDir = M3.mul(toT, 1 / Math.max(1, dist));
    var off = M3.angleBetween(a.fwd, losDir);

    // --- 机炮 ---
    /* 没有机炮的机型是合法的（预警机、勤务机、重型轰炸机在数据里是
       `gun: null`）。没有炮只跳过机炮这一段，**不能 return** ——
       以前这里直接读 `WEAPONS[a.gun].range`，一架没有炮的飞机只要
       走到开火段就会抛异常；后来改成 return，又把下面的导弹段一起截掉了：
       M5 的巡航弹载机、M8 的轰炸机挂着弹却一发都没打出去过。 */
    var gunW = WEAPONS[a.gun];
    a.firingGun = false;
    if (gunW) {
      var gunRange = (a.pos.y > 18000 ? gunW.highRange : gunW.range);
      var gunCone = 0.028 + (1 - s.skill) * 0.02;
      a.firingGun = (dist < gunRange * 0.9 && off < gunCone * 3.2 && a.gunAmmo > 0);
    }
    if (a.firingGun) {
      Ent.fireGun(a, world);
      /* 别人开火的声音。

         以前只有玩家自己的机炮有音效，AI 打出去的子弹是**无声**的 ——
         而它们通常在视线的侧后方，于是玩家会以为"敌人从来不开炮"。
         实测 AI 每 30 秒开火约 490 次，多数就是被这样忽略掉的。

         gunShotAt 内部做了采样节流：这里每秒会被调用六十多次。 */
      if (world.player) SFX.gunShotAt(M3.dist(a.pos, world.player.pos));
    }

    // --- 导弹 / 对面弹 ---
    /* 开火前挑一件：先看目标类别（对空 / 对面），再看射程 ——
       够得着的里面取**射程最短**的那件（用远距弹打近目标，等于把一场
       只有几发的重弹浪费在格斗距离上）。挑中谁，`a.special` 就是谁：
       这就是"AI 换武器"的全部 —— 没有独立的选弹状态，只有这一次挑选。
       规则见 entities.js 的 chooseWeapon()。

       注意这里**不再**用 dist < 7200 一刀切：那是对空弹时代的写法，
       远距弹（CLA-17 的 12.5 km）与对地弹的投放包线差了好几倍，
       够不够得着由每件武器自己的 lockDist 判。 */
    var pick = Ent.chooseWeapon(a, t, dist);
    if (pick) {
      Ent.setWeapon(a, pick);
      var spW = WEAPONS[pick];
      if (s.shootT <= 0 && a.spAmmo > 0 && a.spCd <= 0) {
        var cone = spW.lockCone;
        // 高空时导引头视场收窄
        if (a.pos.y > 18000) cone *= 0.8;
        // 越高越难锁定（动压不足）
        var lockK = 1 - Math.min(0.25, Math.max(0, (a.pos.y - 15000) / 40000));
        /* 目标的反锁定条件有两个来源：

           1. 被动吊舱（拖曳诱饵 / 静默）—— 常驻，取 lockResist
           2. 主动电子战（ZUN-4「回声」）—— 正在干扰**且本弹是雷达制导**时
              锁定距离被压缩。红外弹打的是点源热信号，不吃雷达干扰。

           还有"对手也在学"这一层：ai.ewResist 是这名飞行员对同一台
           干扰机的适应程度，越高，同样的压制越不管用。 */
        var resist = (t && t.lockResist) ? (1 - t.lockResist) : 1;
        if (t && t.ewPower > 0 && spW.seeker === 'radar') {
          resist *= (1 - t.ewPower * (t.ewLockReduce || 0) * (1 - (s.ewResist || 0)));
        }
        var okDist = dist < spW.lockDist * lockK * resist;
        var okAng = off < cone * 0.85;
        /* 最小发射距离。对面目标给得比空中小目标保守一点：
           贴得太近，滑翔弹/炸弹的引信来不及开。 */
        var minR = spW.nezer ? 1400 : (t.kind === 'target' ? 1200 : 700);
        if (okDist && okAng && dist > minR && Math.random() < 0.35 + s.skill * 0.45) {
          if (world.fireMissile) world.fireMissile(a, t);
          s.shootT = M3.rnd(2.6, 5.2) * (1.6 - s.skill * 0.6);
        }
      }
    }
  }

  /* ============================================================
     追击
     ============================================================ */
  function leadTo(a, t) {
    var toT = M3.sub(t.pos, a.pos);
    var dist = M3.len(toT);
    var tGo = dist / Math.max(60, a.speed);
    var tv = t.vel || M3.V(0, 0, 0);
    var aim = M3.add(t.pos, M3.mul(tv, tGo * 0.85));
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
    if (a.pos.y < 900 && a.fwd.y < 0) {
      desired = M3.norm(M3.V(desired.x, Math.max(desired.y, 0.25), desired.z));
    }
    // 高空：避免过度爬升损失动压
    if (a.pos.y > 19000 && desired.y > 0.35) {
      desired = M3.norm(M3.V(desired.x, 0.35, desired.z));
    }
    // 防止陷入纯垂直爬升（会失速）
    if (a.fwd.y > 0.82 && a.speed < a.phys.vStall * 1.5) {
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
     对地攻击（M2 里敌方地面设施不需要，但玩家僚机需要打平台）
     ============================================================ */
  function strafeTarget(a, t, world) {
    var desired = leadTo(a, t);
    return { dir: desired, throttle: 0.9, ab: false };
  }

  return {
    attach: attach, update: update, steerTo: steerTo,
    findIncoming: findIncoming, nearestEnemy: nearestEnemy,
    leadTo: leadTo, strafeTarget: strafeTarget
  };
})();
