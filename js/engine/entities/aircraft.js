(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.makeAircraft = makeAircraft; $.curLoadFactor = curLoadFactor; $.stepAircraft = stepAircraft; $.nozzlesOf = nozzlesOf;

  /* ============================================================
     飞机
     ============================================================ */
  function makeAircraft(o) {
    var ac = null, i;
    for (i = 0; i < AIRCRAFT.length; i++) if (AIRCRAFT[i].id === o.type) ac = AIRCRAFT[i];
    if (!ac) ac = AIRCRAFT[0];

    /* 挂载武器：优先用调用方指定的，没指定就翻逐组配置，再没有就退回该机型
       默认配置里的第一种（AI 走前两条路）。注意不能再用 ac.defSpecial ——
       挂载系统改造后那个字段已经不存在了，早先这里会读到 undefined 然后崩掉。 */
    var spWid = o.special || null;
    if (!spWid && o.loadout) {
      for (var lk in o.loadout) {
        if (o.loadout[lk]) { spWid = o.loadout[lk]; break; }
      }
    }
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
      tags: ac.tags,               // 机制标签（unmanned …），见 js/core/tags.js

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
      gunResist: ac.gunResist || 0,

      ctrl: { pitch: 0, roll: 0, yaw: 0 },

      gun: ac.gun,
      /* 没有机炮的机型（预警机、重型轰炸机）`ac.gun` 是 null。
         这里以前直接写 WEAPONS[ac.gun].ammo，于是那一型一造出来就抛异常 ——
         而"预警机没有任何武器"是设定里写明的事，数据迟早要对齐。 */
      gunAmmo: (ac.gun && WEAPONS[ac.gun]) ? WEAPONS[ac.gun].ammo : 0,
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
      /* 机体自带的电子对抗（AIRCRAFT[].stats.ecm，0–1）。吊舱的 ecmBonus
         由 setEcm() 叠加上来。它削弱**瞄准自己的导弹**的提前量预测，
         见 updateMissile 里的 ECM_LEAD_K。 */
      ecmBody: ac.stats.ecm || 0,
      ecm: ac.stats.ecm || 0,
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
      group: o.group || null,

      /* 任务写定的被动吊舱（spawnEnemy 的 o.pods）。
         它既是机制（Ent.passiveEffects 汇总），也是外观 ——
         mountPlan 会把它铺到某个挂得住的挂点组上。 */
      pods: o.pods || null,

      /* 任务写死的**逐组**挂载（spawnEnemy 的 o.loadout），形状与玩家的
         机库配置一样：{ 组id: 武器id }。玩家那份由 startMission 覆盖。 */
      loadout: o.loadout || (!o.special && !o.isPlayer && ac.npcOnly && ac.defaultLoadout
        ? Object.assign({}, ac.defaultLoadout) : null)
    };
    a.right = M3.cross(a.up, a.fwd);
    /* NPC 的弹药池与发射槽。玩家那套由 startMission 按机库配置另建
       （那里要按 perPoint 算，和这里的口径不同）。 */
    if (!a.isPlayer) $.buildNpcMounts(a);
    // 炮塔（目前只有 ROK-40 的尾炮）
    if (ac.mounts && typeof Turret !== 'undefined') a.turrets = Turret.make(ac.mounts);
    return a;
  }

  /* 空挂架的冷却值。

     储备弹数少于挂架数时，打出去之后那几个槽不该再"装填完成" ——
     因为仓库里确实没有弹了。让它们停在冷却状态是最省事的做法，
     但那样 HUD 会一直显示"装填中"，等于说谎。

     所以用一个永远减不到 0 的值，语义是"这个挂架本来就空着"。 */
  $.SLOT_EMPTY = 1e9;

  /* ============================================================
     飞机每帧更新
     ============================================================ */
  var STALL_SINK_MAX = 140;

  // 失速下沉速度上限（m/s）

  /** 当前挂载拖累。有 loadModel（玩家）时随弹药池折算：
      每发弹的拖累 = 该类弹总拖累 / 弹药上限；吊舱等不消耗的部分恒定。 */
  function curLoadFactor(a) {
    var m = a.loadModel;
    if (!m || !m.total || !a.ammoPool) return a.loadFactor || 0;
    var mass = m.fixed;
    for (var i = 0; i < m.rounds.length; i++) {
      var r = m.rounds[i];
      var left = Math.max(0, Math.min(r.cap, a.ammoPool[r.wid] || 0));
      mass += r.mass * left / r.cap;
    }
    return m.k0 * mass / m.total;
  }

  function stepAircraft(a, dt, world) {
    if (a.gunFlashT > 0) a.gunFlashT -= dt;     // 炮口火光的余辉，见 flashRings
    if (!a.alive) return;
    var p = a.phys;

    // 挂载越重越笨拙：加速、转向、滚转都吃一点亏。
    // loadFactor：玩家按机库配置设定（game.js），NPC 由 buildNpcMounts 按实体挂载算。
    /* 必须放在函数开头：下面的失速判定、姿态旋转、目标速度全都读 p。
       以前这一段在姿态旋转之后，于是 pitch / roll 惩罚从未生效，
       失速判定也用的是未打折的 vStall。 */
    var lf = curLoadFactor(a);
    if (lf) {
      // 系数来自 loadoutPenalty() —— 和机库面板显示的是同一份，
      // 免得界面上的数字与实际手感对不上
      /* 注意：这里是**整体替换** p，所以每个用到的字段都得列上。
         之前漏了 accel / decel，还写了个根本不存在的 acc ——
         于是下面 `p.accel` 取到 undefined，加减速彻底失去节流，
         推油门的速度变化变成瞬时的。yaw 不受挂载影响，原样带过。 */
      var lp = loadoutPenalty(lf);
      p = {
        vMax: p.vMax * lp.vMax,
        vMil: p.vMil * lp.vMil,
        vStall: p.vStall * lp.vStall,
        accel: p.accel * lp.accel,
        decel: p.decel * lp.decel,
        pitch: p.pitch * lp.pitch,
        roll: p.roll * lp.roll,
        yaw: p.yaw
      };
    }

    // ---- 动压 ----
    var q = $.qOf(a.pos.y, a.speed);
    a.q = q / 1000;                        // kPa，供 HUD 显示

    var ctrl = $.ctrlFactor(a.pos.y, a.speed, a.ac);
    a.stall = a.speed < p.vStall;
    if (a.stall) ctrl *= 0.34;
    /* 存下来给两处读：AI.steerTo 按它估计每根轴此刻能转多快，
       HUD 的 P/R/Y 舵量表用它画"可用权限"底色。下一帧才被读到，差一帧无所谓。 */
    a.ctrlAuth = ctrl;

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
    /* 滚转带一点惯性：滚转角速度向目标值指数逼近（时间常数 0.14 s），
       推杆后要一瞬才滚到满速，松杆后也要一瞬才停住。
       以前输入多少当帧就转多少，手感发飘。 */
    var rTarget = rIn * dRoll / Math.max(dt, 1e-6);
    a.rollRate = (a.rollRate || 0) + (rTarget - (a.rollRate || 0)) * Math.min(1, dt / 0.14);
    if (Math.abs(a.rollRate) > 1e-4) {          // 右滚为正 → 绕 fwd 转负角
      var ang2 = -a.rollRate * dt;
      a.right = M3.rotAxis(a.right, a.fwd, ang2);
      a.up = M3.rotAxis(a.up, a.fwd, ang2);
    }
    if (yIn) {
      var ang3 = dYaw * yIn;
      a.fwd = M3.rotAxis(a.fwd, a.up, ang3);
      a.right = M3.rotAxis(a.right, a.up, ang3);
    }

    /* 失速低头力矩。以前是 0.55 —— 最深失速也只有十几度每秒，
       飞控一顶就顶住了，机头能一直竖着。现在加大一倍，
       深失速时玩家和飞控都压不住，机头自然往下掉。 */
    if (a.stall && a.pos.y > 60) {
      var st = (p.vStall - a.speed) / p.vStall;
      var angS = 1.2 * st * dt;
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

    /* 高空推力衰减：跟着密度走，而不是另起一条直线。
       以 11 km 为基准归一化，保证在对流层顶连续；0.75 次幂是
       涡扇推力随密度衰减的常见近似。20 km ≈ 0.35，最低保底 0.20。 */
    if (a.pos.y > 11000) {
      var k = M3.clamp(Math.pow($.airDensity(a.pos.y) / $.RHO_TROPO, 0.75), 0.20, 1);
      vTarget = M3.lerp(p.vStall * 0.55, vTarget, k);
    }

    // 可变后掠翼：低速展开（改善低速盘旋），高速后掠（减小波阻）
    if (a.ac && a.ac.variableSweep) {
      a.sweep = M3.clamp((a.speed - 170) / 250, 0, 1);
    }

    if (a.brake) vTarget = Math.min(vTarget, p.vStall * 0.92);

    /* 推力 / 阻力平衡。

       以前是"以恒定加速度逼近 vTarget"—— 那样任何额外的减速项
       （重力、转弯）都会被满额加速度吃掉，平衡点永远停在 vTarget。
       现在剩余推力在接近 vTarget 时才渐弱（最后约三成速度区间），
       于是爬升和急转会把平衡速度真的压下去，而低速段的加速手感不变。 */
    var r2 = (a.speed * a.speed) / Math.max(1, vTarget * vTarget);
    var acc;
    if (r2 < 1) acc = p.accel * Math.min(1, $.THRUST_TAPER * (1 - r2));
    else acc = -p.decel * Math.min(1, (r2 - 1) * 4);
    if (a.brake && a.speed > vTarget) acc = -p.decel * 1.8;

    // 重力沿航迹的分量：爬升掉速、俯冲增速
    acc -= $.G * a.fwd.y;

    /* 转弯掉速（诱导阻力）：实际角速度 × 速度 × 舵效。
       舵效乘进来，是因为高动压下拉出来的过载最大、阻力也最大；
       动压掉光以后转不动，也就不怎么掉速了 —— 角点速度由此而来。 */
    var wTurn = (Math.abs(dPitch * pIn) + Math.abs(dYaw * yIn)) / Math.max(1e-5, dt);
    acc -= $.TURN_BLEED * wTurn * a.speed * ctrl;

    a.speed = M3.clamp(a.speed + acc * dt, p.vStall * 0.42, p.vMax * 1.12);

    // ---- 位置 ----
    var vPrev = a.vel || M3.mul(a.fwd, a.speed);
    /* 失速下沉：速度不再永远沿着机头。

       以前 vel = fwd × speed，而 speed 有 0.42 vStall 的下限 ——
       机头朝上失速时重力只能把速度吃到下限，飞机就以四十多 m/s
       一直"爬"上去。现在失速时升力 ∝ (v / vStall)² 托不住的那部分
       重力累积成一个独立的竖直下沉速度：先悬停、再往下掉。
       改出失速后下沉速度在一秒左右并回航迹。 */
    if (a.stall && a.pos.y > 2) {
      var vr = a.speed / p.vStall;
      a.sink = Math.min(STALL_SINK_MAX, (a.sink || 0) + $.G * (1 - vr * vr) * dt);
    } else if (a.sink) {
      a.sink *= Math.exp(-dt / 0.9);
      if (a.sink < 0.05) a.sink = 0;
    }
    a.vel = M3.mul(a.fwd, a.speed);
    if (a.sink) a.vel.y -= a.sink;

    /* 载荷因数（G 表）：加速度加上 1G 抵消重力，投到机体 up 轴。
       平飞 1G，推杆为负。做一点平滑，免得逐帧抖动。 */
    if (dt > 1e-4) {
      var acv = M3.mul(M3.sub(a.vel, vPrev), 1 / dt);
      var nRaw = (M3.dot(acv, a.up) + $.G * a.up.y) / $.G;
      if (a.gNow === undefined) a.gNow = 1;
      a.gNow += (nRaw - a.gNow) * Math.min(1, dt / 0.15);
    }
    a.pos = M3.add(a.pos, M3.mul(a.vel, dt));

    // ---- 天花板 / 地形 ----
    if (a.pos.y > 23000) {
      a.pos.y = 23000 + (a.pos.y - 23000) * 0.2;
      a.fwd = M3.norm(M3.V(a.fwd.x, Math.min(a.fwd.y, -0.02), a.fwd.z));
      B = M3.orthonormalize(a.fwd, M3.V(0, 1, 0));
      a.fwd = B.fwd; a.up = B.up; a.right = B.right;
    }
    var aGy = $.groundY(a.pos.x, a.pos.z);
    if (a.pos.y <= aGy + 2) {
      a.pos.y = aGy + 2;
      $.kill(a, world, true);
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
        if (slots[si] >= $.SLOT_EMPTY) continue;      // 空挂架，永不装填
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
      var ewSlide = a.ewWave
        ? 1 - (1 - a.ewWave.to) * Math.min(1, a.ewT / a.ewWave.dur)
        : (a.ewT < ewBurn ? 1 : Math.max(0, 1 - (a.ewT - ewBurn) / 1.1));
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

    // ---- 拖烟（受损） ----
    if (a.hp < a.maxHp * 0.45 && world) {
      a.smokeTimer -= dt;
      if (a.smokeTimer <= 0) {
        a.smokeTimer = 0.045;
        var dmgK = 1 - a.hp / a.maxHp;
        $.spawnParticle(world.particles,
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
        var nzl = nozzlesOf(a.model);
        var nzz;
        if (nzl.length) {
          a.abIdx = ((a.abIdx || 0) + 1) % nzl.length;
          var nz = nzl[a.abIdx];
          nzz = M3.add(a.pos, M3.add(M3.mul(a.right, nz[0]),
            M3.add(M3.mul(a.up, nz[1]), M3.mul(a.fwd, nz[2] - 0.6))));
        } else {
          nzz = M3.add(a.pos, M3.mul(a.fwd, -10));
        }
        $.spawnParticle(world.particles, nzz, M3.mul(a.vel, 0.02),
          M3.rnd(0.10, 0.22), M3.rnd(1.1, 2.0), '#ffb14a', { grow: true, drag: 2.5 });
      }
    }
  }

  /* 模型上的喷口位置（机体坐标 [x, y, z]），按模型缓存。

     加力尾焰以前一律从"机身中心往后 10 米"喷出 —— G-6 的发动机吊在
     两侧机翼下，火却从机尾中线冒出来。现在直接从模型里找：
     喷口色（C.nozzle）的面按共用顶点分组，每组取横向中心与最靠后的 z。 */
  var NOZZLE_CACHE = {};

  var NOZZLE_HEX = '#333a42';

  function nozzlesOf(mk) {
    if (NOZZLE_CACHE[mk]) return NOZZLE_CACHE[mk];
    var m = (typeof MODELS !== 'undefined') ? MODELS[mk] : null, out = [];
    if (m) {
      var groups = [];
      for (var fi = 0; fi < m.f.length; fi++) {
        var f = m.f[fi];
        if (f.c !== NOZZLE_HEX) continue;
        var hit = null;
        for (var gi = 0; gi < groups.length && !hit; gi++) {
          for (var k = 0; k < f.i.length; k++) if (groups[gi].vs[f.i[k]]) { hit = groups[gi]; break; }
        }
        if (!hit) { hit = { vs: {} }; groups.push(hit); }
        for (k = 0; k < f.i.length; k++) hit.vs[f.i[k]] = true;
      }
      for (gi = 0; gi < groups.length; gi++) {
        var sx = 0, sy = 0, n = 0, mz = 1e9;
        for (var vi in groups[gi].vs) {
          var v = m.v[vi]; sx += v[0]; sy += v[1]; n++;
          if (v[2] < mz) mz = v[2];
        }
        if (n) out.push([sx / n, sy / n, mz]);
      }
    }
    return (NOZZLE_CACHE[mk] = out);
  }
})(Ent);
