(function (AI) {
  'use strict';
  var $ = AI.$;
  $.supportDir = supportDir; $.supportFire = supportFire;

  /* ============================================================
     战略制空支援（批次 6.4）：role === 'support' 且没有 a.route 的飞机（预警机是路线型，不走这里）

     它不是战斗机：不追人、不咬尾、不开机炮。价值在远处——
       ① 机动  以友方战斗机的质心为锚点，保持在它们**后方**（远离最近的敌机）SUP_K.D0 … D1 的位置游走；
               到位后绕着锚点盘旋；友机没了就原地盘旋
       ② 脱离  敌机逼近到 THREAT_R 就掉头全速拉开（不影响齐射：边跑边射），至少持续 THREAT_T 秒（来袭导弹走通用的 evade，优先于这里）
       ③ 齐射  每隔 T0 … T1 秒一次：对 N0 … N1 个**不同**的敌机各放一发（目标不够就轮着打），
               优先射程最远的主动雷达弹；半主动弹（sarh）只给第一个目标（照射机同一时刻只能照一个）
       ④ 压制  被压制时齐射间隔按 (1 + SUP_K.JAM_SLOW × suppressed) 拉长，锁定距离折半由 jamLockK / jamLockOK 管
     大范围干扰场不在这里：机型数据的 ewField 由 spawnEnemy 转成 ai.jam，走 brain.js 的 jamAuto。
     ============================================================ */
  var SUP_K = {
    D0: 12000, D1: 18000,      // 保持在友机质心后方的距离（m）
    ARRIVE: 3500,              // 到位半径：进了这个范围就绕着锚点盘旋
    ALT: 8000,                 // 巡航高度（m）：低于它缓慢爬升
    THREAT_R: 12000,           // 敌机逼近到这个距离就脱离（大飞机转得慢，要早跑；脱离期间照样齐射）
    THREAT_T: 8,               // 脱离至少持续（s）
    T0: 25, T1: 40,            // 两次齐射的间隔（s）
    FIRST: 6,                  // 第一次齐射前的最短等待（s）
    N0: 3, N1: 4,              // 一次齐射的发数
    RETRY: 3,                  // 没有可打的目标时多久后再看（s）
    JAM_SLOW: 1.5,             // 被压制时间隔的拉长系数
    FRIEND_R: 60000            // 算友机质心只看离自己这么近的（m）
  };
  $.SUPPORT = SUP_K;

  function hdir(from, to) {
    var d = M3.V(to.x - from.x, 0, to.z - from.z), l = Math.sqrt(d.x * d.x + d.z * d.z);
    return l < 1 ? M3.V(0, 0, 0) : M3.V(d.x / l, 0, d.z / l);
  }

  /* 友方战斗机的质心：同队、活着、没撤离、是战斗角色（enemy / ally）或玩家；不含自己、无人机、其他支援机。
     只取离自己 FRIEND_R 以内的（地图上相隔很远的另一群友机不该把锚点拉过去）；附近一架都没有就取最近的那一架 */
  function friendCentroid(a, world) {
    var near = [], best = null, bd = 1e18, i;
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (e === a || !e.alive || e.escaped || e.team !== a.team) continue;
      if (!(e.isPlayer || (e.ai && (e.ai.role === 'enemy' || e.ai.role === 'ally')))) continue;
      var d = M3.dist(e.pos, a.pos);
      if (d < SUP_K.FRIEND_R) near.push(e);
      if (d < bd) { bd = d; best = e; }
    }
    if (!near.length) return best ? { c: M3.clone(best.pos), n: 1 } : null;
    var c = M3.V(0, 0, 0);
    for (i = 0; i < near.length; i++) c = M3.add(c, near[i].pos);
    return { c: M3.mul(c, 1 / near.length), n: near.length };
  }

  /* 离某点最近的敌方飞机 */
  function nearestHostile(a, world, from) {
    var best = null, bd = 1e18;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.escaped || !Ent.hostile(e, a)) continue;
      var d = M3.dist(e.pos, from);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { e: best, d: bd } : null;
  }

  function state(a, s) {
    var u = s.sup;
    if (!u) {
      u = s.sup = {
        D: SUP_K.D0 + (SUP_K.D1 - SUP_K.D0) * $.rnd01(s),
        T: SUP_K.FIRST + 4 * $.rnd01(s),      // 下一次齐射倒计时
        flee: 0, fleeFrom: null, salvos: 0, orbit: $.rnd01(s) < 0.5 ? -1 : 1
      };
    }
    return u;
  }

  /* ---------- 机动：返回 { dir, throttle, ab } ---------- */
  function supportDir(a, s, world, dt) {
    var u = state(a, s);
    var climb = a.pos.y < SUP_K.ALT ? 0.12 : (a.pos.y > SUP_K.ALT + 1500 ? -0.05 : 0);

    // 脱离：敌机逼近
    var th = nearestHostile(a, world, a.pos);
    if (th && th.d < SUP_K.THREAT_R) { u.flee = SUP_K.THREAT_T; u.fleeFrom = th.e.pos; }
    if (u.flee > 0) {
      u.flee -= dt;
      var away = hdir(u.fleeFrom, a.pos);
      return { dir: M3.norm(M3.V(away.x, Math.max(climb, 0.05), away.z)), throttle: 1, ab: true };
    }

    var fc = friendCentroid(a, world);
    if (!fc) {                                            // 友机没了：原地盘旋
      var tan0 = M3.V(a.right.x * u.orbit, climb, a.right.z * u.orbit);
      return { dir: M3.norm(tan0), throttle: 0.6, ab: false };
    }
    // 锚点：质心后方 D 米（远离离质心最近的敌机）；没有敌机就守在质心当前方位的外侧
    var en = nearestHostile(a, world, fc.c);
    var back = en ? hdir(en.e.pos, fc.c) : hdir(fc.c, a.pos);
    var P = M3.V(fc.c.x + back.x * u.D, 0, fc.c.z + back.z * u.D);
    var toP = hdir(a.pos, P), dP = Math.sqrt((P.x - a.pos.x) * (P.x - a.pos.x) + (P.z - a.pos.z) * (P.z - a.pos.z));
    if (dP > SUP_K.ARRIVE) {
      return { dir: M3.norm(M3.V(toP.x, climb, toP.z)), throttle: dP > 20000 ? 1 : 0.85, ab: dP > 30000 };
    }
    // 到位：绕着锚点盘旋（切向 + 一点向心）
    var tan = M3.V(-toP.z * u.orbit, 0, toP.x * u.orbit);
    return { dir: M3.norm(M3.V(tan.x + toP.x * 0.3, climb, tan.z + toP.z * 0.3)), throttle: 0.7, ab: false };
  }

  /* 挑一发打 t 的弹：空空、对得上目标、射程够；射程最远的优先。allowSarh 假 = 跳过半主动弹 */
  function pickWeapon(a, t, dist, allowSarh) {
    var best = null, br = 0;
    if (!a.ammoPool) return null;
    for (var wid in a.ammoPool) {
      if (!Object.prototype.hasOwnProperty.call(a.ammoPool, wid) || !(a.ammoPool[wid] > 0)) continue;
      var w = WEAPONS[wid];
      if (!w || w.kind !== 'aam' || !Ent.weaponMatchesTarget(w, t)) continue;
      if (w.tags && w.tags.sarh && !allowSarh) continue;
      var sl = a.slotCd ? a.slotCd[wid] : null;                 // 发射槽还在装填：这一发打不出去，挑别的
      if (sl && Math.min.apply(null, sl) > 0) continue;
      var reach = Ent.aiReach(w, a.pos.y) * Ent.jamLockK(a);
      if (dist > reach * 0.98) continue;
      if (reach > br) { br = reach; best = wid; }
    }
    return best;
  }

  /* ---------- 齐射：每帧调用（brain.js 的 fire 对 support 直接转到这里） ---------- */
  function supportFire(a, s, world, dt) {
    var u = state(a, s);
    a.firingGun = false;
    u.T -= dt / (1 + SUP_K.JAM_SLOW * M3.clamp(a.suppressed || 0, 0, 1));
    if (u.T > 0 || s.mode === 'evade') return;
    // 候选目标：敌方飞机、锁得住、够得着手上任何一种空空弹；按距离从近到远
    var cand = [], i, e;
    for (i = 0; i < world.actors.length; i++) {
      e = world.actors[i];
      if (!e.alive || e.escaped || !Ent.hostile(e, a) || !Ent.jamLockOK(a, e)) continue;
      var d = M3.dist(e.pos, a.pos);
      if (pickWeapon(a, e, d, true)) cand.push({ e: e, d: d });
    }
    if (!cand.length) { u.T = SUP_K.RETRY; return; }
    cand.sort(function (x, y) { return x.d - y.d; });
    var n = SUP_K.N0 + Math.floor((SUP_K.N1 - SUP_K.N0 + 1) * $.rnd01(s)), fired = 0;
    for (i = 0; i < n; i++) {
      var c = cand[i % cand.length];
      var wid = pickWeapon(a, c.e, c.d, i === 0);
      if (!wid) continue;
      Ent.setWeapon(a, wid);
      if (world.fireMissile(a, c.e)) fired++;
    }
    if (fired) {
      u.salvos++;
      u.T = SUP_K.T0 + (SUP_K.T1 - SUP_K.T0) * $.rnd01(s);
    } else {
      u.T = SUP_K.RETRY;
    }
  }
})(AI);
