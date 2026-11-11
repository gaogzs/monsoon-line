(function (Game) {
  'use strict';
  var $ = Game.$;
  $.beginRearm = beginRearm; $.closeRearm = closeRearm; $.confirmRearm = confirmRearm;

  /* ============================================================
     整备界面（docs/POST2-0IMPL.md 批次 4.2）

     Resupply（engine/world/resupply.js）驻留计时满了，update 调 $.beginRearm(条目)：
       swap = false  直接补满，不弹界面
       swap = true   弹出本界面：只含俯视图、属性条、挂载选择，复用机库的构建函数
                     （buildHangar / buildHardpointEditor 都只读传进去的视图对象，
                       所以这里给它一套自己的元素 id，机库那份不受影响）
     打开期间 $.rearmOpen = true：主循环不进 update（时间、timeLimit、AI 全部冻结），
     键鼠输入也被屏蔽（input.js）。**不复用 togglePause**：那个只管暂停菜单。
     换挂载走机库同一条路（$.getLoadout(ac) 的数组就地改 + saveGame），确认时才落到飞机上；
     落到飞机上走 Resupply.refill → Loadout.apply，所以挂载重量 / 装甲 / 匿踪 / 锁定距离 / 电子战
     一并重算，和机库换挂载之后开局的结果一致。
     ============================================================ */
  var IDS = {
    acName: 'rearmAcName', acRole: 'rearmAcRole', acStats: 'rearmAcStats', acLoadout: 'rearmAcLoadout',
    planCv: 'rearmPlanCv', planCap: 'rearmPlanCap',
    hpList: 'rearmHpList', hpPicker: 'rearmHpPicker', hpNav: 'rearmHpNav'
  };
  $.rearmView = {
    ids: IDS,
    group: null,
    ac: 0,               // AIRCRAFT 下标：打开时取玩家这架的下标（任务中途不会换机型）
    rebuild: function () { $.buildHangar($.rearmView); }
  };

  function beginRearm(entry) {
    var p = $.player;
    if (!p || !p.alive || $.rearmOpen) return;
    if (!entry || !entry.def.swap) { confirmRearm(true); return; }     // 不能换挂载：直接补满
    $.rearmOpen = true;
    // 和打开暂停菜单一样：松开指针、止住持续音
    $.releasePointer();
    SFX.silence(); SFX.warning(false); SFX.gun(false);
    $.rearmView.ac = $.selectedAC;
    $.rearmView.group = null;
    $.buildHangar($.rearmView);
    document.getElementById('rearm').classList.add('on');
    SFX.click();
  }

  function closeRearm() {
    if (!$.rearmOpen) return;
    $.rearmOpen = false;
    document.getElementById('rearm').classList.remove('on');
    $.requestAimLock();
  }

  /* 确认：把（可能已改过的）挂载落到飞机上，补满，关界面。direct = 没弹界面（swap:false）。 */
  function confirmRearm(direct) {
    var p = $.player;
    if (!p || !p.alive) { closeRearm(); return; }
    var ac = AIRCRAFT[direct === true ? $.selectedAC : $.rearmView.ac];
    Resupply.refill(p, ac, $.getLoadout(ac));
    $.syncWeapon(p);
    if (direct !== true) closeRearm();
    SFX.confirm();
    $.banner = { t: 2.6, title: T('ui.screens.rearm.banner.title'), sub: T('ui.screens.rearm.banner.sub'), col: HUD.CY };
  }

  $.bindRearm = function () {
    var b = document.getElementById('btnRearmConfirm');
    if (b) b.onclick = function () { confirmRearm(); };
  };
})(Game);
