/* ============================================================
   tags.js —— 机制标签清单（docs/POST2-0IMPL.md 1.8）

   单位的独有机制 = 数据里一个标签 + 机制代码里认标签；
   机制代码里不出现具体单位 id。每个标签在这里声明一次：
     owner  哪个模块负责这条机制
     doc    一句话说明（单位详情页的"机制标签"一行读它）
   数值参数仍是字段（gunResist / lockResist / lead …），标签只表达"有没有这条机制"。
   数据里用了没声明的标签，注册时直接抛错；smoke 另查每个声明过的标签都有人用。
   ============================================================ */
'use strict';

/* ---------- 武器 ---------- */
Tags.declare('twinSeeker',    { owner: 'entities', doc: T('core.tags.doc') });
Tags.declare('decoyMemory',   { owner: 'entities', doc: T('core.tags.doc_2') });
Tags.declare('reAcquire',     { owner: 'entities', doc: T('core.tags.doc_3') });
Tags.declare('hobs',          { owner: 'entities', doc: T('core.tags.doc_4') });
Tags.declare('penetrator',    { owner: 'entities', doc: T('core.tags.doc_5') });
Tags.declare('antiRadar',     { owner: 'combat',   doc: T('core.tags.doc_6') });
Tags.declare('silentLock',    { owner: 'entities', doc: T('core.tags.doc_7') });
Tags.declare('passive',       { owner: 'loadout',  doc: T('core.tags.doc_8') });
Tags.declare('unguided',      { owner: 'entities', doc: T('core.tags.doc_9') });
Tags.declare('ballistic',     { owner: 'entities', doc: T('core.tags.doc_10') });
Tags.declare('highAltImmune', { owner: 'entities', doc: T('core.tags.doc_11') });

/* ---------- 机型 / 设施 ---------- */
Tags.declare('unmanned', { owner: 'game',     doc: T('core.tags.doc_12') });
Tags.declare('hard',     { owner: 'entities', doc: T('core.tags.doc_13') });
Tags.declare('regulator', { owner: 'game',    doc: T('core.tags.doc_14') });
Tags.declare('relay',    { owner: 'game',     doc: T('core.tags.doc_15') });
Tags.declare('sam',      { owner: 'game',     doc: T('core.tags.doc_16') });
Tags.declare('cullFar',  { owner: 'render',   doc: T('core.tags.doc_17') });
// 整备点：关卡 mission.resupply 里按 ref 引用它时，我方玩家驻留在附近可补满弹药、重选挂载（js/engine/world/resupply.js）
Tags.declare('resupply', { owner: 'game',     doc: T('core.tags.doc_19') });
// 无人机航母：带机库（SHIPS[].hangar），按波次从跑道放飞无人机、回收耗尽的无人机（js/missions/_lib.js 的 tickHangar）
Tags.declare('droneCarrier', { owner: 'game', doc: T('core.tags.doc_22') });
// 大范围电子战场：机型数据的 ewField 由 spawnEnemy 转成 ai.jam（js/engine/ai/brain.js 的 jamAuto），半径取 ewField.R
Tags.declare('ewfield', { owner: 'ai', doc: T('core.tags.doc_23') });
// 垂直起降：机型数据的 vtol 字段（参数）由 stepAircraft 读，速度低于 有效 vStall × transK 转入 entities/vtol.js 的悬停分支（海马用）
Tags.declare('vtol',      { owner: 'entities', doc: T('core.tags.doc_24') });
// 读的地方是 psm.js 的 psmGate；VTOL 带上它（悬停分支里没有过失速机动）
// 半主动雷达制导（Fox 1）：导弹只在发射机对该目标持有有效锁定时受引导，丢锁沿航向飞、宽限内重锁恢复（entities/missile.js）
Tags.declare('sarh',      { owner: 'entities', doc: T('core.tags.doc_21') });
// reserved：目前没有机型使用。带上它的 AI 飞机永不撤离（js/engine/ai/retreat.js 的 canRetreat 读它）
Tags.declare('noRetreat', { owner: 'ai', reserved: true, doc: T('core.tags.doc_20') });
Tags.declare('noPSM',    { owner: 'entities', doc: T('core.tags.doc_18') });
