'use strict';

/* 舰船的炮位（2-0IMPL 3.5）。模型空间：船头 +z、右舷 +x、上 +y，pos 是甲板上的座圈位置。
   yaw0 是零位朝向（相对船头），arc 是相对零位的射界。
   model 有值的是实体炮塔（models.js 的 tur50 / tur75 / tur120，带 r 的是下游涂装）；
   没有的（近防炮、遥控炮、尾炮）从 pos 直接射出。
   smoke 断言 mounts 的炮数与 arms 文本一致。 */
var ARC_BOW = { yawMin: -2.6, yawMax: 2.6, pitchMin: -0.1, pitchMax: 1.4 };

var ARC_CIWS = { yawMin: -2.8, yawMax: 2.8, pitchMin: -0.2, pitchMax: 1.5 };

/* 全舰只有一座近防炮的船：射界给全向。ARC_CIWS 在零位背面留了 ±0.34 rad 的死角 ——
   双近防的船前后各一座正好互补，单近防装在舰尾、零位朝后的话，船头正前方就没人管，
   而迎头开过去的时候来袭弹正是从那里进来的（v2.3 舷对舷里菊石一枚都拦不下） */
var ARC_CIWS_ALL = { yawMin: -Math.PI, yawMax: Math.PI, pitchMin: -0.2, pitchMax: 1.5 };

var ARC_SIDE = { yawMin: -1.6, yawMax: 1.6, pitchMin: -0.1, pitchMax: 1.4 };

/* 舰船发射器（2-0IMPL 4.3）。和炮位走同一套 Turret 运行时，但单独成表 ——
   smoke 断言 mounts 的炮数与 arms 一致，发射器不算炮。
     mode 'vls'           竖直出管，任意方位的目标都能打
     mode {yaw, elev}     斜置发射架，固定朝向；目标在 yaw ± 半扇区内才发射
     mode 'turret'        可旋转发射架，像炮塔一样转向目标（arc 是射界）
   cells 是备弹数（覆盖发射器的 ammo）。 */
var ARC_VLS = { yawMin: -Math.PI, yawMax: Math.PI, pitchMin: -0.3, pitchMax: 1.5 };

var ARC_RAIL = { yawMin: -1.2, yawMax: 1.2, pitchMin: -0.3, pitchMax: 1.2 };

function _L(id, gun, pos, mode, cells, arc, model) {
  var o = { id: id, gun: gun, pos: pos, cells: cells, role: 'launcher', model: model || null };
  if (mode === 'vls') { o.fixed = 'vls'; o.yaw0 = 0; o.arc = arc || ARC_VLS; }
  else if (mode === 'turret') { o.yaw0 = 0; o.arc = arc || ARC_BOW; }
  else { o.fixed = { yaw: mode.yaw, elev: mode.elev }; o.yaw0 = mode.yaw; o.arc = arc || ARC_RAIL; }
  return o;
}

function _m(id, gun, pos, yaw0, arc, model, role) {
  return { id: id, gun: gun, pos: pos, yaw0: yaw0, arc: arc, model: model || null, role: role };
}
