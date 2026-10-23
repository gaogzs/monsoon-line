(function (Game) {
  'use strict';
  var $ = Game.$;
  $.buildCodex = buildCodex;

  /* ============================================================
     资料库
     ============================================================ */
  var codexSel = 0;

  /* 单位详情页：null = 正在看普通条目；否则 { kind, id }。
     两个图鉴条目（inv1 机型 / inv3 舰艇）里的单位名是可点的，
     点进去看这一型自己的 3D 旋转预览、俯视图、设定与参数。
     详情页**不占左侧导航的一项** —— 它挂在当前条目之下，
     返回时仍停在原来那一条上。 */
  var codexUnit = null;

  function buildCodex() {
    /* 重建前先停掉上一份 3D 预览：不然每切一次条目就多一个
       常驻的 requestAnimationFrame，越点越卡 */
    if (typeof UnitView !== 'undefined') UnitView.stop();

    var nav = document.getElementById('codexNav');
    nav.innerHTML = '';
    var lastCat = null;
    for (var i = 0; i < CODEX.length; i++) {
      if (CODEX[i].cat !== lastCat) {
        lastCat = CODEX[i].cat;
        var c = document.createElement('div');
        c.className = 'cx-cat';
        c.textContent = lastCat;
        nav.appendChild(c);
      }
      (function (idx) {
        var d = document.createElement('div');
        d.className = 'cx-item' + (idx === codexSel ? ' sel' : '');
        d.textContent = CODEX[idx].title;
        d.onclick = function () {
          codexSel = idx;
          codexUnit = null;          // 换条目 = 退出详情
          SFX.click();
          buildCodex();
        };
        nav.appendChild(d);
      })(i);
    }

    var bodyEl = document.getElementById('codexBody');
    if (codexUnit && typeof UnitView !== 'undefined') {
      bodyEl.innerHTML = UnitView.html(codexUnit.kind, codexUnit.id);
      bindCodexUnits(bodyEl);
      UnitView.mount(codexUnit.kind, codexUnit.id);
      return;
    }

    var e = CODEX[codexSel];
    // 条目可以给静态 html，也可以给 build() 现场生成 ——
    // 图鉴那几条必须动态生成，否则改了武器数据文档就对不上了
    var body = typeof e.build === 'function' ? e.build() : (e.html || '');
    bodyEl.innerHTML =
      '<div class="cx-title">' + e.title + '</div>' +
      '<div class="cx-sub">' + e.sub + '</div>' +
      '<div class="cx-text">' + body + '</div>';
    bindCodexUnits(bodyEl);
    // 条目自带的小部件（例如 s4 的调节单元 3D 预览）在 DOM 就位之后再挂
    if (typeof e.mount === 'function') e.mount();
  }

  /* 图鉴里的单位链接用**事件委托**，不逐个绑 ----
     正文整块 innerHTML 每次重建，逐个绑会漏、会重复绑；
     委托挂在容器上，重建后重新挂一次即可。

     注意冒烟测试桩的合成事件没有 target（见 tools/test/smoke.js 的
     makeEl().fire），所以断言里是手工构造带 target 的事件对象来测这条路径。 */
  function bindCodexUnits(el) {
    el.onclick = function (ev) {
      var t = ev && ev.target;
      while (t && t !== el) {
        if (t.getAttribute) {
          var u = t.getAttribute('data-unit');
          if (u && typeof UnitView !== 'undefined') {
            var parts = String(u).split(':');
            codexUnit = { kind: parts[0], id: parts[1] };
            SFX.click();
            buildCodex();
            return;
          }
          if (t.getAttribute('data-unit-back')) {
            codexUnit = null;
            SFX.click();
            buildCodex();
            return;
          }
        }
        t = t.parentNode;
      }
    };
  }
})(Game);
