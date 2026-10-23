(function (Game) {
  'use strict';
  var $ = Game.$;
  $.init = init;

  /* 导弹 / 炸弹的起爆（Combat.blast）打设施也走这里 ——
     以前它们走的是 Ent.damage → kill()，击毁不进 groundKilled、
     误击调节单元也不记处罚。 */
  Ent.setTargetHitHandler(function (tg, dmg, source) { $.hitTarget(tg, dmg, source); });

  /* ============================================================
     主循环
     ============================================================ */
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = (ts - $.last) / 1000;
    $.last = ts;
    if (!isFinite(dt) || dt <= 0) dt = 0.016;
    if (dt > 0.05) dt = 0.05;

    if ($.state === 'playing') {
      if (!$.paused) {
        $.update(dt);
        $.render();
      } else {
        $.render();
      }
    } else {
      if ($.player && $.world) $.render();
      else {
        Renderer.begin();
        Renderer.end();
      }
    }
  }

  /* ============================================================
     开机自检
     把"模块没加载 / 数据引用了不存在的模型或武器"这类问题
     直接暴露到屏幕上，而不是等玩家打到一半才崩。
     ============================================================ */
  function preflight() {
    var problems = [];
    var i, j;

    var core = ['M3', 'MODELS', 'PLANFORM', 'CODEX', 'AIRCRAFT', 'WEAPONS', 'VOICES',
      'CALLSIGN', 'SFX', 'Renderer', 'Ent', 'AI', 'HUD', 'MISSIONS', 'CAMPAIGNS', 'Radio'];
    for (i = 0; i < core.length; i++) {
      if (typeof window[core[i]] === 'undefined') problems.push(T('boot.main.preflight.s1') + core[i] + T('boot.main.preflight.s2'));
    }
    if (problems.length) { report(problems); return problems; }

    for (i = 0; i < AIRCRAFT.length; i++) {
      var ac = AIRCRAFT[i];
      if (!MODELS[ac.model]) problems.push(T('boot.main.preflight.s3') + ac.id + T('boot.main.preflight.s4') + ac.model + '"');
      /* 没有机炮是**合法**的（预警机、重型轰炸机在数据里就是 `gun: null`）。
         只有"声明了机炮但数据表里没有"才是写错。 */
      if (ac.gun && !WEAPONS[ac.gun]) {
        problems.push(T('boot.main.preflight.s5') + ac.id + T('boot.main.preflight.s6') + ac.gun + '"');
      }
      // 挂载点组：组内每个点都要有坐标，且能被某种武器适配
      var grps = ac.hardpointGroups || [];
      if (!grps.length) problems.push(T('boot.main.preflight.s7') + ac.id + T('boot.main.preflight.s8'));
      for (j = 0; j < grps.length; j++) {
        var gg = grps[j];
        if (!gg.pts || gg.pts.length < 2) {
          problems.push(T('boot.main.preflight.s9') + ac.id + T('boot.main.preflight.s10') + gg.id + T('boot.main.preflight.s11'));
        }
        // 敌方机型挂的是下游弹，那些弹的 fits 是空的，
        // 所以"有没有武器挂得上"这一条只对可驾驶机型成立
        if (ac.npcOnly) continue;
        var ok = false;
        for (var wk in WEAPONS) {
          var ww = WEAPONS[wk];
          if (ww.kind !== 'gun' && ww.fits && ww.fits.indexOf(gg.kind) >= 0 &&
              canCarry(ac, ww)) { ok = true; break; }
        }
        if (!ok) {
          problems.push(T('boot.main.preflight.s12') + ac.id + T('boot.main.preflight.s13') + gg.id +
            T('boot.main.preflight.s14'));
        }
      }
      // 默认配置里引用的武器必须真的能挂到那一组
      for (var dk in (ac.defaultLoadout || {})) {
        var dw = ac.defaultLoadout[dk];
        if (!dw) continue;
        var dg = null;
        for (j = 0; j < grps.length; j++) if (grps[j].id === dk) dg = grps[j];
        if (!dg) { problems.push(T('boot.main.preflight.s15') + ac.id + T('boot.main.preflight.s16') + dk); continue; }
        if (!WEAPONS[dw]) { problems.push(T('boot.main.preflight.s17') + ac.id + T('boot.main.preflight.s18') + dw); continue; }
        /* 僚机（npcOnly）的挂点按 npcFits 判：TOR-3 这类只有 NPC 能挂的弹不该被玩家的 fits 挡掉 */
        if (!Ent.fitsKind(WEAPONS[dw], dg.kind, !ac.npcOnly)) {
          problems.push(T('boot.main.preflight.s19') + ac.id + T('boot.main.preflight.s20') + WEAPONS[dw].name +
            T('boot.main.preflight.s21') + dg.label);
        }
        if (!canCarry(ac, WEAPONS[dw])) {
          problems.push(T('boot.main.preflight.s22') + ac.id + T('boot.main.preflight.s23') + WEAPONS[dw].name +
            T('boot.main.preflight.s24') + WEAPONS[dw].needs.join(' / ') + T('boot.main.preflight.s25'));
        }
      }
      if (!ac.phys || !ac.phys.vMax) problems.push(T('boot.main.preflight.s26') + ac.id + T('boot.main.preflight.s27'));
      // 敌方制式机不进机库，也就用不到俯视识别图
      if (!ac.npcOnly && !PLANFORM.planes[ac.model]) {
        problems.push(T('boot.main.preflight.s28') + ac.id + T('boot.main.preflight.s29'));
      }
    }

    var needModels = ['frigatebird', 'sailfish', 'booby', 'schist', 'folded_wing', 'sower', 'relay', 'cell',
      'sam', 'radar', 'depot', 'cmdpost', 'station', 'missile', 'bomb', 'pod',
      /* 水面舰船（SHIPS 表）—— 接入关卡之前它们也要先被自检覆盖，
         否则模型名写错要到任务里才暴露。顺序按阵营：上游 → 下游 → 其余 */
      'orca', 'bluewhale', 'humpback', 'spermwhale', 'dolphin',
      'trilobite', 'ammonite', 'seascorpion', 'cameroceras', 'dunkleosteus',
      'daplu', 'skori', 'diklo', 'cross', 'icecore', 'atoll'];
    for (i = 0; i < needModels.length; i++) {
      if (!MODELS[needModels[i]]) problems.push(T('boot.main.preflight.s30') + needModels[i]);
    }

    var needWeapons = ['cel1', 'cel2', 'cel3', 'cel7', 'cel11', 'v11', 'v9', 'v17', 'v22', 'v25', 'v30',
      'e4', 'l2', 'dl4', 'dl6', 'dl9', 'hwm', 'kkv', 'pgb'];
    for (i = 0; i < needWeapons.length; i++) {
      if (!WEAPONS[needWeapons[i]]) problems.push(T('boot.main.preflight.s31') + needWeapons[i]);
    }

    for (i = 0; i < MISSIONS.length; i++) {
      var m = MISSIONS[i];
      if (typeof m.spawn !== 'function') problems.push(T('boot.main.preflight.s32') + m.id + T('boot.main.preflight.s33'));
      if (typeof m.tick !== 'function') problems.push(T('boot.main.preflight.s34') + m.id + T('boot.main.preflight.s35'));
      if (typeof m.win !== 'function' || typeof m.lose !== 'function') {
        problems.push(T('boot.main.preflight.s36') + m.id + T('boot.main.preflight.s37'));
      }
      if (!VOICES[m.id]) problems.push(T('boot.main.preflight.s38') + m.id + T('boot.main.preflight.s39'));
    }

    /* 战役分组自检。
       最容易静默发生的错误是"关卡加了、没挂进任何战役" ——
       那关在世界里存在，但选关界面永远列不到它，而且不会报错。
       反过来，下标越界或一关挂进两个战役，会让战役内序号和进度对不上。 */
    var owner = [];
    for (i = 0; i < MISSIONS.length; i++) owner.push(-1);
    for (i = 0; i < CAMPAIGNS.length; i++) {
      var cp = CAMPAIGNS[i];
      if (!cp.id || !cp.name) problems.push(T('boot.main.preflight.s40') + i + T('boot.main.preflight.s41'));
      if (!cp.missions || !cp.missions.length) {
        /* 空列表是合法的"资料封存"占位项 —— 战役屏会把它画成不可点的卡片。
           这里只检查它确实是个数组，而不是漏写的 undefined。 */
        if (cp.missions !== undefined && !(cp.missions instanceof Array)) {
          problems.push(T('boot.main.preflight.s42') + cp.id + T('boot.main.preflight.s43'));
        }
        continue;
      }
      for (j = 0; j < cp.missions.length; j++) {
        var mi = cp.missions[j];
        if (mi < 0 || mi >= MISSIONS.length) {
          problems.push(T('boot.main.preflight.s44') + cp.id + T('boot.main.preflight.s45') + mi);
          continue;
        }
        if (owner[mi] >= 0) {
          problems.push(T('boot.main.preflight.s46') + MISSIONS[mi].id + T('boot.main.preflight.s47') +
            CAMPAIGNS[owner[mi]].name + T('boot.main.preflight.s48') + cp.name);
        }
        owner[mi] = i;
      }
    }
    for (i = 0; i < owner.length; i++) {
      if (owner[i] < 0) {
        problems.push(T('boot.main.preflight.s49') + MISSIONS[i].id + T('boot.main.preflight.s50'));
      }
    }

    report(problems);
    return problems;
  }

  function report(problems) {
    if (!problems.length) {
      if (window.console) {
        console.log('%c[季风线] 自检通过：模块与数据引用全部一致。', 'color:#4fe08a');
      }
      return;
    }
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
      'background:rgba(58,8,8,.96);color:#ffc0c0;font:12px/1.8 Consolas,monospace;' +
      'padding:10px 18px;max-height:36vh;overflow:auto;border-top:2px solid #ff4d4d';
    var html = T('boot.main.report.html.s1') + problems.length + T('boot.main.report.html.s2');
    for (var i = 0; i < problems.length; i++) html += '· ' + problems[i] + '<br>';
    box.innerHTML = html;
    document.body.appendChild(box);
    if (window.console) console.error('[季风线] 自检问题：', problems);
  }

  /* ============================================================
     初始化
     ============================================================ */
  /* ============================================================
     主菜单左上角的版本戳

     内容来自 js/version.js —— 那个文件由 tools/release.js（发版）
     或 tools/stamp-version.js（只刷时间）从 git 记录生成。

     为什么需要它：浏览器缓存、GitHub Pages 的重建延迟、推送失败，
     这三件事从画面上完全看不出来。而时间戳变了就说明新 commit
     确实上线了。版本号也一样 —— 它是 CHANGELOG.md 顶部那条。

     文件不在时（比如开发中直接开 index.html、或者忘了跑生成脚本）
     静默降级，不影响游戏本身。
     ============================================================ */
  function stampVersion() {
    var el = document.getElementById('verStamp');
    if (!el) return;
    if (typeof BUILD_STAMP === 'undefined' || !BUILD_STAMP.time) {
      el.innerHTML = T('boot.main.stampVersion.innerHTML.s1');
      return;
    }
    // 版本名取自更新日志里同一版本的标题（如「看清是谁」）
    var title = '';
    if (typeof CHANGELOG !== 'undefined' && CHANGELOG.releases) {
      for (var ri = 0; ri < CHANGELOG.releases.length; ri++) {
        if (CHANGELOG.releases[ri].version === BUILD_STAMP.version) { title = CHANGELOG.releases[ri].title || ''; break; }
      }
    }
    var v = BUILD_STAMP.version ? BUILD_STAMP.version + (title ? T('boot.main.stampVersion.v.s1') + title + T('boot.main.stampVersion.v.s2') : '') + ' · ' : '';
    // 只显示版本与时间；提交号与提交信息放进悬停提示，不占菜单版面
    el.innerHTML = 'BUILD <b>' + v + BUILD_STAMP.time + '</b>';
    el.title = BUILD_STAMP.hash + T('boot.main.stampVersion.title.s1') + BUILD_STAMP.subject;
  }

  function init() {
    preflight();
    stampVersion();

    // 设置必须在任何渲染/音频之前载入
    $.S = $.loadSettings();
    $.applyAudioSettings();

    $.cv = document.getElementById('cv');
    Renderer.init($.cv);
    $.applyRenderMode();
    $.bindInput();

    // 导航按钮。注意这里不再用兜底 else ——
    // 早先的写法会让任何一个拼错的 data-go 值都悄悄跳回标题页，
    // 出问题时完全看不出是哪里错了。
    var btns = document.querySelectorAll('[data-go]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        SFX.unlock(); SFX.click();
        var go = this.getAttribute('data-go');
        if (go === 'hangar') {
          /* 从简报页、或任务结束的结算页进来是"选机出击"（结算页：换架飞机再打同一关，
             missionIdx 还是刚打完的那一关）；从主菜单进来只是逛机库，
             没有选定的任务，出击按钮不该出现，返回也该回主菜单。 */
          var sortie = !!(this.closest && this.closest('#scr-brief, #scr-debrief'));
          $.setHangarMode(sortie);
          $.buildHangar(); $.show('hangar');
        }
        else if (go === 'campaign') {
          /* 战役屏没有"当前战役"的概念，每次进来都重新渲染进度；
             按下哪一张卡由 buildCampaignList 里的监听决定。 */
          $.buildCampaignList(); $.show('campaign');
        }
        else if (go === 'brief') {
          /* 简报页的关卡选择器只列当前战役。若 missionIdx 落在别的战役里
             （比如刚打完上一场战役，或从别处进来），先夹回本战役。 */
          var campMs = CAMPAIGNS[$.activeCampaign].missions;
          if (campMs.indexOf($.missionIdx) < 0) $.missionIdx = campMs[0];
          $.buildBrief(); $.show('brief');
        }
        else if (go === 'codex') { $.buildCodex(); $.show('codex'); }
        else if (go === 'settings') { $.buildSettingsInto(document.getElementById('setWrap')); $.show('settings'); }
        else if (go === 'help') { $.buildHelpPage(); $.show('help'); }
        else if (go === 'changelog') { $.buildChangelog(); $.show('changelog'); }
        else if (go === 'title') { $.show('title'); }
      });
    }

    // 暂停菜单的三个页签
    var ptabs = document.querySelectorAll('[data-ptab]');
    for (var p = 0; p < ptabs.length; p++) {
      ptabs[p].addEventListener('click', function () {
        $.switchPauseTab(this.getAttribute('data-ptab'));
        SFX.click();
      });
    }

    document.getElementById('btnLaunch').onclick = function () {
      SFX.unlock(); SFX.confirm(); $.startMission($.missionIdx);
    };
    document.getElementById('btnNext').onclick = function () {
      SFX.unlock(); SFX.click();
      /* 只在本战役内推进：跨战役的"下一任务"应该走战役选择屏，
         否则玩家会在一次点击里被扔进一场他没选过的战役。 */
      var ms = CAMPAIGNS[$.campaignOf($.missionIdx)].missions;
      var pos = ms.indexOf($.missionIdx);
      if (pos >= 0 && pos < ms.length - 1) {
        $.missionIdx = ms[pos + 1];
        $.activeCampaign = $.campaignOf($.missionIdx);
      }
      $.buildBrief(); $.show('brief');
    };
    document.getElementById('btnRetry').onclick = function () {
      SFX.unlock(); SFX.click(); $.startMission($.missionIdx);
    };
    document.getElementById('setClose').onclick = function () { SFX.click(); $.show('title'); };
    document.getElementById('setReset').onclick = function () { SFX.click(); $.resetSettings(); };
    document.getElementById('pauseSetReset').onclick = function () { SFX.click(); $.resetSettings(); };
    document.getElementById('btnResume').onclick = function () { $.togglePause(); };
    document.getElementById('btnAbort').onclick = function () {
      SFX.click();
      $.paused = false;
      document.getElementById('pause').classList.remove('on');
      SFX.silence(); SFX.warning(false); SFX.gun(false);
      $.player = null; $.world = null;
      $.show('brief');
      $.buildBrief();
    };

    // 任意点击解锁音频
    document.addEventListener('mousedown', function () { SFX.unlock(); }, { once: false });

    // 默认特殊武器
    $.getLoadout(AIRCRAFT[$.selectedAC]);

    // 鼠标瞄准：初始把瞄准点放在屏幕中心
    $.mouse.x = window.innerWidth / 2;
    $.mouse.y = window.innerHeight / 2;
    $.cv.style.cursor = $.aimMode ? 'none' : 'default';

    $.show('title');
    requestAnimationFrame(function (t) { $.last = t; requestAnimationFrame(loop); });
  }
})(Game);
