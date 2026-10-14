/* ============================================================
   missions.js —— 三个任务的战场生成与触发器
   ============================================================ */
'use strict';

var MISSIONS = [];

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
    team: 1,
    x: o.x, y: o.y, z: o.z,
    fwd: o.fwd || M3.V(0, 0, -1),
    speed: o.speed || 300,
    special: o.special || 'dl6',
    throttle: 0.8
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
  w.actors.push(a);
  return a;
}

function spawnWingman(w, idx, slotX, slotY, slotZ) {
  var a = Ent.makeAircraft({
    type: 'c11',
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
    role: 'wingman', skill: 0.62,
    formation: { dx: slotX, dy: slotY, dz: slotZ },
    cmd: 'spread'
  });
  a.wingIdx = idx;
  w.actors.push(a);
  w.wings[idx] = a;
  return a;
}

function spawnTarget(w, o) {
  var t = Ent.makeTarget(o);
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
  loc: '分水群岛北侧空域 / 12°04′N 134°11′E',
  date: '2078.03.14 / 0612L',
  altStart: 7600,
  speedStart: 320,
  timeLimit: 0,

  prose: `
<p>三月十一日，调节场的<b>偏移量</b>被公开。三天之后，下游宣布调节场
"是一个未经同意的资源再分配装置"，并开始向分水群岛移动。</p>
<p>今天是第十四天。第 <b>7 号控制平台</b>的遥测已经断了两天 ——
不是被摧毁，是<b>被接管</b>。站里的人还在，只是在接另一条线上的命令。</p>
<p>一小时前，群岛北侧出现了五个没有识别码的回波。它们的飞行剖面很规整，
速度很慢，挂载很怪 —— 这不是打击编队，
<span class="cy">这是一支在<b>测量</b>什么的队伍</span>。</p>
<p>上游公约在分水方向只有一个中队。今天它能派出的，是三架飞机。</p>`,

  objectives: [
    '拦截并击落下游测绘编队（5 个目标）',
    '保护 VESPER-2 与 VESPER-3',
    '注意：本空域高度 7000 m 以上，动压充足，正常交战'
  ],
  threats: [
    'ROK-27「片岩」截击机 ×5（侦察构型，自卫为主）',
    'BIN-6「燧火」红外格斗弹',
    '无地面防空威胁'
  ],
  intel: `风速 <b>18 m/s</b> 西风 · 云底 3200 m · 能见度 24 km<br>
    敌编队航向 <b>180°</b>，预计 6 分钟后进入群岛<br>
    你的起飞重量比标准低了 11% —— 他们把副油箱拆了。`,
  map: [
    { x: 0, z: 0, type: 'base', label: '起飞点' },
    { x: 0, z: 8000, type: 'enemy', label: '目标编队' },
    { x: -3000, z: 15000, type: 'site', label: '第7号控制平台' }
  ],


  /* ---------------- 战场生成 ---------------- */
  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 7600, 0);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 330;

    spawnWingman(w, 2, -170, 25, -260);
    spawnWingman(w, 3, 170, 25, -260);

    // 五个测绘机组，横队
    var i, x;
    for (i = 0; i < 5; i++) {
      x = (i - 2) * 900;
      var e = spawnEnemy(w, {
        x: x, y: 8100, z: 8600,
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

    /* 两架 VAC-14 护航。它们比测绘机快、也更愿意打 ——
       空气设计局的廉价品本来就是干这个的。 */
    for (i = 0; i < 2; i++) {
      spawnEnemy(w, {
        ac: 'vac14',
        x: (i - 0.5) * 2200, y: 8600, z: 9200,
        fwd: M3.V(0, 0, -1),
        speed: 300,
        special: 'otr',
        skill: 0.40,
        behavior: 'escort',
        escort: true,
        callsign: downstreamCallsign(5 + i),
        wave: 1
      });
    }

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

  prose: `
<p>下游在铁砧海域上摆了三个<b>浮空中继平台</b>，把群岛控制平台的信号
中继回南边。它们是下游空情图的眼睛 ——
打掉它们，下游在这片海上的态势感知会退回二十年前。</p>
<p>代价是天气。铁砧海域的云底只有 <b>900 米</b>，
而下游在岛链上部署了四个防空浮台。</p>
<p><span class="am">爬到 1500 米以上，你就会被他们的对空雷达看见。</span>
躲在云下，你看不见他们，他们也看不见你 ——
但你得靠机炮和炸弹把浮空平台打下来，而那些东西在 <b>4000 米</b>。</p>
<p>这是个没有好答案的任务。</p>`,

  objectives: [
    '摧毁 3 座「高原」级浮空中继平台',
    '摧毁 2 座地面测控平台',
    '保持在 1500 m 以下可以避开对空雷达（关键）',
    '摧毁浮空平台时必须命中功率调节组件或天线阵面'
  ],
  threats: [
    'BAD-9「高墙」远程防空导弹（4 个阵地，射程 9 km）',
    'ROK-27「片岩」截击机（任务中段出现）',
    '地形：海面，无地形遮蔽可用'
  ],
  intel: `云底 <b>900 m</b> · 云顶 4200 m · 中继平台高度 <b>4000 m</b><br>
    对空雷达探测高度下限约 <b>1500 m</b><br>
    防空浮台间距 5 km，存在雷达覆盖缝隙 —— 但很窄`,
  map: [
    { x: 0, z: 0, type: 'base', label: '进入点' },
    { x: -4200, z: 6000, type: 'relay', label: '中继 1' },
    { x: 300, z: 9000, type: 'relay', label: '中继 2' },
    { x: 4600, z: 5200, type: 'relay', label: '中继 3' },
    { x: -3000, z: 0, type: 'sam', label: 'SAM A' },
    { x: 3000, z: 1200, type: 'sam', label: 'SAM B' }
  ],


  spawn: function (w) {
    var p = w.player;
    p.pos = M3.V(0, 1400, -4000);
    p.fwd = M3.V(0, 0, 1);
    p.speed = 340;

    spawnWingman(w, 2, -150, 12, -240);
    spawnWingman(w, 3, 150, 12, -240);

    // 三座浮空中继平台
    var relays = [
      { x: -4200, y: 4000, z: 6000 },
      { x: 300, y: 4000, z: 9000 },
      { x: 4600, y: 4000, z: 5200 }
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
      { x: -3000, z: 200, label: '测控平台 北' },
      { x: 3000, z: 1400, label: '测控平台 南' }
    ];
    for (i = 0; i < sites.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'radar', label: sites[i].label,
        x: sites[i].x, y: 0, z: sites[i].z,
        hp: 200, radius: 10, ground: true, value: 200
      });
    }

    // 四个防空浮台
    var sams = [
      { x: -5200, z: 1800 }, { x: 5200, z: 2600 },
      { x: -2000, z: 8600 }, { x: 4200, z: 9600 }
    ];
    for (i = 0; i < sams.length; i++) {
      spawnTarget(w, {
        ttype: 'ground', model: 'sam', label: '防空浮台 ' + (i + 1),
        x: sams[i].x, y: 0, z: sams[i].z,
        hp: 90, radius: 5, ground: true,
        fireCd: M3.rnd(3, 8), weapon: 'dl9', value: 150
      });
    }

    w.objective = '摧毁下游中继网络';
    w.objectiveSub = '浮空平台 3 · 控制平台 2';
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
    w.objectiveSub = '浮空 ' + relays + ' · 地面 ' + sites + ' · 阵地 ' + sams;

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
      // 下游截击机从南边进场
      var k;
      /* 两架 GAL-31 打头、两架 ROK-27 跟进。
         高空设计局的重型截击机专为这种场合造的：
         从高空俯冲下来打一轮中距弹，然后脱离再爬升。 */
      for (k = 0; k < 4; k++) {
        var isHeavy = (k < 2);
        var e = spawnEnemy(w, {
          ac: isHeavy ? 'gal31' : 'm27',
          x: -1200 + k * 900, y: isHeavy ? 6200 : 2600, z: 14000,
          fwd: M3.V(0, 0, -1), speed: isHeavy ? 430 : 340,
          special: isHeavy ? 'dl4' : 'dl6',
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
    return relays === 0 && sites === 0 && planes === 0;
  },
  lose: function (w) { return !w.player.alive; }
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

  prose: `
<p>下游不打算把季风线调回原位。他们打算让它<b>哑掉</b>。</p>
<p>六架「灰烬」级播撒机正在往 20 公里高度爬升。
它们携带的不是碘化银，是<b>反凝结核</b> ——
一种能在那一层高度把冰核"吃掉"的化合物。
撒下去，整条季风线会在两个季节里失去响应能力。</p>
<p>在这个高度，空气密度只有海平面的 <b>7.2%</b>。
导弹的舵面几乎失效，可用过载掉到个位数 G；
而机炮的弹道比在任何高度都平直。</p>
<p>上游公约派了三架飞机上来。<span class="am">交战规则：阵列空域内，
20 公斤以上战斗部全部锁定 —— 你们只有机炮。</span></p>
<p>而对面来的那个人，在这条高度上已经飞了 <b>2600 个小时</b>。</p>`,

  objectives: [
    '击落全部 6 架「灰烬」级播撒机',
    '不得损毁调节单元（DIL-4）',
    '阵列空域内重武器锁定 —— 只有机炮'
  ],
  threats: [
    '「灰烬」级播撒机 ×6（大型、低速、结构脆弱但数量多）',
    'ROK-27 护航编队',
    'DRYWELL —— 下游第 4 战术联队指挥官'
  ],
  intel: `高度 <b>19 500 m</b> · 密度 0.076 kg/m³ · 温度 −57 ℃<br>
    在此高度你<b>无法加速</b>，只能靠进入战斗前攒下的能量<br>
    机炮有效射程翻倍至 <b>约 2.6 km</b>，但抓窗口的时间极短<br>
    调节单元货舱内有 <b>340 kg</b> 碘化银 —— 别把它们打炸`,
  map: [
    { x: 0, z: 0, type: 'base', label: '进入点' },
    { x: 0, z: 9000, type: 'relay', label: '单元阵列' },
    { x: 2400, z: 5000, type: 'relay', label: '单元' },
    { x: -2400, z: 5000, type: 'relay', label: '单元' }
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

    // 调节单元阵列：3×3，间距 2400 m
    var i, j;
    w.cells = [];
    for (i = -1; i <= 1; i++) {
      for (j = -1; j <= 1; j++) {
        var c = spawnTarget(w, {
          ttype: 'air', model: 'cell', label: '调节单元',
          x: i * 2400, y: M3.rnd(18800, 20200), z: 8000 + j * 2400,
          hp: 400, radius: 34, drift: 14, big: true, value: 0
        });
        c.friendlyAsset = true;      // 打坏要扣分
        c.team = 2;                  // 中立：双方流弹都可能伤到它，玩家误伤要扣分
        w.cells.push(c);
      }
    }

    // 六架播撒机
    for (i = 0; i < 6; i++) {
      var sx = (i % 3 - 1) * 1500;
      var sz = 12000 + Math.floor(i / 3) * 1400;
      var s = spawnEnemy(w, {
        x: sx, y: 18900, z: sz,
        fwd: M3.V(0, 0, -1), speed: 210,
        special: 'dl6', skill: 0.25,
        behavior: 'recon',
        callsign: downstreamCallsign(9 + i)
      });
      s.recon = true;
      s.model = 'sower';
      s.phys = { vMax: 280, vMil: 240, vStall: 150, accel: 8, decel: 20, pitch: 0.30, roll: 1.2, yaw: 0.20, hp: 340 };
      s.maxHp = 340; s.hp = 340;
      s.radius = 22;
      s.bigTarget = true;
      s.weaponPod = true;
    }

    /* 两架护航：一架空气设计局的 VAC-14 贴地跟着，
       一架高空设计局的 GAL-31 在上面看着。这是下游的标准搭配 ——
       便宜的负责数量，贵的负责质量。 */
    for (i = 0; i < 2; i++) {
      var isHeavy2 = (i === 1);
      spawnEnemy(w, {
        ac: isHeavy2 ? 'gal31' : 'vac14',
        x: -3000 + i * 6000, y: isHeavy2 ? 20600 : 19800, z: 11500,
        fwd: M3.V(0, 0, -1), speed: isHeavy2 ? 420 : 380,
        special: isHeavy2 ? 'dl4' : 'vbn',
        skill: 0.6, callsign: downstreamCallsign(15 + i)
      });
    }

    w.objective = '拦截「灰烬」播撒机群';
    w.objectiveSub = '剩余 6';
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

    // 播撒机少于 3 架 → 干井进场
    if (!w.aceSpawned && sowers <= 3) {
      w.aceSpawned = true;
      w.radio.play('m3', 'aceAppears');
      var ace = spawnEnemy(w, {
        x: 500, y: 21000, z: 13800,
        fwd: M3.V(0, 0, -1), speed: 470,
        special: 'dl4', skill: 0.96, callsign: '干井 DRYWELL'
      });
      ace.isAce = true;
      ace.phys = { vMax: 540, vMil: 430, vStall: 118, accel: 30, decel: 36, pitch: 0.66, roll: 3.2, yaw: 0.30, hp: 165 };
      ace.maxHp = 165; ace.hp = 165;
      ace.label = 'DRYWELL · 干井';
      w.ace = ace;
    }

    // 王牌血量过半 → 阶段二台词
    if (w.ace && w.ace.alive && !w.flags.aceP2 && w.ace.hp < w.ace.maxHp * 0.5) {
      w.flags.aceP2 = true;
      w.radio.play('m3', 'bossPhase2');
      // 干井开始向下带
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
   查表
   ============================================================ */
function getMission(idx) {
  return MISSIONS[M3.clamp(idx, 0, MISSIONS.length - 1)];
}
