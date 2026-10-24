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

  function play(missionId, evt) {
    var v = VOICES[missionId];
    if (!v || !v[evt]) return;
    var arr = v[evt];
    for (var i = 0; i < arr.length; i++) queue.push(arr[i]);
  }

  function raw(line) { queue.push(line); }

  function clear() { queue.length = 0; live.length = 0; if (el()) el().innerHTML = ''; }

  function update(dt) {
    timer -= dt;
    if (timer <= 0 && queue.length) {
      var L = queue.shift();
      push(L);
      timer = (L.gap === undefined ? 1.4 : L.gap);
    }
    // 淡出
    for (var i = live.length - 1; i >= 0; i--) {
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
    var b = el();
    if (!b) return;
    var d = document.createElement('div');
    d.className = 'rad-line ' + (L.cls || 'ally') + (L.cls === 'fx' ? ' radiofx' : '');
    var k = distortFn ? (distortFn() || 0) : 0;
    var tx = (k >= GARBLE_MIN && GARBLE_CLS[L.cls || 'ally'] && !L.nogarble) ? garble(L.tx, k) : L.tx;
    d.innerHTML = (L.who ? '<span class="who">' + L.who + '</span>' : '') +
      '<span class="tx">' + tx + '</span>';
    b.appendChild(d);
    live.push({ node: d, t: 5.6 });
    while (live.length > 4) {
      var old = live.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
    if (L.cls !== 'fx') SFX.radio(k);
  }

  return { play: play, raw: raw, update: update, clear: clear, setDistortion: setDistortion, garble: garble };
})();
