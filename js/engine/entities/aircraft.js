(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.makeAircraft = makeAircraft; $.curLoadFactor = curLoadFactor; $.stepAircraft = stepAircraft; $.effectivePhys = effectivePhys; $.stepAircraftTail = stepAircraftTail; $.nozzlesOf = nozzlesOf; $.exhaustPlumes = exhaustPlumes; $.hasAfterburner = hasAfterburner; $.vTargetAt = vTargetAt;

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
      hitR: ac.hitR,               // 命中半径（米），缺省用 Combat.HIT_R_AIR（7.5）；重型轰炸机更大
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
      spAmmo: 0,          // 真实发数由挂载决定：玩家 Loadout.apply、NPC Ent.buildNpcMounts（都是 点数 × perPoint）
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

  /* 本机此刻的有效性能参数（stepAircraft 与 stepPSM 共用）：
     ① phys 按挂载重量打折（没有挂载拖累时乘子为 1）；
     ② vStall 再乘 √(ρ₀/ρ(高度))：失速的是动压（见 physics.js「失速速度随动压变化」），vStall0 保留不含高度的值。
     每个实体复用一个临时对象 a._pe，原位覆写，不在每帧分配。 */
  function effectivePhys(a) {
    var ph = a.phys;
    var p = a._pe || (a._pe = {});
    // 挂载越重越笨拙：加速、转向、滚转都吃一点亏。
    // loadFactor：玩家按机库配置设定（game.js），NPC 由 buildNpcMounts 按实体挂载算。
    /* 系数来自 loadoutPenalty() —— 和机库面板显示的是同一份，
       免得界面上的数字与实际手感对不上。
       每个用到的字段都得列上（漏字段会变 undefined：之前漏过 accel / decel，
       推油门的速度变化变成瞬时的）。yaw 不受挂载影响，原样带过。 */
    var lf = curLoadFactor(a);
    if (lf) {
      var lp = loadoutPenalty(lf);
      p.vMax = ph.vMax * lp.vMax; p.vMil = ph.vMil * lp.vMil;
      p.vStall0 = ph.vStall * lp.vStall;
      p.accel = ph.accel * lp.accel; p.decel = ph.decel * lp.decel;
      p.pitch = ph.pitch * lp.pitch; p.roll = ph.roll * lp.roll;
    } else {
      p.vMax = ph.vMax; p.vMil = ph.vMil; p.vStall0 = ph.vStall;
      p.accel = ph.accel; p.decel = ph.decel; p.pitch = ph.pitch; p.roll = ph.roll;
    }
    p.yaw = ph.yaw; p.hp = ph.hp;
    p.vStall = p.vStall0 * $.stallK(a.pos.y);
    return p;
  }

  function stepAircraft(a, dt, world) {
    if (a.gunFlashT > 0) a.gunFlashT -= dt;     // 炮口火光的余辉，见 flashRings
    if (!a.alive) return;
    /* 没有加力的机型（vMax == vMil，见 hasAfterburner）不允许处于加力状态：玩家油门、AI 决策、
       弹射起飞、任务脚本各自在源头也卡了一道，这里是兜底，放在甲板 / 过失速 / 垂直起降三个分支之前。 */
    if (a.ab && !hasAfterburner(a)) a.ab = false;
    if (a.deck) return $.stepDeck(a, dt, world);        // 甲板起飞：独立分支，见 deck.js
    if (a.psm) return $.stepPSM(a, dt, world);          // 过失速机动：独立分支，见 psm.js
    if (a.vtolOn) return $.stepVtol(a, dt, world);      // 垂直起降低速区：独立分支，见 vtol.js
    var p = effectivePhys(a);

    // ---- 动压 ----
    var q = $.qOf(a.pos.y, a.speed);
    a.q = q / 1000;                        // kPa，供 HUD 显示

    var ctrl = $.ctrlFactor(a.pos.y, a.speed, a.ac);
    /* 垂直起降机型没有失速：速度掉到 vStall × transK 以下就由 vtol.js 接管（喷口补升力），主路径里不置失速标志 */
    a.stall = a.speed < p.vStall && !(a.ac && a.ac.vtol);
    if (a.stall) ctrl *= 0.34;
    /* 过失速机动刚结束：舵效从 0.34 倍（与失速同量级）在 PSM_RECOVER_S 内爬回满，
       免得出口突然满舵。没做过 PSM 的飞机这个字段不存在，零开销。 */
    if (a.psmRecover > 0) {
      ctrl *= 1 - 0.66 * Math.min(1, a.psmRecover / $.PSM_RECOVER_S);
      a.psmRecover -= dt;
    }
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
    /* 高空包线：军推 / 加力的目标速度乘 thrustK(y)，到有效升限处刚好是 1.1·vStall(y)，
       见 physics.js「失速速度随动压变化」。怠速目标仍锚在当前高度的失速速度上。 */
    var vTarget = (a.ac && a.ac.vtol)
      ? $.vtolSpeedTarget(a, p, a.throttle)       // 垂直起降机型：推力 = 期望前进速度，0% 静止悬浮、50% = vStall（见 vtol.js）
      : vTargetAt(a, p, a.pos.y, th, a.ab);

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
      $.kill(a, world, true);   // 击杀者由 kill 取 lastHitBy（不传 source：不给对方加战果）
      return;
    }

    if (a.ac && a.ac.vtol) $.vtolWatch(a, p);    // 垂直起降机型：速度掉到 vStall × transK 以下，下一帧起转入 vtol.js
    stepAircraftTail(a, dt, world);
  }

  /* 每帧更新的尾部：冷却 / 装填、认知电子战结算、枪热、受伤拖烟、加力尾焰。
     与"怎么飞"无关，所以从 stepAircraft 里分出来 —— 过失速机动（psm.js）
     不走主路径的姿态 / 速度段，但这些照样要继续算。 */
  function stepAircraftTail(a, dt, world) {
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

    /* ---- 加力尾焰：只维护"强度" abFx（0..1），火焰本身每帧在渲染时画（exhaustPlumes） ----
       以前这里每 0.028 s 吐一个橙色圆粒子，圆点之间隔着几米，看起来是"隔一会吐一个火球"，
       还要消耗模拟的随机数。现在点火时火焰很快涨满、关火时很快收掉（点火 ~0.1 s、熄火 ~0.2 s），
       没有随机数、不进 world.particles。 */
    var abT = (a.ab && hasAfterburner(a)) ? 1 : 0, abF = a.abFx || 0;
    a.abFx = abF + (abT - abF) * Math.min(1, dt * (abT ? 12 : 7));
    if (a.abFx < 0.004 && !abT) a.abFx = 0;
  }

  /* 高度 y、油门 th（0..1）下的目标速度（真空速）。stepAircraft 和 AI 的航线能量保护（ai/energy.js 的
     routeAltMax / routeClimbCap）共用这一个公式：军推 / 加力的目标速度乘 thrustK(y)，怠速目标锚在 y 处的失速速度上。
     p 是 effectivePhys(a)（要有 vStall0 / vMil / vMax）。 */
  function vTargetAt(a, p, y, th, ab) {
    return M3.lerp(p.vStall0 * $.stallK(y) * 0.74, (ab ? p.vMax : p.vMil) * $.thrustK(a, y), th);
  }

  /* 有没有加力：机型数据里 vMax（加力上限）高于 vMil（军推）。**vMax == vMil 就是没有加力** ——
     运输机、预警机、巡逻机、廉价无人机……只有一个事实来源，不另设标志：图鉴 / 机库显示的最高速、
     AI 估算的逃逸速度、速度夹紧用的 vMax 也就都是真实能飞到的速度。
     x 可以是飞机实体、AIRCRAFT 表里的条目，或一个 phys 对象。 */
  function hasAfterburner(x) {
    var p = x && ((x.ac && x.ac.phys) || x.phys || x);
    return !!p && p.vMax > p.vMil + 0.5;
  }

  /* 第 i 个喷口的尾焰大小系数（机型数据 exhaust.size）：
       不写            全部 1（以前的样子）
       数字            全部喷口统一
       数组            按 nozzlesOf(model) 的顺序（= 模型里喷口件的书写顺序），缺的补 1
     系数同时乘尾焰的粗细和长度（寿命）；0 = 这个喷口不喷火。
     单发四喷口的垂直起降机（海马）总推力只有一台发动机，每个喷口不该各喷一整团火。 */
  function exhaustSize(a, i) {
    var e = a.ac && a.ac.exhaust, s = e && e.size;
    if (s === undefined || s === null) return 1;
    if (typeof s === 'number') return s;
    var v = s[i];
    return (typeof v === 'number') ? v : 1;
  }

  /* ============================================================
     加力羽流（纯演出，每帧由 frame.js 生成一份临时粒子列表，不进 world.particles）

     以前是每 0.028 s 吐一个圆粒子，像"隔一会吐一个火球"。现在每个喷口一道连续、刚性贴在
     喷口后面的羽流，随飞机一起动：

       · 尺度跟喷口走：基础半径 = 模型里量出的喷口出口半径 × exhaust.size，长度、
         激波间距都按喷口直径 D 的倍数（激波单元长度 ∝ D·√(M²−1)，已查到来源）。
       · 渐细渐暗：发光区越往后越细、越暗、越冷 —— 五层光带，最粗的最短、最细的最长，
         每层尾端渐隐，颜色由白热 → 黄 → 橙 → 暗红。（真实喷流气体本身是越混越宽的，
         渐细的是发光区，所以这里是亮度与发光半径衰减，不是几何圆锥。）
       · 激波菱形：沿轴一串小亮点，越往下游越小、越密、越暗（检索到的资料：激波单元
         往下游变短变弱，因为剪切层变厚吸收了波）。

     下面几个常数没有可靠的现实数据，按参考图和这个游戏的机体尺寸定，可调：
       PLUME_LEN_D  满加力时发光火焰长度 ≈ 多少个喷口直径
       SHOCK_CELL_D 第一个激波单元 ≈ 多少个喷口直径（√(M²−1) 的缩放有来源，系数是假设）
     全部确定性：闪烁用 world.time 的正弦，不用 Math.random。
     ============================================================ */
  var PLUME_LEN_D = 9, SHOCK_CELL_D = 1.2, SHOCK_DECAY = 0.88, SHOCK_N = 5;
  var PLUME_FAR = 25000, PLUME_MID = 7000;      // 距相机超过 FAR 不画；超过 MID 只画简版（无激波菱形）

  /* 羽流配色（机型数据 exhaust.color：预设名，或一个只写想改的那几项的对象，可带 base: 预设名）。
     现实里：蓝色是 CH / C₂ 自由基的化学发光（很淡），橙色是被加热的碳烟颗粒（亮得多，有烟就盖过蓝色）；
     烟的多少取决于燃油与空气的混合程度，即发动机 / 燃烧室设计，不取决于国籍，也不是温度计；
     那些很蓝的照片大多是黄昏或夜里拍的。所以默认是有烟的橙色，蓝色 / 蓝紫给"燃烧得很干净"的机型。
       core 白热核心   hot 靠近喷口最亮的一层   mid / warm / cool 越往后越冷   halo 喷口光晕   diamond 激波菱形
     颜色必须是 #rrggbb（WebGL 粒子只认这个格式），不合法的项退回默认。 */
  var PLUME_PALETTES = {
    amber:  { core: '#fff6e0', hot: '#ffd48a', mid: '#ffb347', warm: '#ff8a2a', cool: '#ff5a1a', halo: '#ffa24a', diamond: '#d6e6ff' },
    // 烟更多的发动机（设定里"更旧一代"的）：更红、更暗，激波菱形也被烟染成暖色
    smoky:  { core: '#ffe9b8', hot: '#ffc468', mid: '#ff9a3a', warm: '#ec6a22', cool: '#b8401a', halo: '#ff8c3c', diamond: '#ffe0c0' },
    blue:   { core: '#f4f8ff', hot: '#d4e4ff', mid: '#93b6ff', warm: '#6489ff', cool: '#3d55d8', halo: '#80a2ff', diamond: '#ffffff' },
    violet: { core: '#fff2f6', hot: '#f3d8ff', mid: '#c99dff', warm: '#9b6cff', cool: '#6b47d9', halo: '#b88cff', diamond: '#ffe8f4' }
  };
  var HEX6 = /^#[0-9a-fA-F]{6}$/;

  function plumePalette(a) {
    var ac = a.ac;
    if (!ac) return PLUME_PALETTES.amber;
    if (ac.__plumePal) return ac.__plumePal;
    var spec = ac.exhaust && ac.exhaust.color, base = PLUME_PALETTES.amber;
    if (typeof spec === 'string') base = PLUME_PALETTES[spec] || base;
    var pal = {}, k;
    for (k in PLUME_PALETTES.amber) pal[k] = base[k];
    if (spec && typeof spec === 'object') {
      if (spec.base && PLUME_PALETTES[spec.base]) for (k in pal) pal[k] = PLUME_PALETTES[spec.base][k];
      for (k in pal) if (typeof spec[k] === 'string' && HEX6.test(spec[k])) pal[k] = spec[k];
    }
    return (ac.__plumePal = pal);
  }

  /* 一条光带：喷口为头，沿 -fwd 往后拉 len 米，尾端渐隐。渲染器里线宽 ≈ 0.9 × size，所以 size = 宽度 / 0.9 */
  function plumeStreak(out, P, fwd, width, len, color, alpha, head) {
    out.push({ pos: P, vel: fwd, tail: len, head: !!head, size: width / 0.9, color: color,
      alive: true, life: 1, life0: 1, alpha: Math.min(1, alpha) });
  }
  function plumeDisc(out, P, size, color, alpha) {
    out.push({ pos: P, size: size, color: color, alive: true, life: 1, life0: 1, alpha: Math.min(1, alpha) });
  }

  function exhaustPlumes(world, camPos) {
    var out = [], acts = world.actors, t = world.time || 0;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a.alive || !(a.abFx > 0.02)) continue;
      var dist = camPos ? M3.dist(a.pos, camPos) : 0;
      if (dist > PLUME_FAR) continue;
      var near = dist < PLUME_MID, k = a.abFx, nzl = nozzlesOf(a.model), pal = plumePalette(a);
      for (var ni = 0; ni < Math.max(1, nzl.length); ni++) {
        var es = exhaustSize(a, ni);
        if (es <= 0) continue;                                   // 0 = 这个喷口不喷火
        var nz = nzl[ni] || [0, 0, -10, 0.4];                    // 模型里找不到喷口：机身中线往后 10 米
        var r0 = (nz[3] || 0.4) * es, D = 2 * r0;                // 出口半径 × 系数；D = 喷口直径
        var ph = i * 2.3 + ni * 1.7;                             // 每个喷口自己的闪烁相位
        var flick = 1 + 0.06 * Math.sin(t * 46 + ph) + 0.04 * Math.sin(t * 79 + ph * 1.9);
        var L = PLUME_LEN_D * D * k * flick;
        var al = k * (0.9 + 0.1 * Math.sin(t * 61 + ph * 2.3));
        var P = M3.add(a.pos, M3.add(M3.mul(a.right, nz[0]),
          M3.add(M3.mul(a.up, nz[1]), M3.mul(a.fwd, nz[2]))));   // 喷口出口平面中心

        // 光带：由粗短到细长，颜色由白热变冷；每层尾端渐隐，叠起来就是渐细渐暗的火焰
        if (near) plumeStreak(out, P, a.fwd, D * 1.00, L * 0.28, pal.hot, 0.50 * al);
        if (near) plumeStreak(out, P, a.fwd, D * 0.78, L * 0.50, pal.mid, 0.45 * al);
        plumeStreak(out, P, a.fwd, D * 0.55, L * 0.75, pal.warm, 0.40 * al);
        plumeStreak(out, P, a.fwd, D * 0.34, L * 1.00, pal.cool, 0.35 * al);
        plumeStreak(out, P, a.fwd, D * 0.22, L * 0.45, pal.core, 0.90 * al, true);
        // 喷口出口的光晕与白热点
        plumeDisc(out, M3.add(P, M3.mul(a.fwd, -0.1 * D)), r0 * 1.6, pal.halo, 0.40 * al);
        plumeDisc(out, P, r0 * 0.7, pal.core, 0.80 * al);

        // 激波菱形：沿轴一串小亮点，越往下游越小、越密、越暗
        if (near) {
          var s = 0, cell = D * SHOCK_CELL_D;
          for (var j = 0; j < SHOCK_N; j++) {
            var sj = s + 0.5 * cell;                              // 亮点在单元中部
            if (sj > 0.85 * L) break;
            var pulse = 0.8 + 0.2 * Math.sin(t * 37 + ph + j * 2);
            plumeDisc(out, M3.add(P, M3.mul(a.fwd, -sj)), r0 * 0.40 * Math.pow(SHOCK_DECAY, j),
              pal.diamond, 0.85 * Math.pow(0.8, j) * pulse * k);
            s += cell; cell *= SHOCK_DECAY;
          }
        }
      }
    }
    return out;
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
        if (!n) continue;
        // 出口半径：最靠后那一圈顶点到中心的最大距离（羽流的基础粗细、长度、激波间距都以它为尺度）
        var cx = sx / n, cy = sy / n, rr = 0;
        for (vi in groups[gi].vs) {
          v = m.v[vi];
          if (v[2] <= mz + 1e-4) rr = Math.max(rr, Math.sqrt((v[0] - cx) * (v[0] - cx) + (v[1] - cy) * (v[1] - cy)));
        }
        out.push([cx, cy, mz, rr || 0.4]);
      }
    }
    return (NOZZLE_CACHE[mk] = out);
  }
})(Ent);
