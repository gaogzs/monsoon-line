'use strict';

Registry.sealMissions();

/* ============================================================
   查表
   ============================================================ */
function getMission(idx) {
  return MISSIONS[M3.clamp(idx, 0, MISSIONS.length - 1)];
}
