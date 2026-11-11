/* ============================================================
   resupply.js —— 整备点（docs/POST2-0IMPL.md 批次 4.2）

   关卡声明 mission.resupply = [ 条目… ]，条目二选一：
     { ref, r, hold, uses, swap }   单位整备点：ref 指 world.refs 里的单位（spawnShip / spawnPlatform
                                    的 o.ref），必须是 team 0 且带 resupply 标签；
                                    玩家水平距离进到 r 以内驻留 hold 秒 → 整备
     { edge, hold, uses, swap }     界外整备区：edge = '+x' | '-x' | '+z' | '-z'，玩家身处战场那一侧的
                                    警告区或界外区（Arena.inEdge）时驻留 hold 秒 → 整备；
                                    整备区内不触发越界渐黑（uses 用完才恢复）
   swap = true 弹出重选挂载界面；false 直接补满。uses 是整备次数。

     Resupply.init(world, mission)        开局（mission.spawn 之后）：解析引用，建 world.resupply
     Resupply.update(world, p, dt)        每帧：计时 / 状态；返回 null 或事件 { open: 条目 } / { hint: 条目 }
     Resupply.suppressesArena(world, p)   玩家是否在还有次数的界外整备区里（Game 据此暂停越界渐黑）
     Resupply.refill(p, ac, lo)           把玩家补到开局状态（弹药 / 机炮 / 干扰弹 / 血量 / 失速与 PSM）
     Resupply.applyNpc(a)                 占位：NPC 整备留给批次 5（需要 Ent.rebuildMounts）
     Resupply.validate(mission, world)    声明检查（探针用）：返回错误串数组

   world.resupply = { entries, status } ；status = { kind, … } 给 HUD 只读：
     none | near { dist } | hold { t, hold, edge } | busy | empty | open
   整备中的暂停由 Game 的 rearmOpen 标志负责（主循环不进 update），这里不管。
   只在函数体内引用 Ent / Loadout / WEAPONS / Arena，所以加载期顺序无所谓。
   ============================================================ */
'use strict';

var Resupply = (function () {
  var NEAR_K = 3;             // 3 × r 以内开始显示距离
  var EVADE_R = 6000;         // 来袭导弹进到这个距离，拒绝开始整备（防止拿它当暂停键躲导弹）
  var BASE_FLARES = 80;       // 开局干扰弹基数（makeAircraft 的缺省）；吊舱加成由 Loadout.apply 另加

  function hdist(a, b) {
    var dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function init(world, mission) {
    var list = (mission && mission.resupply) || [];
    var entries = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      entries.push({
        def: d,
        unit: d.ref ? (world.refs && world.refs[d.ref]) || null : null,
        uses: d.uses,           // 剩余次数
        t: 0,                   // 驻留计时
        armed: true,            // 整备完要先离开范围才能再次开始（否则站着不动就连续整备）
        hinted: false
      });
    }
    world.resupply = { entries: entries, status: { kind: 'none' } };
    world.rearmCount = 0;
  }

  /* 有导弹正在追我、或一枚敌方弹进了 EVADE_R 以内 */
  function threatened(world, p) {
    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.team === p.team) continue;
      if (m.target === p || M3.dist(m.pos, p.pos) < 3000) {
        if (M3.dist(m.pos, p.pos) < EVADE_R) return true;
      }
    }
    return false;
  }

  function inRange(world, p, e) {
    if (e.def.edge) return Arena.inEdge(world.arenaDef, p.pos, e.def.edge);
    var u = e.unit;
    if (!u || !u.alive || u.team !== 0) return false;
    if (e.def.maxAlt && p.pos.y > e.def.maxAlt) return false;
    return hdist(p.pos, u.pos) <= e.def.r;
  }

  function update(world, p, dt) {
    var R = world.resupply;
    if (!R || !R.entries.length) return null;
    var st = { kind: 'none' }, ev = null, i, e;
    R.status = st;
    if (!p || !p.alive) return null;

    var active = null, near = null, nearD = 1e18;
    for (i = 0; i < R.entries.length; i++) {
      e = R.entries[i];
      if (inRange(world, p, e)) { if (!active) active = e; continue; }
      e.armed = true; e.t = 0;            // 出了范围：清计时、重新武装
      if (!e.def.edge && e.uses > 0 && e.unit && e.unit.alive) {
        var d = hdist(p.pos, e.unit.pos);
        if (d <= NEAR_K * e.def.r && d < nearD) { near = e; nearD = d; }
      }
    }

    if (active) {
      e = active;
      if (e.uses <= 0) { e.t = 0; st.kind = 'empty'; }
      else if (!e.armed) { e.t = 0; }                       // 刚整备完，还没离开
      else if (threatened(world, p)) { e.t = 0; st.kind = 'busy'; }
      else {
        if (e.def.edge && !e.hinted) { e.hinted = true; ev = { hint: e }; }
        e.t += dt;
        st.kind = 'hold'; st.t = e.t; st.hold = e.def.hold; st.edge = !!e.def.edge;
        if (e.t >= e.def.hold) {
          e.uses--; e.armed = false; e.t = 0;
          world.rearmCount++;
          st.kind = 'open';
          return { open: e };
        }
      }
    } else if (near) {
      st.kind = 'near'; st.dist = nearD;
    }
    return ev;
  }

  /* 玩家正处在一个还有次数的界外整备区里：越界渐黑暂停（整备的驻留时间比渐黑长得多） */
  function suppressesArena(world, p) {
    var R = world.resupply;
    if (!R || !p) return false;
    for (var i = 0; i < R.entries.length; i++) {
      var e = R.entries[i];
      if (e.def.edge && e.uses > 0 && Arena.inEdge(world.arenaDef, p.pos, e.def.edge)) return true;
    }
    return false;
  }

  /**
   * 把玩家补到开局状态。Loadout.apply 本来就从零重建 ammoPool / slotCd / spAmmo / loadModel /
   * armor / lockRangeK / ecm，所以"补满"不需要新参数；但它对干扰弹是 `+= flareBonus`（累加），
   * 所以调用前先把 flares 复位成基数。
   */
  function refill(p, ac, lo) {
    var wl = Loadout.resolve(ac, lo);
    p.flares = BASE_FLARES;
    Loadout.apply(p, ac, lo, wl);
    p.hp = p.maxHp;
    p.gunAmmo = (ac.gun && WEAPONS[ac.gun]) ? WEAPONS[ac.gun].ammo : 0;
    p.gunHeat = 0; p.firingGun = false;
    p.flareCd = 0;
    // 失速与过失速机动状态
    p.stall = false;
    p.psm = null; p.psmRecover = 0; p.psmLevel = false; p.psmEnd = null;
    return wl;
  }

  /* NPC 整备：批次 5 与撤离一起做（"水平距离入界瞬间补满"，需要先导出 Ent.rebuildMounts） */
  function applyNpc() { /* placeholder */ }

  /** 声明检查（探针用）：每条的字段、引用、标签 */
  function validate(mission, world) {
    var bad = [], list = mission.resupply;
    if (!Array.isArray(list) || !list.length) return [mission.id + ' has no resupply'];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!(r.hold > 0) || !(r.uses >= 1) || typeof r.swap !== 'boolean') bad.push(mission.id + ' entry missing hold / uses / swap');
      if (r.ref) {
        var t = world.refs[r.ref], tg = t && ((t.ship || t.platform || {}).tags || {});
        if (!t) bad.push(mission.id + ' ref "' + r.ref + '" has no unit');
        else if (t.team !== 0) bad.push(mission.id + ' ref ' + r.ref + ' is not team 0');
        else if (!tg.resupply) bad.push(mission.id + ' ref ' + r.ref + ' lacks the resupply tag');
        if (!(r.r > 0)) bad.push(mission.id + ' ref ' + r.ref + ' missing r');
      } else if (!/^[+-][xz]$/.test(r.edge || '')) bad.push(mission.id + ' entry has neither ref nor a valid edge');
    }
    return bad;
  }

  return { init: init, update: update, suppressesArena: suppressesArena, refill: refill, applyNpc: applyNpc, validate: validate };
})();
