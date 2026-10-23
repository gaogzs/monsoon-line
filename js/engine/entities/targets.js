(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.makeTarget = makeTarget; $.stepTarget = stepTarget;

  /* ---------- 目标物（调节单元 / 中继平台 / 地面设施） ---------- */
  var NO_TAGS = {};
  function makeTarget(o) {
    var def = TARGETS[o.model];
    return {
      kind: 'target',
      team: o.team === undefined ? 1 : o.team,
      ttype: o.ttype || 'ground',
      label: o.label || T('engine.entities.targets.makeTarget.label.s1'),
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
      tags: def ? def.tags : NO_TAGS,    // 机制标签（hard / regulator / relay / sam / cullFar），见 js/data/targets/
      gunResist: o.gunResist !== undefined ? o.gunResist : ((def && def.gunResist) || 0),
      ground: !!o.ground,
      big: !!o.big,
      drift: o.drift || 0,
      /* 航路（水面舰船用）。`wp` 是一串**海面**航点 [{x,z}…]，
         `speed` 是米/秒（`SHIPS[].speed` 是节，接入时自己换算）。
         有 `route` 时它优先于 `drift` —— 一条船要么沿航路走，
         要么原地漂，不必两套叠在一起。见 stepTarget。 */
      route: o.route || null,
      wpIdx: 0,
      arrive: 0,          // 航路到达阈值，在 makeTarget 末尾从 route 里取
      heading: 0,         // 当前航向（弧度），由实际位移反推，不是设定的
      fireCd: o.fireCd === undefined ? 6 : o.fireCd,
      weapon: o.weapon || null,
      value: o.value || 100,
      drifting: 0
    };
  }

  function stepTarget(t, dt, world) {
    if (!t.alive) return;

    /* ---------- 航路：水面舰船真的在航行 ----------

       以前只有 `drift`（正弦缓慢漂移）：浮空平台随气流飘是对的，
       而一条 40 节的导弹快艇"原地打转"就说不通了。这一支让目标能沿
       `route.wp` 走 —— 位置直线推进、`vel` 与 `fwd` 由**实际位移**反推。

       `fwd` 走位移而不是走线段方向，是为了让渲染与 HUD 在到达航点的
       拐弯处也能拿到连续朝向（线段方向会在换段的瞬间跳变）。 */
    var r = t.route;
    if (r && r.wp && r.wp.length) {
      t.arrive = r.arrive === undefined ? Math.max(120, t.radius * 2) : r.arrive;
      var last = r.wp.length - 1;
      if (t.wpIdx > last) {
        // 走完了：loop 就回绕，否则交给 onArrive 决定（默认原地停住）
        if (r.loop) {
          t.wpIdx = 0;
        } else {
          t.vel = M3.V(0, 0, 0);
          if (r.onArrive && !t.arrived) { t.arrived = true; r.onArrive(t, world); }
          if (r.despawn) t.alive = false;
          return;
        }
      }
      var wp = r.wp[t.wpIdx];
      var dx = wp.x - t.pos.x, dz = wp.z - t.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var spd = r.speed || t.speed || 12;
      var travel = spd * dt;
      if (d <= Math.max(t.arrive, travel)) {
        /* 一步就能到：直接落到航点上。不做"保留剩余位移"的精确分配 ——
           船一帧最多走十来米，分不分都对不齐，而少算这一段会让船
           永远差一点点到不了点。 */
        t.pos.x = wp.x; t.pos.z = wp.z;
        t.wpIdx++;
        var ux = d > 1e-6 ? dx / d : 0, uz = d > 1e-6 ? dz / d : 0;
        t.vel = M3.V(ux * spd, 0, uz * spd);
        if (d > 1e-6) t.heading = Math.atan2(dx, dz);
      } else {
        t.pos.x += dx / d * travel;
        t.pos.z += dz / d * travel;
        t.vel = M3.V(dx / d * spd, 0, dz / d * spd);
        t.heading = Math.atan2(dx, dz);
      }
      var vl = M3.len(t.vel);
      if (vl > 1e-3) t.fwd = M3.norm(t.vel);
      /* 航行的船不做"被打坏后下沉"那一套（那是浮空平台的事），所以
         航路分支 return —— 但 ttype 还是 ground，下沉本来也轮不到它。 */
    } else if (t.drift) {
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
})(Ent);
