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
    maker: '上游公约 · 北岸航空',
    stats: { spd: 0.68, mob: 0.72, stl: 0.55, fire: 0.70, dur: 0.62, rng: 0.76 },
    phys: { vMax: 480, vMil: 372, vStall: 105, accel: 26, decel: 40, pitch: 0.60, roll: 3.0, yaw: 0.30, hp: 130 },
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
    defaultLoadout: { A: 'srm', B: 'v11', C: 'v9', D: null },
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
    maker: '上游公约 · 高空试验局',
    stats: { spd: 0.96, mob: 0.84, stl: 0.86, fire: 0.54, dur: 0.32, rng: 0.48 },
    phys: { vMax: 566, vMil: 448, vStall: 122, accel: 33, decel: 36, pitch: 0.63, roll: 3.4, yaw: 0.28, hp: 92 },
    gun: 'k3',
    maxLoad: 4800,

    // C-14 没有翼尖挂架，但有多一处机腹重挂点
    hardpointGroups: [
      { id: 'A', label: '翼下重挂点', kind: 'heavy', pts: [{ x: 2.6, y: -2.3 }, { x: -2.6, y: -2.3 }] },
      { id: 'B', label: '翼下外侧', kind: 'light', pts: [{ x: 4.2, y: -4.2 }, { x: -4.2, y: -4.2 }] },
      { id: 'C', label: '机腹', kind: 'belly', pts: [{ x: 0.95, y: -4.2 }, { x: -0.95, y: -4.2 }] }
    ],
    defaultLoadout: { A: 'v17', B: 'v9', C: 'e4' },
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
    maker: '上游公约 · 铁砧重工',
    stats: { spd: 0.34, mob: 0.44, stl: 0.30, fire: 0.98, dur: 0.98, rng: 0.60 },
    phys: { vMax: 380, vMil: 320, vStall: 88, accel: 18, decel: 44, pitch: 0.50, roll: 2.2, yaw: 0.34, hp: 250 },
    gun: 'k7',
    maxLoad: 7200,

    // 攻击机：挂点最多，但全是翼下，没有机腹舱
    hardpointGroups: [
      { id: 'A', label: '翼下内侧', kind: 'heavy', pts: [{ x: 3.8, y: -0.4 }, { x: -3.8, y: -0.4 }] },
      { id: 'B', label: '翼下中', kind: 'light', pts: [{ x: 6.2, y: -1.0 }, { x: -6.2, y: -1.0 }] },
      { id: 'C', label: '翼下外侧', kind: 'light', pts: [{ x: 7.8, y: -1.05 }, { x: -7.8, y: -1.05 }] }
    ],
    // 集束弹只适配重挂点，翼下中那个通用挂架挂不下它
    defaultLoadout: { A: 'v25', B: 'srm', C: 'l2' },
    desc: `
<p>鲣鸟是一种以将近 <b>100 公里时速</b>俯冲入水的海鸟。
上游公约的命名委员会在这件事上没花什么心思。</p>
<p>一门 30mm 四管炮、一只 <b>1350 发</b>弹箱、和一口厚达 <b>38 毫米</b>的钛合金浴缸。
这个设计逻辑从一百年前就没变过：把飞行员裹在装甲里，
然后让他飞到防空炮火正中间去。</p>
<p>两台自适应循环发动机塞在翼根，第三涵道的冷气流优先供给那口浴缸和弹药舱 ——
S-6 是全上游公约<b>唯一能扛住一发防空导弹破片</b>的机型。</p>
<p><b>特点：</b>唯一能把机炮当主武器用的飞机。用它打空战是自杀，用它舔地是艺术。</p>`
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
    turn: 2.40, seeker: 'ir', lockCone: 45 * Math.PI / 180, lockDist: 4200,
    dmg: 30, ammo: 8, cd: 0.55, salvo: 1, flare: 0.38, prox: 20,
    target: 'air', highAltScale: true,
    desc: `基础短程红外弹。转弯率 2.4 rad/s，抗干扰一般，锁定锥 45°。
      单点挂载量是全部弹种里最高的 —— 它就是用来"多带几发"的。`,
    stat: { dmg: 0.34, spd: 0.50, trn: 0.68, rng: 0.36, ecm: 0.30 }
  },

  /* ---------- 上游公约特殊武器 ---------- */
  v11: {
    id: 'v11', name: 'SUT-11', cn: '锥刺 · STING', kind: 'aam',
    model: 'missile',
    speed: 790, boost: 280, life: 5.0, vsLife: 11.0,
    turn: 3.40, seeker: 'ir', lockCone: 50 * Math.PI / 180, lockDist: 4600,
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
    turn: 2.60, seeker: 'ir', lockCone: 75 * Math.PI / 180, lockDist: 3800,
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
    speed: 0, boost: 0, life: 99, vsLife: 99,
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
    turn: 1.70, seeker: 'radar', lockCone: 30 * Math.PI / 180, lockDist: 7200,
    dmg: 30, ammo: 8, cd: 3.4, salvo: 1, flare: 0.45, prox: 28,
    target: 'air', highAltScale: true,
    // 下游专用弹：fits 为空表示玩家挂不上它
    fits: [], perPoint: 0, mass: 0,
    desc: '下游中距弹。'
  },
  dl6: {
    id: 'dl6', name: 'BIN-6', cn: '燧火 · FLINTFIRE', kind: 'aam', model: 'missile',
    speed: 780, boost: 190, life: 4.5, vsLife: 10.0,
    turn: 2.90, seeker: 'ir', lockCone: 60 * Math.PI / 180, lockDist: 3600,
    dmg: 26, ammo: 6, cd: 2.2, salvo: 1, flare: 0.35, prox: 24,
    target: 'air', highAltScale: true,
    fits: [], perPoint: 0, mass: 0,
    desc: '下游格斗弹。'
  },
  dl9: {
    id: 'dl9', name: 'BAD-9', cn: '高墙 · RAMPART', kind: 'aam', model: 'missile',
    speed: 940, boost: 320, life: 9.0, vsLife: 22.0,
    turn: 2.10, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 9000,
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
  srm: { fits: ['tip', 'light', 'heavy'], perPoint: 4, mass: 95 },
  v9:  { fits: ['tip', 'light', 'heavy'], perPoint: 2, mass: 110 },
  v11: { fits: ['light', 'heavy'],        perPoint: 2, mass: 135 },
  v17: { fits: ['heavy'],                 perPoint: 1, mass: 285 },
  v22: { fits: ['heavy'],                 perPoint: 1, mass: 640 },
  v25: { fits: ['heavy', 'belly'],        perPoint: 2, mass: 330 },
  v30: { fits: ['heavy', 'belly'],        perPoint: 1, mass: 295 },
  e4:  { fits: ['light', 'belly'],        perPoint: 1, mass: 215 },
  l2:  { fits: ['light', 'belly'],        perPoint: 1, mass: 190 }
};

(function () {
  for (var k in STORE_ATTR) {
    if (!Object.prototype.hasOwnProperty.call(WEAPONS, k)) continue;
    for (var f in STORE_ATTR[k]) WEAPONS[k][f] = STORE_ATTR[k][f];
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
      { who: 'FLINT-2', cls: 'enemy', tx: '这里是燧石 2。目标发现我们了。', gap: 1.1 },
      { who: 'FLINT-1', cls: 'enemy', tx: '那就别躲了。全体，攻击。', gap: 0.9 }
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
      { who: 'DRYWELL', cls: 'enemy', tx: '所以这就是他们派来的人。', gap: 1.4 },
      { who: 'DRYWELL', cls: 'enemy', tx: '三架飞机，一堆机炮，一个已经赢了十六年的联盟。', gap: 1.6 },
      { who: 'DRYWELL', cls: 'enemy', tx: '你们知道最让我难受的是什么吗。', gap: 1.4 },
      { who: 'DRYWELL', cls: 'enemy', tx: '<b>你们不是坏人。你们只是从来没有抬头看过那条线。</b>', gap: 1.2 }
    ],
    bossHit: [
      { who: 'VESPER-2', cls: 'ally', tx: '他在掉高度！动压撑不住了！', gap: 1.0 }
    ],
    bossPhase2: [
      { who: 'SEXTANT', cls: 'cmd', tx: '他放弃了能量优势。……他在往下带你们。', gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: '别跟下去！你们在下面打不过他！', gap: 1.0 }
    ],
    aceKill: [
      { who: 'DRYWELL', cls: 'enemy', tx: '…………', gap: 1.4 },
      { who: 'DRYWELL', cls: 'enemy', tx: '干井。那是我祖母的村子。', gap: 1.6 },
      { who: 'DRYWELL', cls: 'enemy', tx: '一九六九年，它连着十九个月没下雨。', gap: 1.7 },
      { who: 'DRYWELL', cls: 'enemy', tx: '那年你们那边发了一份公告，标题是《一个可以复制的成功》。', gap: 1.8 },
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
