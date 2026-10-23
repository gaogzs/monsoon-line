'use strict';

/* ============================================================
   水面舰船

   这一片海面上没有发生过一场舰队决战 —— 战利品在 18 000 米的天上。
   所以这里的兵力结构是反的：战斗舰艇很少，支援船很多，
   而排水量最大的那几条船不属于任何交战方。

   命名规则见设定集 8.0.1：上下游两支海军的军舰**不挂字母数字编号**，
   一律按级名称呼（`hull: '虎鲸级'`）—— 字母前缀会让两边的船看起来
   像同一支海军的编号体系。民用船与管理局的船只挂船名。

   下表里的 hp / radius / value / vials / neutral 是**给关卡接入用的**
   —— 当前没有任何代码读取它们，与 `MODELS` 的 span / sea 同一个性质。
   接入方式见 docs/systems/missions.md。
   ============================================================ */
/* ============================================================
   海军呼号（2.3.1）

   格式一律"XX号"，与空军呼号（VESPER / FLINT 这类英文代号）分开。
     上游公约海军  洋流、潮汐、海况与气象术语
     下游同盟海军  看起来像真实河流的地名：水 / 川 / 溪 / 渡 / 涧 + 一个植物字（纯架空）

   剧情里有分量的船在关卡里写死 callsign（见 missions.js 的 spawnShip），
   而且同一条船跨关卡用同一个名字；其余护航舰按名单顺序自动分配，
   跳过 NAVAL_CS_RESERVED 里那些已被剧情船占用的名字。
   ============================================================ */
var NAVAL_CS = {
  '上游公约': [T('data.callsigns.naval.NAVAL_CS.upstream.i0'), T('data.callsigns.naval.NAVAL_CS.upstream.i1'), T('data.callsigns.naval.NAVAL_CS.upstream.i2'), T('data.callsigns.naval.NAVAL_CS.upstream.i3'), T('data.callsigns.naval.NAVAL_CS.upstream.i4'), T('data.callsigns.naval.NAVAL_CS.upstream.i5'), T('data.callsigns.naval.NAVAL_CS.upstream.i6'), T('data.callsigns.naval.NAVAL_CS.upstream.i7'), T('data.callsigns.naval.NAVAL_CS.upstream.i8'), T('data.callsigns.naval.NAVAL_CS.upstream.i9'),
    T('data.callsigns.naval.NAVAL_CS.upstream.i10'), T('data.callsigns.naval.NAVAL_CS.upstream.i11'), T('data.callsigns.naval.NAVAL_CS.upstream.i12'), T('data.callsigns.naval.NAVAL_CS.upstream.i13'), T('data.callsigns.naval.NAVAL_CS.upstream.i14'), T('data.callsigns.naval.NAVAL_CS.upstream.i15'), T('data.callsigns.naval.NAVAL_CS.upstream.i16'), T('data.callsigns.naval.NAVAL_CS.upstream.i17'), T('data.callsigns.naval.NAVAL_CS.upstream.i18'), T('data.callsigns.naval.NAVAL_CS.upstream.i19')],
  '下游同盟': [T('data.callsigns.naval.NAVAL_CS.downstream.i0'), T('data.callsigns.naval.NAVAL_CS.downstream.i1'), T('data.callsigns.naval.NAVAL_CS.downstream.i2'), T('data.callsigns.naval.NAVAL_CS.downstream.i3'), T('data.callsigns.naval.NAVAL_CS.downstream.i4'), T('data.callsigns.naval.NAVAL_CS.downstream.i5'), T('data.callsigns.naval.NAVAL_CS.downstream.i6'), T('data.callsigns.naval.NAVAL_CS.downstream.i7'), T('data.callsigns.naval.NAVAL_CS.downstream.i8'), T('data.callsigns.naval.NAVAL_CS.downstream.i9'),
    T('data.callsigns.naval.NAVAL_CS.downstream.i10'), T('data.callsigns.naval.NAVAL_CS.downstream.i11'), T('data.callsigns.naval.NAVAL_CS.downstream.i12'), T('data.callsigns.naval.NAVAL_CS.downstream.i13'), T('data.callsigns.naval.NAVAL_CS.downstream.i14'), T('data.callsigns.naval.NAVAL_CS.downstream.i15'), T('data.callsigns.naval.NAVAL_CS.downstream.i16'), T('data.callsigns.naval.NAVAL_CS.downstream.i17'), T('data.callsigns.naval.NAVAL_CS.downstream.i18'), T('data.callsigns.naval.NAVAL_CS.downstream.i19')]
};

/* 剧情船的固定呼号 —— 关卡里直接写 callsign: NAVAL_NAMED.xxx */
var NAVAL_NAMED = {
  spermwhale: T('data.callsigns.naval.NAVAL_NAMED.spermwhale'),     // 抹香鲸级：m8 守浮岛、m11 带队南压的旗舰
  humpback: T('data.callsigns.naval.NAVAL_NAMED.humpback'),       // 座头鲸级浮岛：m8
  bluewhale: T('data.callsigns.naval.NAVAL_NAMED.bluewhale'),      // 蓝鲸级支援舰：m8
  cameroceras1: T('data.callsigns.naval.NAVAL_NAMED.cameroceras1'),   // 房角石级一号舰：m4
  cameroceras2: T('data.callsigns.naval.NAVAL_NAMED.cameroceras2'),   // 房角石级二号舰：m11
  ammoniteLead: T('data.callsigns.naval.NAVAL_NAMED.ammoniteLead'),   // 菊石级编队长：m9
  dunkCmd: T('data.callsigns.naval.NAVAL_NAMED.dunkCmd')         // 邓氏鱼级指挥舰：m12（m10 / m11 里提到的也是它）
};

var NAVAL_CS_RESERVED = {};

(function () { for (var k in NAVAL_NAMED) NAVAL_CS_RESERVED[NAVAL_NAMED[k]] = true; })();

/* 护航舰的名单按舰级切段：同一个名字在哪一关都是同一级的船
   （否则 m2 的"黑潮号"是虎鲸、到 m4 又成了海豚）。
   段长 = 这一级在单关里出现的最多条数；顺序 = 首次出场的顺序。
   下游扣掉剧情船后正好剩 13 个：菊石 4 + 三叶虫 6 + 海蝎 3。 */
var NAVAL_CS_POOL = (function () {
  var plan = {
    '上游公约': [['orca', 2], ['dolphin', 2]],
    '下游同盟': [['ammonite', 4], ['trilobite', 6], ['seascorpion', 3]]
  };
  var out = {};
  for (var f in plan) {
    var free = [];
    for (var i = 0; i < NAVAL_CS[f].length; i++) {
      var nm = NAVAL_CS[f][i] + T('data.callsigns.naval.NAVAL_CS_POOL.nm.s1');
      if (!NAVAL_CS_RESERVED[nm]) free.push(nm);
    }
    var at = 0;
    for (var j = 0; j < plan[f].length; j++) {
      out[plan[f][j][0]] = free.slice(at, at + plan[f][j][1]);
      at += plan[f][j][1];
    }
    out['_rest_' + f] = free.slice(at);   // 没列进 plan 的舰级从这里取
  }
  return out;
})();
