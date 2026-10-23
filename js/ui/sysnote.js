'use strict';

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
