(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     Director（docs/POST2-0IMPL.md 5.2 / 5.3）

     不是一个"总指挥 AI"，只是一份每 0.5 s 刷新一次的共享快照 + 几条分配规则：
       · 谁已经被盯着（同队多少架把它当目标）—— 选目标时给"已被盯"的目标加惩罚，避免全队咬同一架
       · 友军（ally）的扇区：按编号把 360° 分给同队 ally，各自优先打自己扇区里的敌人
       · 友军不抢人头：玩家已锁定、且还没被打残的敌机，对 ally 的评分加惩罚
     以及武器分类（longRange / shortRange / gunOnly），决定能不能玩外围游走（standoff）。
     ============================================================ */
  var TICK = 0.5;
  var STEAL_PENALTY = 1.5;      // ally 对"玩家正盯着的敌机"的评分系数
  var STEAL_HP_FRAC = 0.35;     // 那架敌机血量低于此比例就不再回避（可以补刀）
  var R_LONG = 7000;            // 有效射程 ≥ 此值的对空弹 = 远距武器
  $.DIR = { STICKY: 0.7, PILE: 1.0 /* 每多一个同队攻击者，评分距离 ×(1 + PILE) */, TICK: TICK, R_LONG: R_LONG, T_FURBALL: 25, T_STANDOFF: 45, RING_K: 0.6 };

  function snapshot(world) {
    var t = world.time || 0;
    var d = world.aiDir;
    if (d && t >= d.t0 && t - d.t0 < TICK) return d;
    d = { t0: t, load: [], targets: [], allies: [], cx: 0, cz: 0, help: [] };
    var n = 0;
    for (var r = 0; r < world.actors.length; r++) if (world.actors[r].ai) world.actors[r].ai.subrole = null;
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive || !a.ai || a.route) continue;
      if (a.ai.target && a.ai.target.alive) {
        var k = d.targets.indexOf(a.ai.target);
        if (k < 0) { d.targets.push(a.ai.target); d.load.push([a]); } else d.load[k].push(a);
      }
      if (a.ai.helpT > 0) d.help.push(a);
      if (a.ai.role === 'ally') { d.allies.push(a); d.cx += a.pos.x; d.cz += a.pos.z; n++; }
    }
    if (n) { d.cx /= n; d.cz /= n; }
    /* 诱饵与侧击：同一个空中目标被同队 ≥ 2 架 skill ≥ 0.6 的敌机盯着时，第一架当诱饵（正面吸引），其余绕侧后切入 */
    for (var k2 = 0; k2 < d.targets.length; k2++) {
      if (d.targets[k2].kind === 'target') continue;
      var grp = [], L2 = d.load[k2];
      for (var g = 0; g < L2.length; g++) if (L2[g].ai.role === 'enemy' && L2[g].ai.skill >= 0.6 && L2[g].ai.mode !== 'evade') grp.push(L2[g]);
      if (grp.length < 2) continue;
      grp[0].ai.subrole = 'bait';
      for (var h = 1; h < grp.length; h++) { grp[h].ai.subrole = 'flank'; grp[h].ai.flankSide = h % 2 ? 1 : -1; }
    }
    world.aiDir = d;
    return d;
  }

  // 已经把 e 当目标的同队飞机数（不含 a 自己）
  function attackers(d, a, e) {
    var k = d.targets.indexOf(e);
    if (k < 0) return 0;
    var n = 0, L = d.load[k];
    for (var i = 0; i < L.length; i++) if (L[i] !== a && L[i].team === a.team) n++;
    return n;
  }

  /* ally 的扇区：同队 ally 按在 d.allies 里的顺序平分 360°；返回 [中心角, 半宽]（弧度）。 */
  function sectorOf(d, a) {
    var idx = d.allies.indexOf(a), n = d.allies.length;
    if (idx < 0 || n < 2) return null;
    return [(idx + 0.5) / n * 6.283185307179586, 3.141592653589793 / n];
  }

  /* 选目标：在 maxR 内的敌机里取"评分距离"最小的。评分 = 距离 ×（已被盯惩罚）×（扇区惩罚）×（抢人头惩罚）。
     没有任何同队攻击者、不是 ally 时，与 nearestEnemy 完全等价。 */
  $.director = {
    pick: function (a, world, maxR) {
      var d = snapshot(world);
      var best = null, bs = Infinity, R2 = maxR * maxR;
      var sec = a.ai.role === 'ally' ? sectorOf(d, a) : null;
      var pl = world.player;
      for (var i = 0; i < world.actors.length; i++) {
        var e = world.actors[i];
        if (!e.alive || !Ent.hostile(e, a)) continue;
        var d2 = M3.dist2(e.pos, a.pos);
        if (d2 >= R2) continue;
        var sc = Math.sqrt(d2);
        var n = attackers(d, a, e);
        if (n > 0) sc *= 1 + $.DIR.PILE * n;
        if (d.help.length && a.ai.role !== 'drone' && e.target && d.help.indexOf(e.target) >= 0 && e.target !== a && e.target.team === a.team) sc *= 0.6;   // 正在打求援者的敌机：优先过去
        if (e === a.ai.target) sc *= $.DIR.STICKY;       // 黏性：当前目标打折，免得在相近的候选之间来回切（接近会变慢）
        if (sec) {
          // 敌机方位（相对 ally 队质心）与本机扇区中心比较
          var ang = Math.atan2(e.pos.x - d.cx, e.pos.z - d.cz);
          if (ang < 0) ang += 6.283185307179586;
          var da = Math.abs(ang - sec[0]);
          if (da > 3.141592653589793) da = 6.283185307179586 - da;
          if (da > sec[1]) sc *= 1 + 0.5 * Math.min(1, (da - sec[1]) / 1.5707963);
        }
        if (a.ai.role === 'ally' && pl && pl.alive && pl.target === e && e.hp > e.maxHp * STEAL_HP_FRAC) sc *= STEAL_PENALTY;
        if (sc < bs) { bs = sc; best = e; }
      }
      return best;
    }
  };

  /* 武器分类：看还有弹的对空导弹的有效射程。
       gunOnly    —— 没有可用的对空导弹
       shortRange —— 有，但有效射程 < R_LONG
       longRange  —— 有效射程 ≥ R_LONG */
  $.weaponClass = function (a) {
    var reach = 0;
    if (a.ammoPool) {
      for (var wid in a.ammoPool) {
        if (!Object.prototype.hasOwnProperty.call(a.ammoPool, wid) || !(a.ammoPool[wid] > 0)) continue;
        var w = WEAPONS[wid];
        if (!w || !w.seeker || w.seeker === 'none' || (w.target !== 'air' && w.target !== 'any')) continue;
        var r = Ent.aiReach(w, a.pos.y);
        if (r > reach) reach = r;
      }
    }
    return { cls: reach <= 0 ? 'gunOnly' : (reach >= R_LONG ? 'longRange' : 'shortRange'), reach: reach };
  };
})(AI);
