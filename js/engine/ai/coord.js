(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     编队与协同（docs/POST2-0IMPL.md 5.7「编队与协同」，批次 5f）

     1. 护航（escort）：s.ward = 被护卫者。没威胁时绕着它转（R_escort 内）；有敌机 / 来袭弹接近被护卫者
        （离它 < THREAT_R）时，登记一次反应延迟（reactT）后转去拦截；被护卫者没了 → 普通追击。
        与 m1 的布尔标志 ai.escort 无关（那个只用来把护航机排除出击毁目标计数）。
     2. 巡航队形：s.fm = { mode: wedge | echelon | column, lead, idx }。未交战时跟队长走槽位；
        交战判据（有目标且 < R_ENGAGE、被锁 / 来袭弹、掉血）成立后整队解散，各自回到战术角色。
     3. 电子战协同：被压制（suppressed）持续 > JAM_T 秒的 AI 主动脱离干扰区（朝远离干扰源的方向 extend 一阵）。
     4. 友军呼救：被咬尾 / 被锁 / 血量低于 40% 的友军（team 0）喊一次求援（Chatter 'help'），
        Director 选目标时把"正在打求援者的敌机"评分 ×0.6，附近无任务的友军会过去。
     ============================================================ */
  $.ESCORT = { R: 4000, LEASH: 8000, THREAT_R: 8000 };
  $.FORM = { R_ENGAGE: 12000, DX: 260, DZ: 200 };
  $.JAM = { T: 2.0, THRESH: 0.45, ESCAPE_S: 5, CD: 8 };
  $.HELP = { T: 8, CALL_CD: 20, HP: 0.4, REAR_R: 3000 };

  // 队形槽位偏移（右 dx、前 dz，负 = 身后）；idx 从 1 起
  $.formationSlot = function (mode, idx) {
    var side = idx % 2 ? 1 : -1, pair = Math.ceil(idx / 2), F = $.FORM;
    if (mode === 'echelon') return { dx: idx * F.DX, dy: 0, dz: -idx * F.DZ };
    if (mode === 'column') return { dx: 0, dy: 0, dz: -idx * F.DZ * 1.5 };
    return { dx: side * pair * F.DX, dy: 0, dz: -pair * F.DZ };        // wedge（缺省）
  };

  $.fmDir = function (a, s, world) {
    var fm = s.fm, L = fm && fm.lead;
    if (!L || !L.alive) { s.fm = null; return null; }
    var sl = $.formationSlot(fm.mode, fm.idx || 1);
    var wp = M3.add(L.pos, M3.add(M3.mul(L.right, sl.dx), M3.add(M3.mul(L.fwd, sl.dz), M3.V(0, sl.dy, 0))));
    var gap = M3.dist(wp, a.pos), ahead = M3.dot(M3.sub(wp, a.pos), L.fwd);
    var vWant = (L.speed || 0) + M3.clamp((ahead > -100 ? gap : -gap) * 0.25, -120, 260);
    var vMil = a.phys && a.phys.vMil || 400;
    return { dir: M3.norm(M3.sub(wp, a.pos)), throttle: M3.clamp(vWant / vMil, 0.25, 1), ab: vWant > vMil * 0.98 };
  };

  // 护航机无目标时的期望方向：离被护卫者远了就飞回去，近了就绕着它转（切向）
  $.escortDir = function (a, s) {
    var w = s.ward, dx = w.pos.x - a.pos.x, dz = w.pos.z - a.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    if (d > $.ESCORT.R) return M3.norm(M3.V(dx / d, (w.pos.y - a.pos.y) * 0.0005, dz / d));
    return M3.norm(M3.V(-dz / d, 0.0, dx / d));
  };

  // 威胁接近被护卫者：最近的敌机（或锁定它的来袭弹的发射机），没有返回 null
  function wardThreat(a, s, world) {
    var w = s.ward, best = null, bd = $.ESCORT.THREAT_R, i, e;
    for (i = 0; i < world.actors.length; i++) {
      e = world.actors[i];
      if (!e.alive || !Ent.hostile(e, a) || e.kind === 'target') continue;
      var d = M3.dist(e.pos, w.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* 决策层调用（每帧）：队形解散、护航拦截、脱离干扰区、呼救。 */
  $.coordStep = function (a, s, world, dt) {
    var i;
    if (s.helpT > 0) s.helpT -= dt;
    // 1. 护航：被护卫者活着才有这条逻辑
    if (s.ward) {
      if (!s.ward.alive) s.ward = null;
      else {
        var th = wardThreat(a, s, world);
        if (th) {
          if (s.escortT === null) s.escortT = 0;
          s.escortT += dt;
          if (s.escortT >= $.SKILL.reactT(s)) s.escortOK = th;       // 登记的反应延迟到了：才转去拦截
        } else { s.escortT = null; s.escortOK = null; }
        if (s.escortOK && !s.escortOK.alive) s.escortOK = null;
        if (s.escortOK) { s.target = s.escortOK; s.retargetT = 2; }
        else if (s.target && s.target.kind !== 'target') s.target = null;      // 没威胁 / 还没反应过来：留在护航位置，不自己追出去
      }
    }
    // 2. 巡航队形：交战判据成立 → 解散
    if (s.fm) {
      var t = s.target, engaged = (t && t.alive && t.kind !== 'target' && M3.dist(a.pos, t.pos) < $.FORM.R_ENGAGE) ||
        a.rwrT > 0 || s.mode === 'evade' || a.hp < a.maxHp * 0.95;
      if (engaged) s.fm = null;
    }
    // 3. 脱离干扰区
    if (s.jamCd > 0) s.jamCd -= dt;
    if (a.suppressed > $.JAM.THRESH && s.jammer && s.jammer.alive && s.role !== 'drone') {   // 无人僚机不得自己脱离编队
      s.jamT = (s.jamT || 0) + dt;
      if (s.jamT > $.JAM.T && !(s.jamCd > 0) && s.mode !== 'evade' && s.mode !== 'retreat' && s.mode !== 'psm') {
        s.mode = 'extend'; s.modeT = $.JAM.ESCAPE_S; s.jamAway = s.jammer; s.jamT = 0;
      }
    } else { s.jamT = 0; if (s.mode !== 'extend') s.jamAway = null; }
    /* 脱离只为出干扰区：压制一松（< THRESH 一半）就结束，不必飞满时间；结束后 JAM.CD 秒内不再触发，免得反复一路飞远 */
    if (s.mode === 'extend' && s.jamAway && s.modeT > 0 && a.suppressed < $.JAM.THRESH * 0.5) { s.modeT = 0; s.jamCd = $.JAM.CD; }
    // 4. 友军呼救（只有我方 AI）
    if (a.team === 0 && !a.isPlayer && s.role !== 'drone') {
      var bitten = false;
      for (i = 0; i < world.actors.length; i++) {
        var e = world.actors[i];
        if (!e.alive || !Ent.hostile(e, a) || e.target !== a || e.kind === 'target') continue;
        var d = M3.dist(e.pos, a.pos);
        if (d < $.HELP.REAR_R && M3.dot(a.fwd, M3.mul(M3.sub(e.pos, a.pos), 1 / Math.max(1, d))) < -0.4) { bitten = true; break; }
      }
      if (bitten || a.hp < a.maxHp * $.HELP.HP) {
        if (!(s.helpT > 0)) { s.helpT = $.HELP.T; Chatter.emit(world, 'help', a); }
        else s.helpT = Math.max(s.helpT, 2);
      }
    }
  };
})(AI);
