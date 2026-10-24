(function (Game) {
  'use strict';
  var $ = Game.$;
  $.buildHardpointEditor = buildHardpointEditor;

  /* ============================================================
     挂载点编辑器

     左栏是挂载点组，右栏是该组能挂的东西 —— 每一项都是一张卡片，
     带定位、简介和关键参数。

     早期版本这里是个下拉框，里面只有型号（"TOR-2 ×16"）。
     问题是玩家根本不知道 TOR-2 是什么：打什么的、能打多远、
     为什么该选它而不是旁边那个，全得靠背。
     ============================================================ */
  /* view = 这个编辑器的视图状态（js/ui/screens/hangar.js 的 $.hangarView 是一份）：
       group    当前选中的挂载点组
       ids      元素 id 表（缺省用键名本身），换一套 id 就能在别的界面里再放一份编辑器
       rebuild  选了东西之后怎么重画
     不再读写全局的 activeHpGroup。 */
  function buildHardpointEditor(ac, lo, view) {
    view = view || $.hangarView;
    buildHpGroups(ac, lo, view);
    buildHpPicker(ac, lo, view);
  }

  /** 左栏：挂载点组列表。点一行切换右栏显示哪一组。 */
  function buildHpGroups(ac, lo, view) {
    var host = $.viewEl(view, 'hpList');
    if (!host) return;
    host.innerHTML = '';

    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      (function (g) {
        var w = lo[g.id] ? WEAPONS[lo[g.id]] : null;

        var row = document.createElement('div');
        row.className = 'hp-row' + (g.id === view.group ? ' on' : '');
        row.setAttribute('data-hp', g.id);
        row.innerHTML =
          '<div class="hp-top"><span class="hp-id">' + g.id + '</span>' +
          '<span class="hp-lb">' + g.label + '</span></div>' +
          '<div class="hp-sub">' + g.pts.length + T('ui.screens.hardpoints.buildHpGroups.innerHTML.s1') + $.hpKindLabel(g.kind) + '</div>' +
          '<div class="hp-cur' + (w ? '' : ' empty') + '">' +
          (w ? w.name + ' ' + w.cn.split(' · ')[0] : T('ui.screens.hardpoints.buildHpGroups.innerHTML.s2')) + '</div>';

        row.onclick = function () {
          view.group = g.id;
          SFX.click();
          view.rebuild();
        };
        host.appendChild(row);
      })(groups[i]);
    }
  }

  /** 右栏：当前选中组的可选项，每个一张卡片 */
  function buildHpPicker(ac, lo, view) {
    var host = $.viewEl(view, 'hpPicker');
    if (!host) return;
    host.innerHTML = '';

    var groups = ac.hardpointGroups || [];
    var g = null, i;
    for (i = 0; i < groups.length; i++) {
      if (groups[i].id === view.group) g = groups[i];
    }
    if (!g) { g = groups[0]; view.group = g ? g.id : null; }
    if (!g) return;

    var head = document.createElement('div');
    head.className = 'pk-head';
    head.textContent = T('ui.screens.hardpoints.buildHpPicker.textContent.s1') + g.id + ' · ' + g.label +
      T('ui.screens.hardpoints.buildHpPicker.textContent.s2') + $.hpKindLabel(g.kind) + ' · ' + g.pts.length + T('ui.screens.hardpoints.buildHpPicker.textContent.s3');
    host.appendChild(head);

    // 空置排最前 —— 它也是一个正经选项，不是"什么都不选"
    host.appendChild(makeStoreCard(lo, g, null, null, view));

    /* 两类筛选是独立的：
         fits  —— 挂点类型对不对（物理上挂不挂得住）
         caps  —— 机体能力够不够（火控、供电、散热撑不撑得住）
       第二类是后来补的：只有 fits 的话，制空战斗机也能挂重型巡航导弹。 */
    /* 不可用的也列出来（变暗打叉并写明原因），排在各自分类的最后。
       fits 为空数组的是敌方/单位专用弹，玩家机库里不出现。 */
    var buckets = {}, blocked = 0, wid;
    for (wid in WEAPONS) {
      if (!Object.prototype.hasOwnProperty.call(WEAPONS, wid)) continue;
      var w = WEAPONS[wid];
      if (w.kind === 'gun') continue;
      if (!w.fits || !w.fits.length) continue;
      var why = unavailableReason(ac, g, w);
      if (why) blocked++;
      var cat = storeCategory(w);
      (buckets[cat] = buckets[cat] || { ok: [], no: [] })[why ? 'no' : 'ok'].push({ wid: wid, why: why });
    }
    var nav = $.viewEl(view, 'hpNav');
    if (nav) nav.innerHTML = '';
    for (i = 0; i < STORE_CATS.length; i++) {
      var b = buckets[STORE_CATS[i].id];
      if (!b) continue;
      var sec = document.createElement('div');
      sec.className = 'pk-cat';
      sec.textContent = STORE_CATS[i].label;
      host.appendChild(sec);
      if (nav) nav.appendChild(makeNavBtn(host, sec, STORE_CATS[i].short));
      var all = b.ok.concat(b.no);
      for (var j = 0; j < all.length; j++) {
        host.appendChild(makeStoreCard(lo, g, all[j].wid, all[j].why, view));
      }
    }
    if (blocked) head.textContent += '  ·  ' + blocked + T('ui.screens.hardpoints.buildHpPicker.textContent.s4');
  }

  /* 挂载分类。顺序即显示顺序；分类依据是玩家选它时在想的事
     （打飞机近的 / 远的，打地面，上吊舱），而不是内部 kind。 */
  var STORE_CATS = [
    { id: 'wvr', short: T('ui.screens.hardpoints.STORE_CATS.i0.short'), label: T('ui.screens.hardpoints.STORE_CATS.i0.label') },
    { id: 'bvr', short: T('ui.screens.hardpoints.STORE_CATS.i1.short'), label: T('ui.screens.hardpoints.STORE_CATS.i1.label') },
    { id: 'gnd', short: T('ui.screens.hardpoints.STORE_CATS.i2.short'), label: T('ui.screens.hardpoints.STORE_CATS.i2.label') },
    { id: 'pod', short: T('ui.screens.hardpoints.STORE_CATS.i3.short'), label: T('ui.screens.hardpoints.STORE_CATS.i3.label') },
    { id: 'oth', short: T('ui.screens.hardpoints.STORE_CATS.i4.short'), label: T('ui.screens.hardpoints.STORE_CATS.i4.label') }
  ];

  /** 分类导航按钮：点一下把右栏立刻滚到该分类标题 */
  function makeNavBtn(host, sec, text) {
    var btn = document.createElement('button');
    btn.textContent = text;
    btn.onclick = function () {
      host.scrollTop = sec.offsetTop - host.offsetTop;
      SFX.click();
    };
    return btn;
  }

  function storeCategory(w) {
    if (w.kind === 'aam') return w.seeker === 'radar' ? 'bvr' : 'wvr';
    if (w.kind === 'agm' || w.kind === 'asm' || w.kind === 'bomb') return 'gnd';
    if (w.kind === 'ecm') return 'pod';
    return 'oth';
  }

  var NEED_LABEL = { strike: T('ui.screens.hardpoints.NEED_LABEL.strike'), intercept: T('ui.screens.hardpoints.NEED_LABEL.intercept'), ew: T('ui.screens.hardpoints.NEED_LABEL.ew') };

  /** 不可用的原因；可用返回 null。挂点类型优先，其次机体能力。 */
  function unavailableReason(ac, g, w) {
    if (w.fits.indexOf(g.kind) < 0) {
      var need = w.fits.map($.hpKindLabel).join(' / ');
      return T('ui.screens.hardpoints.unavailableReason.s1') + $.hpKindLabel(g.kind) + T('ui.screens.hardpoints.unavailableReason.s2') + need + T('ui.screens.hardpoints.unavailableReason.s3');
    }
    if (!canCarry(ac, w)) {
      var caps = (ac && ac.caps) || [], miss = [];
      for (var i = 0; i < w.needs.length; i++) {
        if (caps.indexOf(w.needs[i]) < 0) miss.push(NEED_LABEL[w.needs[i]] || w.needs[i]);
      }
      return T('ui.screens.hardpoints.unavailableReason.s4') + miss.join(T('ui.screens.hardpoints.unavailableReason.s5'));
    }
    return null;
  }

  /** 一张挂载卡片。wid 为 null 表示"空置"。 */
  function makeStoreCard(lo, g, wid, lockedWhy, view) {
    var n = g.pts.length;
    var card = document.createElement('div');
    var cur = (lo[g.id] || null) === wid;
    card.className = 'pk-card' + (cur ? ' on' : '') + (wid ? '' : ' empty') + (lockedWhy ? ' lock' : '');

    if (!wid) {
      card.innerHTML =
        T('ui.screens.hardpoints.makeStoreCard.innerHTML.s1');
    } else {
      var w = WEAPONS[wid];
      var cnt = n * (w.perPoint || 1);
      card.innerHTML =
        '<div class="pk-n">' + w.name +
        '<span class="pk-cn">' + w.cn + '</span>' +
        '<span class="pk-cnt">×' + cnt + '</span></div>' +
        '<div class="pk-role">' + (w.role || '—') + '</div>' +
        '<div class="pk-d">' + (w.desc || '') + '</div>' +
        '<div class="pk-q">' + storeStatLine(w, n) + '</div>';
    }

    if (lockedWhy) {
      var ov = document.createElement('div');
      ov.className = 'pk-lock';
      ov.innerHTML =
        T('ui.screens.hardpoints.makeStoreCard.innerHTML.s2') + lockedWhy + '</span></div>';
      card.appendChild(ov);
      return card;
    }

    card.onclick = function () {
      lo[g.id] = wid;
      $.saveGame();          // 机库里改挂载就存档（engine/game/save.js）
      SFX.click();
      view.rebuild();
    };
    return card;
  }

  /** 卡片底部的参数行。n = 这一组的点数（也就是并行发射槽的数量） */
  function storeStatLine(w, n) {
    var bits = [];
    if (w.tags.passive) {
      bits.push(T('ui.screens.hardpoints.storeStatLine.s1'));
    } else {
      if (n) bits.push(n + T('ui.screens.hardpoints.storeStatLine.s2'));
      var r = Ent.displayRange(w);          // 与 AI / HUD 同一套真实弹道（entities.js）
      if (r) bits.push(T('ui.screens.hardpoints.storeStatLine.s3') + r.toFixed(1) + ' km');
      if (w.kind === 'dew' && w.interceptRange) {
        bits.push(T('ui.screens.hardpoints.storeStatLine.s4') + (w.interceptRange / 1000).toFixed(1) + ' km');
      }
      // 与图鉴共用 weaponGuidance()（codex.js）—— 两处不再各写一份映射
      var gd = weaponGuidance(w);
      if (gd.note) bits.push(T('ui.screens.hardpoints.storeStatLine.s5') + gd.name + T('ui.screens.hardpoints.storeStatLine.s6') + gd.note + T('ui.screens.hardpoints.storeStatLine.s7'));
      else if (gd.lead !== null) bits.push(T('ui.screens.hardpoints.storeStatLine.s8') + gd.name + ' ' + Math.round(gd.lead * 100) + '%');
      else bits.push(T('ui.screens.hardpoints.storeStatLine.s9') + gd.name);
    }
    if (w.dmg) bits.push(T('ui.screens.hardpoints.storeStatLine.s10') + w.dmg);
    if (w.blast) bits.push(T('ui.screens.hardpoints.storeStatLine.s11') + w.blast + ' m');
    bits.push(w.mass + ' kg');
    if (w.cd) bits.push(T('ui.screens.hardpoints.storeStatLine.s12') + w.cd.toFixed(1) + 's');
    return bits.join(' · ');
  }

  function kindLabel(k) {
    return ({ gun: T('ui.screens.hardpoints.kindLabel.gun'), aam: T('ui.screens.hardpoints.kindLabel.aam'), asm: T('ui.screens.hardpoints.kindLabel.asm'), agm: T('ui.screens.hardpoints.kindLabel.agm'), bomb: T('ui.screens.hardpoints.kindLabel.bomb'), ecm: T('ui.screens.hardpoints.kindLabel.ecm'), dew: T('ui.screens.hardpoints.kindLabel.dew') })[k] || k;
  }

  /* 制式编号的含义（前缀取自逻辑语词根，但玩家只需要看懂中文含义） */
  var ROOTS = {
    cel1: T('ui.screens.hardpoints.ROOTS.cel1'),
    cel2: T('ui.screens.hardpoints.ROOTS.cel2'),
    cel3: T('ui.screens.hardpoints.ROOTS.cel3'),
    cel7: T('ui.screens.hardpoints.ROOTS.cel7'),
    cel11: T('ui.screens.hardpoints.ROOTS.cel11'),
    v9: T('ui.screens.hardpoints.ROOTS.v9'),
    v11: T('ui.screens.hardpoints.ROOTS.v11'),
    v17: T('ui.screens.hardpoints.ROOTS.v17'),
    v22: T('ui.screens.hardpoints.ROOTS.v22'),
    v25: T('ui.screens.hardpoints.ROOTS.v25'),
    v30: T('ui.screens.hardpoints.ROOTS.v30'),
    pgb: T('ui.screens.hardpoints.ROOTS.pgb'),
    hbl: T('ui.screens.hardpoints.ROOTS.hbl'),
    hbh: T('ui.screens.hardpoints.ROOTS.hbh'),
    e4: T('ui.screens.hardpoints.ROOTS.e4'),
    l2: T('ui.screens.hardpoints.ROOTS.l2'),
    dl4: T('ui.screens.hardpoints.ROOTS.dl4'),
    dl6: T('ui.screens.hardpoints.ROOTS.dl6'),
    dl9: T('ui.screens.hardpoints.ROOTS.dl9')
  };
})(Game);
