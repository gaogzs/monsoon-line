
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
  /* 当前所处的战役（CAMPAIGNS 的下标）。它**不复制索引体系**：
     missionIdx 仍然是 MISSIONS 的全局下标，startMission(idx) 的语义不变。
     activeCampaign 只决定两件事 —— 简报页的关卡选择器列出哪几关、
     各处的"返回"回到哪一层。 */
  var activeCampaign = 0;

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

  /* 高 G 机动：转向率放大倍率。
     速度代价不再单独扣 —— stepAircraft 的转弯掉速按实际角速度算，
     高 G 放大了角速度，掉速自然约是普通拉杆的两倍。以前这里另扣
     82 m/s²，和物理掉速叠在一起，三秒就能把 G-6 拉到失速以下。 */
  var HIG_MAX = 1.90;
  var camFwd = M3.V(0, 0, 1), camUp = M3.V(0, 1, 0), camPos = M3.V(0, 0, 0);
  var camYaw = 0, camPitch = 0;
  /* 追尾镜头的基准朝向。它不直接等于机头方向 —— 见 updateCamera 里的说明：
     俯仰被限制在 ±89°，而且偏航要按最短角差平滑，否则翻过顶点时会瞬移。 */

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

    /* 资料库的详情页有一个常驻的 requestAnimationFrame 在转模型，
       离开这一屏必须停掉 —— 否则它在后台一直烧 CPU（而且画在
       一个已经隐藏的 canvas 上）。 */
    if (id !== 'codex' && typeof UnitView !== 'undefined') UnitView.stop();

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
    ['N', 'EMCON-Δ 电磁静默 —— 雷达关机、数据链断开、干扰机停辐射'],
    ['G', '高 G 机动 —— 大幅转向时按住，拉出额外过载，代价是掉速'],
    ['H', '暂停（暂停后可实时调整设置）']
  ];

  var TIPS = [
    '发射包线：锁定框淡橙 = 射程外，橙色 = 射程内，<b>红色 = NEZ 不可逃逸区</b>，此时发射敌机极难摆脱。',
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
    /* 没有机炮的机型（预警机、重型轰炸机）不画这一行 ——
       `gun` 会是 undefined，直接读 gun.name 会抛异常。 */
    if (gun) {
      sum += '<div class="ld-row"><span class="n">' + gun.name + '</span>' +
        '<span class="a">×' + gun.ammo + '</span><span class="s">机炮</span></div>';
    }
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
      /* 一个挂点 = 一个发射槽，槽数就是挂点数。

         "三联装"（w.salvo = 3）的含义是**按一下打出三枚**，不是
         "一个挂点占三个冷却槽"。后者会让槽数和挂点数脱钩，
         右下角的俯视缩略图、武器纵列表的圆点指示、3D 挂载的下标
         都得改成"一点多槽"；而按一下出三枚共用一槽，架构完全不用动。
         实际发射见 launch()。 */
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
   * 把机库的"挂载点分组 + 配置"翻译成被动吊舱列表，交给
   * `Ent.passiveEffects()` 汇总。
   *
   * 真正的实现在 entities.js —— 因为**敌机也要用同一套**：
   * 任务脚本给 NPC 挂吊舱（`spawnEnemy` 的 `o.pods`）时，
   * 不能再写第二份汇总逻辑，否则迟早出现两边不一致。
   */
  function passiveEffects(ac, lo) {
    var list = [];
    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var wid = lo ? lo[g.id] : null;
      if (!wid || !WEAPONS[wid]) continue;
      list.push({ wid: wid, n: g.pts.length });
    }
    return Ent.passiveEffects(list);
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
      // 与图鉴共用 weaponGuidance()（codex.js）—— 两处不再各写一份映射
      var gd = weaponGuidance(w);
      if (gd.note) bits.push('导引 ' + gd.name + '（' + gd.note + '）');
      else if (gd.lead !== null) bits.push('导引 ' + gd.name + ' ' + Math.round(gd.lead * 100) + '%');
      else bits.push('导引 ' + gd.name);
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
    k1: '发射器 / 炮',
    k2: '发射器 / 炮',
    k3: '发射器 / 炮',
    k7: '发射器 / 炮',
    k11: '发射器 / 炮',
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
  /** 某一关属于哪个战役。preflight 保证每关恰好被一个战役覆盖，
      所以这里找不到就退回 0 —— 那种情况本身会被自检拦下。 */
  function campaignOf(idx) {
    for (var i = 0; i < CAMPAIGNS.length; i++) {
      if (CAMPAIGNS[i].missions.indexOf(idx) >= 0) return i;
    }
    return 0;
  }

  /** 战役进度：已完成关数 / 总关数 */
  function campaignProgress(ci) {
    var ms = CAMPAIGNS[ci].missions, done = 0;
    for (var i = 0; i < ms.length; i++) {
      if (cleared[MISSIONS[ms[i]].id]) done++;
    }
    return { done: done, total: ms.length };
  }

  /* 战役选择屏。它只认 CAMPAIGNS 这个数组 ——
     加新战役不需要改这里，也不需要在 index.html 里加东西。 */
  function buildCampaignList() {
    var list = document.getElementById('campList');
    if (!list) return;
    list.innerHTML = '';

    for (var i = 0; i < CAMPAIGNS.length; i++) {
      (function (ci) {
        var c = CAMPAIGNS[ci];
        var pg = campaignProgress(ci);
        // 没有关卡的战役是"资料封存"占位项：让未来战役在列表里有位置，
        // 但不承诺任何内容（地名、年份一律不写，免得与将来的设定打架）
        var locked = !c.missions || !c.missions.length;

        var d = document.createElement('div');
        d.className = 'camp-card' + (locked ? ' camp-locked' : '');

        var html =
          '<div class="cc-no">' + (c.no || '') + '</div>' +
          '<div class="cc-name">' + c.name + ' <span class="cc-en">' +
            (c.sub || c.en || '') + '</span></div>';
        if (!locked) {
          html += '<div class="cc-desc">' + c.desc + '</div>';
        } else {
          html += '<div class="cc-desc cx-note">该方向的作战档案尚未解封。</div>';
        }
        html +=
          '<div class="cc-foot">' +
            '<span>' + (c.loc || '') + '</span>' +
            '<span class="cc-prog">' +
              (locked
                ? '<i>未开放</i>'
                : '已完成 <b>' + pg.done + '</b> / ' + pg.total) +
            '</span>' +
          '</div>';
        if (!locked && c.period) {
          html += '<div class="cc-per">' + c.period + '</div>';
        }
        d.innerHTML = html;

        if (!locked) {
          d.addEventListener('click', function () {
            activeCampaign = ci;
            /* 进入战役时把当前关卡移到这个战役里：
               记住上次打到哪一关很体贴，但跨战役时那个下标是无效的 ——
               夹回本战役第一关最省事，也不会让人看到别人的简报。 */
            if (c.missions.indexOf(missionIdx) < 0) missionIdx = c.missions[0];
            SFX.unlock(); SFX.click();
            buildBrief(); show('brief');
          });
        }
        list.appendChild(d);
      })(i);
    }
  }

  /** 简报页顶部的任务选择器 —— 先看简报，再据此挑机体。
      列出的是**当前战役内**的关卡：跨战役跳关不该发生在这里，
      想换战役就退回战役选择屏。 */
  function buildMissionList() {
    var list = document.getElementById('msnList');
    if (!list) return;
    list.innerHTML = '';
    var ms = CAMPAIGNS[activeCampaign].missions;
    for (var i = 0; i < ms.length; i++) {
      (function (idx, pos) {
        var mm = MISSIONS[idx];
        var d = document.createElement('div');
        d.className = 'msn-item' + (idx === missionIdx ? ' sel' : '');
        /* 序号按战役内的位置重新编。关卡自身的 m.no 是全局编号
           （新战役的关会是 04、05…），用它当战役内的序号会跳号。 */
        var no = 'OPERATION ' + ('0' + (pos + 1)).slice(-2);
        d.innerHTML = '<div class="no">' + no + '</div>' +
          '<div class="nm">' + mm.name + '</div>' +
          '<div class="st' + (cleared[mm.id] ? ' done' : '') + '">' +
          (cleared[mm.id] ? '已完成' : mm.en) + '</div>';
        d.addEventListener('click', function () {
          if (idx === missionIdx) return;
          missionIdx = idx;
          SFX.unlock(); SFX.click();
          buildBrief();
        });
        list.appendChild(d);
      })(ms[i], i);
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
  /* 单位详情页：null = 正在看普通条目；否则 { kind, id }。
     两个图鉴条目（inv1 机型 / inv3 舰艇）里的单位名是可点的，
     点进去看这一型自己的 3D 旋转预览、俯视图、设定与参数。
     详情页**不占左侧导航的一项** —— 它挂在当前条目之下，
     返回时仍停在原来那一条上。 */
  var codexUnit = null;

  function buildCodex() {
    /* 重建前先停掉上一份 3D 预览：不然每切一次条目就多一个
       常驻的 requestAnimationFrame，越点越卡 */
    if (typeof UnitView !== 'undefined') UnitView.stop();

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
        d.onclick = function () {
          codexSel = idx;
          codexUnit = null;          // 换条目 = 退出详情
          SFX.click();
          buildCodex();
        };
        nav.appendChild(d);
      })(i);
    }

    var bodyEl = document.getElementById('codexBody');
    if (codexUnit && typeof UnitView !== 'undefined') {
      bodyEl.innerHTML = UnitView.html(codexUnit.kind, codexUnit.id);
      bindCodexUnits(bodyEl);
      UnitView.mount(codexUnit.kind, codexUnit.id);
      return;
    }

    var e = CODEX[codexSel];
    // 条目可以给静态 html，也可以给 build() 现场生成 ——
    // 图鉴那几条必须动态生成，否则改了武器数据文档就对不上了
    var body = typeof e.build === 'function' ? e.build() : (e.html || '');
    bodyEl.innerHTML =
      '<div class="cx-title">' + e.title + '</div>' +
      '<div class="cx-sub">' + e.sub + '</div>' +
      '<div class="cx-text">' + body + '</div>';
    bindCodexUnits(bodyEl);
  }

  /* 图鉴里的单位链接用**事件委托**，不逐个绑 ----
     正文整块 innerHTML 每次重建，逐个绑会漏、会重复绑；
     委托挂在容器上，重建后重新挂一次即可。

     注意冒烟测试桩的合成事件没有 target（见 tools/smoke.js 的
     makeEl().fire），所以断言里是手工构造带 target 的事件对象来测这条路径。 */
  function bindCodexUnits(el) {
    el.onclick = function (ev) {
      var t = ev && ev.target;
      while (t && t !== el) {
        if (t.getAttribute) {
          var u = t.getAttribute('data-unit');
          if (u && typeof UnitView !== 'undefined') {
            var parts = String(u).split(':');
            codexUnit = { kind: parts[0], id: parts[1] };
            SFX.click();
            buildCodex();
            return;
          }
          if (t.getAttribute('data-unit-back')) {
            codexUnit = null;
            SFX.click();
            buildCodex();
            return;
          }
        }
        t = t.parentNode;
      }
    };
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
      killed: 0, hitsLanded: 0, shotsFired: 0,
      /* 友军的击落单独记：进战报，但不进综合评定（见 finish）。
         killed 只数玩家自己的。 */
      wingKilled: 0, shipKilled: 0,
      /* 被摧毁的地面/海面目标数。`killed` 只数 team===1 的**飞机**，
         设施与舰船从不进那个统计 —— 于是打掉一座平台在结算上等于没发生。
         新关卡里有大量反舰/压制目标，必须单独记一笔。 */
      groundKilled: 0,
      /* 关卡时限（秒）。timeLimit 是这一关的总额度、timeLeft 是剩余；
         0 表示没有时限。startMission 从 mission.timeLimit 落进来 ——
         在此之前 timeLimit 声明了却全项目没人读，于是"限时任务"只有
         简报上的一句话，没有对应的机制。 */
      timeLimit: 0, timeLeft: 0
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
      if (a) { a.spSalvo = 1; Ent.setWeapon(a, null); }
      return;
    }
    if (a.wpIdx >= a.loadoutList.length) a.wpIdx = 0;
    var e = a.loadoutList[a.wpIdx];
    a.spSalvo = e.salvo;
    /* 选中的这一件 → special / spAmmo / spCd。
       实际赋值在 entities.js 的 setWeapon 里 —— AI 的开火选弹用的是同一份，
       两边各写一份迟早不一致。 */
    Ent.setWeapon(a, e.wid);
  }

  /* ============================================================
     齐射的出膛扇面
     ============================================================ */
  /* 巢式武器（GIR-5 三枚 / GIR-9 两枚 / GIR-12 四枚 / PEJ-6 七枚）
     按一下打出去的那几枚，必须各有各的出膛指向与出膛点。

     以前是"同一个点、同一个指向、同一个初速"复制 n 份 —— 它们完全
     重合：画面上只有一条烟迹、一个模型，按一下打三发和打一发看不出
     区别，齐射这个动作等于没有发生。

     现在按发射巢本来的样子把它们铺开：

       ① 指向：以机头为中线左右对称地扇形展开（相邻两发差 1.8°），
          奇偶发再上下交错 0.4 倍，最后叠一点随机抖动 ——
          不给抖动的话每一次齐射都是同一张完全对称的图。
       ② 出膛点：巢内横向错开 0.8 米。

     ②不是装饰：带导引头的弹出膛后一两帧内就把机头掰回视线，
     只给①的话几枚弹立刻并回同一条线；出膛点错开才会让它们在中段
     航路上保持一整个发射巢的宽度。

     ①对**无制导弹**要单独收窄（0.2°）。无制导弹的出膛指向就是它的
     整条弹道，1.8° 的扇面等于把"七发打在同一个点"变成"七发撒在
     半径 60 米的一圈里" —— 那是数值改动，不是视觉改动，火箭巢的
     命中率会凭空掉一大截。火箭巢的管子本来就是平行的，该错开的
     是管子本身（②的位置），不是指向。

     偏移左右对称，平均指向仍是机头方向，命中逻辑不变；
     单发（n ≤ 1）不做任何偏移。 */
  var SALVO_FAN = 1.8 * Math.PI / 180;      // 制导弹：相邻两发的出膛夹角
  var SALVO_FAN_UG = 0.2 * Math.PI / 180;   // 无制导弹：管子基本平行
  var SALVO_VER = 0.4;                      // 上下交错量，相对 FAN
  var SALVO_NEST = 0.8;                     // 巢内两发的横向间距（米）

  function salvoShots(actor, wp, n) {
    var base = M3.orthonormalize(actor.fwd, actor.up);
    var fan = (wp && wp.unguided) ? SALVO_FAN_UG : SALVO_FAN;
    var out = [];
    for (var q = 0; q < n; q++) {
      if (n <= 1) {
        out.push({ fwd: base.fwd, off: M3.V(0, 0, 0) });
        continue;
      }
      var k = q - (n - 1) / 2;                       // 以中线为 0 左右对称
      var lat = k * fan + M3.rnd(-0.25, 0.25) * fan;
      var vert = ((q % 2) ? 1 : -1) * fan * SALVO_VER;
      var fwd = M3.rotAxis(base.fwd, base.up, lat);
      fwd = M3.norm(M3.rotAxis(fwd, base.right, vert));
      out.push({ fwd: fwd, off: M3.mul(base.right, k * SALVO_NEST) });
    }
    return out;
  }

  /* 当前最危险的对手有多强 —— 电子战的窗口长度取决于**对手**，
     不是取决于自己的吊舱。取最近的敌方 AI；没有对手时给 0.5。 */
  function vsSkill(actor) {
    if (!world || !world.actors) return 0.5;
    var best = -1, bd = 1e12;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === actor.team || !e.ai) continue;
      var d = M3.dist2(e.pos, actor.pos);
      if (d < bd) { bd = d; best = e.ai.skill; }
    }
    return best < 0 ? 0.5 : best;
  }

  /* 开一件电子战吊舱：生效状态 + 冷却 + 播报。

     **唯一**的开机入口。手动扣扳机（launch 的 ecm 分支）、协处理器的
     自主决策（updateEWAuto）、任务脚本里干扰机航线到站，全部走它 ——
     以前这段逻辑只存在于 launch 里，任何"绕过扳机"的开机方式都得抄一遍。

     ewBurnT 描述的不是吊舱而是**对手**：信号处理能力强的部队能在 3 秒内
     完成对抗，差的要 8 秒（见 entities.js 的 openEcm）。 */
  function fireEcm(actor, wid) {
    var w = WEAPONS[wid];
    if (!w || w.kind !== 'ecm' || w.passive) return false;
    Ent.openEcm(actor, wid, vsSkill(actor));
    actor.spCd = w.cd;
    if (actor.slotCd && actor.slotCd[wid]) actor.slotCd[wid][0] = w.cd;
    SFX.laser();
    Radio.raw({
      who: actor.isPlayer ? CALLSIGN.player : (actor.label || actor.name),
      cls: 'ally',
      tx: '<i>认知电子战吊舱开机 —— 敌方锁定距离 −40%</i>', gap: 0.6
    });
    return true;
  }

  function launch(actor, target, w) {
    var wp = WEAPONS[actor.special];
    if (!wp) return false;

    /* ECM 吊舱 —— 交给 fireEcm()，协处理器的自主开机走同一个入口。 */
    if (wp.kind === 'ecm') {
      if (actor.spCd > 0) return false;
      return fireEcm(actor, actor.special);
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
    /* 判据只有一处：data.js 的 roeRestricted() —— 武器 desc 末尾那句
       交战规则提示也是由它生成的，两边不会再对不上。 */
    if (actor.isPlayer && w.roeBlocked && roeRestricted(wp)) {
      Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>交战规则限制 —— 该武器在阵列空域内被锁定。</b>', gap: 0.9 });
      return false;
    }
    /* 无目标也允许发射。

       无制导弹本来就不需要目标；有导引头的弹打出去之后直飞，
       或者靠 reAcquire 自己找 —— 那是玩家自己的选择，不该被拦。 */

    /* 一次按键只打 1 枚。
       挂载点决定的是"能同时装填几发"（也就是 slotArr 的长度），
       不是一次打几发 —— "齐射数"的含义就是：
       连按几次能打出几枚，之后要挨个等它们装填。 */
    var si2 = Math.max(0, slotIdx);
    var side = (si2 % 2) ? 1 : -1;
    var rank = Math.floor(si2 / 2);
    /* 出膛点 = 这个槽对应的那个挂架（与 pushStores 画的是同一个位置）。
       没有挂点表的单位（任务脚本里的航线单位等）退回旧的估算。 */
    var st = Ent.storeForSlot(actor, actor.special, si2);
    var hp = st ? Ent.storePos(actor, st.g, st.pt) : M3.add(actor.pos, M3.add(
      M3.mul(actor.fwd, 4),
      M3.mul(actor.right, side * (2.4 + rank * 1.9))));

    /* 一次按键打出 wp.salvo 枚，共用同一个冷却槽。

       "三联装"（GIR-5）的语义就是**按一下出三枚**，而不是"一个挂点
       占三个冷却槽" —— 后者会让槽数和挂点数脱钩，右下角的俯视缩略图、
       武器纵列表的圆点指示、3D 挂载的下标都得改成"一点多槽"。
       共用一槽则架构完全不用动，玩家看到的也仍然是"按一下，三枚出去"。

       出膛的那几枚各自偏开一点，见上面的 salvoShots() ——
       同一点、同一指向出去的弹会完全重叠成一发。 */
    var nShot = Math.max(1, Math.min(wp.salvo || 1, actor.spAmmo));
    var shots = salvoShots(actor, wp, nShot);
    /* 红外齐射：只有第一枚接手锁定的目标，其余几枚出膛后各自在
       导引头视场（lockCone）里找 —— 并避开兄弟弹已经咬住的那几架，
       一次齐射才能分打一个编队。雷达弹要靠载机交接，不走这条。 */
    var irSalvo = (nShot > 1 && wp.seeker === 'ir') ? { claimed: [] } : null;
    if (irSalvo && target) irSalvo.claimed.push(target);
    for (var q = 0; q < nShot; q++) {
      var m = Ent.makeMissile({
        weapon: actor.special,
        team: actor.team,
        pos: M3.add(hp, shots[q].off),
        fwd: shots[q].fwd,
        speed: actor.speed + 70,
        target: (irSalvo && q > 0) ? null : (target || null),
        owner: actor
      });
      m.salvo = irSalvo;
      w.missiles.push(m);
    }

    actor.spAmmo -= nShot;
    if (slotArr) {
      slotArr[si2] = wp.cd;
      // spCd 取"最快就绪的那个槽"，供 HUD 与 AI 判断还能不能再打
      actor.spCd = Math.min.apply(null, slotArr);
    } else {
      actor.spCd = wp.cd;
    }

    /* 弹药池的回写对**玩家与 NPC 都要做** —— 实体挂载靠它判断
       "这一发还在不在"（pushStores 的 pool <= 0）。以前只在玩家分支里
       回写，NPC 的池子永远停在初始值，于是敌机打光了翼下还挂着弹。 */
    if (actor.ammoPool) actor.ammoPool[actor.special] = actor.spAmmo;

    if (actor.isPlayer) {
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

    /* 关卡时限落到世界上。任务脚本声明 timeLimit，主循环负责倒计时与判负。 */
    world.timeLimit = mission.timeLimit || 0;
    world.timeLeft = world.timeLimit;

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
    /* 被动测距（GUS-6 明瞳 / GUS-9 夜枭）：用被动方式锁定时，
       对方的 RWR 收不到告警 —— 见 ai.js 里 rwrT 的判定。 */
    p.silentLock = pe.silentLock;

    /* 电子战的两项玩家状态：
         ewAuto  协处理器可否自主开机（设定 7.3 授予它的权限）
         emcon   完全电磁静默（雷达关机 / 数据链断开 / 干扰机停辐射） */
    p.ewAuto = true;
    p.emcon = false;

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
        if (e.code === 'KeyN' && player) toggleEmcon();
      }
      if (e.code === 'Escape') {
        if (state === 'playing') togglePause();
        else if (['hangar', 'codex', 'help', 'brief', 'campaign', 'changelog'].indexOf(state) >= 0) show('title');
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

  /* EMCON-Δ：完全电磁静默。

     术语表里的定义是"雷达关机、数据链断开、干扰机停止辐射"。
     玩法上它是一笔明确的交易：更难被对方发现，代价是自己也几乎瞎了
     （锁定距离减半，见 updateLock()）。干扰机必须停下来 ——
     一个还在辐射的平台不叫静默。 */
  function toggleEmcon() {
    if (!player || !player.alive) return;
    player.emcon = !player.emcon;
    if (player.emcon) {
      player.spActive = 0;          // 干扰机停辐射
      player.ewPower = 0;
      player.ewWid = null;
    }
    Radio.raw({
      who: CALLSIGN.player, cls: 'ally',
      tx: player.emcon
        ? '<b>EMCON-Δ 电磁静默。</b>雷达关机，数据链断开。'
        : '解除静默，雷达开机。',
      gap: 0.6
    });
    SFX.confirm();
  }

  function setWingCmd(cmd) {
    var names = { spread: '散开 SPREAD', focus: '集火 FOCUS', cover: '掩护 COVER' };
    for (var k in world.wings) {
      if (world.wings[k] && world.wings[k].ai) world.wings[k].ai.cmd = cmd;
    }
    /* 记下玩家最后一次手动下令的时刻与档位。

       预警机（updateAewc）在 8 秒内不再自动下指令 —— 支援单位可以
       替你操心，但不该抢你的操作。HUD 也读这个值画当前指令。 */
    world.lastWingCmdT = world.time;
    world.wingCmd = cmd;
    Radio.raw({ who: CALLSIGN.player, cls: 'ally', tx: '僚机指令：<b>' + names[cmd] + '</b>', gap: 0.5 });
    SFX.confirm();
  }

  function cycleTarget() {
    if (!world || !player) return;

    /* 候选按**当前武器的目标类别**分成两组。

       带对空弹时按 F/Tab 该在飞机之间循环，带对地弹时该在海面目标
       之间循环 —— 否则会出现"锁到一个浮台、切到对空弹打不出去，
       还要再按好几下才转回飞机"。地上和天上的东西本来就该分开选。 */
    var w = WEAPONS[player.special];
    var wantAir = !w || w.target === 'air';

    var air = [], surf = [];
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (a.alive && a.team !== player.team) air.push(a);
    }
    for (i = 0; i < world.targets.length; i++) {
      // 只把真正的敌方目标纳入锁定循环；中立的调节单元不可被选为目标
      var tg = world.targets[i];
      if (tg.alive && tg.team === 1) surf.push(tg);
    }

    /* 当前武器能打的那一类**排在前面**，另一类接在后面。

       注意是 concat 而不是二选一：两类都要能锁到。
       否则带对空弹时按 F 永远转不到海面目标 —— 而机炮打浮台、
       或者临时切弹打地面，本来都是正常用法。
       排前面的那类先循环，符合"我现在拿着什么弹"的直觉。 */
    var cands = wantAir ? air.concat(surf) : surf.concat(air);
    if (!cands.length) return;

    var cur = player.target, at = -1;
    for (i = 0; i < cands.length; i++) if (cands[i] === cur) at = i;
    var next = cands[(at + 1) % cands.length];

    // 没有当前目标时，选这一类里最近的
    if (at < 0) {
      var best = null, bd = 1e12;
      for (i = 0; i < cands.length; i++) {
        var d = M3.dist2(cands[i].pos, player.pos);
        if (d < bd) { bd = d; best = cands[i]; }
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

    /* 切枪**不清零锁定进度**。

       不同武器的锁定锥、锁定距离、寻的头速率都不一样，但"还能不能
       继续锁着"本来就该由 updateLock 按**新武器**的参数重新判 ——
       锁不住时进度会自己以 -2.2/s 衰减，不需要在这里手动清零。

       而清零的代价很大：锁定一架敌机之后想换另一种弹打同一架，
       得重新等整圈转完。可"对同一个敌人连打几种弹"正是多挂载的意义 ——
       先一枚雷达弹逼它做机动，再补一枚红外弹，这一套打不出来，
       挂载系统就只剩下"选一发威力最大的"这一个玩法了。 */
    Radio.raw({
      who: CALLSIGN.player, cls: 'ally',
      tx: '挂载切换：<b>' + w.name + ' 「' + w.cn + '」</b>', gap: 0.5
    });
    SFX.confirm();
  }

  /* 这件武器能不能打这个目标。

     可以就打回 null，否则返回一句给玩家看的话。

     为什么要专门做这件事：以前只有"有没有目标"的检查，于是带着
     对空弹锁住一个海面浮台，按下发射键——**弹照样打出去了**，
     然后从浮台旁边直接飞过去。玩家不会觉得"我用错了弹"，
     只会觉得"这游戏的导弹坏了"。 */
  function targetMismatch(w, t) {
    if (!w || !t) return null;
    /* 不锁目标的武器（吊舱 / 定向能）不参与这条判断 —— 它们本来就不选目标 */
    if (w.target !== 'air' && w.target !== 'ground' && w.target !== 'ship') return null;
    /* 真正的判据只有一处：Ent.weaponMatchesTarget —— AI 的选弹读的是同一个
       函数。两边各写一套的话，玩家会被提示"换对地弹"、而 AI 拿格斗弹去打
       海面平台，这类不一致不会报错，只会让行为看起来"有点笨"。 */
    if (Ent.weaponMatchesTarget(w, t)) return null;
    if (t.kind === 'target') {
      return w.name + '「' + w.cn + '」是<b>对空弹</b>，打不了海面设施。' +
        '按 <b>R</b> 换成对地挂载。';
    }
    return w.name + '「' + w.cn + '」是<b>对面弹</b>，锁的是飞机。' +
      '按 <b>F</b> 换个目标。';
  }

  function fireSpecial() {
    if (state !== 'playing' || !player || !player.alive) return;
    var w = WEAPONS[player.special];
    if (w.kind === 'ecm') { launch(player, null, world); return; }
    if (w.kind === 'dew') {
      Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: 'GUS-2 是自动拦截系统，无需手动发射。', gap: 0.6 });
      return;
    }
    if (player.spAmmo <= 0) { SFX.loseLock(); return; }
    if (player.spCd > 0) { SFX.loseLock(); return; }

    /* ---------- 不再要求"必须先锁定才能开火" ----------

       这一条以前拦掉两种完全正当的用法：

       ① 无制导武器。火箭巢和炸弹没有导引头，出膛之后往哪飞只看
          投放那一刻的机头指向 —— 要求先锁定，等于给一件从原理上
          就不需要锁定的武器加了一道锁定门槛。

       ② 俯冲扫射式的对地攻击。玩家压低机头对准目标，按下去却只
          得到一句"没有锁定目标"。

       现在只保留**一条**拦截：目标类型和武器对不上（拿对空弹打浮台）。
       那是真的打不出去，必须说清楚；而"打不打得中"是玩家自己的判断。 */
    var t = player.target;
    if (t && !t.alive) t = null;

    if (t) {
      var mism = targetMismatch(w, t);
      if (mism) {
        Radio.raw({ who: CALLSIGN.player, cls: 'ally', tx: mism, gap: 0.7 });
        SFX.fail();
        return;
      }
    }

    /* lockProgress 不再拦发射。它仍然驱动 HUD 上的锁定环 ——
       那是给玩家看的"火控解算进度"，不是开火许可。 */
    if (launch(player, t, world)) {
      Radio.raw({
        who: CALLSIGN.player, cls: 'ally',
        /* Fox 呼叫只适用于空空导弹。

           炸弹（包括有制导的）应该报"投放" —— 原来的判断只看了
           unguided，于是 PEJ-30 这类制导炸弹会喊出 Fox 2，
           那是战斗机发射格斗弹时的呼叫。 */
        tx: (w.unguided || w.kind === 'bomb' || w.kind === 'agm' || w.kind === 'asm')
          ? '<b>投放</b>'
          : (w.seeker === 'radar' ? '<b>Fox 3</b>'
            : (w.seeker === 'laser' ? '<b>照射</b>' : '<b>Fox 2</b>')),
        gap: 0.4
      });
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
     更新记录页

     内容来自 js/changelog.js（全局 CHANGELOG），而那个文件由
     tools/release.js 从根目录的 CHANGELOG.md 生成。
     所以这里只负责画，版本号与条目一个字都不在这条代码里 ——
     以后发新版本不需要动这个函数。
     ============================================================ */

  /* 条目里会出现 **强调** 与 `代码`。先转义再还原这两种写法 ——
     顺序反过来的话，转义会把刚生成出来的 <b> 一起逃掉。 */
  function clInline(s) {
    var out = String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    out = out.replace(/`(.+?)`/g, '<code>$1</code>');
    return out;
  }

  function buildChangelog() {
    var body = document.getElementById('clBody');
    var head = document.getElementById('clHead');
    if (!body) return;

    /* 开发时直接从源码打开、还没跑过生成脚本的情况：
       静默降级成一句提示，不影响游戏本身（和版本戳同一种处理）。 */
    if (typeof CHANGELOG === 'undefined' || !CHANGELOG.releases ||
        !CHANGELOG.releases.length) {
      if (head) head.textContent = '未生成';
      body.innerHTML = '<div class="cl-empty">这一份还没生成更新记录。' +
        '<br>在项目根目录跑一次 <b>node tools/release.js</b> 就有了。</div>';
      return;
    }

    var rs = CHANGELOG.releases;
    if (head) {
      head.textContent = '当前 ' + (CHANGELOG.current || rs[0].version) +
        ' · 共 ' + rs.length + ' 个版本';
    }

    var html = '';
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      html += '<article class="cl-item' + (i === 0 ? ' cl-cur' : '') + '">';
      html += '<div class="cl-head">';
      html += '<span class="cl-ver">' + clInline(r.version) + '</span>';
      html += '<span class="cl-tag t-' + ({ '大版本': 'big', '中版本': 'mid' }[r.tag] || 'small') + '">' +
        clInline(r.tag || '') + '</span>';
      html += '<span class="cl-date">' + clInline(r.date) + '</span>';
      html += '<span class="cl-title">' + clInline(r.title) + '</span>';
      if (i === 0) html += '<span class="cl-now">当前版本</span>';
      html += '</div>';

      if (r.lead) html += '<div class="cl-lead">' + clInline(r.lead) + '</div>';

      for (var s = 0; s < r.sections.length; s++) {
        var sec = r.sections[s];
        html += '<div class="cl-sec"><div class="cl-sh">' + clInline(sec.h) + '</div><ul class="cl-list">';
        for (var k = 0; k < sec.items.length; k++) {
          html += '<li>' + clInline(sec.items[k]) + '</li>';
        }
        html += '</ul></div>';
      }
      html += '</article>';
    }

    /* 末尾挂一句"这一页怎么来的"，顺手把版本号规则的位置告诉下一个改代码的人。 */
    html += '<div class="cl-foot">版本号规则见 docs/VERSIONING.md —— ' +
      '每条提交都会由 tools/release.js 自动分配版本号并追加到这里。</div>';

    body.innerHTML = html;
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
    /* 鼠标的屏幕位置，交给 steerTo。

       分工是刻意的：
         · **方向**判断用机体坐标（在 steerTo 里算的 ux）——
           "鼠标是不是指向机腹那一侧"本身就是个机体问题。
         · **幅度**判断用屏幕位置 —— 它是归一化的（±1 = 屏幕边缘），
           天然与 FOV 无关，不必再去换算角度。 */
    player.aimX = (mouse.x - Renderer.W / 2) / (Renderer.W * 0.5);
    player.aimDown = (mouse.y - Renderer.H / 2) / (Renderer.H * 0.5);
    player.aimMag = Math.sqrt(player.aimX * player.aimX +
      player.aimDown * player.aimDown);

    /* "相对镜头是不是正着飞"—— 机体 up 与**镜头** up 的一致度。

       注意不能用 a.up.y（相对世界）。追尾机位有俯仰角（低头看飞机），
       camUp 并不等于世界正上方：
           镜头俯 60°、飞机相对镜头平飞时，a.up.y = cos60° = 0.50，
           用世界判据会把它误判成"不正"，而它明明是正着的。

       俯仰越大这个差别越明显，所以只能按镜头算。 */
    var camNow = Renderer.getCam();
    if (camNow) player.aimUpright = M3.dot(player.up, camNow.up);

    // 传 player 自身作为锁存容器（提供 rollLock / aimMag）
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
       而不是一发一发抠。投放节奏由 breakLock 里的 flareCd 控制（0.45 s），
       而同一枚弹被反复投放会越来越难骗（见 breakLock 的抗欺骗计数）。 */
    if (keys.KeyV) {
      if (Ent.breakLock(player, world)) {
        /* 投放了但一枚都没骗到，而那枚弹其实已经被骗过一次 ——
           这是"继续丢没用"的唯一信号。每 10 秒最多提醒一次，
           否则一直按着 V 会把无线电刷满。 */
        if (player.decoysIneffective > 0) {
          if (player.decoyWarnT === undefined) player.decoyWarnT = 0;
          if (player.decoyWarnT <= 0) {
            player.decoyWarnT = 10;
            Radio.raw({
              who: CALLSIGN.wing2, cls: 'ally',
              tx: '<i>诱饵没用了，长机 —— 那枚弹已经看过一次。</i>', gap: 0.7
            });
          }
        }
      }
    }
    if (player.decoyWarnT > 0) player.decoyWarnT -= dt;

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
       代价是动能：角速度放大后转弯掉速也跟着放大（见 stepAircraft），
       速度掉到 1.3 倍失速以下就自动退出。 */
    var demand = Math.abs(c.pitch) + Math.abs(c.roll);
    var canG = player.speed > player.phys.vStall * 1.30;
    var wantG = !!keys.KeyG && demand > 0.55 && canG;

    if (wantG) {
      player.gLoad = M3.smooth(player.gLoad || 1, HIG_MAX, 9, dt);
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
  /* 玩家挂了哪一件**主动**电子战吊舱（没有就返回 null）。 */
  function playerEcmPod() {
    var lo = player.loadout;
    if (!lo) return null;
    for (var k in lo) {
      var w = WEAPONS[lo[k]];
      if (w && w.kind === 'ecm' && !w.passive) return lo[k];
    }
    return null;
  }

  /* 电子战协处理器的自主决策。

     设定 7.3：这台协处理器"有权在没有飞行员指令的情况下自主改变干扰
     策略 —— 这是全机唯一被授予此权限的子系统"。落到玩法上就是：
     你被主动雷达盯上、而吊舱已经冷却好时，它自己开机，不等你按扳机。

     player.ewAuto 允许关掉（HUD 上显示 EW AUTO / EW MAN）；
     进了 EMCON-Δ 它也必须闭嘴 —— 静默状态不允许任何辐射。 */
  function updateEWAuto(dt) {
    if (!player.alive || player.emcon || !player.ewAuto) return;
    if (player.spActive > 0 || player.spCd > 0) return;
    var pod = playerEcmPod();
    if (!pod) return;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === player.team) continue;
      if (e.target !== player) continue;                  // 它没在锁我
      if (M3.dist2(e.pos, player.pos) > 8000 * 8000) continue;
      fireEcm(player, pod);
      Radio.raw({
        who: 'SEXTANT', cls: 'cmd',
        tx: '<i>电子战协处理器自主开机 —— 它不等你的指令。</i>', gap: 0.8
      });
      return;
    }
  }

  /* ============================================================
     空中预警机
     ============================================================ */
  /* 预警机不是战斗机，是**眼睛**。它用四条现有链路干活，不新增系统：

       搜敌   与 nearestEnemy 同构的几何搜索，半径 30 km
              （普通 AI 只有 11–15 km —— 这就是"看得更远"）
       通报   现成的 bearing() + Radio.raw()
       调度   现成的 setWingCmd()（对自家僚机）/ a.ai.target（对敌方编队）
       沉默   被干扰机压制时闭嘴（新增的 suppressed）

     击落它，这些全部停止：没有通报，也没有人替你调度僚机。 */
  /* ============================================================
     范围压制（下游的"烧穿"路线）
     ============================================================ */
  function updateJamming(dt) {
    var i, j;
    /* 每帧重算：压制是"此刻被照着"，不是一种累积状态 ——
       离开那片空域，下一帧就恢复。 */
    for (i = 0; i < world.actors.length; i++) world.actors[i].suppressed = 0;
    for (i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive || a.ewPower <= 0) continue;
      var r = a.ewFieldR || 0;
      if (r <= 0) continue;
      for (j = 0; j < world.actors.length; j++) {
        var e = world.actors[j];
        if (!e.alive || e.team === a.team || e === a) continue;
        var d = M3.dist(e.pos, a.pos);
        if (d > r) continue;
        // 越靠中心越强；乘 ewPower 是为了让"关机"自动归零
        var k = a.ewFieldK * (1 - d / r) * a.ewPower;
        e.suppressed = Math.max(e.suppressed, Math.min(1, k));
      }
    }
  }

  function updateAewc(dt) {
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.aewc || !a.alive) continue;

      /* 被压制就闭嘴 —— 这是它与电子战体系的耦合点：
         干扰机压住预警机，玩家丢的不只是一部雷达，是整条指挥链。 */
      var jammed = (a.suppressed || 0) > 0.3;
      if (jammed !== !!a.aewcJammed) {
        a.aewcJammed = jammed;
        Radio.raw({
          who: a.label || a.name, cls: 'cmd',
          tx: jammed ? '<i>数据链中断 —— 我被压制了。</i>'
            : '数据链恢复。继续给你报。',
          gap: 0.8
        });
      }
      if (jammed) continue;

      a.aewcT = (a.aewcT === undefined ? 3 : a.aewcT) - dt;
      if (a.aewcT > 0) continue;
      a.aewcT = 9 + Math.random() * 4;

      if (a.team === player.team) aewcReportAlly(a);
      else aewcReportEnemy(a);
    }
  }

  /* 我方预警机：报出最近的敌机，并在必要时替你调度僚机。 */
  function aewcReportAlly(a) {
    var best = null, bd = 30000 * 30000;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === a.team) continue;
      var d = M3.dist2(e.pos, a.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    var d = Math.sqrt(bd);
    Radio.raw({
      who: a.label || a.name, cls: 'cmd',
      tx: '目标方位 ' + bearing(a.pos, best.pos) + '，距离 ' +
        (d / 1000).toFixed(1) + ' km，高度 ' + (Math.round(best.pos.y / 100) * 100) + '。',
      gap: 1.0
    });

    /* 替你调度僚机 —— 这是"预警机在指挥"最直接的体现。
       你刚手动下过指令就不插手（8 秒内），支援单位不该抢操作。 */
    var near = M3.dist2(best.pos, player.pos) < 6000 * 6000;
    var next = near ? 'spread' : 'focus';
    if (next !== world.wingCmd && world.time - (world.lastWingCmdT || -99) > 8) {
      setWingCmd(next);
    }
  }

  /* 敌方预警机：给它自己的人分配目标 —— 下游的"有组织集火"。
     打掉它，他们就退回各自为战，这正是它值钱的地方。 */
  function aewcReportEnemy(a) {
    var best = null, bd = 30000 * 30000;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === a.team) continue;
      var d = M3.dist2(e.pos, a.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    var n = 0;
    for (i = 0; i < world.actors.length; i++) {
      var m = world.actors[i];
      if (!m.alive || m.team !== a.team || !m.ai || m === a) continue;
      if (m.route) continue;                    // 航线型单位不参与空战
      if (m.behavior === 'recon') continue;     // 侦察 / 播撒构型不接战
      if (m.bigTarget) continue;                // 大型机不是用来格斗的
      /* 目标比它自己的升限还高一截时不派。

         派了也咬不到 —— 它只会硬爬到没有舵效的高度，
         最后停在那儿既打不着人、也甩不掉别人。 */
      if (m.ac && best.pos.y > ((m.ac.ceiling || 16000) + 1500)) continue;
      if (n >= 3) break;
      m.ai.target = best;
      m.ai.retargetT = 6;                       // 六秒内不自己重选
      n++;
    }
  }

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

    /* 双向压制（设定 8.3「干扰是双向的」）。

       自己的干扰机在压制对方接收机的同一时刻，也在压制自己的 ——
       这是"认知电子战吊舱开机之后你自己的雷达同时被压制"的落点。
       强度取 ewPower（那条爬升→压制→被对抗掉的曲线），而不是
       一个开关：干扰刚开时你自己也最瞎，对手完成对抗之后两边一起恢复。

       注意这里**不再看 spActive** —— 玩家随时可以切走吊舱，
       但辐射还在持续。用 ewPower 才不会出现"切枪即免疫"。 */
    if (player.ewPower > 0) {
      lockDist *= (1 - (player.ewLockReduce || 0.40) * player.ewPower);
      // 雷达受扰时红外弹仍可发射，但锁定锥收窄到 ±20°
      cone = Math.min(cone, 20 * Math.PI / 180);
    }

    /* EMCON-Δ：雷达关机，只剩被动手段 —— 锁定距离直接砍半。
       这是"更难被发现"那一头的代价，与被动吊舱的 +45% 正好互为反面。 */
    if (player.emcon) lockDist *= 0.5;

    /* 目标自己的被动抗锁（SAV-6 / ZUN-8 这类吊舱汇总出来的 lockResist）。
       AI 锁玩家时一直在读它（ai.js），玩家锁 AI 时以前却不读 ——
       敌机挂的干扰吊舱对玩家完全没用。 */
    if (t.lockResist) lockDist *= (1 - t.lockResist);

    /* ---------- 对空与对面是两套完全不同的判据 ----------

       对空弹靠**导引头**：受视场锥角限制，目标偏出锥外就丢，
       而且丢失之后进度会掉。所以判据是"距离 + 离轴角"。

       对面弹靠**火控投放解算**：飞机不必把机头对准浮台 ——
       火控要算的是"这一下能不能扔到"。所以判据是"距离 + 俯角"，
       没有锥角这回事。

       以前这两个分支的代码一模一样（都是 dist < lockDist && off < cone），
       等于拿导引头的逻辑去锁海面：玩家得把机头死死指着浮台，
       稍微偏一点就"丢锁" —— 而对地武器本来就不是那么用的。 */
    var ok = false;
    if (w.target === 'air') {
      ok = dist < lockDist && off < cone;
    } else {
      /* 投放包线：水平距离够近，并且目标在机头下方。
         dir 是指向目标的世界方向，dir.y 直接就是它的高低 ——
         dir.y 为正表示目标在机头上方，那是仰投，不该给解。 */
      var dep = -dir.y;                       // 目标低于机头的程度（sin）
      ok = dist < lockDist * 1.35 && dep > -0.10;
    }

    /* 锁定速率按导引方式分档。

       红外最快 —— 它出膛之后还能自己找目标，火控不需要那么精确；
       雷达居中；激光最慢，因为它要求的是"稳住照射"，
       机头一偏照射就断，得重新建立。 */
    var rate = 1 / (w.nezer ? 1.5
      : (w.seeker === 'ir' ? 0.55
        : (w.seeker === 'eo' ? 0.60      // 光电与红外同属被动成像，都快
          : (w.seeker === 'laser' ? 1.6 : 1.1))));
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
    var i;

    for (i = 0; i < world.bullets.length; i++) scanShot(world.bullets[i], dt);

    /* 无制导弹也走这里。

       它们没有导引头、不会自己找目标 —— 出膛之后唯一能"命中"的方式
       就是撞上去。所以必须和子弹一样做线段-球相交，
       否则炸弹扔到浮台头顶会直接穿过去，一点血都不掉。 */
    for (i = 0; i < world.missiles.length; i++) {
      var mm = world.missiles[i];
      if (mm.alive && mm.w && mm.w.unguided) scanShot(mm, dt);
    }
  }

  /* 一发弹体（子弹或无制导弹）的命中检测。逻辑完全一样：
     只用"上一帧位置 → 当前位置"这条线段去和球求交。 */
  function scanShot(b, dt) {
      if (!b.alive) return;
      var j;
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
      if (!b.alive) return;

      // 对目标物
      for (j = 0; j < world.targets.length; j++) {
        var tg = world.targets[j];
        if (!tg.alive || tg.team === b.team) continue;
        var r = tg.radius || 8;
        var t2 = M3.raySphere(prev, dir, tg.pos, r);
        if (t2 >= 0 && t2 <= segLen) {
          if (b.owner && b.owner.isPlayer) world.hitsLanded++;
          /* 子母弹撞上设施 = 就地抛撒，按覆盖半径结算一片（Ent.clusterBurst）。 */
          if (b.w && b.w.cluster) {
            b.pos = M3.add(prev, M3.mul(dir, t2));
            Ent.clusterBurst(b, world);
            SFX.hit();
            break;
          }
          b.alive = false;
          // 加固目标对普通战斗部打折（Ent.warheadK；子弹的 b.w 是 undefined → 1）
          hitTarget(tg, b.dmg * Ent.warheadK(b.w, tg), b.owner);
          SFX.hit();
          break;
        }
      }
      if (b.pos.y <= 0) b.alive = false;
  }

  /* 制导弹（detonate）与子母弹（clusterBurst）打设施也走这里 ——
     以前它们走的是 Ent.damage → kill()，击毁不进 groundKilled、
     误击调节单元也不记处罚。 */
  Ent.setTargetHitHandler(function (tg, dmg, source) { hitTarget(tg, dmg, source); });

  function hitTarget(tg, dmg, source) {
    if (!tg.alive) return;
    tg.hp -= dmg;
    Ent.spawnParticle(world.particles, tg.pos, M3.V(0, 2, 0), 0.3, 2.6, '#ffcc66', { grow: true });
    if (tg.hp <= 0) {
      /* 打掉 friendlyAsset（调节单元、准绳）一律记处罚 —— 以前 penal 算了没人用，
         只有 cell 分支自己累加，准绳被打掉反而 +400。 */
      var penal = tg.friendlyAsset && source && source.isPlayer;
      if (penal) world.friendlyLoss = (world.friendlyLoss || 0) + 1;
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
  /* 水面/地面目标的对空射击。

     以前这里只会朝玩家开火 —— 于是我方舰艇（team 0）根本没法带武器：
     一带上就会对玩家自己发射。现在按阵营挑目标：
       team 1（敌方）  玩家优先；玩家不在射程/没被发现时，打最近的我方飞机（僚机/无人机）
       team 0（我方）  最近的敌机（team 1）
       team 2（中立）  从不开火
     发射本身沿用原来那条路径（makeMissile + fireCd）。弹的阵营 = 发射者阵营，
     命中判定与近炸都按 m.team 过滤（见 entities.js），所以我方舰艇的弹
     不会伤到玩家与僚机。 */
  function pickTargetFor(t, w) {
    if (t.team === 1) {
      if (player.alive) {
        var d = M3.dist(t.pos, player.pos);
        // 玩家的被动吊舱会压缩敌方对他的锁定距离
        if (d <= w.lockDist * (1 - (player.lockResist || 0))) {
          // 低空突防可以躲开对空雷达；但贴得太近仍会被目视发现
          var lowExposed = t.ground && player.pos.y < (world.dangerAltitude || 1500) && d < 5200;
          if (world.detected || lowExposed) return player;
        }
      }
      // 没被发现之前不会去打僚机 —— 否则一开火就等于自己暴露了
      if (!world.detected) return null;
    } else if (t.team !== 0) {
      return null;
    }
    var best = null, bd = w.lockDist;
    for (var j = 0; j < world.actors.length; j++) {
      var e = world.actors[j];
      if (!e.alive || e === player || e.team === t.team || e.team === 2) continue;
      var de = M3.dist(t.pos, e.pos);
      if (de < bd) { bd = de; best = e; }
    }
    return best;
  }

  function updateTargets(dt) {
    for (var i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      if (!t.alive) continue;
      Ent.stepTarget(t, dt);

      if (!t.weapon || t.team === 2) continue;
      if (t.fireCd > 0) { t.fireCd -= dt; continue; }

      var w = WEAPONS[t.weapon];
      if (!w) continue;
      var tgt = pickTargetFor(t, w);
      if (!tgt) continue;
      var d = M3.dist(t.pos, tgt.pos);

      t.fireCd = w.cd + M3.rnd(0, 2);
      var dir = M3.norm(M3.add(M3.sub(tgt.pos, t.pos), M3.V(0, 260, 0)));
      var m = Ent.makeMissile({
        weapon: t.weapon, team: t.team,
        pos: M3.V(t.pos.x, t.pos.y + 5, t.pos.z),
        fwd: dir, speed: 140,
        target: tgt, owner: t
      });
      world.missiles.push(m);
      // 只有冲着玩家来的那一发才喊"发射"；告警音由主循环按 m.target 判
      if (tgt === player) {
        Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>发射！方位 ' + bearing(t.pos, player.pos) + '，距离 ' + (d / 1000).toFixed(1) + ' km。</b>', gap: 0.9 });
        SFX.missileFar();
      }
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
      /* 每枚来袭弹**只判一次**：第一次进入包线时按 chance 掷骰。

         以前是把总概率按"约 1.2 秒飞行时间"折成每帧概率连续掷，
         实际累积是 1 − e^(−chance·T/1.2)，T 取决于接近速度：
         迎头 1200 m/s 的弹只在包线里待 1 秒，55% 实际只有 37% 左右。
         现在 desc 写的 55% 就是每枚弹被烧掉的概率。 */
      var rollKey = actor.id !== undefined ? actor.id : actor;
      if (m.dewRolled === rollKey) continue;
      m.dewRolled = rollKey;
      if (!(Math.random() < chance)) continue;
      // 拦截成功
      actor.spCharges--;
      // 开始充能倒计时（打空了就一直走到补满为止）
      if (actor.spChargeT <= 0) actor.spChargeT = w.recharge || 18;
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

         **镜头俯仰限制在 ±89°，飞机可以翻过去，镜头不跟。**
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
         俯仰限制在 ±89°：飞机可以翻过正上方/正下方，镜头不跟，
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
         俯仰 9（俯仰是玩家直接控制的，太慢会显得操纵迟滞）。

         为什么是 89° 而不是 90°：正交化前 |up| = cos(限位)，
         而 orthonormalize 的退化阈值是 |up| < 1e-4。
         持续垂直压到限位时，89° 还剩 1.75e-2（175 倍余量），
         实测收敛后镜头帧间差为 0、没有任何抽动；
         89.9° 只剩 17 倍，89.999° 只剩 1 倍，到 90° 直接归零 ——
         参考轴反复横跳、"极点卡动"就回来了。
         89° 是"能看见最高"与"正交基始终远离退化"之间留够余量的位置。 */
      var CAM_PITCH_LIM = 89 * Math.PI / 180;
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

    /* 关卡时限。超时由 loss 分支统一判负（见下面 mission.lose 那一段）——
       任务脚本不需要自己写倒计时，只要在 mission 上声明 timeLimit。 */
    if (world.timeLimit > 0 && world.timeLeft > 0) {
      world.timeLeft -= dt;
      if (world.timeLeft <= 0) world.timeLeft = 0;
      if (world.timeLeft === 0 && !world.flags.timeUp) {
        world.flags.timeUp = true;
        Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>时间到。窗口关闭了。</b>', gap: 1.0 });
      }
    }

    if (player.alive) controlPlayer(dt);
    else SFX.gun(false);

    // 玩家
    Ent.stepAircraft(player, dt, world);
    updateEWAuto(dt);            // 协处理器可能在你按扳机之前就开机了
    updateLock(dt);
    updateDEW(dt, player);
    updateJamming(dt);           // 范围压制场（下游的烧穿路线）
    updateAewc(dt);              // 预警机：通报、调度、被压制时沉默

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
    /* 判据：**当前锁定本机的**，或者**刚被诱饵骗掉、还在本机附近飞**的弹。

       以前只认 `m.target === player`，于是撒出诱饵、导弹丢了锁的那一瞬间，
       "滴滴滴"就没了 —— 可那枚弹并没有消失：它只是被诱饵带偏了，而且
       盲飞期一过还可能重新咬回来（v11 / mrm / wasp 带 reAcquire）。
       玩家听到静音就以为威胁解除，这是最危险的一类假信号。

       注意排除已经失效或飞远的弹：告警不能在诱饵起作用之后一直响到
       天荒地老，那样它也会失去意义。 */
    var warn = false;
    for (i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.team === player.team) continue;
      var md = M3.dist(m.pos, player.pos);
      if (md >= 3600) continue;
      var lockedOn = (m.target === player);
      var stillAround = (m.spoofed === player && m.reLockT > 0);
      if (lockedOn || stillAround) warn = true;
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

    // 统计：按击杀者分开记功（Ent.kill 写的 killedBy）
    var k = 0, kw = 0, ks = 0;
    for (i = 0; i < world.actors.length; i++) {
      var deadA = world.actors[i];
      if (deadA.team !== 1 || deadA.alive) continue;
      var credit = killCredit(deadA);
      if (credit === 'player') k++;
      else if (credit === 'wing') kw++;
      else if (credit === 'ship') ks++;
    }
    world.wingKilled = kw;
    world.shipKilled = ks;
    if (k > world.killed) {
      hits.push({ txt: 'KILL  ' + k, t: 1.1, col: HUD.AMBER });
      SFX.confirm();
    }
    world.killed = k;

    // 胜负
    /* 时限判负在同一处兜住：声明了 timeLimit 的关卡不需要在自己的 lose()
       里再写一遍倒计时判断，避免十个关卡十种写法。 */
    if (world.timeLimit > 0 && world.timeLeft <= 0) { finish(false); return; }
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

     坐标（含挂点高度）在 entities.js 的 Ent.storePos() 里，
     离线预览器 tools/render-mounts.js 用的是同一份。
     ============================================================ */
  function pushOneStore(a, g, pt, w) {
    var mdl = MODELS[w.model] || MODELS.missile;
    Renderer.pushModel(mdl, Ent.storePos(a, g, pt), a.fwd, a.up, { scale: 0.85 });
  }

  function pushStores(a) {
    /* 槽号 ↔ 挂点的对应在 Ent.forEachStoreSlot 里，launch 的出膛点用同一份。 */
    var slots = a.slotCd || {};
    Ent.forEachStoreSlot(a, function (g, pt, wid, si) {
      var w = WEAPONS[wid];
      // 已经打光：冷却早已归零，但挂架上不该再有任何东西
      var pool = a.ammoPool ? a.ammoPool[wid] : undefined;
      if (pool !== undefined && pool <= 0) return;
      /* 吊舱与定向能不是"打出去"的东西 —— 一直挂在挂架上（si 为 null）。 */
      if (si !== null) {
        var arr = slots[wid] || [];
        if ((arr[si] || 0) > 0) return;          // 这个发射槽还在装填 → 挂架空着
      }
      pushOneStore(a, g, pt, w);
    });
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

  /* 一架敌机算谁的。没有记录击杀者的（自己失速撞海、被逼进海面）
     算玩家的 —— 这和以前"所有敌机阵亡都算玩家"的口径一致。 */
  function killCredit(a) {
    if (a.escaped) return 'none';   // 飞完航线离场（ai.js updateRoute），没被打下来
    var kb = a.killedBy;
    if (!kb || kb.isPlayer) return 'player';
    if (kb.kind === 'target') return kb.team === 0 ? 'ship' : 'other';
    if (kb.team === 0) return 'wing';
    return 'other';             // 敌方误伤自己人：谁的功也不算
  }

  /* ============================================================
     结算
     ============================================================ */
  function finish(win) {
    if (win) cleared[MISSIONS[missionIdx].id] = true;
    SFX.silence();
    state = 'debrief';
    SFX[win ? 'fanfare' : 'fail']();

    var acc = world.shotsFired > 0 ? world.hitsLanded / world.shotsFired : 0;
    var hull = player.alive ? player.hp / player.maxHp : 0;
    var penalty = (world.friendlyLoss || 0);
    /* 地面/海面目标单独计分，权重低于一架飞机（1000）—— 否则"打设施"
       会变成比空战更划算的刷分方式，而这类目标既不会还手也不会跑。 */
    var gk = world.groundKilled || 0;
    var score = world.killed * 1000 + gk * 400 + Math.round(acc * 3000)
      + Math.round(hull * 2000) + (win ? 4000 : 0) - penalty * 2500;

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
      /* 友军战果：只展示，不进上面的 score。 */
      ['友军击落', (world.wingKilled || 0) + (world.shipKilled || 0)],
      ['地面 / 海面目标', gk],
      ['发射 / 命中', world.shotsFired + ' / ' + world.hitsLanded],
      /* 只算机炮：hitsLanded 由子弹命中累加，导弹命中不记（见 scanShot）。
         所以这一栏写"命中率"会让一场反舰任务的读数看起来很差 ——
         叫"机炮精度"说的才是它真正测的东西。 */
      ['机炮精度', (acc * 100).toFixed(0) + '%'],
      ['机体完整度', player.alive ? (hull * 100).toFixed(0) + '%' : '—'],
      ['误击友方设施', penalty],
      ['作战时间', world.timeLimit > 0
        ? fmtTime(world.time) + ' / ' + fmtTime(world.timeLimit)
        : fmtTime(world.time)],
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
      m2: '「海上没有山可以躲。你能躲进去的，只有云底和浪头之间那几百米。」',
      m3: '「冬港是我出生的地方。它是唯一一个还有水的镇子 —— 因为它在调节场的北面。」',
      m4: '「他们不是为一场交战造的船。是为一次齐射造的。」',
      m5: '「先让对手瞎掉，再打。这句话我们听了很多年，现在轮到我们用。」',
      m6: '「在稀薄大气里，最会飞的人属于那支装备更差的空军。」',
      m7: '「雾保护你，也一样保护他。」',
      m8: '「他们不是来找我们的。他们是来炸我们身后的东西的。」',
      m9: '「海面上漂着很多东西。有些是他们的。」',
      m10: '「他不是来复仇的。他是来做交易的。」'
    };
    document.getElementById('dQuote').textContent = win ? quotes[mission.id] || '' :
      '任务失败。那片空域还在他们手里，而下一次出动要等下一班油。';

    var nb = document.getElementById('btnNext');
    /* "下一任务"只在本战役内有意义 —— 打完最后一场就该回战役选择，
       而不是把玩家直接送进别的战役。 */
    var msn = CAMPAIGNS[campaignOf(missionIdx)].missions;
    var mp = msn.indexOf(missionIdx);
    var lastM = mp >= msn.length - 1;
    nb.disabled = !win || lastM;
    nb.textContent = lastM ? '本战役已完结' : '下一任务 >';

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
      'CALLSIGN', 'SFX', 'Renderer', 'Ent', 'AI', 'HUD', 'MISSIONS', 'CAMPAIGNS', 'Radio'];
    for (i = 0; i < core.length; i++) {
      if (typeof window[core[i]] === 'undefined') problems.push('核心模块 ' + core[i] + ' 未加载');
    }
    if (problems.length) { report(problems); return problems; }

    for (i = 0; i < AIRCRAFT.length; i++) {
      var ac = AIRCRAFT[i];
      if (!MODELS[ac.model]) problems.push('机型 ' + ac.id + ' 引用了不存在的模型 "' + ac.model + '"');
      /* 没有机炮是**合法**的（预警机、重型轰炸机在数据里就是 `gun: null`）。
         只有"声明了机炮但数据表里没有"才是写错。 */
      if (ac.gun && !WEAPONS[ac.gun]) {
        problems.push('机型 ' + ac.id + ' 引用了不存在的机炮 "' + ac.gun + '"');
      }
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
      'sam', 'radar', 'depot', 'cmdpost', 'station', 'missile', 'bomb', 'pod',
      /* 水面舰船（SHIPS 表）—— 接入关卡之前它们也要先被自检覆盖，
         否则模型名写错要到任务里才暴露。顺序按阵营：上游 → 下游 → 其余 */
      'orca', 'bluewhale', 'humpback', 'spermwhale', 'dolphin',
      'trilobite', 'ammonite', 'seascorpion', 'cameroceras', 'dunkleosteus',
      'daplu', 'skori', 'diklo', 'cross', 'icecore', 'atoll'];
    for (i = 0; i < needModels.length; i++) {
      if (!MODELS[needModels[i]]) problems.push('缺少模型 ' + needModels[i]);
    }

    var needWeapons = ['k1', 'k2', 'k3', 'k7', 'k11', 'v11', 'v9', 'v17', 'v22', 'v25', 'v30',
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

    /* 战役分组自检。
       最容易静默发生的错误是"关卡加了、没挂进任何战役" ——
       那关在世界里存在，但选关界面永远列不到它，而且不会报错。
       反过来，下标越界或一关挂进两个战役，会让战役内序号和进度对不上。 */
    var owner = [];
    for (i = 0; i < MISSIONS.length; i++) owner.push(-1);
    for (i = 0; i < CAMPAIGNS.length; i++) {
      var cp = CAMPAIGNS[i];
      if (!cp.id || !cp.name) problems.push('战役 ' + i + ' 缺少 id / name');
      if (!cp.missions || !cp.missions.length) {
        /* 空列表是合法的"资料封存"占位项 —— 战役屏会把它画成不可点的卡片。
           这里只检查它确实是个数组，而不是漏写的 undefined。 */
        if (cp.missions !== undefined && !(cp.missions instanceof Array)) {
          problems.push('战役 ' + cp.id + ' 的 missions 不是数组');
        }
        continue;
      }
      for (j = 0; j < cp.missions.length; j++) {
        var mi = cp.missions[j];
        if (mi < 0 || mi >= MISSIONS.length) {
          problems.push('战役 ' + cp.id + ' 引用了不存在的任务下标 ' + mi);
          continue;
        }
        if (owner[mi] >= 0) {
          problems.push('任务 ' + MISSIONS[mi].id + ' 同时属于战役 ' +
            CAMPAIGNS[owner[mi]].name + ' 与 ' + cp.name);
        }
        owner[mi] = i;
      }
    }
    for (i = 0; i < owner.length; i++) {
      if (owner[i] < 0) {
        problems.push('任务 ' + MISSIONS[i].id + ' 没有归属任何战役，选关界面会漏掉它');
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
      el.innerHTML = 'BUILD <i>开发版</i>';
      return;
    }
    var v = BUILD_STAMP.version ? BUILD_STAMP.version + ' · ' : '';
    el.innerHTML = 'BUILD <b>' + v + BUILD_STAMP.time + '</b>' +
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
        else if (go === 'campaign') {
          /* 战役屏没有"当前战役"的概念，每次进来都重新渲染进度；
             按下哪一张卡由 buildCampaignList 里的监听决定。 */
          buildCampaignList(); show('campaign');
        }
        else if (go === 'brief') {
          /* 简报页的关卡选择器只列当前战役。若 missionIdx 落在别的战役里
             （比如刚打完上一场战役，或从别处进来），先夹回本战役。 */
          var campMs = CAMPAIGNS[activeCampaign].missions;
          if (campMs.indexOf(missionIdx) < 0) missionIdx = campMs[0];
          buildBrief(); show('brief');
        }
        else if (go === 'codex') { buildCodex(); show('codex'); }
        else if (go === 'settings') { buildSettingsInto(document.getElementById('setWrap')); show('settings'); }
        else if (go === 'help') { buildHelpPage(); show('help'); }
        else if (go === 'changelog') { buildChangelog(); show('changelog'); }
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
      /* 只在本战役内推进：跨战役的"下一任务"应该走战役选择屏，
         否则玩家会在一次点击里被扔进一场他没选过的战役。 */
      var ms = CAMPAIGNS[campaignOf(missionIdx)].missions;
      var pos = ms.indexOf(missionIdx);
      if (pos >= 0 && pos < ms.length - 1) {
        missionIdx = ms[pos + 1];
        activeCampaign = campaignOf(missionIdx);
      }
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
    __world: function () { return world; },
    // 实体挂载的渲染：断言要能单独喂一架飞机进来数它画了几个挂载
    __pushStores: pushStores,
    // 水面目标的对空射击：断言要能单独推一帧，确认我方舰艇不朝玩家打
    __updateTargets: updateTargets
  };
})();

window.addEventListener('load', function () { Game.init(); });
