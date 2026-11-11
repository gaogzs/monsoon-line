(function (HUD) {
  'use strict';
  var $ = HUD.$;

  HUD.draw = $.draw;
  HUD.banner = $.banner;
  HUD.hitMark = $.hitMark;
  HUD.computeNEZ = $.computeNEZ;
  HUD.computeEnvelope = $.computeEnvelope;
  HUD.radarXY = $.radarXY;
  HUD.offscreenRect = $.offscreenRect;
  HUD.drawAlerts = $.drawAlerts;
  HUD.ALERT_ORDER = $.ALERT_ORDER;
  HUD.thrPercent = $.thrPercent;
  HUD.THR_IDLE = $.THR_IDLE;
  HUD.THR_MAX = $.THR_MAX;
  HUD.GREEN = $.GREEN;
  HUD.AMBER = $.AMBER;
  HUD.CY = $.CY;
  // 假目标：smoke 要单独推进它、读它的状态
  HUD.__ghostStep = $.ghostStep;
  HUD.__ghosts = function () { return $.ghosts; };
  HUD.glitch = $.glitch;
  // 战场地图：离线预览要单独画一帧（tools/test 的 SVG 录制）
  HUD.__drawTacMap = $.drawTacMap;
  HUD.RED = $.RED;
})(HUD);
