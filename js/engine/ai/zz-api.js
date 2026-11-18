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
  AI.rollTemperament = $.rollTemperament;   // 生成时的随机性格（missions/_lib.js spawnEnemy 在关卡没写 temperament 时调）
  AI.sectorOf = $.sectorOf;        // Director 给友机分的扇区 [中心角, 半宽]（?debug=ai 画扇区环用）
})(AI);
