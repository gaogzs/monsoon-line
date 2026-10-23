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
  HUD.RED = $.RED;
})(HUD);
