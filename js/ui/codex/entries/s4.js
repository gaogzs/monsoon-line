Registry.codexEntry({
order: 100,
  cat: T('codex.s4.cat'),
  id: 's4',
  title: T('codex.s4.title'),
  sub: T('codex.s4.sub'),
  html: T('codex.s4.html'),
  /* 和机型图鉴同一个 3D 预览（UnitView.mountModel）：game.js 的 buildCodex
     在设好 innerHTML 之后调用条目的 mount；离开页面时 UnitView.stop() 收尾。 */
  mount: function () {
    var cvs = document.getElementById('cxCell3d');
    if (cvs && typeof UnitView !== 'undefined' && MODELS.cell) UnitView.mountModel(cvs, MODELS.cell);
  }
});
