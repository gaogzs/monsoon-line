(function (Game) {
  'use strict';
  var $ = Game.$;
  $.combatEvents = combatEvents; $.killCredit = killCredit; $.finish = finish;

  /* 消化 world.events：HIT / INTERCEPTED 提示，我方舰船替玩家拦下导弹的无线电 */
  function combatEvents(killedNow) {
    var ev = $.world.events, hit = false;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'hit') hit = true;
      else if (e.type === 'wingflare') {
        // 僚机替长机撒干扰弹：8 s 内同一架只报一次
        var fk = e.unit + 'flareT';
        if ($.world.time - ($.world.flags2[fk] || -99) > 8) {
          $.world.flags2[fk] = $.world.time;
          Radio.raw({ who: e.unit, cls: 'ally', tx: T('engine.game.finish.combatEvents.tx'), gap: 0.4 });
        }
      } else if (e.type === 'intercept') {
        var m = e.m;
        if (m.owner && m.owner.isPlayer) {
          $.hits.push({ txt: 'INTERCEPTED', t: 1.1, col: HUD.AMBER });
        } else if (e.host && e.host.team === $.player.team && m.team !== $.player.team &&
                   $.world.time - $.world.flags2.icptRadioT > 8) {
          // 我方舰船拦下来袭弹：8 s 内只报一次，免得齐射时刷屏
          $.world.flags2.icptRadioT = $.world.time;
          Radio.raw({ who: e.host.label || T('engine.game.finish.combatEvents.who.s1'), cls: 'ally', tx: T('engine.game.finish.combatEvents.tx_2'), gap: 0.4 });
        }
      }
    }
    if (hit && !killedNow) $.hits.push({ txt: 'HIT', t: 0.8, col: HUD.AMBER });
    ev.length = 0;
  }

  /* 友军损失（4.11）：任务指定要保护的单位（w.guarded / w.baseTarget）权重最大 ——
       被摧毁每个 −4000，没摧毁按受损比例最多 −2500；
     其他友军（僚机、我方舰船 / 设施）损失每个 −800。
     被保护单位有损失时拿不到 S（见 finish）。 */
  function friendlyLosses() {
    var prot = ($.world.guarded || []).slice();
    if ($.world.baseTarget && prot.indexOf($.world.baseTarget) < 0) prot.push($.world.baseTarget);
    var lost = 0, dmg = 0, other = 0, i;
    for (i = 0; i < prot.length; i++) {
      var p = prot[i];
      if (!p) continue;
      if (!p.alive) lost++;
      else if (p.maxHp) dmg += 1 - Math.max(0, p.hp) / p.maxHp;
    }
    for (i = 0; i < $.world.targets.length; i++) {
      var t = $.world.targets[i];
      if (t.team === 0 && !t.alive && prot.indexOf(t) < 0 && !t.friendlyAsset) other++;
    }
    for (i = 0; i < $.world.actors.length; i++) {
      var a = $.world.actors[i];
      if (a.team === 0 && !a.isPlayer && !a.alive && !a.escaped) other++;
    }
    var dmgP = Math.round(Math.min(1, dmg) * 2500);
    var txt = prot.length
      ? T('engine.game.finish.friendlyLosses.txt.s1') + lost + T('engine.game.finish.friendlyLosses.txt.s2') + Math.round(dmg / Math.max(1, prot.length - lost || 1) * 100) + '%' + T('engine.game.finish.friendlyLosses.txt.s3') + other
      : (other ? T('engine.game.finish.friendlyLosses.txt.s4') + other : '—');
    return { lost: lost, other: other, penalty: lost * 4000 + dmgP + other * 800, txt: txt };
  }

  /* 一架敌机算谁的。没有记录击杀者的（自己失速撞海、被逼进海面）
     算玩家的 —— 这和以前"所有敌机阵亡都算玩家"的口径一致。 */
  function killCredit(a) {
    if (a.escaped) return 'none';   // 飞完航线离场（ai.js updateRoute），没被打下来
    var kb = a.killedBy;
    if (!kb || kb.isPlayer) return 'player';
    if (kb.kind === 'target') return kb.team === 0 ? 'ship' : 'other';
    if (kb.tags && kb.tags.unmanned && kb.team === 0) return 'player';   // 玩家的无人僚机：记入玩家战果
    if (kb.team === 0) return 'wing';
    return 'other';             // 敌方误伤自己人：谁的功也不算
  }

  /* ============================================================
     结算
     ============================================================ */
  function finish(win) {
    if (win) $.cleared[MISSIONS[$.missionIdx].id] = true;
    SFX.silence();
    $.state = 'debrief';
    SFX[win ? 'fanfare' : 'fail']();

    /* 机炮精度 = 机炮命中发数 / 机炮射出发数。以前分母是 shotsFired
       （导弹 / 特种武器的发射次数），分子却是子弹命中数 —— 一场只打
       两枚导弹、机炮命中三十发的任务会算出 1500%，还连带把综合评定撑大。 */
    var acc = $.world.gunRounds > 0 ? Math.min(1, $.world.gunHits / $.world.gunRounds) : 0;
    var hull = $.player.alive ? $.player.hp / $.player.maxHp : 0;
    var penalty = ($.world.friendlyLoss || 0);
    /* 地面/海面目标单独计分，权重低于一架飞机（1000）—— 否则"打设施"
       会变成比空战更划算的刷分方式，而这类目标既不会还手也不会跑。 */
    var gk = $.world.groundKilled || 0;
    var loss = friendlyLosses();
    var score = $.world.killed * 1000 + gk * 400 + Math.round(acc * 3000)
      + Math.round(hull * 2000) + (win ? 4000 : 0) - penalty * 2500 - loss.penalty;

    var rank = 'D';
    if (!win) rank = 'F';
    else if (score >= 16000 && penalty === 0 && loss.lost === 0) rank = 'S';
    else if (score >= 11000) rank = 'A';
    else if (score >= 7000) rank = 'B';
    else rank = 'C';

    var rk = document.getElementById('dRank');
    rk.textContent = rank;
    rk.className = 'rank' + (rank === 'S' ? ' s' : (rank === 'A' ? ' a' : (rank === 'F' ? ' f' : '')));

    document.getElementById('dTitle').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    document.getElementById('dSub').textContent = $.mission.no + '  ' + $.mission.name + '  //  ' + $.mission.en;
    document.getElementById('dCallsign').textContent = CALLSIGN.player;

    var rows = [
      [T('engine.game.finish.finish.rows.i0.i0.s1'), $.world.killed],
      /* 友军战果：只展示，不进上面的 score。 */
      [T('engine.game.finish.finish.rows.i1.i0.s1'), ($.world.wingKilled || 0) + ($.world.shipKilled || 0)],
      [T('engine.game.finish.finish.rows.i2.i0.s1'), gk],
      [T('engine.game.finish.finish.rows.i3.i0.s1'), $.world.gunRounds + ' / ' + $.world.gunHits],
      /* 只算机炮：gunHits / gunRounds 都只数子弹，导弹和无制导弹不记。
         所以这一栏写"命中率"会让一场反舰任务的读数看起来很差 ——
         叫"机炮精度"说的才是它真正测的东西。 */
      [T('engine.game.finish.finish.rows.i4.i0.s1'), (acc * 100).toFixed(0) + '%'],
      [T('engine.game.finish.finish.rows.i5.i0.s1'), $.player.alive ? (hull * 100).toFixed(0) + '%' : '—'],
      [T('engine.game.finish.finish.rows.i6.i0.s1'), penalty],
      [T('engine.game.finish.finish.rows.i7.i0.s1'), loss.txt],
      [T('engine.game.finish.finish.rows.i8.i0.s1'), $.world.timeLimit > 0
        ? fmtTime($.world.time) + ' / ' + fmtTime($.world.timeLimit)
        : fmtTime($.world.time)],
      [T('engine.game.finish.finish.rows.i9.i0.s1'), score]
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<tr' + (rows[i][0] === T('engine.game.finish.finish.s1') ? ' class="hi"' : '') +
        '><td>' + rows[i][0] + '</td><td>' + rows[i][1] + '</td></tr>';
    }
    document.getElementById('dTable').innerHTML = html;

    var quotes = {
      m1: T('engine.game.finish.finish.quotes.m1'),
      m2: T('engine.game.finish.finish.quotes.m2'),
      m3: T('engine.game.finish.finish.quotes.m3'),
      m4: T('engine.game.finish.finish.quotes.m4'),
      m5: T('engine.game.finish.finish.quotes.m5'),
      m6: T('engine.game.finish.finish.quotes.m6'),
      m7: T('engine.game.finish.finish.quotes.m7'),
      m8: T('engine.game.finish.finish.quotes.m8'),
      m9: T('engine.game.finish.finish.quotes.m9'),
      m10: T('engine.game.finish.finish.quotes.m10'),
      m11: T('engine.game.finish.finish.quotes.m11'),
      m12: T('engine.game.finish.finish.quotes.m12')
    };
    document.getElementById('dQuote').textContent = win ? quotes[$.mission.id] || '' :
      T('engine.game.finish.finish.textContent.s1');

    var nb = document.getElementById('btnNext');
    /* "下一任务"只在本战役内有意义 —— 打完最后一场就该回战役选择，
       而不是把玩家直接送进别的战役。 */
    var msn = CAMPAIGNS[$.campaignOf($.missionIdx)].missions;
    var mp = msn.indexOf($.missionIdx);
    var lastM = mp >= msn.length - 1;
    nb.disabled = !win || lastM;
    nb.textContent = lastM ? T('engine.game.finish.finish.textContent.s2') : T('engine.game.finish.finish.textContent.s3');

    $.show('debrief');
    SFX.warning(false);
    SFX.gun(false);
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return ('0' + m).slice(-2) + ':' + ('0' + ss).slice(-2);
  }
})(Game);
