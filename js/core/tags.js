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
