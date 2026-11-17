(function (AI) {
  'use strict';
  var $ = AI.$;

  AI.attach = $.attach;
  AI.update = $.update;
  AI.steerTo = $.steerTo;
  AI.findIncoming = $.findIncoming;
  AI.nearestEnemy = $.nearestEnemy;
  AI.leadTo = $.leadTo;
  AI.strafeTarget = $.strafeTarget;
  AI.sectorOf = $.sectorOf;        // Director 给友机分的扇区 [中心角, 半宽]（?debug=ai 画扇区环用）
})(AI);
