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
  ace: 'WINTERPORT'
};

/* ============================================================
   呼号池
   —— 下游同盟的飞行员用"已经没有可靠降雨的村庄名"当呼号。
   这不是浪漫，是编制上的一种记录方式：这些人来自地图上还标着、
   但实际上已经养不活人的地方。

   上游公约用的是星名（长庚、参宿……），对照之下就是两种世界。
   详见设定集 8.7 节。
   ============================================================ */
var CS_DOWNSTREAM = [
  /* 原来第一个是「枯河」—— 它同时是一个**国家**的名字（冬港所在的
     枯河国，见设定集第二、六节），拿国名当村名呼号会混。 */
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i0.cn'), en: 'DRYGULLY' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i1.cn'), en: 'STONEBRIDGE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i2.cn'), en: 'EMPTYWELL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i3.cn'), en: 'ASHPOND' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i4.cn'), en: 'BROKENCHANNEL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i5.cn'), en: 'WHITEALKALI' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i6.cn'), en: 'OLDLOCUST' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i7.cn'), en: 'COLLAPSEDWEIR' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i8.cn'), en: 'SCORCHEDFIELD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i9.cn'), en: 'SILENTBELL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i10.cn'), en: 'SANDCREST' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i11.cn'), en: 'DRYCHANNEL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i12.cn'), en: 'RIFTVALLEY' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i13.cn'), en: 'BALDRIDGE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i14.cn'), en: 'SUNKENPOND' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i15.cn'), en: 'BROKENSPAN' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i16.cn'), en: 'SHALLOWFORD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i17.cn'), en: 'DRIFTSAND' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i18.cn'), en: 'REDCLAY' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i19.cn'), en: 'FARTHUNDER' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i20.cn'), en: 'SHEEPDAM' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i21.cn'), en: 'TILEFORD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i22.cn'), en: 'SALTHOLM' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i23.cn'), en: 'FERRYHEAD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i24.cn'), en: 'KILNHEAD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i25.cn'), en: 'MILLHOUSE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i26.cn'), en: 'DAMTAIL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i27.cn'), en: 'WEIRFOOT' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i28.cn'), en: 'DYKEHOLD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i29.cn'), en: 'WELLHEAD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i30.cn'), en: 'WASTEFORD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i31.cn'), en: 'STONEKILN' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i32.cn'), en: 'BEACONMOUND' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i33.cn'), en: 'MULBERRYGROVE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i34.cn'), en: 'WILLOWGULLY' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i35.cn'), en: 'BLACKDITCH' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i36.cn'), en: 'PALESLOPE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i37.cn'), en: 'EMPTYHAMLET' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i38.cn'), en: 'OLDPOST' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i39.cn'), en: 'BROKENDAM' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i40.cn'), en: 'REEDMARSH' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i41.cn'), en: 'MUDBAY' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i42.cn'), en: 'DEADWILLOW' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i43.cn'), en: 'BURNTKILN' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i44.cn'), en: 'OLDFERRY' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i45.cn'), en: 'SANDWELL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i46.cn'), en: 'CROWRIDGE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i47.cn'), en: 'WASTEHAMLET' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i48.cn'), en: 'SHORTMOUND' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i49.cn'), en: 'STONELEDGE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i50.cn'), en: 'FALLENSLOPE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i51.cn'), en: 'SALTWELL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i52.cn'), en: 'YELLOWLEDGE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i53.cn'), en: 'SPLITHAMLET' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i54.cn'), en: 'DRYLEVEE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i55.cn'), en: 'SILTDAM' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i56.cn'), en: 'TORTOISEBACK' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i57.cn'), en: 'COLDSPRING' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i58.cn'), en: 'OXPEN' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i59.cn'), en: 'STRAWSTACK' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i60.cn'), en: 'ALKALIPIT' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i61.cn'), en: 'RIVERBEND' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i62.cn'), en: 'SALTGULLY' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i63.cn'), en: 'FALLINGSTONE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i64.cn'), en: 'SANDSPIT' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i65.cn'), en: 'MUGWORTFLAT' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i66.cn'), en: 'LOCUSTPOD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i67.cn'), en: 'CHARCOALKILN' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i68.cn'), en: 'DRYPASS' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i69.cn'), en: 'EMPTYMESA' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i70.cn'), en: 'DRYINGYARD' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i71.cn'), en: 'BAREMARKET' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i72.cn'), en: 'DESERTPOST' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i73.cn'), en: 'FALLENBRIDGE' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i74.cn'), en: 'BITTERCREEK' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i75.cn'), en: 'SUNKENMILL' },
  { cn: T('data.callsigns.air.CS_DOWNSTREAM.i76.cn'), en: 'ABANDONEDWEIR' }
];

/* 特种机与固定名字占用的词，池里不再发给小队 */
var CS_RESERVED = [T('data.callsigns.air.CS_RESERVED.i0.s1'), T('data.callsigns.air.CS_RESERVED.i1.s1'), T('data.callsigns.air.CS_RESERVED.i2.s1'), T('data.callsigns.air.CS_RESERVED.i3.s1'), T('data.callsigns.air.CS_RESERVED.i4.s1')];

/** 取第 i 个下游呼号（单机、无编号），格式为 "旱沟 DRYGULLY" */
function downstreamCallsign(i) {
  var c = CS_DOWNSTREAM[i % CS_DOWNSTREAM.length];
  return c.cn + ' ' + c.en;
}

/** 小队呼号：sq 是小队词在池中的下标，n 是队内编号。
    同一小队的成员共用一个词，只有编号不同，格式为 "旱沟 DRYGULLY-2" */
function squadCallsign(sq, n) {
  var c = CS_DOWNSTREAM[sq % CS_DOWNSTREAM.length];
  return c.cn + ' ' + c.en + '-' + n;
}
