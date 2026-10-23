'use strict';

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
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.start.i0.tx'), gap: 1.0 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m1.start.i1.tx'), gap: 0.9 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.start.i2.tx'), gap: 1.3 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m1.start.i3.tx'), gap: 1.0 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m1.start.i4.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.start.i5.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.start.i6.tx'), gap: 0.8 }
    ],
    tally: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m1.tally.i0.tx'), gap: 1.0 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m1.tally.i1.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.tally.i2.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.tally.i3.tx'), gap: 0.6 }
    ],
    kill1: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m1.kill1.i0.tx'), gap: 1.0 }
    ],
    kill2: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m1.kill2.i0.tx'), gap: 1.0 }
    ],
    kill3: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.kill3.i0.tx'), gap: 1.0 }
    ],
    win: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m1.win.i0.tx'), gap: 1.4 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m1.win.i1.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.win.i2.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.win.i3.tx'), gap: 0.6 }
    ],
    allyDown: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.allyDown.i0.tx'), gap: 1.2 }
    ],
    playerHit: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m1.playerHit.i0.tx'), gap: 1.0 }
    ],
    lowQ: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m1.lowQ.i0.tx'), gap: 1.0 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.lose.i0.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m1.lose.i1.tx'), gap: 0.6 }
    ]
  },

  /* ==================== 任务 2 · 铁砧之下 ==================== */
  m2: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.start.i0.tx'), gap: 1.2 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m2.start.i1.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.start.i2.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.start.i3.tx'), gap: 1.3 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m2.start.i4.tx'), gap: 1.1 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m2.start.i5.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.start.i6.tx'), gap: 0.8 }
    ],
    spotted: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m2.spotted.i0.tx'), gap: 1.0 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.spotted.i1.tx'), gap: 0.8 }
    ],
    relayDown: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m2.relayDown.i0.tx'), gap: 1.3 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m2.relayDown.i1.tx'), gap: 1.0 }
    ],
    radarDown: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m2.radarDown.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.radarDown.i1.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.radarDown.i2.tx'), gap: 1.0 }
    ],
    ambush: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m2.ambush.i0.tx'), gap: 0.9 },
      { who: T('data.voices.VOICES.m2.ambush.i1.who'), cls: 'enemy', tx: T('data.voices.VOICES.m2.ambush.i1.tx'), gap: 1.1 },
      { who: T('data.voices.VOICES.m2.ambush.i2.who'), cls: 'enemy', tx: T('data.voices.VOICES.m2.ambush.i2.tx'), gap: 0.9 }
    ],
    /* 基地挨炸 —— "有东西从北边过来了"那句话的兑现 */
    baseHit: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.baseHit.i0.tx'), gap: 1.1 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m2.baseHit.i1.tx'), gap: 0.9 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.baseHit.i2.tx'), gap: 1.0 }
    ],
    baseLow: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.baseLow.i0.tx'), gap: 1.2 }
    ],
    baseLost: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.baseLost.i0.tx'), gap: 1.0 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m2.baseLost.i1.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.baseLost.i2.tx'), gap: 0.8 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.win.i0.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.win.i1.tx'), gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.win.i2.tx'), gap: 0.8 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m2.lose.i0.tx'), gap: 0.6 }
    ]
  },

  /* ==================== 任务 3 · 线 ==================== */
  m3: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.start.i0.tx'), gap: 1.0 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m3.start.i1.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.start.i2.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.start.i3.tx'), gap: 1.5 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m3.start.i4.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.start.i5.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.start.i6.tx'), gap: 1.4 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m3.start.i7.tx'), gap: 1.1 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m3.start.i8.tx'), gap: 0.9 }
    ],
    aceAppears: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.aceAppears.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.aceAppears.i1.tx'), gap: 1.3 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m3.aceAppears.i2.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.aceAppears.i3.tx'), gap: 1.6 },
      { who: T('data.voices.VOICES.m3.aceAppears.i4.who'), cls: 'enemy', tx: T('data.voices.VOICES.m3.aceAppears.i4.tx'), gap: 1.4 },
      { who: T('data.voices.VOICES.m3.aceAppears.i5.who'), cls: 'enemy', tx: T('data.voices.VOICES.m3.aceAppears.i5.tx'), gap: 1.6 },
      { who: T('data.voices.VOICES.m3.aceAppears.i6.who'), cls: 'enemy', tx: T('data.voices.VOICES.m3.aceAppears.i6.tx'), gap: 1.4 },
      { who: T('data.voices.VOICES.m3.aceAppears.i7.who'), cls: 'enemy', tx: T('data.voices.VOICES.m3.aceAppears.i7.tx'), gap: 1.2 }
    ],
    bossHit: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m3.bossHit.i0.tx'), gap: 1.0 }
    ],
    bossPhase2: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.bossPhase2.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.bossPhase2.i1.tx'), gap: 1.0 }
    ],
    aceKill: [
      { who: T('data.voices.VOICES.m3.aceKill.i0.who'), cls: 'enemy', tx: '…………', gap: 1.4 },
      { who: T('data.voices.VOICES.m3.aceKill.i1.who'), cls: 'enemy', tx: T('data.voices.VOICES.m3.aceKill.i1.tx'), gap: 1.7 },
      { who: T('data.voices.VOICES.m3.aceKill.i2.who'), cls: 'enemy', tx: T('data.voices.VOICES.m3.aceKill.i2.tx'), gap: 1.8 },
      { who: T('data.voices.VOICES.m3.aceKill.i3.who'), cls: 'enemy', tx: T('data.voices.VOICES.m3.aceKill.i3.tx'), gap: 1.8 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m3.aceKill.i4.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.aceKill.i5.tx'), gap: 1.6 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.win.i0.tx'), gap: 1.5 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m3.win.i1.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.win.i2.tx'), gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.win.i3.tx'), gap: 1.7 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.win.i4.tx'), gap: 0.9 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m3.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 任务 4 · 空白海域 ==================== */
  m4: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.start.i0.tx'), gap: 1.2 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m4.start.i1.tx'), gap: 0.9 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.start.i2.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.start.i3.tx'), gap: 1.8 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m4.start.i4.tx'), gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.start.i5.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.start.i6.tx'), gap: 0.9 }
    ],
    spotted: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m4.spotted.i0.tx'), gap: 1.0 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.spotted.i1.tx'), gap: 0.9 }
    ],
    hubHit: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m4.hubHit.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.hubHit.i1.tx'), gap: 1.0 }
    ],
    win: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m4.win.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.win.i1.tx'), gap: 1.5 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m4.win.i2.tx'), gap: 1.0 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m4.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 任务 5 · 静默的航标 ==================== */
  m5: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.start.i0.tx'), gap: 1.1 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.start.i1.tx'), gap: 1.7 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m5.start.i2.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.start.i3.tx'), gap: 1.6 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m5.start.i4.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.start.i5.tx'), gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.start.i6.tx'), gap: 1.0 }
    ],
    spotted: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m5.spotted.i0.tx'), gap: 1.1 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.spotted.i1.tx'), gap: 0.9 }
    ],
    radarDown: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m5.radarDown.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.radarDown.i1.tx'), gap: 0.9 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.win.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.win.i1.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.win.i2.tx'), gap: 1.6 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m5.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 任务 6 · 第二梯队 ==================== */
  m6: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.start.i0.tx'), gap: 1.1 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m6.start.i1.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.start.i2.tx'), gap: 1.9 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m6.start.i3.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.start.i4.tx'), gap: 1.5 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m6.start.i5.tx'), gap: 0.9 }
    ],
    contact: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m6.contact.i0.tx'), gap: 1.3 }
    ],
    lowQ: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m6.lowQ.i0.tx'), gap: 1.1 }
    ],
    half: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.half.i0.tx'), gap: 1.5 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.win.i0.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.win.i1.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.win.i2.tx'), gap: 1.2 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m6.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 任务 7 · 雾里 ==================== */
  m7: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.start.i0.tx'), gap: 1.1 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m7.start.i1.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.start.i2.tx'), gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.start.i3.tx'), gap: 1.8 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m7.start.i4.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.start.i5.tx'), gap: 1.2 }
    ],
    spotted: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m7.spotted.i0.tx'), gap: 1.0 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.spotted.i1.tx'), gap: 0.9 }
    ],
    landersDown: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m7.landersDown.i0.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.landersDown.i1.tx'), gap: 1.4 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.win.i0.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.win.i1.tx'), gap: 0.9 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m7.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 任务 8 · 燧石 ==================== */
  m8: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.start.i0.tx'), gap: 1.2 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m8.start.i1.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.start.i2.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.start.i3.tx'), gap: 1.7 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m8.start.i4.tx'), gap: 1.1 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.start.i5.tx'), gap: 1.3 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m8.start.i6.tx'), gap: 1.4 }
    ],
    fleetHit: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m8.fleetHit.i0.tx'), gap: 1.1 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.fleetHit.i1.tx'), gap: 1.2 }
    ],
    shipLost: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.shipLost.i0.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.shipLost.i1.tx'), gap: 1.4 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.win.i0.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.win.i1.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.win.i2.tx'), gap: 1.1 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m8.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 任务 10 · 登陆窗口 ==================== */
  m10: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.start.i0.tx'), gap: 1.4 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m10.start.i1.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.start.i2.tx'), gap: 1.7 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.start.i3.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.start.i4.tx'), gap: 1.5 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m10.start.i5.tx'), gap: 1.2 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m10.start.i6.tx'), gap: 0.9 }
    ],
    windowClosing: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.windowClosing.i0.tx'), gap: 1.0 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m10.windowClosing.i1.tx'), gap: 0.8 }
    ],
    lastOne: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m10.lastOne.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.lastOne.i1.tx'), gap: 0.9 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.win.i0.tx'), gap: 1.4 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m10.win.i1.tx'), gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.win.i2.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.win.i3.tx'), gap: 1.0 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m10.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 任务 9 · 补给线 ==================== */
  m9: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m9.start.i0.tx'), gap: 1.1 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m9.start.i1.tx'), gap: 1.5 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m9.start.i2.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m9.start.i3.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m9.start.i4.tx'), gap: 0.9 }
    ]
  },

  /* ==================== 任务 11 · 舷对舷 ==================== */
  m11: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m11.start.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m11.start.i1.tx'), gap: 1.6 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m11.start.i2.tx'), gap: 0.9 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m11.start.i3.tx'), gap: 1.0 }
    ]
  },

  /* ==================== 任务 12 · 指挥所 ==================== */
  m12: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.start.i0.tx'), gap: 1.1 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m12.start.i1.tx'), gap: 0.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.start.i2.tx'), gap: 1.9 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m12.start.i3.tx'), gap: 1.1 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.start.i4.tx'), gap: 1.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.start.i5.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.start.i6.tx'), gap: 0.9 }
    ],
    contact: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m12.contact.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.contact.i1.tx'), gap: 0.9 }
    ],
    aewDown: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m12.aewDown.i0.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.aewDown.i1.tx'), gap: 0.8 }
    ],
    cpDown: [
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m12.cpDown.i0.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.cpDown.i1.tx'), gap: 1.0 }
    ],
    bossPhase2: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.bossPhase2.i0.tx'), gap: 1.3 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.m12.bossPhase2.i1.tx'), gap: 0.9 }
    ],
    aceKill: [
      { who: T('data.voices.VOICES.m12.aceKill.i0.who'), cls: 'enemy', tx: '…………', gap: 1.4 },
      { who: T('data.voices.VOICES.m12.aceKill.i1.who'), cls: 'enemy', tx: T('data.voices.VOICES.m12.aceKill.i1.tx'), gap: 1.6 },
      { who: T('data.voices.VOICES.m12.aceKill.i2.who'), cls: 'enemy', tx: T('data.voices.VOICES.m12.aceKill.i2.tx'), gap: 1.8 },
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.m12.aceKill.i3.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.aceKill.i4.tx'), gap: 1.2 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.aceKill.i5.tx'), gap: 1.0 }
    ],
    win: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.win.i0.tx'), gap: 1.6 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.win.i1.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.win.i2.tx'), gap: 1.5 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.win.i3.tx'), gap: 1.7 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.win.i4.tx'), gap: 0.9 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.m12.lose.i0.tx'), gap: 0.8 }
    ]
  },

  /* ==================== 随机遭遇 · 第四周 ==================== */
  sk1: {
    start: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.sk1.start.i0.tx'), gap: 1.1 },
      { who: 'VESPER-2', cls: 'ally', tx: T('data.voices.VOICES.sk1.start.i1.tx'), gap: 0.9 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.sk1.start.i2.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.sk1.start.i3.tx'), gap: 1.8 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.sk1.start.i4.tx'), gap: 1.2 }
    ],
    win: [
      { who: 'VESPER-3', cls: 'ally', tx: T('data.voices.VOICES.sk1.win.i0.tx'), gap: 1.4 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.sk1.win.i1.tx'), gap: 1.3 },
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.sk1.win.i2.tx'), gap: 1.0 }
    ],
    lose: [
      { who: 'SEXTANT', cls: 'cmd', tx: T('data.voices.VOICES.sk1.lose.i0.tx'), gap: 0.8 }
    ]
  }
};
