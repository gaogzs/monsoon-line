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
  var selectedAC = 0, selectedSpecial = null;
  var keys = {}, mouse = { left: false, right: false, x: 0, y: 0 };
  var aimMode = true;              // true = 鼠标引导（指令增稳），false = 键盘直控
  var last = 0, camMode = 0;
  var camFwd = M3.V(0, 0, 1), camUp = M3.V(0, 1, 0), camPos = M3.V(0, 0, 0);
  var camYaw = 0, camPitch = 0;
  var banner = { t: 0, title: '', sub: '', col: '' };
  var hits = [];
  var stats = null;
  var cleared = {};        // 本次会话内已完成的任务
  var MAX_HP_ACE = 0;

  /* ============================================================
     屏幕管理
     ============================================================ */
  function show(id) {
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
    camDist: 74,
    camHeight: 22,
    hudOpacity: 100,
    compass: true,
    targetMarkers: true
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
        { k: 'fov', label: '视场角 FOV', type: 'range', min: 38, max: 100, unit: '°' },
        { k: 'camDist', label: '镜头距离', type: 'range', min: 28, max: 200, unit: ' m' },
        { k: 'camHeight', label: '镜头高度', type: 'range', min: -10, max: 70, unit: ' m' }
      ]
    },
    {
      title: '显示',
      items: [
        { k: 'hudOpacity', label: 'HUD 透明度', type: 'range', min: 25, max: 100, unit: '%' },
        { k: 'compass', label: '顶部指南针', type: 'toggle' },
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

    if (item.type === 'range') {
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
    ['Shift / Ctrl', '油门增 / 减'],
    ['X / Z', '加力燃烧室 / 减速板'],
    ['↑ ↓ ← →', '自由视角（松开自动回中）'],
    ['鼠标左键 / Space', '机炮'],
    ['鼠标右键 / Enter', '发射特殊武器'],
    ['F / Tab', '切换目标'],
    ['R', '切换挂载'],
    ['V', '释放干扰弹'],
    ['C', '切换视角（追尾 / 座舱 / 目标）'],
    ['1 / 2 / 3', '僚机指令：散开 / 集火 / 掩护'],
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
      (function (idx) {
        var ac = AIRCRAFT[idx];
        var d = document.createElement('div');
        d.className = 'ac-card' + (idx === selectedAC ? ' sel' : '');
        d.innerHTML = '<div class="n">' + ac.name + '</div>' +
          '<div class="c">' + ac.nick.toUpperCase() + ' · ' + ac.cn + '</div>' +
          '<div class="r">' + ac.role + '</div>';
        d.onclick = function () {
          selectedAC = idx;
          selectedSpecial = AIRCRAFT[idx].defSpecial;
          SFX.click();
          buildHangar();
        };
        list.appendChild(d);
      })(i);
    }

    var ac = AIRCRAFT[selectedAC];
    if (!selectedSpecial || ac.specials.indexOf(selectedSpecial) < 0) {
      selectedSpecial = ac.defSpecial;
    }
    document.getElementById('acName').textContent = ac.name + '  「' + ac.cn + '」';
    document.getElementById('acRole').textContent = ac.role + '  ·  ' + ac.maker;

    var stats = [
      ['最大速度', 'spd'], ['机动性', 'mob'], ['低可探测', 'stl'],
      ['火力', 'fire'], ['生存性', 'dur'], ['航程', 'rng']
    ];
    var sh = '';
    for (var k = 0; k < stats.length; k++) {
      var v = ac.stats[stats[k][1]];
      sh += '<div class="stat-row"><span class="l">' + stats[k][0] + '</span>' +
        '<span class="stat-bar"><i style="width:' + (v * 100).toFixed(0) + '%"></i></span>' +
        '<span class="v">' + (v * 100).toFixed(0) + '</span></div>';
    }
    document.getElementById('acStats').innerHTML = sh;
    document.getElementById('acDesc').innerHTML = ac.desc;

    var sp = document.getElementById('spList');
    sp.innerHTML = '';
    for (k = 0; k < ac.specials.length; k++) {
      (function (sid) {
        var w = WEAPONS[sid];
        var d = document.createElement('div');
        d.className = 'sp-item' + (sid === selectedSpecial ? ' sel' : '');
        d.innerHTML = '<div class="n">' + w.name + ' 「' + w.cn + '」</div>' +
          '<div class="d">' + w.desc + '</div>' +
          '<div class="q">' + kindLabel(w.kind) +
          (w.ammo ? '  ·  备弹 ' + w.ammo : '') +
          (w.cd ? '  ·  冷却 ' + w.cd + 's' : '') + '</div>' +
          '<div class="q root">编号含义 · ' + (ROOTS[sid] || '—') + '</div>';
        d.onclick = function () { selectedSpecial = sid; SFX.click(); buildHangar(); };
        sp.appendChild(d);
      })(ac.specials[k]);
    }

    var gun = WEAPONS[ac.gun];
    document.getElementById('acLoadout').innerHTML =
      '标准配置 —— <b>' + gun.name + '</b> ' + gun.cn + ' · 备弹 ' + gun.ammo + '<br>' +
      '特殊挂载 —— <b>' + WEAPONS[selectedSpecial].name + '</b> ' +
      WEAPONS[selectedSpecial].cn + '<br>' +
      '干扰弹 —— <b>8</b> 发<br>' +
      '<span style="color:#4a6172">编号前缀取自逻辑语词根 —— ' +
      '环带工程自 2062 年起以逻辑语为签字语言，详见资料库。</span>';
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
    // 岛屿轮廓（示意）
    g.fillStyle = 'rgba(40,60,72,0.55)';
    g.beginPath();
    g.ellipse(W * 0.34, H * 0.62, W * 0.20, H * 0.13, 0.5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(W * 0.70, H * 0.40, W * 0.13, H * 0.09, -0.3, 0, Math.PI * 2);
    g.fill();

    var R = 17000;
    var cx = W / 2, cy = H * 0.72;
    var cols = { base: '#4fe08a', enemy: '#ff4d4d', relay: '#ffb03a', sam: '#ff8b2a', site: '#45d6ff' };

    for (i = 0; i < m.map.length; i++) {
      var p = m.map[i];
      var x = cx + p.x / R * (W * 0.45);
      var y = cy - p.z / R * (H * 0.62);
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
    document.getElementById('codexBody').innerHTML =
      '<div class="cx-title">' + e.title + '</div>' +
      '<div class="cx-sub">' + e.sub + '</div>' +
      '<div class="cx-text">' + e.html + '</div>';
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
    w.fireMissile = function (actor, target) { return launch(actor, target, w); };
    w.radio = Radio;
    return w;
  }

  function launch(actor, target, w) {
    var wp = WEAPONS[actor.special];
    if (!wp) return false;

    /* ECM 吊舱 */
    if (wp.kind === 'ecm') {
      if (actor.spCd > 0) return false;
      actor.spActive = wp.duration;
      actor.spCd = wp.cd;
      SFX.laser();
      Radio.raw({ who: actor.isPlayer ? CALLSIGN.player : actor.name, cls: 'ally', tx: '<i>认知电子战吊舱开机 —— 敌方锁定距离 −40%</i>', gap: 0.6 });
      return true;
    }
    /* DEW 是自动系统，不能手动发射 */
    if (wp.kind === 'dew') return false;

    if (actor.spAmmo <= 0 || actor.spCd > 0) return false;

    /* 交战规则：阵列空域内禁止 20 kg 以上战斗部 */
    if (actor.isPlayer && w.roeBlocked &&
      (wp.kind === 'asm' || wp.kind === 'agm' || wp.kind === 'bomb')) {
      Radio.raw({ who: 'SEXTANT', cls: 'cmd', tx: '<b>交战规则限制 —— 该武器在阵列空域内被锁定。</b>', gap: 0.9 });
      return false;
    }
    if (!target && wp.target !== 'ground' && wp.target !== 'ship') return false;

    var n = wp.salvo || 1;
    for (var i = 0; i < n; i++) {
      var side = (i % 2) ? 1 : -1;
      var hp = M3.add(actor.pos, M3.add(M3.mul(actor.fwd, 4), M3.mul(actor.right, side * 2.6)));
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
    }
    actor.spAmmo -= 1;
    actor.spCd = wp.cd;
    if (actor.isPlayer) {
      w.shotsFired += n;
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
    var p = Ent.makeAircraft({
      type: ac.id, team: 0, isPlayer: true,
      x: 0, y: mission.altStart, z: 0,
      fwd: M3.V(0, 0, 1),
      speed: mission.speedStart,
      special: selectedSpecial
    });
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
        if (e.code === 'KeyC') { camMode = (camMode + 1) % 3; SFX.click(); }
        if (e.code === 'KeyM') toggleAimMode();
        if (e.code === 'KeyF' || e.code === 'Tab') cycleTarget();
        if (e.code === 'KeyR') cycleSpecial();
        if (e.code === 'KeyV') Ent.breakLock(player, world);
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
      player.throttle = M3.clamp(player.throttle - e.deltaY * 0.0006, 0, 1);
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

    // 优先选距离最近的几架飞机，避免把地面目标排在前
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
    var list = player.ac.specials;
    var at = list.indexOf(player.special);
    var next = list[(at + 1) % list.length];
    player.special = next;
    var w = WEAPONS[next];
    player.spAmmo = w.ammo;
    player.spCd = 0;
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

    // 传 player 自身作为锁存容器（提供 rollLock 字段）
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

    if (keys.ShiftLeft || keys.ShiftRight) player.throttle = Math.min(1, player.throttle + dt * 0.65);
    if (keys.ControlLeft || keys.ControlRight) player.throttle = Math.max(0, player.throttle - dt * 0.65);

    player.ab = !!keys.KeyX && player.throttle > 0.72;
    player.brake = !!keys.KeyZ;

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
      if (d > w.lockDist) continue;

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

  function bearing(from, to) {
    var dx = to.pos.x - from.x, dz = to.pos.z - from.z;
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

    if (camMode === 0) {
      // 追尾：不跟随滚转，地平线永远水平
      var off0 = M3.rotAxis(M3.mul(p.fwd, -S.camDist), M3.V(0, 1, 0), camYaw);
      var want = M3.add(p.pos, M3.add(off0, M3.V(0, S.camHeight + camPitch * 70, 0)));
      var k = 1 - Math.exp(-7.5 * dt);
      camPos = M3.lerpV(camPos, want, k);
      var look = M3.add(p.pos, M3.mul(p.fwd, S.camDist * 0.62));
      camFwd = M3.lerpV(camFwd, M3.norm(M3.sub(look, camPos)), 1 - Math.exp(-8.5 * dt));
      camFwd = M3.norm(camFwd);
      camUp = M3.V(0, 1, 0);
      Renderer.setCamera(camPos, camFwd, camUp, S.fov);
    } else if (camMode === 1) {
      // 座舱：跟随滚转
      var cp = M3.add(p.pos, M3.add(M3.mul(p.fwd, 3.4), M3.mul(p.up, 1.1)));
      Renderer.setCamera(cp, p.fwd, p.up, S.fov + 6);
    } else {
      // 目标视角：从侧上方看玩家与目标
      var t = p.target;
      if (t && t.alive) {
        var mid = M3.mul(M3.add(p.pos, t.pos), 0.5);
        var cp2 = M3.add(mid, M3.V(0, 90, 0));
        Renderer.setCamera(cp2, M3.norm(M3.sub(mid, cp2)), M3.V(0, 1, 0), 55);
      } else {
        var want2 = M3.add(p.pos, M3.add(M3.mul(p.fwd, -120), M3.V(0, 50, 0)));
        Renderer.setCamera(want2, M3.norm(M3.sub(p.pos, want2)), M3.V(0, 1, 0), S.fov);
      }
    }
  }

  /* ============================================================
     更新
     ============================================================ */
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

    // 导弹
    for (i = 0; i < world.missiles.length; i++) Ent.stepMissile(world.missiles[i], dt, world);
    // 子弹
    for (i = 0; i < world.bullets.length; i++) Ent.stepBullet(world.bullets[i], dt);

    resolveBullets(dt);
    updateTargets(dt);
    Ent.stepParticles(world.particles, dt);

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
      Renderer.pushModel(m2, a.pos, a.fwd, a.up, {});
    }
    // 导弹
    for (i = 0; i < world.missiles.length; i++) {
      var ms = world.missiles[i];
      if (!ms.alive) continue;
      var mm = MODELS[ms.model] || MODELS.missile;
      Renderer.pushModel(mm, ms.pos, ms.fwd, ms.up, {});
    }
    Renderer.flush();
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
    if (aimMode && player.alive && camMode !== 2) {
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
      '任务失败。下游的空情图仍然完整，第 7 号控制站仍在他们的签名下运行。';

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

    var core = ['M3', 'MODELS', 'CODEX', 'AIRCRAFT', 'WEAPONS', 'VOICES',
      'CALLSIGN', 'SFX', 'Renderer', 'Ent', 'AI', 'HUD', 'MISSIONS', 'Radio'];
    for (i = 0; i < core.length; i++) {
      if (typeof window[core[i]] === 'undefined') problems.push('核心模块 ' + core[i] + ' 未加载');
    }
    if (problems.length) { report(problems); return problems; }

    for (i = 0; i < AIRCRAFT.length; i++) {
      var ac = AIRCRAFT[i];
      if (!MODELS[ac.model]) problems.push('机型 ' + ac.id + ' 引用了不存在的模型 "' + ac.model + '"');
      if (!WEAPONS[ac.gun]) problems.push('机型 ' + ac.id + ' 引用了不存在的机炮 "' + ac.gun + '"');
      for (j = 0; j < ac.specials.length; j++) {
        if (!WEAPONS[ac.specials[j]]) {
          problems.push('机型 ' + ac.id + ' 引用了不存在的挂载 "' + ac.specials[j] + '"');
        }
      }
      if (ac.specials.indexOf(ac.defSpecial) < 0) {
        problems.push('机型 ' + ac.id + ' 的默认挂载不在可选列表里');
      }
      if (!ac.phys || !ac.phys.vMax) problems.push('机型 ' + ac.id + ' 缺少飞行性能参数');
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
  function init() {
    preflight();

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
    selectedSpecial = AIRCRAFT[selectedAC].defSpecial;

    // 鼠标瞄准：初始把瞄准点放在屏幕中心
    mouse.x = window.innerWidth / 2;
    mouse.y = window.innerHeight / 2;
    cv.style.cursor = aimMode ? 'none' : 'default';

    show('title');
    requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });
  }

  return { init: init, startMission: startMission };
})();

window.addEventListener('load', function () { Game.init(); });
