(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.U = U; $.gap = gap; $.hmiLayout = hmiLayout; $.draw = draw;

  $.GREEN = '#4fe08a';
  $.AMBER = '#ffb03a';
  $.CY = '#45d6ff';
  $.RED = '#ff4d4d';

  $.BLUE = '#5aa8ff';

  // 友军：屏幕上的友军框、本方射弹的菱形框
  $.DIM = 'rgba(79,224,138,0.42)';

  /* ---------- HUD 缩放 ----------
     两条规则，缺一不可：

     ① 位置一律从"元素所在的那条屏幕边"往内算（而不是从屏幕中心算），
        否则缩放一变，贴边的元素就会朝反方向跑。
     ② 那个间距本身再夹一个屏幕比例上限，
        这样把缩放拉到最大时，元素只会在靠边的地方变粗，不会涨出可视区。

     字号也一起缩放 —— 否则调大之后框变大了字没变，反而更难读。 */
  $.HUDK = 1;

  $.F = '';
  $.FB = '';
  $.FS = '';

  function applyScale(k) {
    $.HUDK = M3.clamp(k, 0.6, 1.8);
    $.F = 'bold ' + (12 * $.HUDK).toFixed(1) + 'px Consolas,monospace';
    $.FB = 'bold ' + (15 * $.HUDK).toFixed(1) + 'px Consolas,monospace';
    $.FS = 'bold ' + (11 * $.HUDK).toFixed(1) + 'px Consolas,monospace';
  }

  applyScale(1);

  /** 长度按缩放折算 */
  function U(v) { return v * $.HUDK; }

  /** 距边的间距：随缩放增大，但不超过屏幕的 limit 比例 */
  function gap(base, size, limit) {
    return Math.min(base * $.HUDK, size * limit);
  }

  /* ============================================================
     右下角布局

     俯视图与 RWR 环是挨着放的两个元素，位置必须由同一处算出来 ——
     否则任何一边改了尺寸，另一边就会错位或者叠上去。

     排列是：
         [ RWR 环 ]  [ 挂载俯视图 ]
     两者底边对齐，俯视图贴右下角，RWR 在它左边。
     ============================================================ */
  function hmiLayout(W, H) {
    var m = gap(16, W, 0.025);
    var size = Math.min(U(168), Math.min(W, H) * 0.20);
    var storeX = W - size - m;
    var storeY = H - size - m;

    var rwrR = Math.min(U(70), Math.min(W, H) * 0.09);
    var rwrX = storeX - U(26) - rwrR;      // 俯视图左侧
    var rwrY = H - m - rwrR;               // 与俯视图底边对齐

    return {
      margin: m,
      size: size, storeX: storeX, storeY: storeY,
      rwrR: rwrR, rwrX: rwrX, rwrY: rwrY
    };
  }

  /* ============================================================
     主入口
     ============================================================ */
  $.CARD = ['N', 'E', 'S', 'W'];

  function draw(world, p, dt, S) {
    var ctx = Renderer.ctx;
    var W = Renderer.W, H = Renderer.H;
    var cam = Renderer.getCam();
    if (!cam || !p) return;

    applyScale(S && S.hudScale !== undefined ? S.hudScale / 100 : 1);

    ctx.save();
    ctx.lineCap = 'butt';
    if (S && S.hudOpacity !== undefined) {
      ctx.globalAlpha = M3.clamp(S.hudOpacity / 100, 0.15, 1);
    }
    if (HUD.dim) ctx.globalAlpha *= 1 - 0.6 * HUD.dim;      // 失败停留画面：压暗（frame.js 写）

    $.drawConeCue(ctx, W, H, cam, p);       // 视场圈最底层：其它 UI 都叠在它上面
    /* 目标框 / 锁定框及其信息文字只比视场圈高一层：仪表、雷达、武器面板等 UI 都盖在它们上面 */
    $.drawTargets(ctx, W, H, cam, p, world);
    $.drawGhosts(ctx, W, H, cam, p, world);   // 电磁干扰下的假目标（纯显示层）
    $.drawCompass(ctx, W, H, p, world, S, cam);
    $.drawPitchLadder(ctx, W, H, cam, p, S);
    $.drawBoresight(ctx, W, H, p);
    $.drawTapes(ctx, W, H, p, S);
    $.drawRadar(ctx, W, H, p, world);
    $.drawEnginePanel(ctx, W, H, p);
    $.drawThreatRing(ctx, W, H, p, world);
    $.drawLaserStatus(ctx, W, H, p, world);
    $.drawLeadReticle(ctx, W, H, cam, p);   // 画在目标框之上，免得被挡住
    $.drawCcip(ctx, W, H, cam, p);          // 无制导炸弹 / 火箭的预计落点（CCIP）
    $.drawFootprint(ctx, W, H, cam, p);     // 精确制导炸弹的动态瞄准圈（泪滴形）
    $.drawFriendlyShots(ctx, W, H, cam, p, world);
    $.drawIncomingMissiles(ctx, W, H, cam, p, world);
    $.drawStores(ctx, W, H, p);
    $.drawWeaponPanel(ctx, W, H, p);
    $.drawTargetBearing(ctx, W, H, p, p.target);
    $.drawAlerts(ctx, W, H, p, world);
    $.drawObjective(ctx, W, H, world);

    ctx.restore();
    /* 全屏滤镜（干扰 / 受伤闪红）在 hudOpacity 之外画 —— 见 hudfx.js */
    if (typeof HudFx !== 'undefined') HudFx.draw(ctx, W, H, p);
  }
})(HUD);
