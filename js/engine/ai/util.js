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
    /* 低空突防的攻击机（strike、skill ≥ 0.6）：远处就盯上面目标，才有"接近段贴海面"可言（ai/strike.js）；其余仍只在射程 ×1.15 内才去挑 */
    var strikeAI = a.ai && a.ai.skill >= 0.6 && a.ac && a.ac.caps && a.ac.caps.indexOf('strike') >= 0;
    return nearestSurfaceTarget(a, world, strikeAI ? Math.max(reach * 1.15, 25000) : reach * 1.15);
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

  /* 长机泛化（批次 6.1）：无人机跟谁 = ai.leader，没写就是玩家。长机可以是飞机，也可以是舰船（target）——
     舰船的 right 恒为 (1,0,0) 且不更新、speed 恒为 0、没有 .target，所以编队 / 目标逻辑一律走下面三个访问器，不直接读这些字段。 */
  $.leaderOf = function (s, world) { return (s && s.leader) || world.player; };
  $.leadRight = function (lead) {
    if (lead.kind !== 'target') return lead.right;
    return M3.norm(M3.V(-lead.fwd.z, 0, lead.fwd.x));            // 与飞机 right 同向：fwd × up 的水平投影
  };
  $.leadSpeed = function (lead) { return lead.kind === 'target' ? M3.len(lead.vel || M3.V(0, 0, 0)) : (lead.speed || 0); };
  $.leadTarget = function (lead) { return (lead.target && lead.target.alive) ? lead.target : null; };

  /* 正在锁定长机的敌机 —— "掩护"这条指令的核心。
     drone 的 cover 分支用它。
     它以前写在 wingman 的 cover 分支里（那条分支因为僚机都是 drone 而从来没跑到过，
     批次 5a 已随死代码清理，见 docs/systems/ai.md）。

     注意 `e.target === lead` 要求 **AI 每帧把 s.target 写回 a.target**
     （update() 末尾那一行）—— 在补上那行之前，这里永远找不到人，
     掩护会静默退化成"随便打一个最近的"。 */
  function leadThreat(a, world) {
    var lead = $.leaderOf(a.ai, world);
    if (!lead || !lead.alive) return null;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || !Ent.hostile(e, a)) continue;
      if (e.target === lead) return e;
    }
    return null;
  }

  /* 长机是 AI 时的无人机：没有 focus / cover / spread 三档命令（那是玩家给僚机下的令）。
     AI 长机没有复杂的指挥逻辑，僚机只做两件事：
       巡航：守在长机的编队槽位
       战斗：在长机周围 leash 范围内自己选目标、自由追击；目标跑出范围（×1.4 滞回）就放弃、飞回槽位
     leash 缺省 LEASH_R；同一型无人机从母舰放出时，防御与出击的区别只是 leash 大小（机库数据 / 关卡选项）。
     被压制 / 回收中 / 长机阵亡仍走原来的"只规避 / 飞回 / 盘旋"，不进这里。 */
  $.LEASH_R = 8000;
  $.aiLed = function (s, world) {
    var l = $.leaderOf(s, world);
    return !!(l && l.alive && !l.isPlayer);
  };
  $.leashTarget = function (a, s, lead, world) {
    var R = s.leash || $.LEASH_R, t = s.target;
    // 滞回：已在追的放宽到 1.4 R，免得在圈边来回切换
    if (t && t.alive && Ent.hostile(t, a) && M3.dist(t.pos, lead.pos) < R * 1.4) return t;
    var e = nearestEnemyTo(lead.pos, a, world, R);
    if (e) return e;
    var g = $.surfaceTargetFor(a, world);                // 带得动对面弹才找面目标，同样不出圈
    return (g && M3.dist(g.pos, lead.pos) < R) ? g : null;
  };
})(AI);
