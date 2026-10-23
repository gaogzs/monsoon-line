(function (Game) {
  'use strict';
  var $ = Game.$;
  $.setHangarMode = setHangarMode; $.buildHangar = buildHangar;

  /* 机库界面的视图状态（docs/POST2-0IMPL.md 1.7 第 2 步）：
       ac       选中的机型下标（就是 view.ac，开局时用的也是它）
       group    当前选中的挂载点组
       ids      元素 id 表；键缺省时用键名本身。批次 4 的整备界面传一套自己的 id 就能复用
       rebuild  改动之后怎么重画
     buildHangar / buildHardpointEditor 只读这个对象，不再读全局。 */
  $.hangarView = {
    ids: {},
    group: null,
    rebuild: function () { buildHangar($.hangarView); },
    get ac() { return $.selectedAC; },
    set ac(v) { $.selectedAC = v; }
  };
  $.viewEl = function (view, key) { return document.getElementById((view.ids && view.ids[key]) || key); };

  /* ============================================================
     机库
     ============================================================ */
  function setHangarMode(sortie) {
    var launch = document.getElementById('btnLaunch');
    var back = document.getElementById('btnHangarBack');
    if (launch && launch.style) launch.style.display = sortie ? '' : 'none';
    if (back && back.setAttribute) {
      back.setAttribute('data-go', sortie ? 'brief' : 'title');
      back.textContent = sortie ? T('ui.screens.hangar.setHangarMode.textContent.s1') : T('ui.screens.hangar.setHangarMode.textContent.s2');
    }
  }

  function buildHangar(view) {
    view = view || $.hangarView;
    var list = $.viewEl(view, 'acList');
    list.innerHTML = '';
    for (var i = 0; i < AIRCRAFT.length; i++) {
      // 敌方制式机不进机库（但资料库里能查到）
      if (AIRCRAFT[i].npcOnly) continue;
      (function (idx) {
        var ac = AIRCRAFT[idx];
        var d = document.createElement('div');
        d.className = 'ac-card' + (idx === view.ac ? ' sel' : '');
        d.innerHTML = '<div class="n">' + ac.name + '</div>' +
          '<div class="c">' + ac.nick.toUpperCase() + ' · ' + ac.cn + '</div>' +
          '<div class="r">' + ac.role + '</div>';
        d.onclick = function () {
          view.ac = idx;
          view.group = null;
          SFX.click();
          buildHangar(view);
        };
        list.appendChild(d);
      })(i);
    }

    var ac = AIRCRAFT[view.ac];
    var lo = $.getLoadout(ac);
    if (!view.group && ac.hardpointGroups && ac.hardpointGroups.length) {
      view.group = ac.hardpointGroups[0].id;
    }
    $.viewEl(view, 'acName').textContent = ac.name + T('ui.screens.hangar.buildHangar.textContent.s1') + ac.cn + T('ui.screens.hangar.buildHangar.textContent.s2');
    $.viewEl(view, 'acRole').textContent = ac.role + '  ·  ' + ac.maker;

    /* 先算挂载重量 —— 六维条要拿它算"挂载之后"的实际值 */
    var list = Loadout.resolve(ac, lo);
    var mass = Loadout.mass(ac, lo);
    var mtow = ac.maxLoad || 5000;
    var loadK = Math.min(1, mass / mtow);
    var lp = loadoutPenalty(loadK);
    var gun = WEAPONS[ac.gun];

    /* 六维条显示的是**挂载之后**的实际值，不是机型的固有值 ——
       否则玩家看着一架飞机的数据、开的却是另一架。
       只有受挂载影响的维度会缩水，被吃掉的那一段用暗红标出来，
       右边再把净损失放在括号里。 */
    var stats = [
      [T('ui.screens.hangar.buildHangar.stats.i0.i0.s1'), 'spd'], [T('ui.screens.hangar.buildHangar.stats.i1.i0.s1'), 'mob'], [T('ui.screens.hangar.buildHangar.stats.i2.i0.s1'), 'stl'],
      [T('ui.screens.hangar.buildHangar.stats.i3.i0.s1'), 'fire'], [T('ui.screens.hangar.buildHangar.stats.i4.i0.s1'), 'dur'], [T('ui.screens.hangar.buildHangar.stats.i5.i0.s1'), 'rng'], [T('ui.screens.hangar.buildHangar.stats.i6.i0.s1'), 'ecm']
    ];
    var podEcm = Loadout.passive(ac, lo).ecm;
    var sh = '';
    for (var k = 0; k < stats.length; k++) {
      var key = stats[k][1];
      var base = ac.stats[key] || 0;
      var v = base;
      /* ECM 是唯一会被挂载**加高**的维度：吊舱那一段用亮色接在机体值后面 */
      if (key === 'ecm') {
        var tot = Math.min(1, base + podEcm), gain = tot - base;
        sh += '<div class="stat-row"><span class="l">' + stats[k][0] + '</span>' +
          '<span class="stat-bar"><i style="width:' + Math.round(base * 100) + '%"></i>' +
          (gain > 0.004 ? '<b style="left:' + Math.round(base * 100) + '%;width:' + (gain * 100).toFixed(1) + '%"></b>' : '') +
          '</span><span class="v">' + Math.round(tot * 100) +
          (gain > 0.004 ? '<em class="up">+' + Math.round(gain * 100) + '</em>' : '') +
          '</span></div>';
        continue;
      }
      if (key === 'stl') {
        /* 匿踪：外挂折损（暗红）与吊舱抗锁定折算的加成（亮色）都显示 */
        var stNow = stealthValue(ac, exposedPoints(ac, ac.hardpointGroups.map(function (g) { return lo[g.id]; })));
        var stTot = Math.min(1, lockCutOf(stNow, Loadout.passive(ac, lo).lockResist) / STEALTH_LOCK_CUT);
        var lo2 = Math.min(stTot, base), dn = Math.max(0, base - stTot), up = Math.max(0, stTot - base);
        sh += '<div class="stat-row"><span class="l">' + stats[k][0] + '</span>' +
          '<span class="stat-bar"><i style="width:' + Math.round(lo2 * 100) + '%"></i>' +
          (up > 0.004 ? '<b style="left:' + Math.round(base * 100) + '%;width:' + (up * 100).toFixed(1) + '%"></b>' : '') +
          (dn > 0.004 ? '<u style="left:' + Math.round(stTot * 100) + '%;width:' + (dn * 100).toFixed(1) + '%"></u>' : '') +
          '</span><span class="v">' + Math.round(stTot * 100) +
          (up > 0.004 ? '<em class="up">+' + Math.round(up * 100) + '</em>' : '') +
          (dn > 0.004 ? '<em>−' + Math.round(dn * 100) + '</em>' : '') +
          '</span></div>';
        continue;
      }
      if (key === 'spd') v = base * lp.vMax;
      else if (key === 'mob') v = base * ((lp.pitch + lp.roll + lp.accel) / 3);

      var lostK = Math.max(0, base - v);
      sh += '<div class="stat-row"><span class="l">' + stats[k][0] + '</span>' +
        '<span class="stat-bar"><i style="width:' + Math.round(v * 100) + '%"></i>' +
        (lostK > 0.004
          ? '<u style="left:' + Math.round(v * 100) + '%;width:' +
            (lostK * 100).toFixed(1) + '%"></u>'
          : '') +
        '</span>' +
        '<span class="v">' + Math.round(v * 100) +
        (lostK > 0.004 ? '<em>−' + Math.round(lostK * 100) + '</em>' : '') +
        '</span></div>';
    }
    $.viewEl(view, 'acStats').innerHTML = sh;
    $.viewEl(view, 'acDesc').innerHTML = ac.desc;

    $.buildHardpointEditor(ac, lo, view);

    var sum = T('ui.screens.hangar.buildHangar.sum.s1');
    /* 没有机炮的机型（预警机、重型轰炸机）不画这一行 ——
       `gun` 会是 undefined，直接读 gun.name 会抛异常。 */
    if (gun) {
      sum += '<div class="ld-row"><span class="n">' + gun.name + '</span>' +
        '<span class="a">×' + gun.ammo + T('ui.screens.hangar.buildHangar.s1');
    }
    if (list.length) {
      for (k = 0; k < list.length; k++) {
        sum += '<div class="ld-row"><span class="n">' + list[k].w.name + '</span>' +
          '<span class="a">×' + list[k].ammo + '</span>' +
          T('ui.screens.hangar.buildHangar.s2') + list[k].salvo + '</span></div>';
      }
    } else {
      sum += T('ui.screens.hangar.buildHangar.s3');
    }
    sum += T('ui.screens.hangar.buildHangar.s4');

    /* 挂载影响：逐项列出来。
       以前这里只有一句 "机动性 −(loadK×18)%" —— 那只取了俯仰一项，
       把最狠的加速 −26% 和失速速度上升整个漏掉了，
       玩家看到的损失比真实手感小得多。另外它在 loadK 很小时
       会算出 "−0%"，因为判断阈值和显示系数是两套数。 */
    function pctTxt(x) {
      if (x <= 0) return '0';
      var v = x * 100;
      return v < 1 ? '&lt;1' : String(Math.round(v));
    }

    sum += T('ui.screens.hangar.buildHangar.s5') + mass + ' / ' + mtow + ' kg</b>';
    if (loadK > 0.015) {
      sum += T('ui.screens.hangar.buildHangar.s6') + pctTxt(1 - lp.accel) + '%</b>' +
        T('ui.screens.hangar.buildHangar.s7') + pctTxt(1 - lp.pitch) + '%</b>' +
        T('ui.screens.hangar.buildHangar.s8') + pctTxt(1 - lp.roll) + '%</b>' +
        T('ui.screens.hangar.buildHangar.s9') + pctTxt(1 - lp.vMax) + '%</b>' +
        T('ui.screens.hangar.buildHangar.s10') + pctTxt(lp.vStall - 1) + '%</b>' +
        '</div>';
    } else {
      sum += T('ui.screens.hangar.buildHangar.s11');
    }
    sum += '</div>';
    sum += T('ui.screens.hangar.buildHangar.s12');
    sum += T('ui.screens.hangar.buildHangar.s13');
    $.viewEl(view, 'acLoadout').innerHTML = sum;

    /* ---- 3D 预览：机体 + 当前挂载，改了挂载立刻换模型（转角保留） ---- */
    if (typeof UnitView !== 'undefined') {
      UnitView.mountModel($.viewEl(view, 'hangar3d'), UnitView.composeLoadout(ac, lo), true);
    }

    /* ---- 俯视识别图 ---- */
    PLANFORM.draw($.viewEl(view, 'planCv'), ac, lo, view.group);
    $.viewEl(view, 'planCap').innerHTML =
      T('ui.screens.hangar.buildHangar.innerHTML.s1');
  }
})(Game);
