/* ============================================================
   game.js —— 状态机 / 主循环 / 无线电 / UI 绑定
   ============================================================ */
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

/* ============================================================
   系统提示 —— 屏幕中下方，一次只显示一条，新的顶掉旧的
   ============================================================ */
var SysNote = (function () {
  var timer = null;
  function show(html, opt) {
    opt = opt || {};
    var box = document.getElementById('sysnote');
    if (!box) return;
    /* 和无线电行同一套写法：左侧一截等宽标签 + 色条，正文跟在后面 */
    box.innerHTML = '<div class="sys-line' + (opt.warn ? ' warn' : '') + '">' +
      '<span class="tag">' + (opt.warn ? 'CAUTION' : 'SYS') + '</span>' +
      '<span class="tx">' + html + '</span></div>';
    var line = box.firstChild;
    clearTimeout(timer);
    timer = setTimeout(function () {
      line.style.opacity = '0';
      timer = setTimeout(function () { if (line.parentNode) line.parentNode.removeChild(line); }, 400);
    }, (opt.dur || 2.2) * 1000);
  }
  function clear() {
    clearTimeout(timer);
    var box = document.getElementById('sysnote');
    if (box) box.innerHTML = '';
  }
  return { show: show, clear: clear };
})();

/* ============================================================
   游戏
   ============================================================ */
'use strict';

/* 私有状态对象：$ 只许本命名空间自己的文件读写，跨命名空间走公开函数。
   （docs/POST2-0IMPL.md 1.7） */
var Game = { $: {} };
