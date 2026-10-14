/* ============================================================
   game.js —— 状态机 / 主循环 / 无线电 / UI 绑定
   ============================================================ */
'use strict';

/* ============================================================
   无线电字幕
   ============================================================ */
var Radio = (function () {
  var queue = [], timer = 0, box = null, live = [];

  function el() { if (!box) box = document.getElementById('radio'); return box; }

  function play(missionId, evt) {
    var v = VOICES[missionId];
    if (!v || !v[evt]) return;
    var arr = v[evt];
    for (var i = 0; i < arr.length; i++) queue.push(arr[i]);
  }

  function raw(line) { queue.push(line); }

  function clear() { queue.length = 0; live.length = 0; if (el()) el().innerHTML = ''; }

  function update(dt) {
    timer -= dt;
    if (timer <= 0 && queue.length) {
      var L = queue.shift();
      push(L);
      timer = (L.gap === undefined ? 1.4 : L.gap);
    }
    // 淡出
    for (var i = live.length - 1; i >= 0; i--) {
      var o = live[i];
      o.t -= dt;
      if (o.t < 0.5) o.node.style.opacity = Math.max(0, o.t / 0.5);
      if (o.t <= 0) {
        if (o.node.parentNode) o.node.parentNode.removeChild(o.node);
        live.splice(i, 1);
      }
    }
  }

  function push(L) {
    var b = el();
    if (!b) return;
    var d = document.createElement('div');
    d.className = 'rad-line ' + (L.cls || 'ally') + (L.cls === 'fx' ? ' radiofx' : '');
    d.innerHTML = (L.who ? '<span class="who">' + L.who + '</span>' : '') +
      '<span class="tx">' + L.tx + '</span>';
    b.appendChild(d);
    live.push({ node: d, t: 5.6 });
    while (live.length > 4) {
      var old = live.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
    if (L.cls !== 'fx') SFX.radio();
  }

  return { play: play, raw: raw, update: update, clear: clear };
})();

/* ============================================================
   游戏
   ============================================================ */
var Game = (function () {

  var cv, state = 'title', paused = false;
  var world = null, player = null, mission = null, missionIdx = 0;
  var selectedAC = 0;

  /* 挂载配置：机型 id → { 组 id: 武器 id | null }
     玩家在机库里改的就是这个，改动会一直留着直到换机型 */
  var loadouts = {};
  /* 当前正在编辑的挂载点组，用于在俯视图上高亮 */
  var activeHpGroup = null;
  var keys = {}, mouse = { left: false, right: false, x: 0, y: 0 };
  var aimMode = true;              // true = 鼠标引导（指令增稳），false = 键盘直控
  var last = 0;
  /* 机位现在由设置项 S.camMode 决定，没有热切换键 ——
     切换机位会让玩家瞬间失去态势感知，必须主动确认。
     另外两个是追尾镜头的平滑状态：camYawBase 是按最短角差平滑的基准偏航，
     camPitchSmooth 是平滑后的基准俯仰，首帧惰性初始化。 */
  var camYawBase = 0, camPitchSmooth = null;

  /* 单一油门轴：0..1 是常规推力区，1..1.25 是加力区。
     不再需要单独的加力/减速板按键。 */
  var THR_MAX = 1.25;

  /* 高 G 机动：转向率放大倍率，以及每秒付出的速度代价（m/s²） */
  var HIG_MAX = 1.90;
  var HIG_BLEED = 82;
  var camFwd = M3.V(0, 0, 1), camUp = M3.V(0, 1, 0), camPos = M3.V(0, 0, 0);
  var camYaw = 0, camPitch = 0;
  /* 追尾镜头的基准朝向。它不直接等于机头方向 —— 见 updateCamera 里的说明：
     俯仰被限制在 ±78°，而且偏航要按最短角差平滑，否则翻过顶点时会瞬移。 */

  var banner = { t: 0, title: '', sub: '', col: '' };
  var hits = [];
  var stats = null;
  var cleared = {};        // 本次会话内已完成的任务
  var MAX_HP_ACE = 0;

  /* ============================================================
     屏幕管理
     ============================================================ */
  function show(id) {
    /* 离开战斗界面时必须清掉通讯记录。
       那些行的淡出是靠战斗循环里的 Radio.update() 推进的，
       一旦回到菜单就再没人管它们 —— 于是最后几条会永远挂在屏幕上。
       （从战斗中返回主菜单后残留的通讯记录就是这个原因。） */
    if (id) Radio.clear();

    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    if (id) {
      var s = document.getElementById('scr-' + id);
      if (s) s.classList.add('active');
    }
    state = id || 'playing';
  }

  function hideAll() {
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
  }

  /* ============================================================
     设置
     —— 独立设置页与暂停菜单内的设置页共用同一套定义与生成器
     ============================================================ */
  var SET_KEY = 'monsoonline.settings.v1';

  var DEFAULTS = {
    volMaster: 45,
    volEngine: 45,
    volSfx: 85,
    muted: false,
    fov: 56,
    camDist: 52,
    camHeight: 13,
    hudOpacity: 100,
    hudScale: 100,
    compass: true,
    pitchLadder: true,
    targetMarkers: true,
    // 0 = 追尾，1 = 座舱，2 = 目标。只能在这里改，没有热切换键。
    camMode: 0
  };

  var S = {};

  var SET_GROUPS = [
    {
      title: '音频',
      hint: '引擎是持续音，最容易变成底噪。嫌吵就把它单独压低，或者直接归零。',
      items: [
        { k: 'volMaster', label: '主音量', type: 'range', min: 0, max: 100, unit: '%' },
        { k: 'volEngine', label: '引擎音', type: 'range', min: 0, max: 100, unit: '%' },
        { k: 'volSfx', label: '音效', type: 'range', min: 0, max: 100, unit: '%' },
        { k: 'muted', label: '全部静音', type: 'toggle' }
      ]
    },
    {
      title: '视角',
      hint: '暂停时调整可以实时看到画面变化 —— 不用退出去再进来。',
      items: [
        {
          k: 'camMode', label: '机位', type: 'select',
          options: [
            { v: 0, t: '追尾（地平线保持水平）' },
            { v: 1, t: '座舱（跟随滚转）' },
            { v: 2, t: '目标（从侧上方看双方）' }
          ]
        },
        { k: 'fov', label: '视场角 FOV', type: 'range', min: 38, max: 100, unit: '°' },
        { k: 'camDist', label: '镜头距离', type: 'range', min: 16, max: 200, unit: ' m' },
        { k: 'camHeight', label: '镜头高度', type: 'range', min: -15, max: 60, unit: ' m' }
      ]
    },
    {
      title: '显示',
      items: [
        { k: 'hudScale', label: 'HUD 缩放', type: 'range', min: 70, max: 160, unit: '%' },
        { k: 'hudOpacity', label: 'HUD 透明度', type: 'range', min: 25, max: 100, unit: '%' },
        { k: 'compass', label: '顶部指南针', type: 'toggle' },
        { k: 'pitchLadder', label: '俯仰刻度', type: 'toggle' },
        { k: 'targetMarkers', label: '目标方位标记', type: 'toggle' }
      ]
    }
  ];

  function loadSettings() {
    var o = {}, k;
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) o[k] = DEFAULTS[k];
    try {
      var raw = window.localStorage.getItem(SET_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (k in saved) {
          if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) o[k] = saved[k];
        }
      }
    } catch (e) { /* 无痕模式或禁用存储时静默降级 */ }
    return o;
  }

  function saveSettings() {
    try { window.localStorage.setItem(SET_KEY, JSON.stringify(S)); } catch (e) {}
  }

  function applyAudioSettings() {
    if (typeof SFX.setVolumes !== 'function') return;
    SFX.setVolumes(S.volMaster / 100, S.volEngine / 100, S.volSfx / 100);
    SFX.setMuted(!!S.muted);
  }

  function onSettingChanged(key) {
    saveSettings();
    if (key === 'volMaster' || key === 'volEngine' || key === 'volSfx' || key === 'muted') {
      applyAudioSettings();
    }
    // 视角与显示类不需要额外动作：渲染每帧直接读 S
  }

  function makeSetRow(item) {
    var row = document.createElement('div');
    row.className = 'set-row';

    var lab = document.createElement('label');
    lab.textContent = item.label;
    row.appendChild(lab);

    if (item.type === 'select') {
      /* 下拉选择：给那些**不该热切换**的选项用。

         视角模式原来绑在 C 键上，按一下就换 —— 问题是误触的代价很大：
         画面在一瞬间变成另一个机位，玩家会当场失去态势感知，
         而空战里那一秒往往就是生死。放进设置里就必须主动选、确认。 */
      var sel = document.createElement('select');
      sel.className = 'set-select';
      for (var oi = 0; oi < item.options.length; oi++) {
        var op = document.createElement('option');
        op.value = item.options[oi].v;
        op.textContent = item.options[oi].t;
        if (S[item.k] === item.options[oi].v) op.selected = true;
        sel.appendChild(op);
      }
      sel.addEventListener('change', function () {
        S[item.k] = parseInt(sel.value, 10);
        onSettingChanged(item.k);
      });
      row.appendChild(sel);
      row.appendChild(document.createElement('span'));
    } else if (item.type === 'range') {
      var inp = document.createElement('input');
      inp.type = 'range';
      inp.min = item.min; inp.max = item.max; inp.step = item.step || 1;
      inp.value = S[item.k];

      var val = document.createElement('span');
      val.className = 'set-val';
      val.textContent = inp.value + (item.unit || '');

      inp.addEventListener('input', function () {
        S[item.k] = parseFloat(inp.value);
        val.textContent = inp.value + (item.unit || '');
        onSettingChanged(item.k);
      });

      row.appendChild(inp);
      row.appendChild(val);
    } else {
      var btn = document.createElement('button');
      btn.className = 'set-toggle' + (S[item.k] ? ' on' : '');
      btn.textContent = S[item.k] ? '已开启' : '已关闭';
      btn.addEventListener('click', function () {
        S[item.k] = !S[item.k];
        btn.className = 'set-toggle' + (S[item.k] ? ' on' : '');
        btn.textContent = S[item.k] ? '已开启' : '已关闭';
        onSettingChanged(item.k);
      });
      row.appendChild(btn);
      row.appendChild(document.createElement('span'));
    }
    return row;
  }

  /** 把整套设置控件渲染进任意容器（设置页 / 暂停菜单） */
  function buildSettingsInto(container) {
    if (!container) return;
    container.innerHTML = '';
    var col = document.createElement('div');
    col.className = 'set-col';

    for (var g = 0; g < SET_GROUPS.length; g++) {
      var grp = SET_GROUPS[g];
      var h = document.createElement('div');
      h.className = 'set-group';
      h.textContent = grp.title;
      col.appendChild(h);

      for (var i = 0; i < grp.items.length; i++) {
        col.appendChild(makeSetRow(grp.items[i]));
      }
      if (grp.hint) {
        var hint = document.createElement('div');
        hint.className = 'set-hint';
        hint.textContent = grp.hint;
        col.appendChild(hint);
      }
    }
    container.appendChild(col);
  }

  function resetSettings() {
    var k;
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) S[k] = DEFAULTS[k];
    saveSettings();
    applyAudioSettings();
    buildSettingsInto(document.getElementById('setWrap'));
    buildSettingsInto(document.getElementById('pauseSettings'));
  }

  /* ---------- 操作说明（独立页与暂停菜单共用同一份内容） ---------- */
  var KEYMAP = [
    ['鼠标移动', '引导机头指向（默认模式）'],
    ['M', '切换 鼠标引导 / 键盘直控'],
    ['W / S', '拉杆抬头 / 推杆低头'],
    ['A / D', '左滚 / 右滚'],
    ['Q / E', '方向舵'],
    ['Shift / Ctrl', '油门杆 —— 推满自动进加力，收到底自动张减速板'],
    ['X / Z', '直接推到底（加力）/ 收到底（减速板）'],
    ['↑ ↓ ← →', '自由视角（松开自动回中）'],
    ['鼠标左键 / Space', '机炮'],
    ['鼠标右键 / Enter', '发射特殊武器'],
    ['F / Tab', '切换目标'],
    ['R', '切换挂载'],
    ['V', '投放干扰弹 —— 热焰弹与箔丝同时撒出，按住连续投放'],
    ['—', '机位（追尾 / 座舱 / 目标）在「设置 → 视角」里改，无热键'],
    ['1 / 2 / 3', '僚机指令：散开 / 集火 / 掩护'],
    ['G', '高 G 机动 —— 大幅转向时按住，拉出额外过载，代价是掉速'],
    ['H', '暂停（暂停后可实时调整设置）']
  ];

  var TIPS = [
    'NEZ 不可逃逸区：锁定框收成<b>红色实环</b>时发射，敌机极难摆脱。',
    '能量机动：爬升掉速、俯冲增速。低速时舵效下降，谨防失速。',
    '导弹规避：把来袭导弹放在 3/9 线（正横），持续桶滚消耗其能量。',
    '动压 Q：18 km 以上的空气密度只有海平面的 12%。低于 <b>12 kPa</b> 时舵面开始失效、导弹过载崩塌 —— 但机炮的弹道反而更平直。',
    '交战规则：阵列空域内 20 kg 以上战斗部被禁用，重武器会自动锁定。',
    '注意地面：低于 200 m 触发地形告警，撞地即任务失败。'
  ];

  /** 操作说明。forPause=true 输出单栏（暂停菜单），否则输出双栏（独立手册页） */
  function buildHelpHTML(forPause) {
    var i, rows = '', tips = '';
    for (i = 0; i < KEYMAP.length; i++) {
      rows += '<tr><td><kbd>' + KEYMAP[i][0] + '</kbd></td><td>' + KEYMAP[i][1] + '</td></tr>';
    }
    for (i = 0; i < TIPS.length; i++) {
      tips += '<li>' + TIPS[i] + '</li>';
    }
    if (forPause) {
      return '<h4>基础操纵</h4><table>' + rows + '</table>' +
        '<h4>交战要诀</h4><ul class="tips">' + tips + '</ul>';
    }
    return '<div class="help-col"><h3>基础操纵</h3><table class="keymap">' + rows + '</table></div>' +
      '<div class="help-col"><h3>交战要诀</h3><ul class="tips">' + tips + '</ul></div>';
  }

  /* ============================================================
     机库
     ============================================================ */
  function buildHangar() {
    var list = document.getElementById('acList');
    list.innerHTML = '';
    for (var i = 0; i < AIRCRAFT.length; i++) {
      // 敌方制式机不进机库（但资料库里能查到）
      if (AIRCRAFT[i].npcOnly) continue;
      (function (idx) {
        var ac = AIRCRAFT[idx];
        var d = document.createElement('div');
        d.className = 'ac-card' + (idx === selectedAC ? ' sel' : '');
        d.innerHTML = '<div class="n">' + ac.name + '</div>' +
          '<div class="c">' + ac.nick.toUpperCase() + ' · ' + ac.cn + '</div>' +
          '<div class="r">' + ac.role + '</div>';
        d.onclick = function () {
          selectedAC = idx;
          activeHpGroup = null;
          SFX.click();
          buildHangar();
        };
        list.appendChild(d);
      })(i);
    }

    var ac = AIRCRAFT[selectedAC];
    var lo = getLoadout(ac);
    if (!activeHpGroup && ac.hardpointGroups && ac.hardpointGroups.length) {
      activeHpGroup = ac.hardpointGroups[0].id;
    }
    document.getElementById('acName').textContent = ac.name + '  「' + ac.cn + '」';
    document.getElementById('acRole').textContent = ac.role + '  ·  ' + ac.maker;

    /* 先算挂载重量 —— 六维条要拿它算"挂载之后"的实际值 */
    var list = resolveLoadout(ac, lo);
    var mass = loadoutMass(ac, lo);
    var mtow = ac.maxLoad || 5000;
    var loadK = Math.min(1, mass / mtow);
    var lp = loadoutPenalty(loadK);
    var gun = WEAPONS[ac.gun];

    /* 六维条显示的是**挂载之后**的实际值，不是机型的固有值 ——
       否则玩家看着一架飞机的数据、开的却是另一架。
       只有受挂载影响的维度会缩水，被吃掉的那一段用暗红标出来，
       右边再把净损失放在括号里。 */
    var stats = [
      ['最大速度', 'spd'], ['机动性', 'mob'], ['低可探测', 'stl'],
      ['火力', 'fire'], ['生存性', 'dur'], ['航程', 'rng']
    ];
    var sh = '';
    for (var k = 0; k < stats.length; k++) {
      var key = stats[k][1];
      var base = ac.stats[key];
      var v = base;
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
    document.getElementById('acStats').innerHTML = sh;
    document.getElementById('acDesc').innerHTML = ac.desc;

    buildHardpointEditor(ac, lo);

    var sum = '<div class="ld-head">出击配置</div>';
    sum += '<div class="ld-row"><span class="n">' + gun.name + '</span>' +
      '<span class="a">×' + gun.ammo + '</span><span class="s">机炮</span></div>';
    if (list.length) {
      for (k = 0; k < list.length; k++) {
        sum += '<div class="ld-row"><span class="n">' + list[k].w.name + '</span>' +
          '<span class="a">×' + list[k].ammo + '</span>' +
          '<span class="s">齐射 ' + list[k].salvo + '</span></div>';
      }
    } else {
      sum += '<div class="ld-row empty"><span class="n">无挂载</span></div>';
    }
    sum += '<div class="ld-row"><span class="n">干扰弹</span>' +
      '<span class="a">×8</span><span class="s">固定</span></div>';

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

    sum += '<div class="ld-mass">挂载重量 <b>' + mass + ' / ' + mtow + ' kg</b>';
    if (loadK > 0.015) {
      sum += '<div class="ld-pen"><span class="l">挂载影响</span>' +
        '<b class="warn">加速 −' + pctTxt(1 - lp.accel) + '%</b>' +
        '<b class="warn">俯仰 −' + pctTxt(1 - lp.pitch) + '%</b>' +
        '<b class="warn">滚转 −' + pctTxt(1 - lp.roll) + '%</b>' +
        '<b>最大速度 −' + pctTxt(1 - lp.vMax) + '%</b>' +
        '<b>失速 +' + pctTxt(lp.vStall - 1) + '%</b>' +
        '</div>';
    } else {
      sum += '<div class="ld-pen"><span class="l">挂载影响</span><b>无损失</b></div>';
    }
    sum += '</div>';
    sum += '<div class="ld-note">编号前缀取自逻辑语词根 —— ' +
      '环带工程自 2062 年起以逻辑语为签字语言，详见资料库。</div>';
    document.getElementById('acLoadout').innerHTML = sum;

    /* ---- 俯视识别图 ---- */
    PLANFORM.draw(document.getElementById('planCv'), ac, lo, activeHpGroup);
    document.getElementById('planCap').innerHTML =
      '绿色为挂载，<b>琥珀为当前编辑的挂载点组</b>，青色虚线为可变后掠翼的展开位' +
      '<br><span class="hw">同一种武器挂到多个组上，弹药池与齐射数会一起累加</span>';
  }

  /* ============================================================
     挂载系统
     ============================================================ */

  /** 取某机型的挂载配置（按需初始化成默认值） */
  function getLoadout(ac) {
    if (!loadouts[ac.id]) {
      var lo = {};
      var groups = ac.hardpointGroups || [];
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        lo[g.id] = (ac.defaultLoadout && ac.defaultLoadout[g.id]) || null;
      }
      loadouts[ac.id] = lo;
    }
    return loadouts[ac.id];
  }

  /**
   * 把挂载配置展开成武器列表。
   * 同一种武器占了多个挂载点就合并成一條：弹药累加，齐射数 = 挂载点总数。
   */
  function resolveLoadout(ac, lo) {
    var groups = ac.hardpointGroups || [];
    var map = {};
    var order = [];

    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var wid = lo ? lo[g.id] : null;
      if (!wid || !WEAPONS[wid]) continue;
      var w = WEAPONS[wid];
      // 被动吊舱不进武器纵列表 —— 它没有扳机可扣。
      // 它提供的加成由 passiveEffects() 单独汇总。
      if (w.passive) continue;
      var e = map[wid];
      if (!e) {
        e = map[wid] = { wid: wid, w: w, points: 0, ammo: 0, salvo: 0 };
        order.push(wid);
      }
      e.points += g.pts.length;
      e.salvo += g.pts.length;
      e.ammo += g.pts.length * (w.perPoint || 1);
    }

    // 空空弹排前面，其余按名称
    order.sort(function (a, b) {
      var wa = WEAPONS[a], wb = WEAPONS[b];
      var ka = wa.kind === 'aam' ? 0 : 1, kb = wb.kind === 'aam' ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return wa.name < wb.name ? -1 : 1;
    });

    var out = [];
    for (i = 0; i < order.length; i++) out.push(map[order[i]]);
    return out;
  }

  /**
   * 汇总被动吊舱的效果。
   * 这类挂载不发射任何东西，装上就一直在起作用 ——
   * 它们让"少带一枚弹"变成一个真实的取舍，而不只是纯损失。
   */
  function passiveEffects(ac, lo) {
    var e = { lockResist: 0, armor: 0, lockRange: 1, flareBonus: 0 };
    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var wid = lo ? lo[g.id] : null;
      if (!wid || !WEAPONS[wid]) continue;
      var w = WEAPONS[wid];
      if (!w.passive) continue;
      var n = g.pts.length;
      if (w.lockResist) e.lockResist = Math.max(e.lockResist, w.lockResist);
      if (w.armorBonus) e.armor += w.armorBonus * n;
      if (w.lockRangeBonus) e.lockRange += w.lockRangeBonus * n;
      if (w.flareBonus) e.flareBonus += w.flareBonus * n;
    }
    e.armor = Math.min(e.armor, 0.55);
    e.lockRange = Math.min(e.lockRange, 1.9);
    return e;
  }

  /** 挂载总重量（kg） */
  function loadoutMass(ac, lo) {
    var m = 0;
    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var wid = lo ? lo[g.id] : null;
      if (!wid || !WEAPONS[wid]) continue;
      var w = WEAPONS[wid];
      m += g.pts.length * (w.perPoint || 1) * (w.mass || 100);
    }
    return m;
  }

  function hpKindLabel(k) {
    return ({ tip: '翼尖', light: '通用', heavy: '重挂', belly: '机腹' })[k] || k;
  }

  /* ============================================================
     挂载点编辑器

     左栏是挂载点组，右栏是该组能挂的东西 —— 每一项都是一张卡片，
     带定位、简介和关键参数。

     早期版本这里是个下拉框，里面只有型号（"TOR-2 ×16"）。
     问题是玩家根本不知道 TOR-2 是什么：打什么的、能打多远、
     为什么该选它而不是旁边那个，全得靠背。
     ============================================================ */
  function buildHardpointEditor(ac, lo) {
    buildHpGroups(ac, lo);
    buildHpPicker(ac, lo);
  }

  /** 左栏：挂载点组列表。点一行切换右栏显示哪一组。 */
  function buildHpGroups(ac, lo) {
    var host = document.getElementById('hpList');
    if (!host) return;
    host.innerHTML = '';

    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      (function (g) {
        var w = lo[g.id] ? WEAPONS[lo[g.id]] : null;

        var row = document.createElement('div');
        row.className = 'hp-row' + (g.id === activeHpGroup ? ' on' : '');
        row.setAttribute('data-hp', g.id);
        row.innerHTML =
          '<div class="hp-top"><span class="hp-id">' + g.id + '</span>' +
          '<span class="hp-lb">' + g.label + '</span></div>' +
          '<div class="hp-sub">' + g.pts.length + ' 点 · ' + hpKindLabel(g.kind) + '</div>' +
          '<div class="hp-cur' + (w ? '' : ' empty') + '">' +
          (w ? w.name + ' ' + w.cn.split(' · ')[0] : '空置') + '</div>';

        row.onclick = function () {
          activeHpGroup = g.id;
          SFX.click();
          buildHangar();
        };
        host.appendChild(row);
      })(groups[i]);
    }
  }

  /** 右栏：当前选中组的可选项，每个一张卡片 */
  function buildHpPicker(ac, lo) {
    var host = document.getElementById('hpPicker');
    if (!host) return;
    host.innerHTML = '';

    var groups = ac.hardpointGroups || [];
    var g = null, i;
    for (i = 0; i < groups.length; i++) {
      if (groups[i].id === activeHpGroup) g = groups[i];
    }
    if (!g) { g = groups[0]; activeHpGroup = g ? g.id : null; }
    if (!g) return;

    var head = document.createElement('div');
    head.className = 'pk-head';
    head.textContent = '挂载点 ' + g.id + ' · ' + g.label +
      '（' + hpKindLabel(g.kind) + ' · ' + g.pts.length + ' 点）';
    host.appendChild(head);

    // 空置排最前 —— 它也是一个正经选项，不是"什么都不选"
    host.appendChild(makeStoreCard(lo, g, null));

    /* 两类筛选是独立的：
         fits  —— 挂点类型对不对（物理上挂不挂得住）
         caps  —— 机体能力够不够（火控、供电、散热撑不撑得住）
       第二类是后来补的：只有 fits 的话，制空战斗机也能挂重型巡航导弹。 */
    var blocked = 0;
    for (var wid in WEAPONS) {
      if (!Object.prototype.hasOwnProperty.call(WEAPONS, wid)) continue;
      var w = WEAPONS[wid];
      if (w.kind === 'gun') continue;
      if (!w.fits || w.fits.indexOf(g.kind) < 0) continue;
      if (!canCarry(ac, w)) { blocked++; continue; }
      host.appendChild(makeStoreCard(lo, g, wid));
    }
    if (blocked) {
      head.textContent += '  ·  ' + blocked + ' 项因机体能力不足不可挂';
    }
  }

  /** 一张挂载卡片。wid 为 null 表示"空置"。 */
  function makeStoreCard(lo, g, wid) {
    var n = g.pts.length;
    var card = document.createElement('div');
    var cur = (lo[g.id] || null) === wid;
    card.className = 'pk-card' + (cur ? ' on' : '') + (wid ? '' : ' empty');

    if (!wid) {
      card.innerHTML =
        '<div class="pk-n">空置</div>' +
        '<div class="pk-role">不挂任何东西</div>' +
        '<div class="pk-d">省下这一组的挂载重量，换回一点机动性 —— ' +
        '挂载越重，加速与转向越吃亏。</div>';
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

    card.onclick = function () {
      lo[g.id] = wid;
      SFX.click();
      buildHangar();
    };
    return card;
  }

  /** 卡片底部的参数行。n = 这一组的点数（也就是并行发射槽的数量） */
  function storeStatLine(w, n) {
    var bits = [];
    if (w.passive) {
      bits.push('被动 · 不占扳机');
    } else {
      if (n) bits.push(n + ' 个发射槽');
      var r = missileRange(w);
      if (r) bits.push('射程 ' + r.toFixed(1) + ' km');
      if (w.kind === 'dew' && w.interceptRange) {
        bits.push('拦截 ' + (w.interceptRange / 1000).toFixed(1) + ' km');
      }
      var sk = ({ ir: '红外', radar: '雷达', none: '无制导' })[w.seeker];
      if (sk && w.seeker !== 'none') {
        bits.push('导引 ' + sk + ' ' + Math.round((w.lead || 0) * 100) + '%');
      }
    }
    bits.push(w.mass + ' kg');
    if (w.cd) bits.push('冷却 ' + w.cd.toFixed(1) + 's');
    return bits.join(' · ');
  }

  function kindLabel(k) {
    return ({ gun: '机炮', aam: '空空导弹', asm: '反大型目标', agm: '空地导弹', bomb: '制导炸弹', ecm: '电子战', dew: '定向能' })[k] || k;
  }

  /* 制式编号的含义（前缀取自逻辑语词根，但玩家只需要看懂中文含义） */
  var ROOTS = {
    k3: '发射器 / 炮',
    k7: '发射器 / 炮',
    v9: '组 / 群',
    v11: '快',
    v17: '长',
    v22: '摧毁',
    v25: '攻击',
    v30: '扩散 / 播撒',
    e4: '干扰',
    l2: '光',
    dl4: '远',
    dl6: '之间 / 近',
    dl9: '防卫'
  };

  /* ============================================================
     简报
     ============================================================ */
  /** 简报页顶部的任务选择器 —— 先看简报，再据此挑机体 */
  function buildMissionList() {
    var list = document.getElementById('msnList');
    if (!list) return;
    list.innerHTML = '';
    for (var i = 0; i < MISSIONS.length; i++) {
      (function (idx) {
        var mm = MISSIONS[idx];
        var d = document.createElement('div');
        d.className = 'msn-item' + (idx === missionIdx ? ' sel' : '');
        d.innerHTML = '<div class="no">' + mm.no + '</div>' +
          '<div class="nm">' + mm.name + '</div>' +
          '<div class="st' + (cleared[idx] ? ' done' : '') + '">' +
          (cleared[idx] ? '已完成' : mm.en) + '</div>';
        d.addEventListener('click', function () {
          if (idx === missionIdx) return;
          missionIdx = idx;
          SFX.unlock(); SFX.click();
          buildBrief();
        });
        list.appendChild(d);
      })(i);
    }
  }

  function buildBrief() {
    var m = MISSIONS[missionIdx];
    buildMissionList();
    document.getElementById('bNo').textContent = m.no + '   //   ' + m.en;
    document.getElementById('bName').textContent = m.name;
    document.getElementById('bLoc').textContent = m.loc;
    document.getElementById('briefDate').textContent = m.date;
    document.getElementById('bProse').innerHTML = m.prose;

    var o = '';
    for (var i = 0; i < m.objectives.length; i++) o += '<li>' + m.objectives[i] + '</li>';
    document.getElementById('bObj').innerHTML = o;

    var t = '';
    for (i = 0; i < m.threats.length; i++) t += '<li class="th">' + m.threats[i] + '</li>';
    document.getElementById('bThreat').innerHTML = t;

    document.getElementById('bIntel').innerHTML = m.intel;
    drawMap(m);
  }

  function drawMap(m) {
    var c = document.getElementById('mapCv');
    if (!c) return;
    var g = c.getContext('2d');
    var W = c.width, H = c.height;
    g.fillStyle = '#060b10'; g.fillRect(0, 0, W, H);

    // 网格
    g.strokeStyle = 'rgba(30,44,56,0.9)'; g.lineWidth = 1;
    for (var i = 1; i < 6; i++) {
      g.beginPath(); g.moveTo(W * i / 6, 0); g.lineTo(W * i / 6, H); g.stroke();
      g.beginPath(); g.moveTo(0, H * i / 6); g.lineTo(W, H * i / 6); g.stroke();
    }
    var R = 17000;
    var cx = W / 2, cy = H * 0.72;
    // 世界坐标 → 屏幕坐标。x 与 z 的缩放系数不同（地图是压扁的），
    // 所以陆块在屏幕上也会被相应拉伸。
    function MX(wx) { return cx + wx / R * (W * 0.45); }
    function MY(wz) { return cy - wz / R * (H * 0.62); }

    /* 这里不再画陆地。

       整个战役都发生在**纯海域**上：战斗画面里没有任何地形，
       所有"地面"目标其实都是海上平台。在简报地图上画岛，
       等于承诺了一片战场上根本不存在的地形 —— 玩家飞到那儿
       会发现海面上什么都没有。地图只画海面与任务标记，
       反而和实际看到的东西一致。 */

    var cols = { base: '#4fe08a', enemy: '#ff4d4d', relay: '#ffb03a', sam: '#ff8b2a', site: '#45d6ff' };

    for (i = 0; i < m.map.length; i++) {
      var p = m.map[i];
      var x = MX(p.x);
      var y = MY(p.z);
      var col = cols[p.type] || '#8fa3b2';
      g.strokeStyle = col; g.lineWidth = 1.6;
      g.beginPath();
      if (p.type === 'enemy') {
        g.moveTo(x, y - 6); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.closePath();
        g.stroke();
      } else {
        g.rect(x - 4, y - 4, 8, 8); g.stroke();
      }
      g.fillStyle = col;
      g.font = '10px Consolas,monospace';
      g.fillText(p.label, x + 8, y + 3);
    }

    // 玩家进入箭头
    g.strokeStyle = '#4fe08a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy + 26); g.lineTo(cx, cy - 6);
    g.lineTo(cx - 5, cy + 2); g.moveTo(cx, cy - 6); g.lineTo(cx + 5, cy + 2);
    g.stroke();

    g.fillStyle = 'rgba(143,163,178,0.75)';
    g.font = '10px Consolas,monospace';
    g.fillText('N', 8, 16);
    g.fillText('SCALE 1:170000', 8, H - 8);
  }

  /* ============================================================
     资料库
     ============================================================ */
  var codexSel = 0;
  function buildCodex() {
    var nav = document.getElementById('codexNav');
    nav.innerHTML = '';
    var lastCat = null;
    for (var i = 0; i < CODEX.length; i++) {
      if (CODEX[i].cat !== lastCat) {
        lastCat = CODEX[i].cat;
        var c = document.createElement('div');
        c.className = 'cx-cat';
        c.textContent = lastCat;
        nav.appendChild(c);
      }
      (function (idx) {
        var d = document.createElement('div');
        d.className = 'cx-item' + (idx === codexSel ? ' sel' : '');
        d.textContent = CODEX[idx].title;
        d.onclick = function () { codexSel = idx; SFX.click(); buildCodex(); };
        nav.appendChild(d);
      })(i);
    }
    var e = CODEX[codexSel];
    // 条目可以给静态 html，也可以给 build() 现场生成 ——
    // 图鉴那几条必须动态生成，否则改了武器数据文档就对不上了
    var body = typeof e.build === 'function' ? e.build() : (e.html || '');
    document.getElementById('codexBody').innerHTML =
      '<div class="cx-title">' + e.title + '</div>' +
      '<div class="cx-sub">' + e.sub + '</div>' +
      '<div class="cx-text">' + body + '</div>';
  }

  /* ============================================================
     世界
     ============================================================ */
  function newWorld() {
    var w = {
      time: 0,
      actors: [], missiles: [], bullets: [], particles: [], targets: [],
      wings: {},
      player: null,
      flags: {},
      objective: '', objectiveSub: '',
      roeBlocked: false, detected: false,
      killed: 0, hitsLanded: 0, shotsFired: 0
    };
    w.fireMissile = function (actor, target) {
      var m = launch(actor, target, w);
      /* 别人发射导弹的声音，按距离衰减。

         这条路径也是 AI 唯一的发射入口，所以挂在这里就全覆盖了。
         玩家自己发射时 SFX.missile() 已经在 fireSpecial 里播过，
         不要重复。 */
      if (m && player && actor !== player) {
        SFX.missileAt(M3.dist(actor.pos, player.pos));
      }
      return m;
    };
    w.radio = Radio;
    return w;
  }

  /** 把 wpIdx 指向的那一组同步到 special / spAmmo / spSalvo / spCd */
  function syncWeapon(a) {
    if (!a || !a.loadoutList || !a.loadoutList.length) {
      if (a) { a.special = null; a.spAmmo = 0; a.spSalvo = 1; a.spCd = 0; }
      return;
    }
    if (a.wpIdx >= a.loadoutList.length) a.wpIdx = 0;
    var e = a.loadoutList[a.wpIdx];
    a.special = e.wid;
    a.spAmmo = a.ammoPool ? (a.ammoPool[e.wid] || 0) : 0;
    a.spSalvo = e.salvo;
    // 冷却也跟着切过去，每件武器各算各的
    // spCd = 最快就绪的那个槽的剩余时间，供 HUD 与 AI 判断能不能打
    var sl = a.slotCd ? a.slotCd[e.wid] : null;
    a.spCd = sl ? Math.min.apply(null, sl) : 0;
  }

  function launch(actor, target, w) {
    var wp = WEAPONS[actor.special];
    if (!wp) return false;

    /* ECM 吊舱 */
    if (wp.kind === 'ecm') {
      if (actor.spCd > 0) return false;
      actor.spActive = wp.duration;
      actor.spCd = wp.cd;
      if (actor.slotCd && actor.slotCd[actor.special]) {
        actor.slotCd[actor.special][0] = wp.cd;
      }
      SFX.laser();
      Radio.raw({ who: actor.isPlayer ? CALLSIGN.player : actor.name, cls: 'ally', tx: '<i>认知电子战吊舱开机 —— 敌方锁定距离 −40%</i>', gap: 0.6 });
      return true;
    }
    /* DEW 是自动系统，不能手动发射 */
    if (wp.kind === 'dew') return false;

    if (actor.spAmmo <= 0) return false;

    /* 找一个冷却完毕的发射槽。找不到就按不出去 ——
       这就是"每个冷却单独计算"：连打几发之后要挨个等它们装填。 */
    var slotIdx = -1;
    var slotArr = actor.slotCd ? actor.slotCd[actor.special] : null;
    if (slotArr) {
      for (var si = 0; si < slotArr.length; si++) {
        if (slotArr[si] <= 0) { slotIdx = si; break; }
      }
      if (slotIdx < 0) return false;
    } else if (actor.spCd > 0) {
      return false;                       // 没有槽表就退回旧的单冷却
    }

    /* 交战规则：阵列空域内禁止 20 kg 以上战斗部 */
    if (actor.isPlayer && w.roeBlocked &&
      (wp.kind === 'asm' || wp.kind === 'agm' || wp.kind === 'bomb')) {
      Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>交战规则限制 —— 该武器在阵列空域内被锁定。</b>', gap: 0.9 });
      return false;
    }
    if (!target && wp.target !== 'ground' && wp.target !== 'ship') return false;

    /* 一次按键只打 1 枚。
       挂载点决定的是"能同时装填几发"（也就是 slotArr 的长度），
       不是一次打几发 —— "齐射数"的含义就是：
       连按几次能打出几枚，之后要挨个等它们装填。 */
    var si2 = Math.max(0, slotIdx);
    var side = (si2 % 2) ? 1 : -1;
    var rank = Math.floor(si2 / 2);
    var hp = M3.add(actor.pos, M3.add(
      M3.mul(actor.fwd, 4),
      M3.mul(actor.right, side * (2.4 + rank * 1.9))));

    var m = Ent.makeMissile({
      weapon: actor.special,
      team: actor.team,
      pos: hp,
      fwd: actor.fwd,
      speed: actor.speed + 70,
      target: target || null,
      owner: actor
    });
    w.missiles.push(m);

    actor.spAmmo -= 1;
    if (slotArr) {
      slotArr[si2] = wp.cd;
      // spCd 取"最快就绪的那个槽"，供 HUD 与 AI 判断还能不能再打
      actor.spCd = Math.min.apply(null, slotArr);
    } else {
      actor.spCd = wp.cd;
    }

    if (actor.isPlayer) {
      if (actor.ammoPool) actor.ammoPool[actor.special] = actor.spAmmo;
      w.shotsFired += 1;
      SFX.missile();
    } else {
      var d = M3.dist(actor.pos, w.player.pos);
      if (d < 6000) SFX.missileFar();
    }
    return true;
  }

  /* ============================================================
     开始任务
     ============================================================ */
  function startMission(idx) {
    missionIdx = idx;
    mission = MISSIONS[idx];
    world = newWorld();
    stats = { startTime: 0, endTime: 0 };

    var ac = AIRCRAFT[selectedAC];
    var lo = getLoadout(ac);
    var wl = resolveLoadout(ac, lo);
    var loadK = Math.min(1, loadoutMass(ac, lo) / (ac.maxLoad || 5000));

    var p = Ent.makeAircraft({
      type: ac.id, team: 0, isPlayer: true,
      x: 0, y: mission.altStart, z: 0,
      fwd: M3.V(0, 0, 1),
      speed: mission.speedStart,
      special: wl.length ? wl[0].wid : null
    });

    // 挂载配置落到飞机上：武器列表 + 弹药池 + 每个挂载点一个发射槽
    p.loadoutList = wl;
    p.ammoPool = {};
    for (var wi = 0; wi < wl.length; wi++) p.ammoPool[wl[wi].wid] = wl[wi].ammo;

    p.slotCd = {};
    for (wi = 0; wi < wl.length; wi++) {
      var sArr = [];
      /* 初始分配：发射槽数 = 挂点数，而储备弹数可能少于它
         （一个挂点只带一发、而飞机上有两个这样的挂点）。

         这时多出来的挂架**一开始就该是空的**，不能当成"已装填" ——
         否则挂架上的弹会比仓库里还多。空位用 SLOT_EMPTY 标记，
         它在 stepAircraft 里永远不会被减到 0。 */
      var ammoW = wl[wi].ammo;
      for (var sj = 0; sj < wl[wi].salvo; sj++) {
        sArr.push(sj < ammoW ? 0 : Ent.SLOT_EMPTY);
      }
      p.slotCd[wl[wi].wid] = sArr;
    }

    p.wpIdx = 0;
    p.spAmmo = wl.length ? wl[0].ammo : 0;
    p.spSalvo = wl.length ? wl[0].salvo : 1;
    // 挂载重量：拖累机动性，空挂架能换回一点
    p.loadFactor = loadK;

    // 被动吊舱的效果（不占扳机，装上就生效）
    var pe = passiveEffects(ac, lo);
    p.armor = pe.armor;              // 全向减伤
    p.lockResist = pe.lockResist;    // 缩短敌方对我的锁定距离
    p.lockRangeK = pe.lockRange;     // 放大我的锁定距离
    p.flares += pe.flareBonus;

    // 原始配置留着 —— HUD 的挂载状态图要按它来画
    p.loadout = lo;

    p.name = CALLSIGN.player;
    p.label = CALLSIGN.player;
    world.player = p;
    world.actors.push(p);
    player = p;

    mission.spawn(world);

    // 初始镜头
    camFwd = M3.clone(p.fwd);
    camUp = M3.V(0, 1, 0);
    camPos = M3.add(p.pos, M3.V(0, 30, -110));

    Radio.clear();
    Radio.play(mission.id, 'start');

    banner = { t: 3.4, title: mission.no.replace('OPERATION ', 'OPERATION '), sub: mission.name + '   //   ' + mission.en, col: HUD.AMBER };

    hideAll();
    state = 'playing';
    paused = false;
    document.getElementById('pause').classList.remove('on');

    // 选择初始目标
    p.target = null;
    SFX.confirm();
  }

  /* ============================================================
     输入
     ============================================================ */
  function bindInput() {
    document.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();

      if (state === 'playing') {
        if (e.code === 'KeyH') togglePause();
        if (e.code === 'KeyM') toggleAimMode();
        if (e.code === 'KeyF' || e.code === 'Tab') cycleTarget();
        if (e.code === 'KeyR') cycleSpecial();
        // V 改成按住连发，见 controlPlayer()
        if (e.code === 'Enter') fireSpecial();
        if (e.code === 'Digit1' && player) setWingCmd('spread');
        if (e.code === 'Digit2' && player) setWingCmd('focus');
        if (e.code === 'Digit3' && player) setWingCmd('cover');
      }
      if (e.code === 'Escape') {
        if (state === 'playing') togglePause();
        else if (['hangar', 'codex', 'help', 'brief'].indexOf(state) >= 0) show('title');
      }
    });
    document.addEventListener('keyup', function (e) { keys[e.code] = false; });

    window.addEventListener('blur', function () {
      keys = {};
      mouse.left = mouse.right = false;
      if (state === 'playing' && !paused) togglePause();
    });

    cv.addEventListener('mousedown', function (e) {
      SFX.unlock();
      if (e.button === 0) mouse.left = true;
      if (e.button === 2) { mouse.right = true; fireSpecial(); }
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) mouse.left = false;
      if (e.button === 2) mouse.right = false;
    });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    cv.addEventListener('mousemove', function (e) {
      var r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });

    cv.addEventListener('wheel', function (e) {
      if (state !== 'playing' || !player) return;
      player.throttle = M3.clamp(player.throttle - e.deltaY * 0.0007, 0, THR_MAX);
    }, { passive: true });

    window.addEventListener('resize', function () { Renderer.resize(); });
  }

  function setWingCmd(cmd) {
    var names = { spread: '散开 SPREAD', focus: '集火 FOCUS', cover: '掩护 COVER' };
    for (var k in world.wings) {
      if (world.wings[k] && world.wings[k].ai) world.wings[k].ai.cmd = cmd;
    }
    Radio.raw({ who: CALLSIGN.player, cls: 'ally', tx: '僚机指令：<b>' + names[cmd] + '</b>', gap: 0.5 });
    SFX.confirm();
  }

  function cycleTarget() {
    if (!world || !player) return;
    var cands = [];
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (a.alive && a.team !== player.team) cands.push(a);
    }
    for (i = 0; i < world.targets.length; i++) {
      // 只把真正的敌方目标纳入锁定循环；中立的调节单元不可被选为目标
      if (world.targets[i].alive && world.targets[i].team === 1) cands.push(world.targets[i]);
    }
    if (!cands.length) return;
    var cur = player.target, at = -1;
    for (i = 0; i < cands.length; i++) if (cands[i] === cur) at = i;
    var next = cands[(at + 1) % cands.length];

    // 优先选距离最近的几架飞机，避免把海上目标排在前
    if (at < 0) {
      var best = null, bd = 1e12;
      for (i = 0; i < cands.length; i++) {
        var d = M3.dist2(cands[i].pos, player.pos);
        var wgt = cands[i].kind === 'air' ? d : d * 4;
        if (wgt < bd) { bd = wgt; best = cands[i]; }
      }
      next = best;
    }
    player.target = next;
    player.lockProgress = 0;
    SFX.lockTone(false);
  }

  function cycleSpecial() {
    if (!player || !player.alive) return;
    if (!player.loadoutList || player.loadoutList.length < 2) {
      SFX.loseLock();
      return;
    }
    player.wpIdx = (player.wpIdx + 1) % player.loadoutList.length;
    syncWeapon(player);
    var w = WEAPONS[player.special];
    // 注意不重置 spCd —— syncWeapon 已经从 slotCd 取回这把武器最快就绪的槽
    player.spActive = 0;
    if (w.kind === 'dew') player.spCharges = w.charges;
    player.lockProgress = 0;
    Radio.raw({
      who: CALLSIGN.player, cls: 'ally',
      tx: '挂载切换：<b>' + w.name + ' 「' + w.cn + '」</b>', gap: 0.5
    });
    SFX.confirm();
  }

  function fireSpecial() {
    if (state !== 'playing' || !player || !player.alive) return;
    var w = WEAPONS[player.special];
    if (w.kind === 'ecm') { launch(player, null, world); return; }
    if (w.kind === 'dew') {
      Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: 'GUS-2 是自动拦截系统，无需手动发射。', gap: 0.6 });
      return;
    }
    if (!player.target || !player.target.alive) {
      Radio.raw({ who: CALLSIGN.player, cls: 'ally', tx: '<i>没有锁定目标。</i>', gap: 0.5 });
      return;
    }
    if (player.spAmmo <= 0) { SFX.loseLock(); return; }
    if (player.spCd > 0) { SFX.loseLock(); return; }
    if (player.lockProgress < 1 && w.seeker === 'radar') { SFX.loseLock(); return; }
    if (launch(player, player.target, world)) {
      Radio.raw({ who: CALLSIGN.player, cls: 'ally', tx: w.seeker === 'radar' ? '<b>Fox 3</b>' : '<b>Fox 2</b>', gap: 0.4 });
    }
  }

  function togglePause() {
    paused = !paused;
    document.getElementById('pause').classList.toggle('on', paused);
    if (paused) {
      SFX.silence();
      SFX.warning(false);
      SFX.gun(false);
      // 暂停时把设置与操作说明都渲染好，玩家可以一边调一边看画面变化
      switchPauseTab('main');
      buildSettingsInto(document.getElementById('pauseSettings'));
      document.getElementById('pauseHelp').innerHTML = buildHelpHTML(true);
    }
    SFX.click();
  }

  /** 切换暂停菜单的页签：main / settings / help */
  function switchPauseTab(name) {
    var tabs = document.querySelectorAll('[data-ptab]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-ptab') === name);
    }
    var panes = ['main', 'settings', 'help'];
    for (i = 0; i < panes.length; i++) {
      var el = document.getElementById('pane-' + panes[i]);
      if (el) el.classList.toggle('on', panes[i] === name);
    }
  }

  function buildHelpPage() {
    var body = document.getElementById('helpBody');
    if (body) body.innerHTML = buildHelpHTML(false);
  }

  /* ============================================================
     玩家控制
     ============================================================ */
  /** 鼠标引导：把屏幕上的瞄准点转成世界方向，再交给追击转弯控制律 */
  function updateMouseAim() {
    var cam = Renderer.getCam();
    if (!cam) return;
    var mx = mouse.x - Renderer.W / 2;
    var my = mouse.y - Renderer.H / 2;
    var dead = 5;
    if (Math.abs(mx) < dead) mx = 0;
    if (Math.abs(my) < dead) my = 0;

    // 屏幕点 → 相机空间 → 世界方向
    var cx = mx / cam.focal;
    var cy = -my / cam.focal;
    var dir = M3.norm(M3.V(
      cam.fwd.x + cam.right.x * cx + cam.up.x * cy,
      cam.fwd.y + cam.right.y * cx + cam.up.y * cy,
      cam.fwd.z + cam.right.z * cx + cam.up.z * cy
    ));

    /* 把鼠标的纵向位置也交给 steerTo。

       为什么不让它自己按目标方向的 ux 判断：ux 取决于 FOV。
       鼠标能指到的最大下方角度只有**半个 FOV** ——
       FOV 56° 时是 28°，归一化后 ux 最小只有 -0.47；
       FOV 38° 时只有 19°，最小 -0.33。用固定的 ux 阈值，
       要么在某些 FOV 下永远够不到（这正是"移到屏幕底部还是俯下"的原因），
       要么在另一些 FOV 下过早触发。

       直接看鼠标在屏幕上的位置就没有这个耦合。 */
    /* 鼠标在屏幕上的归一化位置（±1 = 边缘）。

       这是 steerTo 判断"推杆还是滚转"的依据 —— **必须用屏幕坐标**。
       飞机滚转之后"屏幕下方"和"机体下方"根本不是一回事：
       侧飞 90° 时屏幕右侧恰好落在机体 up 方向上，用机体坐标判断
       会把"拉右"误判成"抬头"。 */
    player.aimX = (mouse.x - Renderer.W / 2) / (Renderer.W * 0.5);
    player.aimDown = (mouse.y - Renderer.H / 2) / (Renderer.H * 0.5);

    // 传 player 自身作为锁存容器（提供 rollLock / aimDown 字段）
    AI.steerTo(player, dir, player.ctrl, player);
    player.aimDir = dir;
  }

  function toggleAimMode() {
    aimMode = !aimMode;
    cv.style.cursor = aimMode ? 'none' : 'default';
    Radio.raw({
      who: CALLSIGN.player, cls: 'ally',
      tx: aimMode
        ? '飞控：<b>指令增稳</b> —— 鼠标给出机头指向，飞控解算舵面'
        : '飞控：<b>直接操纵</b> —— 键盘直控舵面',
      gap: 0.7
    });
    SFX.confirm();
  }

  function controlPlayer(dt) {
    if (!player.alive) return;
    var c = player.ctrl;

    /* 干扰弹：按住 V 连续投放，一次一组。
       "组"才是战术单位 —— 真实中也是按一个程序打出去，
       而不是一发一发抠。投放节奏由 breakLock 里的 flareCd 控制，
       所以按住不放会自动按间隔连发，松手就停。 */
    if (keys.KeyV) Ent.breakLock(player, world);

    if (aimMode) {
      // 鼠标引导：飞控把机头指向瞄准点，但照样受动压与失速限制
      updateMouseAim();
      var kp = (keys.KeyW ? 1 : 0) + (keys.KeyS ? -1 : 0);
      var kr = (keys.KeyD ? 1 : 0) + (keys.KeyA ? -1 : 0);
      var ky = (keys.KeyE ? 1 : 0) + (keys.KeyQ ? -1 : 0);
      if (kp) c.pitch = kp;        // 键盘随时可以覆盖飞控
      if (kr) c.roll = kr;
      if (ky) c.yaw = ky;
    } else {
      c.pitch = (keys.KeyW ? 1 : 0) + (keys.KeyS ? -1 : 0);
      c.roll = (keys.KeyD ? 1 : 0) + (keys.KeyA ? -1 : 0);
      c.yaw = (keys.KeyE ? 1 : 0) + (keys.KeyQ ? -1 : 0);
    }

    // 单一油门轴：推满自动进加力，收到底自动张减速板。
    // X / Z 保留为"一把推到底 / 一把收到底"的快捷键。
    var thrIn = 0;
    if (keys.ShiftLeft || keys.ShiftRight) thrIn += 1;
    if (keys.ControlLeft || keys.ControlRight) thrIn -= 1;

    /* 加力和减速板都是"按住才有效"的临时状态。

       油门轴是连续的（0 → 1.25）：越过 1.0 进加力，低于 0.04 张减速板。
       但松手之后不该停在那个区间里 —— 否则玩家松开键，
       飞机还在烧加力（或者还挂着减速板），而他的预期是"回到常规推力"。

       所以松手时自动回落到军推区间的边界（1.0 / 0.04）。
       回落比推进慢一些，免得一松手就"咔"地弹回来。 */
    if (thrIn) {
      player.throttle += thrIn * dt * 0.62;
    } else if (player.throttle > 1.0) {
      player.throttle = Math.max(1.0, player.throttle - dt * 1.6);
    } else if (player.throttle < 0.04) {
      player.throttle = Math.min(0.04, player.throttle + dt * 1.6);
    }

    // X / Z 仍然是"一把推到底 / 一把收到底"，同样松手即回落
    if (keys.KeyX) player.throttle = THR_MAX;
    if (keys.KeyZ) player.throttle = 0;

    /* ---- 高 G 机动 ----
       只有在"确实在使劲转"的时候才允许触发 —— 鼠标只偏一点点时
       按住 G 不会有任何效果，否则它会变成一个无脑常开的加速器。
       代价是动能：拉高 G 掉速极快，用完之后就没法再机动了。 */
    var demand = Math.abs(c.pitch) + Math.abs(c.roll);
    var canG = player.speed > player.phys.vStall * 1.30;
    var wantG = !!keys.KeyG && demand > 0.55 && canG;

    if (wantG) {
      player.gLoad = M3.smooth(player.gLoad || 1, HIG_MAX, 9, dt);
      player.speed = Math.max(player.phys.vStall * 0.92,
        player.speed - HIG_BLEED * dt);
    } else {
      player.gLoad = M3.smooth(player.gLoad || 1, 1, 6, dt);
    }
    player.hiG = wantG;

    player.throttle = M3.clamp(player.throttle, 0, THR_MAX);
    player.ab = player.throttle > 1.0;
    player.brake = player.throttle < 0.04;

    var wantGun = mouse.left || keys.Space;
    if (wantGun) Ent.fireGun(player, world);
    SFX.gun(wantGun && player.gunAmmo > 0);
  }

  /* ============================================================
     锁定
     ============================================================ */
  function updateLock(dt) {
    var t = player.target;
    if (!t || !t.alive) {
      if (t && !t.alive) player.target = null;
      player.lockProgress = 0;
      return;
    }
    var w = WEAPONS[player.special];
    if (!w || w.kind === 'ecm' || w.kind === 'dew') { player.lockProgress = 1; return; }

    var toT = M3.sub(t.pos, player.pos);
    var dist = M3.len(toT);
    var dir = M3.mul(toT, 1 / Math.max(1, dist));
    var off = M3.angleBetween(player.fwd, dir);

    // 高空导引头视场收窄
    var cone = w.lockCone;
    if (player.pos.y > 18000) cone *= 0.78;
    var lockDist = w.lockDist;
    // 光电 / 红外搜索吊舱提供的锁定距离加成
    if (player.lockRangeK) lockDist *= player.lockRangeK;
    // ECM 吊舱开机时敌方对我的锁定被压缩（这一条作用在我锁别人上时是无效的，
    // 真正的用处见 ai.js 里 AI 锁玩家的判定）
    if (player.spActive > 0) lockDist *= (1 - (w.lockReduce || 0));

    var ok = false;
    if (w.target === 'ground' || w.target === 'ship') {
      ok = dist < lockDist && off < cone;
    } else {
      ok = dist < lockDist && off < cone;
    }

    var rate = 1 / (w.nezer ? 1.5 : (w.seeker === 'ir' ? 0.55 : 1.1));
    if (ok) {
      if (player.lockProgress < 1 && player.lockProgress + rate * dt >= 1) {
        SFX.lock();
        player.audioLocked = true;
      }
      player.lockProgress = Math.min(1, player.lockProgress + rate * dt);
      player.locked = player.lockProgress >= 1;
    } else {
      player.lockProgress = Math.max(0, player.lockProgress - dt * 2.2);
      player.locked = false;
    }
  }

  /* ============================================================
     命中检测
     ============================================================ */
  function resolveBullets(dt) {
    var i, j, b;
    for (i = 0; i < world.bullets.length; i++) {
      b = world.bullets[i];
      if (!b.alive) continue;
      var prev = M3.sub(b.pos, M3.mul(b.vel, dt));
      var dir = M3.norm(b.vel);
      var segLen = M3.len(M3.mul(b.vel, dt));

      // 对飞机
      for (j = 0; j < world.actors.length; j++) {
        var a = world.actors[j];
        if (!a.alive || a.team === b.team) continue;
        var t = M3.raySphere(prev, dir, a.pos, 7.5);
        if (t >= 0 && t <= segLen) {
          b.alive = false;
          if (b.owner && b.owner.isPlayer) world.hitsLanded++;
          Ent.damage(a, b.dmg, world, b.owner);
          Ent.spawnParticle(world.particles, b.pos, M3.V(0, 0, 0), 0.22, 1.4, '#ffdd88', { grow: true });
          SFX.hit();
          break;
        }
      }
      if (!b.alive) continue;

      // 对目标物
      for (j = 0; j < world.targets.length; j++) {
        var tg = world.targets[j];
        if (!tg.alive || tg.team === b.team) continue;
        var r = tg.radius || 8;
        var t2 = M3.raySphere(prev, dir, tg.pos, r);
        if (t2 >= 0 && t2 <= segLen) {
          b.alive = false;
          if (b.owner && b.owner.isPlayer) world.hitsLanded++;
          hitTarget(tg, b.dmg, b.owner);
          SFX.hit();
          break;
        }
      }
      if (b.pos.y <= 0) b.alive = false;
    }
  }

  function hitTarget(tg, dmg, source) {
    tg.hp -= dmg;
    Ent.spawnParticle(world.particles, tg.pos, M3.V(0, 2, 0), 0.3, 2.6, '#ffcc66', { grow: true });
    if (tg.hp <= 0) {
      var penal = tg.friendlyAsset && source && source.isPlayer;
      Ent.killGround(tg, world);
      if (tg.model === 'cell') {
        Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>你打爆了一个调节单元！</b>340 公斤碘化银在那一层高度散开了。', gap: 1.2 });
        if (source && source.isPlayer) world.friendlyLoss = (world.friendlyLoss || 0) + 1;
      } else if (tg.model === 'relay') {
        Radio.raw({ who: CALLSIGN.wing2, cls: 'ally', tx: '中继平台开始漏气 —— 它下沉要四十分钟。', gap: 1.0 });
      } else if (tg.model === 'sam') {
        Radio.raw({ who: CALLSIGN.wing3, cls: 'ally', tx: '阵地没了。', gap: 0.8 });
      }
    }
  }

  /* ============================================================
     地面 / 平台火力
     ============================================================ */
  function updateTargets(dt) {
    for (var i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      if (!t.alive) continue;
      Ent.stepTarget(t, dt);

      if (!t.weapon) continue;
      if (t.fireCd > 0) { t.fireCd -= dt; continue; }
      if (!player.alive) continue;

      var d = M3.dist(t.pos, player.pos);
      var w = WEAPONS[t.weapon];
      // 玩家的被动吊舱会压缩敌方对他的锁定距离
      if (d > w.lockDist * (1 - (player.lockResist || 0))) continue;

      // 低空突防可以躲开对空雷达；但贴得太近仍会被目视发现
      var lowExposed = t.ground && player.pos.y < (world.dangerAltitude || 1500) && d < 5200;
      if (!world.detected && !lowExposed) continue;

      t.fireCd = w.cd + M3.rnd(0, 2);
      var dir = M3.norm(M3.add(M3.sub(player.pos, t.pos), M3.V(0, 260, 0)));
      var m = Ent.makeMissile({
        weapon: t.weapon, team: t.team,
        pos: M3.V(t.pos.x, t.pos.y + 5, t.pos.z),
        fwd: dir, speed: 140,
        target: player, owner: t
      });
      world.missiles.push(m);
      Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>发射！方位 ' + bearing(t.pos, player.pos) + '，距离 ' + (d / 1000).toFixed(1) + ' km。</b>', gap: 0.9 });
      SFX.missileFar();
    }
  }

  /* 相对方位角。

     两个参数都是**位置向量**，不是实体 —— 这里原来是混着写的：
     from 当向量（from.x），to 当实体（to.pos.x）。调用处传的是两个向量，
     于是 to.pos 是 undefined，一旦有防空浮台开火就抛异常。
     那个分支以前没被跑到，加了基地目标之后才暴露出来。 */
  function bearing(from, to) {
    var dx = to.x - from.x, dz = to.z - from.z;
    var deg = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    return ('00' + deg.toFixed(0)).slice(-3);
  }

  /* ============================================================
     定向能自动拦截
     ============================================================ */
  function updateDEW(dt, actor) {
    var w = WEAPONS[actor.special];
    if (!w || w.kind !== 'dew') return;
    if (actor.spCharges <= 0) return;
    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.team === actor.team) continue;
      if (m.target !== actor) continue;
      var d = M3.dist(m.pos, actor.pos);
      if (d > w.interceptRange) continue;
      var toM = M3.norm(M3.sub(m.pos, actor.pos));
      if (M3.angleBetween(actor.fwd, toM) > w.interceptCone) continue;
      // 平流层的风切变会把光斑抹开，拦截概率下降（见 codex t4 铁律二）
      var chance = (actor.pos.y > 18000 && w.highAltChance) ? w.highAltChance : w.interceptChance;
      // 导弹在这段距离内的飞行时间约 1.2 秒，把总概率折算成每帧概率
      if (Math.random() > chance * dt / 1.2) continue;
      // 拦截成功
      actor.spCharges--;
      m.alive = false;
      Ent.spawnParticle(world.particles, m.pos, M3.V(0, 0, 0), 0.4, 3.2, '#7dfaff', { grow: true });
      Ent.explode(world.particles, m.pos, 0.6, 8);
      SFX.laser();
      Radio.raw({ who: CALLSIGN.wing2, cls: 'ally', tx: 'GUS-2 烧掉了它。', gap: 0.6 });
      return;
    }
  }

  /* ============================================================
     相机
     ============================================================ */
  function updateCamera(dt) {
    var p = player;
    if (!p) return;

    // 方向键：自由视角，松开后缓慢回中
    if (keys.ArrowLeft) camYaw -= dt * 1.3;
    if (keys.ArrowRight) camYaw += dt * 1.3;
    if (keys.ArrowUp) camPitch = Math.min(1.5, camPitch + dt * 0.9);
    if (keys.ArrowDown) camPitch = Math.max(-1.5, camPitch - dt * 0.9);
    if (!keys.ArrowLeft && !keys.ArrowRight) camYaw = M3.smooth(camYaw, 0, 2.2, dt);
    if (!keys.ArrowUp && !keys.ArrowDown) camPitch = M3.smooth(camPitch, 0, 2.2, dt);

    if (S.camMode === 0) {
      /* 追尾：不跟随滚转，地平线永远水平。

         **镜头俯仰限制在 ±78°，飞机可以翻过去，镜头不跟。**
         空翻照样能做 —— 只是到了限位之后镜头停住，
         玩家会看到机身从视野上方（或下方）翻出去。

         为什么必须限：镜头的"上"参考只有在它与视线不共线时才有定义。
         机头压到正上/正下时视线本身是垂直的，世界 up 与它共线，
         正交基退化，退化保护只能临时换一根参考轴 —— 而 |f.y| 在
         极点附近逐帧抖动，参考轴就跟着反复横跳，画面来回侧翻。
         之前那套"混合参考"只能把跳变抹成旋转，抹不掉极点本身；
         把俯仰限住，镜头就永远不会到达那个位置。 */
      /* ---------- 追尾镜头：稳定的水平镜头 + 俯仰限位 ----------

         相机 up 恒为世界 up，所以地平线永远水平、画面不会跟着滚转乱转。
         俯仰限制在 ±78°：飞机可以翻过正上方/正下方，镜头不跟，
         到限位就停住。视线因此永远不会与世界 up 共线，正交基不会退化 ——
         这也正是"极点卡动"那个老问题的根治办法。

         限位附近最容易出的毛病是**来回抽动**。三件事必须一起做才能压住：

         ① 偏航按最短角差平滑
            翻越顶点时水平投影会瞬间反向 180°，直接跟就是瞬移。
         ② 俯仰也要平滑
            相机 up 是世界 up，而正交化之后 up 的长度是 cos(pitch)：
            俯仰越接近限位这个长度越小，同样的视线变化引起的 up 变化越大。
            所以俯仰直接阶跃时地平线会明显发抖。
         ③ 视线最后再钳一次
            camPos 是插值量、天生滞后，若用滞后的位置反推方向，
            视线会比基准朝向更陡，把限位绕过去。

         时间常数的取舍：偏航 1.2（约一秒转完 180°，够快也不甩），
         俯仰 9（俯仰是玩家直接控制的，太慢会显得操纵迟滞）。 */
      var CAM_PITCH_LIM = 78 * Math.PI / 180;
      var SIN_LIM = Math.sin(CAM_PITCH_LIM);

      var hx = p.fwd.x, hz = p.fwd.z;
      var hlen = Math.sqrt(hx * hx + hz * hz);

      // ① 偏航：最短角差平滑。接近垂直时水平投影塌缩，此时沿用上一帧。
      if (hlen > 0.12) {
        var tYaw = Math.atan2(hx, hz);
        var dYaw = tYaw - camYawBase;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        camYawBase += dYaw * (1 - Math.exp(-1.2 * dt));
        if (camYawBase > Math.PI) camYawBase -= Math.PI * 2;
        if (camYawBase < -Math.PI) camYawBase += Math.PI * 2;
      }

      // ② 俯仰：先钳位，再平滑
      var camPitchAng = Math.atan2(p.fwd.y, Math.max(hlen, 1e-4));
      camPitchAng = M3.clamp(camPitchAng, -CAM_PITCH_LIM, CAM_PITCH_LIM);
      if (camPitchSmooth === null) camPitchSmooth = camPitchAng;
      camPitchSmooth += (camPitchAng - camPitchSmooth) * (1 - Math.exp(-9 * dt));

      var cpc = Math.cos(camPitchSmooth), cps = Math.sin(camPitchSmooth);
      var camDir = M3.V(Math.sin(camYawBase) * cpc, cps, Math.cos(camYawBase) * cpc);

      // ③ 视线钳位，保证 |y| 不超过限位
      var fy2 = M3.clamp(camDir.y, -SIN_LIM, SIN_LIM);
      var fh2 = camDir.x * camDir.x + camDir.z * camDir.z;
      if (fh2 > 1e-8) {
        var fhz = Math.sqrt(fh2);
        var fsc = Math.sqrt(Math.max(0, 1 - fy2 * fy2)) / fhz;
        camDir = M3.V(camDir.x * fsc, fy2, camDir.z * fsc);
      }

      /* 位置在**世界坐标**的后方（不是机体坐标系）——
         这样滚转时镜头不会绕着飞机转圈，是"稳定"的另一半。 */
      var off0 = M3.rotAxis(M3.mul(camDir, -S.camDist), M3.V(0, 1, 0), camYaw);
      var want = M3.add(p.pos, M3.add(off0, M3.V(0, S.camHeight + camPitch * 70, 0)));
      camPos = M3.lerpV(camPos, want, 1 - Math.exp(-7.5 * dt));

      camFwd = camDir;
      camUp = M3.V(0, 1, 0);
      Renderer.setCamera(camPos, camFwd, camUp, S.fov);
    }

    /* 注意这里是 **else if**，必须挂在上面 camMode===0 的 else 链上。

       曾经被误改成独立的 if，后果是 camMode===0 时既不满足 camMode===1，
       就掉进了下面的 else（目标视角）—— 追尾镜头算出来的结果当场被覆盖，
       而且目标视角写死世界 up，于是画面看起来完全退回"地平线永远水平"。
       这个 bug 骗过了所有相机测试，因为那些测试只复现 camMode===0 的计算，
       不经过这里的分支。 */
    else if (S.camMode === 1) {
      // 座舱：跟随滚转
      var cp = M3.add(p.pos, M3.add(M3.mul(p.fwd, 3.4), M3.mul(p.up, 1.1)));
      Renderer.setCamera(cp, p.fwd, p.up, S.fov + 6);
    } else {
      /* 目标视角：从**侧上方**看玩家与目标。

         原来是正上方 90 米、垂直往下看 —— 视线与 up 完全共线，
         正交基退化，画面随机翻滚，玩家会"找不到自己的飞机"。
         侧向偏出去一点就永远不会共线。

         没有目标时同理：只往机身后上方放，一旦飞机本身垂直，
         p.pos − want2 也会变成垂直方向。所以也要带侧向分量。 */
      var t = p.target;
      if (t && t.alive) {
        var mid = M3.mul(M3.add(p.pos, t.pos), 0.5);
        var span = Math.max(140, M3.dist(p.pos, t.pos));
        // 玩家→目标的水平垂线方向
        var along = M3.sub(t.pos, p.pos);
        along.y = 0;
        var al = Math.sqrt(along.x * along.x + along.z * along.z);
        var side = al > 1e-4
          ? M3.V(-along.z / al, 0, along.x / al)
          : M3.V(1, 0, 0);
        var cp2 = M3.add(mid, M3.add(
          M3.mul(side, span * 0.40 + 40),
          M3.V(0, Math.max(60, span * 0.26), 0)
        ));
        Renderer.setCamera(cp2, M3.norm(M3.sub(mid, cp2)), M3.V(0, 1, 0), 55);
      } else {
        // 侧后上方 —— 侧向分量保证视线不会与 up 共线
        var want2 = M3.add(p.pos, M3.add(
          M3.mul(p.fwd, -120),
          M3.add(M3.mul(p.right, 55), M3.V(0, 50, 0))
        ));
        Renderer.setCamera(want2, M3.norm(M3.sub(p.pos, want2)), M3.V(0, 1, 0), S.fov);
      }
    }
  }

  /* ============================================================
     更新
     ============================================================ */
  /* ============================================================
     看门狗

     有飞机在空中"钉住"过 —— 位置完全不动，但速度读数还是正常的。
     根因没定位到，所以这里先放一道兜底：任何一架飞机静止超过
     1.5 秒，就把它的姿态与速度重置回可飞状态，并在控制台留记录。

     为什么值得兜底：玩家没法分辨"这架飞机卡住了"和"我打不着它"，
     一架悬在空中的敌机会让整场战斗都显得坏了。
     为什么留 console：万一真被触发，那条记录（含当时的速度、
     姿态、操控输入）就是下次定位根因的起点。

     注意任务结束后 update() 不再运行，所以不会把"结算时的静止"
     误判成卡死。
     ============================================================ */
  var WD_LIMIT = 1.5;

  function watchdog(dt) {
    if (!world) return;
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive) { a.wdStill = 0; continue; }

      var moved = a.wdPrev
        ? Math.abs(a.pos.x - a.wdPrev.x) + Math.abs(a.pos.y - a.wdPrev.y) +
          Math.abs(a.pos.z - a.wdPrev.z)
        : 1e9;
      if (!a.wdPrev) a.wdPrev = { x: 0, y: 0, z: 0 };
      a.wdPrev.x = a.pos.x; a.wdPrev.y = a.pos.y; a.wdPrev.z = a.pos.z;

      if (moved < 0.02) a.wdStill = (a.wdStill || 0) + dt;
      else a.wdStill = 0;

      if (a.wdStill > WD_LIMIT) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[季风线] 看门狗触发：' + (a.name || a.id) +
            ' 静止 ' + a.wdStill.toFixed(1) + 's' +
            ' | speed=' + a.speed +
            ' | fwd=' + JSON.stringify(a.fwd) +
            ' | ctrl=' + JSON.stringify(a.ctrl) +
            ' | pos=' + JSON.stringify(a.pos) +
            ' | hp=' + a.hp + '/' + a.maxHp);
        }
        a.fwd = M3.V(0, 0, 1);
        a.up = M3.V(0, 1, 0);
        a.right = M3.V(1, 0, 0);
        a.speed = Math.max(a.phys.vStall * 1.4, 180);
        a.vel = M3.mul(a.fwd, a.speed);
        a.stall = false;
        a.wdStill = 0;
      }
    }
  }

  function update(dt) {
    world.time += dt;
    Radio.update(dt);

    if (player.alive) controlPlayer(dt);
    else SFX.gun(false);

    // 玩家
    Ent.stepAircraft(player, dt, world);
    updateLock(dt);
    updateDEW(dt, player);

    // AI
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive) continue;
      if (!a.isPlayer && a.ai) AI.update(a, dt, world);
      Ent.stepAircraft(a, dt, world);
      if (!a.isPlayer) updateDEW(dt, a);
    }

    watchdog(dt);

    // 导弹
    for (i = 0; i < world.missiles.length; i++) Ent.stepMissile(world.missiles[i], dt, world);
    // 子弹
    for (i = 0; i < world.bullets.length; i++) Ent.stepBullet(world.bullets[i], dt);

    resolveBullets(dt);
    updateTargets(dt);
    Ent.stepParticles(world.particles, dt);

    /* 附近飞机的引擎声：取**最近的一架**驱动那条共享音链。

       不可能每架 NPC 各建一条（11 架 × 4 个振荡器 = 44 个节点），
       而绝大多数时候它们根本听不见。战场环境里最该被听见的，
       恰好就是最近的那一架 —— 无论敌机咬尾还是僚机归队，
       都是这个音最先起变化。 */
    var nBest = null, nBd = 1e9;
    for (i = 0; i < world.actors.length; i++) {
      var na = world.actors[i];
      if (!na.alive || na === player) continue;
      var nd = M3.dist(na.pos, player.pos);
      if (nd < nBd) { nBd = nd; nBest = na; }
    }
    if (nBest && nBd < 1500) SFX.nearby(nBd, nBest.throttle || 0.8, !!nBest.ab);
    else SFX.nearby(99999, 0, false);

    // 导弹告警
    var warn = false;
    for (i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (m.alive && m.team !== player.team && m.target === player &&
        M3.dist(m.pos, player.pos) < 3600) warn = true;
    }
    SFX.warning(warn);

    // 引擎音
    if (player.alive) SFX.engine(player.throttle, player.ab, true);
    else SFX.engine(0, false, false);

    // 撞击告警
    if (player.alive && player.pos.y < 260 && player.fwd.y < -0.1) SFX.terrain();
    if (player.stall) SFX.stall();

    // 任务逻辑
    mission.tick(world, dt);

    // 清理
    compact();

    // 统计
    var k = 0;
    for (i = 0; i < world.actors.length; i++) {
      if (world.actors[i].team === 1 && !world.actors[i].alive) k++;
    }
    if (k > world.killed) {
      hits.push({ txt: 'KILL  ' + k, t: 1.1, col: HUD.AMBER });
      SFX.confirm();
    }
    world.killed = k;

    // 胜负
    if (mission.lose(world)) { finish(false); return; }
    if (mission.win(world)) { finish(true); return; }

    // 僚机损失台词
    if (!world.flags.allyDown && world.wings[3] && !world.wings[3].alive) {
      world.flags.allyDown = true;
      Radio.play(mission.id, 'allyDown');
    }

    updateCamera(dt);

    for (i = 0; i < hits.length; i++) hits[i].t -= dt;
    hits = hits.filter(function (h) { return h.t > 0; });
    if (banner.t > 0) banner.t -= dt;
  }

  function compact() {
    var i;
    var arr = world.missiles, out = [];
    for (i = 0; i < arr.length; i++) if (arr[i].alive) out.push(arr[i]);
    world.missiles = out;

    arr = world.bullets; out = [];
    for (i = 0; i < arr.length; i++) if (arr[i].alive) out.push(arr[i]);
    world.bullets = out;

    arr = world.particles; out = [];
    for (i = 0; i < arr.length; i++) if (arr[i].alive) out.push(arr[i]);
    if (out.length > 900) out.splice(0, out.length - 900);
    world.particles = out;
  }

  /* ============================================================
     挂架上的实物

     以前挂载只存在于 HUD 的俯视缩略图里，飞机模型永远是"干净"的 ——
     打出去多少弹，机身外观一点变化都没有。现在按挂点逐个渲染：
     **槽就绪时挂着弹，冷却中就是空的**。

     这样"还剩几发"不用盯 HUD 也知道，而且打完最后一发的瞬间
     整片机翼会明显变干净 —— 比数字更直观。

     高度数据：hardpointGroups 的 pts 只有 (x, y)，
     对应机体的(横向, 前后)，没有高度。所以按挂点类型补一个默认值，
     翼下吊挂比翼尖低、机腹最低。
     ============================================================ */
  var STORE_HY = { tip: -0.35, heavy: -1.35, light: -1.15, belly: -1.95 };

  function pushOneStore(a, pt, gkind, w) {
    var hy = STORE_HY[gkind];
    if (hy === undefined) hy = -1.2;
    // 机体坐标 → 世界：x 取右、y 取上、z 取机头方向
    var local = M3.V(pt.x, hy, pt.y);
    var wp = M3.add(a.pos, M3.add(M3.mul(a.right, local.x),
      M3.add(M3.mul(a.up, local.y), M3.mul(a.fwd, local.z))));
    var mdl = MODELS[w.model] || MODELS.missile;
    Renderer.pushModel(mdl, wp, a.fwd, a.up, { scale: 0.85 });
  }

  function pushStores(a) {
    if (!a.ac || !a.ac.hardpointGroups) return;
    if (a === player && !a.loadout) return;

    var lo = a.loadout || {};
    var slots = a.slotCd || {};
    var gi, pi;

    /* 槽数组是**按武器**建的，长度 = 这种武器占用的挂点总数；
       而下面是**按组**遍历的。所以必须自己维护每组在数组里的起始下标 ——

       否则两组挂同一种弹时会都从 arr[0] 开始读，变成"四个挂架共用
       前两个槽"：打掉一个，两个组的同一位置同时消失，而后两个挂架
       永远不会消失。发射那边是对的（launch 遍历整个 slotCd[wid]），
       只有这里的实体渲染会错位。 */
    var used = {};

    for (gi = 0; gi < a.ac.hardpointGroups.length; gi++) {
      var g = a.ac.hardpointGroups[gi];
      var wid = lo[g.id];
      // NPC 没有 loadout，退到它的制式弹种
      if (!wid && a.special) wid = a.special;
      if (!wid) continue;

      var base = used[wid] || 0;
      used[wid] = base + g.pts.length;      // 下一组从这里接着排

      var w = WEAPONS[wid];
      if (!w || w.kind === 'gun') continue;
      /* 这种弹能不能挂在这种挂点上。

         玩家那边由选装界面保证，NPC 是代码直接指定弹种的，得自己查 ——
         否则一枚只能进弹舱的巡航弹会被画到翼尖上去。 */
      if (w.fits && w.fits.indexOf(g.kind) < 0) continue;

      // 已经打光：冷却早已归零，但挂架上不该再有任何东西
      var pool = a.ammoPool ? a.ammoPool[wid] : undefined;
      if (pool !== undefined && pool <= 0) continue;

      if (w.kind === 'ecm' && w.passive) {
        // 被动吊舱没有冷却，装上就一直在
        for (pi = 0; pi < g.pts.length; pi++) pushOneStore(a, g.pts[pi], g.kind, w);
        continue;
      }

      var arr = slots[wid] || [];
      for (pi = 0; pi < g.pts.length; pi++) {
        // 这个发射槽还在装填 → 挂架空着
        if ((arr[base + pi] || 0) > 0) continue;
        pushOneStore(a, g.pts[pi], g.kind, w);
      }
    }
  }

  /* ============================================================
     渲染
     ============================================================ */
  function render() {
    if (state !== 'playing' || !world || !player) {
      // 菜单背景：慢速空镜头
      Renderer.begin();
      Renderer.end();
      return;
    }
    Renderer.begin();

    var i;
    // 目标物
    for (i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      if (!t.alive) continue;
      var mdl = MODELS[t.model];
      if (!mdl) continue;
      Renderer.pushModel(mdl, t.pos, t.fwd, t.up, {});
    }
    // 飞机
    for (i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive) continue;
      var m2 = MODELS[a.model];
      if (!m2) continue;
      // sweep 只对带 morph 数据的模型（DB-11 的可变后掠翼）有意义
      Renderer.pushModel(m2, a.pos, a.fwd, a.up, { sweep: a.sweep || 0 });
      pushStores(a);
    }
    // 导弹
    for (i = 0; i < world.missiles.length; i++) {
      var ms = world.missiles[i];
      if (!ms.alive) continue;
      var mm = MODELS[ms.model] || MODELS.missile;
      Renderer.pushModel(mm, ms.pos, ms.fwd, ms.up, {});
    }
    Renderer.flush();

    // 曳光弹画在模型之上并用加色混合 —— 弹道本来就该是亮线，
    // 被机翼挡掉反而看不清楚
    drawTracers();

    Renderer.drawParticles(world.particles);
    Renderer.end();

    // HUD
    HUD.draw(world, player, 0, S);

    // 横幅与提示
    var ctx = Renderer.ctx;
    if (banner.t > 0) {
      var al = banner.t > 3.0 ? (3.4 - banner.t) / 0.4 : Math.min(1, banner.t / 1.0);
      HUD.banner(ctx, Renderer.W, Renderer.H, banner.title, banner.sub, al, banner.col);
    }
    for (i = 0; i < hits.length; i++) {
      HUD.hitMark(ctx, Renderer.W, Renderer.H, hits[i].txt, hits[i].t / 1.1, hits[i].col);
    }
    if (world.roeBlocked && player.alive) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(255,176,58,0.9)';
      ctx.font = 'bold 12px Consolas,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('交战规则生效 —— 重武器锁定', Renderer.W / 2, Renderer.H - 108);
      ctx.restore();
    }
    if (world.detected && player.alive) {
      var bl = Math.sin(performance.now() * 0.01) > 0;
      if (bl) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,77,77,0.9)';
        ctx.font = 'bold 12px Consolas,monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▲ 被对空雷达截获', Renderer.W / 2, 78);
        ctx.restore();
      }
    }

    // ---- 鼠标引导的瞄准环 ----
    if (aimMode && player.alive && S.camMode !== 2) {
      var ax = M3.clamp(mouse.x, 14, Renderer.W - 14);
      var ay = M3.clamp(mouse.y, 14, Renderer.H - 14);
      var qk = M3.clamp(player.q / 22, 0, 1);
      var acol = player.q < 12 ? 'rgba(255,77,77,0.95)'
        : (player.q < 20 ? 'rgba(255,176,58,0.95)' : 'rgba(79,224,138,0.95)');

      ctx.save();
      // 动压越低，飞控越"软" —— 用开口大小表示权限
      var gap = 4 + (1 - qk) * 9;
      var rad = 15 + (1 - qk) * 5;
      ctx.strokeStyle = acol;
      ctx.lineWidth = 1.6;
      for (var oct = 0; oct < 4; oct++) {
        var a0 = oct * Math.PI / 2 + gap / rad;
        var a1 = (oct + 1) * Math.PI / 2 - gap / rad;
        ctx.beginPath();
        ctx.arc(ax, ay, rad, a0, a1);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(ax, ay, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = acol;
      ctx.fill();
      ctx.font = 'bold 10px Consolas,monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = acol;
      ctx.fillText('CMD', ax, ay + rad + 13);
      ctx.restore();
    }
  }

  /* ============================================================
     曳光弹
     子弹本身是真实弹体（有位置和速度），但之前完全没有渲染，
     所以开火除了声音之外看不到任何东西。这里按上一帧到当前帧的
     线段画成曳光，并用加色混合让它发光。
     ============================================================ */
  function drawTracers() {
    if (!world || !world.bullets.length) return;
    var cam = Renderer.getCam();
    if (!cam) return;

    var ctx = Renderer.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';          // 圆头会把相邻弹丸的线"焊"在一起

    for (var i = 0; i < world.bullets.length; i++) {
      var b = world.bullets[i];
      if (!b.alive) continue;

      var head = M3.project(cam, b.pos);
      if (!head) continue;

      /* 曳光长度**按距离自适应**，让屏幕上的角长度保持恒定。

         原来固定 13 米（也与"上一帧位置"解耦，避免高射速下弹丸首尾
         相接连成一根面条）。近处刚好，但到 1500 米外投影只有 0.5° ——
         看起来就是一颗缓慢移动的小点，玩家会以为"弹速很慢"。
         实际上 30mm 的炮口初速是 1020 m/s，一点都不慢。

         尾迹取 dist × 0.045，对应屏幕上约 2.6° 的角长度，
         从 300 米到 2000 米都一样显眼。上限 90 米防止近处拉成面条。 */
      var dirv = M3.norm(b.vel);
      var bDist = M3.dist(b.pos, cam.pos);
      var trailLen = Math.min(90, Math.max(13, bDist * 0.045));
      var tail = M3.project(cam, M3.sub(b.pos, M3.mul(dirv, trailLen)));
      if (!tail) tail = head;

      var mine = player && b.team === player.team;

      // 远弹略粗，抵消透视缩细
      var wMul = 1 + Math.min(1, bDist / 1600) * 0.8;
      ctx.strokeStyle = mine ? 'rgba(255,228,150,0.92)' : 'rgba(255,148,88,0.85)';
      ctx.lineWidth = (mine ? 1.35 : 1.15) * wMul;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();

      ctx.fillStyle = mine ? 'rgba(255,250,215,1)' : 'rgba(255,196,150,1)';
      ctx.beginPath();
      ctx.arc(head.x, head.y, (mine ? 1.25 : 1.0) * wMul, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /* ============================================================
     结算
     ============================================================ */
  function finish(win) {
    if (win) cleared[missionIdx] = true;
    SFX.silence();
    state = 'debrief';
    SFX[win ? 'fanfare' : 'fail']();

    var acc = world.shotsFired > 0 ? world.hitsLanded / world.shotsFired : 0;
    var hull = player.alive ? player.hp / player.maxHp : 0;
    var penalty = (world.friendlyLoss || 0);
    var score = world.killed * 1000 + Math.round(acc * 3000) + Math.round(hull * 2000)
      + (win ? 4000 : 0) - penalty * 2500;

    var rank = 'D';
    if (!win) rank = 'F';
    else if (score >= 16000 && penalty === 0) rank = 'S';
    else if (score >= 11000) rank = 'A';
    else if (score >= 7000) rank = 'B';
    else rank = 'C';

    var rk = document.getElementById('dRank');
    rk.textContent = rank;
    rk.className = 'rank' + (rank === 'S' ? ' s' : (rank === 'A' ? ' a' : (rank === 'F' ? ' f' : '')));

    document.getElementById('dTitle').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    document.getElementById('dSub').textContent = mission.no + '  ' + mission.name + '  //  ' + mission.en;
    document.getElementById('dCallsign').textContent = CALLSIGN.player;

    var rows = [
      ['击落目标', world.killed],
      ['发射 / 命中', world.shotsFired + ' / ' + world.hitsLanded],
      ['命中率', (acc * 100).toFixed(0) + '%'],
      ['机体完整度', player.alive ? (hull * 100).toFixed(0) + '%' : '—'],
      ['调节单元损失', penalty],
      ['作战时间', fmtTime(world.time)],
      ['综合评定', score]
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<tr' + (rows[i][0] === '综合评定' ? ' class="hi"' : '') +
        '><td>' + rows[i][0] + '</td><td>' + rows[i][1] + '</td></tr>';
    }
    document.getElementById('dTable').innerHTML = html;

    var quotes = {
      m1: '「他们测绘的不是地形。是调节单元什么时候会漂到哪。」',
      m2: '「把山放在你和它之间。这句战术建议，一百年没过时。」',
      m3: '「干井。那是我祖母的村子。一九六九年，它连着十九个月没下雨。」'
    };
    document.getElementById('dQuote').textContent = win ? quotes[mission.id] || '' :
      '任务失败。下游的空情图仍然完整，第 7 号控制平台仍在他们的签名下运行。';

    var nb = document.getElementById('btnNext');
    nb.disabled = !win || missionIdx >= MISSIONS.length - 1;
    nb.textContent = missionIdx >= MISSIONS.length - 1 ? '已是最后任务' : '下一任务 >';

    show('debrief');
    SFX.warning(false);
    SFX.gun(false);
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return ('0' + m).slice(-2) + ':' + ('0' + ss).slice(-2);
  }

  /* ============================================================
     主循环
     ============================================================ */
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = (ts - last) / 1000;
    last = ts;
    if (!isFinite(dt) || dt <= 0) dt = 0.016;
    if (dt > 0.05) dt = 0.05;

    if (state === 'playing') {
      if (!paused) {
        update(dt);
        render();
      } else {
        render();
      }
    } else {
      if (player && world) render();
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
      'CALLSIGN', 'SFX', 'Renderer', 'Ent', 'AI', 'HUD', 'MISSIONS', 'Radio'];
    for (i = 0; i < core.length; i++) {
      if (typeof window[core[i]] === 'undefined') problems.push('核心模块 ' + core[i] + ' 未加载');
    }
    if (problems.length) { report(problems); return problems; }

    for (i = 0; i < AIRCRAFT.length; i++) {
      var ac = AIRCRAFT[i];
      if (!MODELS[ac.model]) problems.push('机型 ' + ac.id + ' 引用了不存在的模型 "' + ac.model + '"');
      if (!WEAPONS[ac.gun]) problems.push('机型 ' + ac.id + ' 引用了不存在的机炮 "' + ac.gun + '"');
      // 挂载点组：组内每个点都要有坐标，且能被某种武器适配
      var grps = ac.hardpointGroups || [];
      if (!grps.length) problems.push('机型 ' + ac.id + ' 没有定义挂载点组');
      for (j = 0; j < grps.length; j++) {
        var gg = grps[j];
        if (!gg.pts || gg.pts.length < 2) {
          problems.push('机型 ' + ac.id + ' 的挂载点组 ' + gg.id + ' 不是成对的');
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
          problems.push('机型 ' + ac.id + ' 的挂载点组 ' + gg.id +
            ' 在当前能力下没有任何武器挂得上');
        }
      }
      // 默认配置里引用的武器必须真的能挂到那一组
      for (var dk in (ac.defaultLoadout || {})) {
        var dw = ac.defaultLoadout[dk];
        if (!dw) continue;
        var dg = null;
        for (j = 0; j < grps.length; j++) if (grps[j].id === dk) dg = grps[j];
        if (!dg) { problems.push('机型 ' + ac.id + ' 的默认配置引用了不存在的组 ' + dk); continue; }
        if (!WEAPONS[dw]) { problems.push('机型 ' + ac.id + ' 的默认配置引用了不存在的武器 ' + dw); continue; }
        if (!WEAPONS[dw].fits || WEAPONS[dw].fits.indexOf(dg.kind) < 0) {
          problems.push('机型 ' + ac.id + ' 的默认配置把 ' + WEAPONS[dw].name +
            ' 挂到了挂不下的 ' + dg.label);
        }
        if (!canCarry(ac, WEAPONS[dw])) {
          problems.push('机型 ' + ac.id + ' 的默认配置带了 ' + WEAPONS[dw].name +
            '，但它缺少对应的机体能力（需要 ' + WEAPONS[dw].needs.join(' / ') + '）');
        }
      }
      if (!ac.phys || !ac.phys.vMax) problems.push('机型 ' + ac.id + ' 缺少飞行性能参数');
      // 敌方制式机不进机库，也就用不到俯视识别图
      if (!ac.npcOnly && !PLANFORM.planes[ac.model]) {
        problems.push('机型 ' + ac.id + ' 缺少俯视识别图数据');
      }
    }

    var needModels = ['c11', 'c14', 's6', 'm27', 'ucav', 'sower', 'relay', 'cell',
      'sam', 'radar', 'depot', 'cmdpost', 'station', 'missile', 'bomb'];
    for (i = 0; i < needModels.length; i++) {
      if (!MODELS[needModels[i]]) problems.push('缺少模型 ' + needModels[i]);
    }

    var needWeapons = ['k3', 'k7', 'v11', 'v9', 'v17', 'v22', 'v25', 'v30',
      'e4', 'l2', 'dl4', 'dl6', 'dl9'];
    for (i = 0; i < needWeapons.length; i++) {
      if (!WEAPONS[needWeapons[i]]) problems.push('缺少武器 ' + needWeapons[i]);
    }

    for (i = 0; i < MISSIONS.length; i++) {
      var m = MISSIONS[i];
      if (typeof m.spawn !== 'function') problems.push('任务 ' + m.id + ' 缺少 spawn()');
      if (typeof m.tick !== 'function') problems.push('任务 ' + m.id + ' 缺少 tick()');
      if (typeof m.win !== 'function' || typeof m.lose !== 'function') {
        problems.push('任务 ' + m.id + ' 缺少胜负条件');
      }
      if (!VOICES[m.id]) problems.push('任务 ' + m.id + ' 缺少无线电台词表');
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
    var html = '<b>开机自检发现 ' + problems.length + ' 个问题（请把这一段发给开发者）：</b><br>';
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

     内容来自 js/version.js —— 那个文件由 tools/stamp-version.js
     从 git 记录生成，每次提交前重新生成一遍。

     为什么需要它：浏览器缓存、GitHub Pages 的重建延迟、推送失败，
     这三件事从画面上完全看不出来。而时间戳变了就说明新 commit
     确实上线了。

     文件不在时（比如开发中直接开 index.html、或者忘了跑生成脚本）
     静默降级，不影响游戏本身。
     ============================================================ */
  function stampVersion() {
    var el = document.getElementById('verStamp');
    if (!el) return;
    if (typeof BUILD_STAMP === 'undefined' || !BUILD_STAMP.time) {
      el.innerHTML = 'BUILD <i>开发版</i>';
      return;
    }
    el.innerHTML = 'BUILD <b>' + BUILD_STAMP.time + '</b>' +
      '<br><i>' + BUILD_STAMP.hash + '　' + BUILD_STAMP.subject + '</i>';
  }

  function init() {
    preflight();
    stampVersion();

    // 设置必须在任何渲染/音频之前载入
    S = loadSettings();
    applyAudioSettings();

    cv = document.getElementById('cv');
    Renderer.init(cv);
    bindInput();

    // 导航按钮。注意这里不再用兜底 else ——
    // 早先的写法会让任何一个拼错的 data-go 值都悄悄跳回标题页，
    // 出问题时完全看不出是哪里错了。
    var btns = document.querySelectorAll('[data-go]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        SFX.unlock(); SFX.click();
        var go = this.getAttribute('data-go');
        if (go === 'hangar') { buildHangar(); show('hangar'); }
        else if (go === 'brief') { buildBrief(); show('brief'); }
        else if (go === 'codex') { buildCodex(); show('codex'); }
        else if (go === 'settings') { buildSettingsInto(document.getElementById('setWrap')); show('settings'); }
        else if (go === 'help') { buildHelpPage(); show('help'); }
        else if (go === 'title') { show('title'); }
      });
    }

    // 暂停菜单的三个页签
    var ptabs = document.querySelectorAll('[data-ptab]');
    for (var p = 0; p < ptabs.length; p++) {
      ptabs[p].addEventListener('click', function () {
        switchPauseTab(this.getAttribute('data-ptab'));
        SFX.click();
      });
    }

    document.getElementById('btnLaunch').onclick = function () {
      SFX.unlock(); SFX.confirm(); startMission(missionIdx);
    };
    document.getElementById('btnNext').onclick = function () {
      SFX.unlock(); SFX.click();
      missionIdx = Math.min(MISSIONS.length - 1, missionIdx + 1);
      buildBrief(); show('brief');
    };
    document.getElementById('btnRetry').onclick = function () {
      SFX.unlock(); SFX.click(); startMission(missionIdx);
    };
    document.getElementById('setClose').onclick = function () { SFX.click(); show('title'); };
    document.getElementById('setReset').onclick = function () { SFX.click(); resetSettings(); };
    document.getElementById('pauseSetReset').onclick = function () { SFX.click(); resetSettings(); };
    document.getElementById('btnResume').onclick = function () { togglePause(); };
    document.getElementById('btnAbort').onclick = function () {
      SFX.click();
      paused = false;
      document.getElementById('pause').classList.remove('on');
      SFX.silence(); SFX.warning(false); SFX.gun(false);
      player = null; world = null;
      show('brief');
      buildBrief();
    };

    // 任意点击解锁音频
    document.addEventListener('mousedown', function () { SFX.unlock(); }, { once: false });

    // 默认特殊武器
    getLoadout(AIRCRAFT[selectedAC]);

    // 鼠标瞄准：初始把瞄准点放在屏幕中心
    mouse.x = window.innerWidth / 2;
    mouse.y = window.innerHeight / 2;
    cv.style.cursor = aimMode ? 'none' : 'default';

    show('title');
    requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });
  }

  return {
    init: init,
    startMission: startMission,
    // 调试/测试接口：把内部状态露出来，tools/smoke.js 靠它做断言
    __player: function () { return player; },
    __world: function () { return world; }
  };
})();

window.addEventListener('load', function () { Game.init(); });
