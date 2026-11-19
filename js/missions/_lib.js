'use strict';

/* ============================================================
   生成器
   ============================================================ */
/* 己方预警机的安全区：敌方单位不得生成在它 AEW_SAFE_R 以内（硬推到圈外），免得开场就被顺手打掉。
   只看出生点；之后的行为由 Director 的预警机目标权重压住（ai/director.js）。 */
var AEW_SAFE_R = 25000;
function awayFromFriendlyAewc(w, o) {
  if ((o.team === undefined ? 1 : o.team) !== 1 || !w.actors) return;
  for (var i = 0; i < w.actors.length; i++) {
    var e = w.actors[i];
    if (!e.aewc || !e.alive || e.team !== 0) continue;
    var dx = o.x - e.pos.x, dz = o.z - e.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d >= AEW_SAFE_R) continue;
    if (d < 1) { dx = 0; dz = 1; d = 1; }
    o.x = e.pos.x + dx / d * AEW_SAFE_R; o.z = e.pos.z + dz / d * AEW_SAFE_R;
  }
}

function spawnEnemy(w, o) {
  awayFromFriendlyAewc(w, o);
  /* o.deck = 带跑道的宿主（舰船 / 平台）：飞机从它的跑道起点弹射起飞（Ent.putOnDeck，见 entities/deck.js）。
     o.runway 指定第几条跑道（缺省取空闲的）。没有空闲跑道返回 null，调用者下一帧再试。 */
  var deckHost = o.deck || null, deckRi = -1;
  if (deckHost) {
    deckRi = Ent.deckSlot(deckHost, o.runway, w.time);
    if (deckRi < 0) return null;
    var dp = Ent.deckPose(deckHost, deckRi);
    o = Object.assign({}, o, { x: dp.pos.x, y: dp.pos.y, z: dp.pos.z, fwd: dp.fwd, speed: 1 });
  }
  /* 用 o.ac 指定机型（AIRCRAFT 表的 id），性能、外形、名称全部取自
     该条目。早先这里把 RO-27 的数值硬编码在函数里，于是换机型
     只是换个名字，飞起来还是同一架。 */
  var acId = o.ac || 'schist';
  var ac = null;
  for (var ai = 0; ai < AIRCRAFT.length; ai++) {
    if (AIRCRAFT[ai].id === acId) { ac = AIRCRAFT[ai]; break; }
  }
  if (!ac) ac = AIRCRAFT[0];

  /* 逐组挂载：对象 { 组id: 武器id }，或该机型 npcLoadouts 里的预设名（字符串）。
     预设名查不到、对象里写了不存在的组 id，都直接抛错 —— 以前写错只会让那一组静默空着。
     下游战斗机（有 npcLoadouts 的机型）如果 special 非空却没有逐组 loadout，
     mountPlan 会把这件弹铺满所有挂得住的组（新挂点开放后槽数翻倍），所以记一条 mountIssue。 */
  var lo = o.loadout || null;
  if (typeof lo === 'string') {
    var preset = ac.npcLoadouts && ac.npcLoadouts[lo];
    if (!preset) throw new Error('spawnEnemy: aircraft ' + ac.id + ' has no loadout preset "' + lo + '"');
    lo = Object.assign({}, preset);
  }
  if (lo) {
    for (var lk in lo) {
      var known = false;
      for (var gk = 0; gk < (ac.hardpointGroups || []).length; gk++) if (ac.hardpointGroups[gk].id === lk) known = true;
      if (!known) throw new Error('spawnEnemy: aircraft ' + ac.id + ' has no hardpoint group "' + lk + '"');
    }
  }
  var specialWid = o.special === undefined ? 'dl6' : o.special;
  if (!lo && specialWid && ac.npcLoadouts) {
    Ent.mountIssues.push('spawnEnemy: ' + ac.id + ' spawned with special=' + specialWid + ' without a per-group loadout (it would fill every hardpoint); use a preset name');
  }

  var a = Ent.makeAircraft({
    type: ac.id,
    /* 默认敌方（team 1）。预警机那类**我方支援单位**要显式传 team: 0 ——
       它不打架，但也不能被自己人当成目标。 */
    team: o.team === undefined ? 1 : o.team,
    x: o.x, y: o.y, z: o.z,
    fwd: o.fwd || M3.V(0, 0, -1),
    speed: o.speed || 300,
    /* 显式传 null = 不带任何制式弹（预警机、轰炸机、播撒机）。
       只有**没写** special 时才退回 dl6 —— 原来用 `||`，null 也被
       换成了 dl6，于是一架没有武器的预警机机翼下挂着两发格斗弹。 */
    special: o.special === undefined ? 'dl6' : o.special,
    throttle: 0.8,
    /* 任务写定的吊舱要一路传到飞机上：它不只是机制（下面那段
       passiveEffects），还要作为**实体挂载**画在挂得住的挂点组上
       （Ent.mountPlan 会把它排在制式弹前面）。 */
    pods: o.pods || null,
    /* 任务写死的逐组挂载，形状与机库配置一样：{ 组id: 武器id }。

       每一条都必须**真的挂得上**：组的 kind 要在武器的适配表里
       （上游弹看 fits，下游弹看 npcFits），机体的 caps 也要满足
       武器的 needs。写错了不会崩 —— 那一组空着，并在 Ent.mountIssues
       里记一条，smoke.js 会断言它是空的。
       `special` 是"当前触发的那件"，AI 开火前会按目标与射程重挑
       （见 ai.js 的开火段），所以它只是默认值 / 兜底。 */
    loadout: lo
  });
  a.model = ac.model;
  a.phys = {
    vMax: ac.phys.vMax, vMil: ac.phys.vMil, vStall: ac.phys.vStall,
    accel: ac.phys.accel, decel: ac.phys.decel,
    pitch: ac.phys.pitch, roll: ac.phys.roll, yaw: ac.phys.yaw,
    hp: ac.phys.hp
  };
  a.maxHp = ac.phys.hp;
  a.hp = ac.phys.hp;
  a.radius = 8;

  /* 名字与呼号是两件事：
       name  —— 机型（ROK-27 片岩）
       label —— 呼号（枯河 DRYRIVER），没有就留空
     之前把两者混成一个字符串，于是 HUD 上冒出了"测绘机 3"这种东西 ——
     那个既不是呼号也不是型号，纯粹是把内部编号漏了出来。 */
  a.name = ac.name + ' ' + ac.cn;
  a.label = o.callsign || null;
  /* 位格：显式 rank > 机型默认 rank > 按 skill 就近映射；skill 缺省取位格缺省值（有 rank 时）否则 0.55 */
  var rank = o.rank || ac.rank || null;
  var skill = o.skill !== undefined ? o.skill : (rank ? RANKS[rank].skill : 0.55);
  if (!rank) rank = rankFromSkill(skill);
  /* 干扰场：关卡显式给 o.jam（随队干扰机，构型视为 recon），或机型数据带 ewField（支援机的大范围干扰场，不改接战构型） */
  var ewf = ac.ewField ? Object.assign({ wid: 'vsc', skill: 0.6, trigK: 1, dur: 30, fadeTo: 0.6, rekey: 3, msg: null, R: ac.ewField.R }, ac.ewField) : null;
  var jam = o.jam ? Object.assign({ wid: a.special || 'vsc', skill: 0.5, trigK: 1, dur: 30, fadeTo: 0.6, rekey: 3, msg: null }, o.jam) : ewf;
  AI.attach(a, { role: o.role || 'enemy', skill: skill, rank: rank, temperament: o.temperament || (o.behavior === 'recon' ? 'steady' : null), ward: o.ward || null, fm: o.fm || null, jam: jam });
  if (!a.ai.temperament) AI.rollTemperament(a, { leader: o.leader, ward: o.ward });   // 保底：关卡没指定性格就随机一个（侦察 / 干扰机构型视为 steady）
  a.rank = rank;
  a.ai.cmd = o.behavior || 'pursue';
  // 护航机不算任务目标：任务简报说的是"测绘编队 5 架"，
  // 把它们算进去会让"剩余 N"对不上
  if (o.escort) a.ai.escort = true;
  a.behavior = o.behavior || (o.jam ? 'recon' : 'pursue');     // 干扰机：受损前不主动接战
  a.wave = o.wave || 0;

  /* 被动吊舱（任务脚本指定，例如下游的 SAV-6「迷雾」）。

     走 Ent.passiveEffects —— 与玩家那套**同源**。在这条路子接通之前，
     敌机不存在任何"抗锁定"能力：他们挂什么吊舱都只是数据表里的一行字。 */
  if (o.pods && o.pods.length) {
    var podList = [];
    for (var pi = 0; pi < o.pods.length; pi++) podList.push({ wid: o.pods[pi], n: 1 });
    var podE = Ent.passiveEffects(podList);
    Ent.setStealth(a, podE);
    a.armor = podE.armor;
    a.flares += podE.flareBonus;
    a.silentLock = podE.silentLock;
    Ent.setEcm(a, podE);
  }

  w.actors.push(a);
  if (deckHost) Ent.putOnDeck(a, deckHost, deckRi);
  return a;
}

/* 友军战斗机（role 'ally'）：玩家一方的自主 AI 战斗机，走与敌机同一套空战 AI（含 Director 的扇区分派、
   不抢人头、外围游走），team 0。o 与 spawnEnemy 相同（ac / loadout / rank / skill / x,y,z / fwd …），
   另可写 leader（僚机—长机关系，整备时跟着长机走）。目前没有关卡使用，仅提供接口。 */
function spawnAlly(w, o) {
  var a = spawnEnemy(w, Object.assign({}, o, { team: 0 }));
  a.ai.role = 'ally';
  a.ai.cmd = 'focus';       // 复用字段，不参与 ally 的判断
  a.behavior = 'ally';
  if (o.leader) a.ai.leader = o.leader;
  return a;
}

/* ============================================================
   轰炸机抵达投弹点

   一大片爆炸，然后伤害记在基地上。它是玩家在第二关唯一
   必须保护的东西 —— 也是"不拦它就得输"这条规则的落点。
   ============================================================ */
function bombTheBase(bomber, w) {
  var base = w.baseTarget;
  if (!base || !base.alive) return;
  for (var i = 0; i < 48; i++) {
    var d = M3.norm(M3.V(M3.rnd(-1, 1), M3.rnd(-0.15, 0.6), M3.rnd(-1, 1)));
    Ent.spawnParticle(w.particles,
      M3.add(base.pos, M3.mul(d, M3.rnd(0, 92))),
      M3.mul(d, M3.rnd(30, 150)),
      M3.rnd(1.4, 3.0), M3.rnd(8, 20),
      (i % 3) ? '#ffb24a' : '#fff2cc',
      { grow: true, drag: 0.9, grav: 0.15 });
  }
  Ent.damage(base, 340, w, bomber, { weapon: null, kind: 'script' });
}

/* 失败原因：在 lose() 返回 true 之前调用，写 w.fail = { key, params }，
   结算页与失败无线电按 key 去 locales/zh-CN/text/fail.json 里取（fail.<key>.reason / .sub / .who / .radio）。
   玩家阵亡不用调它 —— 死因由 Ent.kill 记在 player.deathCause 上。
   用法：if (基地没了) return Mission.fail(w, 'm2.baseLost'); */
var Mission = {
  fail: function (w, key, params) {
    w.fail = { key: key, params: params || {} };
    return true;
  }
};

function spawnWingman(w, idx, slotX, slotY, slotZ) {
  // 僚机是「折翼」级无人僚机（KA-7），不是有人机 ——
  // 这里原来写的是 frigatebird，于是设定里的无人僚机在游戏里飞着有人机。
  var a = Ent.makeAircraft({
    type: 'folded_wing',
    team: 0,
    x: w.player.pos.x + slotX,
    y: w.player.pos.y + slotY,
    z: w.player.pos.z + slotZ,
    fwd: M3.clone(w.player.fwd),
    speed: w.player.speed
    // 挂载不在这里指定：KA-7 的 defaultLoadout（翼下 TOR-3 + 内埋 CLA-4）由 makeAircraft 按组落位
  });
  a.name = CALLSIGN['wing' + idx];
  /* 呼号写进 label：目标框、锁定框都优先读 label，不然会退回到机型名，
     两架无人僚机在屏幕上分不清谁是 VESPER-2、谁是 VESPER-3。 */
  a.label = CALLSIGN['wing' + idx];
  AI.attach(a, {
    // role 用 drone 而不是 wingman：无人机没有判断力，
    // 目标永远来自长机的授权，长机活着时也不自主接战。
    role: 'drone', skill: 0.62,
    leader: w.player,        // 长机 = 玩家（僚机—长机关系，整备时僚机跟着长机一起补给）
    /* 默认指令显式写出来 —— 落在最保守的 focus（只打长机授权的目标）。
       玩家按 1/2/3 才会切到 spread / cover。 */
    cmd: 'focus',
    formation: { dx: slotX, dy: slotY, dz: slotZ }
  });
  a.wingIdx = idx;
  w.actors.push(a);
  w.wings[idx] = a;
  return a;
}

/* 无人机（批次 6.1）：以任意长机（飞机或舰船）为 leader 的无人僚机，team 跟长机。
   与 spawnWingman 的区别：不写 world.wings / wingIdx（那是玩家 1/2/3 命令的接口，敌方无人机收不到玩家命令）；
   机型、挂载、位格可选。leader 死后走编队段的"长机已死：盘旋"分支。
   返回 null = 同队存活无人机已达 MAX_DRONES。
   o：type（机型 id，必填）/ loadout / dx dy dz（相对长机的槽位，缺省取机体系 140, 25, -190）/ skill / cmd / callsign。 */
var MAX_DRONES = 24;      // 同队同时存活的无人机上限（O(n²) 的感知 / 弹道扫描要有预算）
function spawnDrone(w, leader, o) {
  o = o || {};
  var live = 0;
  for (var di = 0; di < w.actors.length; di++) {
    var de = w.actors[di];
    if (de.alive && de.team === leader.team && de.ai && de.ai.role === 'drone') live++;
  }
  if (live >= MAX_DRONES) return null;
  /* o.deck / o.runway：同 spawnEnemy —— 无人机从宿主的跑道起点弹射起飞（leader 与宿主可以是同一艘舰） */
  var deckHost = o.deck || null, deckRi = -1, dpose = null;
  if (deckHost) {
    deckRi = Ent.deckSlot(deckHost, o.runway, w.time);
    if (deckRi < 0) return null;
    dpose = Ent.deckPose(deckHost, deckRi);
  }
  var sl = { dx: o.dx !== undefined ? o.dx : 140, dy: o.dy !== undefined ? o.dy : 25, dz: o.dz !== undefined ? o.dz : -190 };
  var fwd = leader.fwd ? M3.clone(leader.fwd) : M3.V(0, 0, 1);
  var right = M3.norm(M3.V(-fwd.z, 0, fwd.x));      // fwd × up
  var a = Ent.makeAircraft({
    type: o.type,
    team: leader.team,
    x: dpose ? dpose.pos.x : leader.pos.x + right.x * sl.dx + fwd.x * sl.dz,
    y: dpose ? dpose.pos.y : leader.pos.y + sl.dy,
    z: dpose ? dpose.pos.z : leader.pos.z + right.z * sl.dx + fwd.z * sl.dz,
    fwd: dpose ? dpose.fwd : fwd,
    speed: dpose ? 1 : (leader.speed || (leader.vel ? M3.len(leader.vel) : 0) || 250),
    loadout: o.loadout || null
  });
  if (o.callsign) { a.name = o.callsign; a.label = o.callsign; }
  AI.attach(a, {
    role: 'drone', skill: o.skill !== undefined ? o.skill : 0.62,
    leader: leader, cmd: o.cmd || 'focus',
    formation: { dx: sl.dx, dy: sl.dy, dz: sl.dz }
  });
  w.actors.push(a);
  if (deckHost) Ent.putOnDeck(a, deckHost, deckRi);
  return a;
}

/* 无人机航母的机库（批次 6.1b）：每帧由 updateTargets 调用（t.hangar 非空才调）。
   SHIPS[].hangar = { capacity, launchCd, waveSize, stagger, recoverR, recoverAlt, droneType, skill?, cmd?, firstCd? }
   放飞：每 launchCd 秒一波 waveSize 架，波内每隔 stagger 秒从空闲跑道放一架（Ent.deckSlot）；
         机库剩余不足一波则放剩下的。跑道都占着（或达到无人机上限）就下一帧再试。
   回收：弹药池打空或血量 < 35% 的无人机改 recall 命令，飞回舰尾槽位（舰后 240 m），进入 dockR（缺省 400 m）且低于 recoverAlt 后收回：
         alive = false + escaped = true —— killCredit 与友军损失统计都跳过 escaped，不计击毁、不计损失；
         机库计数 +1，再放飞是全新生成（满弹药、满血）。
   舰船被击毁（alive = false）不进这里：在外的无人机按"长机已死：盘旋"处理。
   hold = true 暂停放飞（关卡脚本用）。 */
function tickHangar(t, w, dt) {
  var h = t.hangar, d = t.ship && t.ship.hangar;
  if (!h || !d || !t.alive || t.team === 2) return;
  for (var i = 0; i < w.actors.length; i++) {
    var a = w.actors[i];
    if (!a.alive || !a.ai || a.ai.leader !== t || a.ai.role !== 'drone' || a.deck) continue;
    if (a.ai.cmd !== 'recall') {
      var left = 0;                       // 弹药池总量（spAmmo 要等 AI 第一次选武器才填，不能用它判断）
      for (var wid in a.ammoPool) left += a.ammoPool[wid] || 0;
      if (left <= 0 || a.hp < a.maxHp * 0.35) a.ai.cmd = 'recall';
      continue;
    }
    var dx = a.pos.x - (t.pos.x - t.fwd.x * 240), dz = a.pos.z - (t.pos.z - t.fwd.z * 240);
    var dockR = d.dockR || 400;           // 无人机最低速度远大于舰速，只能绕着舰尾槽位盘旋：半径不能给太小
    if (dx * dx + dz * dz < dockR * dockR && a.pos.y - (t.pos.y || 0) < d.recoverAlt) {
      a.alive = false; a.escaped = true;
      h.count = Math.min(d.capacity, h.count + 1); h.recovered++;
    }
  }
  if (h.cd > 0) h.cd -= dt;
  if (h.pending <= 0 && h.cd <= 0 && h.count > 0 && !h.hold) {
    h.pending = Math.min(d.waveSize, h.count); h.sg = 0; h.cd = d.launchCd;
  }
  if (h.pending > 0) {
    h.sg -= dt;
    if (h.sg <= 0) {
      var k = h.launched;
      var dr = spawnDrone(w, t, {
        type: d.droneType, deck: t, skill: d.skill, cmd: d.cmd,
        dx: ((k % 5) - 2) * 70, dz: -190 - (k % 3) * 40
      });
      if (dr) { h.count--; h.pending--; h.launched++; h.sg = d.stagger; }
    }
  }
}

/* 空中预警机。

   它不是战斗机 —— 用 route 型航线，完全绕开空战 AI（见 ai.js 的
   updateRoute）：不选目标、不规避、不追人，只在两点之间来回盘旋。
   `loiter: true` 就是"永不退场"，击落它是唯一让它消失的方式。

   它**做什么**写在 game.js 的 updateAewc() 里 —— 因为那要用到
   bearing() / setWingCmd() / Radio，那些都在 game.js 的闭包里。 */
/* 随队干扰机的航线：飞到站位点之后在 wp ↔ hold 之间来回盘旋，不退场。

   开机不看时间、不看玩家：**玩家一方任何单位**（我方飞机、僚机、我方舰船 /
   设施）进入 SAV-14 的干扰半径（× trigK），就开机（ai.js 的 updateRoute → jamAuto）。
   一波 dur 秒，强度从 1 慢慢降到 fadeTo（对手在适应，但压不干净）；
   隔 rekey 秒重开，又回到满强度 —— 只要有人在范围里，就一波接一波。
   打掉它是唯一让它闭嘴的办法。
   msg 是第一次开机的无线电，之后每次开机播短句。 */
function jammerRoute(o) {
  return Route.plan([
    { do: 'goto', wp: o.wp, alt: o.alt },
    { do: 'loiter', a: o.wp, b: o.hold, alt: o.alt }
  ], { jam: { wid: 'vsc', skill: 0.5, trigK: 1.0, dur: 30, fadeTo: 0.6, rekey: 3, msg: o.msg } });
}

function spawnAewc(w, o) {
  var a = spawnEnemy(w, {
    ac: o.ac,
    team: o.team === undefined ? 0 : o.team,
    x: o.x, y: o.y, z: o.z,
    fwd: M3.V(0, 0, 1), speed: 220,
    special: null,              // 无武装：预警机是眼睛，不是枪手
    callsign: o.label || null,
    behavior: 'recon'
  });
  a.aewc = true;
  a.bigTarget = true;
  a.radius = 20;
  if (a.ai) a.ai.role = 'support';    // 它不是来打架的
  a.route = { loiter: true, wp: o.a, exit: o.b, alt: o.y, arrive: 2600 };
  return a;
}

/* 冬港。第 3 关与第 10 关是同一个人、同一架飞机 —— 所以只在这里写一次。

   GAL-31「玄武岩」：下游飞得最高的一型（升限 19 000 m），也是那批
   在 15 公里以上飞了半辈子的老兵开的飞机。起始高度压在升限以下 ——
   摆在升限之上，AI 的升限段第一帧就会把他往下压。

   phys 覆盖说的是**人**，不是改装：同一架飞机，在他手里转得比
   资料库那一栏快。早先第 3 关给他一架 ROK-27（升限 15 000 却放在
   21 000 m）、第 10 关给他上游的 D-33 —— 两关是两架不同的飞机，
   其中一架还是对面的。 */
function spawnWinterport(w, o) {
  var ace = spawnEnemy(w, {
    ac: 'basalt',
    x: o.x, y: o.y, z: o.z,
    fwd: M3.V(0, 0, -1), speed: 470,
    special: 'dl4', loadout: 'lead',                 // 王牌：DAR-4 分挂到 A、D 两对重挂点，池不变
    skill: o.skill, callsign: T('missions._lib.spawnWinterport.ace.callsign')
  });
  ace.isAce = true;
  ace.phys = { vMax: 585, vMil: 470, vStall: 128, accel: 32, decel: 34, pitch: 0.66, roll: 3.2, yaw: 0.28, hp: 165 };
  ace.maxHp = 165; ace.hp = 165;
  ace.label = T('missions._lib.spawnWinterport.label.s1');
  ace.bigTarget = true;
  w.ace = ace;
  return ace;
}

/* o.armed === false：这一单位不挂自卫火力（给不想变难的关卡留的开关）。
   TARGETS[model] 带 mounts / launchers 才会挂炮塔；中立单位（team 2）挂了也不开火
   （updateTargets 只让 team !== 2 的目标跑炮塔），所以调节单元不会被武装。 */
function spawnTarget(w, o) {
  var t = Ent.makeTarget(o);
  var d = (typeof TARGETS !== 'undefined' && TARGETS[o.model]) || null;
  if (d && (d.mounts || d.launchers) && o.armed !== false && typeof Turret !== 'undefined') {
    Turret.attach(t, d.mounts, d.launchers);
    if (d.sam && !t.weapon) { t.weapon = d.sam; t.fireCd = M3.rnd(3, 8); }
  }
  w.targets.push(t);
  return t;
}

/* 调节单元阵列。

   分水群岛上空的每一片空域都在调节场底下 —— 不只是高空关：
   玩家在哪一关都能爬到 18 km，爬上去就该看见单元。所以每一关的
   spawn 都调一次这里，单元的样子和数值只写这一份。

   布局照设定：九个一组（3×3），组内间距 10 km；`o.xs` × `o.zs` 是
   各编组中心（按 30 km 一格摆，一组占 20×20 km，组与组之间留 10 km 空当）。
   高度：每组一个基准（18 500–21 000 m），组内再各自浮动 ±500 m。

   中立（team 2）+ friendlyAsset：谁都不能锁它，玩家打坏要扣分。
   不锁任何武器 —— 在它们附近开火全凭玩家自己掂量。 */
var CELL_SPACING = 10000;

function spawnCellField(w, o) {
  w.cells = w.cells || [];
  var groups = [];
  for (var a = 0; a < o.xs.length; a++) {
    for (var b = 0; b < o.zs.length; b++) {
      var g = { x: o.xs[a], z: o.zs[b], y: M3.rnd(18500, 21000) };
      groups.push(g);
      for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
          var c = spawnTarget(w, {
            ttype: 'air', model: 'cell', label: T('missions._lib.spawnCellField.c.label'),
            x: g.x + i * CELL_SPACING + M3.rnd(-300, 300),
            y: g.y + M3.rnd(-500, 500),
            z: g.z + j * CELL_SPACING + M3.rnd(-300, 300),
            hp: 400, radius: 34, drift: 14, big: true, value: 0
          });
          c.friendlyAsset = true;      // 打坏要扣分
          c.team = 2;                  // 中立：双方流弹都可能伤到它，玩家误伤要扣分
          w.cells.push(c);
        }
      }
    }
  }
  return groups;
}

/* 水面舰船。

   数值**不从任务里另抄一份** —— `SHIPS` 表（data.js）已经备好了
   hp / radius / value / label，资料库与单位详情页读的也是它。
   任务里只写"哪条船、在哪、由谁指挥"。

   `o.route` 给了就沿岸线航行（stepTarget 的航路分支），没给就当
   锚泊目标。注意 `SHIPS[].speed` 是**节**，而 route.speed 要米/秒 ——
   这里不替调用方换算，因为航速本来就是任务要做的决定（一条停在
   原地的支援舰和一条 40 节冲过来的快艇是两回事）。 */
/* 无线电 / 文案里点名一条船："抹香鲸级「信风号」"；非海军船退回 label */
function shipName(t) {
  return t.shipClass ? t.shipClass + T('missions._lib.shipName.s1') + t.label + T('missions._lib.shipName.s2') : (t.label || '');
}

function spawnShip(w, o) {
  var s = null;
  for (var i = 0; i < SHIPS.length; i++) {
    if (SHIPS[i].model === o.model) { s = SHIPS[i]; break; }
  }
  if (!s) s = SHIPS[0];

  /* 两支海军的船：第一行舰级（"抹香鲸级"），第二行呼号（"信风号"）。
     callsign 没写就从这一级的名单段（NAVAL_CS_POOL）里按顺序取下一个没用过的。
     其他势力（分水、调节场管理局……）的船照旧用 label。 */
  var csList = NAVAL_CS[s.faction], cs = o.callsign || null;
  if (csList && !cs) {
    var used = w._navCs || (w._navCs = {});
    var pool = (NAVAL_CS_POOL[s.model] || []).concat(NAVAL_CS_POOL['_rest_' + s.faction] || []);
    for (var ci = 0; ci < pool.length; ci++) {
      if (!used[pool[ci]]) { cs = pool[ci]; break; }
    }
  }
  if (cs) (w._navCs || (w._navCs = {}))[cs] = true;

  var t = Ent.makeTarget({
    /* ttype 一律 'ground'：渲染按 MODELS[t.model] 查表，ttype 只影响
       HUD 那一行文案与"受损下沉"分支 —— 舰船不下沉，所以不能写 'air'。 */
    ttype: 'ground',
    model: s.model,
    label: cs || o.label || s.label || s.cn,
    team: o.team === undefined ? 1 : o.team,
    x: o.x, y: o.y === undefined ? 0 : o.y, z: o.z,
    hp: o.hp || s.hp, radius: o.radius || s.radius,
    gunResist: o.gunResist !== undefined ? o.gunResist : (s.gunResist || 0),
    ground: true, big: true,
    value: o.value === undefined ? s.value : o.value,
    drift: o.drift || 0,
    route: o.route || null,
    weapon: o.weapon || null,
    fireCd: o.fireCd === undefined ? M3.rnd(3, 8) : o.fireCd
  });
  t.shipCls = s.cls;      // HUD 锁定框写舰种（makeTarget 只拷它认识的字段，所以在这里补）
  if (csList) t.shipClass = s.hull || (s.cn + T('missions._lib.spawnShip.shipClass.s1'));   // 舰级：锁定框 / 目标框第一行
  t.ship = s;             // 舰船记录：尾流水花要读螺旋桨位置与最大航速（Ent.wakeSpray）
  // 炮位（2-0IMPL 阶段 3）：近防炮、舰炮、遥控炮各自索敌开火
  if ((s.mounts || s.launchers) && typeof Turret !== 'undefined') Turret.attach(t, s.mounts, s.launchers);
  // 舰型专属的齐射节奏（房角石这种弹库舰）：覆盖 Turret.attach 按备弹算出来的缺省值
  if (s.salvo && t.turrets) { t.salvoN = s.salvo.n; t.salvoGap = s.salvo.gap; }
  /* o.ssmK：这一关里反舰弹备弹的比例（满弹 = 1）。关卡按节奏调，不改 SHIP_LAUNCHERS 本身。
     o.ssmStagger：每个发射架的首发时间在 0 ~ 这么多秒里随机错开 —— 否则开场所有架子同时就绪，
     第一帧就是一次全舰队齐射，近防直接饱和 */
  if ((o.ssmK !== undefined || o.ssmStagger) && t.turrets) {
    for (var k = 0; k < t.turrets.length; k++) {
      var tu = t.turrets[k];
      if (tu.gun.kind !== 'launcher' || tu.gun.cued) continue;
      if (o.ssmK !== undefined && tu.ammo > 0) tu.ammo = Math.max(1, Math.round(tu.ammo * o.ssmK));
      if (o.ssmStagger) tu.cd = M3.rnd(0, o.ssmStagger);
    }
  }
  /* 机库（SHIPS[].hangar）：count = 机库里还有几架；o.hangarCount 改开局数量，o.hangar === false 关掉自动放飞 */
  if (s.hangar && o.hangar !== false) {
    t.hangar = { count: o.hangarCount !== undefined ? o.hangarCount : s.hangar.capacity,
      cd: s.hangar.firstCd !== undefined ? s.hangar.firstCd : 6, pending: 0, sg: 0, launched: 0, recovered: 0, hold: false };
  }
  if (o.ref) (w.refs || (w.refs = {}))[o.ref] = t;     // 关卡按 ref 引用本单位（mission.resupply）
  w.targets.push(t);
  return t;
}

/* 固定式海上平台（2-0IMPL 4.9）。o = { platform: 'sluice', x, z（或 pos: [x, z]）, yaw, team, hp, weapon, fireCd }。
   和 spawnShip 同一条路：Ent.makeTarget + 炮位 / 发射器；不走航线、不发水花。
   有舰空弹发射器的平台（PLATFORMS[].sam）默认把那种弹落到 t.weapon，由 updateTargets 按发现规则开火。
   被击毁后不移除：game.js 改画 <model>_wreck、往下沉一截、上层冒火冒烟。 */
function spawnPlatform(w, o) {
  var s = null;
  for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].id === o.platform) { s = PLATFORMS[i]; break; }
  if (!s) s = PLATFORMS[0];
  var x = o.pos ? o.pos[0] : o.x, z = o.pos ? o.pos[1] : o.z, yaw = o.yaw || 0;
  var t = Ent.makeTarget({
    ttype: 'ground', model: s.model,
    label: o.label || s.label,
    team: o.team === undefined ? (s.neutral ? 2 : 1) : o.team,
    x: x, y: 0, z: z,
    fwd: M3.V(Math.sin(yaw), 0, Math.cos(yaw)),
    hp: o.hp || s.hp, radius: o.radius || s.radius,
    gunResist: o.gunResist !== undefined ? o.gunResist : (s.gunResist || 0),
    ground: true, big: true,
    value: o.value === undefined ? s.value : o.value,
    weapon: o.weapon || s.sam || null,
    fireCd: o.fireCd === undefined ? M3.rnd(3, 8) : o.fireCd
  });
  t.platform = s;
  t.shipCls = s.cls;      // 锁定框写"海上平台 · 类型"（hud.js）
  if ((s.mounts || s.launchers) && typeof Turret !== 'undefined') Turret.attach(t, s.mounts, s.launchers);
  if (o.ref) (w.refs || (w.refs = {}))[o.ref] = t;
  w.targets.push(t);
  return t;
}

/* ============================================================
   任务 11 · 第四周（随机遭遇）

   第二场战役的唯一一关：每次进入随机刷新一批战机敌人，
   打完即胜、可反复刷。背景见 CAMPAIGNS 里 cmp2 的 desc。

   随机在 spawn() 里**一次做完**，tick() 只读队列 —— 逐帧掷骰
   会让目标数抖动，也会让冒烟测试不可复现。
   ============================================================ */
/* 第四周的下游机型 → 制式挂载（全是下游弹） */
/* 一批次内的呼号分队：每队机型各不相同（最多 4 架），队内编号从 1 起；
   单机直接用单词。base 是这一批用的小队词在池中的起始下标。 */
function batchCallsigns(list, base) {
  var squads = [], i, j, m, s;
  for (i = 0; i < list.length; i++) {
    m = list[i]; s = null;
    for (j = 0; j < squads.length; j++) {
      if (squads[j].members.length < 4 && squads[j].types.indexOf(m.ac) < 0) { s = squads[j]; break; }
    }
    if (!s) { s = { idx: base + squads.length, members: [], types: [] }; squads.push(s); }
    s.members.push(m); s.types.push(m.ac);
  }
  for (i = 0; i < squads.length; i++) {
    s = squads[i];
    for (j = 0; j < s.members.length; j++) {
      s.members[j].cs = s.members.length === 1
        ? downstreamCallsign(s.idx)
        : squadCallsign(s.idx, j + 1);
    }
  }
}

var SK_FITS = {
  schist:   { sp: 'dl6', lo: 'capMix' },
  basalt: { sp: 'dl4', lo: 'cap' },
  sandstone: { sp: 'vbn', lo: 'escort' }
};

/* ============================================================
   任务 11 · 舷对舷（舰队对决，2-0IMPL 4.11）
   双方各一支水面编队从射程外对向接近，进入射程后边打边靠近，
   在相距约 9 km 处停下（不贴脸）。敌舰全沉即胜，我方旗舰沉没即败。
   剧情：接 m10（登陆窗口）—— 船团没能靠岸，下游把弹库舰房角石派了出来，
   想一次齐射打掉上游的水面编队；它沉了以后，下游只剩 m12（指挥所）那条邓氏鱼指挥舰。
   旗舰受损到 75 / 50 / 25% 时报告。
   ============================================================ */
var M11_FLAG_MARKS = [0.75, 0.5, 0.25];
