(function (Game) {
  'use strict';
  var $ = Game.$;
  $.loadSettings = loadSettings; $.applyAudioSettings = applyAudioSettings; $.applyRenderMode = applyRenderMode; $.buildSettingsInto = buildSettingsInto; $.resetSettings = resetSettings; $.buildHelpHTML = buildHelpHTML;

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
    camDist: 10,
    camHeight: 8,
    hudOpacity: 100,
    hudScale: 100,
    compass: true,
    pitchLadder: true,
    targetMarkers: true,
    // 0 = 追尾，1 = 座舱，2 = 目标。只能在这里改，没有热切换键。
    camMode: 0,
    // 追尾镜头飞机快出画时怎么办：0 = 静态拉远，1 = 侧滑软钳，2 = 拉远带滞回
    camFrame: 0,
    // 模型渲染：0 = 自动（有 WebGL2 就用），1 = 兼容（2D 画家算法）。见 render.js 的 setMode
    renderMode: 0,
    // 画面（只影响 WebGL）：0 = 标准（关软粒子），1 = 高
    gfxQuality: 1
  };

  $.S = {};

  var SET_GROUPS = [
    {
      title: T('ui.screens.settings.SET_GROUPS.i0.title'),
      hint: T('ui.screens.settings.SET_GROUPS.i0.hint'),
      items: [
        { k: 'volMaster', label: T('ui.screens.settings.SET_GROUPS.i0.items.i0.label'), type: 'range', min: 0, max: 100, unit: '%' },
        { k: 'volEngine', label: T('ui.screens.settings.SET_GROUPS.i0.items.i1.label'), type: 'range', min: 0, max: 100, unit: '%' },
        { k: 'volSfx', label: T('ui.screens.settings.SET_GROUPS.i0.items.i2.label'), type: 'range', min: 0, max: 100, unit: '%' },
        { k: 'muted', label: T('ui.screens.settings.SET_GROUPS.i0.items.i3.label'), type: 'toggle' }
      ]
    },
    {
      title: T('ui.screens.settings.SET_GROUPS.i1.title'),
      hint: T('ui.screens.settings.SET_GROUPS.i1.hint'),
      items: [
        /* 机位选项暂时隐藏：座舱 / 目标视角问题太多，只开放追尾。
           相机代码保留，修好后把这一项加回来、去掉 loadSettings 里的强制归零即可。 */
        { k: 'fov', label: T('ui.screens.settings.SET_GROUPS.i1.items.i0.label'), type: 'range', min: 38, max: 100, unit: '°' },
        { k: 'camDist', label: T('ui.screens.settings.SET_GROUPS.i1.items.i1.label'), type: 'range', min: 2, max: 10, unit: ' m' },
        { k: 'camHeight', label: T('ui.screens.settings.SET_GROUPS.i1.items.i2.label'), type: 'range', min: -15, max: 10, unit: ' m' }
        /* 出画处理选项暂时隐藏，只用"静态拉远"（camFrame = 0）。侧滑软钳 / 拉远带滞回
           的代码保留（updateCamera 里 camFrame 1 / 2 两支），要放出来时把下面这项加回来、
           去掉 loadSettings 里的强制归零即可：
           { k: 'camFrame', label: '出画处理', type: 'select', options: [
             { v: 0, t: '静态拉远' }, { v: 1, t: '侧滑软钳' }, { v: 2, t: '拉远带滞回' }
           ] } */
      ]
    },
    {
      title: T('ui.screens.settings.SET_GROUPS.i2.title'),
      items: [
        { k: 'hudScale', label: T('ui.screens.settings.SET_GROUPS.i2.items.i0.label'), type: 'range', min: 70, max: 160, unit: '%' },
        { k: 'hudOpacity', label: T('ui.screens.settings.SET_GROUPS.i2.items.i1.label'), type: 'range', min: 25, max: 100, unit: '%' },
        { k: 'compass', label: T('ui.screens.settings.SET_GROUPS.i2.items.i2.label'), type: 'toggle' },
        { k: 'pitchLadder', label: T('ui.screens.settings.SET_GROUPS.i2.items.i3.label'), type: 'toggle' },
        { k: 'targetMarkers', label: T('ui.screens.settings.SET_GROUPS.i2.items.i4.label'), type: 'toggle' },
        /* 兼容模式给拿不到 WebGL2 的老显卡 / 远程桌面用：遮挡会按"每个面的平均深度"排，
           翼下挂弹偶尔会透到机翼上面。 */
        { k: 'renderMode', label: T('ui.screens.settings.SET_GROUPS.i2.items.i5.label'), type: 'select', options: [
          { v: 0, t: T('ui.screens.settings.SET_GROUPS.i2.items.i5.options.i0.t') }, { v: 1, t: T('ui.screens.settings.SET_GROUPS.i2.items.i5.options.i1.t') }
        ] },
        /* 集成显卡掉帧时选"标准"。兼容（2D）模式下这项不起作用。 */
        { k: 'gfxQuality', label: T('ui.screens.settings.SET_GROUPS.i2.items.i6.label'), type: 'select', options: [
          { v: 0, t: T('ui.screens.settings.SET_GROUPS.i2.items.i6.options.i0.t') }, { v: 1, t: T('ui.screens.settings.SET_GROUPS.i2.items.i6.options.i1.t') }
        ] }
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
    o.camMode = 0;     // 只开放追尾机位 —— 旧存档里选过座舱 / 目标的也拉回来
    // 旧存档可能超出新范围（距离曾经到 30、高度到 60）
    o.camDist = Math.min(10, Math.max(2, +o.camDist || DEFAULTS.camDist));
    o.camHeight = isFinite(+o.camHeight) ? Math.min(10, Math.max(-15, +o.camHeight)) : DEFAULTS.camHeight;
    o.camFrame = 0;    // 出画处理只开放"静态拉远" —— 旧存档里选过另外两种的也拉回来
    return o;
  }

  function saveSettings() {
    try { window.localStorage.setItem(SET_KEY, JSON.stringify($.S)); } catch (e) {}
  }

  function applyAudioSettings() {
    if (typeof SFX.setVolumes !== 'function') return;
    SFX.setVolumes($.S.volMaster / 100, $.S.volEngine / 100, $.S.volSfx / 100);
    SFX.setMuted(!!$.S.muted);
  }

  function onSettingChanged(key) {
    saveSettings();
    if (key === 'volMaster' || key === 'volEngine' || key === 'volSfx' || key === 'muted') {
      applyAudioSettings();
    }
    if (key === 'renderMode' || key === 'gfxQuality') applyRenderMode();
    // 视角与显示类不需要额外动作：渲染每帧直接读 S
  }

  function applyRenderMode() {
    if (Renderer.setMode) Renderer.setMode($.S.renderMode === 1 ? '2d' : 'auto');
    if (Renderer.setQuality) Renderer.setQuality($.S.gfxQuality === 0 ? 0 : 1);
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
        if ($.S[item.k] === item.options[oi].v) op.selected = true;
        sel.appendChild(op);
      }
      sel.addEventListener('change', function () {
        $.S[item.k] = parseInt(sel.value, 10);
        onSettingChanged(item.k);
      });
      row.appendChild(sel);
      row.appendChild(document.createElement('span'));
    } else if (item.type === 'range') {
      var inp = document.createElement('input');
      inp.type = 'range';
      inp.min = item.min; inp.max = item.max; inp.step = item.step || 1;
      inp.value = $.S[item.k];

      var val = document.createElement('span');
      val.className = 'set-val';
      val.textContent = inp.value + (item.unit || '');

      inp.addEventListener('input', function () {
        $.S[item.k] = parseFloat(inp.value);
        val.textContent = inp.value + (item.unit || '');
        onSettingChanged(item.k);
      });

      row.appendChild(inp);
      row.appendChild(val);
    } else {
      var btn = document.createElement('button');
      btn.className = 'set-toggle' + ($.S[item.k] ? ' on' : '');
      btn.textContent = $.S[item.k] ? T('ui.screens.settings.makeSetRow.textContent.s1') : T('ui.screens.settings.makeSetRow.textContent.s2');
      btn.addEventListener('click', function () {
        $.S[item.k] = !$.S[item.k];
        btn.className = 'set-toggle' + ($.S[item.k] ? ' on' : '');
        btn.textContent = $.S[item.k] ? T('ui.screens.settings.makeSetRow.textContent.s3') : T('ui.screens.settings.makeSetRow.textContent.s4');
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
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) $.S[k] = DEFAULTS[k];
    saveSettings();
    applyAudioSettings();
    buildSettingsInto(document.getElementById('setWrap'));
    buildSettingsInto(document.getElementById('pauseSettings'));
  }

  /* ---------- 操作说明（独立页与暂停菜单共用同一份内容） ---------- */
  var KEYMAP = [
    [T('ui.screens.settings.KEYMAP.i0.i0.s1'), T('ui.screens.settings.KEYMAP.i0.i1.s1')],
    [T('ui.screens.settings.KEYMAP.i1.i0.s1'), T('ui.screens.settings.KEYMAP.i1.i1.s1')],
    ['M', T('ui.screens.settings.KEYMAP.i2.i1.s1')],
    ['W / S', T('ui.screens.settings.KEYMAP.i3.i1.s1')],
    ['A / D', T('ui.screens.settings.KEYMAP.i4.i1.s1')],
    ['Q / E', T('ui.screens.settings.KEYMAP.i5.i1.s1')],
    ['Shift / Ctrl', T('ui.screens.settings.KEYMAP.i6.i1.s1')],
    [T('ui.screens.settings.KEYMAP.i7.i0.s1'), T('ui.screens.settings.KEYMAP.i7.i1.s1')],
    ['↑ ↓ ← →', T('ui.screens.settings.KEYMAP.i8.i1.s1')],
    [T('ui.screens.settings.KEYMAP.i9.i0.s1'), T('ui.screens.settings.KEYMAP.i9.i1.s1')],
    [T('ui.screens.settings.KEYMAP.i10.i0.s1'), T('ui.screens.settings.KEYMAP.i10.i1.s1')],
    ['F / Tab', T('ui.screens.settings.KEYMAP.i11.i1.s1')],
    ['R', T('ui.screens.settings.KEYMAP.i12.i1.s1')],
    ['V', T('ui.screens.settings.KEYMAP.i13.i1.s1')],
    ['1 / 2 / 3', T('ui.screens.settings.KEYMAP.i14.i1.s1')],
    ['N', T('ui.screens.settings.KEYMAP.i15.i1.s1')],
    ['G', T('ui.screens.settings.KEYMAP.i16.i1.s1')],
    ['H / Esc', T('ui.screens.settings.KEYMAP.i17.i1.s1')]
  ];

  var TIPS = [
    T('ui.screens.settings.TIPS.i0.s1'),
    T('ui.screens.settings.TIPS.i1.s1'),
    T('ui.screens.settings.TIPS.i2.s1'),
    T('ui.screens.settings.TIPS.i3.s1'),
    T('ui.screens.settings.TIPS.i4.s1'),
    T('ui.screens.settings.TIPS.i5.s1')
  ];

  /* 实战指南：图标是按 HUD 上的真实样子画的（颜色、虚实、位置与游戏内一致）。
     HELP_ICONS 的 viewBox 统一是 0 0 56 44；没有 icon 的条目只写文字。 */
  var HELP_ICONS = (function () {
    var AMB = '#ffb03a', RD = '#ff4d4d', CYN = '#45d6ff', PALE = '#cfe0ec', GRY = 'rgba(150,170,180,0.55)';
    function hbr(x0, y0, x1, y1, c, col, sw) {
      return '<path d="M' + x0 + ' ' + (y0 + c) + 'V' + y0 + 'H' + (x0 + c) +
        'M' + (x1 - c) + ' ' + y0 + 'H' + x1 + 'V' + (y0 + c) +
        'M' + x1 + ' ' + (y1 - c) + 'V' + y1 + 'H' + (x1 - c) +
        'M' + (x0 + c) + ' ' + y1 + 'H' + x0 + 'V' + (y1 - c) +
        '" fill="none" stroke="' + col + '" stroke-width="' + (sw || 2) + '"/>';
    }
    function txt(s, col, y) {
      return '<text x="28" y="' + (y || 40) + '" text-anchor="middle" font-family="Consolas,monospace" font-weight="bold" font-size="8" fill="' + col + '">' + s + '</text>';
    }
    function key(k) {
      return '<rect x="19" y="8" width="18" height="16" rx="3" fill="#101a23" stroke="#2a3d4c" stroke-width="1.2"/>' +
        '<text x="28" y="20" text-anchor="middle" font-family="Consolas,monospace" font-weight="bold" font-size="10" fill="' + PALE + '">' + k + '</text>';
    }
    return {
      /* 锁定环：实线 = 在锁，进度往前走 */
      lockRing: '<circle cx="28" cy="20" r="15" fill="none" stroke="' + AMB + '" stroke-width="2.4" stroke-dasharray="70 24" transform="rotate(-90 28 20)"/>' + hbr(20, 12, 36, 28, 5, AMB),
      /* 锁定环：虚线 = 锁不上，进度往回掉 */
      lockDash: '<circle cx="28" cy="20" r="15" fill="none" stroke="rgba(255,176,58,0.45)" stroke-width="2" stroke-dasharray="4 4"/>' + hbr(20, 12, 36, 28, 5, 'rgba(255,176,58,0.45)'),
      /* LOCK：双层角框 + 字 */
      lockDouble: hbr(19, 11, 37, 29, 5, AMB, 2) + hbr(23, 15, 33, 25, 3, AMB, 1.4) + txt('LOCK', AMB),
      /* 框下无字：淡橙框 */
      rngNone: hbr(20, 12, 36, 28, 5, 'rgba(255,176,58,0.45)'),
      rngIn: hbr(20, 12, 36, 28, 5, AMB) + txt('IN RNG', AMB),
      rngNez: hbr(20, 12, 36, 28, 5, RD, 2.4) + txt('NEZ', RD),
      /* 武器视场：三态并排（灰虚 / 橙虚 / 红实） */
      cone: '<circle cx="11" cy="20" r="6" fill="none" stroke="' + GRY + '" stroke-width="1.3" stroke-dasharray="3 3"/>' +
        '<circle cx="28" cy="20" r="6" fill="none" stroke="rgba(255,176,58,0.45)" stroke-width="1.3" stroke-dasharray="3 3"/>' +
        '<circle cx="45" cy="20" r="6" fill="none" stroke="' + RD + '" stroke-width="1.6"/>',
      /* 机炮预测圈：实线 = 射程内，虚线 = 射程外 */
      gunSolid: '<circle cx="28" cy="20" r="9" fill="none" stroke="rgba(255,228,150,0.8)" stroke-width="1.4"/><circle cx="28" cy="20" r="1.6" fill="rgba(255,244,200,0.95)"/>',
      gunDash: '<circle cx="28" cy="20" r="9" fill="none" stroke="rgba(255,228,150,0.55)" stroke-width="1.4" stroke-dasharray="3 4"/><circle cx="28" cy="20" r="1.6" fill="rgba(255,244,200,0.55)"/>',
      /* 告警字样 */
      spike: '<rect x="6" y="12" width="44" height="18" rx="3" fill="none" stroke="' + AMB + '" stroke-width="1.2"/>' + txt('SPIKE', AMB, 25),
      missile: '<rect x="4" y="12" width="48" height="18" rx="3" fill="none" stroke="' + RD + '" stroke-width="1.2"/>' + txt('MISSILE', RD, 25),
      /* RWR 环：琥珀环 + 红点（近）+ 琥珀点（远） */
      rwr: '<circle cx="28" cy="20" r="16" fill="none" stroke="rgba(255,176,58,0.35)" stroke-width="1"/>' +
        '<circle cx="28" cy="20" r="8.8" fill="none" stroke="rgba(255,176,58,0.25)" stroke-width="1"/>' +
        '<circle cx="36" cy="10" r="3.2" fill="none" stroke="' + RD + '" stroke-width="2"/>' +
        '<circle cx="15" cy="27" r="2.4" fill="' + AMB + '"/>',
      /* 按键 + 热焰火花 */
      flare: key('V') + '<circle cx="38" cy="12" r="2.2" fill="#ff9a3c"/><circle cx="44" cy="22" r="2.6" fill="#ffcf5c"/><circle cx="36" cy="32" r="2" fill="#ff9a3c"/><circle cx="48" cy="34" r="1.4" fill="' + PALE + '"/>',
      keyN: key('N'),
      keyG: key('G'),
      /* 3/9 线：飞机俯视 + 正横的导弹 */
      beam: '<path d="M14 6 L20 22 L14 19 L8 22 Z" fill="' + PALE + '"/>' +
        '<path d="M28 14 L52 14" stroke="' + RD + '" stroke-width="1.6" stroke-dasharray="3 3"/>' +
        '<path d="M42 14 L50 14 M47 11 L50 14 L47 17" fill="none" stroke="' + RD + '" stroke-width="1.6"/>' +
        '<path d="M14 22 Q28 30 40 22" fill="none" stroke="' + CYN + '" stroke-width="1" stroke-dasharray="2 2"/>',
      /* CIWS：圆 + 四向短线 */
      ciws: '<circle cx="28" cy="20" r="11" fill="none" stroke="' + AMB + '" stroke-width="1.2"/>' +
        '<path d="M28 12 V16 M28 24 V28 M20 20 H24 M32 20 H36" stroke="' + AMB + '" stroke-width="1.4"/>',
      /* 低空：地形轮廓（雷达看不见） */
      lowAlt: '<path d="M6 36 L20 18 L28 28 L34 22 L50 36 Z" fill="none" stroke="' + GRY + '" stroke-width="1.4"/>'
    };
  })();

  var GUIDE = [
    {
      title: T('ui.screens.settings.GUIDE.i0.title'),
      lead: T('ui.screens.settings.GUIDE.i0.lead'),
      items: [
        { icon: 'lockRing', name: T('ui.screens.settings.GUIDE.i0.items.i0.name'), text: T('ui.screens.settings.GUIDE.i0.items.i0.text') },
        { icon: 'lockDash', name: T('ui.screens.settings.GUIDE.i0.items.i1.name'), text: T('ui.screens.settings.GUIDE.i0.items.i1.text') },
        { icon: 'lockDouble', name: 'LOCK', text: T('ui.screens.settings.GUIDE.i0.items.i2.text') },
        { icon: 'rngNone', name: T('ui.screens.settings.GUIDE.i0.items.i3.name'), text: T('ui.screens.settings.GUIDE.i0.items.i3.text') },
        { icon: 'rngIn', name: 'IN RNG', text: T('ui.screens.settings.GUIDE.i0.items.i4.text') },
        { icon: 'rngNez', name: 'NEZ', text: T('ui.screens.settings.GUIDE.i0.items.i5.text') },
        { icon: 'cone', name: T('ui.screens.settings.GUIDE.i0.items.i6.name'), text: T('ui.screens.settings.GUIDE.i0.items.i6.text') },
        { icon: 'gunSolid', name: T('ui.screens.settings.GUIDE.i0.items.i7.name'), text: T('ui.screens.settings.GUIDE.i0.items.i7.text') },
        { icon: 'gunDash', name: T('ui.screens.settings.GUIDE.i0.items.i8.name'), text: T('ui.screens.settings.GUIDE.i0.items.i8.text') }
      ]
    },
    {
      title: T('ui.screens.settings.GUIDE.i1.title'),
      lead: T('ui.screens.settings.GUIDE.i1.lead'),
      items: [
        { icon: 'spike', name: 'SPIKE', text: T('ui.screens.settings.GUIDE.i1.items.i0.text') },
        { icon: 'rwr', name: T('ui.screens.settings.GUIDE.i1.items.i1.name'), text: T('ui.screens.settings.GUIDE.i1.items.i1.text') },
        { icon: 'keyN', name: T('ui.screens.settings.GUIDE.i1.items.i2.name'), text: T('ui.screens.settings.GUIDE.i1.items.i2.text') },
        { icon: 'lowAlt', name: T('ui.screens.settings.GUIDE.i1.items.i3.name'), text: T('ui.screens.settings.GUIDE.i1.items.i3.text') },
        { name: T('ui.screens.settings.GUIDE.i1.items.i4.name'), text: T('ui.screens.settings.GUIDE.i1.items.i4.text') }
      ]
    },
    {
      title: T('ui.screens.settings.GUIDE.i2.title'),
      lead: T('ui.screens.settings.GUIDE.i2.lead'),
      items: [
        { icon: 'missile', name: 'MISSILE', text: T('ui.screens.settings.GUIDE.i2.items.i0.text') },
        { icon: 'flare', name: T('ui.screens.settings.GUIDE.i2.items.i1.name'), text: T('ui.screens.settings.GUIDE.i2.items.i1.text') },
        { icon: 'beam', name: T('ui.screens.settings.GUIDE.i2.items.i2.name'), text: T('ui.screens.settings.GUIDE.i2.items.i2.text') },
        { name: T('ui.screens.settings.GUIDE.i2.items.i3.name'), text: T('ui.screens.settings.GUIDE.i2.items.i3.text') },
        { icon: 'keyG', name: T('ui.screens.settings.GUIDE.i2.items.i4.name'), text: T('ui.screens.settings.GUIDE.i2.items.i4.text') }
      ]
    },
    {
      title: T('ui.screens.settings.GUIDE.i3.title'),
      lead: T('ui.screens.settings.GUIDE.i3.lead'),
      items: [
        { icon: 'spike', name: T('ui.screens.settings.GUIDE.i3.items.i0.name'), text: T('ui.screens.settings.GUIDE.i3.items.i0.text') },
        { name: T('ui.screens.settings.GUIDE.i3.items.i1.name'), text: T('ui.screens.settings.GUIDE.i3.items.i1.text') },
        { icon: 'ciws', name: T('ui.screens.settings.GUIDE.i3.items.i2.name'), text: T('ui.screens.settings.GUIDE.i3.items.i2.text') },
        { name: T('ui.screens.settings.GUIDE.i3.items.i3.name'), text: T('ui.screens.settings.GUIDE.i3.items.i3.text') }
      ]
    }
  ];

  /** 实战指南的 HTML。forPause=true 用于暂停菜单（单栏、图标缩小） */
  function buildGuideHTML(forPause) {
    var out = '', i, j, s, it;
    for (i = 0; i < GUIDE.length; i++) {
      s = GUIDE[i];
      out += '<div class="gd-sec">' +
        (forPause ? '<h4>' + s.title + '</h4>' : '<h3 class="gd-h">' + s.title + '</h3>') +
        (s.lead ? '<p class="khelp">' + s.lead + '</p>' : '') +
        '<div class="gd-grid">';
      for (j = 0; j < s.items.length; j++) {
        it = s.items[j];
        out += '<div class="gd-card">' +
          (it.icon ? '<div class="gd-ico"><svg viewBox="0 0 56 44" aria-hidden="true">' + HELP_ICONS[it.icon] + '</svg></div>' : '') +
          '<div class="gd-txt"><b>' + it.name + '</b>' + it.text + '</div></div>';
      }
      out += '</div></div>';
    }
    return out;
  }

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
      return T('ui.screens.settings.buildHelpHTML.s1') + rows + '</table>' +
        T('ui.screens.settings.buildHelpHTML.s2') + tips + '</ul>' +
        T('ui.screens.settings.buildHelpHTML.s3') + buildGuideHTML(true);
    }
    return T('ui.screens.settings.buildHelpHTML.s4') + rows + '</table></div>' +
      T('ui.screens.settings.buildHelpHTML.s5') + tips + '</ul></div>' +
      T('ui.screens.settings.buildHelpHTML.s6') + buildGuideHTML(false) + '</div>';
  }
})(Game);
