/* ============================================================
   resupply.js —— 整备点（docs/POST2-0IMPL.md 批次 4.2）

   关卡声明 mission.resupply = [ 条目… ]，条目二选一：
     { ref, r, hold, swap, … }     单位整备点：ref 指 world.refs 里的单位（spawnShip / spawnPlatform
                                   的 o.ref），必须是 team 0 且带 resupply 标签；
                                   水平距离进到 r 以内驻留 hold 秒 → 整备
     { edge, hold, swap, … }       界外整备区：edge = '+x' | '-x' | '+z' | '-z'，身处战场那一侧的
                                   警告区或界外区（Arena.inEdge）时驻留 hold 秒 → 整备；
                                   整备区内不触发越界渐黑（见 suppressesArena）
   共有的可选字段：
     swap     true 弹出重选挂载界面；false 直接补满（缺省 false）
     uses     可用次数。**缺省无限**（整备区默认都是无限的）；写数字才会耗尽（耗尽后状态 empty）
     reset    补给结束后飞机的位置，缺省 'keep'（不改动）：
                'keep'               不动（位置、朝向、速度都不变）
                'runway'             单位整备点（航母）：放到该舰甲板跑道的末端、刚离舰的样子；
                                     舰的数据 ship.runways 有多条时随机取一条
                'inward'             界外整备区：同一位置，机头正背对界外、平飞
                { pos:[x,z], y, heading, speed }   自定义：世界坐标；heading 是度（0 = +z、90 = +x）；
                                     缺的字段保持不变
     npcDelay NPC 触发整备后过多少秒从战场消失（缺省 3）
     npcAway  消失后再过多少秒在重置位置出现（缺省 4）

   玩家：驻留满 hold 秒 → update 返回 { open: 条目 } → Game 弹界面 / 直接补满 → refill + reset。
   NPC（team 0 的 AI 飞机，**不含玩家的僚机**）：进入范围、**并且**处于需要补给的状态（弹药不足一半 /
     机炮不足三成 / 血量低于六成）时触发；不用驻留。过 npcDelay 秒后**从 world.actors 摘出**（alive 仍为 true，
     所以不触发"僚机损失"），再过 npcAway 秒补满、套用 reset、放回 world.actors。开局就在范围里的 NPC 要先离开一次才会触发。
   **僚机—长机关系**（不限于玩家）：有长机的飞机是僚机（a.ai.leader；没写 leader 的 role wingman / drone 默认
   跟玩家）。僚机**不会自主触发**整备——它们不会自己进入补给状态；而是在**长机**整备完成时一起补满
   （Resupply.squadRearm），不管它们离得多远。长机可以是玩家，也可以是 NPC（NPC 长机在重新出现的那一刻
   触发它的僚机），以后 NPC 有了自己的僚机，同一套机制直接适用：
       reset 'runway'（航母 / 机场）  立刻从战场消失，过 npcAway 秒后照常从跑道末端出现（出口间隔 ≥ LAUNCH_GAP）
       reset 'inward' / 自定义        立刻补满，并重置到跟随玩家的默认阵型位置（ai.formation 的槽位，同航向同速度）
       reset 'keep'（缺省）            立刻补满，原地不动

     Resupply.init(world, mission)        开局（mission.spawn 之后）：解析引用，建 world.resupply
     Resupply.update(world, p, dt)        每帧：NPC 周期、玩家计时 / 状态；返回 null 或事件 { open } / { hint }
     Resupply.suppressesArena(world, p)   玩家是否在界外整备区里（Game 据此暂停越界渐黑）
     Resupply.refill(p, ac, lo)           把玩家补到开局状态
     Resupply.resetPose(world, e, a)      按条目的 reset 算出位姿 { x, y, z, fwd, speed } 或 null（keep）
     Resupply.applyPose(a, pose)          把位姿落到飞机上（位置 / 朝向平飞 / 速度 / 控制量清零）
     Resupply.launched(world, e)          记一次"放出"（同一出口的 NPC 会错开 LAUNCH_GAP 秒）
     Resupply.leaderOf(world, a)          飞机 a 的长机（没有就是 null）
     Resupply.wingmenOf(world, leader)    长机的僚机（在场的；已在离场周期里的不算）
     Resupply.squadRearm(world, e, leader) 长机整备完成后，让它的僚机一同补给（见上）
     Resupply.validate(mission, world)    声明检查（探针用）：返回错误串数组

   world.resupply = { entries, status, away } ；status = { kind, … } 给 HUD 只读：
     none | near { dist } | hold { t, hold, edge } | busy | empty | open
   整备中的暂停由 Game 的 rearmOpen 标志负责（主循环不进 update），这里不管。
   只在函数体内引用 Ent / Loadout / WEAPONS / Arena / M3，所以加载期顺序无所谓。
   台词 / 跑道的随机用私有 LCG，不碰 Math.random。
   ============================================================ */
'use strict';

var Resupply = (function () {
  var NEAR_K = 3;             // 3 × r 以内开始显示距离
  var EVADE_R = 6000;         // 来袭导弹进到这个距离，拒绝开始整备（防止拿它当暂停键躲导弹）
  var BASE_FLARES = 80;       // 开局干扰弹基数（makeAircraft 的缺省）；吊舱加成由 Loadout.apply 另加
  var NPC_DELAY = 3;          // 触发后多久消失（s）
  var NPC_AWAY = 4;           // 消失后多久重新出现（s）
  var LAUNCH_GAP = 2;         // 同一个出口两次"放出"的最小间隔（s），免得两架叠在同一点
  var EDGE_GRACE = 15;        // 界外整备完之后的宽限（s）：这段时间内整备区里仍不渐黑，给深入界外的玩家掉头的时间
  var RUNWAY_CLEAR = 8;       // 跑道末端：离甲板多高（m）
  var RUNWAY_PITCH = 0.07;    // 跑道末端：刚离舰的爬升角（rad）
  var LAUNCH_K = 1.4;         // 放出时的速度 = LAUNCH_K × 失速速度（不会一出来就失速）

  var seed = 1;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

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
        uses: d.uses === undefined ? Infinity : d.uses,   // 剩余次数；缺省无限
        t: 0,                   // 驻留计时
        armed: true,            // 整备完要先离开范围才能再次开始（否则站着不动就连续整备）
        graceT: 0,              // 界外整备完之后的宽限计时
        lastLaunchT: -99,
        hinted: false
      });
    }
    world.resupply = { entries: entries, status: { kind: 'none' }, away: [] };
    world.rearmCount = 0;
    // 开局状态当基线：补满就是补回这个（干扰弹数、机炮弹数）。mission.spawn 之后调，所以僚机都是满的
    for (var j = 0; j < world.actors.length; j++) {
      var a = world.actors[j];
      if (a.team === 0 && !a.isPlayer && a.ai) ensureRs(a);
    }
  }

  function ensureRs(a) {
    if (!a.rs) a.rs = { base: { flares: a.flares, gunAmmo: a.gunAmmo }, armed: [], cyc: null };
    return a.rs;
  }

  /* 僚机—长机关系：显式的 ai.leader 优先；没写的 role wingman / drone 是老式的玩家僚机，默认跟玩家。 */
  function leaderOf(world, a) {
    if (!a.ai) return null;
    if (a.ai.leader) return a.ai.leader;
    if (a.ai.role === 'wingman' || a.ai.role === 'drone') return world.player || null;
    return null;
  }

  /* 长机的僚机：在场的（world.actors 里的）。已经摘出去、在离场周期里的不算。 */
  function wingmenOf(world, leader) {
    var out = [];
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (a !== leader && a.alive && a.team === leader.team && leaderOf(world, a) === leader) out.push(a);
    }
    return out;
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

  /* ============================================================
     补给结束后的位置（reset）
     ============================================================ */
  function levelFwd(yawRad, pitch) {
    var cp = Math.cos(pitch || 0);
    return M3.V(Math.sin(yawRad) * cp, Math.sin(pitch || 0), Math.cos(yawRad) * cp);
  }

  /* 按条目的 reset 算位姿；null = 不改动。a 用来取失速速度 / 当前位置与速度。 */
  function resetPose(world, e, a) {
    var r = e && e.def && e.def.reset;
    if (!r || r === 'keep') return null;
    var vs = Ent.vStallAt(a), spd = Math.max(a.speed || 0, vs * LAUNCH_K);

    if (r === 'runway') {
      var u = e.unit, rw = u && u.ship && u.ship.runways;
      if (!rw || !rw.length) return null;
      var w = rw[Math.floor(rnd() * rw.length) % rw.length];
      var fl = Math.sqrt(u.fwd.x * u.fwd.x + u.fwd.z * u.fwd.z) || 1;
      var fx = u.fwd.x / fl, fz = u.fwd.z / fl;           // 舰的水平朝向
      var rx = fz, rz = -fx;                              // 舰的右舷（cross(up, fwd)）
      var yaw = Math.atan2(fx, fz) + (w.yaw || 0);
      return {
        x: u.pos.x + rx * w.x + fx * w.z,
        y: (u.pos.y || 0) + (w.y || 0) + RUNWAY_CLEAR,
        z: u.pos.z + rz * w.x + fz * w.z,
        fwd: levelFwd(yaw, RUNWAY_PITCH), speed: vs * LAUNCH_K
      };
    }

    if (r === 'inward') {
      var side = e.def.edge;
      if (!side) return null;
      var sg = side.charAt(0) === '-' ? -1 : 1;
      // 外法线 = 这一侧的方向；机头取反（背对界外），平飞
      var ox = side.charAt(1) === 'x' ? sg : 0, oz = side.charAt(1) === 'z' ? sg : 0;
      return { x: a.pos.x, y: a.pos.y, z: a.pos.z, fwd: M3.V(-ox, 0, -oz), speed: spd };
    }

    if (typeof r === 'object') {
      var pose = { x: a.pos.x, y: a.pos.y, z: a.pos.z, fwd: M3.clone(a.fwd), speed: a.speed || spd };
      if (r.pos) { pose.x = r.pos[0]; pose.z = r.pos[1]; }
      if (r.y !== undefined) pose.y = r.y;
      if (r.heading !== undefined) pose.fwd = levelFwd(r.heading * Math.PI / 180, 0);
      if (r.speed !== undefined) pose.speed = r.speed;
      return pose;
    }
    return null;
  }

  function applyPose(a, pose) {
    if (!pose) return;
    a.pos.x = pose.x; a.pos.y = pose.y; a.pos.z = pose.z;
    var B = M3.orthonormalize(pose.fwd, M3.V(0, 1, 0));
    a.fwd = B.fwd; a.up = B.up; a.right = B.right;
    a.speed = pose.speed;
    a.vel = M3.mul(a.fwd, a.speed);
    a.rollRate = 0;
    a.ctrl = { pitch: 0, roll: 0, yaw: 0 };
  }

  function launched(world, e) { if (e) e.lastLaunchT = world.time; }

  /* ============================================================
     NPC：触发 → 延迟消失 → 延迟后在重置位置补满出现
     ============================================================ */
  function needsResupply(a) {
    if (a.hp < a.maxHp * 0.6) return true;
    var lm = a.loadModel;
    if (lm && lm.rounds && lm.rounds.length && a.ammoPool) {
      var cap = 0, cur = 0;
      for (var i = 0; i < lm.rounds.length; i++) { cap += lm.rounds[i].cap; cur += a.ammoPool[lm.rounds[i].wid] || 0; }
      if (cap > 0 && cur < cap * 0.5) return true;
    }
    var b = a.rs && a.rs.base;
    if (b && b.gunAmmo > 0 && a.gunAmmo < b.gunAmmo * 0.3) return true;
    return false;
  }

  /* 从战场摘出去：alive 保持 true（不当成阵亡），但别人不能再看见 / 锁定 / 追它 */
  function vanish(world, a) {
    var i = world.actors.indexOf(a);
    if (i >= 0) world.actors.splice(i, 1);
    for (i = 0; i < world.actors.length; i++) {
      var b = world.actors[i];
      if (b.target === a) b.target = null;
      if (b.ai && b.ai.target === a) { b.ai.target = null; b.ai.retargetT = 0; }
    }
    for (i = 0; i < world.missiles.length; i++) if (world.missiles[i].target === a) world.missiles[i].target = null;
  }

  function refillNpc(a) {
    Ent.rebuildMounts(a);                       // 弹药池 / 发射槽 / 重量模型从零重建（不累加）
    var b = a.rs.base;
    a.hp = a.maxHp; a.gunAmmo = b.gunAmmo; a.flares = b.flares; a.flareCd = 0;
    a.gunHeat = 0; a.firingGun = false;
    a.stall = false; a.psm = null; a.psmRecover = 0; a.psmLevel = false;
    a.target = null;
    if (a.ai) { a.ai.target = null; a.ai.mode = 'pursue'; a.ai.evadeT = 0; a.ai.modeT = 0; a.ai.retargetT = 0; a.ai.flareBurst = 0; }
  }

  function reappear(world, a, e) {
    refillNpc(a);
    applyPose(a, resetPose(world, e, a));        // keep 时 null：原位置、原朝向、原速度
    a.ctrl = { pitch: 0, roll: 0, yaw: 0 };
    world.actors.push(a);
    launched(world, e);
    squadRearm(world, e, a);                     // 它若是长机：僚机一同补给（没有僚机则什么也不发生）
  }

  function npcStep(world, R, dt) {
    var i, k, a, e;
    // 1) 离场中的：计时，到点重新出现（同一出口错开 LAUNCH_GAP）
    for (i = R.away.length - 1; i >= 0; i--) {
      var r = R.away[i];
      r.t += dt;
      if (r.t < r.dur) continue;
      if (world.time - r.entry.lastLaunchT < LAUNCH_GAP) continue;
      R.away.splice(i, 1);
      reappear(world, r.a, r.entry);
    }
    // 2) 在场的我方 NPC：进范围就开始一个周期
    for (i = 0; i < world.actors.length; i++) {
      a = world.actors[i];
      if (!a.alive || a.isPlayer || a.team !== 0 || !a.ai || a.route) continue;
      var rs = ensureRs(a);                         // 第一次见到就记下开局基线（僚机也记：它们整备时要补回这个）
      if (leaderOf(world, a)) continue;             // 僚机不自主整备，跟着长机
      if (rs.cyc) {
        rs.cyc.t += dt;
        var delay = rs.cyc.entry.def.npcDelay === undefined ? NPC_DELAY : rs.cyc.entry.def.npcDelay;
        if (rs.cyc.t >= delay) {
          var away = rs.cyc.entry.def.npcAway === undefined ? NPC_AWAY : rs.cyc.entry.def.npcAway;
          R.away.push({ a: a, entry: rs.cyc.entry, t: 0, dur: away });
          rs.cyc = null;
          vanish(world, a);
          i--;                                   // 数组少了一项
        }
        continue;
      }
      for (k = 0; k < R.entries.length; k++) {
        e = R.entries[k];
        var inR = inRange(world, a, e);
        if (rs.armed[k] === undefined) rs.armed[k] = !inR;     // 开局就在范围里：先要离开一次
        if (!inR) { rs.armed[k] = true; continue; }
        if (rs.armed[k] && e.uses > 0 && needsResupply(a)) {
          rs.armed[k] = false;
          e.uses--;
          rs.cyc = { entry: e, t: 0 };
          break;
        }
      }
    }
  }

  /* 跟随长机的默认阵型位置：长机身后 / 侧后的槽位（ai.formation = { dx 右, dy 上, dz 前 }），同航向同速度 */
  function formationPose(leader, a) {
    var s = (a.ai && a.ai.formation) || (a.ai && a.ai.role === 'drone' ? { dx: 140, dy: 25, dz: -190 } : { dx: 120, dy: 30, dz: -180 });
    var pos = M3.add(leader.pos, M3.add(M3.mul(leader.right, s.dx), M3.add(M3.mul(leader.fwd, s.dz), M3.V(0, s.dy, 0))));
    return { x: pos.x, y: pos.y, z: pos.z, fwd: M3.clone(leader.fwd), speed: leader.speed };
  }

  /* 长机整备完成（reset 已套用）后调：它的僚机一同补给，不管离得多远。
       runway   立刻从战场消失，npcAway 秒后照常从跑道末端出现
       formation（inward / 自定义）立刻补满，并回到跟随长机的阵型位置
       keep     立刻补满，原地不动 */
  function squadRearm(world, e, leader) {
    var R = world.resupply;
    if (!R || !e || !leader) return;
    var rs = e.def.reset;
    var mode = rs === 'runway' ? 'runway' : (rs === 'inward' || (rs && typeof rs === 'object')) ? 'formation' : 'keep';
    var away = e.def.npcAway === undefined ? NPC_AWAY : e.def.npcAway;
    var wings = wingmenOf(world, leader);
    for (var k = 0; k < wings.length; k++) {
      var a = wings[k];
      ensureRs(a);
      if (mode === 'runway') {
        vanish(world, a);
        R.away.push({ a: a, entry: e, t: 0, dur: away });
      } else {
        refillNpc(a);
        if (mode === 'formation') applyPose(a, formationPose(leader, a));
      }
    }
  }

  /* ============================================================
     每帧
     ============================================================ */
  function update(world, p, dt) {
    var R = world.resupply;
    if (!R || !R.entries.length) return null;
    var st = { kind: 'none' }, ev = null, i, e;
    R.status = st;
    npcStep(world, R, dt);
    for (i = 0; i < R.entries.length; i++) if (R.entries[i].graceT > 0) R.entries[i].graceT -= dt;
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
          if (e.def.edge) e.graceT = EDGE_GRACE;
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

  /* 玩家正处在界外整备区里，且这个整备区"还在服务"：越界渐黑暂停。
     服务 = 还有次数，并且（还没整备过——驻留计时在走，或刚整备完的宽限期内）。
     整备完又赖在界外不走，宽限一过就照常渐黑，所以它不是"躲在界外永远安全"。 */
  function suppressesArena(world, p) {
    var R = world.resupply;
    if (!R || !p) return false;
    for (var i = 0; i < R.entries.length; i++) {
      var e = R.entries[i];
      if (e.def.edge && e.uses > 0 && (e.armed || e.graceT > 0) && Arena.inEdge(world.arenaDef, p.pos, e.def.edge)) return true;
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

  /** 声明检查（探针用）：每条的字段、引用、标签、reset */
  function validate(mission, world) {
    var bad = [], list = mission.resupply;
    if (!Array.isArray(list) || !list.length) return [mission.id + ' has no resupply'];
    for (var i = 0; i < list.length; i++) {
      var r = list[i], t = null;
      if (!(r.hold > 0) || typeof r.swap !== 'boolean') bad.push(mission.id + ' entry missing hold / swap');
      if (r.uses !== undefined && !(r.uses >= 1)) bad.push(mission.id + ' entry uses must be >= 1 (omit it for unlimited)');
      if (r.ref) {
        t = world.refs[r.ref];
        var tg = t && ((t.ship || t.platform || {}).tags || {});
        if (!t) bad.push(mission.id + ' ref "' + r.ref + '" has no unit');
        else if (t.team !== 0) bad.push(mission.id + ' ref ' + r.ref + ' is not team 0');
        else if (!tg.resupply) bad.push(mission.id + ' ref ' + r.ref + ' lacks the resupply tag');
        if (!(r.r > 0)) bad.push(mission.id + ' ref ' + r.ref + ' missing r');
      } else if (!/^[+-][xz]$/.test(r.edge || '')) bad.push(mission.id + ' entry has neither ref nor a valid edge');
      var rs = r.reset;
      if (rs === undefined || rs === 'keep') continue;
      if (rs === 'runway') {
        if (!r.ref || !t || !t.ship || !t.ship.runways || !t.ship.runways.length) bad.push(mission.id + ' reset runway needs a ref ship with runways');
      } else if (rs === 'inward') {
        if (!r.edge) bad.push(mission.id + ' reset inward needs an edge entry');
      } else if (typeof rs === 'object') {
        if (rs.pos && !(rs.pos.length === 2 && isFinite(rs.pos[0]) && isFinite(rs.pos[1]))) bad.push(mission.id + ' reset.pos must be [x, z]');
      } else bad.push(mission.id + ' unknown reset ' + JSON.stringify(rs));
    }
    return bad;
  }

  return {
    init: init, update: update, suppressesArena: suppressesArena, refill: refill,
    resetPose: resetPose, applyPose: applyPose, launched: launched, leaderOf: leaderOf, wingmenOf: wingmenOf, squadRearm: squadRearm, validate: validate
  };
})();
