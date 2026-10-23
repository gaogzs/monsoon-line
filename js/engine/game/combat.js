(function (Game) {
  'use strict';
  var $ = Game.$;
  $.resolveBullets = resolveBullets; $.scanShot = scanShot; $.hitTarget = hitTarget; $.updateTargets = updateTargets; $.bearing = bearing; $.updateDEW = updateDEW;

  /* ============================================================
     命中检测
     ============================================================ */
  function resolveBullets(dt) {
    var i;

    for (i = 0; i < $.world.bullets.length; i++) scanShot($.world.bullets[i], dt);
    /* 导弹与无制导弹的碰炸统一在 Ent.contactScan（stepMissile 里调），这里只剩子弹。 */
  }

  /* 一发弹体（子弹或无制导弹）的命中检测。逻辑完全一样：
     只用"上一帧位置 → 当前位置"这条线段去和球求交。 */
  function scanShot(b, dt) {
      if (!b.alive) return;
      var j;
      var prev = M3.sub(b.pos, M3.mul(b.vel, dt));
      var dir = M3.norm(b.vel);
      var segLen = M3.len(M3.mul(b.vel, dt));

      // 对飞机
      for (j = 0; j < $.world.actors.length; j++) {
        var a = $.world.actors[j];
        if (!a.alive || a.team === b.team) continue;
        var t = M3.raySphere(prev, dir, a.pos, Combat.HIT_R_AIR);
        if (t >= 0 && t <= segLen) {
          if (b.owner && b.owner.isPlayer) {
            $.world.hitsLanded++;
            if (b.kind === 'bullet') $.world.gunHits++;
          }
          /* 带战斗部的炮弹（舰炮）同样起爆；航空机炮没有 blast，走下面的直接命中 */
          if (b.blast > 0) {
            Ent.detonateShell(b, $.world, M3.add(prev, M3.mul(dir, t)), a);
            break;
          }
          b.alive = false;
          Ent.damage(a, b.dmg * Ent.gunResistK(a, b), $.world, b.owner);
          Ent.spawnParticle($.world.particles, b.pos, M3.V(0, 0, 0), 0.22, 1.4, '#ffdd88', { grow: true });
          SFX.hit();
          break;
        }
      }
      if (!b.alive) return;

      // 对目标物
      for (j = 0; j < $.world.targets.length; j++) {
        var tg = $.world.targets[j];
        if (!tg.alive || tg.team === b.team) continue;
        var r = tg.radius || 8;
        /* 高度差超过"半径 + 本帧弹道长"就不可能相交 —— 每关头顶几十个单元，
           低空的弹不用逐个去求交。 */
        if (Math.abs(b.pos.y - tg.pos.y) > r + segLen) continue;
        var t2 = M3.raySphere(prev, dir, tg.pos, r);
        if (t2 >= 0 && t2 <= segLen) {
          if (b.owner && b.owner.isPlayer) {
            $.world.hitsLanded++;
            if (b.kind === 'bullet') $.world.gunHits++;
          }
          if (b.blast > 0) {
            Ent.detonateShell(b, $.world, M3.add(prev, M3.mul(dir, t2)), tg);
            break;
          }
          b.alive = false;
          // 加固目标对普通战斗部打折（Ent.warheadK；子弹的 b.w 是 undefined → 1）
          // 小口径航炮再乘机炮抗性（Ent.gunResistK；导弹 / 炸弹 → 1）
          hitTarget(tg, b.dmg * Ent.warheadK(b.w, tg) * Ent.gunResistK(tg, b), b.owner);
          SFX.hit();
          break;
        }
      }
      /* 没撞上：带近炸引信的炮弹看看有没有擦着敌机 */
      if (b.alive && b.fuze > 0) Ent.shellFuze(b, $.world);
      /* 子弹落地就没了（带战斗部的炮弹在 stepBullet 里落水起爆）；无制导弹落地的起爆在 stepMissile 里 */
      if (b.alive && b.pos.y <= Ent.groundY(b.pos.x, b.pos.z) && b.kind !== 'missile') b.alive = false;
  }

  function hitTarget(tg, dmg, source) {
    if (!tg.alive) return;
    tg.hp -= dmg;
    Ent.spawnParticle($.world.particles, tg.pos, M3.V(0, 2, 0), 0.3, 2.6, '#ffcc66', { grow: true });
    if (tg.hp <= 0) {
      /* 打掉 friendlyAsset（调节单元、准绳）一律记处罚 —— 以前 penal 算了没人用，
         只有 cell 分支自己累加，准绳被打掉反而 +400。 */
      var penal = tg.friendlyAsset && source && source.isPlayer;
      if (penal) $.world.friendlyLoss = ($.world.friendlyLoss || 0) + 1;
      tg.killedBy = source || null;
      Ent.killGround(tg, $.world);
      /* 舰船之间的战果（2-0IMPL 4.1）：不归玩家，无线电播报 */
      if (source && source.kind === 'target' && tg.big && tg.ttype !== 'air') {
        var mine = tg.team === 0;
        Radio.raw({ who: 'SEXTANT', cls: 'cmd',
          tx: mine ? ('<b>' + shipName(tg) + T('engine.game.combat.hitTarget.tx.s1')) : (shipName(tg) + T('engine.game.combat.hitTarget.tx.s2')), gap: 1.0 });
      }
      if (tg.tags.regulator) {
        /* 处罚已在上面的 penal 记过一次 —— 这里以前又加了一次，打掉一个单元算两次。
           这句只在玩家打的时候说：流弹打掉的不该算到"你"头上。 */
        if (source && source.isPlayer) {
          Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: T('engine.game.combat.hitTarget.tx_'), gap: 1.2 });
        }
      } else if (tg.tags.relay) {
        Radio.raw({ who: CALLSIGN.wing2, cls: 'ally', tx: T('engine.game.combat.hitTarget.tx_2'), gap: 1.0 });
      } else if (tg.tags.sam) {
        Radio.raw({ who: CALLSIGN.wing3, cls: 'ally', tx: T('engine.game.combat.hitTarget.tx_3'), gap: 0.8 });
      }
    }
  }

  /* ============================================================
     地面 / 平台火力
     ============================================================ */
  /* 水面/地面目标的对空射击。

     以前这里只会朝玩家开火 —— 于是我方舰艇（team 0）根本没法带武器：
     一带上就会对玩家自己发射。现在按阵营挑目标：
       team 1（敌方）  玩家优先；玩家不在射程/没被发现时，打最近的我方飞机（僚机/无人机）
       team 0（我方）  最近的敌机（team 1）
       team 2（中立）  从不开火
     发射本身沿用原来那条路径（makeMissile + fireCd）。弹的阵营 = 发射者阵营，
     命中判定与近炸都按 m.team 过滤（见 entities.js），所以我方舰艇的弹
     不会伤到玩家与僚机。 */
  /* 舰载雷达（有舰种的目标，spawnShip 带 shipCls）比弹自己的导引头看得远：
     锁定距离 × SHIP_RADAR_K，但不超过弹真能飞到的距离（有效射程 × AI 余量）。
     地面阵地照旧用 aiReach。 */
  var SHIP_RADAR_K = 1.5;

  function samReach(t, w) {
    if (!t.shipCls) return Ent.aiReach(w, t.pos.y);
    return Math.min(w.lockDist * SHIP_RADAR_K, Ent.effRange(w, t.pos.y) * Ent.AI_RANGE_K);
  }

  function pickTargetFor(t, w) {
    if (t.team === 1) {
      if ($.player.alive) {
        var d = M3.dist(t.pos, $.player.pos);
        // 玩家的被动吊舱会压缩敌方对他的锁定距离
        /* 自己被压制：锁定距离打折、只锁"看得清"的距离以内（与 AI 同一套，Ent.jamLockOK） */
        if (d <= samReach(t, w) * (1 - ($.player.lockResist || 0)) * Ent.jamLockK(t) && Ent.jamLockOK(t, $.player)) {
          // 低空突防可以躲开对空雷达；但贴得太近仍会被目视发现
          var lowExposed = t.ground && Ent.agl($.player) < ($.world.dangerAltitude || 1500) && d < 5200;
          if ($.world.detected || lowExposed) return $.player;
        }
      }
      // 没被发现之前不会去打僚机 —— 否则一开火就等于自己暴露了
      if (!$.world.detected) return null;
    } else if (t.team !== 0) {
      return null;
    }
    // 射程：min(锁定距离, 有效射程)（Ent.aiReach），不在打不到的距离上放弹
    var best = null, bd = samReach(t, w) * Ent.jamLockK(t);
    for (var j = 0; j < $.world.actors.length; j++) {
      var e = $.world.actors[j];
      if (!e.alive || e === $.player || e.team === t.team || e.team === 2) continue;
      if (!Ent.jamLockOK(t, e)) continue;
      var de = M3.dist(t.pos, e.pos);
      if (de < bd) { bd = de; best = e; }
    }
    return best;
  }

  function updateTargets(dt) {
    for (var i = 0; i < $.world.targets.length; i++) {
      var t = $.world.targets[i];
      if (!t.alive) { if (t.platform) platformWreck(t, dt); continue; }
      Ent.stepTarget(t, dt);
      if (t.turrets && t.team !== 2) Turret.stepAll(t, $.world, dt);
      if (t.ship) Ent.wakeSpray(t, $.world, dt);

      if (!t.weapon || t.team === 2) continue;
      if (t.fireCd > 0) { t.fireCd -= dt; continue; }

      var w = WEAPONS[t.weapon];
      if (!w) continue;
      var tgt = pickTargetFor(t, w);
      if (!tgt) continue;
      var d = M3.dist(t.pos, tgt.pos);

      t.fireCd = w.cd + M3.rnd(0, 2);
      /* 有舰空弹发射器（垂发 / 旋转架，SHIP_LAUNCHERS）的船从发射器出管；
         没有的（地面 SAM 阵地等）沿用旧路径：从中心朝目标上方 260 m 射出 */
      if (!(t.turrets && Turret.cue(t, tgt, t.weapon, $.world))) {
        var dir = M3.norm(M3.add(M3.sub(tgt.pos, t.pos), M3.V(0, 260, 0)));
        $.world.missiles.push(Ent.makeMissile({
          weapon: t.weapon, team: t.team,
          pos: M3.V(t.pos.x, t.pos.y + 5, t.pos.z),
          fwd: dir, speed: 140,
          target: tgt, owner: t
        }));
      }
      // 只有冲着玩家来的那一发才喊"发射"；告警音由主循环按 m.target 判
      if (tgt === $.player) {
        Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: T('engine.game.combat.updateTargets.tx.s1') + bearing(t.pos, $.player.pos) + T('engine.game.combat.updateTargets.tx.s2') + (d / 1000).toFixed(1) + T('engine.game.combat.updateTargets.tx.s3'), gap: 0.9 });
        SFX.missileFar();
      }
    }
  }

  /* 被击毁的海上平台：不移除，残骸（<model>_wreck）下沉一截，
     上层起火冒烟 —— 火 40 s 内渐弱，黑烟拖到 90 s。离玩家 8 km 外不出粒子 */
  var WRECK_SINK = 5, WRECK_FIRE_T = 40, WRECK_SMOKE_T = 90;

  function platformWreck(t, dt) {
    t.wreckT = (t.wreckT || 0) + dt;
    t.wreckY = Math.min(WRECK_SINK, (t.wreckY || 0) + dt * 0.4);
    if (t.wreckT > WRECK_SMOKE_T || M3.dist(t.pos, $.player.pos) > 8000) return;
    var top = (t.platform.dim[2] || 15) - t.wreckY, R = (t.radius || 20) * 0.4;
    t.wreckAcc = (t.wreckAcc || 0) + dt * 6;
    while (t.wreckAcc >= 1) {
      t.wreckAcc -= 1;
      var p = M3.V(t.pos.x + M3.rnd(-R, R), top + M3.rnd(0, 3), t.pos.z + M3.rnd(-R, R));
      Ent.spawnParticle($.world.particles, p, M3.V(M3.rnd(-1, 1), M3.rnd(3, 6), M3.rnd(-1, 1)),
        M3.rnd(3, 5), M3.rnd(4, 7), '#2e2b28', { grow: true, drag: 0.4, alpha: 0.6 });
      if (t.wreckT < WRECK_FIRE_T && M3.rnd(0, 1) < 1 - t.wreckT / WRECK_FIRE_T) {
        Ent.spawnParticle($.world.particles, p, M3.V(0, M3.rnd(2, 5), 0),
          M3.rnd(0.4, 0.8), M3.rnd(2, 3.5), M3.rnd(0, 1) < 0.5 ? '#ff9a3c' : '#ffcf5c', { grow: true, drag: 1 });
      }
    }
  }

  /* 相对方位角。

     两个参数都是**位置向量**，不是实体 —— 这里原来是混着写的：
     from 当向量（from.x），to 当实体（to.pos.x）。调用处传的是两个向量，
     于是 to.pos 是 undefined，一旦有防空浮台开火就抛异常。
     那个分支以前没被跑到，加了基地目标之后才暴露出来。 */
  function bearing(from, to) {
    var dx = to.x - from.x, dz = to.z - from.z;
    // 真方位：世界 +z 的真方位由本关 mission.axis 决定（world.axis）
    var axis = ($.world && $.world.axis) || 0;
    var deg = ((Math.atan2(dx, dz) * 180 / Math.PI + axis) % 360 + 360) % 360;
    return ('00' + deg.toFixed(0)).slice(-3);
  }

  /* ============================================================
     定向能自动拦截
     ============================================================ */
  function updateDEW(dt, actor) {
    /* 吊舱是自动系统，不要求被选为当前武器；每个挂点一个发射槽，
       各自冷却（slotCd，和导弹同一套，画在右下角缩略图里）。 */
    var wid = null, slot = -1, sl, w;
    for (var k in actor.slotCd) {
      w = WEAPONS[k];
      if (!w || w.kind !== 'dew') continue;
      sl = actor.slotCd[k];
      for (var si = 0; si < sl.length; si++) if (sl[si] === 0) { slot = si; break; }
      if (slot >= 0) { wid = k; break; }
    }
    if (wid === null) return;
    w = WEAPONS[wid];
    for (var i = 0; i < $.world.missiles.length; i++) {
      var m = $.world.missiles[i];
      if (!m.alive || m.team === actor.team) continue;
      if (m.target !== actor) continue;
      var d = M3.dist(m.pos, actor.pos);
      if (d > w.interceptRange) continue;
      var toM = M3.norm(M3.sub(m.pos, actor.pos));
      if (M3.angleBetween(actor.fwd, toM) > w.interceptCone) continue;
      // 平流层的风切变会把光斑抹开，拦截概率下降（见 codex t4 铁律二）
      var chance = (actor.pos.y > 18000 && w.highAltChance) ? w.highAltChance : w.interceptChance;
      /* 每枚来袭弹**只判一次**：第一次进入包线时按 chance 掷骰。

         以前是把总概率按"约 1.2 秒飞行时间"折成每帧概率连续掷，
         实际累积是 1 − e^(−chance·T/1.2)，T 取决于接近速度：
         迎头 1200 m/s 的弹只在包线里待 1 秒，55% 实际只有 37% 左右。
         现在 desc 写的 55% 就是每枚弹被烧掉的概率。 */
      var rollKey = actor.id !== undefined ? actor.id : actor;
      if (m.dewRolled === rollKey) continue;
      m.dewRolled = rollKey;
      if (!(M3.rnd(0, 1) < chance)) continue;
      // 拦截成功
      sl[slot] = w.cd;
      if (actor.special === wid) actor.spCd = Math.min.apply(null, sl);
      m.alive = false;
      if (actor.isPlayer) {
        SysNote.show(T('engine.game.combat.updateDEW.s1') + w.name + T('engine.game.combat.updateDEW.s2') + w.cn + T('engine.game.combat.updateDEW.s3'));
      }
      Ent.spawnParticle($.world.particles, m.pos, M3.V(0, 0, 0), 0.4, 3.2, '#7dfaff', { grow: true });
      Ent.explode($.world.particles, m.pos, 0.6, 8);
      SFX.laser();
      return;
    }
  }
})(Game);
