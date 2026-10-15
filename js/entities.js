/* ============================================================
   entities.js —— 飞行模型 / 武器 / 粒子
   本作物理的两个支点：
     · 动压 q = ½ρv²  决定操纵面权限，也决定导弹的可用过载
     · 20 km 高度 ρ=0.088 kg/m³（海平面的 7.2%）
   ============================================================ */
'use strict';

var Ent = (function () {

  var G = 9.80665, RHO0 = 1.225;

  /* 激光照射锥：载机的机头必须保持在这个角度内才算"还在照着"。

     25° 是按玩法定的 —— 太宽（比如 45°）玩家把机头随便一偏照射都不掉，
     那句"命中前保持照射"就形同虚设；太窄（10°）则俯冲投放时几乎
     不可能一边修正姿态一边保持照射。25° 大致是"稍微偏一下没事、
     真的转开就丢"的距离。 */
  var LASER_CONE = 25 * Math.PI / 180;

  /* ============================================================
     标准大气密度（ISA）
     ============================================================ */
  function airDensity(y) {
    if (y < 0) y = 0;
    if (y < 11000) {
      var T = 288.15 - 0.0065 * y;
      return 1.225 * Math.pow(T / 288.15, 4.2561);
    }
    if (y < 20000) {
      return 0.3639 * Math.exp(-(y - 11000) / 62188.6);
    }
    if (y < 32000) {
      var T3 = 216.65 + 0.001 * (y - 20000);
      return 0.08803 * Math.pow(T3 / 216.65, -35.16);
    }
    return 0.0132;
  }

  /** 动压（Pa） */
  function qOf(y, speed) {
    var rho = airDensity(y);
    return 0.5 * rho * speed * speed;
  }

  /** 气动权限系数：动压低于约 22 kPa 开始下降 */
  /* 操控权限随动压变化：q = ½ρv²。

     两个端点允许机型自己覆盖，这是把"高空强"具体化的唯一地方 ——
     否则一架飞机在高空好不好使，其实只由"它飞得快不快"决定。

       ctrlFull   满操控所需的动压。调低 = 高速时更早把操控拉满
       ctrlFloor  低动压时的保底操控。调高 = 能量耗尽后仍能控制

     默认 22000 / 0.13 是"普通机型"。D-14 与 F-9 各改写一端，
     于是虽然都在 18 公里以上强，性格完全不同：

       D-14   ctrlFloor 0.34
              第三涵道在稀薄空气里仍给得出控制力矩（这是它 desc 里
              本来就写了、但一直没落到物理上的设定）。
              能量耗尽时别人掉到 0.13、它还在 0.34 —— 2.6 倍。
              代价是结构只有 92、失速速度 122，硬碰硬不行。

       F-9    ctrlFull 16500
              高速区间里操控提前拉满；但 ctrlFloor 仍是默认的 0.13，
              所以一旦被拖慢，它掉得比谁都狠。 */
  function ctrlFactor(y, speed, ac) {
    var k = qOf(y, speed) / ((ac && ac.ctrlFull) || 22000);
    var lo = (ac && ac.ctrlFloor) || 0.13;
    return M3.clamp(k, lo, 1.0);
  }

  /** 导弹转弯率的气动缩放 */
  function turnFactor(y) {
    var r = airDensity(y) / RHO0;
    return Math.max(0.34, Math.sqrt(r));
  }

  /* ============================================================
     飞机
     ============================================================ */
  function makeAircraft(o) {
    var ac = null, i;
    for (i = 0; i < AIRCRAFT.length; i++) if (AIRCRAFT[i].id === o.type) ac = AIRCRAFT[i];
    if (!ac) ac = AIRCRAFT[0];

    /* 挂载武器：优先用调用方指定的，没指定就退回该机型默认配置里的第一种
       （AI 走这条路）。注意不能再用 ac.defSpecial —— 挂载系统改造后
       那个字段已经不存在了，早先这里会读到 undefined 然后崩掉。 */
    var spWid = o.special || null;
    if (!spWid && ac.defaultLoadout) {
      for (var dk in ac.defaultLoadout) {
        if (ac.defaultLoadout[dk]) { spWid = ac.defaultLoadout[dk]; break; }
      }
    }
    if (spWid && !WEAPONS[spWid]) spWid = null;

    var a = {
      kind: 'air',
      team: o.team === undefined ? 0 : o.team,
      type: ac.id,
      ac: ac,
      phys: ac.phys,
      model: ac.model,
      name: ac.name + ' ' + ac.cn,
      nick: ac.nick,
      alive: true,
      isPlayer: !!o.isPlayer,
      isDrone: !!o.isDrone,

      pos: M3.V(o.x || 0, o.y || 3000, o.z || 0),
      fwd: M3.norm(o.fwd || M3.V(0, 0, 1)),
      up: M3.V(0, 1, 0),
      right: M3.V(1, 0, 0),

      speed: o.speed || 300,
      vel: M3.V(0, 0, 300),
      throttle: o.throttle === undefined ? 0.72 : o.throttle,
      ab: false,

      hp: ac.phys.hp,
      maxHp: ac.phys.hp,

      ctrl: { pitch: 0, roll: 0, yaw: 0 },

      gun: ac.gun,
      gunAmmo: WEAPONS[ac.gun].ammo,
      gunHeat: 0,
      firingGun: false,

      special: spWid,
      spAmmo: spWid ? WEAPONS[spWid].ammo : 0,
      spCd: 0,
      /* 并行发射槽：{ 武器 id: [槽1剩余, 槽2剩余, ...] }
         槽数 = 该武器占用的挂载点数。
         按一次发射键打 1 枚，占用一个冷却完毕的槽；
         所有槽都在装填时按不出去。这就是"齐射数"的真正含义。 */
      slotCd: {},
      spActive: 0,        // ECM 剩余生效时间
      /* 认知电子战的闭环状态（设定集 7.3）。

         ewT       本次开机已持续的时间
         ewBurnT   对手完成对抗、重新建立跟踪的时刻（3–8 秒，开机时定）
         ewPower   当前压制强度 0..1，由 stepAircraft 每帧算出
         ewWid     正在干扰的是哪件吊舱（不能看 special —— 玩家会切枪）
         suppressed 本机被敌方压制的程度 0..1（驱动雷达雪花与数据链中断）

         ewPower 是**唯一**的压制出口：锁定判定读它，不读 spActive。 */
      ewT: 0,
      ewBurnT: 0,
      ewPower: 0,
      ewWid: null,
      ewLockReduce: 0,    // 那件吊舱的 lockReduce
      suppressed: 0,
      rwrT: 0,            // 被主动雷达照射的剩余告警时间（见 ai.js 的 RWR 扫描）
      rwrSrc: null,       // 正在照我的那一架
      spCharges: 0,       // DEW 充能数（构造末尾按武器初始化）
      spChargeT: 0,       // DEW 下一次充能恢复的倒计时
      gunTimer: 0,

      // 单位是"组"（一次投放一组诱饵），不是单发
      flares: o.flares === undefined ? 80 : o.flares,
      flareCd: 0,

      target: null,
      lockProgress: 0,
      locked: false,
      rwr: [],            // 正在锁定本机的导弹/敌机

      /* 空挂架：用一个远大于任何装填时间的冷却值表示"这里永远不会装填"。
         储备少于挂架数时，多出来的挂点从一开始就是这个状态。 */
      // （SLOT_EMPTY 在下方定义，slotCd 在 game.js 里填充时用到）

      q: 0,
      stall: false,
      dead: false,
      smokeTimer: 0,
      trailTimer: 0,

      ai: null,
      radio: o.radio || null,
      kills: 0,
      group: o.group || null
    };
    a.right = M3.cross(a.up, a.fwd);
    var w0 = WEAPONS[a.special];
    if (w0 && w0.kind === 'dew') a.spCharges = w0.charges;
    return a;
  }

  /* 空挂架的冷却值。

     储备弹数少于挂架数时，打出去之后那几个槽不该再"装填完成" ——
     因为仓库里确实没有弹了。让它们停在冷却状态是最省事的做法，
     但那样 HUD 会一直显示"装填中"，等于说谎。

     所以用一个永远减不到 0 的值，语义是"这个挂架本来就空着"。 */
  var SLOT_EMPTY = 1e9;

  /* ============================================================
     飞机每帧更新
     ============================================================ */
  function stepAircraft(a, dt, world) {
    if (!a.alive) return;
    var p = a.phys;

    // ---- 动压 ----
    var q = qOf(a.pos.y, a.speed);
    a.q = q / 1000;                        // kPa，供 HUD 显示

    var ctrl = ctrlFactor(a.pos.y, a.speed, a.ac);
    a.stall = a.speed < p.vStall;
    if (a.stall) ctrl *= 0.34;

    // ---- 姿态：对机体基向量施加局部旋转 ----
    var pIn = M3.clamp(a.ctrl.pitch, -1, 1);
    var rIn = M3.clamp(a.ctrl.roll, -1, 1);
    var yIn = M3.clamp(a.ctrl.yaw, -1, 1);

    /* 高 G 过载倍率。主要由 game.js 的 controlPlayer() 驱动，
       但任何设置了 a.gLoad 的实体都会受影响（AI 目前不设，所以是 1）。
       俯仰放大得比滚转多 —— 拉杆才是真正产生过载的那个动作。 */
    var gl = (a.gLoad === undefined) ? 1 : M3.clamp(a.gLoad, 1, 2.3);

    /* 俯仰权限是不对称的，向上远大于向下。

       现实里飞行员能承受大约 +9G 的拉起过载，却只能承受 -3G 的推杆过载；
       机翼在负迎角方向的失速边界也来得更早。结果是**同一架飞机，
       向下机动的能力明显小于向上** —— 这就是为什么"推杆俯冲"从来
       不是空战里的首选动作，而"拉杆爬升"是。

       这里用 0.5 的系数体现，即推杆效率只有拉杆的一半。
       取 0.5 而不是现实里的约 1/3，是因为 1/3 会让俯冲攻击
       这个基本战术变得过于笨重。 */
    var PITCH_DOWN_K = 0.5;
    var pitchAuth = (pIn >= 0) ? 1 : PITCH_DOWN_K;
    var dPitch = p.pitch * pitchAuth * ctrl * dt * gl;
    var dRoll = p.roll * M3.clamp(ctrl * 1.8, 0.28, 1) * dt * (1 + (gl - 1) * 0.45);
    var dYaw = p.yaw * ctrl * dt;

    if (pIn) {                                   // 抬头为正 → 绕 right 转负角
      var ang = -dPitch * pIn;
      a.fwd = M3.rotAxis(a.fwd, a.right, ang);
      a.up = M3.rotAxis(a.up, a.right, ang);
    }
    if (rIn) {                                   // 右滚为正 → 绕 fwd 转负角
      var ang2 = -dRoll * rIn;
      a.right = M3.rotAxis(a.right, a.fwd, ang2);
      a.up = M3.rotAxis(a.up, a.fwd, ang2);
    }
    if (yIn) {
      var ang3 = dYaw * yIn;
      a.fwd = M3.rotAxis(a.fwd, a.up, ang3);
      a.right = M3.rotAxis(a.right, a.up, ang3);
    }

    // 失速低头力矩
    if (a.stall && a.pos.y > 60) {
      var st = (p.vStall - a.speed) / p.vStall;
      var angS = 0.55 * st * dt;
      a.fwd = M3.rotAxis(a.fwd, a.right, angS);
      a.up = M3.rotAxis(a.up, a.right, angS);
    }

    var B = M3.orthonormalize(a.fwd, a.up);
    a.fwd = B.fwd; a.up = B.up; a.right = B.right;

    // ---- 速度 ----
    // 油门轴可能超过 1（加力区），插值前先夹回 0..1；
    // 是否加力由 a.ab 单独决定，见 game.js controlPlayer()
    var th = M3.clamp(a.throttle, 0, 1);
    var vTarget = M3.lerp(p.vStall * 0.74, a.ab ? p.vMax : p.vMil, th);
    vTarget -= a.fwd.y * 52;                                  // 爬升掉速 / 俯冲增速
    vTarget = Math.max(vTarget, p.vStall * 0.52);

    // 高空推力衰减：20 km 只有海平面的约 20%
    if (a.pos.y > 11000) {
      var k = M3.clamp(1 - (a.pos.y - 11000) / 15000, 0.20, 1);
      vTarget = M3.lerp(p.vStall * 0.55, vTarget, k);
    }

    // 可变后掠翼：低速展开（改善低速盘旋），高速后掠（减小波阻）
    if (a.ac && a.ac.variableSweep) {
      a.sweep = M3.clamp((a.speed - 170) / 250, 0, 1);
    }

    // 挂载越重越笨拙：加速、转向、滚转都吃一点亏。
    // loadFactor 只由玩家按机库配置设定，AI 不带挂载所以是 undefined。
    if (a.loadFactor) {
      // 系数来自 loadoutPenalty() —— 和机库面板显示的是同一份，
      // 免得界面上的数字与实际手感对不上
      /* 注意：这里是**整体替换** p，所以每个用到的字段都得列上。
         之前漏了 accel / decel，还写了个根本不存在的 acc ——
         于是下面 `p.accel` 取到 undefined，加减速彻底失去节流，
         推油门的速度变化变成瞬时的。 */
      var lp = loadoutPenalty(a.loadFactor);
      p = {
        vMax: p.vMax * lp.vMax,
        vMil: p.vMil * lp.vMil,
        vStall: p.vStall * lp.vStall,
        accel: p.accel * lp.accel,
        decel: p.decel * lp.decel,
        pitch: p.pitch * lp.pitch,
        roll: p.roll * lp.roll
      };
    }

    if (a.brake) vTarget = Math.min(vTarget, p.vStall * 0.92);
    var acc = (vTarget > a.speed) ? p.accel : p.decel;
    if (a.brake) acc = p.decel * 1.8;
    var dv = M3.clamp(vTarget - a.speed, -acc * dt, acc * dt);
    a.speed = M3.clamp(a.speed + dv, p.vStall * 0.42, p.vMax * 1.12);

    // ---- 位置 ----
    a.vel = M3.mul(a.fwd, a.speed);
    a.pos = M3.add(a.pos, M3.mul(a.vel, dt));

    // ---- 天花板 / 地形 ----
    if (a.pos.y > 23000) {
      a.pos.y = 23000 + (a.pos.y - 23000) * 0.2;
      a.fwd = M3.norm(M3.V(a.fwd.x, Math.min(a.fwd.y, -0.02), a.fwd.z));
      B = M3.orthonormalize(a.fwd, M3.V(0, 1, 0));
      a.fwd = B.fwd; a.up = B.up; a.right = B.right;
    }
    if (a.pos.y <= 2) {
      a.pos.y = 2;
      kill(a, world, true);
      return;
    }

    // ---- 冷却 ----
    if (a.spCd > 0) a.spCd -= dt;
    // 每件武器分开计时。否则按 R 切一下挂载就等于跳过装填了 ——
    // 那会让"打一发就换枪"变成无冷却连射。
    for (var ck in a.slotCd) {
      var slots = a.slotCd[ck];
      var pool = a.ammoPool ? a.ammoPool[ck] : undefined;

      // 就绪（= 挂着弹）的槽数。SLOT_EMPTY 是大正数，不会被算进来。
      var ready = 0;
      for (var si = 0; si < slots.length; si++) if (slots[si] === 0) ready++;

      for (si = 0; si < slots.length; si++) {
        if (slots[si] <= 0) continue;
        if (slots[si] >= SLOT_EMPTY) continue;      // 空挂架，永不装填
        /* 就绪的槽已经和剩余弹数一样多 → 没有弹能装进这个槽了。

           储备少于挂架数时，打出去的那几个槽会一直空着。
           玩家看到的不是"还在装填"，而是"没得装了" ——
           这比让挂架凭空变出一发弹诚实。 */
        if (pool !== undefined && ready >= pool) continue;
        slots[si] = Math.max(0, slots[si] - dt);
        if (slots[si] === 0) ready++;               // 装完占用一枚储备
      }
    }
    /* ---- 认知电子战：闭环结算 ----

       感知 → 识别 → 建模 → 合成干扰 → 评估效果 → 修正。

       设定里的 200 微秒回路不逐拍模拟，但它买来的东西是**时间**，
       所以这里必须是一条曲线，而不是一个常数倍率：

         ramp   开机后迅速爬到满（识别与建模需要一点点时间，0.22 秒）
         burn   对手在这个时刻完成对抗、重新建立跟踪（开机时按对手水平定）
         slide  对抗完成之后压制迅速衰减到 0 —— 这就是"攻击窗口"的长度

       ewPower 是唯一的出口：AI 开火判定、防空平台判定、玩家锁定降级、
       雷达雪花全部读它。 */
    if (a.spActive > 0) {
      a.ewT += dt;
      var ewRamp = Math.min(1, a.ewT / 0.22);
      var ewBurn = a.ewBurnT > 0 ? a.ewBurnT : 6;
      var ewSlide = a.ewT < ewBurn ? 1
        : Math.max(0, 1 - (a.ewT - ewBurn) / 1.1);
      a.ewPower = ewRamp * ewSlide;
      a.spActive -= dt;
      if (a.spActive <= 0) {
        a.spActive = 0;
        a.ewPower = 0;
        a.ewWid = null;
        a.ewLockReduce = 0;
      }
    } else if (a.ewPower !== 0) {
      a.ewPower = 0;
    }
    if (a.flareCd > 0) a.flareCd -= dt;
    if (a.gunHeat > 0) a.gunHeat -= dt;
    if (a.gunTimer > 0) a.gunTimer -= dt;

    // DEW 充能恢复
    var w = WEAPONS[a.special];
    /* DEW 充能恢复。

       原来这里用的条件是 `a.spCd <= 0`，但 GUS-2 是**自动拦截**、
       不需要手动发射，spCd 从来没被设过 —— 恒为 0，于是条件恒真，
       拦掉一枚导弹之后**下一帧就补满**。"充能 3 次、每 18 秒恢复一次"
       因此形同虚设。

       现在用独立的 spChargeT 计时：打掉一发就开始倒计时，
       到点才 +1，而且只在没满的时候走动。 */
    if (w && w.kind === 'dew' && a.spCharges < w.charges) {
      a.spChargeT -= dt;
      if (a.spChargeT <= 0) {
        a.spCharges++;
        a.spChargeT = w.recharge || 18;
      }
    }

    // ---- 拖烟（受损） ----
    if (a.hp < a.maxHp * 0.45 && world) {
      a.smokeTimer -= dt;
      if (a.smokeTimer <= 0) {
        a.smokeTimer = 0.045;
        var dmgK = 1 - a.hp / a.maxHp;
        spawnParticle(world.particles,
          M3.add(a.pos, M3.mul(a.fwd, -9)),
          M3.mul(a.vel, -0.06),
          M3.rnd(0.9, 2.1), M3.rnd(1.6, 4.0) * (0.6 + dmgK),
          dmgK > 0.75 ? '#2a2a2a' : '#6b6b6b',
          { grow: true, drag: 0.9 });
      }
    }

    // ---- 加力尾焰 ----
    if (a.ab && world) {
      a.trailTimer -= dt;
      if (a.trailTimer <= 0) {
        a.trailTimer = 0.028;
        var nzz = M3.add(a.pos, M3.mul(a.fwd, -10));
        spawnParticle(world.particles, nzz, M3.mul(a.vel, 0.02),
          M3.rnd(0.10, 0.22), M3.rnd(1.1, 2.0), '#ffb14a', { grow: true, drag: 2.5 });
      }
    }
  }

  /* ============================================================
     导弹
     ============================================================ */
  function makeMissile(o) {
    var w = WEAPONS[o.weapon];
    var m = {
      kind: 'missile',
      team: o.team === undefined ? 0 : o.team,
      weapon: o.weapon,
      w: w,
      model: w.model || 'missile',
      alive: true,
      pos: M3.clone(o.pos),
      fwd: M3.norm(o.fwd),
      up: M3.V(0, 1, 0),
      right: M3.V(1, 0, 0),
      speed: o.speed || 120,
      /* 无动力弹的初速**必须在这里给**。

         有发动机的弹每帧都会用 vel = fwd × speed 重算速度，所以初始
         零向量无所谓。无动力弹的速度却完全靠 vel 自己累积 ——
         初值给 0 的话它是"从空中静止开始往下掉"，扔出去的动能全丢了。 */
      vel: w.ballistic
        ? M3.mul(M3.norm(o.fwd), o.speed || 120)
        : M3.V(0, 0, 0),
      target: o.target || null,
      age: 0,
      life: w.vsLife,
      dmg: w.dmg,
      turn: w.turn,
      prox: w.prox,
      owner: o.owner || null,
      reDone: false,
      trailTimer: 0,
      seekerOn: true,
      lostTime: 0
    };
    m.right = M3.cross(m.up, m.fwd);
    return m;
  }

  /* ============================================================
     红外导引头的自主寻的

     红外弹和雷达弹的根本差别：它不需要对方"被锁定"才能发现对方 ——
     它只是**看谁更热**。所以它可以盲射：出膛之后在自己的视场角里
     找一个热源咬上去。

     这也解释了为什么大离轴格斗弹值钱：TOR-6「环刃」的视场是 ±88°，
     机头都不用转过去；而基础弹只有 45°，得先把机头带过去。

     "更热"怎么算 —— 这里没有热力学模型，用三个现有量凑：
       ab         加力尾焰是最大的热源（3 倍权重）
       throttle   油门越大，尾喷温度越高
       phys.hp    机体越大，被照到的辐射面越大（大飞机更亮）

     再按离轴角和距离衰减：视场边缘、越远的目标越难咬住。
     ============================================================ */
  function irSignature(e) {
    var s = (e.ab ? 3.0 : 1.0) * (0.4 + (e.throttle === undefined ? 0.7 : e.throttle));
    var hp = (e.phys && e.phys.hp) ? e.phys.hp : 100;
    s *= 0.6 + hp / 300;
    return s;
  }

  /* 在导引头的视场与捕获距离内，挑"红外特征最明显"的那一架。 */
  function irAcquire(m, world) {
    var w = m.w;
    var cone = w.lockCone || 0.6;
    var maxD = (w.lockDist || 4000) * 1.5;
    var best = null, bs = 0;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === m.team) continue;
      if (e === m.spoofed) continue;            // 刚用干扰弹骗过它的那一架不再咬
      var to = M3.sub(e.pos, m.pos);
      var d = M3.len(to);
      if (d > maxD) continue;
      var off = M3.angleBetween(m.fwd, M3.mul(to, 1 / Math.max(1, d)));
      if (off > cone) continue;                 // 不在导引头视场里
      var score = irSignature(e) * (1 - off / cone) / (1 + d / 1500);
      if (score > bs) { bs = score; best = e; }
    }
    return best;
  }

  function stepMissile(m, dt, world) {
    if (!m.alive) return;
    var w = m.w;
    m.age += dt;
    if (m.age > m.life) { killMissile(m, world, false); return; }

    // ---- 动力段 ----
    if (w.ballistic) {
      /* 无动力弹：出膛之后只剩重力和阻力。

         以前它们和导弹走同一条路（speed 恒定、vel = fwd × speed），
         所以炸弹是"贴着机头平飞出去"的 —— 不加速也不下坠，
         完全不像扔出去的东西。现在它是一条真正的抛物线：
         初速来自载机，之后每一次下坠都由重力累积。 */
      m.vel.y -= G * dt;
      var sp0 = M3.len(m.vel);
      if (sp0 > 1) {
        // 阻力与动压同量级：低空稠密掉速快，高空稀薄掉得慢
        var dragK = 0.00006 * airDensity(m.pos.y) * sp0;
        m.vel = M3.mul(m.vel, Math.max(0.2, 1 - dragK * dt));
      }
      m.speed = M3.len(m.vel);
    } else {
      var powered = m.age < effectiveLife(w, m.pos.y);
      if (powered) {
        m.speed = Math.min(m.speed + w.boost * dt, w.speed * (1 + Math.max(0, (12000 - m.pos.y) / 60000)));
      } else {
        m.speed = Math.max(m.speed - 140 * dt, 170);
      }
    }

    // ---- 导引 ----
    var t = m.target;
    if (t && (!t.alive || t.dead)) { t = null; }

    if (w.unguided) {
      /* 无制导：不找目标，也不做任何修正 ——
         出膛那一刻的指向就是它的一生。有 target 引用也当没有。 */
      m.target = null;
      t = null;
    }

    /* ---------- 红外弹的自主寻的 ----------

       出膛时没指定目标（玩家对着大概方向盲射），或者目标刚丢出视场，
       就在导引头的视场与捕获距离内重新挑一个**红外特征最明显**的。
       雷达弹不走这条路 —— 它得先有人把目标"锁定"给它。

       注意它跑在激光制导之前、制导段之前，所以这一帧挑中的目标
       当帧就能被修正。 */
    if (w.seeker === 'ir' && (!t || !m.seekerOn) && world) {
      var acq = irAcquire(m, world);
      if (acq) {
        t = acq;
        m.target = acq;
        m.seekerOn = true;
        m.lostTime = 0;
        m.reDone = false;
      }
    }

    /* ---------- 激光制导：弹没有导引头，靠的是载机的照射 ----------

       **当前处于休眠状态** —— 没有任何武器在使用 seeker: 'laser'
       （PEJ-30 已改成 eo 光电制导）。整段代码留着是因为机制本身是
       完整的、验证过的，将来要用直接给某件弹填上 'laser' 即可。

       原理：弹每一帧都去问投放它的那架飞机"你还在照着目标吗"。
       载机把机头转开、目标跑出照射锥，弹就立刻停止修正 ——
       但**不会消失**，它带着已有的速度和弹道继续往下掉，砸在哪算哪。
       这正是激光制导武器最真实的弱点：炸弹本身是瞎的。

       （写这段之前全项目只有 ir 和 radar 两种导引方式，
       "激光"只出现在文案里 —— 那时填个 'laser' 进数据也没人读。）
       ============================================================ */
    if (w.seeker === 'laser' && t) {
      var lit = false;
      var shooter = m.owner;
      if (shooter && shooter.alive) {
        var toSh = M3.sub(t.pos, shooter.pos);
        var dSh = M3.len(toSh);
        if (dSh > 1) {
          lit = M3.angleBetween(shooter.fwd, M3.mul(toSh, 1 / dSh)) < LASER_CONE;
        }
      }
      if (!lit) {
        m.laserLost = true;
        t = null;                 // 停止修正，继续自由落体
      } else {
        m.laserLost = false;
      }
    }

    if (t && m.seekerOn) {
      var toT = M3.sub(t.pos, m.pos);
      var dist = M3.len(toT);
      var los = M3.mul(toT, 1 / Math.max(1, dist));

      // 命中点预测（一阶提前量）
      var tGo = dist / Math.max(60, m.speed);
      var tvel = t.vel || M3.V(0, 0, 0);

      /* 导引品质（w.lead）：
         0 = 纯追踪，傻追着目标当前的位置，目标一横向机动就跟丢；
         1 = 完全预测，飞向解算出来的最优拦截点。

         这个系数比转弯率更能体现"这枚弹聪不聪明"：一枚转弯率一般
         但预测准的弹，打机动目标反而比一枚只会死咬尾巴的灵活弹更有效。 */
      var lead = (w.lead === undefined) ? 0.6 : w.lead;
      var aim = M3.add(t.pos, M3.mul(tvel, tGo * lead));
      var desired = M3.norm(M3.sub(aim, m.pos));

      // 视场限制：目标偏出 ±75° 视为丢失
      var off = M3.angleBetween(m.fwd, los);
      if (off > 1.35) {
        m.lostTime += dt;
        if (m.lostTime > 0.5) m.seekerOn = false;
      } else {
        m.lostTime = 0;
        /* 有些弹是专门为稀薄大气造的（舵面比同级大一倍），
           它们的过载不随空气变稀而崩塌 —— 在这个游戏里
           这就是"高空拦截弹"唯一说得通的定义，
           否则所有弹在上两万米之后都退化成同一种东西。 */
        var tf = turnFactor(m.pos.y);
        if (w.highAltImmune) tf = Math.max(tf, 0.78);
        var maxTurn = m.turn * tf * dt;
        var B = M3.turnToward(m.fwd, m.up, desired, maxTurn);
        m.fwd = B.fwd; m.up = B.up;
        m.right = M3.cross(m.up, m.fwd);
        var Bo = M3.orthonormalize(m.fwd, m.up);
        m.fwd = Bo.fwd; m.up = Bo.up; m.right = Bo.right;

        /* 转弯消耗动能。
           没有这一条，导弹的动力段之外照样能满过载无限机动，
           玩家的桶滚和 3/9 线规避全都没有意义 —— 因为对手不累。
           现在它必须为每一次急转付出速度。 */
        var want = M3.angleBetween(m.fwd, desired);
        var used = Math.min(want, maxTurn) / Math.max(1e-5, dt);   // 实际转弯率 rad/s
        var load = M3.clamp(used / 3.0, 0, 1);
        m.speed = Math.max(170, m.speed - load * 62 * dt);
      }

      // 近炸
      if (dist < m.prox + 6) {
        detonate(m, t, world);
        return;
      }
    } else if (!t) {
      // 无目标：直线飞
      m.seekerOn = false;
      // 重新捕获
      if (w.reAcquire && !m.reDone && world) {
        m.reDone = true;
        var best = null, bd = 1e9;
        for (var i = 0; i < world.actors.length; i++) {
          var e = world.actors[i];
          if (!e.alive || e.team === m.team) continue;
          // 刚刚用干扰弹骗过它的那架不再重锁 —— 但别的目标照锁不误
          if (e === m.spoofed) continue;
          var d2 = M3.dist2(e.pos, m.pos);
          if (d2 < bd && d2 < 2600 * 2600) { bd = d2; best = e; }
        }
        if (best) {
          m.target = best;
          m.seekerOn = true;
          m.turn = w.turn;
        }
      }
    }

    // ---- 位置 ----
    if (!w.ballistic) m.vel = M3.mul(m.fwd, m.speed);
    m.pos = M3.add(m.pos, M3.mul(m.vel, dt));

    if (w.ballistic) {
      // 弹体顺着弹道走 —— 自由落体的炸弹是"跟着速度矢量"的，不是昂着头的
      var sp2 = M3.len(m.vel);
      if (sp2 > 1) {
        var Bb = M3.orthonormalize(M3.mul(m.vel, 1 / sp2), m.up);
        m.fwd = Bb.fwd; m.up = Bb.up; m.right = Bb.right;
      }
    }

    if (m.pos.y <= 0) { killMissile(m, world, false); return; }

    /* ---- 尾迹：只有带发动机的才拉烟 ----

       这里必须按 **ballistic（无动力）** 判断，不能按 unguided（无制导）——
       两者是正交的，"没发动机"和"不找目标"根本不是一回事：

         PEJ-6 撒星    有发动机 / 无制导  → 拉烟（火箭当然有排气）
         GUT-9 滑翔锤  无发动机 / 有制导  → 不拉烟
         PEJ-30 铁蒺藜 无发动机 / 有制导  → 不拉烟
         PEJ-9 碎玉    无发动机 / 无制导  → 不拉烟

       之前按 unguided 判断，结果正好反了：火箭巢被当成纯炸弹不冒烟，
       而滑翔弹和激光制导炸弹一路拖着尾焰，看起来像有动力。 */
    if (w.ballistic) return;

    m.trailTimer -= dt;
    if (m.trailTimer <= 0) {
      m.trailTimer = 0.012;
      var whitish = m.age < effectiveLife(w, m.pos.y);
      spawnParticle(world.particles, m.pos,
        M3.mul(m.vel, -0.02),
        whitish ? M3.rnd(0.30, 0.75) : M3.rnd(0.8, 1.7),
        M3.rnd(0.7, 1.5), whitish ? '#e8e2d0' : '#b9b4a6',
        { grow: true, drag: 1.4 });
    }
  }

  /** 动力段时长（考虑冲压弹在高空的降级） */
  function effectiveLife(w, y) {
    if (w.scramjet && y > 18000) {
      return Math.max(1.2, w.life * 0.24);
    }
    return w.life;
  }

  /* ============================================================
     反辐射：谁"正在辐射"
     ============================================================ */
  /* 反辐射弹的判据（`w.antiRadar`）。

     这个字段曾经被从 BIN-8 上删掉过，理由写得很实在：全项目没有任何
     地方读它，世界里既没有"雷达开机状态"、也没有预警机 ——
     一枚只有文案的反辐射弹，实际表现和普通雷达弹毫无区别。

     现在两样都有了：预警机（`aewc`）会一直辐射到被压哑为止，
     干扰机在开机期间辐射，而 EMCON-Δ 是真的把雷达关掉了。
     所以这条语义可以落地了。 */
  function isRadiating(e) {
    if (!e || !e.alive) return false;
    if (e.aewc) return !e.aewcJammed;     // 预警机：被压哑就不再是辐射源
    if (e.ewPower > 0) return true;       // 干扰机 / 开机的电子战吊舱
    if (e.emcon) return false;            // 电磁静默：雷达关机
    return false;                         // 普通战斗机不构成反辐射目标
  }

  function detonate(m, t, world) {
    m.alive = false;
    explode(world.particles, m.pos, 1.0, 14);
    SFX.boom(0.75);
    if (t && t.alive && M3.dist(t.pos, m.pos) < m.prox + 14) {
      var dmg = m.dmg;
      /* 反辐射弹对**正在辐射**的目标伤害翻倍 —— 它找的就是那部雷达。 */
      if (m.w && m.w.antiRadar && isRadiating(t)) dmg *= 2;
      damage(t, dmg, world, m.owner);
    }
  }

  function killMissile(m, world, hit) {
    m.alive = false;
    if (hit) explode(world.particles, m.pos, 0.8, 12);
  }

  /** 干扰弹：尝试把追踪本机的红外弹骗走 */
  function breakLock(a, world) {
    if (a.flares <= 0 || a.flareCd > 0) return false;
    a.flares--;                      // 单位是"组"，一次投放一组诱饵
    // 间隔很短：玩家按住 V 会连着丢，由他自己决定丢几组，
    // 而不是被一个长冷却卡住（原来 1.6 s，等于一次交战只能放一发）
    a.flareCd = 0.12;
    SFX.flare();

    var i;
    /* 热焰弹：橙黄色，烧得亮、掉得快。

       初速必须有一个明确的**向机体下方**的分量。原来只有
       "载机速度 ×0.35 + 随机方向"，而相机就在飞机正后方，
       于是整团火被机速带着往前、直接糊在镜头上。
       现在继承的机速比例降到 0.22，再沿机体下方抛出去 ——
       视觉上就是真正"投"下去的一组火球。 */
    for (i = 0; i < 6; i++) {
      var dir = randUnit();
      var v = M3.add(M3.mul(a.vel, 0.22), M3.mul(dir, M3.rnd(26, 62)));
      v = M3.add(v, M3.mul(a.up, -M3.rnd(42, 78)));
      spawnParticle(world.particles, M3.add(a.pos, M3.mul(a.fwd, -6)), v,
        M3.rnd(1.1, 1.9), 0.85, '#ffd070', { grow: true, drag: 0.5, grav: 0.6 });
    }
    /* 箔丝（chaff）：淡白色的金属丝云，散得更开、下落更慢、停留更久。
       现代干扰弹是热焰弹与箔丝一起投放的 —— 前者骗红外，后者骗雷达，
       所以视觉上也该是两种东西，而不是一团橙色火光。

       尺寸比热焰弹小得多：它是丝，不是火球。上一轮把热焰弹从 2.2 缩到
       0.85 时漏掉了这里（1.25），结果丝团看着比火球还大。 */
    for (i = 0; i < 14; i++) {
      var cd2 = randUnit();
      var v2 = M3.add(M3.mul(a.vel, 0.28), M3.mul(cd2, M3.rnd(14, 44)));
      v2 = M3.add(v2, M3.mul(a.up, -M3.rnd(24, 48)));
      spawnParticle(world.particles, M3.add(a.pos, M3.mul(a.fwd, -5.5)), v2,
        M3.rnd(2.0, 3.2), 0.42, '#e6eef4', { drag: 1.15, grav: 0.10 });
    }

    var broke = 0;
    for (i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.target !== a) continue;

      /* 干扰弹是**热焰弹 + 箔丝**一起投放的：
         前者骗红外导引头，后者骗雷达导引头 —— 两种都能被干扰。

         早先这里写的是"雷达制导不吃干扰弹"，那句话是错的，
         等于把箔丝当成了不存在的东西。

         **flare 字段本身就是"被干扰的概率"**：越小越难骗。
         这一点也曾经被理解反过 —— 公式写成 1 − flare·k，等于把
         「抗干扰改型」TOR-4（flare 0.24，全表最低）变成了最容易
         被骗的那一枚。数据一直是对的，是公式错了。

         现在按**导引头**分流，因为两种干扰弹骗的不是同一种东西：

             ir         → flare      热焰弹
             radar      → flareRD    箔丝（缺省回退 flare）
             eo / laser → 0          成像导引头，两种都骗不到

         `flareRD` 是一张补丁表（见 data.js 的 FLARE_RD）。它修的是
         设定 8.3 里那句"雷达导引头有多普勒滤波，能滤掉静止的箔丝回波，
         所以雷达弹整体比红外弹难骗"—— 在那张表出现之前，flare 值是
         逐个手调的、没有按导引头排序，于是**雷达弹反而平均更好骗**。
         数值现状与那句设定的矛盾到此为止。 */
      var chance;
      if (m.w.seeker === 'radar') {
        chance = m.w.flareRD !== undefined ? m.w.flareRD : m.w.flare;
      } else if (m.w.seeker === 'eo' || m.w.seeker === 'laser') {
        chance = 0;
      } else {
        chance = m.w.flare;
      }
      if (!(Math.random() < chance)) continue;

      m.target = null;
      m.seekerOn = false;
      m.lostTime = 1;
      m.reDone = true;      // 关键：否则带 reAcquire 的弹会立刻把我们锁回来
      m.spoofed = a;        // 记住是谁骗的，重捕获时要避开它
      broke++;
    }
    return true;
  }

  /* ============================================================
     机炮
     ============================================================ */

  /* 标准正态样本（Box–Muller）。
     一次算出两个，第二个存着下次用 —— 机炮每秒要抽两百多个数，
     不值得为它每发建一个数组。 */
  var gaussSpare = null;
  function gauss() {
    if (gaussSpare !== null) { var v = gaussSpare; gaussSpare = null; return v; }
    var u = Math.random();
    if (u < 1e-12) u = 1e-12;
    var r = Math.sqrt(-2 * Math.log(u));
    var ang = Math.PI * 2 * Math.random();
    gaussSpare = r * Math.sin(ang);
    return r * Math.cos(ang);
  }

  function fireGun(a, world) {
    if (!a.alive || a.gunAmmo <= 0) return;
    var w = WEAPONS[a.gun];
    var rps = w.rpm / 60;
    if (a.gunTimer > 0) return;          // 由射速节流
    a.gunTimer = 1 / rps;
    var n = Math.max(1, Math.round(rps * 0.033));
    if (n > a.gunAmmo) n = a.gunAmmo;
    a.gunAmmo -= n;

    /* 子弹寿命由**射程**算出，而不是写死 2.2 秒。

       以前两者是脱节的：数据里写着 range 1600 / highRange 2600，
       但子弹固定飞 2.2 秒，实际射程完全由 speed × 2.2 决定（约 2400 米）。
       于是 CEL-3「18 公里以上有效射程翻倍」这条设定从未生效，
       连它的基础射程 1600 也是假的 —— 那两个字段只有一个用处：
       让 AI 判断该在多远开火。

       现在 life = 射程 / 初速，并且 18 公里以上改用 highRange：
       高空空气稀薄、弹道平直，同样的弹药确实能打得更远。 */
    var gunRange = (a.pos.y > 18000 && w.highRange) ? w.highRange : (w.range || 1600);
    var bulletLife = gunRange / Math.max(1, w.speed);

    for (var i = 0; i < n; i++) {
      /* ---- 炮口散布 ----

         垂直于炮口轴的两个方向**各取一个独立的高斯样本**，
         标准差就是 w.spread（弧度）。合起来是一个圆形的角散布锥。

         以前是每轴取一个均匀随机数再归一化：那样"最外圈"和"正中心"
         的弹一样密，靶纸上是一个空心方块。高斯 → 半径是瑞利分布，
         中心密、边缘稀，才是实弹靶纸的样子。

         为什么做成锥形（散布随距离线性放大）：真枪的散布本来就是
         角度量，而这个形状正好给出想要的平衡 ——
         一千米以内 1σ 只有两三米，机炮还是精确武器；
         到最大射程它长成一片，打不打得中变成概率。
         远距离那一片不靠单发精度，靠**射速**兜住：CEL-3 每秒一百多发，
         即便最大射程上只有三成落靶，每秒仍有四十多发命中。
         数值、算式与"射速兜底"的余量见 docs/systems/weapons.md「机炮散布」。 */
      var dir = M3.norm(M3.add(a.fwd, M3.add(
        M3.mul(a.right, gauss() * w.spread),
        M3.mul(a.up, gauss() * w.spread))));
      var muzzle = M3.add(a.pos, M3.add(M3.mul(a.fwd, 6), M3.mul(a.right, (i % 2) ? 0.7 : -0.7)));
      world.bullets.push({
        kind: 'bullet', team: a.team, alive: true,
        pos: muzzle,
        prev: M3.clone(muzzle),
        vel: M3.add(M3.mul(dir, w.speed), a.vel),
        dmg: w.dmg, life: bulletLife, owner: a
      });
    }

    /* 炮口火光（整轮开火只生成一次，不是每发子弹一次）。
       注意 spawnParticle 的签名是 (list, pos, vel, life, size, ...) ——
       这里原来把 size 写成了 3.2（米），直径六米多，比飞机还大，
       所以整团火直接把机体盖住了。 */
    var mz = M3.add(a.pos, M3.add(M3.mul(a.fwd, 7.5), M3.mul(a.right, 0.9)));
    spawnParticle(world.particles, mz, M3.mul(a.vel, 0.15),
      0.055, 0.55, '#fff2c0', { grow: true });
    spawnParticle(world.particles, mz, M3.V(0, 0, 0),
      0.10, 0.95, '#ffd070', { grow: true });
  }

  function stepBullet(b, dt) {
    if (!b.alive) return;
    // 保留上一帧位置，渲染曳光弹时用它画线段。
    // M3.add 返回新对象，所以这里的引用不会被下一步覆盖。
    b.prev = b.pos;
    b.vel.y -= G * dt;
    b.pos = M3.add(b.pos, M3.mul(b.vel, dt));
    b.life -= dt;
    if (b.life <= 0 || b.pos.y <= 0) b.alive = false;
  }

  /* ============================================================
     粒子
     ============================================================ */
  function spawnParticle(list, pos, vel, life, size, color, opt) {
    opt = opt || {};
    list.push({
      pos: M3.clone(pos),
      vel: M3.clone(vel),
      life: life, life0: life,
      size: size, color: color, alive: true,
      grow: !!opt.grow, alpha: opt.alpha === undefined ? 1 : opt.alpha,
      drag: opt.drag || 0, grav: opt.grav || 0
    });
  }

  function stepParticles(list, dt) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.pos = M3.add(p.pos, M3.mul(p.vel, dt));
      if (p.drag) { var k = Math.exp(-p.drag * dt); p.vel = M3.mul(p.vel, k); }
      if (p.grav) p.vel.y -= p.grav * dt;
    }
  }

  function randUnit() {
    var z = M3.rnd(-1, 1), t = M3.rnd(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
    return M3.V(r * Math.cos(t), z, r * Math.sin(t));
  }

  /** 爆炸：多色粒子 + 黑烟 */
  function explode(list, pos, scale, count) {
    scale = scale || 1;
    count = count || 16;
    var cols = ['#fff6d0', '#ffcf5c', '#ff8b2a', '#e2451c', '#8a2b12'];
    for (var i = 0; i < count; i++) {
      var dir = randUnit();
      var sp = M3.rnd(6, 58) * scale;
      spawnParticle(list, pos, M3.mul(dir, sp),
        M3.rnd(0.28, 0.95) * (0.7 + scale * 0.4),
        M3.rnd(1.6, 5.5) * scale,
        cols[M3.rndInt(0, cols.length - 1)],
        { grow: true, drag: 2.2, grav: 3 });
    }
    for (i = 0; i < Math.max(3, count >> 2); i++) {
      var d2 = randUnit();
      spawnParticle(list, pos, M3.mul(d2, M3.rnd(3, 22) * scale),
        M3.rnd(1.4, 3.4), M3.rnd(3, 9) * scale, '#3a3632',
        { grow: true, drag: 1.1, grav: -0.5 });
    }
  }

  /* ============================================================
     伤害
     ============================================================ */
  function damage(ent, amt, world, source) {
    if (!ent.alive) return false;
    // 附加装甲吊舱（BAD-3 护盾）的全向减伤。只有玩家会带，上限 60%。
    if (ent.armor) amt *= (1 - M3.clamp(ent.armor, 0, 0.6));
    ent.hp -= amt;
    if (ent.hp <= 0) {
      kill(ent, world, false, source);
      return true;
    }
    return false;
  }

  function kill(ent, world, groundImpact, source) {
    if (!ent.alive) return;
    ent.alive = false;
    ent.dead = true;
    var s = ent.kind === 'air' ? (ent.phys.hp > 150 ? 3.2 : 2.2) : 3.5;
    if (world) {
      explode(world.particles, ent.pos, s, ent.phys && ent.phys.hp > 150 ? 26 : 20);
      SFX.boom(ent.phys && ent.phys.hp > 150 ? 1.5 : 1.1);
    }
    if (source && source.kills !== undefined) source.kills++;
  }

  function killGround(ent, world) {
    if (!ent.alive) return;
    ent.alive = false;
    ent.dead = true;
    if (world) {
      var s = (ent.radius || 8) / 6;
      explode(world.particles, ent.pos, s, 22 + (ent.radius | 0));
      SFX.bigHit();
    }
  }

  /* ============================================================
     被动吊舱汇总

     list 是 [{ wid, n }]，n 是该件占用的挂点数（左右各一 = 2）。
     玩家的挂载由 game.js 翻译成这个形状；敌机在 missions.js 里
     直接传 [{ wid, n: 1 }] —— 同一份实现，避免出现
     "玩家挂上有用、NPC 挂上没用"的两套逻辑。

     它不只是数值：silentLock（被动测距）会决定**敌方 RWR 是否看得到你**，
     所以结果必须写回 actor，而不只是留在机库面板上。
     ============================================================ */
  function passiveEffects(list) {
    var e = { lockResist: 0, armor: 0, lockRange: 1, flareBonus: 0, silentLock: false };
    if (!list) return e;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var w = WEAPONS[it.wid];
      if (!w || !w.passive) continue;
      var n = it.n || 1;
      if (w.lockResist) e.lockResist = Math.max(e.lockResist, w.lockResist);
      if (w.armorBonus) e.armor += w.armorBonus * n;
      if (w.lockRangeBonus) e.lockRange += w.lockRangeBonus * n;
      if (w.flareBonus) e.flareBonus += w.flareBonus * n;
      if (w.silentLock) e.silentLock = true;
    }
    e.armor = Math.min(e.armor, 0.55);
    e.lockRange = Math.min(e.lockRange, 1.9);
    return e;
  }

  /* ============================================================
     电子战开机

     这是**唯一**的开机入口：手动扣扳机（game.js 的 launch）、
     电子战协处理器的自主决策、任务脚本里干扰机航线到站，
     全部走这里。以前这段逻辑写在 launch 里，于是任何"绕过扳机"
     的开机方式都得把它抄一遍。

     ewBurnT 在这里定死是刻意的 —— 它描述的不是吊舱，而是**对手**：
     一支信号处理能力强的部队能在 3 秒内完成对抗，差的要 8 秒。
     这就是设定里那句"当你开启干扰吊舱时，对方雷达不会立刻致盲，
     而是会在 3 到 8 秒内完成对抗并重新建立跟踪"。
     ============================================================ */
  function openEcm(actor, wid, threatSkill) {
    var w = WEAPONS[wid];
    if (!w || w.kind !== 'ecm' || w.passive) return false;
    var sk = M3.clamp(threatSkill === undefined ? 0.5 : threatSkill, 0, 1);
    actor.spActive = w.duration || 6;
    actor.ewT = 0;
    actor.ewBurnT = 3 + (1 - sk) * 5;
    actor.ewPower = 0;
    actor.ewWid = wid;
    actor.ewLockReduce = w.lockReduce || 0;
    /* 范围压制（下游的烧穿吊舱）：留下一个场，由 game.js 的
       updateJamming() 每帧结算。没有 jamRadius 的吊舱是"定向"干扰，
       只保护自己。 */
    actor.ewFieldR = w.jamRadius || 0;
    actor.ewFieldK = w.jamK || 0.7;
    return true;
  }

  /* ---------- 目标物（调节单元 / 中继平台 / 地面设施） ---------- */
  function makeTarget(o) {
    return {
      kind: 'target',
      team: o.team === undefined ? 1 : o.team,
      ttype: o.ttype || 'ground',
      label: o.label || '目标',
      model: o.model,
      alive: true,
      dead: false,
      pos: M3.V(o.x || 0, o.y || 0, o.z || 0),
      fwd: M3.norm(o.fwd || M3.V(0, 0, 1)),
      up: M3.V(0, 1, 0),
      right: M3.V(1, 0, 0),
      speed: o.speed || 0,
      vel: M3.V(0, 0, 0),
      hp: o.hp || 100,
      maxHp: o.hp || 100,
      radius: o.radius || 10,
      ground: !!o.ground,
      big: !!o.big,
      drift: o.drift || 0,
      fireCd: o.fireCd === undefined ? 6 : o.fireCd,
      weapon: o.weapon || null,
      value: o.value || 100,
      drifting: 0
    };
  }

  function stepTarget(t, dt, world) {
    if (!t.alive) return;
    if (t.drift) {
      t.drifting += dt;
      t.pos.x += Math.cos(t.drifting * 0.02) * t.drift * dt;
      t.pos.z += Math.sin(t.drifting * 0.017) * t.drift * 0.6 * dt;
      t.vel = M3.V(Math.cos(t.drifting * 0.02) * t.drift, 0, Math.sin(t.drifting * 0.017) * t.drift * 0.6);
    }
    // 缓慢下沉（被打坏的浮空平台）
    if (t.ttype === 'air' && t.hp < t.maxHp * 0.5) {
      t.pos.y -= (1 - t.hp / t.maxHp) * 1.6 * dt;
    }
  }

  return {
    airDensity: airDensity, qOf: qOf, ctrlFactor: ctrlFactor, turnFactor: turnFactor,
    makeAircraft: makeAircraft, stepAircraft: stepAircraft,
    makeMissile: makeMissile, stepMissile: stepMissile, effectiveLife: effectiveLife,
    breakLock: breakLock, openEcm: openEcm, passiveEffects: passiveEffects,
    fireGun: fireGun, stepBullet: stepBullet, SLOT_EMPTY: SLOT_EMPTY,
    spawnParticle: spawnParticle, stepParticles: stepParticles, explode: explode,
    damage: damage, kill: kill, killGround: killGround, explode2: explode,
    detonate: detonate,
    makeTarget: makeTarget, stepTarget: stepTarget,
    randUnit: randUnit
  };
})();
