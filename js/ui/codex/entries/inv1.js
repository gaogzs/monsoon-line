Registry.codexEntry({
  order: 220,
  cat: T('codex.inv1.cat'),
  id: 'inv1',
  title: T('codex.inv1.title'),
  sub: T('codex.inv1.sub'),
  build: function () {
    var h = T('codex.inv1.build.h.s1');

    h += T('codex.inv1.build.s1');
    for (var i = 0; i < AIRCRAFT.length; i++) {
      var a = AIRCRAFT[i];
      var pts = 0, grps = a.hardpointGroups || [];
      for (var g = 0; g < grps.length; g++) pts += grps[g].pts.length;
      h += '<tr>' +
        // nick 是英文绰号、cn 是中文名。这里要中文 ——
        // 早期版本写成了 a.nick，于是上游三架显示英文外号、
        // 而我新加的三架因为字段写反反而显示中文，正好颠倒。
        // 外层 span 可点：进这一型自己的详情页（见 js/unitview.js）
        '<td><span class="cx-unit" data-unit="aircraft:' + a.id + '">' +
        '<b>' + a.name + '</b>' +
        (a.npcOnly ? '' : T('codex.inv1.build.s2')) +
        '<br><span class="d">' + a.cn + ' ' + a.nick + '</span></span></td>' +
        '<td>' + (a.faction || '—') + '</td>' +
        '<td>' + a.role + '</td>' +
        '<td>' + a.phys.vMax + ' m/s</td>' +
        '<td>' + a.phys.pitch.toFixed(2) + ' rad/s</td>' +
        '<td>' + a.phys.hp + '</td>' +
        '<td>' + _gunResistTxt(a.gunResist) + '</td>' +
        '<td>' + pts + T('codex.inv1.build.s3') + grps.length + T('codex.inv1.build.s4') +
        '<td>' + (a.planformType || '—') + '</td>' +
        '</tr>';
    }
    h += '</table>';

    h += T('codex.inv1.build.s5');
    for (i = 0; i < AIRCRAFT.length; i++) {
      a = AIRCRAFT[i];
      grps = a.hardpointGroups || [];
      for (g = 0; g < grps.length; g++) {
        h += '<tr><td>' + (g === 0 ? '<b>' + a.name + '</b>' : '') + '</td>' +
          '<td>' + grps[g].id + '</td>' +
          '<td>' + grps[g].label + '</td>' +
          '<td>' + _hpKind(grps[g].kind) + '</td>' +
          '<td>' + grps[g].pts.length + '</td></tr>';
      }
    }
    h += '</table>';
    return h;
  }
});
