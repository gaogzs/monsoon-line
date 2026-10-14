/* ============================================================
   entities.js —— 飞行模型 / 武器 / 粒子
   本作物理的两个支点：
     · 动压 q = ½ρv²  决定操纵面权限，也决定导弹的可用过载
     · 20 km 高度 ρ=0.088 kg/m³（海平面的 7.2%）
   ============================================================ */
'use strict';

var Ent = (function () {

  var G = 9.80665, RHO0 = 1.225;

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
  function ctrlFactor(y, speed) {
    var k = qOf(y, speed) / 22000;
    return M3.clamp(k, 0.13, 1.0);
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
      spCharges: 0,       // DEW 充能数（构造末尾按武器初始化）
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

    var ctrl = ctrlFactor(a.pos.y, a.speed);
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
    if (a.spActive > 0) a.spActive -= dt;
    if (a.flareCd > 0) a.flareCd -= dt;
    if (a.gunHeat > 0) a.gunHeat -= dt;
    if (a.gunTimer > 0) a.gunTimer -= dt;

    // DEW 充能恢复
    var w = WEAPONS[a.special];
    if (w && w.kind === 'dew' && a.spCharges < w.charges && a.spCd <= 0) {
      a.spCharges++;
      a.spCd = w.cd;
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
      vel: M3.V(0, 0, 0),
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

  function stepMissile(m, dt, world) {
    if (!m.alive) return;
    var w = m.w;
    m.age += dt;
    if (m.age > m.life) { killMissile(m, world, false); return; }

    // ---- 动力段 ----
    var powered = m.age < effectiveLife(w, m.pos.y);
    if (powered) {
      m.speed = Math.min(m.speed + w.boost * dt, w.speed * (1 + Math.max(0, (12000 - m.pos.y) / 60000)));
    } else {
      m.speed = Math.max(m.speed - 140 * dt, 170);
    }

    // ---- 导引 ----
    var t = m.target;
    if (t && (!t.alive || t.dead)) { t = null; }

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
    m.vel = M3.mul(m.fwd, m.speed);
    m.pos = M3.add(m.pos, M3.mul(m.vel, dt));

    if (m.pos.y <= 0) { killMissile(m, world, false); return; }

    // ---- 尾迹 ----
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

  function detonate(m, t, world) {
    m.alive = false;
    explode(world.particles, m.pos, 1.0, 14);
    SFX.boom(0.75);
    if (t && t.alive && M3.dist(t.pos, m.pos) < m.prox + 14) {
      damage(t, m.dmg, world, m.owner);
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

         这一点早先被我理解反了 —— 公式写成了 1 − flare·k，
         等于把「抗干扰改型」TOR-4（flare 0.24，全表最低）
         变成了最容易被骗的一枚。数据一直是对的，是公式错了。

         雷达导引头普遍更难骗（多普勒滤波能滤掉静止的箔丝云），
         而大型对地弹普遍更容易被骗（不装抗干扰设备）——
         这两种差异都已经直接体现在各弹的 flare 值里，不需要再乘系数。 */
      var chance = m.w.flare;
      if (Math.random() >= chance) continue;

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
  function fireGun(a, world) {
    if (!a.alive || a.gunAmmo <= 0) return;
    var w = WEAPONS[a.gun];
    var rps = w.rpm / 60;
    if (a.gunTimer > 0) return;          // 由射速节流
    a.gunTimer = 1 / rps;
    var n = Math.max(1, Math.round(rps * 0.033));
    if (n > a.gunAmmo) n = a.gunAmmo;
    a.gunAmmo -= n;

    for (var i = 0; i < n; i++) {
      var sp = M3.V(
        M3.rnd(-1, 1) * w.spread, M3.rnd(-1, 1) * w.spread, M3.rnd(-1, 1) * w.spread
      );
      var dir = M3.norm(M3.add(a.fwd, sp));
      var muzzle = M3.add(a.pos, M3.add(M3.mul(a.fwd, 6), M3.mul(a.right, (i % 2) ? 0.7 : -0.7)));
      world.bullets.push({
        kind: 'bullet', team: a.team, alive: true,
        pos: muzzle,
        prev: M3.clone(muzzle),
        vel: M3.add(M3.mul(dir, w.speed), a.vel),
        dmg: w.dmg, life: 2.2, owner: a
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
    breakLock: breakLock,
    fireGun: fireGun, stepBullet: stepBullet, SLOT_EMPTY: SLOT_EMPTY,
    spawnParticle: spawnParticle, stepParticles: stepParticles, explode: explode,
    damage: damage, kill: kill, killGround: killGround, explode2: explode,
    makeTarget: makeTarget, stepTarget: stepTarget,
    randUnit: randUnit
  };
})();
