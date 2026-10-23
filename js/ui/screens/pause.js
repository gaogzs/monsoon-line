(function (Game) {
  'use strict';
  var $ = Game.$;
  $.togglePause = togglePause; $.switchPauseTab = switchPauseTab; $.buildHelpPage = buildHelpPage;

  function togglePause() {
    $.paused = !$.paused;
    document.getElementById('pause').classList.toggle('on', $.paused);
    if (!$.paused) $.requestAimLock();
    if ($.paused) {
      $.releasePointer();
      SFX.silence();
      SFX.warning(false);
      SFX.gun(false);
      // 暂停时把设置与操作说明都渲染好，玩家可以一边调一边看画面变化
      switchPauseTab('main');
      $.buildSettingsInto(document.getElementById('pauseSettings'));
      document.getElementById('pauseHelp').innerHTML = $.buildHelpHTML(true);
    }
    SFX.click();
  }

  /** 切换暂停菜单的页签：main / settings / help */
  function switchPauseTab(name) {
    var tabs = document.querySelectorAll('[data-ptab]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-ptab') === name);
    }
    var panes = ['main', 'settings', 'help'];
    for (i = 0; i < panes.length; i++) {
      var el = document.getElementById('pane-' + panes[i]);
      if (el) el.classList.toggle('on', panes[i] === name);
    }
  }

  function buildHelpPage() {
    var body = document.getElementById('helpBody');
    if (body) body.innerHTML = $.buildHelpHTML(false);
  }
})(Game);
