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
      spActive: 0,        // ECM 剩余生效时间
      spCharges: 0,       // DEW 充能数（构造末尾按武器初始化）
      gunTimer: 0,

      flares: o.flares === undefined ? 8 : o.flares,
      flareCd: 0,

      target: null,
      lockProgress: 0,
      locked: false,
      rwr: [],            // 正在锁定本机的导弹/敌机

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

    var dPitch = p.pitch * ctrl * dt;
    var dRoll = p.roll * M3.clamp(ctrl * 1.8, 0.28, 1) * dt;
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
      var lf = M3.clamp(a.loadFactor, 0, 1);
      p = {
        vMax: p.vMax * (1 - 0.08 * lf),
        vMil: p.vMil * (1 - 0.06 * lf),
        vStall: p.vStall * (1 + 0.05 * lf),
        acc: p.acc * (1 - 0.26 * lf),
        pitch: p.pitch * (1 - 0.18 * lf),
        roll: p.roll * (1 - 0.12 * lf)
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
      var aim = M3.add(t.pos, M3.mul(tvel, tGo * 0.82));
      var desired = M3.norm(M3.sub(aim, m.pos));

      // 视场限制：目标偏出 ±75° 视为丢失
      var off = M3.angleBetween(m.fwd, los);
      if (off > 1.35) {
        m.lostTime += dt;
        if (m.lostTime > 0.5) m.seekerOn = false;
      } else {
        m.lostTime = 0;
        var maxTurn = m.turn * turnFactor(m.pos.y) * dt;
        var B = M3.turnToward(m.fwd, m.up, desired, maxTurn);
        m.fwd = B.fwd; m.up = B.up;
        m.right = M3.cross(m.up, m.fwd);
        var Bo = M3.orthonormalize(m.fwd, m.up);
        m.fwd = Bo.fwd; m.up = Bo.up; m.right = Bo.right;
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
    a.flares--;
    a.flareCd = 1.6;
    SFX.flare();

    var i;
    for (i = 0; i < 6; i++) {
      var dir = randUnit();
      var v = M3.add(M3.mul(a.vel, 0.35), M3.mul(dir, M3.rnd(35, 85)));
      spawnParticle(world.particles, M3.add(a.pos, M3.mul(a.fwd, -6)), v,
        M3.rnd(1.4, 2.4), 2.2, '#ffd070', { grow: true, drag: 0.5, grav: 0.6 });
    }

    var broke = 0;
    for (i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.target !== a) continue;
      if (m.w.seeker !== 'ir') continue;
      if (Math.random() > m.w.flare) {
        m.target = null;
        m.seekerOn = false;
        m.lostTime = 1;
        broke++;
      }
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

    // 炮口火光（整轮开火只生成一次，不是每发子弹一次）
    var mz = M3.add(a.pos, M3.add(M3.mul(a.fwd, 7.5), M3.mul(a.right, 0.9)));
    spawnParticle(world.particles, mz, M3.mul(a.vel, 0.15),
      0.055, 3.2, '#fff2c0', { grow: true });
    spawnParticle(world.particles, mz, M3.V(0, 0, 0),
      0.10, 1.6, '#ffd070', { grow: true });
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
    fireGun: fireGun, stepBullet: stepBullet,
    spawnParticle: spawnParticle, stepParticles: stepParticles, explode: explode,
    damage: damage, kill: kill, killGround: killGround, explode2: explode,
    makeTarget: makeTarget, stepTarget: stepTarget,
    randUnit: randUnit
  };
})();
