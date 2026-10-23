(function (Game) {
  'use strict';
  var $ = Game.$;
  $.getLoadout = getLoadout; $.hpKindLabel = hpKindLabel;

  /* ============================================================
     挂载系统（玩家当前选中的配置；展开 / 称重 / 落到飞机在 js/engine/loadout.js）
     ============================================================ */

  /** 取某机型的挂载配置（按需初始化成默认值） */
  function getLoadout(ac) {
    if (!$.loadouts[ac.id]) $.loadouts[ac.id] = Loadout.defaults(ac);
    return $.loadouts[ac.id];
  }

  function hpKindLabel(k) {
    return ({ tip: T('engine.game.loadout.hpKindLabel.tip'), light: T('engine.game.loadout.hpKindLabel.light'), heavy: T('engine.game.loadout.hpKindLabel.heavy'), belly: T('engine.game.loadout.hpKindLabel.belly') })[k] || k;
  }
})(Game);
