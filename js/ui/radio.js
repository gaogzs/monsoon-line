'use strict';

/* ============================================================
   无线电字幕
   ============================================================ */
var Radio = (function () {
  var queue = [], timer = 0, box = null, live = [];

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
    d.innerHTML = (L.who ? '<span class="who">' + L.who + '</span>' : '') +
      '<span class="tx">' + L.tx + '</span>';
    b.appendChild(d);
    live.push({ node: d, t: 5.6 });
    while (live.length > 4) {
      var old = live.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
    if (L.cls !== 'fx') SFX.radio();
  }

  return { play: play, raw: raw, update: update, clear: clear };
})();
