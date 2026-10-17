/* ============================================================
   missions.js —— 战役分组、十一关的战场生成与触发器
   ============================================================ */
'use strict';

var MISSIONS = [];

/* ============================================================
   方位约定（axis）

   每一关的战场都按同一种摆法写：玩家在 −z 一侧、机头朝 +z，
   敌方在 +z 一侧。为了让每一关的战线**不是同一条线**，
   世界坐标并不固定指北 —— 每关用 axis 声明"世界 +z 的真方位"（度）：
     axis 180 = 敌人从正南来，玩家背后是北；axis 225 = 敌从西南来……
   设定上上游（公约）在北、下游（同盟）在南，所以多数关卡的 axis 在
   135–225 之间。罗盘、方位报读（game.js bearing()）、简报地图都按它换算；
   物理、AI、触发器仍然只看世界坐标，所以改 axis 不会改变玩法。
   简报文案里的方向词（北 / 西南 / 航向 xxx°）必须按 axis 换算后的真方位写。

   map 里的标记用**世界坐标**，与 spawn 里的数一致；type 'start' 是玩家进入点
   （dir = 世界航向，0 = +z）。地图由 drawMap 旋到北朝上。
   ============================================================ */

/* ============================================================
   战役

   一场战役 = 一组关卡的编组，外加一份"这场仗是什么"的展示文案。
   MISSIONS 仍然是**全局顺序**的权威来源 —— 关卡编号、finish()、
   btnNext 全部按它来；CAMPAIGNS 只负责"把哪几关归到一面旗下"。

   为什么 missions 里存的是**显式下标数组**，而不是 slice 或 length：
   CAMPAIGNS 在这里就定义了，而 MISSIONS 要到文件末尾才填满。
   用动态长度写会得到 0，而且还得依赖脚本内语句的先后顺序。

   加新战役：往下 push 一项，把它的关卡下标接着写进 missions，
   再在文件末尾按同样的全局顺序 MISSIONS.push 那些关卡即可。
   game.js 不用动。

   每关恰好属于一个战役这件事由 preflight() 兜底检查 ——
   漏挂的关卡会在世界里存在、但谁都选不到，是最容易静默发生的一类错误。
   ============================================================ */
var CAMPAIGNS = [];

CAMPAIGNS.push({
  id: 'cmp1',
  no: 'CAMPAIGN 01',
  name: '分水岭行动',
  en: 'WATERSHED',
  sub: 'OPERATION WATERSHED',
  loc: '北纬十二度 · 分水海盆',
  period: '2078.03.14 – 2078.04.25',
  desc: '十六年里，调节场把雨往北推了四公里一个周期。2078 年三月，' +
    '这份偏移量被公开，下游带着四亿人的账北上。上游在分水方向只有一个中队 —— ' +
    '它守不住整条季风线，只能保证飞机还飞得起来。',
  missions: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
});

/* 第二场战役：没有名字的那片空域。
   停火没有条约，只有"第四周"这个说法 —— 它不是一段时间，是一种
   自我安慰的语法：又一周过去了，谁都没承认自己还在打。 */
CAMPAIGNS.push({
  id: 'cmp2',
  no: 'CAMPAIGN 02',
  name: '第四周',
  en: 'THE FOURTH WEEK',
  sub: 'OPERATION NO MAN\u0027S AIR',
  loc: '分水海盆中央 · 编号空白空域',
  period: '2078.05 起 · 无终止日期',
  desc: '双方默认不再往海盆中央派侦察机，也从不宣布那里中立。' +
    '每个还剩油的中队都往那儿派小编队巡逻，谁都不承认自己在找谁。' +
    '停火没人签字，遭遇战每天照常发生。',
  missions: [10]
});


/* ============================================================
   生成器
   ============================================================ */
function spawnEnemy(w, o) {
  /* 用 o.ac 指定机型（AIRCRAFT 表的 id），性能、外形、名称全部取自
     该条目。早先这里把 RO-27 的数值硬编码在函数里，于是换机型
     只是换个名字，飞起来还是同一架。 */
  var acId = o.ac || 'm27';
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
    a.lockResist = podE.lockResist;
    a.armor = podE.armor;
    a.flares += podE.flareBonus;
    a.silentLock = podE.silentLock;
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
  Ent.damage(base, 340, w, bomber);
}

function spawnWingman(w, idx, slotX, slotY, slotZ) {
  // 僚机是「折翼」级无人僚机（KA-7），不是有人机 ——
  // 这里原来写的是 c11，于是设定里的无人僚机在游戏里飞着有人机。
  var a = Ent.makeAircraft({
    type: 'ucav',
    team: 0,
    x: w.player.pos.x + slotX,
    y: w.player.pos.y + slotY,
    z: w.player.pos.z + slotZ,
    fwd: M3.clone(w.player.fwd),
    speed: w.player.speed,
    special: 'v9',
    isDrone: true
  });
  a.name = CALLSIGN['wing' + idx];
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
    ac: 'gal31',
    x: o.x, y: o.y, z: o.z,
    fwd: M3.V(0, 0, -1), speed: 470,
    special: 'dl4', loadout: { A: 'dl4', B: 'vbn' },
    skill: o.skill, callsign: '冬港 WINTERPORT'
  });
  ace.isAce = true;
  ace.phys = { vMax: 585, vMil: 470, vStall: 128, accel: 32, decel: 34, pitch: 0.66, roll: 3.2, yaw: 0.28, hp: 165 };
  ace.maxHp = 165; ace.hp = 165;
  ace.label = 'WINTERPORT · 冬港';
  ace.bigTarget = true;
  w.ace = ace;
  return ace;
}

function spawnTarget(w, o) {
  var t = Ent.makeTarget(o);
  w.targets.push(t);
  return t;
}

/* 水面舰船。

   数值**不从任务里另抄一份** —— `SHIPS` 表（data.js）已经备好了
   hp / radius / value / label，资料库与单位详情页读的也是它。
   任务里只写"哪条船、在哪、由谁指挥"。

   `o.route` 给了就沿岸线航行（stepTarget 的航路分支），没给就当
   锚泊目标。注意 `SHIPS[].speed` 是**节**，而 route.speed 要米/秒 ——
   这里不替调用方换算，因为航速本来就是任务要做的决定（一条停在
   原地的支援舰和一条 40 节冲过来的快艇是两回事）。 */
function spawnShip(w, o) {
  var s = null;
  for (var i = 0; i < SHIPS.length; i++) {
    if (SHIPS[i].model === o.model) { s = SHIPS[i]; break; }
  }
  if (!s) s = SHIPS[0];

  var t = Ent.makeTarget({
    /* ttype 一律 'ground'：渲染按 MODELS[t.model] 查表，ttype 只影响
       HUD 那一行文案与"受损下沉"分支 —— 舰船不下沉，所以不能写 'air'。 */
    ttype: 'ground',
    model: s.model,
    label: o.label || s.label || s.cn,
    team: o.team === undefined ? 1 : o.team,
    x: o.x, y: o.y === undefined ? 0 : o.y, z: o.z,
    hp: o.hp || s.hp, radius: o.radius || s.radius,
    ground: true, big: true,
    value: o.value === undefined ? s.value : o.value,
    drift: o.drift || 0,
    route: o.route || null,
    weapon: o.weapon || null,
    fireCd: o.fireCd === undefined ? M3.rnd(3, 8) : o.fireCd
  });
  w.targets.push(t);
  return t;
}

/* ============================================================
   任务 1 · 第一滴雨
   ============================================================ */
MISSIONS.push({
  id: 'm1',
  no: 'OPERATION 01',
  name: '第一滴雨',
  en: 'FIRST RAIN',
  loc: '分水群岛南侧空域 / 12°04′N 134°11′E',
  date: '2078.03.14 / 0612L',
  altStart: 7600,
  speedStart: 320,
  timeLimit: 0,
  axis: 190,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>三月十一日，调节场的<b>偏移量</b>被公开。三天之后，下游宣布调节场
"是一个未经同意的资源再分配装置"，并开始向分水群岛移动。</p>
<p>今天是三月十四日。第 <b>7 号控制平台</b>的遥测已经断了两天。
平台没被摧毁，是<b>被接管</b>了：站里的人还在，听的是另一条线上的命令。</p>
<p>一小时前，群岛南侧出现了五个没有识别码的回波。飞行剖面规整，
速度慢，挂载古怪。
<span class="cy">不像打击编队，像是在<b>测量</b>什么</span>。</p>
<p>上游公约在分水方向只有一个中队。今天能派出的只有三架飞机。</p>`,

  objectives: [
    '拦截并击落下游测绘编队（5 个目标）',
    '保护 VESPER-2 与 VESPER-3',
    '注意：本空域高度 7000 m 以上，动压充足，正常交战',
    '警告：编队上方有护航，两侧有不明回波'
  ],
  threats: [
    'ROK-27「片岩」×5（侦察构型，自卫为主）',
    'VAC-14「砂岩」护航攻击机 ×2',
    'ROK-27「片岩」×2（带 SAV-6「迷雾」抗锁定吊舱，从高处压下来）',
    'BIN-6「燧火」红外格斗弹 / BIN-9「双生」双导引头格斗弹',
    '无地面防空威胁'
  ],
  intel: `云底 3200 m · 能见度 24 km<br>
    敌编队航向 <b>010°</b>，距离约 <b>22 km</b>，预计 6 分钟后抵达群岛上空<br>
    <span class="am">编队外侧还有一个回波，识别码属于群岛国 —— 不要先开火。</span>`,
  map: [
    { x: 0, z: -2000, type: 'start', label: '起飞点' },
    { x: 0, z: 20000, type: 'enemy', label: '目标编队' },
    { x: 9000, z: 12000, type: 'site', label: '不明回波' },
    { x: -3000, z: 30000, type: 'site', label: '第7号控制平台' }
  ],


  /* ---------------- 战场生成 ---------------- */
  spawn: function (w) {
    var p = w.player;
    /* 战场尺度：起飞点与目标编队之间留出约 22 km。
       中距弹的锁定距离是 8–12 km，把编队摆在 8 km 外等于一进任务
       就直接进包线 —— 没有任何进入段可言。 */
    p.pos = M3.V(0, 7600, -2000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 330;

    spawnWingman(w, 2, -220, 30, -320);
    spawnWingman(w, 3, 220, 30, -320);

    /* 上游预警机 J-2「鹈鹕」—— SEXTANT 的载机。
       你听得到他，战场上也能找到他：在后方 34 km 来回盘旋，
       会被干扰机压哑，也会被打下来。 */
    spawnAewc(w, {
      ac: 'pelican', team: 0, label: 'SEXTANT',
      x: 0, y: 6000, z: -34000,
      a: M3.V(8000, 0, -34000), b: M3.V(-8000, 0, -28000)
    });

    // 五个测绘机组，横队拉宽到 1800 m 间距
    var i, x;
    for (i = 0; i < 5; i++) {
      x = (i - 2) * 1800;
      var e = spawnEnemy(w, {
        x: x, y: 8100, z: 20000,
        fwd: M3.V(0, 0, -1),
        speed: 265,
        special: 'dl6',
        skill: 0.32,
        behavior: 'recon',
        callsign: downstreamCallsign(i)
      });
      e.recon = true;
      e.flee = false;
      e.bigTarget = false;
    }

    /* 两架 VAC-14 护航，拉到队形两翼各 3 km。 */
    for (i = 0; i < 2; i++) {
      spawnEnemy(w, {
        ac: 'vac14',
        x: (i - 0.5) * 5200, y: 8600, z: 20800,
        fwd: M3.V(0, 0, -1),
        speed: 300,
        special: 'vbn',
        skill: 0.40,
        behavior: 'escort',
        escort: true,
        callsign: downstreamCallsign(5 + i),
        wave: 1
      });
    }

    /* 两架 ROK-27「片岩」从高处压下来 —— 这一关的"意外"。

       带 SAV-6「迷雾」吊舱（挂外侧 B 组，格斗弹在内侧 A 组）：玩家会先看到五个缓慢的测绘回波，
       在咬第一个目标时才发现有人从侧后方上来了。
       设定里"他们在测量，不是在打仗"说的是测绘队 —— 而一支测绘队
       从来不需要自己带保镖。 */
    for (i = 0; i < 2; i++) {
      spawnEnemy(w, {
        ac: 'm27',
        x: (i - 0.5) * 3000, y: 10200, z: 23500,
        fwd: M3.V(0, 0, -1), speed: 360,
        special: 'dl6', loadout: { A: 'dl6' },
        pods: ['vzu'],
        skill: 0.62,
        callsign: downstreamCallsign(7 + i),
        wave: 2
      });
    }

    /* 一架群岛国的 XAMSI Mk.2「潮线」在海面附近游荡。

       它不属于任何一方：政变之后，群岛国那几架飞机挂着四面不同的旗。
       它不攻击谁，只是在那里 —— 而"那里"正好是交战空域的边缘。
       `behavior: 'recon'` 让它在满血时不主动接战，与"它不打架"一致
       （受创之后它才会自卫 —— 一支换了三次旗的空军也是这么反应的）。 */
    spawnEnemy(w, {
      ac: 'k8', team: 2,
      x: 9000, y: 4200, z: 12000,
      fwd: M3.V(-1, 0, 0), speed: 240,
      special: 'otr', skill: 0.30,
      behavior: 'recon'
    });

    /* 同一片海面上的群岛国巡逻艇「屿」（屿级 DAPLU），31 米。

       政变之后，「屿」级一共四条，挂着四面不同的旗，其中一条的旗
       被撕掉了一半，一直没人去换。它也是**背景**：退出交战语法，
       玩家锁不到、AI 不认它。 */
    spawnShip(w, {
      model: 'daplu', team: 2, label: '屿 DAPLU',
      x: 14000, z: 6000, hp: 260, weapon: null
    });

    w.objective = '拦截下游测绘编队';
    w.objectiveSub = '剩余 5';
    w.flags.killed = 0;
  },

  /* ---------------- 每帧 ---------------- */
  tick: function (w, dt) {
    var i, alive = 0;
    for (i = 0; i < w.actors.length; i++) {
      var e = w.actors[i];
      if (e.team !== 1 || (e.ai && e.ai.escort)) continue;   // 护航不计入目标
      if (e.alive) alive++;
    }
    w.objectiveSub = '剩余 ' + alive;

    // 被击中后转为逃离
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive || !a.recon) continue;
      if (a.hp < a.maxHp * 0.75 && !a.flee) {
        a.flee = true;
        a.ai.mode = 'extend';
        a.ai.modeT = 60;
        a.ai.role = 'enemy';
      }
      // 测绘机不主动接战
      if (!a.flee) a.firingAllowed = false;
    }

    // 台词触发
    if (!w.flags.tallyDone && w.time > 6) {
      w.flags.tallyDone = true;
      w.radio.play('m1', 'tally');
    }
    var k = 5 - alive;
    if (k >= 1 && !w.flags['k' + k]) {
      w.flags['k' + k] = true;
      if (k === 1) w.radio.play('m1', 'kill1');
      if (k === 2) w.radio.play('m1', 'kill2');
      if (k === 3) w.radio.play('m1', 'kill3');
    }
    if (!w.flags.lowQ && w.player.q < 11 && w.player.pos.y > 15000 && w.time > 20) {
      w.flags.lowQ = true;
      w.radio.play('m1', 'lowQ');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.ai && a.ai.escort) continue;      // 护航机没打掉也能过关
      return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});

/* ============================================================
   任务 2 · 铁砧之下
   ============================================================ */
MISSIONS.push({
  id: 'm2',
  no: 'OPERATION 02',
  name: '铁砧之下',
  en: 'UNDER THE ANVIL',
  loc: '铁砧海域 / 11°48′N 133°52′E',
  date: '2078.03.19 / 0520L',
  altStart: 1400,
  speedStart: 340,
  timeLimit: 0,
  axis: 200,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游在铁砧海域上摆了三个<b>浮空中继平台</b>，把群岛控制平台的信号
中继回南边。它们是下游空情图的眼睛 ——
打掉它们，下游在这片海上的态势感知会退回二十年前。</p>
<p>代价是天气。铁砧海域的云底只有 <b>900 米</b>，
而下游在这片海上部署了四个防空浮台。</p>
<p><span class="am">爬到 1500 米以上，你就会被他们的对空雷达看见。</span>
躲在云下，他们的雷达看不见你。
但你得靠机炮和炸弹把浮空平台打下来，而那些东西在 <b>4000 米</b>。</p>`,

  objectives: [
    '摧毁 3 座「高原」级浮空中继平台',
    '摧毁 2 座海上测控平台',
    '保持在 1500 m 以下可以避开对空雷达（关键）',
    '保护前进基地：基地被毁即任务失败',
    '清除空域内全部敌机（含 ROK-40 轰炸机与 ROK-2 预警机）'
  ],
  threats: [
    'BAD-9「高墙」远程防空导弹（4 个阵地，射程 9 km）',
    'ROK-40「巨砾」轰炸机 ×2（直扑前进基地）',
    '测控平台全毁后：GAL-31「玄武岩」×4 / ROK-27「片岩」×2 从南偏西进场',
    '海面：菊石级（舰空弹）/ 三叶虫级快艇',
    '开阔海面，无遮蔽可用'
  ],
  intel: `云底 <b>900 m</b> · 云顶 3400 m · 中继平台高度 <b>4000 m</b><br>
    对空雷达探测高度下限约 <b>1500 m</b><br>
    防空浮台间距 5 km，存在雷达覆盖缝隙 —— 但很窄`,
  map: [
    { x: 0, z: -16000, type: 'start', label: '进入点' },
    { x: 0, z: -19000, type: 'base', label: '前进基地' },
    { x: -7200, z: 11000, type: 'relay', label: '中继 1' },
    { x: 600, z: 17000, type: 'relay', label: '中继 2' },
    { x: 8200, z: 9600, type: 'relay', label: '中继 3' },
    { x: -6000, z: 4000, type: 'site', label: '测控平台' },
    { x: 6200, z: 6600, type: 'site', label: '测控平台' },
    { x: -9000, z: 1400, type: 'sam', label: 'SAM' },
    { x: 9400, z: 4200, type: 'sam', label: 'SAM' },
    { x: -4400, z: 13000, type: 'sam', label: 'SAM' },
    { x: 8600, z: 15000, type: 'sam', label: 'SAM' }
  ],


  spawn: function (w) {
    var p = w.player;
    /* 这一关整条链条被拉长到约 30 km：进场点在东北端，
       中继网铺在中间，前进基地在你身后。进入段有了，
       而"来不及拦轰炸机"也才真的成立。 */
    p.pos = M3.V(0, 1400, -16000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 340;

    spawnWingman(w, 2, -180, 14, -300);
    spawnWingman(w, 3, 180, 14, -300);

    // 三座浮空中继平台，间距拉到 6–8 km
    var relays = [
      { x: -7200, y: 4000, z: 11000 },
      { x: 600, y: 4000, z: 17000 },
      { x: 8200, y: 4000, z: 9600 }
    ];
    for (var i = 0; i < relays.length; i++) {
      var r = relays[i];
      var t = spawnTarget(w, {
        ttype: 'air', model: 'relay', label: '中继平台 ' + (i + 1),
        x: r.x, y: r.y, z: r.z, hp: 260, radius: 30,
        drift: 9, value: 250, big: true
      });
      t.vital = true;
    }

    // 两座地面测控平台
    var sites = [
      { x: -6000, z: 4000, label: '测控平台 西' },
      { x: 6200, z: 6600, label: '测控平台 东' }
    ];
    for (i = 0; i < sites.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'radar', label: sites[i].label,
        x: sites[i].x, y: 0, z: sites[i].z,
        hp: 200, radius: 10, ground: true, value: 200
      });
    }

    // 四个防空浮台，拉开成一张网
    var sams = [
      { x: -9000, z: 1400 }, { x: 9400, z: 4200 },
      { x: -4400, z: 13000 }, { x: 8600, z: 15000 }
    ];
    for (i = 0; i < sams.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'sam', label: '防空浮台 ' + (i + 1),
        x: sams[i].x, y: 0, z: sams[i].z,
        hp: 90, radius: 5, ground: true,
        fireCd: M3.rnd(3, 8), weapon: 'dl9', value: 150
      });
    }

    /* ---- 我方前进基地：这一关唯一"必须保护"的东西 ----
       一座 96 米级的浮式平台，也是玩家在这片海域的落脚点。 */
    /* team: 0 —— 这是**我方**设施。

       makeTarget 的 team 默认值是 1（敌方），而 cycleTarget 只把
       team === 1 的设施纳入锁定循环；更要紧的是 ai.js 的
       nearestSurfaceTarget 判据是 `t.team === a.team || t.team > 1` ——
       漏写 team: 0 的话，**下游带对地弹的飞机也会把它当目标打**，
       那就不是"基地被轰炸机炸了"，而是"基地被路过的敌机随手拆了"。 */
    var baseT = spawnTarget(w, {
      ttype: 'ground', model: 'station', label: '前进基地 PROGRESS',
      x: 0, y: 0, z: -19000, team: 0,
      hp: 900, radius: 56, ground: true, value: 0
    });
    w.baseTarget = baseT;
    w.baseHpFull = baseT.maxHp;

    /* 护航的虎鲸：上游在这片海域只有两艘驱逐舰，这是其中一艘。
       它不参与走位，只是停在那儿 —— 但这片海域从此不只有浮台。 */
    spawnShip(w, {
      model: 'orca', team: 0, label: '虎鲸 ORCA',
      x: -2600, z: -20000, hp: 900,
      // 32 单元舰空弹垂发（SHIPS 表的 arms）：会替基地打来袭的敌机
      weapon: 'ss6', fireCd: 5
    });

    /* ---- 两架 ROK-40：这一关真正的威胁 ----
       从进入点一侧（东北）进场、投弹、脱离，全程沿航线飞 ——
       不选目标、不追人、不做规避。玩家要么拦住它们，要么看基地被炸。 */
    var bombRun = [
      { x: -3400, z: 13000, ox: -11000, oz: 24000 },
      { x: 4200, z: 13000, ox: 11000, oz: 24000 }
    ];
    for (i = 0; i < bombRun.length; i++) {
      var br = bombRun[i];
      var bmb = spawnEnemy(w, {
        ac: 'rok40',
        x: br.x, y: 4300, z: -14000,
        fwd: M3.V(0, 0, 1), speed: 250,
        special: null, skill: 0.30,        // 弹舱里的东西由 onArrive 结算，不走导弹
        callsign: downstreamCallsign(17 + i)
      });
      bmb.route = {
        phase: 'ingress',
        wp: M3.V(br.x, 0, br.z), alt: 4300, arrive: 3000,
        exit: M3.V(br.ox, 0, br.oz), exitAlt: 6500,
        /* tailGun 目前是**无效配置**：ROK-40 已经没有机炮
           （gun: null），updateRoute 的尾炮段第一句就返回。
           留着它是因为将来若要恢复自卫火力，改的就是这一处。
           原因见 docs/systems/ai.md「已知问题」。 */
        tailGun: 1700,
        onArrive: bombTheBase
      };
      bmb.bigTarget = true;
    }

    /* 下游两艘船在海面上 —— 菊石级巡逻护卫舰与三叶虫级导弹快艇。

       它们不是这一关的目标，是"海面上还有别的船"这件事本身：
       一艘 27 节的护卫舰沿着封锁线来回巡逻，一艘 40 节的快艇
       贴着水面目视接触。菊石带 BAD-9 舰空弹，会向被照到的目标开火；
       三叶虫只有反舰弹和一门遥控炮，没有防空。 */
    spawnShip(w, {
      model: 'ammonite', label: '菊石 AMMONITE',
      x: -9000, z: 22000, hp: 420, weapon: 'dl9',
      route: { wp: [{ x: -9000, z: 22000 }, { x: 9000, z: 22000 }], speed: 14, loop: true }
    });
    spawnShip(w, {
      model: 'trilobite', label: '三叶虫 TRILOBITE',
      x: 12000, z: -2000, hp: 240,
      route: { wp: [{ x: 12000, z: -2000 }, { x: -2000, z: 14000 }], speed: 20, loop: true }
    });

    /* 下游预警机 ROK-2「石英」：它把各自为战的防空阵地
       连成一张空情图。打掉它，伏击就会晚到几分钟。 */
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: '石英 QUARTZ',
      x: 0, y: 8000, z: 26000,
      a: M3.V(8000, 0, 26000), b: M3.V(-8000, 0, 21000)
    });

    w.objective = '摧毁下游中继网络';
    w.objectiveSub = '浮空平台 3 · 控制平台 2 · 基地完好';
    w.flags.ambushDone = false;
    w.dangerAltitude = 1500;
  },

  tick: function (w, dt) {
    var i, relays = 0, sites = 0, sams = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive) continue;
      if (t.model === 'relay') relays++;
      else if (t.model === 'radar') sites++;
      else if (t.model === 'sam') sams++;
    }
    /* 基地血量：这是玩家唯一"必须保护"的东西，所以要一直摆在眼前。
       否则轰炸机投完弹玩家才发现，那就成了"突然失败"。 */
    var basePct = 0;
    if (w.baseTarget && w.baseTarget.alive) {
      basePct = Math.max(0, Math.round(w.baseTarget.hp / w.baseTarget.maxHp * 100));
    }
    w.objectiveSub = '浮空 ' + relays + ' · 地面 ' + sites + ' · 阵地 ' + sams +
      ' · 基地 ' + basePct + '%';

    if (w.baseWarnT > 0) w.baseWarnT -= dt;
    if (w.baseTarget && w.baseTarget.alive) {
      if (w.baseTarget.hp < w.baseTarget.maxHp && !w.flags.baseHit) {
        w.flags.baseHit = true;
        w.radio.play('m2', 'baseHit');
      }
      // 血量过低时反复提醒，但别刷屏
      if (w.baseTarget.hp < w.baseTarget.maxHp * 0.55 &&
        !w.flags.baseLow && w.baseWarnT <= 0) {
        w.flags.baseLow = true;
        w.baseWarnT = 14;
        w.radio.play('m2', 'baseLow');
      }
    } else if (w.baseTarget && !w.baseTarget.alive && !w.flags.baseLost) {
      w.flags.baseLost = true;
      w.radio.play('m2', 'baseLost');
    }

    // 中继平台被打击后触发台词
    if (!w.flags.relayDown && relays < 3 && w.time > 4) {
      w.flags.relayDown = true;
      w.radio.play('m2', 'relayDown');
    }

    // 被雷达照射
    var detected = w.player.pos.y > 1500 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m2', 'spotted');
    }

    // 控制平台全毁 → 触发伏击
    if (sites === 0 && !w.flags.ambushDone) {
      w.flags.ambushDone = true;
      w.radio.play('m2', 'radarDown');
      // 下游截击机从北面进场
      var k;
      /* 三架 GAL-31 打头、两架 ROK-27 跟进、第四架 GAL-31 在高空看着。
         高峰军工制造局的重型截击机专为这种场合造的：
         从高空俯冲下来打一轮中距弹，然后脱离再爬升。 */
      for (k = 0; k < 6; k++) {
        var isHeavy = (k < 3);
        var isHigh = (k === 5);
        var e = spawnEnemy(w, {
          ac: (isHigh || isHeavy) ? 'gal31' : 'm27',
          x: -2200 + k * 900, y: isHigh ? 17500 : (isHeavy ? 7600 : 3200), z: 24000,
          fwd: M3.V(0, 0, -1), speed: isHigh ? 470 : (isHeavy ? 430 : 340),
          special: (isHigh || isHeavy) ? 'dl4' : 'dl6',
          loadout: (isHigh || isHeavy) ? { A: 'dl4', B: 'vbn' } : null,
          skill: k === 0 ? 0.72 : 0.5,
          callsign: downstreamCallsign(5 + k)
        });
        e.wave = 2;
      }
      w.radio.play('m2', 'ambush');
    }
  },

  win: function (w) {
    var i, relays = 0, sites = 0, planes = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive) continue;
      if (t.model === 'relay') relays++;
      else if (t.model === 'radar') sites++;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) planes++;
    }
    // 必须等伏击发生
    if (!w.flags.ambushDone) return false;
    /* 海面上的那两艘巡逻舰不打掉也能收工（它们是这一关的"环境"）；
       空中敌机（含预警机）必须清空 —— 简报目标里写明了这一条。 */
    return relays === 0 && sites === 0 && planes === 0;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    /* 基地没了就算输 —— 哪怕中继网已经拆干净了。
       这是这一关唯一"必须保护"的东西，也是轰炸机存在的全部理由。 */
    if (w.baseTarget && !w.baseTarget.alive) return true;
    return false;
  }
});

/* ============================================================
   任务 3 · 线
   ============================================================ */
MISSIONS.push({
  id: 'm3',
  no: 'OPERATION 03',
  name: '线',
  en: 'THE LINE',
  loc: '分水群岛上空 / 18 000 – 21 000 m',
  date: '2078.03.22 / 0740L',
  altStart: 19500,
  speedStart: 520,
  timeLimit: 0,
  axis: 165,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游不打算把季风线调回原位。他们打算让它<b>哑掉</b>。</p>
<p>八架「灰烬」级播撒机正在往 20 公里高度爬升。
它们携带的不是碘化银，是<b>反凝结核</b> ——
一种能在那一层高度把冰核"吃掉"的化合物。
撒下去，整条季风线会在两个季节里失去响应能力。</p>
<p>在这个高度，空气密度只有海平面的 <b>7.8%</b>。
导弹的舵面几乎失效，可用过载掉到个位数 G；
机炮射程则比低空远出六成。</p>
<p>上游公约派了三架飞机上来。<span class="am">交战规则：调节单元 5 公里内，
对地、反舰弹与炸弹全部锁定 —— 只剩机炮和空空弹。</span></p>
<p>而对面来的那个人，是下游航空军的战役指挥官。
他的呼号不是哪个消失的村庄，是一座还在用水的镇子。</p>`,

  objectives: [
    '击落全部 8 架「灰烬」级播撒机',
    '不得损毁调节单元（DIL-4）',
    '单元 5 km 内对地 / 反舰弹与炸弹锁定 —— 只剩机炮和空空弹',
    '两架以上播撒机降到 14 km 以下即任务失败',
    '清除空域内全部敌机',
    '注意：护航编队四架，另有群岛国巡逻机一架'
  ],
  threats: [
    '「灰烬」级播撒机 ×8（大型、低速、结构脆弱但数量多）',
    'GAL-31「玄武岩」×2（高层）/ ROK-27「片岩」×2（15 km 以下）护航编队',
    'ROK-2「石英」预警机（给整片空域的敌机分配目标）',
    'WINTERPORT「冬港」—— 下游航空军战役指挥官',
    'GAL-44「磁石」随队干扰机（九公里内雷达被压哑）'
  ],
  intel: `高度 <b>19 500 m</b> · 密度 0.095 kg/m³ · 温度 −57 ℃<br>
    在此高度你<b>无法加速</b>，只能靠进入战斗前攒下的能量<br>
    机炮有效射程提升约六成，至 <b>约 2.6 km</b>，但射击窗口极短<br>
    调节单元是中立资产，每个载 <b>340 kg</b> 碘化银 —— 误伤会扣分<br>
    播撒机两排四列，列距 4.5 km —— 一次进入只能处理一个窗口`,
  map: [
    { x: 0, z: -6000, type: 'start', label: '进入点' },
    { x: 0, z: 15000, type: 'relay', label: '播撒机群' },
    { x: 3600, z: 9000, type: 'relay', label: '单元' },
    { x: -3600, z: 9000, type: 'relay', label: '单元' }
  ],


  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 19500, -6000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 520;
    p.throttle = 0.95;
    p.ab = true;

    spawnWingman(w, 2, -190, 30, -300);
    spawnWingman(w, 3, 190, 30, -300);
    w.wings[2].pos.y = 19500;
    w.wings[3].pos.y = 19500;
    w.wings[2].speed = 500;
    w.wings[3].speed = 500;

    // 调节单元阵列：3×3，间距 3600 m（阵列面积约 7×7 km）
    var i, j;
    w.cells = [];
    for (i = -1; i <= 1; i++) {
      for (j = -1; j <= 1; j++) {
        var c = spawnTarget(w, {
          ttype: 'air', model: 'cell', label: '调节单元',
          x: i * 3600, y: M3.rnd(18800, 20200), z: 9000 + j * 3600,
          hp: 400, radius: 34, drift: 14, big: true, value: 0
        });
        c.friendlyAsset = true;      // 打坏要扣分
        c.team = 2;                  // 中立：双方流弹都可能伤到它，玩家误伤要扣分
        w.cells.push(c);
      }
    }

    /* 八架播撒机，两排四列。

       机体是 GAL-31 的改型：下游能把东西送到 19 公里的只有高峰军工
       那一型（升限 19 000 m）。原来用的是 ROK-27（升限 15 000 m），
       摆在 18 900 m 上，AI 的升限段会一直把它往下压 —— 而"降到
       16 000 以下"恰好就是这一关的投放判据。
       不带任何弹：它是运货的，special: null。

       原来六架挤在 3 km 宽的队形里，玩家一个高速通场就能扫掉一半 ——
       拉成 4 列 × 4.5 km 间距之后，每一次进入只能处理一个窗口。 */
    for (i = 0; i < 8; i++) {
      var sx = (i % 4 - 1.5) * 4500;
      var sz = 15000 + Math.floor(i / 4) * 3000;
      var s = spawnEnemy(w, {
        ac: 'gal31',
        x: sx, y: 18600, z: sz,
        fwd: M3.V(0, 0, -1), speed: 210,
        special: null, skill: 0.25,
        behavior: 'recon',
        callsign: downstreamCallsign(9 + i)
      });
      s.recon = true;
      s.model = 'sower';
      s.name = '「灰烬」级播撒机';
      s.phys = { vMax: 280, vMil: 240, vStall: 150, accel: 8, decel: 20, pitch: 0.30, roll: 1.2, yaw: 0.20, hp: 340 };
      s.maxHp = 340; s.hp = 340;
      s.radius = 22;
      s.bigTarget = true;
      s.weaponPod = true;
    }

    /* 下游预警机 ROK-2「石英」。

      它在，下游的中队才像一支军队：由它分配目标、集中火力。
       打掉它，剩下的人就退回各自为战 —— 他们本来也更习惯那样。
       它自己没有任何武器，位置也在战线后方，想打它得先穿过护航。 */
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: '石英 QUARTZ',
      x: 0, y: 9000, z: 21000,
      a: M3.V(6000, 0, 21000), b: M3.V(-6000, 0, 24000)
    });

    /* 下游随队干扰机 GAL-44「磁石」。

       它不空战：沿固定航线飞进来、开机、掉头走 —— 与轰炸机是同一套
       航线机制（`route`），只是到点之后干的事不同。

       开机那一刻，九公里内所有人的雷达一起出雪花：玩家的光点会丢、
       僚机会提示数据链中断、预警机会闭嘴。这就是下游教条里
       "先让对手瞎掉，再打"的那一步 —— 而它自己的位置也因此暴露。 */
    var jammer = spawnEnemy(w, {
      ac: 'gal44',
      x: -9000, y: 11000, z: 21000,
      fwd: M3.V(0, 0, -1), speed: 340,
      special: 'vsc', skill: 0.55,
      // 呼号是村名（设定 8.7）。原来写的「焦炬 TORCH」是它挂的那台吊舱的名字
      callsign: '苦井 BITTERWELL'
    });
    jammer.route = {
      phase: 'ingress',
      wp: M3.V(-6000, 0, 11000), alt: 11000, arrive: 3000,
      exit: M3.V(-12000, 0, 22000), exitAlt: 11000,
      onArrive: function (a, w2) {
        Ent.openEcm(a, 'vsc', 0.5);
        a.spCd = WEAPONS.vsc.cd;
        if (w2 && w2.radio) {
          w2.radio.raw({
            who: a.label || a.name, cls: 'enemy',
            tx: '<i>下游干扰机开机 —— 九公里内全部被压倒。</i>', gap: 0.9
          });
        }
      }
    };

    /* 四架护航，下游的标准搭配：便宜的负责数量，贵的负责质量。

       两架 GAL-31 守在高处（升限 19 000 m，摆在 18–19 km），
       两架 ROK-27 在 15 公里以下托底（它的升限就是 15 000 m）——
       其中一架带 SAV-6 抗锁定吊舱。
       一架群岛国的「浪花」巡逻机在 9 公里处（它的升限是 10 000 m）——
       它不属于下游，但政变之后那座岛上的旗子已经换过三次了。

       每一架的高度都在自己的升限以下：早先 VAC-14（升限 13 000）
       摆在 19 800、浪花摆在 12 000，进场第一帧就被升限段往下压。
       吊舱必须挂在**有 light 或 belly 组**的机型上：SAV-6 的
       npcFits 是 ['light','belly']，ROK-27 挂在 B 组外侧。 */
    var escorts = [
      { ac: 'gal31', x: -6000, y: 18400, sp: 'dl4', loadout: { A: 'dl4', B: 'vbn' }, pod: null, sk: 0.62 },
      { ac: 'gal31', x: 6000, y: 18800, sp: 'dl4', loadout: { A: 'dl4', B: 'vbn' }, pod: null, sk: 0.66 },
      { ac: 'm27', x: -3000, y: 14600, sp: 'dl6', pod: ['vzu'], sk: 0.66 },
      { ac: 'm27', x: 0, y: 14200, sp: 'dl6', loadout: { A: 'dl4', B: 'dl6' }, pod: null, sk: 0.70 },
      { ac: 'spray', team: 2, x: -9000, y: 9200, sp: 'otr', loadout: { A: 'otr' }, pod: null, sk: 0.30 }
    ];
    for (i = 0; i < escorts.length; i++) {
      var es = escorts[i];
      spawnEnemy(w, {
        ac: es.ac,
        team: es.team === undefined ? 1 : es.team,
        x: es.x, y: es.y, z: 13000,
        fwd: M3.V(0, 0, -1),
        /* 不写死 speed：浪花是巡逻机（vMax 340），给它 390 会一直
           骑在包线外。各型按自己的巡航速度进场更省事也更对。 */
        special: es.sp, loadout: es.loadout || null,
        /* 下游的教条是"先让对手瞎掉，再打"（设定集 5.1）——
           编队里永远有一架带干扰吊舱。SAV-6「迷雾」的锁抗让玩家
           更难锁定带它的那一架：想安静地咬它，就得先处理那台吊舱。 */
        pods: es.pod,
        skill: es.sk, callsign: downstreamCallsign(15 + i)
      });
    }

    w.objective = '拦截「灰烬」播撒机群';
    w.objectiveSub = '剩余 8';
    w.roeActive = true;             // 交战规则限制
    w.flags.aceDone = false;
    w.aceSpawned = false;
  },

  tick: function (w, dt) {
    var i, sowers = 0, planes = 0, cellsAlive = 0;

    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team === 1 && a.alive) {
        if (a.model === 'sower') sowers++; else planes++;
      }
    }
    for (i = 0; i < w.targets.length; i++) {
      if (w.targets[i].model === 'cell' && w.targets[i].alive) cellsAlive++;
    }
    w.objectiveSub = '播撒机 ' + sowers + ' · 护航 ' + planes + ' · 单元 ' + cellsAlive;

    // 交战规则：靠近单元时重武器锁定
    var nearCell = false;
    for (i = 0; i < w.cells.length; i++) {
      if (!w.cells[i].alive) continue;
      if (M3.dist(w.cells[i].pos, w.player.pos) < 5000) { nearCell = true; break; }
    }
    w.roeBlocked = nearCell;

    // 播撒机降到 15000 以下开始投放（失败条件）
    for (i = 0; i < w.actors.length; i++) {
      var s = w.actors[i];
      if (s.alive && s.model === 'sower' && s.pos.y < 16000 && !w.flags.dropped) {
        w.flags.dropped = true;
        w.radio.play('m3', 'bossHit');
      }
    }

    // 播撒机少于 4 架 → 冬港进场
    if (!w.aceSpawned && sowers <= 4) {
      w.aceSpawned = true;
      w.radio.play('m3', 'aceAppears');
      spawnWinterport(w, { x: 500, y: 18600, z: 15000, skill: 0.96 });
    }

    // 王牌血量过半 → 阶段二台词
    if (w.ace && w.ace.alive && !w.flags.aceP2 && w.ace.hp < w.ace.maxHp * 0.5) {
      w.flags.aceP2 = true;
      w.radio.play('m3', 'bossPhase2');
      // 冬港开始向下带
      w.ace.ai.mode = 'pursue';
      w.ace.ai.skill = 1.0;
    }

    // 王牌被击落
    if (w.ace && !w.ace.alive && !w.flags.aceKilled) {
      w.flags.aceKilled = true;
      w.radio.play('m3', 'aceKill');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team === 1 && a.alive) return false;
    }
    return true;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    // 播撒机成功投放并脱离
    var i, escaped = 0;
    for (i = 0; i < w.actors.length; i++) {
      var s = w.actors[i];
      if (s.alive && s.model === 'sower' && s.pos.y < 14000) escaped++;
    }
    return escaped >= 2;
  }
});

/* ============================================================
   任务 4 · 空白海域

   战役的性质在这里第一次改变：下游发现打不下来那个中队，
   于是转向让那片海无法使用。舰船是这一关的主角。
   ============================================================ */
MISSIONS.push({
  id: 'm4',
  no: 'OPERATION 04',
  name: '空白海域',
  en: 'OPEN WATER',
  loc: '分水海盆西北 / 12°30′N 132°40′E',
  date: '2078.03.27 / 1430L',
  altStart: 5200,
  speedStart: 360,
  timeLimit: 0,
  axis: 225,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游换了打法。他们不再往调节场上空派飞机 ——
那支中队拦不住，但也不需要拦：<b>只要那片海不能用，天上的人就撑不久。</b></p>
<p>一支水面编队正在分水海盆西北沿封锁线展开：武库舰、巡洋舰、
还有一条不到三百吨的快艇。它们不带伞，只是把反舰弹的发射箱朝向海上。</p>
<p>上游在这片海上没有第二条补给线，只有几条支援船。
<span class="am">它们在编队东北侧，距离交战空域不到 60 公里。</span></p>
<p>海面上还有别人的船 —— 卖设备的、采水样的、架天线的。
它们不属于任何一方，也不会还手。<b>别把它们算进目标里。</b></p>
<p>你的任务是让那支编队无法展开。代价是：从现在开始，
每一次进入低空都会同时进入他们的防空圈与反舰弹包线。</p>`,

  objectives: [
    '摧毁下游水面编队全部舰艇（5 艘）',
    '摧毁 2 座雷达浮台',
    '注意：编队内四型舰艇，房角石级武库舰是核心目标',
    '击落空中的攻击机',
    '海面有海豚级护卫舰在己方一侧 —— 不要误击'
  ],
  threats: [
    '房角石级武库舰（312 个垂发井）',
    '邓氏鱼级巡洋舰 ×1 / 菊石级 ×2',
    '三叶虫级导弹快艇（40 节，贴海机动）',
    'BAD-9「高墙」舰空弹（邓氏鱼与两条菊石，射程 9 km）',
    'ROK-27「片岩」×2（BOX-14「坍方」反舰弹）/ VAC-14「砂岩」×1（TUM-7「碎石」）—— 会去打你的船'
  ],
  intel: `云底 2600 m · 能见度 18 km<br>
    下游编队航向 <b>315°</b>，航速 14–20 节，正在展开成三列<br>
    <span class="am">SPO-22「锚」锁定距离 8.6 km、GUT-9「滑翔锤」只有 6 km —— 两种都得进到舰空弹的 9 km 圈里</span><br>
    对方舰空弹的锁定与被照高度有关 —— 贴海进入可以缩短他们的反应时间`,
  map: [
    { x: 0, z: -18000, type: 'start', label: '进入点' },
    { x: 0, z: 16000, type: 'enemy', label: '武库舰 房角石级' },
    { x: -14000, z: 12000, type: 'enemy', label: '巡洋舰 邓氏鱼级' },
    { x: 13000, z: 13000, type: 'enemy', label: '菊石级' },
    { x: 20000, z: 9000, type: 'enemy', label: '菊石级' },
    { x: -6000, z: 24000, type: 'enemy', label: '快艇' },
    { x: -26000, z: 11000, type: 'sam', label: '雷达浮台' },
    { x: 26000, z: 11000, type: 'sam', label: '雷达浮台' },
    { x: 0, z: -11000, type: 'base', label: '我方护卫舰' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 5200, -18000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 360;

    spawnWingman(w, 2, -200, 20, -300);
    spawnWingman(w, 3, 200, 20, -300);

    /* 下游水面编队 —— 这一关的目标。

       房角石级是核心：312 个垂发井装的是对海齐射，不是防空 ——
       它自己只有两座近防炮（weapon: null）。防空圈是周围画的：
       邓氏鱼与两条菊石都带 BAD-9 舰空弹（SHIPS 表的 arms）。
       想打武库舰，得先穿过它们。 */
    spawnShip(w, {
      model: 'cameroceras', label: '房角石级',
      x: 0, z: 16000, hp: 1800,
      weapon: null
    });
    spawnShip(w, {
      model: 'dunkleosteus', label: '邓氏鱼级',
      x: -14000, z: 12000, hp: 900, weapon: 'dl9', fireCd: 4,
      route: { wp: [{ x: -14000, z: 12000 }, { x: -14000, z: 24000 }], speed: 14, loop: true }
    });
    spawnShip(w, {
      model: 'ammonite', label: '菊石级 A',
      x: 13000, z: 13000, hp: 420, weapon: 'dl9',
      route: { wp: [{ x: 13000, z: 13000 }, { x: 24000, z: 6000 }], speed: 14, loop: true }
    });
    spawnShip(w, {
      model: 'ammonite', label: '菊石级 B',
      x: 20000, z: 9000, hp: 420, weapon: 'dl9'
    });
    spawnShip(w, {
      model: 'trilobite', label: '三叶虫级 A',
      x: -6000, z: 24000, hp: 240,
      route: { wp: [{ x: -6000, z: 24000 }, { x: 12000, z: 26000 }], speed: 20, loop: true }
    });

    // 两座雷达浮台（这片是纯海域，没有"岸"）
    var radars = [
      { x: -26000, z: 11000 }, { x: 26000, z: 11000 }
    ];
    for (var i = 0; i < radars.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'radar', label: '雷达浮台 ' + (i + 1),
        x: radars[i].x, y: 0, z: radars[i].z,
        hp: 220, radius: 10, ground: true, value: 200
      });
    }

    /* 我方护卫舰 —— 海豚级，编队里跑腿的那一条。

       team: 0 必须显式写：漏了的话它会进玩家的锁定循环，
       也会被下游带对地弹的飞机当成目标（ai.js 的面目标判据）。 */
    spawnShip(w, {
      model: 'dolphin', team: 0, label: '海豚 DOLPHIN',
      x: 0, z: -11000, hp: 600, weapon: 'ss6', fireCd: 8   // 舰空弹 ×8：自卫级
    });

    /* 下游的空中掩护：三架，各带一件真的会去炸海面的东西。

       全是下游自己的弹：BOX-14「坍方」反舰弹是重挂专属（npcFits 只有
       heavy），挂在两架 ROK-27 的内侧 A 组；VAC-14 的 A 组挂 TUM-7
       「碎石」、外侧 B 组挂 BIN-9 自卫。早先这里飞的是上游的 DB-11
       与贼鸥，挂的也是上游的 SPO-6 / SPO-22。

       这一关里"海面上有什么"从此是双向的：你打他们的船，
       他们的飞机打你的船。 */
    spawnEnemy(w, {
      ac: 'm27', team: 1,
      x: 8000, y: 6000, z: 22000,
      fwd: M3.V(0, 0, -1), speed: 380,
      special: 'vsr', loadout: { A: 'vsr', B: 'dl6' },
      skill: 0.68,
      callsign: downstreamCallsign(21)
    });
    spawnEnemy(w, {
      ac: 'm27', team: 1,
      x: 11000, y: 5200, z: 24000,
      fwd: M3.V(0, 0, -1), speed: 380,
      special: 'vsr', loadout: { A: 'vsr', B: 'dl6' },
      skill: 0.62,
      callsign: downstreamCallsign(23)
    });
    spawnEnemy(w, {
      ac: 'vac14',
      x: -9000, y: 5500, z: 25000,
      fwd: M3.V(0, 0, -1), speed: 340,
      special: 'vgt', loadout: { A: 'vgt', B: 'vbn' },
      skill: 0.64,
      callsign: downstreamCallsign(22)
    });

    /* 三条不属于任何交战方的船。

       它们不是"中立目标"，是**海面本身**：南回契约的重货船（一个月
       两次，先卸上游的备件再卸下游的传感器）、高纬联合的水文调查船
       （采水、采沉积柱）、环外共同体的观察船（把天线架到尽可能高，
       记录，然后发回去）。

       `team: 2` 让它们退出交战语法：玩家锁不到（cycleTarget 只收 team 1），
       下游带对地弹的飞机也不认它们（ai.js 的 nearestSurfaceTarget 跳过
       team > 1）。这片海上的每一条商船都不该因为挡在编队中间而被顺手打掉。 */
    spawnShip(w, {
      model: 'cross', team: 2, label: '南十字 SOUTHERN CROSS',
      x: -16000, z: -8000, hp: 900, weapon: null,
      route: { wp: [{ x: -16000, z: -8000 }, { x: -24000, z: 6000 }], speed: 10, loop: true }
    });
    spawnShip(w, {
      model: 'icecore', team: 2, label: '冰芯 ICECORE',
      x: 18000, z: -12000, hp: 500, weapon: null,
      route: { wp: [{ x: 18000, z: -12000 }, { x: 8000, z: -18000 }], speed: 8, loop: true }
    });
    spawnShip(w, {
      model: 'atoll', team: 2, label: '环礁 ATOLL',
      x: -20000, z: 20000, hp: 320, weapon: null
    });

    w.objective = '摧毁下游水面编队';
    w.objectiveSub = '敌舰 5 · 雷达 2';
    w.dangerAltitude = 2600;
    w.flags.shipLost = false;
  },

  tick: function (w, dt) {
    var i, ships = 0, radars = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'radar') radars++; else ships++;
    }
    w.objectiveSub = '敌舰 ' + ships + ' · 雷达 ' + radars;

    // 被下游编队雷达照射
    var detected = w.player.pos.y > 2600 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m4', 'spotted');
    }

    // 武库舰挨打 → 台词
    var hub = null;
    for (i = 0; i < w.targets.length; i++) {
      if (w.targets[i].model === 'cameroceras') hub = w.targets[i];
    }
    if (hub && hub.alive && hub.hp < hub.maxHp * 0.6 && !w.flags.hubHit) {
      w.flags.hubHit = true;
      w.radio.play('m4', 'hubHit');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1) return false;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});

/* ============================================================
   任务 5 · 静默的航标

   打"会说话的东西"：雷达、干扰机、预警机。舰体不是目标 ——
   一艘不说话的战舰在空情图上等于不存在。
   ============================================================ */
MISSIONS.push({
  id: 'm5',
  no: 'OPERATION 05',
  name: '静默的航标',
  en: 'SILENT BEACONS',
  loc: '分水海盆南缘 / 11°20′N 133°10′E',
  date: '2078.03.31 / 0410L',
  altStart: 9000,
  speedStart: 400,
  timeLimit: 0,
  axis: 175,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游在群岛南缘重新铺了一张网：三座大型对空雷达、两套远程防空、
一架随队干扰机。它们不说话的时候，那片空域是自由的。</p>
<p>问题是它们从来没有同时沉默过。总有一座在扫、总有一台在压 ——
这就是下游教条的第一句：<b>先让对手瞎掉，再打。</b></p>
<p>管理局的布缆船「准绳」还在那片海面上。它在抢修被切断的光纤，
位置正好在这张网的正中间。<span class="am">它不会躲，也躲不开。</span></p>`,

  objectives: [
    '摧毁 3 座对空雷达站',
    '摧毁 2 套远程防空阵地（BAD-9）',
    '击落 GAL-44 随队干扰机',
    '清除空域内全部敌机（含截击编队与 ROK-40）',
    '保护调节场管理局布缆船「准绳」（误击将失去上游信用）'
  ],
  threats: [
    '对空雷达站 ×3',
    'BAD-9「高墙」远程防空阵地 ×2',
    'GAL-44「磁石」随队干扰机（SAV-14 压制场）',
    'ROK-27 / GAL-31 截击编队',
    'ROK-40「巨砾」×1（防线后方过境，BOX-14 反舰弹）'
  ],
  intel: `云底 <b>1800 m</b> · 能见度 12 km · 低空有碎云<br>
    三座雷达站呈三角布站，覆盖重叠区在中心 —— 那是「准绳」的位置<br>
    SPO-8「追云」打开机中的干扰机伤害 ×2 —— 但它是空空弹，雷达站得用对地弹<br>
    <span class="am">先把干扰机打掉，否则你的雷达光点会一直丢</span>`,
  map: [
    { x: 0, z: -16000, type: 'start', label: '进入点' },
    { x: -9000, z: 12000, type: 'sam', label: '雷达站 1' },
    { x: 9000, z: 12000, type: 'sam', label: '雷达站 2' },
    { x: 0, z: 22000, type: 'sam', label: '雷达站 3' },
    { x: -4000, z: 8000, type: 'relay', label: '准绳 SKORI' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 9000, -16000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 400;

    spawnWingman(w, 2, -220, 24, -320);
    spawnWingman(w, 3, 220, 24, -320);

    // 三座对空雷达站
    var radars = [
      { x: -9000, z: 12000 }, { x: 9000, z: 12000 }, { x: 0, z: 22000 }
    ];
    for (var i = 0; i < radars.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'radar', label: '对空雷达站 ' + (i + 1),
        x: radars[i].x, y: 0, z: radars[i].z,
        hp: 260, radius: 12, ground: true, value: 220
      });
    }

    // 两套远程防空阵地
    var sams = [{ x: -5000, z: 6000 }, { x: 5000, z: 9000 }];
    for (i = 0; i < sams.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'sam', label: '远程防空 ' + (i + 1),
        x: sams[i].x, y: 0, z: sams[i].z,
        hp: 110, radius: 6, ground: true,
        fireCd: M3.rnd(2, 6), weapon: 'dl9', value: 180
      });
    }

    /* 管理局的布缆船「准绳」—— 中立，不能打，也躲不开。

       team: 2，与同属管理局的「标杆」一致：管理局是中立方，不是上游。
       原来写 team: 0，等于把它算成**上游的**船 —— 下游带对面弹的飞机
       会把它当目标（ai.js 的 nearestSurfaceTarget 只跳过 team > 1）。
       team 2 退出交战语法：玩家锁不到，AI 不认它。
       friendlyAsset：玩家误伤要扣分 —— 简报里"误击将失去上游信用"的落点。 */
    var skori = spawnShip(w, {
      model: 'skori', team: 2, label: '准绳 SKORI',
      x: -4000, z: 8000, hp: 700, weapon: null
    });
    skori.friendlyAsset = true;

    /* 下游随队干扰机 GAL-44「磁石」。
       沿航线飞进来、开机、掉头走 —— 与轰炸机是同一套 route 机制。 */
    var jammer = spawnEnemy(w, {
      ac: 'gal44',
      x: -14000, y: 11000, z: 24000,
      fwd: M3.V(0, 0, -1), speed: 340,
      special: 'vsc', skill: 0.55,
      callsign: '旱湾 DRYBAY'
    });
    jammer.route = {
      phase: 'ingress',
      wp: M3.V(-6000, 0, 11000), alt: 11000, arrive: 3000,
      exit: M3.V(-14000, 0, 26000), exitAlt: 11000,
      onArrive: function (a, w2) {
        Ent.openEcm(a, 'vsc', 0.5);
        a.spCd = WEAPONS.vsc.cd;
        if (w2 && w2.radio) {
          w2.radio.raw({
            who: a.label || a.name, cls: 'enemy',
            tx: '<i>下游干扰机开机 —— 九公里内全部被压倒。</i>', gap: 0.9
          });
        }
      }
    };

    // 截击编队
    for (i = 0; i < 3; i++) {
      var heavy = (i === 0);
      spawnEnemy(w, {
        ac: heavy ? 'gal31' : 'm27',
        x: -4000 + i * 4000, y: heavy ? 13000 : 7000, z: 26000,
        fwd: M3.V(0, 0, -1),
        special: heavy ? 'dl4' : 'dl6',
        loadout: heavy ? { A: 'dl4', B: 'vbn' } : null,
        skill: 0.58, callsign: downstreamCallsign(23 + i)
      });
    }

    /* 一架 ROK-40 在防线后方过境，翼下重挂点挂两枚 BOX-14「坍方」。

       它不来找你，也不空战（轰炸机不做规避）：沿航线从网的背后
       横穿过去，目标是网**外面**的上游补给线（不在这张图上），
       到点之后掉头回南边。它是一个**会自己走掉**的机会目标 ——
       赶在它离场前打掉，那两枚弹就不会落到补给船上。
       原来它挂的是上游的 GUT-30，且没有航线，于是被当成战斗机去缠斗。 */
    var cruise = spawnEnemy(w, {
      ac: 'rok40',
      x: 12000, y: 12000, z: 34000,
      fwd: M3.V(-1, 0, 0), speed: 250,
      special: 'vsr', loadout: { B: 'vsr' },
      skill: 0.4, callsign: downstreamCallsign(24)
    });
    cruise.bigTarget = true;
    cruise.route = {
      phase: 'ingress',
      wp: M3.V(-14000, 0, 18000), alt: 12000, arrive: 2500,
      exit: M3.V(-20000, 0, 40000), exitAlt: 12000,
      onArrive: function (a, w2) {
        if (w2 && w2.radio) {
          w2.radio.raw({
            who: 'SEXTANT', cls: 'cmd',
            tx: '<i>巨砾到了投放点，正在掉头 —— 两枚反舰弹往北边的补给线去了。</i>', gap: 0.9
          });
        }
      }
    };

    /* 调节场管理局自己的高空勤务机 MERLI「水准」。

       它不打架：任务是给那些谁也靠不近的调节单元换零件，
       顺路在这片海盆上量几条基准线。它出现在这里的原因很具体 ——
       管理局的设施遍布群岛，而这一关打的就是他们的海域。

       **不挂武器**：它的挂载组只有机腹一个（belly），而机腹挂不了
       任何空空弹（可用的适配都是 tip / light / heavy）—— 这恰好与
       设定里那句"名义上没有武器"一致，也省掉了"AI 拿着不在机翼上的
       弹开火"那种看不见的错误。
       `behavior: 'recon'` 让它在满血时不主动接战（见 ai.js 的开火段）。 */
    spawnEnemy(w, {
      ac: 'a2', team: 2, special: null,   // 显式 null：不拿 spawnEnemy 缺省的 dl6
      x: 14000, y: 11000, z: 26000,
      fwd: M3.V(-1, 0, 0), speed: 260,
      skill: 0.30,
      behavior: 'recon'
    });

    /* 管理局的海洋测量船 DIKLO「标杆」——双体船，正在这片海盆上
       重测锚位。它和「准绳」是同一批船：一个在水下敲，一个在水上量。

       中性：不设 team（默认 1 会被 AI 当敌方设施打），用 team 2 让它
       退出交战语法 —— 玩家锁不到它，AI 也不认它，它只负责在场上。 */
    spawnShip(w, {
      model: 'diklo', team: 2, label: '标杆 DIKLO',
      x: 11000, z: 9000, hp: 700, weapon: null
    });

    w.objective = '压制下游空情网';
    w.objectiveSub = '雷达 3 · 防空 2 · 干扰机 1';
    w.dangerAltitude = 1800;
  },

  tick: function (w, dt) {
    var i, radars = 0, sams = 0, jammers = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'radar') radars++; else if (t.model === 'sam') sams++;
    }
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team === 1 && a.alive && a.ewPower > 0 && a.ecmOn) jammers++;
    }
    w.objectiveSub = '雷达 ' + radars + ' · 防空 ' + sams +
      (jammers ? ' · 干扰中' : ' · 干扰机沉默');

    var detected = w.player.pos.y > 1800 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m5', 'spotted');
    }

    // 雷达站全灭 → 台词
    if (radars === 0 && !w.flags.radarDown) {
      w.flags.radarDown = true;
      w.radio.play('m5', 'radarDown');
    }
  },

  win: function (w) {
    var i, radars = 0, sams = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'radar') radars++; else if (t.model === 'sam') sams++;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return radars === 0 && sams === 0;
  },
  lose: function (w) { return !w.player.alive; }
});

/* ============================================================
   任务 6 · 第二梯队

   下游把压箱底的那批人放进来了：开 GAL-31 的老兵，
   一个在这条高度上飞了半辈子的人才有的编队纪律。
   （早先这里飞的是上游的 F-9 —— 对面的飞机。）
   ============================================================ */
MISSIONS.push({
  id: 'm6',
  no: 'OPERATION 06',
  name: '第二梯队',
  en: 'SECOND ECHELON',
  loc: '分水群岛上空 / 17 000 – 20 000 m',
  date: '2078.04.04 / 0620L',
  altStart: 18000,
  speedStart: 500,
  timeLimit: 0,
  axis: 150,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游的第一梯队打光了。第二梯队是另一批人 ——
他们不抢高度，不在低空缠斗，只是<b>在对你有能量的那层等你</b>。</p>
<p>GAL-31「玄武岩」是为这条高度造的：低空笨得没法看，可它的战场从来不在低空。
开它的是下游压箱底的那批老兵 —— 在 15 公里以上飞了半辈子的人。
他们后面还有一架预警机在调度。</p>
<p><span class="am">在这个高度你没有第二条命：一次失速改出失败，
就是三分钟的下坠。</span></p>`,

  objectives: [
    '击落 GAL-31「玄武岩」老兵编队 ×4',
    '击落 ROK-2「石英」预警机（它在给敌机分配目标）',
    '清除护航的 ROK-27 ×4',
    '保持能量：本空域高度 18 000 m 以上，一次失速就是长时间下坠'
  ],
  threats: [
    'GAL-31「玄武岩」重型截击机 ×4（老兵驾驶）',
    'ROK-2「石英」预警机（30 km 搜敌 + 目标分配）',
    'ROK-27「片岩」×4（两架带 SAV-6 抗锁定吊舱）',
    'DAR-4「砾石」中距弹 / BIN-9「双生」双导引头格斗弹'
  ],
  intel: `高度 <b>18 000 m</b> · 密度 0.12 kg/m³ · 温度 −57 ℃<br>
    GAL-31 的升限 <b>19 000 m</b>，比你高一层 —— 别跟它拼爬升<br>
    预警机在战线后方 35 km，打掉它，敌机就没人分配目标<br>
    <span class="am">同样的空速，这里的动压只有海平面的十分之一 —— 导弹可用过载同样缩水</span>`,
  map: [
    { x: 0, z: -14000, type: 'start', label: '进入点' },
    { x: 0, z: 24000, type: 'enemy', label: '玄武岩编队' },
    { x: 0, z: 32000, type: 'site', label: '石英 QUARTZ' },
    { x: 8000, z: 26000, type: 'enemy', label: '护航' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 18000, -14000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 500;
    p.throttle = 0.95;
    p.ab = true;

    spawnWingman(w, 2, -220, 30, -320);
    spawnWingman(w, 3, 220, 30, -320);
    w.wings[2].pos.y = 18000;
    w.wings[3].pos.y = 18000;
    w.wings[2].speed = 480;
    w.wings[3].speed = 480;

    /* 四架 GAL-31 老兵，两两一组拉开 6 km。

       高度压在升限（19 000 m）以下：17 800–18 700 m，正好比玩家高一层。
       GAL-31 的格斗性能比原来的 F-9 差，所以 skill 比原来各高一点 ——
       这一关难在"人"，与设定一致。 */
    var i;
    for (i = 0; i < 4; i++) {
      var vet = spawnEnemy(w, {
        ac: 'gal31',
        x: -3000 + (i % 2) * 6000, y: 17800 + Math.floor(i / 2) * 900,
        z: 22000 + Math.floor(i / 2) * 4000,
        fwd: M3.V(0, 0, -1),
        special: 'dl4',
        loadout: { A: 'dl4', B: 'vbn' },
        skill: i === 0 ? 0.88 : 0.72,
        callsign: downstreamCallsign(27 + i)
      });
      vet.veteran = true;
    }

    /* 四架 ROK-27 护航，压在自己的升限（15 000 m）以下。
       两架带 SAV-6 —— 下游教条是"编队里永远有一架带干扰吊舱"。 */
    for (i = 0; i < 4; i++) {
      spawnEnemy(w, {
        ac: 'm27',
        x: 3000 + i * 3500, y: 14200 + (i % 2) * 500, z: 26000,
        fwd: M3.V(0, 0, -1),
        special: 'dl6',
        loadout: (i % 2) ? null : { A: 'dl4', B: 'dl6' },
        pods: (i % 2) ? ['vzu'] : null,
        skill: 0.6, callsign: downstreamCallsign(31 + i)
      });
    }

    /* 下游预警机：它在，下游的增援就会准时到。
       位置放得很后（35 km），想打它得先穿过整个敌编队。 */
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: '石英 QUARTZ',
      x: 0, y: 11000, z: 32000,
      a: M3.V(7000, 0, 32000), b: M3.V(-7000, 0, 35000)
    });

    w.objective = '击落下游第二梯队';
    w.objectiveSub = '玄武岩 4 · 护航 4 · 预警机 1';
  },

  tick: function (w, dt) {
    var i, f9 = 0, others = 0;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.veteran) f9++; else others++;
    }
    w.objectiveSub = '玄武岩 ' + f9 + ' · 其余 ' + others;

    if (!w.flags.contact && w.time > 4) {
      w.flags.contact = true;
      w.radio.play('m6', 'contact');
    }
    if (!w.flags.highQ && w.player.q < 14 && w.player.pos.y > 17000 && w.time > 20) {
      w.flags.highQ = true;
      w.radio.play('m6', 'lowQ');
    }
    if (f9 <= 2 && !w.flags.halfDone) {
      w.flags.halfDone = true;
      w.radio.play('m6', 'half');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});

/* ============================================================
   任务 7 · 雾里

   没有夜战渲染，所以"夜里"这件事靠别的东西表达：
   低云、低空、以及"一开机就被看见"的雷达暴露。
   ============================================================ */
MISSIONS.push({
  id: 'm7',
  no: 'OPERATION 07',
  name: '雾里',
  en: 'IN THE FOG',
  loc: '铁砧海域西侧 / 11°55′N 132°20′E',
  date: '2078.04.09 / 2340L',
  altStart: 2200,
  speedStart: 330,
  timeLimit: 0,
  axis: 215,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游的舰船补给点藏在铁砧海域西侧的一层低云下面。
两条登陆舰把弹药与燃油一趟一趟运进来，
外面有一条巡洋舰画着防空圈。</p>
<p>你能做的事只有一件：<b>在云下进去，把船打掉，再出来。</b>
云底不到一千米，而对方舰空弹的锁定距离与高度差有关 ——
你越低，他越难。</p>
<p><span class="am">代价是：干扰机一开，你的雷达光点也会丢。</span></p>`,

  objectives: [
    '摧毁 2 艘 海蝎级登陆舰',
    '击落 GAL-44 干扰机，清除空域内全部敌机',
    '（可选）摧毁 邓氏鱼级巡洋舰（防空圈核心）',
    '尽量保持在 1500 m 以下 —— 雷达暴露意味着被锁定'
  ],
  threats: [
    '邓氏鱼级巡洋舰（舰空弹 ×8，编队旗舰）',
    '海蝎级登陆舰 ×2（武装薄弱、结构脆弱）',
    'GAL-44「磁石」干扰机（SAV-14 压制场）',
    'BAD-9 舰空弹（低空进入可缩短反应时间）'
  ],
  intel: `云底 <b>900 m</b> · 云顶 3400 m · 能见度 6 km<br>
    <span class="am">对空雷达探测下限约 1500 m；在这之下，他们的雷达看不见你</span>`,
  map: [
    { x: 0, z: -14000, type: 'start', label: '进入点' },
    { x: -2000, z: 12000, type: 'enemy', label: '巡洋舰 邓氏鱼级' },
    { x: 8000, z: 16000, type: 'enemy', label: '登陆舰 ×2' },
    { x: -9000, z: 24000, type: 'relay', label: '干扰机' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 2200, -14000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 330;

    spawnWingman(w, 2, -180, 12, -280);
    spawnWingman(w, 3, 180, 12, -280);

    /* 巡洋舰在正面画防空圈 —— 邓氏鱼（邓氏鱼级），下游唯一的巡洋舰。
       原来这里放的是房角石（房角石级），而它是武库舰，不是巡洋舰；
       "96 单元垂发"则是上游抹香鲸的数字。 */
    spawnShip(w, {
      model: 'dunkleosteus', label: '邓氏鱼级',
      x: -2000, z: 12000, hp: 1600,
      route: { wp: [{ x: -2000, z: 12000 }, { x: 6000, z: 14000 }], speed: 13, loop: true },
      weapon: 'dl9', fireCd: 4
    });

    /* 两条登陆舰 —— 这一关的目标。它们武装薄弱，跑得也慢。 */
    spawnShip(w, {
      model: 'seascorpion', label: '海蝎级 A',
      x: 8000, z: 16000, hp: 500,
      route: { wp: [{ x: 8000, z: 16000 }, { x: -2000, z: 18000 }], speed: 9, loop: true }
    });
    spawnShip(w, {
      model: 'seascorpion', label: '海蝎级 B',
      x: 11000, z: 14000, hp: 500,
      route: { wp: [{ x: 11000, z: 14000 }, { x: 2000, z: 12000 }], speed: 9, loop: true }
    });

    // 干扰机
    var jammer = spawnEnemy(w, {
      ac: 'gal44',
      x: -9000, y: 7000, z: 24000,
      fwd: M3.V(0, 0, -1), speed: 320,
      special: 'vsc', skill: 0.5,
      // 「灰烬」是第 3 关播撒机的级名，不能再拿来当呼号
      callsign: '碱滩 SALTFLAT'
    });
    jammer.route = {
      phase: 'ingress',
      wp: M3.V(-6000, 0, 14000), alt: 7000, arrive: 3000,
      exit: M3.V(-12000, 0, 26000), exitAlt: 7000,
      onArrive: function (a, w2) {
        Ent.openEcm(a, 'vsc', 0.5);
        a.spCd = WEAPONS.vsc.cd;
        if (w2 && w2.radio) {
          w2.radio.raw({
            who: a.label || a.name, cls: 'enemy',
            tx: '<i>干扰机开机 —— 云里的光点全糊了。</i>', gap: 0.9
          });
        }
      }
    };

    // 一架夜间巡逻的片岩
    spawnEnemy(w, {
      ac: 'm27',
      x: 14000, y: 5000, z: 20000,
      fwd: M3.V(0, 0, -1), speed: 320,
      special: 'dl6', skill: 0.5,
      callsign: downstreamCallsign(35)
    });

    w.objective = '打断下游的舰船补给';
    w.objectiveSub = '登陆舰 2 · 巡洋舰 1 · 干扰机';
    w.dangerAltitude = 1500;
  },

  tick: function (w, dt) {
    var i, landers = 0, cruisers = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'seascorpion') landers++;
      else cruisers++;
    }
    w.objectiveSub = '登陆舰 ' + landers + ' · 其余 ' + cruisers +
      ' · 高度 ' + Math.round(w.player.pos.y) + ' m';

    var detected = w.player.pos.y > 1500 && w.player.alive;
    w.detected = detected;
    if (detected && !w.flags.spotted) {
      w.flags.spotted = true;
      w.radio.play('m7', 'spotted');
    }
    if (landers === 0 && !w.flags.landersDown) {
      w.flags.landersDown = true;
      w.radio.play('m7', 'landersDown');
    }
  },

  win: function (w) {
    var i, landers = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'seascorpion') landers++;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return landers === 0;
  },
  lose: function (w) { return !w.player.alive; }
});

/* ============================================================
   任务 8 · 燧石

   敌机第一次真的来炸东西：VAC-14 攻击机带着 TUM-7 进场。
   玩家在这一关是替海面上的东西挡弹的人。
   ============================================================ */
MISSIONS.push({
  id: 'm8',
  no: 'OPERATION 08',
  name: '燧石',
  en: 'FLINT',
  loc: '分水海盆北缘 / 13°05′N 134°30′E',
  date: '2078.04.14 / 0815L',
  altStart: 6000,
  speedStart: 380,
  timeLimit: 0,
  axis: 170,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游第 4 战术联队终于等到了他们要的东西：一个能打到上游浮岛的窗口。
浮岛就是那片海上的机场 —— <b>它被打中一次，调节场上空的巡逻就会断一整班。</b></p>
<p>他们来的是攻击机群，不是截击机群。VAC-14「砂岩」在低空排成两条线，
每条线上都挂着对海弹药；后面跟着两架巨砾轰炸机。</p>
<p>你的任务是让他们到不了投放线。<span class="am">得在他们放弹之前拦住。</span></p>`,

  objectives: [
    '击落全部攻击机（VAC-14「砂岩」×5 + ROK-27「片岩」×1）',
    '击落 2 架 ROK-40「巨砾」轰炸机',
    '保护上游编队：浮岛「座头鲸」、巡洋舰「抹香鲸」、支援舰「蓝鲸」（任意一艘被击沉即失败）'
  ],
  threats: [
    'VAC-14「砂岩」攻击机 ×5（TUM-7「碎石」对面弹）/ ROK-27 ×1（BOX-14「坍方」反舰弹）',
    'ROK-40「巨砾」轰炸机 ×2（沿航线进场，在约 9 km 外放 BOX-14）',
    'GAL-31 / VAC-14 护航编队 ×4',
    'ROK-2「石英」预警机（调度攻击窗口）'
  ],
  intel: `开场你正对着上游编队，敌机从你身后来<br>
    敌攻击机从低空进入，投放包线约 7–9 km<br>
    浮岛的战损已经很高，它不能再挨一次<br>
    <span class="am">攻击机带的是对面弹 —— 它们会优先打船，不会先来找你</span>`,
  map: [
    { x: 0, z: 4000, type: 'start', dir: 180, label: '进入点' },
    { x: 0, z: -6000, type: 'base', label: '座头鲸（浮岛）' },
    { x: -9000, z: -3000, type: 'base', label: '抹香鲸' },
    { x: 9000, z: -3000, type: 'base', label: '蓝鲸' },
    { x: 0, z: 24000, type: 'enemy', label: '砂岩攻击机群' },
    { x: 6000, z: 30000, type: 'site', label: '石英 QUARTZ' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 6000, 4000);
    p.fwd = M3.V(0, 0, -1);        // 面朝北（本关 +z 真方位 170°），敌机从南面来
    p.speed = 380;

    spawnWingman(w, 2, -220, 24, 320);
    spawnWingman(w, 3, 220, 24, 320);

    /* 上游编队 —— 这一关必须保护的东西，全部 team: 0。

       两条战舰按 SHIPS 表的 arms 带 FAN-6「海墙」舰空弹：抹香鲸 96 单元
       垂发（fireCd 短），座头鲸有 16 发舰空弹。它们会打来袭的敌机
       （从不朝玩家打）—— 但攻击机贴海进、放完弹就走，拦截主要还是玩家的事。
       蓝鲸只有近防炮，不算防空火力（weapon: null）。 */
    var fb = spawnShip(w, {
      model: 'humpback', team: 0, label: '座头鲸 HUMPBACK',
      x: 0, z: -6000, hp: 2600, weapon: 'ss6', fireCd: 8
    });
    w.baseTarget = fb;
    w.baseHpFull = fb.maxHp;
    w.guarded = [];
    w.guarded.push(spawnShip(w, {
      model: 'spermwhale', team: 0, label: '抹香鲸 SPERMWHALE',
      x: -9000, z: -3000, hp: 1500, weapon: 'ss6', fireCd: 3
    }));
    w.guarded.push(spawnShip(w, {
      model: 'bluewhale', team: 0, label: '蓝鲸 BLUEWHALE',
      x: 9000, z: -3000, hp: 1200, weapon: null
    }));

    /* 六架攻击机：两条线，每线三架。五架 VAC-14「砂岩」+ 一架 ROK-27。

       VAC-14 内侧 A 组挂 TUM-7「碎石」（下游通用对面弹，有导引头），
       外侧 B 组挂 BIN-9 自卫。AI 会自己去找海面目标 —— 这就是这一关
       第一次出现的机制：**敌机会真的去炸船**。
       最后一架换成 ROK-27，A 组挂 BOX-14「坍方」反舰弹 —— 打大型目标的
       那一发，重挂专属。早先这六架是上游的 G-6，挂的是上游的 GUT-9 / GUT-12。 */
    var i;
    for (i = 0; i < 6; i++) {
      var lane = Math.floor(i / 3);
      var isSledge = (i === 5);
      var st = spawnEnemy(w, {
        ac: isSledge ? 'm27' : 'vac14',
        x: (i % 3 - 1) * 3500 + (lane ? 1500 : -1500),
        y: lane ? 3000 : 2600,
        z: 22000 + lane * 3000,
        fwd: M3.V(0, 0, -1),
        special: isSledge ? 'vsr' : 'vgt',
        loadout: isSledge ? { A: 'vsr', B: 'dl6' } : { A: 'vgt', B: 'vbn' },
        skill: 0.6, callsign: downstreamCallsign(40 + i)
      });
      st.striker = true;
    }

    /* 两架 ROK-40 轰炸机：沿航线飞，目标是编队。

       轰炸机不空战、不规避（ai.js 的 updateRoute），所以走 route：
       低空进到编队北面约 9 km 的投放点，各放一枚 BOX-14「坍方」，
       然后掉头。投放由 onArrive 直接调 fireMissile —— 航线单位不走
       空战 AI 的开火段。原来它们没有航线、挂的是上游的 GUT-30，
       于是两架四发轰炸机在跟战斗机缠斗。 */
    function bomberRelease(a, w2) {
      var best = null, bd = 1e12;
      for (var bi = 0; bi < w2.targets.length; bi++) {
        var bt = w2.targets[bi];
        if (!bt.alive || bt.team !== 0) continue;
        var d2 = M3.dist2(bt.pos, a.pos);
        if (d2 < bd) { bd = d2; best = bt; }
      }
      if (!best || !w2.fireMissile) return;
      Ent.setWeapon(a, 'vsr');
      if (a.spAmmo > 0) w2.fireMissile(a, best);
    }
    for (i = 0; i < 2; i++) {
      var bmb = spawnEnemy(w, {
        ac: 'rok40',
        x: (i - 0.5) * 5000, y: 5000, z: 26000,
        fwd: M3.V(0, 0, -1), speed: 250,
        special: 'vsr', loadout: { B: 'vsr' },
        skill: 0.3,
        callsign: downstreamCallsign(46 + i)
      });
      bmb.bigTarget = true;
      bmb.route = {
        phase: 'ingress',
        wp: M3.V((i - 0.5) * 6000, 0, 4500), alt: 4500, arrive: 1500,
        exit: M3.V((i - 0.5) * 16000, 0, 34000), exitAlt: 6000,
        onArrive: bomberRelease
      };
    }

    // 四架护航
    for (i = 0; i < 4; i++) {
      var heavy = (i < 2);
      spawnEnemy(w, {
        ac: heavy ? 'gal31' : 'vac14',
        x: -9000 + i * 6000, y: heavy ? 9000 : 4000, z: 28000,
        fwd: M3.V(0, 0, -1),
        special: heavy ? 'dl4' : 'vbn',
        loadout: heavy ? { A: 'dl4', B: 'vbn' } : null,
        skill: 0.62, callsign: downstreamCallsign(48 + i)
      });
    }

    // 敌方预警机在后方调度窗口
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: '石英 QUARTZ',
      x: 6000, y: 10000, z: 30000,
      a: M3.V(10000, 0, 30000), b: M3.V(0, 0, 32000)
    });

    w.objective = '保卫上游水面编队';
    w.objectiveSub = '攻击机 6 · 轰炸机 2 · 编队完好';
  },

  tick: function (w, dt) {
    var i, attackers = 0, bombers = 0;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.striker) attackers++;
      else if (a.type === 'rok40') bombers++;
    }
    var fl = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.team !== 0 || !t.alive) continue;
      if (t.model === 'humpback' || t.model === 'spermwhale' || t.model === 'bluewhale') fl++;
    }
    w.objectiveSub = '攻击机 ' + attackers + ' · 轰炸机 ' + bombers +
      ' · 编队 ' + fl + '/3';

    // 编队挨打
    var hurt = false, sunk = null;
    for (i = 0; i < w.targets.length; i++) {
      var s = w.targets[i];
      if (s.team !== 0 || !s.model) continue;
      if (s.model === 'humpback' || s.model === 'spermwhale' || s.model === 'bluewhale') {
        if (s.alive && s.hp < s.maxHp) hurt = true;
        if (!s.alive && !s._lost) { sunk = s; s._lost = true; }
      }
    }
    if (hurt && !w.flags.fleetHit) {
      w.flags.fleetHit = true;
      w.radio.play('m8', 'fleetHit');
    }
    if (sunk && !w.flags.shipLost) {
      w.flags.shipLost = true;
      if (sunk.label) w.radio.raw({
        who: 'SEXTANT', cls: 'cmd',
        tx: '<b>' + sunk.label + ' 沉了。</b>', gap: 1.0
      });
      w.radio.play('m8', 'shipLost');
    }
  },

  win: function (w) {
    var i;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    /* 编队里任意一条沉了就算输 —— 这是这一关存在的全部理由。 */
    for (var i = 0; i < w.guarded.length; i++) {
      if (w.guarded[i] && !w.guarded[i].alive) return true;
    }
    if (w.baseTarget && !w.baseTarget.alive) return true;
    return false;
  }
});

/* ============================================================
   任务 9 · 登陆窗口

   第一次给出"时限"：下游的两栖船团正在横渡海峡。
   掩护火网五分钟后展开（timeLimit 300 秒）；在那之前不打断它，
   岛上就会多出一个他们不需要谈判的据点。
   ============================================================ */
MISSIONS.push({
  id: 'm9',
  no: 'OPERATION 09',
  name: '登陆窗口',
  en: 'THE WINDOW',
  loc: '分水海峡 / 11°38′N 133°26′E',
  date: '2078.04.19 / 1005L',
  altStart: 4800,
  speedStart: 340,
  timeLimit: 300,
  axis: 15,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>下游的两栖船团昨夜出了港。三条登陆舰、
两条护卫、几条快艇 —— 目标是把一个营送上分水主岛的东岸。</p>
<p>他们算得很清楚：只要船团靠岸，<b>岛上就会多出一个不需要谈判的据点</b>。
上游在岛上没有地面部队，只有一片空域和几架飞机。</p>
<p>船团还要<b>半个多小时</b>才能走到滩头，但掩护它的舰空火网
<b>五分钟</b>后就会展开。火网一展开，就再也打不进去了。</p>`,

  objectives: [
    '在时限内摧毁 3 艘 海蝎级登陆舰',
    '击落空中掩护',
    '（可选）清除护航的快艇与护卫舰',
    '时限：<b>300 秒</b> —— 火网展开之前，必须把三条登陆舰留在海上',
    '任意一条登陆舰抵达登陆点，任务即失败'
  ],
  threats: [
    '海蝎级登陆舰 ×3（目标）',
    '菊石级巡逻护卫舰 ×2',
    '三叶虫级导弹快艇 ×4',
    'ROK-27「片岩」×2（一架带 SAV-6 吊舱，一架挂 BOX-14 反舰弹）',
    'VAC-14「砂岩」攻击机 ×1（低空压着船团头顶）',
    '时限 300 秒'
  ],
  intel: `海峡宽 <b>40 km</b> · 能见度 20 km<br>
    船团航速 15 节，抵达登陆点需要 <b>约 30 分钟</b><br>
    护卫舰上的舰空弹需要被照射才能开火 —— 打完就撤，别盘旋<br>
    <span class="am">倒计时结束即判负，不管你还剩多少弹</span>`,
  map: [
    { x: 0, z: -16000, type: 'start', label: '进入点' },
    { x: 0, z: 13800, type: 'enemy', label: '登陆船团' },
    { x: -8000, z: 18000, type: 'enemy', label: '护卫舰' },
    { x: 8000, z: 22000, type: 'enemy', label: '护卫舰' },
    { x: -10500, z: 11000, type: 'enemy', label: '快艇' },
    { x: 10500, z: 11000, type: 'enemy', label: '快艇' },
    { x: 0, z: 38000, type: 'site', label: '登陆点' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 4800, -16000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 340;

    spawnWingman(w, 2, -200, 18, -300);
    spawnWingman(w, 3, 200, 18, -300);

    /* 三条登陆舰，排成一列往北走。它们的 route 是**真的航路** ——
       这一关的时间压力来自这里：船在动，而窗口是固定的。 */
    var i;
    for (i = 0; i < 3; i++) {
      spawnShip(w, {
        model: 'seascorpion', label: '海蝎级 ' + (i + 1),
        x: (i - 1) * 2500, z: 12000 + i * 1800, hp: 520,
        route: {
          wp: [{ x: (i - 1) * 2500, z: 12000 + i * 1800 },
            { x: (i - 1) * 2500, z: 40000 + i * 1800 }],
          speed: 8, loop: false
        }
      });
    }

    // 两艘护卫舰
    for (i = 0; i < 2; i++) {
      spawnShip(w, {
        model: 'ammonite', label: '菊石级 ' + (i ? 'B' : 'A'),
        x: (i - 0.5) * 16000, z: 18000 + i * 4000, hp: 420,
        route: {
          wp: [{ x: (i - 0.5) * 16000, z: 18000 + i * 4000 },
            { x: (i - 0.5) * 16000, z: 34000 + i * 4000 }],
          speed: 13, loop: false
        },
        weapon: 'dl9', fireCd: 5
      });
    }

    /* 四艘三叶虫快艇在两翼来回穿插 —— 它们是这一关最烦的东西：
       单发反舰弹够不着那么快的目标，而它们会一直贴着你。 */
    for (i = 0; i < 4; i++) {
      var sx = (i < 2) ? -1 : 1;
      spawnShip(w, {
        model: 'trilobite', label: '三叶虫级 ' + (i + 1),
        x: sx * (9000 + (i % 2) * 3000), z: 8000 + (i % 2) * 6000, hp: 240,
        route: {
          wp: [{ x: sx * (9000 + (i % 2) * 3000), z: 8000 + (i % 2) * 6000 },
            { x: -sx * (9000 + (i % 2) * 3000), z: 16000 + (i % 2) * 6000 }],
          speed: 20, loop: true
        }
      });
    }

    /* 两架 ROK-27 在船团上空掩护。

       一架挂格斗弹 + SAV-6 吊舱（掩护），一架挂 BOX-14「坍方」反舰弹 ——
       它们不只是来护航的，也会去打你的东西。BOX-14 的 npcFits 是
       ['heavy']，挂在 ROK-27 的内侧 A 组。反舰弹归多用途机，
       不归 GAL-31 那种截击机（早先挂在 GAL-31 上）。 */
    spawnEnemy(w, {
      ac: 'm27',
      x: -2000, y: 8000, z: 20000,
      fwd: M3.V(0, 0, -1),
      special: 'dl6', loadout: { A: 'dl6' },
      pods: ['vzu'],
      skill: 0.7, callsign: downstreamCallsign(52)
    });
    spawnEnemy(w, {
      ac: 'm27',
      x: 3000, y: 8500, z: 22000,
      fwd: M3.V(0, 0, -1),
      special: 'vsr', loadout: { A: 'vsr', B: 'dl6' },
      skill: 0.72, callsign: downstreamCallsign(53)
    });

    /* 一架 VAC-14「砂岩」在低空压着登陆船团的头顶。
       A 组挂 TUM-7「碎石」对面弹，B 组挂 BIN-9 自卫。
       （早先是上游的 G-6 挂上游的 PEJ-30。） */
    spawnEnemy(w, {
      ac: 'vac14',
      x: 6000, y: 2800, z: 26000,
      fwd: M3.V(0, 0, -1),
      special: 'vgt', loadout: { A: 'vgt', B: 'vbn' },
      skill: 0.62, callsign: downstreamCallsign(54)
    });

    w.objective = '打断登陆船团';
    w.objectiveSub = '登陆舰 3 · 剩余 300 秒';
    w.dangerAltitude = 2000;
  },

  tick: function (w, dt) {
    var i, landers = 0, escorts = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.alive || t.team !== 1) continue;
      if (t.model === 'seascorpion') landers++; else escorts++;
    }
    var left = Math.max(0, Math.ceil(w.timeLeft));
    w.objectiveSub = '登陆舰 ' + landers + ' · 护航 ' + escorts +
      ' · 剩余 ' + left + ' 秒';

    var detected = w.player.pos.y > 2000 && w.player.alive;
    w.detected = detected;

    if (!w.flags.warned && w.timeLeft < 90) {
      w.flags.warned = true;
      w.radio.play('m9', 'windowClosing');
    }
    if (landers === 1 && !w.flags.lastOne) {
      w.flags.lastOne = true;
      w.radio.play('m9', 'lastOne');
    }
  },

  win: function (w) {
    var i, landers = 0;
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'seascorpion') landers++;
    }
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return landers === 0;
  },
  lose: function (w) {
    if (!w.player.alive) return true;
    /* 登陆舰走到 z > 38000 就算上岸 —— 这一条比时限更硬，
       因为它说的才是这一关真正的失败条件。 */
    for (var i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'seascorpion' && t.pos.z > 38000) {
        return true;
      }
    }
    return false;      // 超时由 game.js 的统一分支处理
  }
});

/* ============================================================
   任务 10 · 指挥所

   压轴：把下游的指挥链从中间摘掉。
   预警机调度、巡洋舰指挥、以及那个用活地名做呼号的人。
   ============================================================ */
MISSIONS.push({
  id: 'm10',
  no: 'OPERATION 10',
  name: '指挥所',
  en: 'COMMAND POST',
  loc: '分水海盆南缘 / 11°05′N 134°45′E',
  date: '2078.04.25 / 0550L',
  altStart: 17000,
  speedStart: 480,
  timeLimit: 0,
  axis: 140,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>打了六个星期，双方都到了必须做决定的时候。上游的决定是把下游的
指挥链摘掉：预警机、舰上指挥所、以及那个把它们连起来的人。</p>
<p>他们也很清楚这一点。所以指挥所不在后方 ——
它在这一片空域的正中间，两翼都有护航，
而上面那架「玄武岩」的飞行员已经在这条高度上飞了半辈子。</p>
<p><b>他的呼号是冬港。</b>下游有四千多个消失的村庄被刻在石碑上，
而冬港不在上面 —— 那是一座<b>还在用</b>的镇子。
<span class="am">上游情报花了三周才想明白这件事意味着什么：
他不是来复仇的，他是来做交易的。</span></p>`,

  objectives: [
    '击落 ROK-2「石英」预警机',
    '摧毁 邓氏鱼级巡洋舰（下游编队旗舰、舰上指挥所）',
    '击落 GAL-31「玄武岩」—— 呼号「冬港」',
    '清除 ROK-27 / GAL-31 护航编队'
  ],
  threats: [
    'GAL-31「玄武岩」×1（冬港本人，skill 极高）',
    'ROK-2「石英」预警机',
    '邓氏鱼级旗舰（舰空弹只够自保，在正中央）',
    'GAL-31 / ROK-27 两翼护航 ×6',
    'DAR-4「砾石」中距弹 / BIN-9「双生」双导引头格斗弹'
  ],
  intel: `高度 <b>17 000 m</b> · 密度 0.14 kg/m³ · 温度 −57 ℃<br>
    指挥舰在编队正中央，两翼各有护航<br>
    预警机在 30 km 外，它每十秒左右给下游分配一次目标<br>
    <span class="am">冬港的 GAL-31 在 18 600 m，比你的起步高度高一层</span>`,
  map: [
    { x: 0, z: -18000, type: 'start', label: '进入点' },
    { x: 0, z: 18000, type: 'enemy', label: '旗舰 邓氏鱼级' },
    { x: -12000, z: 14000, type: 'enemy', label: '护航' },
    { x: 12000, z: 14000, type: 'enemy', label: '护航' },
    { x: 0, z: 34000, type: 'site', label: '石英 QUARTZ' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 17000, -18000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 480;
    p.throttle = 0.95;
    p.ab = true;

    spawnWingman(w, 2, -220, 28, -320);
    spawnWingman(w, 3, 220, 28, -320);
    w.wings[2].pos.y = 17000;
    w.wings[3].pos.y = 17000;

    /* 指挥舰：邓氏鱼（邓氏鱼级），下游分水编队的旗舰（SHIPS 表的 role）。
       它带 8 发 BAD-9 舰空弹 —— 只够自保，够不到一万七千米的你；
       真正的防空靠护航与预警机，所以它是一个"必须在护航被撕开、
       自己降下来之后才能碰到"的目标。
       早先这里写的是房角石（房角石级，武库舰）。 */
    spawnShip(w, {
      model: 'dunkleosteus', label: '邓氏鱼级',
      x: 0, z: 18000, hp: 2000, weapon: 'dl9', fireCd: 5
    });

    // 两层护航
    var i;
    for (i = 0; i < 6; i++) {
      var inner = (i < 3);
      var heavy = (i % 2 === 0);
      spawnEnemy(w, {
        ac: heavy ? 'gal31' : 'm27',
        x: (inner ? -12000 : 12000) + (i % 3 - 1) * 3000,
        y: heavy ? 16500 : 14000,
        z: 14000 + (i % 3) * 2500,
        fwd: M3.V(0, 0, -1),
        special: heavy ? 'dl4' : 'dl6',
        loadout: heavy ? { A: 'dl4', B: 'vbn' } : null,
        pods: heavy ? null : ['vzu'],
        skill: 0.68 + (i > 3 ? 0.08 : 0),
        callsign: downstreamCallsign(56 + i)
      });
    }

    // 预警机
    spawnAewc(w, {
      ac: 'quartz', team: 1, label: '石英 QUARTZ',
      x: 0, y: 11000, z: 34000,
      a: M3.V(8000, 0, 34000), b: M3.V(-8000, 0, 37000)
    });

    /* 冬港。与第 3 关同一架 GAL-31（见 spawnWinterport），
       起始高度比玩家高一层、压在升限以下。
       skill 0.98 意味着他几乎不犯决策错误。 */
    spawnWinterport(w, { x: 2000, y: 18600, z: 26000, skill: 0.98 });

    w.objective = '斩断下游指挥链';
    w.objectiveSub = '预警机 1 · 指挥舰 1 · 冬港';
  },

  tick: function (w, dt) {
    var i, aews = 0, ships = 0, escorts = 0;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team !== 1 || !a.alive) continue;
      if (a.aewc) aews++;
      else if (!a.isAce) escorts++;
    }
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'dunkleosteus') ships++;
    }
    w.objectiveSub = '预警机 ' + aews + ' · 指挥舰 ' + ships +
      ' · 护航 ' + escorts + ' · 冬港 ' + (w.ace && w.ace.alive ? '在空' : '已落');

    if (!w.flags.contact && w.time > 5) {
      w.flags.contact = true;
      w.radio.play('m10', 'contact');
    }
    // 预警机被打掉 → 下游各机失去调度
    if (aews === 0 && !w.flags.aewDown) {
      w.flags.aewDown = true;
      w.radio.play('m10', 'aewDown');
    }
    // 指挥舰被打掉 → 下游开始撤
    if (ships === 0 && !w.flags.cpDown) {
      w.flags.cpDown = true;
      w.radio.play('m10', 'cpDown');
    }
    // 冬港血量过半 → 阶段二
    if (w.ace && w.ace.alive && !w.flags.aceP2 && w.ace.hp < w.ace.maxHp * 0.5) {
      w.flags.aceP2 = true;
      w.radio.play('m10', 'bossPhase2');
      w.ace.ai.mode = 'pursue';
      w.ace.ai.skill = 1.0;
    }
    if (w.ace && !w.ace.alive && !w.flags.aceKilled) {
      w.flags.aceKilled = true;
      w.radio.play('m10', 'aceKill');
    }
  },

  win: function (w) {
    var i;
    if (w.ace && w.ace.alive) return false;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    for (i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (t.alive && t.team === 1 && t.model === 'dunkleosteus') return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});

/* ============================================================
   任务 11 · 第四周（随机遭遇）

   第二场战役的唯一一关：每次进入随机刷新一批战机敌人，
   打完即胜、可反复刷。背景见 CAMPAIGNS 里 cmp2 的 desc。

   随机在 spawn() 里**一次做完**，tick() 只读队列 —— 逐帧掷骰
   会让目标数抖动，也会让冒烟测试不可复现。
   ============================================================ */
/* 第四周的下游机型 → 制式挂载（全是下游弹） */
var SK_FITS = {
  m27:   { sp: 'dl6', lo: { A: 'dl4', B: 'dl6' } },
  gal31: { sp: 'dl4', lo: { A: 'dl4', B: 'vbn' } },
  vac14: { sp: 'vbn', lo: { A: 'vbn', B: 'vbn' } }
};

MISSIONS.push({
  id: 'sk1',
  no: 'SKIRMISH',
  name: '第四周',
  en: 'THE FOURTH WEEK',
  loc: '分水海盆中央 / 编号空白空域',
  date: '2078.05 — 无终止日期',
  altStart: 6000,
  speedStart: 350,
  timeLimit: 0,
  axis: 180,                     // 世界 +z 的真方位（°）—— 敌方来向，见文件头说明

  prose: `
<p>停火没有条约，只有一个说法：<b>第四周</b>。
意思是"又一周过去了，谁都没承认自己还在打"。</p>
<p>双方默认不再往海盆中央派侦察机，也从不宣布那里中立。
于是每个还剩油的中队都往那儿派小编队巡逻 —— 谁都不承认自己在找谁。</p>
<p>两边的飞机在同一段航路上相遇，谁先转到对方尾后谁就先开火。
打完各回各的甲板，<b>第二天再飞</b>。</p>
<p><span class="am">这里的每一场遭遇战都不会出现在战报里。
本次进入的空域编号与上周不同 —— 敌人、方位、数量，每次都变。</span></p>`,

  objectives: [
    '清除本空域内的全部未识别战机（6 个批次）',
    '只打飞机：这片空域里没有需要保护或摧毁的地面目标',
    '打完即撤，没有第二阶段',
    '每次进入的敌情都不一样 —— 重新勘察，不要沿用上一场的判断'
  ],
  threats: [
    '未知机型与未知数量（每个批次独立随机）',
    '下游的巡逻编队 —— 以及一架不参与交战的分水群岛国巡逻机',
    '本空域没有地面引导；SEXTANT 只报回波，不指挥'
  ],
  intel: `空域编号 <b>未分配</b> · 云底 2800 m · 能见度 22 km<br>
    敌机方位随机；上一批清空后约 6 秒，下一批进场<br>
    <span class="am">SEXTANT 只报回波，不下指令</span><br>
    建议一次只处理一个批次，不要同时咬两队`,
  map: [
    { x: 0, z: -6000, type: 'start', label: '进入点' },
    { x: 0, z: 14000, type: 'site', label: '未识别回波' },
    { x: -12000, z: 8000, type: 'site', label: '未识别回波' },
    { x: 12000, z: 8000, type: 'site', label: '未识别回波' }
  ],

  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 6000, -6000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 350;

    spawnWingman(w, 2, -200, 24, -300);
    spawnWingman(w, 3, 200, 24, -300);

    // 上游预警机在远处看着 —— 这里唯一的"体系"
    spawnAewc(w, {
      ac: 'pelican', team: 0, label: 'SEXTANT',
      x: 0, y: 7000, z: -30000,
      a: M3.V(9000, 0, -30000), b: M3.V(-9000, 0, -25000)
    });

    /* 群岛国的一架「潮线」在海面附近游荡 —— 背景，team 2。
       早先它被放进敌方机型池（team 1），于是"不明回波"成了下游的僚机。 */
    spawnEnemy(w, {
      ac: 'k8', team: 2,
      x: -9000, y: 3800, z: 9000,
      fwd: M3.V(1, 0, 0), speed: 240,
      special: 'otr', skill: 0.30,
      behavior: 'recon'
    });

    /* 六个批次，一次性掷骰。

       机型池只放**下游战机**（team 1 就是下游）：早先池里混着上游的
       F-9 / D-21 / D-33 和群岛国的潮线 —— 这里的敌人是下游的巡逻队。
       ROK-27 写两次：它是下游的主力，出现得最多。
       每型配自己的制式弹（SK_FITS），不再一律 dl6。
       数量随批次递增（2→6），技能与高度也随机。 */
    var pool = ['m27', 'm27', 'gal31', 'vac14'];
    var queue = [];
    for (var b = 0; b < 6; b++) {
      var n = 2 + Math.floor(b * 0.8);            // 2,2,3,4,5,6
      var brg = M3.rnd(0, Math.PI * 2);           // 进场方位
      var spec = [];
      for (var k = 0; k < n; k++) {
        spec.push({
          ac: M3.pick(pool),
          skill: M3.rnd(0.45, 0.85),
          alt: M3.rnd(3500, 9000),
          off: M3.rnd(-2500, 2500)
        });
      }
      queue.push({ list: spec, bearing: brg, spawnT: 0, spawned: false });
    }
    w.skQueue = queue;
    w.skBatch = -1;          // 当前批次下标（-1 = 尚未开始）

    w.objective = '清除未识别空情';
    w.objectiveSub = '批次 0/6';
  },

  tick: function (w, dt) {
    var q = w.skQueue;
    if (!q) return;

    /* 队列推进完全由这里读，不掷骰：上一批全灭 → 冷却 → 放下一批。
       冷却给了玩家一点收拾编队的时间，也让"6 批"听起来不是一口气。 */
    if (!w.flags.skCool) w.flags.skCool = 0;
    if (w.flags.skCool > 0) w.flags.skCool -= dt;

    var alive = 0, i;
    for (i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.team === 1 && a.alive) alive++;
    }

    var pending = false;
    for (i = 0; i < q.length; i++) if (!q[i].spawned) { pending = true; break; }

    if (w.skBatch < 0) {
      // 开局先歇几秒
      w.flags.skCool -= 0;      // 已在上面的递减里
      if (w.time > 3) { w.skBatch = 0; }
    } else if (alive === 0 && w.flags.skCool <= 0) {
      var next = w.skBatch + 1;
      if (next < q.length && !q[next].spawned) w.skBatch = next;
    }

    // 投放当前批次
    var bat = q[w.skBatch];
    if (bat && !bat.spawned) {
      bat.spawned = true;
      var dist = 16000;
      var fx = Math.sin(bat.bearing) * dist;
      var fz = Math.cos(bat.bearing) * dist;
      // 进场方向：朝原点
      var fl = Math.sqrt(fx * fx + fz * fz) || 1;
      var fwd = M3.V(-fx / fl, 0, -fz / fl);
      for (i = 0; i < bat.list.length; i++) {
        var e = bat.list[i];
        // 侧向错开，避免叠在一起
        var px = fx + Math.cos(bat.bearing) * e.off;
        var pz = fz - Math.sin(bat.bearing) * e.off;
        var foe = spawnEnemy(w, {
          ac: e.ac,
          x: px, y: e.alt, z: pz,
          fwd: fwd, speed: M3.rnd(280, 380),
          special: SK_FITS[e.ac].sp, loadout: SK_FITS[e.ac].lo,
          skill: e.skill,
          callsign: downstreamCallsign(60 + w.skBatch * 8 + i)
        });
        foe.wave = w.skBatch + 1;
      }
      w.flags.skCool = 6;       // 下一批的间隔
      if (w.radio) w.radio.raw({
        who: 'SEXTANT', cls: 'cmd',
        tx: '<i>第 ' + (w.skBatch + 1) + ' 批回波进入本空域。</i>', gap: 0.8
      });
    }

    var spawned = 0;
    for (i = 0; i < q.length; i++) if (q[i].spawned) spawned++;
    w.objectiveSub = '批次 ' + spawned + '/6' + (alive ? ' · 剩余 ' + alive : '');
  },

  win: function (w) {
    var q = w.skQueue, i;
    if (!q) return false;
    for (i = 0; i < q.length; i++) if (!q[i].spawned) return false;
    for (i = 0; i < w.actors.length; i++) {
      if (w.actors[i].team === 1 && w.actors[i].alive) return false;
    }
    return true;
  },
  lose: function (w) { return !w.player.alive; }
});

/* ============================================================
   查表
   ============================================================ */
function getMission(idx) {
  return MISSIONS[M3.clamp(idx, 0, MISSIONS.length - 1)];
}
