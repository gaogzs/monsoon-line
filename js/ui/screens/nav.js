(function (Game) {
  'use strict';
  var $ = Game.$;
  $.requestAimLock = requestAimLock; $.releasePointer = releasePointer; $.show = show; $.hideAll = hideAll;

  /* ============================================================
     屏幕管理
     ============================================================ */
  /* 鼠标引导要锁定指针：瞄准方向由鼠标位移驱动，没锁的话指针碰到屏幕边缘
     就再也拖不动了。浏览器只允许在用户手势里请求 —— 开始任务的那次点击、
     取消暂停的那次按键、以及画布上的任何一次点击都算。 */
  function requestAimLock() {
    if (!$.cv || !$.aimMode || document.pointerLockElement === $.cv || !$.cv.requestPointerLock) return;
    /* 先要"原始位移"（unadjustedMovement）：绕开系统鼠标加速，Chrome 在
       Windows 上锁定指针时偶发的巨大 movementX/Y 尖峰也少得多。
       浏览器不支持这个选项时 promise 会被拒绝，退回普通锁定。 */
    try {
      var r = $.cv.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) {
        r.catch(function () {
          try {
            var r2 = $.cv.requestPointerLock();
            if (r2 && r2.catch) r2.catch(function () { /* 被拒绝就等下一次点击 */ });
          } catch (err2) { /* 不支持就退回普通指针 */ }
        });
      }
    } catch (err) { /* 不支持就退回普通指针 */ }
  }

  /* 离开飞行（菜单、暂停、战报）时交还鼠标指针 */
  function releasePointer() {
    if (document.pointerLockElement === $.cv && document.exitPointerLock) document.exitPointerLock();
  }

  function show(id) {
    if (id !== 'playing') releasePointer();
    /* 离开战斗界面时必须清掉通讯记录。
       那些行的淡出是靠战斗循环里的 Radio.update() 推进的，
       一旦回到菜单就再没人管它们 —— 于是最后几条会永远挂在屏幕上。
       （从战斗中返回主菜单后残留的通讯记录就是这个原因。） */
    if (id) { Radio.clear(); SysNote.clear(); }

    /* 资料库的详情页有一个常驻的 requestAnimationFrame 在转模型，
       离开这一屏必须停掉 —— 否则它在后台一直烧 CPU（而且画在
       一个已经隐藏的 canvas 上）。 */
    if (id !== 'codex' && id !== 'hangar' && typeof UnitView !== 'undefined') UnitView.stop();

    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    if (id) {
      var s = document.getElementById('scr-' + id);
      if (s) s.classList.add('active');
    }
    $.state = id || 'playing';
  }

  function hideAll() {
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
  }
})(Game);
