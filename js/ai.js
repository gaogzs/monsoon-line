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
  function steerTo(a, desired, out, st) {
    var fx = M3.dot(desired, a.fwd);
    var rx = M3.dot(desired, a.right);
    var ux = M3.dot(desired, a.up);

    var off0 = Math.acos(M3.clamp(fx, -1, 1));
    var mag0 = M3.clamp(off0 * 2.3, 0, 1);

    /* ---------- 情况 A：目标在机头斜前方偏下 → 直接推杆俯冲 ----------
       这一支是必须的。如果前下方的目标也走"滚转对齐再拉杆"那套，
       算出来的滚转角会接近 ±π，于是玩家把鼠标轻轻往下推一点，
       飞机会先滚半圈、然后开始抬头 —— 完全不是"俯下"。

       判据用 ux 而不是归一化后的 up：up 在小离轴角时几乎总是 ±1，
       拿它当阈值基本永远命中不了。 */
    /* 但"前下方"要分两段，不是一律推杆。

       目标只是在机头略微偏下时（离轴角小），推杆是最短路径。
       而目标已经压到很下方时（ux 很负），推杆要转过大半个圆才追得上，
       同时推杆权限本来就只有拉杆的一半（见 entities.js 的俯仰不对称）——
       这时候**滚转半圈再仰起**反而更快，也是真实空战里的做法。

       分界取 ux = -0.62，约合离轴角 128°：比它更靠前的走推杆，
       更靠后的交给下面那套滚转仰起。 */
    /* 分界不再用固定的 ux 阈值。

       ux 能取到多小取决于 FOV（鼠标最多只能指到半个 FOV 之外），
       固定阈值会导致某些 FOV 下永远够不到、另一些下过早触发。
       玩家对象带 aimDown（鼠标在屏幕上的归一化纵向位置），有它就按它判；
       AI 没有鼠标，退回按角度，阈值取 -0.55。 */
    var tooFarDown = (st && st.aimDown !== undefined)
      ? (st.aimDown > 0.8)
      : (ux <= -0.55);

    if (fx > 0.25 && ux < -0.05 && !tooFarDown) {
      var down = M3.clamp(-ux, 0, 1);
      // 小幅滚转把目标摆到"正下方"，而不是正上方
      var sideErr = Math.atan2(rx, -ux);
      out.roll = M3.clamp(-sideErr * 2.0, -1, 1) * 0.5;
      out.pitch = -mag0 * (0.55 + 0.45 * Math.sqrt(down));
      out.yaw = 0;
      return out;
    }

    /* ---------- ① 滚转：消掉目标的侧向分量 ---------- */
    // 使目标落到"正上方"所需的滚转角
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
    var rollCmd = M3.clamp(-rollErr * 2.8, -1, 1);

    /* ---------- ② 俯仰：对齐度越高，拉得越满 ---------- */
    var off = Math.acos(M3.clamp(fx, -1, 1));     // 机头与目标的夹角

    // 目标在机体横向平面里偏向哪一侧：+1 = 正上，0 = 正侧方，-1 = 正下
    var lateral = Math.sqrt(rx * rx + ux * ux);
    var up = lateral > 1e-4 ? M3.clamp(ux / lateral, -1, 1) : 1;

    var mag = M3.clamp(off * 2.3, 0, 1);
    var pitchCmd;
    if (up >= 0) {
      // 已在上半平面：拉杆量随对齐度迅速升满
      pitchCmd = mag * (0.55 + 0.45 * Math.sqrt(up));
    } else {
      // 还在下半平面：交给滚转去解决，只保留很小的杆量维持姿态
      pitchCmd = mag * 0.18 * (1 + up);
    }

    /* ---------- 方向舵：只在目标贴近正后方时帮一把 ---------- */
    var yawCmd = 0;
    if (fx < -0.45) yawCmd = M3.clamp(rx * 1.8, -1, 1);

    out.pitch = pitchCmd;
    out.roll = rollCmd;
    out.yaw = yawCmd;
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
      target: null,
      retargetT: M3.rnd(0, 1.2),
      formation: opt.formation || null,   // {lead, dx, dy, dz}
      wander: M3.rnd(0, 6.28),
      cmd: opt.cmd || 'spread'
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
      if (r.phase === 'ingress') {
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
      /* 无人僚机没有自主判断力：目标永远来自长机的授权。

         长机锁定了谁，它才打谁；长机没锁定，它就一弹不发。
         设定里写得清楚 —— 它自己看不见任何东西，全靠长机把参数喂过来。 */
      var dLead = world.player;
      s.target = (dLead && dLead.alive && dLead.target && dLead.target.alive)
        ? dLead.target : null;
    } else if (s.retargetT <= 0 || !s.target || !s.target.alive) {
      s.retargetT = 0.35 + (1 - s.skill) * 0.9;
      if (s.role === 'wingman' && s.cmd === 'focus' && world.player && world.player.target) {
        s.target = world.player.target;
      } else if (s.role === 'wingman' && s.cmd === 'cover' && world.player) {
        // 掩护：优先打正在锁定长机的敌机
        var threat = null;
        for (var i = 0; i < world.actors.length; i++) {
          var e = world.actors[i];
          if (!e.alive || e.team === a.team) continue;
          if (e.target === world.player) { threat = e; break; }
        }
        s.target = threat || nearestEnemy(a, world, 9000);
      } else {
        s.target = nearestEnemy(a, world, s.role === 'wingman' ? 11000 : 15000);
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
        var wpD = M3.add(dLead2.pos,
          M3.add(M3.mul(dLead2.right, sl.dx),
            M3.add(M3.mul(dLead2.fwd, sl.dz), M3.V(0, sl.dy, 0))));
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
    steerTo(a, desired, ctrl, a);

    // 硬性保护：撞地前强行拉起
    if (a.pos.y < 420 && a.fwd.y < 0.05) {
      desired = M3.norm(M3.V(a.fwd.x, 0.5, a.fwd.z));
      steerTo(a, desired, ctrl, a);
      throttle = 1; ab = true;
    }

    a.throttle = throttle;
    a.ab = ab;

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
    var gunW = WEAPONS[a.gun];
    var gunRange = (a.pos.y > 18000 ? gunW.highRange : gunW.range);
    var gunCone = 0.028 + (1 - s.skill) * 0.02;
    a.firingGun = (dist < gunRange * 0.9 && off < gunCone * 3.2 && a.gunAmmo > 0);
    if (a.firingGun) {
      Ent.fireGun(a, world);
      /* 别人开火的声音。

         以前只有玩家自己的机炮有音效，AI 打出去的子弹是**无声**的 ——
         而它们通常在视线的侧后方，于是玩家会以为"敌人从来不开炮"。
         实测 AI 每 30 秒开火约 490 次，多数就是被这样忽略掉的。

         gunShotAt 内部做了采样节流：这里每秒会被调用六十多次。 */
      if (world.player) SFX.gunShotAt(M3.dist(a.pos, world.player.pos));
    }

    // --- 导弹 ---
    if (s.shootT <= 0 && dist < 7200) {
      var spW = WEAPONS[a.special];
      var canUse = spW && (spW.kind === 'aam');
      if (canUse && a.spAmmo > 0 && a.spCd <= 0) {
        var cone = spW.lockCone;
        // 高空时导引头视场收窄
        if (a.pos.y > 18000) cone *= 0.8;
        // 越高越难锁定（动压不足）
        var lockK = 1 - Math.min(0.25, Math.max(0, (a.pos.y - 15000) / 40000));
        // 目标带了拖曳诱饵 / 拖曳式干扰舱，锁定距离就得打折
        var resist = (t && t.lockResist) ? (1 - t.lockResist) : 1;
        var okDist = dist < spW.lockDist * lockK * resist;
        var okAng = off < cone * 0.85;
        var minR = spW.nezer ? 1400 : 700;
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
