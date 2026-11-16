'use strict';

/* ============================================================
   无线电字幕
   ============================================================ */
var Radio = (function () {
  var queue = [], timer = 0, box = null, live = [];
  /* 电磁干扰度（0–1）。Radio 不直接读 player，由 Game 初始化时注册一个取值函数（setDistortion）。
     台词在队列里保留原文，上屏那一刻才按当时的干扰度加星号（push 里）。 */
  var distortFn = null;
  var GARBLE_MIN = 0.05;          // 与 HUD 的 JAMMED 阈值一致
  var GARBLE_CLS = { ally: 1, enemy: 1, cmd: 1 };   // fx（系统音）与 SysNote 不处理

  function setDistortion(fn) { distortFn = fn; }

  /* 往 html 里**插入**星号（不是替换）：先按标签 / 实体切成"文本段"与"标记段"，
     只在文本段里的字与字之间插；个数 ≈ round(k × 字数 / 6)，位置随机、互不相邻，
     不插进标签或实体内部。k < 0.05 原样返回。rng 缺省 Math.random（测试可传种子）。 */
  function garble(html, k, rng) {
    if (!(k >= GARBLE_MIN) || !html) return html;
    rng = rng || Math.random;
    var parts = html.split(/(<[^>]*>|&#?\w+;)/);          // 奇数下标是标记段
    var slots = [], n = 0, i, j;                          // slots：可插的缝 { 段, 字符位置 }
    for (i = 0; i < parts.length; i += 2) {
      var len = parts[i].length;
      n += len;
      for (j = 1; j < len; j++) slots.push({ p: i, c: j });
    }
    var want = Math.min(Math.round(k * n / 6), Math.floor(slots.length / 2));
    var picked = [], used = {};
    for (var guard = 0; picked.length < want && guard < want * 20; guard++) {
      var s = slots[Math.floor(rng() * slots.length)];
      var key = s.p + ':' + s.c;
      if (used[key] || used[s.p + ':' + (s.c - 1)] || used[s.p + ':' + (s.c + 1)]) continue;   // 不连续
      used[key] = true;
      picked.push(s);
    }
    picked.sort(function (a, b) { return a.p - b.p || b.c - a.c; });   // 同一段从后往前插，下标不乱
    for (i = 0; i < picked.length; i++) {
      var t = parts[picked[i].p];
      parts[picked[i].p] = t.slice(0, picked[i].c) + '*' + t.slice(picked[i].c);
    }
    return parts.join('');
  }

  function el() { if (!box) box = document.getElementById('radio'); return box; }

  /* ============================================================
     Radio 2.0（docs/POST2-0IMPL.md 5.5）：优先级队列 + 按字数的显示时长 + 可见的丢弃记录

     优先级 pri：story（剧情脚本，raw / play 的缺省）> player（玩家指令确认、玩家僚机）> ally（友军闲聊）> chatter（杂项）
       · story 永不过期、永不丢；排在所有低优先级之前，但不打断正在显示的那一句；
         在队里等满 STORY_MAX_WAIT 秒就必定是下一个出队的
       · 低优先级在队里等超过 TTL 就丢弃（记入日志，标 dropped）；同一 key（事件 + 说话人）已在队里时新来的直接丢弃
     节奏：两条上屏之间至少 gap = clamp(0.8 + 0.06 × 上一条字数, 1.2, 4) 秒；台词自己写了 gap 的取较大值
     时长：显示 life = clamp(6 + 0.12 × 字数, 7, 14) 秒（字数 = 去掉 HTML 标记后的文本）
     时间全部由 update(dt) 累加（clock），不读系统时钟：暂停时不走，测试可确定性地推进。
     ============================================================ */
  var PRI = { story: 0, player: 1, ally: 2, chatter: 3 };
  var TTL = { player: 10, ally: 6, chatter: 3 };      // 队里最多等多久（s）；story 不在表里 = 不过期
  var STORY_MAX_WAIT = 4;
  var LOG_MAX = 30;
  var clock = 0, logRing = [];

  function textLen(html) {
    return String(html || '').replace(/<[^>]*>/g, '').replace(/&#?\w+;/g, 'x').length;
  }
  function lineLen(L) { return textLen(L.tx); }
  function lifeOf(L) { return Math.max(7, Math.min(14, 6 + 0.12 * lineLen(L))); }
  function gapAfter(L) {
    var g = Math.max(1.2, Math.min(4, 0.8 + 0.06 * lineLen(L)));
    return L.gap !== undefined && L.gap > g ? L.gap : g;
  }
  function priOf(L) { return PRI[L.pri] === undefined ? 'story' : L.pri; }

  function note(L, dropped) {
    logRing.push({ t: clock, who: L.who || '', tx: L.tx || '', cls: L.cls || 'ally', pri: priOf(L), dropped: !!dropped });
    if (logRing.length > LOG_MAX) logRing.shift();
  }

  function enqueue(L) {
    if (L.key) {
      for (var i = 0; i < queue.length; i++) if (queue[i].L.key === L.key) { note(L, true); return; }   // 同事件同说话人去重
    }
    queue.push({ L: L, wait: 0 });
  }

  function play(missionId, evt) {
    var v = VOICES[missionId];
    if (!v || !v[evt]) return;
    var arr = v[evt];
    for (var i = 0; i < arr.length; i++) enqueue(arr[i]);
  }

  function raw(line) { enqueue(line); }

  function clear() { queue.length = 0; live.length = 0; timer = 0; logRing.length = 0; if (el()) el().innerHTML = ''; }

  // 下一个出队的：等满 STORY_MAX_WAIT 的 story 最优先；否则按优先级，同级先进先出
  function nextIndex() {
    var best = -1, bp = 99, i;
    for (i = 0; i < queue.length; i++) {
      var q = queue[i];
      if (priOf(q.L) === 'story' && q.wait >= STORY_MAX_WAIT) return i;
    }
    for (i = 0; i < queue.length; i++) {
      var p = PRI[priOf(queue[i].L)];
      if (p < bp) { bp = p; best = i; }
    }
    return best;
  }

  function update(dt) {
    clock += dt;
    var i;
    // 排队计时；低优先级超时丢弃
    for (i = queue.length - 1; i >= 0; i--) {
      var q = queue[i];
      q.wait += dt;
      var ttl = TTL[priOf(q.L)];
      if (ttl !== undefined && q.wait > ttl) { note(q.L, true); queue.splice(i, 1); }
    }
    timer -= dt;
    if (timer <= 0 && queue.length) {
      var L = queue.splice(nextIndex(), 1)[0].L;
      push(L);
      timer = gapAfter(L);
    }
    // 淡出
    for (i = live.length - 1; i >= 0; i--) {
      var o = live[i];
      o.t -= dt;
      if (o.t < 0.5) o.node.style.opacity = Math.max(0, o.t / 0.5);
      if (o.t <= 0) {
        if (o.node.parentNode) o.node.parentNode.removeChild(o.node);
        live.splice(i, 1);
      }
    }
  }

  function push(L) {
    note(L, false);
    var b = el();
    if (!b) return;
    var d = document.createElement('div');
    d.className = 'rad-line ' + (L.cls || 'ally') + (L.cls === 'fx' ? ' radiofx' : '');
    var k = distortFn ? (distortFn() || 0) : 0;
    var tx = (k >= GARBLE_MIN && GARBLE_CLS[L.cls || 'ally'] && !L.nogarble) ? garble(L.tx, k) : L.tx;
    d.innerHTML = (L.who ? '<span class="who">' + L.who + '</span>' : '') +
      '<span class="tx">' + tx + '</span>';
    b.appendChild(d);
    live.push({ node: d, t: lifeOf(L) });
    while (live.length > 4) {
      var old = live.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
    if (L.cls !== 'fx') SFX.radio(k);
  }

  /** 最近 LOG_MAX 条记录（含被丢弃的，dropped 为真）；最新的在最后。副本，调用方可随便改。 */
  function log() { return logRing.map(function (e) { return Object.assign({}, e); }); }

  return {
    play: play, raw: raw, update: update, clear: clear, setDistortion: setDistortion, garble: garble,
    log: log, gapAfter: gapAfter, lifeOf: lifeOf, STORY_MAX_WAIT: STORY_MAX_WAIT, TTL: TTL
  };
})();
