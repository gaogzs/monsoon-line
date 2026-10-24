'use strict';

/* ============================================================
   生成器
   ============================================================ */
function spawnEnemy(w, o) {
  /* 用 o.ac 指定机型（AIRCRAFT 表的 id），性能、外形、名称全部取自
     该条目。早先这里把 RO-27 的数值硬编码在函数里，于是换机型
     只是换个名字，飞起来还是同一架。 */
  var acId = o.ac || 'schist';
  var ac = null;
  for (var ai = 0; ai < AIRCRAFT.length; ai++) {
    if (AIRCRAFT[ai].id === acId) { ac = AIRCRAFT[ai]; break; }
  }
  if (!ac) ac = AIRCRAFT[0];

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
    loadout: o.loadout || null
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
  AI.attach(a, { role: 'enemy', skill: o.skill === undefined ? 0.55 : o.skill });
  a.ai.cmd = o.behavior || 'pursue';
  // 护航机不算任务目标：任务简报说的是"测绘编队 5 架"，
  // 把它们算进去会让"剩余 N"对不上
  if (o.escort) a.ai.escort = true;
  a.behavior = o.behavior || 'pursue';
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
    special: 'dl4', loadout: { A: 'dl4', B: 'vbn' },
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

function spawnTarget(w, o) {
  var t = Ent.makeTarget(o);
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
  schist:   { sp: 'dl6', lo: { A: 'dl4', B: 'dl6' } },
  basalt: { sp: 'dl4', lo: { A: 'dl4', B: 'vbn' } },
  sandstone: { sp: 'vbn', lo: { A: 'vbn', B: 'vbn' } }
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
