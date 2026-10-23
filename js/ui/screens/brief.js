(function (Game) {
  'use strict';
  var $ = Game.$;
  $.campaignOf = campaignOf; $.buildCampaignList = buildCampaignList; $.buildBrief = buildBrief;

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
      if ($.cleared[MISSIONS[ms[i]].id]) done++;
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
          html += T('ui.screens.brief.buildCampaignList.s1');
        }
        html +=
          '<div class="cc-foot">' +
            '<span>' + (c.loc || '') + '</span>' +
            '<span class="cc-prog">' +
              (locked
                ? T('ui.screens.brief.buildCampaignList.s2')
                : T('ui.screens.brief.buildCampaignList.s3') + pg.done + '</b> / ' + pg.total) +
            '</span>' +
          '</div>';
        if (!locked && c.period) {
          html += '<div class="cc-per">' + c.period + '</div>';
        }
        d.innerHTML = html;

        if (!locked) {
          d.addEventListener('click', function () {
            $.activeCampaign = ci;
            /* 进入战役时把当前关卡移到这个战役里：
               记住上次打到哪一关很体贴，但跨战役时那个下标是无效的 ——
               夹回本战役第一关最省事，也不会让人看到别人的简报。 */
            if (c.missions.indexOf($.missionIdx) < 0) $.missionIdx = c.missions[0];
            SFX.unlock(); SFX.click();
            buildBrief(); $.show('brief');
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
    var ms = CAMPAIGNS[$.activeCampaign].missions;
    for (var i = 0; i < ms.length; i++) {
      (function (idx, pos) {
        var mm = MISSIONS[idx];
        var d = document.createElement('div');
        d.className = 'msn-item' + (idx === $.missionIdx ? ' sel' : '');
        /* 序号按战役内的位置重新编。关卡自身的 m.no 是全局编号
           （新战役的关会是 04、05…），用它当战役内的序号会跳号。 */
        var no = 'OPERATION ' + ('0' + (pos + 1)).slice(-2);
        d.innerHTML = '<div class="no">' + no + '</div>' +
          '<div class="nm">' + mm.name + '</div>' +
          '<div class="st' + ($.cleared[mm.id] ? ' done' : '') + '">' +
          ($.cleared[mm.id] ? T('ui.screens.brief.buildMissionList.innerHTML.s1') : mm.en) + '</div>';
        d.addEventListener('click', function () {
          if (idx === $.missionIdx) return;
          $.missionIdx = idx;
          SFX.unlock(); SFX.click();
          buildBrief();
        });
        list.appendChild(d);
      })(ms[i], i);
    }
  }

  function buildBrief() {
    var m = MISSIONS[$.missionIdx];
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
    /* 地图**北朝上**。任务里的标记写的是世界坐标（与 spawn 用的同一套数），
       这里按 mission.axis（世界 +z 的真方位）旋转成 东/北 再画：
         E = x·cosθ + z·sinθ，N = −x·sinθ + z·cosθ
       比例尺按全部标记自动取景，x / N 用同一个缩放，不再压扁。
       type 'start' 的那一个是玩家进入点，画成箭头，dir 是它的世界航向（默认 +z）。 */
    var th = (m.axis || 0) * Math.PI / 180;
    var ct = Math.cos(th), st = Math.sin(th);
    function EN(p) { return { e: p.x * ct + p.z * st, n: -p.x * st + p.z * ct }; }
    var e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    for (i = 0; i < m.map.length; i++) {
      var q = EN(m.map[i]);
      e0 = Math.min(e0, q.e); e1 = Math.max(e1, q.e);
      n0 = Math.min(n0, q.n); n1 = Math.max(n1, q.n);
    }
    var padX = 70, padY = 26;
    var span = Math.max((e1 - e0) / (W - padX * 2 - 60), (n1 - n0) / (H - padY * 2), 1);
    var ecx = (e0 + e1) / 2, ncy = (n0 + n1) / 2;
    function SX(q) { return W / 2 + (q.e - ecx) / span; }
    function SY(q) { return H / 2 - (q.n - ncy) / span; }

    /* 这里不再画陆地。

       整个战役都发生在**纯海域**上：战斗画面里没有任何地形，
       所有"地面"目标其实都是海上平台。在简报地图上画岛，
       等于承诺了一片战场上根本不存在的地形 —— 玩家飞到那儿
       会发现海面上什么都没有。地图只画海面与任务标记，
       反而和实际看到的东西一致。 */

    var cols = { base: '#4fe08a', start: '#4fe08a', enemy: '#ff4d4d', relay: '#ffb03a', sam: '#ff8b2a', site: '#45d6ff' };

    for (i = 0; i < m.map.length; i++) {
      var p = m.map[i];
      var qq = EN(p);
      var x = SX(qq);
      var y = SY(qq);
      var col = cols[p.type] || '#8fa3b2';
      g.strokeStyle = col; g.lineWidth = 1.6;
      g.beginPath();
      if (p.type === 'start') {
        // 玩家进入箭头：方向 = 世界航向 dir（度，0 = +z）旋到真方位
        var hd = ((p.dir || 0) + (m.axis || 0)) * Math.PI / 180;
        var ux = Math.sin(hd), uy = -Math.cos(hd);
        g.lineWidth = 2;
        g.moveTo(x - ux * 16, y - uy * 16); g.lineTo(x + ux * 12, y + uy * 12);
        g.moveTo(x + ux * 12, y + uy * 12); g.lineTo(x + ux * 4 - uy * 5, y + uy * 4 + ux * 5);
        g.moveTo(x + ux * 12, y + uy * 12); g.lineTo(x + ux * 4 + uy * 5, y + uy * 4 - ux * 5);
        g.stroke();
      } else if (p.type === 'enemy') {
        g.moveTo(x, y - 6); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.closePath();
        g.stroke();
      } else {
        g.rect(x - 4, y - 4, 8, 8); g.stroke();
      }
      g.fillStyle = col;
      g.font = '10px Consolas,monospace';
      g.fillText(p.label, x + 8, y + 3);
    }

    g.fillStyle = 'rgba(143,163,178,0.75)';
    g.font = '10px Consolas,monospace';
    g.fillText('N ↑', 8, 16);
    // 比例尺：10 km 一段
    var sl = 10000 / span;
    g.strokeStyle = 'rgba(143,163,178,0.75)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(8, H - 14); g.lineTo(8, H - 10); g.lineTo(8 + sl, H - 10); g.lineTo(8 + sl, H - 14); g.stroke();
    g.fillText('10 km', 12 + sl, H - 8);
  }
})(Game);
