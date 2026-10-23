(function (AI) {
  'use strict';
  var $ = AI.$;
  $.findIncoming = findIncoming; $.nearestEnemyTo = nearestEnemyTo; $.nearestEnemy = nearestEnemy; $.surfaceTargetFor = surfaceTargetFor; $.approachSurface = approachSurface; $.leadThreat = leadThreat;

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

  /* 僚机自主接战的半径：集火档长机没锁定时、掩护档没人威胁长机时，只打这个距离内的 */
  $.WING_FREE_R = 6000;

  /* 离某一点最近的敌机（掩护档：以长机为中心找） */
  function nearestEnemyTo(p, a, world, maxR) {
    var best = null, bd = maxR * maxR;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || !Ent.hostile(e, a)) continue;
      var d = M3.dist2(e.pos, p);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function nearestEnemy(a, world, maxR) {
    var best = null, bd = (maxR || 16000) * (maxR || 16000);
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || !Ent.hostile(e, a)) continue;
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
      if (w.target !== 'ground' && w.target !== 'ship' && w.target !== 'any') continue;
      // 够不够得着按"有效射程"（Ent.aiReach），不按导引头的锁定距离
      var rw = Ent.aiReach(w, a.pos.y);
      if (rw > reach) reach = rw;
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
      if (!e.alive || !Ent.hostile(e, a)) continue;
      if (e.target === lead) return e;
    }
    return null;
  }
})(AI);
