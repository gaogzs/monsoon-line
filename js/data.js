/* ============================================================
   data.js —— 机型 / 武器 / 呼号 / 无线电台词

   装备编号体系
   ------------
   架空世界的签字语言是逻辑语（Lojban）—— 一种为"不允许歧义"而造的
   人工语言。跨国气候工程里的一次误读，代价是几千万吨雨落在错误的
   纬度上，而后果要九个月后才显现。制式编号的前缀因此取自逻辑语的
   词根（rafsi），完整对照见 codex 条目 t5：

     CEL-  cecla  发射器 / 炮      SUT-  sutra  快
     GIR-  girzu  组 / 群          CLA-  clani  长
     SPO-  daspo  摧毁             GUT-  gunta  攻击
     PEJ-  preja  扩散 / 播撒      GUS-  gusni  光
     ZUN-  zunti  干扰             DAR-  darno  远
     BIN-  jbini  之间 / 近        BAD-  bandu  防卫
     CAV-  carvi  雨（调节场体系）  DIL-  dilnu  云（调节单元）

   机型命名传统
   ------------
     上游公约   海鸟 / 海鱼
     下游同盟   矿物 / 岩石

   注：WEAPONS 的对象键（v9 / v11 / k3 / dl4 …）是内部标识符，
      沿用早期技术代号；玩家可见的制式名以 name 字段为准。
   ============================================================ */
'use strict';

/* ============================================================
   呼号
   ============================================================ */
var CALLSIGN = {
  player: 'VESPER-1',
  wing2: 'VESPER-2',
  wing3: 'VESPER-3',
  awacs: 'SEXTANT',
  enemy: 'FLINT',
  ace: 'DRYWELL'
};

/* ============================================================
   机型
   phys 与 entities.js 的飞行模型一一对应：
     vMax/vMil/vStall  m/s      accel/decel  m/s²
     pitch/roll/yaw    rad/s    hp  结构完整度
   ============================================================ */
var AIRCRAFT = [
  {
    id: 'c11',
    model: 'c11',
    name: 'C-11',
    nick: 'Frigatebird',
    cn: '军舰鸟',
    role: '舰载多用途战斗机',
    faction: '上游公约',
    planformType: '可变后掠翼',
    maker: '上游公约 · 北岸航空',
    stats: { spd: 0.68, mob: 0.72, stl: 0.55, fire: 0.70, dur: 0.62, rng: 0.76 },
    phys: { vMax: 480, vMil: 372, vStall: 105, accel: 26, decel: 40, pitch: 0.76, roll: 3.0, yaw: 0.30, hp: 130 },
    gun: 'k3',
    variableSweep: true,
    maxLoad: 6500,          // 最大挂载重量 kg，超过只会拖慢自己

    /* 挂载点分组。
       pts 是机体系俯视坐标（机头 +y，右翼 +x，单位米），
       同时也是机库俯视识别图上 Group 引线的锚点 —— 单一数据源。
       kind 决定这一组能挂什么，见文件末尾的挂载属性补丁。 */
    hardpointGroups: [
      { id: 'A', label: '翼尖', kind: 'tip', pts: [{ x: 7.5, y: -2.8 }, { x: -7.5, y: -2.8 }] },
      { id: 'B', label: '翼下内侧', kind: 'heavy', pts: [{ x: 3.2, y: -0.3 }, { x: -3.2, y: -0.3 }] },
      { id: 'C', label: '翼下外侧', kind: 'light', pts: [{ x: 5.6, y: -2.4 }, { x: -5.6, y: -2.4 }] },
      { id: 'D', label: '翼根', kind: 'light', pts: [{ x: 1.95, y: -1.8 }, { x: -1.95, y: -1.8 }] }
    ],
    defaultLoadout: { A: 'srm', B: 'v11', C: 'qsr', D: 'oep' },
    desc: `
<p>上游公约的舰载主力。变后掠翼是为了同时满足两件互相矛盾的事：
在 <b>280 米</b>长的浮岛平台上起降，以及在 15 公里以上维持超音速巡航。</p>
<p>工程师试过三次放弃这个布局，三次都因为同一条结论把它捡了回来 ——
在现有的推力限制下，没有任何一种固定翼方案能同时给出这两种性能。</p>
<p>航电是全机队通用的那一套：多波段有源相控阵、分布式孔径光电、
以及一台有权自主改变干扰策略的电子战协处理器。
代价是每飞行小时 <b>31 个维护工时</b>，全上游公约最高。</p>
<p><b>特点：</b>没有明显短板。挂大型弹时它是最危险的对海平台。</p>`
  },
  {
    id: 'c14',
    model: 'c14',
    name: 'C-14',
    nick: 'Sailfish',
    cn: '旗鱼',
    role: '平流层制空战斗机',
    faction: '上游公约',
    planformType: '菱形翼',
    maker: '上游公约 · 高空试验局',
    stats: { spd: 0.96, mob: 0.84, stl: 0.86, fire: 0.54, dur: 0.32, rng: 0.48 },
    phys: { vMax: 566, vMil: 448, vStall: 122, accel: 33, decel: 36, pitch: 0.80, roll: 3.4, yaw: 0.28, hp: 92 },
    gun: 'k3',
    maxLoad: 4800,

    // C-14 没有翼尖挂架，但有多一处机腹重挂点
    hardpointGroups: [
      { id: 'A', label: '翼下重挂点', kind: 'heavy', pts: [{ x: 2.6, y: -2.3 }, { x: -2.6, y: -2.3 }] },
      { id: 'B', label: '翼下外侧', kind: 'light', pts: [{ x: 4.2, y: -4.2 }, { x: -4.2, y: -4.2 }] },
      { id: 'C', label: '机腹', kind: 'belly', pts: [{ x: 0.95, y: -4.2 }, { x: -0.95, y: -4.2 }] }
    ],
    defaultLoadout: { A: 'mrm', B: 'hos', C: 'ecm2' },
    desc: `
<p>整个上游公约空军只有 <b>31 架</b>。它的存在理由只有一个：<b>两万米</b>。</p>
<p>翼载压到 <b>240 kg/m²</b>，配上第三涵道在 20 公里高度仍能给出的推力，
它是这个世界上少数几种能在那个高度维持 M2.0 以上机动的有人机。</p>
<p>代价写在数据里：失速速度 <b>122 m/s</b>，结构完整度<b>只有 92</b>。
机体为了减重放弃了几乎所有冗余 ——
在平流层里，一发就能让它回家。</p>
<p><b>特点：</b>能量战之王。在 18 公里以上它是无敌的；
在 5 公里以下它是猎物。永远不要让对手把你拖进低空。</p>`
  },
  {
    id: 's6',
    model: 's6',
    name: 'S-6',
    nick: 'Booby',
    cn: '鲣鸟',
    role: '近距空中支援攻击机',
    faction: '上游公约',
    planformType: '平直翼',
    maker: '上游公约 · 铁砧重工',
    stats: { spd: 0.34, mob: 0.44, stl: 0.30, fire: 0.98, dur: 0.98, rng: 0.60 },
    phys: { vMax: 380, vMil: 320, vStall: 88, accel: 18, decel: 44, pitch: 0.62, roll: 2.2, yaw: 0.34, hp: 250 },
    gun: 'k7',
    maxLoad: 7200,

    // 攻击机：挂点最多，但全是翼下，没有机腹舱
    hardpointGroups: [
      { id: 'A', label: '翼下内侧', kind: 'heavy', pts: [{ x: 3.8, y: -0.4 }, { x: -3.8, y: -0.4 }] },
      { id: 'B', label: '翼下中', kind: 'light', pts: [{ x: 6.2, y: -1.0 }, { x: -6.2, y: -1.0 }] },
      { id: 'C', label: '翼下外侧', kind: 'light', pts: [{ x: 7.8, y: -1.05 }, { x: -7.8, y: -1.05 }] }
    ],
    defaultLoadout: { A: 'asl', B: 'rkt', C: 'hdp' },
    desc: `
<p>鲣鸟是一种以将近 <b>100 公里时速</b>俯冲入水的海鸟。
上游公约的命名委员会在这件事上没花什么心思。</p>
<p>一门 30mm 四管炮、一只 <b>14000 发</b>弹箱、和一口厚达 <b>38 毫米</b>的钛合金浴缸。
这个设计逻辑从一百年前就没变过：把飞行员裹在装甲里，
然后让他飞到防空炮火正中间去。</p>
<p>两台自适应循环发动机塞在翼根，第三涵道的冷气流优先供给那口浴缸和弹药舱 ——
S-6 是全上游公约<b>唯一能扛住一发防空导弹破片</b>的机型。</p>
<p><b>特点：</b>唯一能把机炮当主武器用的飞机。用它打空战是自杀，用它舔地是艺术。</p>`
  },

  /* ============================================================
     C-9 海燕 —— 高空高速截击机
     ============================================================ */
  {
    id: 'c9',
    name: 'C-9', nick: 'Petrel', cn: '海燕',
    role: '高空高速截击机',
    faction: '上游公约',
    planformType: '三角翼',
    maker: '上游公约 · 北岭重工',
    model: 'c9',
    desc: `海燕不是为缠斗造的。它的设计出发点只有一个：
      在最短时间内爬到两万米，然后把那里的东西全打下来。
      <p>为此它付出的代价很直接 —— 翼载高、盘旋差、五千米以下
      笨得像块铁。北岭重工的说法是：<b>海燕不需要低空性能，
      因为低空不是它的战场。</b></p>`,
    stats: { spd: 0.95, mob: 0.40, stl: 0.30, fire: 0.74, dur: 0.58, rng: 0.62 },
    phys: { vMax: 620, vMil: 500, vStall: 138, accel: 34, decel: 32, pitch: 0.48, roll: 2.2, yaw: 0.24, hp: 110 },
    gun: 'k3',
    maxLoad: 5200,
    hardpointGroups: [
      { id: 'A', label: '翼下重挂点', kind: 'heavy', pts: [{ x: 4.1, y: -1.2 }, { x: -4.1, y: -1.2 }] },
      { id: 'B', label: '翼下外侧', kind: 'light', pts: [{ x: 5.9, y: -2.6 }, { x: -5.9, y: -2.6 }] }
    ],
    defaultLoadout: { A: 'hva', B: 'mrm' }
  },

  /* ============================================================
     C-21 贼鸥 —— 多用途隐形战斗机
     ============================================================ */
  {
    id: 'c21',
    name: 'C-21', nick: 'Skua', cn: '贼鸥',
    role: '多用途隐形战斗机',
    faction: '上游公约',
    planformType: '无尾菱形翼',
    maker: '上游公约 · 环带工程',
    model: 'c21',
    desc: `上游公约第一种真正意义上的低可探测飞机，
      正面雷达反射面积大约相当于一只海鸟 —— 名字就是这么来的。
      <p>代价在载弹量上：为了保住隐身，大部分武器必须塞进内埋弹舱。
      一旦外挂，它的隐身性能会掉到和普通战机差不多的水平 ——
      <b>隐身不是一种属性，是一种状态。</b></p>`,
    stats: { spd: 0.72, mob: 0.66, stl: 0.96, fire: 0.56, dur: 0.50, rng: 0.70 },
    phys: { vMax: 540, vMil: 430, vStall: 118, accel: 26, decel: 36, pitch: 0.66, roll: 3.1, yaw: 0.26, hp: 96 },
    gun: 'k3',
    maxLoad: 4200,
    hardpointGroups: [
      { id: 'A', label: '内埋弹舱', kind: 'belly', pts: [{ x: 1.1, y: -2.2 }, { x: -1.1, y: -2.2 }] },
      { id: 'B', label: '翼下挂点', kind: 'light', pts: [{ x: 3.6, y: -3.4 }, { x: -3.6, y: -3.4 }] }
    ],
    defaultLoadout: { A: 'lcm', B: 'oep' }
  },

  /* ============================================================
     C-33 信天翁 —— 无人僚机母机
     ============================================================ */
  {
    id: 'c33',
    name: 'C-33', nick: 'Albatross', cn: '信天翁',
    role: '无人僚机母机',
    faction: '上游公约',
    planformType: '前掠翼',
    maker: '上游公约 · 丹湾飞机厂',
    model: 'c33',
    desc: `前掠翼有个老问题：翼尖会先失速，然后机翼会以一种
      非常壮观的方式自己拧断。这个问题困扰了工程师将近一百年，
      直到复合材料让机翼能按需要弯曲。
      <p>信天翁是上游公约第一架量产的前掠翼飞机。
      它不快，但转得比这里任何一架都快 ——
      而在它后面，通常还跟着两架没有飞行员的飞机。</p>`,
    stats: { spd: 0.52, mob: 0.90, stl: 0.24, fire: 0.60, dur: 0.62, rng: 0.80 },
    phys: { vMax: 470, vMil: 380, vStall: 96, accel: 24, decel: 42, pitch: 0.74, roll: 3.6, yaw: 0.36, hp: 118 },
    gun: 'k3',
    maxLoad: 5000,
    hardpointGroups: [
      { id: 'A', label: '翼下内侧', kind: 'heavy', pts: [{ x: 3.0, y: 0.4 }, { x: -3.0, y: 0.4 }] },
      { id: 'B', label: '翼下外侧', kind: 'light', pts: [{ x: 5.4, y: 1.6 }, { x: -5.4, y: 1.6 }] },
      { id: 'C', label: '翼尖', kind: 'tip', pts: [{ x: 7.4, y: 2.4 }, { x: -7.4, y: 2.4 }] }
    ],
    defaultLoadout: { A: 'wasp', B: 'qsr', C: 'irp' }
  },

  /* ============================================================
     下游同盟的制式机（不可驾驶）

     以前它只作为模型键 m27 存在，AIRCRAFT 表里查不到 ——
     于是 makeAircraft() 会静默回退到 AIRCRAFT[0]，
     HUD 上把 M-27 标成"C-11 军舰鸟"。
     现在它有正式条目：npcOnly 让它不出现在机库，
     但资料库和 HUD 都能正确引用它。
     ============================================================ */
  {
    id: 'm27',
    name: 'M-27', nick: 'Schist', cn: '片岩',
    role: '多用途战斗机',
    faction: '下游同盟',
    planformType: '后掠翼',
    maker: '下游同盟 · 第二航空工厂',
    npcOnly: true,
    model: 'm27',
    desc: `下游同盟能拿出的最好的东西。飞行性能大致相当于十年前的 C-11，
      火控和电子设备还要更旧一代，但产量是上游的三倍 ——
      他们用数量补质量，而且从来不缺愿意坐进去的人。`,
    stats: { spd: 0.62, mob: 0.58, stl: 0.18, fire: 0.68, dur: 0.55, rng: 0.52 },
    phys: { vMax: 505, vMil: 398, vStall: 118, accel: 25, decel: 38, pitch: 0.58, roll: 2.7, yaw: 0.30, hp: 120 },
    gun: 'k7',
    maxLoad: 4000,
    // 挂点只用于资料库展示；下游弹的 fits 为空，所以 defaultLoadout 留空
    hardpointGroups: [
      { id: 'A', label: '翼下内侧', kind: 'heavy', pts: [{ x: 2.9, y: -1.0 }, { x: -2.9, y: -1.0 }] },
      { id: 'B', label: '翼下外侧', kind: 'light', pts: [{ x: 5.2, y: -1.6 }, { x: -5.2, y: -1.6 }] }
    ],
    defaultLoadout: {}
  },

  /* ============================================================
     分水群岛国 —— 名义中立的当地武装
     ============================================================ */
  {
    id: 'k8',
    name: 'K-8', nick: 'Tideline', cn: '潮线',
    role: '轻型拦截机',
    faction: '分水群岛国',
    planformType: '平直翼',
    maker: '分水群岛国 · 丹湾飞机厂',
    npcOnly: true,
    model: 'c14',
    desc: `说是国产，其实只有总装线在本地 —— 发动机来自北边，
      雷达来自南边，两边都很乐意把上一代的东西卖过来。
      它飞不快，也打不远。但在这片空域里，它是唯一一面
      不属于任何一方的旗。`,
    stats: { spd: 0.44, mob: 0.62, stl: 0.14, fire: 0.40, dur: 0.44, rng: 0.48 },
    phys: { vMax: 430, vMil: 350, vStall: 102, accel: 21, decel: 40, pitch: 0.62, roll: 2.9, yaw: 0.32, hp: 100 },
    gun: 'k3',
    maxLoad: 2600,
    hardpointGroups: [
      { id: 'A', label: '翼下', kind: 'light', pts: [{ x: 2.4, y: -0.6 }, { x: -2.4, y: -0.6 }] }
    ],
    defaultLoadout: {}
  },

  /* ============================================================
     调节场管理局 —— 技术机构，状态不明
     ============================================================ */
  {
    id: 'a2',
    name: 'A-2', nick: 'Datum', cn: '水准',
    role: '高空勤务机',
    faction: '调节场管理局',
    planformType: '高展弦比直翼',
    maker: '调节场管理局 · 自建',
    npcOnly: true,
    model: 'sower',
    desc: `管理局自己的飞机。它的活是爬到两万米以上，
      给那些谁也靠不近的单元换零件 —— 那个高度上，
      飞得稳比飞得快重要得多。
      名义上没有武器。不过在那个高度还没有人护航的，
      通常也用不上武器。`,
    stats: { spd: 0.30, mob: 0.22, stl: 0.20, fire: 0.10, dur: 0.72, rng: 0.86 },
    phys: { vMax: 310, vMil: 260, vStall: 78, accel: 11, decel: 34, pitch: 0.34, roll: 2.0, yaw: 0.26, hp: 180 },
    gun: 'k3',
    maxLoad: 900,
    hardpointGroups: [
      { id: 'A', label: '机腹挂点', kind: 'belly', pts: [{ x: 0.9, y: -1.4 }, { x: -0.9, y: -1.4 }] }
    ],
    defaultLoadout: {}
  }
];

/* ============================================================
   武器库
   ============================================================ */
var WEAPONS = {

  /* ---------- 机炮 ---------- */
  k3: {
    name: 'CEL-3', cn: '20mm 六管转膛炮', kind: 'gun',
    rpm: 3900, speed: 1100, dmg: 7, spread: 0.0022, ammo: 6000,
    range: 1600, highRange: 2600,
    desc: '上游公约制式机炮。高射速低单发威力，靠命中数堆伤害。在 18 公里以上有效射程翻倍。'
  },
  k7: {
    name: 'CEL-7', cn: '30mm 四管转膛炮', kind: 'gun',
    rpm: 3900, speed: 1020, dmg: 17, spread: 0.0028, ammo: 14000,
    range: 2000, highRange: 3100,
    desc: 'S-6 专用。一发足以打穿装甲车辆的顶甲。'
  },

  /* ---------- 基础短程空空导弹 ----------
     不再是"默认自带"的东西，而是和其他弹一样占挂载点。
     便宜、量大、性能平庸 —— 这就是它作为基准弹的意义。 */
  srm: {
    id: 'srm', name: 'TOR-2', cn: '短矢 · BOLT', kind: 'aam',
    model: 'missile',
    speed: 760, boost: 180, life: 4.5, vsLife: 12.0,
    turn: 1.75, seeker: 'ir', lockCone: 45 * Math.PI / 180, lockDist: 4200,
    dmg: 30, ammo: 8, cd: 0.55, salvo: 1, flare: 0.38, prox: 20,
    target: 'air', highAltScale: true,
    desc: `基础短程红外弹。转弯率 2.4 rad/s，抗干扰一般，锁定锥 45°。
      单点挂载量是全部弹种里最高的 —— 它就是用来"多带几发"的。`,
    stat: { dmg: 0.34, spd: 0.50, trn: 0.68, rng: 0.36, ecm: 0.30 }
  },

  /* ---------- 空空导弹家族 ----------
     编号前缀取自逻辑语词根，中文代号是给玩家看的那一层。
     参数之间刻意留出取舍：射程远的转弯差，机动好的打不远，
     抗干扰强的弹头小。没有一发通吃的弹。 */

  trm: {
    id: 'trm', name: 'TOR-4', cn: '短哨 · WHISTLE', kind: 'aam',
    model: 'missile',
    speed: 820, boost: 210, life: 5.0, vsLife: 13.0,
    turn: 1.95, seeker: 'ir', lockCone: 50 * Math.PI / 180, lockDist: 4800,
    dmg: 32, ammo: 6, cd: 0.70, salvo: 1, flare: 0.24, prox: 20,
    target: 'air', highAltScale: true,
    desc: '短哨是基础弹的抗干扰改型：换了双色导引头，flare 从 0.38 降到 0.24，' +
      '代价是单价上去了、单挂点只能带 6 发。',
    stat: { dmg: 0.36, spd: 0.56, trn: 0.72, rng: 0.42, ecm: 0.58 }
  },

  hos: {
    id: 'hos', name: 'TOR-6', cn: '环刃 · RINGBLADE', kind: 'aam',
    model: 'missile',
    speed: 700, boost: 240, life: 4.0, vsLife: 11.0,
    turn: 2.60, seeker: 'ir', lockCone: 88 * Math.PI / 180, lockDist: 3200,
    dmg: 28, ammo: 4, cd: 0.60, salvo: 1, flare: 0.42, prox: 18,
    target: 'air', highAltScale: true, hobs: true,
    desc: '环刃的导引头能在 88° 离轴角上锁定 —— 机头都不用转过去就能打。' +
      '转弯率是全家族最高的，但射程和抗干扰都垫底。',
    stat: { dmg: 0.32, spd: 0.42, trn: 0.95, rng: 0.24, ecm: 0.24 }
  },

  mrm: {
    id: 'mrm', name: 'BIN-4', cn: '中继 · RELAY', kind: 'aam',
    model: 'missile',
    speed: 900, boost: 200, life: 8.0, vsLife: 20.0,
    turn: 1.45, seeker: 'radar', lockCone: 32 * Math.PI / 180, lockDist: 8600,
    dmg: 40, ammo: 4, cd: 3.20, salvo: 1, flare: 0.30, prox: 26,
    target: 'air', highAltScale: true, reAcquire: true,
    desc: '主动雷达中距弹。不吃干扰弹 —— 对付它只能靠机动和地形。' +
      '锁定需要时间，打完就得脱离，否则对方会用同样的东西回敬你。',
    stat: { dmg: 0.48, spd: 0.70, trn: 0.52, rng: 0.72, ecm: 0.20 }
  },

  arm: {
    id: 'arm', name: 'BIN-8', cn: '追云 · CLOUDHUNT', kind: 'aam',
    model: 'missile',
    speed: 880, boost: 190, life: 7.5, vsLife: 18.0,
    turn: 1.35, seeker: 'radar', lockCone: 26 * Math.PI / 180, lockDist: 9500,
    dmg: 52, ammo: 2, cd: 4.60, salvo: 1, flare: 0.35, prox: 28,
    target: 'air', highAltScale: true, antiRadar: true,
    desc: '反辐射型。对开机状态的敌方雷达与预警机伤害翻倍，' +
      '但锁定锥特别窄 —— 对方一关雷达就得重新找。',
    stat: { dmg: 0.62, spd: 0.68, trn: 0.48, rng: 0.80, ecm: 0.18 }
  },

  ram: {
    id: 'ram', name: 'CLA-9', cn: '长杆-B · LONGROD-B', kind: 'aam',
    model: 'missile',
    speed: 1150, boost: 160, life: 10.0, vsLife: 24.0,
    turn: 0.92, seeker: 'radar', lockCone: 22 * Math.PI / 180, lockDist: 12500,
    dmg: 58, ammo: 2, cd: 5.20, salvo: 1, flare: 0.72, prox: 30,
    target: 'air', highAltScale: true, scramjet: true, nezer: true,
    desc: '冲压发动机远距弹的改进型。不可逃逸区是全家族最大的，' +
      '但 18 km 以上缺氧，动力段会从 10 秒掉到 2.4 秒 —— 高空它反而不好用。',
    stat: { dmg: 0.70, spd: 0.92, trn: 0.30, rng: 0.96, ecm: 0.14 }
  },

  vlar: {
    id: 'vlar', name: 'DAR-12', cn: '极远 · OUTREACH', kind: 'aam',
    model: 'missile',
    speed: 980, boost: 150, life: 12.0, vsLife: 30.0,
    turn: 0.78, seeker: 'radar', lockCone: 18 * Math.PI / 180, lockDist: 16000,
    dmg: 66, ammo: 1, cd: 7.50, salvo: 1, flare: 0.66, prox: 34,
    target: 'air', highAltScale: true, bigTarget: true,
    desc: '一发就占满一个重挂点。它存在的意义是把预警机和浮空平台' +
      '从护航圈里拽下来 —— 打战斗机是浪费。',
    stat: { dmg: 0.82, spd: 0.78, trn: 0.24, rng: 1.00, ecm: 0.16 }
  },

  qsr: {
    id: 'qsr', name: 'GIR-5', cn: '群刺 · QUILLS', kind: 'aam',
    model: 'missile',
    speed: 740, boost: 190, life: 4.2, vsLife: 11.0,
    turn: 1.70, seeker: 'ir', lockCone: 52 * Math.PI / 180, lockDist: 4000,
    dmg: 24, ammo: 12, cd: 1.40, salvo: 3, flare: 0.40, prox: 16,
    target: 'air', highAltScale: true,
    desc: '三联装发射巢，一个挂点就是三枚。单发威力最小，' +
      '但一次齐射能铺开一片 —— 用来逼对方放弃进攻航线比用来击落更有效。',
    stat: { dmg: 0.26, spd: 0.46, trn: 0.64, rng: 0.34, ecm: 0.22 }
  },

  wasp: {
    id: 'wasp', name: 'SUT-7', cn: '蜂刺 · WASP', kind: 'aam',
    model: 'missile',
    speed: 860, boost: 260, life: 4.8, vsLife: 12.0,
    turn: 2.15, seeker: 'ir', lockCone: 58 * Math.PI / 180, lockDist: 5200,
    dmg: 38, ammo: 3, cd: 1.90, salvo: 1, flare: 0.36, prox: 22,
    target: 'air', highAltScale: true, reAcquire: true,
    desc: '锥刺的轻量版：推力更猛、加速更快，进不可逃逸区比谁都快。' +
      '代价是动力段短，追不上掉头就跑的目标。',
    stat: { dmg: 0.44, spd: 0.62, trn: 0.78, rng: 0.50, ecm: 0.26 }
  },

  /* ---------- 对地与反大型 ---------- */

  asl: {
    id: 'asl', name: 'GUT-9', cn: '滑翔锤 · GLIDEHAMMER', kind: 'agm',
    model: 'missile',
    speed: 320, boost: 90, life: 14.0, vsLife: 26.0,
    turn: 0.55, seeker: 'ir', lockCone: 40 * Math.PI / 180, lockDist: 6000,
    dmg: 150, ammo: 4, cd: 2.40, salvo: 1, flare: 0.55, prox: 26,
    target: 'ground',
    desc: '无动力滑翔制导炸弹。轻、便宜、能多带 —— 一个重挂点塞得下四枚。' +
      '缺点是扔出去之后就只能等，目标挪了就打空。',
    stat: { dmg: 0.52, spd: 0.20, trn: 0.30, rng: 0.48, ecm: 0.60 }
  },

  asl2: {
    id: 'asl2', name: 'GUT-12', cn: '重锤-B · SLEDGE-B', kind: 'agm',
    model: 'missile',
    speed: 480, boost: 140, life: 10.0, vsLife: 22.0,
    turn: 0.90, seeker: 'radar', lockCone: 34 * Math.PI / 180, lockDist: 9000,
    dmg: 340, ammo: 2, cd: 3.60, salvo: 1, flare: 0.75, prox: 34,
    target: 'ground',
    desc: '重型侵彻战斗部，专门对付加固机堡和指挥所。' +
      '一发就能解决一座控制站，但一个挂点只带得下两枚。',
    stat: { dmg: 0.90, spd: 0.36, trn: 0.34, rng: 0.62, ecm: 0.30 }
  },

  sat: {
    id: 'sat', name: 'SPO-6', cn: '云裂 · CLOUDBREAK', kind: 'asm',
    model: 'missile',
    speed: 540, boost: 130, life: 9.0, vsLife: 20.0,
    turn: 1.05, seeker: 'radar', lockCone: 30 * Math.PI / 180, lockDist: 8200,
    dmg: 260, ammo: 2, cd: 3.20, salvo: 1, flare: 0.68, prox: 30,
    target: 'ship', bigTarget: true,
    desc: '为浮空平台设计的串联战斗部：先撕气囊、再打吊舱。' +
      '打战斗机和地面目标都是浪费。',
    stat: { dmg: 0.76, spd: 0.42, trn: 0.42, rng: 0.58, ecm: 0.34 }
  },

  rkt: {
    id: 'rkt', name: 'PEJ-6', cn: '撒星 · STARSCATTER', kind: 'bomb',
    model: 'missile',
    speed: 620, boost: 0, life: 3.0, vsLife: 3.0,
    turn: 0.0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 22, ammo: 28, cd: 1.10, salvo: 7, flare: 1.0, prox: 14,
    target: 'ground', unguided: true,
    desc: '无制导火箭巢。一个挂点就是一片弹雨，覆盖而不瞄准 ——' +
      '对付软目标群最划算，但精度完全靠飞机对准。',
    stat: { dmg: 0.22, spd: 0.34, trn: 0.10, rng: 0.16, ecm: 1.00 }
  },

  clb: {
    id: 'clb', name: 'PEJ-9', cn: '碎玉 · SHARDRIFT', kind: 'bomb',
    model: 'missile',
    speed: 300, boost: 60, life: 12.0, vsLife: 24.0,
    turn: 0.42, seeker: 'ir', lockCone: 36 * Math.PI / 180, lockDist: 5000,
    dmg: 118, ammo: 2, cd: 3.00, salvo: 1, flare: 0.80, prox: 34,
    target: 'ground', cluster: true,
    desc: '子母弹。抛撒覆盖一整片阵地，对分散的软目标效率极高，' +
      '但打不动加固目标 —— 破片啃不开机堡。',
    stat: { dmg: 0.44, spd: 0.18, trn: 0.26, rng: 0.42, ecm: 0.66 }
  },

  /* ---------- 被动吊舱 ----------
     这几件不发射任何东西，装上去就一直在起作用。
     它们让"少带一枚弹"变成一个真实的取舍，而不只是纯损失。 */

  ecm2: {
    id: 'ecm2', name: 'ZUN-8', cn: '静默 · HUSH', kind: 'ecm',
    model: 'missile',
    speed: 0, boost: 0, life: 0, vsLife: 0,
    turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 0, ammo: 0, cd: 0, salvo: 0, flare: 1.0, prox: 0,
    target: 'none', passive: true,
    lockResist: 0.40,
    desc: '拖曳式诱饵。敌方对你的锁定距离缩短 40%，且不需要手动开启 ——' +
      '代价是这个挂点永远空着。',
    stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.92 }
  },

  dec: {
    id: 'dec', name: 'ZUN-12', cn: '雾障 · FOGSCREEN', kind: 'ecm',
    model: 'missile',
    speed: 0, boost: 0, life: 0, vsLife: 0,
    turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 0, ammo: 0, cd: 0, salvo: 0, flare: 1.0, prox: 0,
    target: 'none', passive: true,
    flareBonus: 40,
    desc: '额外挂载 40 组干扰弹的储存舱。想要"按住 V 一直丢"的话，' +
      '这个东西比多带两枚弹有用。',
    stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.74 }
  },

  oep: {
    id: 'oep', name: 'GUS-6', cn: '明瞳 · CLEAREYE', kind: 'ecm',
    model: 'missile',
    speed: 0, boost: 0, life: 0, vsLife: 0,
    turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 0, ammo: 0, cd: 0, salvo: 0, flare: 1.0, prox: 0,
    target: 'none', passive: true,
    lockRangeBonus: 0.45,
    desc: '光电瞄准吊舱。你的锁定距离增加 45%，而且被动测距不会被 RWR 发现。',
    stat: { dmg: 0, spd: 0, trn: 0, rng: 0.90, ecm: 0.40 }
  },

  irp: {
    id: 'irp', name: 'GUS-9', cn: '夜枭 · NIGHTOWL', kind: 'ecm',
    model: 'missile',
    speed: 0, boost: 0, life: 0, vsLife: 0,
    turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 0, ammo: 0, cd: 0, salvo: 0, flare: 1.0, prox: 0,
    target: 'none', passive: true,
    lockRangeBonus: 0.25, lockResist: 0.15,
    desc: '红外搜索与跟踪。锁定距离 +25%，同时略降对方对你的锁定距离 ——' +
      '"你不开雷达，我也不开"，这是高空静默交战的常规配置。',
    stat: { dmg: 0, spd: 0, trn: 0, rng: 0.62, ecm: 0.58 }
  },

  hdp: {
    id: 'hdp', name: 'BAD-3', cn: '护盾 · AEGIS', kind: 'ecm',
    model: 'missile',
    speed: 0, boost: 0, life: 0, vsLife: 0,
    turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 0, ammo: 0, cd: 0, salvo: 0, flare: 1.0, prox: 0,
    target: 'none', passive: true,
    armorBonus: 0.22,
    desc: '附加装甲与灭火抑爆组件，全向减伤 22%。' +
      '它不能让你赢，只能让你活着回来。',
    stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.50 }
  },

  /* ---------- 补位：三个此前没有对应型号的定位 ---------- */

  swm: {
    id: 'swm', name: 'GIR-12', cn: '鸦群 · MURMUR', kind: 'aam',
    model: 'missile',
    speed: 720, boost: 300, life: 3.5, vsLife: 9.0,
    turn: 2.55, seeker: 'ir', lockCone: 55 * Math.PI / 180, lockDist: 3400,
    dmg: 16, ammo: 8, cd: 0.85, salvo: 4, flare: 0.44, prox: 14,
    target: 'air', highAltScale: true,
    desc: `专打无人机的微型弹。战斗部只有 16 单位，但一个挂点塞得下十六发，
      一次齐射四枚 —— 它的用法不是"击落"，而是把蜂群从天上扫下来。
      <b>拿去打有人机是浪费。</b>`,
    stat: { dmg: 0.16, spd: 0.44, trn: 0.72, rng: 0.28, ecm: 0.22 }
  },

  hva: {
    id: 'hva', name: 'SPO-9', cn: '落雷 · THUNDERFALL', kind: 'aam',
    model: 'missile',
    speed: 980, boost: 240, life: 8.0, vsLife: 18.0,
    turn: 1.30, seeker: 'radar', lockCone: 34 * Math.PI / 180, lockDist: 11000,
    dmg: 62, ammo: 1, cd: 6.0, salvo: 1, flare: 0.70, prox: 32,
    target: 'air', highAltImmune: true, bigTarget: true,
    desc: `为两万米以上专门设计的拦截弹。舵面比同级大将近一倍，
      代价是低空阻力大、加速慢。
      <b>它的过载不随空气变稀而崩塌</b> —— 这是它唯一的长处，
      也是在那个高度唯一还重要的东西。`,
    stat: { dmg: 0.78, spd: 0.84, trn: 0.38, rng: 0.88, ecm: 0.24 }
  },

  lcm: {
    id: 'lcm', name: 'GUT-30', cn: '远帆 · FARSAIL', kind: 'agm',
    model: 'missile',
    // 涡扇是全程工作的，所以 life（动力段）要够长，
    // 否则"远程巡航弹"的射程会算得还不如一枚中距弹
    speed: 480, boost: 110, life: 30.0, vsLife: 42.0,
    turn: 0.48, seeker: 'radar', lockCone: 26 * Math.PI / 180, lockDist: 14000,
    dmg: 300, ammo: 1, cd: 8.0, salvo: 1, flare: 0.85, prox: 36,
    target: 'ground', bigTarget: true,
    desc: `涡扇动力的对地巡航弹，射程是全家族里最远的。
      但它飞得慢、转弯迟钝 —— 一旦被拦，连躲的能力都没有。
      <b>它的生存性完全建立在"发射前没人发现你"上。</b>`,
    stat: { dmg: 0.86, spd: 0.30, trn: 0.14, rng: 1.00, ecm: 0.36 }
  },

  /* ---------- 上游公约特殊武器 ---------- */
  v11: {
    id: 'v11', name: 'SUT-11', cn: '锥刺 · STING', kind: 'aam',
    model: 'missile',
    speed: 790, boost: 280, life: 5.0, vsLife: 11.0,
    turn: 2.45, seeker: 'ir', lockCone: 50 * Math.PI / 180, lockDist: 4600,
    dmg: 56, ammo: 16, cd: 1.15, salvo: 1, flare: 0.35, prox: 26,
    target: 'air', reAcquire: true, highAltScale: true,
    desc: `高机动缠斗弹。转弯率 <b>3.4 rad/s</b>（约 60G），
      失去目标后还有<b>一次</b>重新捕获的机会 —— 它会绕回来。抗干扰差。
      <br><span class="am">注意：在高空，它的过载会随动压一起崩塌。</span>`,
    stat: { dmg: 0.62, spd: 0.55, trn: 1.0, rng: 0.40, ecm: 0.25 }
  },
  v9: {
    id: 'v9', name: 'GIR-9', cn: '蜂群 · SWARM', kind: 'aam',
    model: 'missile',
    speed: 830, boost: 200, life: 4.0, vsLife: 9.0,
    turn: 1.90, seeker: 'ir', lockCone: 75 * Math.PI / 180, lockDist: 3800,
    dmg: 44, ammo: 44, cd: 0.80, salvo: 2, flare: 0.50, prox: 22,
    target: 'air', hobs: true, highAltScale: true,
    desc: `大离轴角格斗弹，锁定锥 <b>±75°</b> —— 目标甚至不需要在你前方。
      双发齐射、冷却只有 0.8 秒，是狗斗中的弹药倾泻器。`,
    stat: { dmg: 0.50, spd: 0.60, trn: 0.76, rng: 0.32, ecm: 0.40 }
  },
  v17: {
    id: 'v17', name: 'CLA-17', cn: '长杆 · LANCE', kind: 'aam',
    model: 'missile',
    speed: 1060, boost: 150, life: 10.0, vsLife: 30.0,
    turn: 1.02, seeker: 'radar', lockCone: 25 * Math.PI / 180, lockDist: 9200,
    dmg: 62, ammo: 8, cd: 2.10, salvo: 1, flare: 0.78, prox: 30,
    target: 'air', nezer: true, highAltScale: true, scramjet: true,
    desc: `固体燃料冲压发动机。海平面动力段长达 <b>10 秒</b>，总寿命 30 秒。
      <br><span class="rd">18 公里以上因空气稀薄缺氧，自动降级为火箭模式 ——
      动力段从 10 秒掉到 2.4 秒。</span>在高空，它不再是一件杀手锏。`,
    stat: { dmg: 0.68, spd: 1.0, trn: 0.30, rng: 1.0, ecm: 0.80 }
  },
  v22: {
    id: 'v22', name: 'SPO-22', cn: '锚 · ANCHOR', kind: 'asm',
    model: 'missile',
    speed: 920, boost: 130, life: 12.0, vsLife: 45.0,
    turn: 0.55, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 8600,
    dmg: 260, ammo: 6, cd: 2.4, salvo: 1, flare: 0.85, prox: 34,
    target: 'ship', bigTarget: true,
    desc: `对大型目标的重型弹。命中大型结构时造成毁灭性伤害，
      对战斗机几乎无法命中。<b>靠近调节单元时被交战规则禁用。</b>`,
    stat: { dmg: 1.0, spd: 0.66, trn: 0.16, rng: 0.92, ecm: 0.86 }
  },
  v25: {
    id: 'v25', name: 'GUT-25', cn: '重锤 · MAUL', kind: 'agm',
    model: 'missile',
    speed: 730, boost: 120, life: 14.0, vsLife: 50.0,
    turn: 0.62, seeker: 'radar', lockCone: 45 * Math.PI / 180, lockDist: 8000,
    dmg: 175, ammo: 10, cd: 1.7, salvo: 1, flare: 0.80, prox: 30,
    target: 'ground',
    desc: `防区外空地导弹，攻顶弹道。对固定地面目标一击必毁。
      <b>靠近调节单元时被交战规则禁用。</b>`,
    stat: { dmg: 0.82, spd: 0.52, trn: 0.18, rng: 0.85, ecm: 0.82 }
  },
  v30: {
    id: 'v30', name: 'PEJ-30', cn: '铁蒺藜 · CALTROP', kind: 'bomb',
    model: 'bomb',
    // 无动力滑翔：投放后靠载机初速前进。早期的 speed/life 是 0/99，
    // 意味着这东西在游戏里根本不往前走
    speed: 280, boost: 0, life: 12.0, vsLife: 24.0,
    turn: 0.20, seeker: 'none', lockCone: 60 * Math.PI / 180, lockDist: 2400,
    dmg: 210, ammo: 6, cd: 1.2, salvo: 1, flare: 1.0, prox: 42,
    target: 'ground', cluster: true, unguided: true,
    desc: `激光制导集束炸弹，抛撒 <b>72 枚</b>子弹药，覆盖半径 80 米。
      需要俯冲投放并在命中前保持照射。<b>交战规则禁用区同样锁定。</b>`,
    stat: { dmg: 0.90, spd: 0.10, trn: 0.08, rng: 0.20, ecm: 1.0 }
  },
  e4: {
    id: 'e4', name: 'ZUN-4', cn: '回声 · ECHO', kind: 'ecm',
    model: null,
    speed: 0, boost: 0, life: 0, vsLife: 0,
    turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 0, ammo: 99, cd: 25.0, salvo: 0, flare: 1.0, prox: 0,
    target: 'none', duration: 6.0, lockReduce: 0.40, selfBlind: true,
    desc: `认知电子战吊舱。开启后 <b>6 秒</b>内敌方对你的锁定距离缩短 <b>40%</b>，
      但你自己的雷达同时被压制。冷却 25 秒。
      <br><span class="am">干扰给的不是免疫，是时间。</span>`,
    stat: { dmg: 0.0, spd: 0.0, trn: 0.0, rng: 0.0, ecm: 1.0 }
  },
  l2: {
    id: 'l2', name: 'GUS-2', cn: '日光 · HELIOS', kind: 'dew',
    model: null,
    speed: 0, boost: 0, life: 0, vsLife: 0,
    turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
    dmg: 0, ammo: 99, cd: 18.0, salvo: 0, flare: 1.0, prox: 0,
    target: 'none', charges: 3,
    interceptRange: 1200, interceptCone: 35 * Math.PI / 180,
    interceptChance: 0.55, highAltChance: 0.35,
    desc: `200 kW 级固态激光吊舱。来袭导弹进入 <b>1200 米</b>且与你的夹角小于
      <b>35°</b> 时，有 <b>55%</b> 概率烧毁其导引头。充能 3 次，每 18 秒恢复一次。
      <br><span class="rd">18 公里以上，平流层风切变会把光斑抹开，概率降到 35%。</span>`,
    stat: { dmg: 0.0, spd: 0.0, trn: 0.0, rng: 0.0, ecm: 1.0 }
  },

  /* ---------- 下游武器 ---------- */
  dl4: {
    id: 'dl4', name: 'DAR-4', cn: '砾石 · GRAVEL', kind: 'aam', model: 'missile',
    speed: 880, boost: 210, life: 6.5, vsLife: 16.0,
    turn: 1.25, seeker: 'radar', lockCone: 30 * Math.PI / 180, lockDist: 7200,
    dmg: 30, ammo: 8, cd: 3.4, salvo: 1, flare: 0.45, prox: 28,
    target: 'air', highAltScale: true,
    // 下游专用弹：fits 为空表示玩家挂不上它
    fits: [], perPoint: 0, mass: 0,
    desc: '下游中距弹。'
  },
  dl6: {
    id: 'dl6', name: 'BIN-6', cn: '燧火 · FLINTFIRE', kind: 'aam', model: 'missile',
    speed: 780, boost: 190, life: 4.5, vsLife: 10.0,
    turn: 2.05, seeker: 'ir', lockCone: 60 * Math.PI / 180, lockDist: 3600,
    dmg: 26, ammo: 6, cd: 2.2, salvo: 1, flare: 0.35, prox: 24,
    target: 'air', highAltScale: true,
    fits: [], perPoint: 0, mass: 0,
    desc: '下游格斗弹。'
  },
  dl9: {
    id: 'dl9', name: 'BAD-9', cn: '高墙 · RAMPART', kind: 'aam', model: 'missile',
    speed: 940, boost: 320, life: 9.0, vsLife: 22.0,
    turn: 1.50, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 9000,
    dmg: 48, ammo: 4, cd: 7.0, salvo: 1, flare: 0.60, prox: 34,
    target: 'air', highAltScale: true,
    fits: [], perPoint: 0, mass: 0,
    desc: '地面发射的远程防空导弹。'
  }
};

/* ============================================================
   挂载属性
   —— 单独放在这里而不是塞进 WEAPONS 表里，是为了让"这个弹能挂在
   哪些挂点上、一个挂点带几发、有多重"集中在一处，一眼横着能比较。

     fits     能挂的挂点类型
              tip   翼尖（轻，只受得起小型空空弹）
              light 通用挂架
              heavy 重挂点（大型弹只有这里挂得下）
              belly 机腹（吊舱与对地弹）
     perPoint 单个挂载点提供几发
     mass     单件重量 kg，用来算挂载对机动性的拖累
   ============================================================ */
var STORE_ATTR = {
  /* 空空 */
  srm:  { fits: ['tip', 'light', 'heavy'], perPoint: 8,  mass: 95 },
  trm:  { fits: ['tip', 'light', 'heavy'], perPoint: 6,  mass: 105 },
  hos:  { fits: ['tip', 'light', 'heavy'], perPoint: 4,  mass: 100 },
  qsr:  { fits: ['tip', 'light', 'heavy'], perPoint: 12, mass: 92 },
  wasp: { fits: ['tip', 'light', 'heavy'], perPoint: 3,  mass: 145 },
  swm:  { fits: ['tip', 'light', 'heavy'], perPoint: 16, mass: 62 },
  v9:   { fits: ['tip', 'light', 'heavy'], perPoint: 2,  mass: 110 },
  v11:  { fits: ['light', 'heavy'],        perPoint: 2,  mass: 135 },
  // 中距弹可以进内埋弹舱 —— 隐形机就是靠这个保住隐身的
  mrm:  { fits: ['light', 'heavy', 'belly'], perPoint: 4, mass: 195 },
  v17:  { fits: ['heavy'],                 perPoint: 1,  mass: 285 },
  arm:  { fits: ['heavy'],                 perPoint: 2,  mass: 310 },
  ram:  { fits: ['heavy'],                 perPoint: 2,  mass: 340 },
  vlar: { fits: ['heavy'],                 perPoint: 1,  mass: 720 },
  hva:  { fits: ['heavy'],                 perPoint: 1,  mass: 560 },

  /* 对地与反大型 */
  v25:  { fits: ['heavy', 'belly'],        perPoint: 2,  mass: 330 },
  asl:  { fits: ['light', 'heavy'],        perPoint: 4,  mass: 240 },
  asl2: { fits: ['heavy', 'belly'],        perPoint: 2,  mass: 520 },
  sat:  { fits: ['heavy'],                 perPoint: 2,  mass: 410 },
  v22:  { fits: ['heavy'],                 perPoint: 1,  mass: 640 },
  v30:  { fits: ['heavy', 'belly'],        perPoint: 1,  mass: 295 },
  clb:  { fits: ['heavy', 'belly'],        perPoint: 2,  mass: 350 },
  rkt:  { fits: ['light', 'heavy'],        perPoint: 28, mass: 280 },
  lcm:  { fits: ['heavy', 'belly'],        perPoint: 1,  mass: 780 },

  /* 吊舱（主动） */
  e4:   { fits: ['light', 'belly'],        perPoint: 1,  mass: 215 },
  l2:   { fits: ['light', 'belly'],        perPoint: 1,  mass: 190 },

  /* 吊舱（被动）—— 装上就一直在起作用 */
  ecm2: { fits: ['tip', 'light', 'belly'], perPoint: 1,  mass: 240 },
  dec:  { fits: ['light', 'belly'],        perPoint: 1,  mass: 210 },
  oep:  { fits: ['light', 'belly'],        perPoint: 1,  mass: 175 },
  irp:  { fits: ['tip', 'light', 'belly'], perPoint: 1,  mass: 160 },
  hdp:  { fits: ['light', 'belly'],        perPoint: 1,  mass: 320 }
};

(function () {
  for (var k in STORE_ATTR) {
    if (!Object.prototype.hasOwnProperty.call(WEAPONS, k)) continue;
    for (var f in STORE_ATTR[k]) WEAPONS[k][f] = STORE_ATTR[k][f];
  }
})();

/* ============================================================
   导引品质
   lead = 0   纯追踪 —— 傻追着目标当前的位置，目标一拐弯就甩掉
   lead = 1   完全预测 —— 飞向解算出来的最优拦截点

   这比转弯率更能体现"这枚弹聪不聪明"：一枚转弯率一般但预测准的弹，
   打机动目标反而比一枚只会死咬尾巴的灵活弹更管用。
   基础弹（TOR-2）刻意做得很笨，改进型的钱基本都花在这里。
   ============================================================ */
/* ============================================================
   呼号池
   —— 下游同盟的飞行员用"已经没有可靠降雨的村庄名"当呼号。
   这不是浪漫，是编制上的一种记录方式：这些人来自地图上还标着、
   但实际上已经养不活人的地方。

   上游公约用的是星名（长庚、参宿……），对照之下就是两种世界。
   详见设定集 8.7 节。
   ============================================================ */
var CS_DOWNSTREAM = [
  { cn: '枯河', en: 'DRYRIVER' },
  { cn: '石桥', en: 'STONEBRIDGE' },
  { cn: '空井', en: 'EMPTYWELL' },
  { cn: '灰塘', en: 'ASHPOND' },
  { cn: '断渠', en: 'BROKENCHANNEL' },
  { cn: '白碱', en: 'WHITEALKALI' },
  { cn: '老槐', en: 'OLDLOCUST' },
  { cn: '塌堰', en: 'COLLAPSEDWEIR' },
  { cn: '焦田', en: 'SCORCHEDFIELD' },
  { cn: '哑钟', en: 'SILENTBELL' },
  { cn: '砂岗', en: 'SANDCREST' },
  { cn: '干渠', en: 'DRYCHANNEL' },
  { cn: '裂谷', en: 'RIFTVALLEY' },
  { cn: '秃岭', en: 'BALDRIDGE' },
  { cn: '沉塘', en: 'SUNKENPOND' },
  { cn: '断桥', en: 'BROKENSPAN' },
  { cn: '浅滩', en: 'SHALLOWFORD' },
  { cn: '飞沙', en: 'DRIFTSAND' },
  { cn: '赤土', en: 'REDCLAY' },
  { cn: '远雷', en: 'FARTHUNDER' }
];

/** 取第 i 个下游呼号，格式为 "枯河 DRYRIVER" */
function downstreamCallsign(i) {
  var c = CS_DOWNSTREAM[i % CS_DOWNSTREAM.length];
  return c.cn + ' ' + c.en;
}

/* ============================================================
   挂载定位
   —— 一句话说清"这东西在战场上干什么用"。
   光看 kind（空空/空地）和一堆参数，说不出它扮演什么角色；
   图鉴里单列出来，选装的时候才好横向比较。
   ============================================================ */
var STORE_ROLE = {
  /* 空空 */
  srm:  '近距自卫 · 基础弹',
  trm:  '近距自卫 · 抗干扰',
  hos:  '大离轴格斗',
  qsr:  '近距压制 · 齐射',
  wasp: '快速反应格斗',
  v9:   '大离轴格斗 · 双联',
  v11:  '高机动格斗',
  mrm:  '中距拦截 · 主动雷达',
  arm:  '中距反辐射',
  v17:  '远距拦截 · 冲压',
  ram:  '远距拦截 · 冲压改进',
  vlar: '超远距 · 反预警机',

  /* 对地与反大型 */
  asl:  '防区外对地 · 轻量',
  asl2: '加固目标侵彻',
  v25:  '防区外对地',
  sat:  '反浮空平台',
  v22:  '反大型目标',
  rkt:  '近距火力压制',
  clb:  '面压制 · 子母弹',
  v30:  '面压制 · 集束',

  /* 吊舱 */
  e4:   '主动电子战',
  l2:   '定向能拦截',
  ecm2: '被动 · 抗锁定',
  dec:  '被动 · 干扰弹容量',
  oep:  '被动 · 扩展锁定',
  irp:  '被动 · 静默探测',
  hdp:  '被动 · 生存性',

  /* 下游 */
  dl4:  '中距拦截',
  dl6:  '格斗',
  dl9:  '要地防空',

  /* 补位的三种 */
  swm:  '反无人机 · 蜂群',
  hva:  '极高空拦截',
  lcm:  '远程对地巡航'
};

(function () {
  for (var k in STORE_ROLE) {
    if (Object.prototype.hasOwnProperty.call(WEAPONS, k)) WEAPONS[k].role = STORE_ROLE[k];
  }
})();

/**
 * 估算一枚弹的"有效射程"（公里）—— 动力段能把它送多远。
 *
 * 为什么不直接用 speed × life：那样忽略了加速阶段。
 * 导弹发射时带着载机的速度（约 350 m/s），先加速到 speed，
 * 再匀速飞完动力段剩余时间。出动力段之后它只能滑翔，
 * 机动能力断崖式下降，所以这个数比"总飞行距离"更贴近实战。
 *
 * 返回 null 表示它不是一枚可以"打到某处"的东西（吊舱之类）。
 */
function missileRange(w) {
  if (!w) return null;
  if (w.passive) return null;
  if (!w.speed || !w.life) return null;

  var v0 = 350;                                   // 载机初速
  if (!w.boost) return w.speed * w.life / 1000;   // 无动力（火箭巢）

  var tAcc = Math.min(w.life, Math.max(0, (w.speed - v0) / w.boost));
  var rAcc = v0 * tAcc + 0.5 * w.boost * tAcc * tAcc;
  var rCruise = w.speed * Math.max(0, w.life - tAcc);
  return (rAcc + rCruise) / 1000;
}

var MISSILE_LEAD = {
  srm: 0.38, trm: 0.48, hos: 0.30, qsr: 0.42, wasp: 0.55,
  v9: 0.52, v11: 0.62, mrm: 0.78, v17: 0.82, arm: 0.72,
  ram: 0.86, vlar: 0.90,
  asl: 0.65, asl2: 0.70, sat: 0.68, rkt: 0.0, clb: 0.50,
  v25: 0.66, v22: 0.74, v30: 0.48,
  dl4: 0.74, dl6: 0.48, dl9: 0.80,
  swm: 0.44, hva: 0.80, lcm: 0.62
};

(function () {
  for (var k in MISSILE_LEAD) {
    if (Object.prototype.hasOwnProperty.call(WEAPONS, k)) WEAPONS[k].lead = MISSILE_LEAD[k];
  }
})();

/* ============================================================
   无线电台词
   事件 = 数组，元素 { who, cls, tx, gap }
     cls: 'ally' | 'enemy' | 'cmd' | 'fx'
     gap: 该行念完后等待的秒数
   ============================================================ */
var VOICES = {

  /* ==================== 任务 1 · 第一滴雨 ==================== */
  m1: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: '全体，这里是 SEXTANT。数据链已上传。', gap: 1.0 },
      { who: 'VESPER-2', cls: 'ally', tx: "<b>收到</b>。数据链清楚。", gap: 0.9 },
      { who: 'SEXTANT', cls: 'cmd', tx: '第 7 号地面站的遥测断了两天。我们要知道为什么。', gap: 1.3 },
      { who: 'VESPER-2', cls: 'ally', tx: 'VESPER 2 就位。无线电检查，清楚响亮。', gap: 1.0 },
      { who: 'VESPER-3', cls: 'ally', tx: 'VESPER 3 就位。……这天空闻起来不对。', gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: '闭嘴，3 号。雷达上有回波，方位 030，正在越线。', gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: '<b>五个目标，没有识别码。</b>拦截它们。', gap: 0.8 }
    ],
    tally: [
      { who: 'VESPER-2', cls: 'ally', tx: '目视接触。他们在爬升，速度 400 节。', gap: 1.0 },
      { who: 'VESPER-3', cls: 'ally', tx: '他们挂的不是炸弹。那是测绘吊舱 —— 和一台相干测风仪。', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '……他们在测调节单元的漂移周期。', gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: '确认敌意。VESPER 1，<b>武器自由</b>。', gap: 0.6 }
    ],
    kill1: [
      { who: 'VESPER-2', cls: 'ally', tx: '确认击落。漂亮，长机。', gap: 1.0 }
    ],
    kill2: [
      { who: 'VESPER-3', cls: 'ally', tx: '第二个。他们开始散了。', gap: 1.0 }
    ],
    kill3: [
      { who: 'SEXTANT', cls: 'cmd', tx: '他们在转向脱离。继续压制。', gap: 1.0 }
    ],
    win: [
      { who: 'VESPER-2', cls: 'ally', tx: '最后一个跑了。……他没往南飞。', gap: 1.4 },
      { who: 'VESPER-3', cls: 'ally', tx: '他往主岛去了。往第 7 号站。', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '记录到了。全体返航，油量优先。', gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: '<b>VESPER 1，这一仗赢得很好 —— 但我们的问题一个都没解决。</b>', gap: 0.6 }
    ],
    allyDown: [
      { who: 'SEXTANT', cls: 'cmd', tx: 'VESPER 3 失去信号。……重复，3 号没有回应。', gap: 1.2 }
    ],
    playerHit: [
      { who: 'VESPER-2', cls: 'ally', tx: '长机，你冒烟了！脱离，脱离！', gap: 1.0 }
    ],
    lowQ: [
      { who: 'VESPER-2', cls: 'ally', tx: '长机，你的动压掉到 9 了。把机头压下去，不然你就成气球了。', gap: 1.0 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: 'VESPER 1 掉线了。……全体，撤回浮岛。', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '任务失败。', gap: 0.6 }
    ]
  },

  /* ==================== 任务 2 · 铁砧之下 ==================== */
  m2: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: 'VESPER，新任务：铁砧之下。', gap: 1.2 },
      { who: 'VESPER-3', cls: 'ally', tx: "<b>收到</b>。", gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: '下游在铁砧海域上摆了三个浮空中继平台。它们一直在看我们。', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '<b>云底 900 米。</b>我建议你们走低一点。', gap: 1.3 },
      { who: 'VESPER-2', cls: 'ally', tx: '走低一点。他说得好像我们有选择。', gap: 1.1 },
      { who: 'VESPER-3', cls: 'ally', tx: '岛上还有两个地面站。中继平台负责把它们的信号传回南边。', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '那就把链条打断。祝你好运。', gap: 0.8 }
    ],
    spotted: [
      { who: 'VESPER-3', cls: 'ally', tx: '<b>发射装置激活！</b>他们有我们的高度。', gap: 1.0 },
      { who: 'SEXTANT', cls: 'cmd', tx: '地形遮蔽，现在。把山放在你和它之间。', gap: 0.8 }
    ],
    relayDown: [
      { who: 'VESPER-2', cls: 'ally', tx: '一号中继平台掉下去了。它在漏气 —— 这东西下沉要四十分钟。', gap: 1.3 },
      { who: 'VESPER-3', cls: 'ally', tx: '那就别让它有那四十分钟。打功率调节组件。', gap: 1.0 }
    ],
    radarDown: [
      { who: 'VESPER-2', cls: 'ally', tx: '直接命中。他们的眼睛瞎了。', gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: '确认。整个铁砧海域的空情图刚刚空了一格。', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '……但我们的也空了一格。有东西从南边过来了。', gap: 1.0 }
    ],
    ambush: [
      { who: 'VESPER-3', cls: 'ally', tx: '<b>右转脱离！右转脱离！</b>', gap: 0.9 },
      { who: '枯河', cls: 'enemy', tx: '这里是枯河。目标发现我们了。', gap: 1.1 },
      { who: '石桥', cls: 'enemy', tx: '那就别躲了。全体，攻击。', gap: 0.9 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: '空域清空。干得好，VESPER。', gap: 1.4 },
      { who: 'VESPER-3', cls: 'ally', tx: '……那些是正规军。他们的编队纪律，那不是民兵。', gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: '我知道。这是我们下一步要谈的事。', gap: 0.8 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: 'VESPER 1 失联。任务中止。', gap: 0.6 }
    ]
  },

  /* ==================== 任务 3 · 线 ==================== */
  m3: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: 'VESPER，这是最后一个。', gap: 1.0 },
      { who: 'VESPER-2', cls: 'ally', tx: "<b>明白，照办</b>。", gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: '两万米。下游派了「灰烬」级播撒机上来。', gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: '它们带的不是碘化银。是<b>反凝结核</b> —— 撒下去能让整条季风线哑掉好几年。', gap: 1.5 },
      { who: 'VESPER-2', cls: 'ally', tx: '而我们要在三架飞机上，两万米，把它们全拦下来。', gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: '对。注意你们的动压 —— <b>那个高度没有"加速"这回事。</b>', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '<b>交战规则：阵列空域内，20 公斤以上战斗部全部锁定。</b>你们只有机炮。', gap: 1.4 },
      { who: 'VESPER-3', cls: 'ally', tx: '……机炮。在两万米。', gap: 1.1 },
      { who: 'VESPER-2', cls: 'ally', tx: '那个高度弹道更平。别抱怨了，习惯它。', gap: 0.9 }
    ],
    aceAppears: [
      { who: 'SEXTANT', cls: 'cmd', tx: '等等。有个回波，就在你们上面。单机。', gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: '……识别出来了。是干井。', gap: 1.3 },
      { who: '干井', cls: 'enemy', tx: '所以这就是他们派来的人。', gap: 1.4 },
      { who: '干井', cls: 'enemy', tx: '三架飞机，一堆机炮，一个已经赢了十六年的联盟。', gap: 1.6 },
      { who: '干井', cls: 'enemy', tx: '你们知道最让我难受的是什么吗。', gap: 1.4 },
      { who: '干井', cls: 'enemy', tx: '<b>你们不是坏人。你们只是从来没有抬头看过那条线。</b>', gap: 1.2 }
    ],
    bossHit: [
      { who: 'VESPER-2', cls: 'ally', tx: '他在掉高度！动压撑不住了！', gap: 1.0 }
    ],
    bossPhase2: [
      { who: 'SEXTANT', cls: 'cmd', tx: '他放弃了能量优势。……他在往下带你们。', gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: '别跟下去！你们在下面打不过他！', gap: 1.0 }
    ],
    aceKill: [
      { who: '干井', cls: 'enemy', tx: '…………', gap: 1.4 },
      { who: '干井', cls: 'enemy', tx: '干井。那是我祖母的村子。', gap: 1.6 },
      { who: '干井', cls: 'enemy', tx: '一九六九年，它连着十九个月没下雨。', gap: 1.7 },
      { who: '干井', cls: 'enemy', tx: '那年你们那边发了一份公告，标题是《一个可以复制的成功》。', gap: 1.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: '……他弹射了。重复，他弹射了。', gap: 1.5 },
      { who: 'VESPER-3', cls: 'ally', tx: '让他走。', gap: 1.0 },
      { who: 'VESPER-3', cls: 'ally', tx: '他说的那句话，我一句都不想反驳。', gap: 1.0 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: '播撒机群全部失效。调节场没有受损。', gap: 1.5 },
      { who: 'VESPER-2', cls: 'ally', tx: '第 7 号站的遥测恢复了。输电……不对，是输雨量。', gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: '季风线正在回到偏移前的相位。', gap: 1.4 },
      { who: 'VESPER-3', cls: 'ally', tx: '回到多少？', gap: 1.1 },
      { who: 'SEXTANT', cls: 'cmd', tx: '……百分之四十一。', gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: '剩下的是南边那些。它们从一开始就不在"可以恢复"的那一部分里。', gap: 1.7 },
      { who: 'SEXTANT', cls: 'cmd', tx: '<b>VESPER 1，任务结束。全体返航。</b>', gap: 0.8 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: 'VESPER 1 失去信号。那条线……', gap: 0.8 }
    ]
  }
};
