(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.jamRanges = jamRanges; $.jamPress = jamPress; $.jamDuty = jamDuty; $.jamState = jamState; $.jamLockOK = jamLockOK; $.jamLockK = jamLockK; $.jamShown = jamShown; $.isRadiating = isRadiating;

  /* ============================================================
     反辐射：谁"正在辐射"
     ============================================================ */
  /* 反辐射弹的判据（`w.tags.antiRadar`）。

     这个字段曾经被从 SPO-8 上删掉过，理由写得很实在：全项目没有任何
     地方读它，世界里既没有"雷达开机状态"、也没有预警机 ——
     一枚只有文案的反辐射弹，实际表现和普通雷达弹毫无区别。

     现在两样都有了：预警机（`aewc`）会一直辐射到被压哑为止，
     干扰机在开机期间辐射，而 EMCON-Δ 是真的把雷达关掉了。
     所以这条语义可以落地了。 */
  /* ============================================================
     被压制时还看不看得见、锁不锁得上（玩家一侧）

     `p.suppressed`（game.js 的 updateJamming，0..1）压的是雷达和数据链。
     丢的是远处的信息：压制强度决定"看得清"能到多远，距离决定闪成什么样。

       d ≤ clearR(s)                 clear    —— 目标框正常
       clearR(s) < d < hideR(s)      flicker  —— 闪烁，越远亮的时间越短
       d ≥ hideR(s)                  hidden   —— 目标框消失

       clearR = max(JAM_BURN_R, JAM_CLEAR0 × (1 − s))      压得越重越近；烧穿距离保底
       hideR  = clearR + max(JAM_FADE_MIN, JAM_FADE0 × (1 − s))

     **只有 clear 的目标能被锁定、能进 F 键候选**；已有的锁定一旦
     变成 flicker / hidden 就被强制取消（game.js 的 updateLock）。
     HUD、锁定、选目标三处都读这里，口径不会对不上。
     友军标记同样受影响，而且看的是**两头**：友机自己在压制场里，
     它报给你的数据链位置也一样会断 —— 取 max(你的 s, 它的 s)（jamPress）。

     AI（友军和敌军都一样）锁目标读 jamLockOK + jamLockK：被压制的飞机
     只能对自己 clearR 以内的目标开火，锁定距离最多减半，开火也更犹豫
     （ai.js 的 fireAtTarget）。AI 没有目标框，闪烁那一段不用管。

     舰船 / 地面设施（kind 'target'）两头都打折：雷达功率大、回波强、
     有多套传感器，比战斗机难压得多。
       它们自己受的压制   updateJamming 里就 × JAM_SURF_K
       玩家看它们         压制 × JAM_SURF_K
       两头的烧穿距离     JAM_BURN_SURF（比飞机远）
     ============================================================ */
  var JAM_MIN = 0.05;

  // 低于它当作没被压制
  $.JAM_BURN_R = 1800;

  // 烧穿距离：再重的压制，这么近也看得清
  var JAM_CLEAR0 = 16000;

  // s → 0 时"看得清"的距离
  var JAM_FADE0 = 10000;

  // s → 0 时闪烁带的宽度
  var JAM_FADE_MIN = 1500;

  // 闪烁带最窄也有这么宽 —— 不会一下子从正常跳到消失
  $.JAM_SURF_K = 0.5;

  // 舰船 / 地面设施：压制打对折
  $.JAM_BURN_SURF = 4500;

  // 舰船 / 地面设施的烧穿距离
  function jamRanges(s, surf) {
    var clearR = Math.max(surf ? $.JAM_BURN_SURF : $.JAM_BURN_R, JAM_CLEAR0 * (1 - s));
    return { clear: clearR, hide: clearR + Math.max(JAM_FADE_MIN, JAM_FADE0 * (1 - s)) };
  }

  /* 亮的时间占比：clear 为 1，hidden 为 0，闪烁带里随距离线性掉到 0 */
  function jamPress(p, e) {
    var s = (p && p.suppressed) || 0;
    if (e && p && e.team === p.team) s = Math.max(s, e.suppressed || 0);
    return s;
  }

  function jamDuty(p, e) {
    if (!p || !e) return 1;
    var surf = e.kind === 'target';
    var s = jamPress(p, e) * (surf ? $.JAM_SURF_K : 1);
    if (s < JAM_MIN) return 1;
    var r = jamRanges(s, surf), d = M3.dist(p.pos, e.pos);
    if (d <= r.clear) return 1;
    if (d >= r.hide) return 0;
    return 1 - (d - r.clear) / (r.hide - r.clear);
  }

  function jamState(p, e) {
    var k = jamDuty(p, e);
    return k >= 1 ? 'clear' : (k <= 0 ? 'hidden' : 'flicker');
  }

  /* 被压制的一方还能不能锁这个目标：在 clearR 以内才行。玩家和 AI 共用。 */
  function jamLockOK(viewer, e) {
    var s = (viewer && viewer.suppressed) || 0;
    if (s < JAM_MIN || !e) return true;
    var surf = viewer.kind === 'target' || e.kind === 'target';
    return M3.dist(viewer.pos, e.pos) <= jamRanges(s, surf).clear;
  }

  /* 锁定距离与锁定速度的折扣：最多减半 */
  function jamLockK(viewer) {
    return 1 - 0.5 * ((viewer && viewer.suppressed) || 0);
  }

  /* 这一帧画不画。每个目标自己的相位（确定性，不用 Math.random —— 否则框会逐帧乱跳）。 */
  var jamSeq = 0;

  function jamShown(p, e, time) {
    var k = jamDuty(p, e);
    if (k >= 1) return true;
    if (k <= 0) return false;
    if (e.jamPhase === undefined) e.jamPhase = ((jamSeq++) * 0.618034) % 1;
    return ((time * 1.7 + e.jamPhase) % 1) < k;
  }

  function isRadiating(e) {
    if (!e || !e.alive) return false;
    if (e.aewc) return !e.aewcJammed;     // 预警机：被压哑就不再是辐射源
    if (e.ewPower > 0) return true;       // 干扰机 / 开机的电子战吊舱
    if (e.emcon) return false;            // 电磁静默：雷达关机
    return false;                         // 普通战斗机不构成反辐射目标
  }
})(Ent);
