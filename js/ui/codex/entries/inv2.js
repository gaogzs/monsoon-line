Registry.codexEntry({
  order: 230,
  cat: T('codex.inv2.cat'),
  id: 'inv2',
  title: T('codex.inv2.title'),
  sub: T('codex.inv2.sub'),
  build: function () {
    var h = T('codex.inv2.build.h.s1');

    var cats = [
      { t: T('codex.inv2.build.cats.i0.t'), k: 'aam' },
      { t: T('codex.inv2.build.cats.i1.t'), k: 'asm' },
      { t: T('codex.inv2.build.cats.i2.t'), k: 'agm' },
      { t: T('codex.inv2.build.cats.i3.t'), k: 'bomb' },
      { t: T('codex.inv2.build.cats.i4.t'), k: 'ecm' },
      { t: T('codex.inv2.build.cats.i5.t'), k: 'dew' }
    ];

    for (var ci = 0; ci < cats.length; ci++) {
      var rows = '';
      for (var id in WEAPONS) {
        if (!Object.prototype.hasOwnProperty.call(WEAPONS, id)) continue;
        var w = WEAPONS[id];
        if (w.kind !== cats[ci].k) continue;
        if (!w.fits || !w.fits.length) continue;      // 敌方专用不列

        var fits = [];
        for (var fi = 0; fi < w.fits.length; fi++) fits.push(_hpKind(w.fits[fi]));

        rows += '<tr>' +
          '<td><span class="cx-unit" data-unit="weapon:' + id + '"><b>' + w.name + '</b></span></td>' +
          '<td>' + w.cn + '</td>' +
          '<td>' + (w.role || '—') + '</td>' +
          '<td>' + _rngTxt(w) + '</td>' +
          '<td>' + (w.tags.passive ? '—' : '×' + w.perPoint) + '</td>' +
          '<td>' + w.mass + '</td>' +
          '<td>' + fits.join(' / ') +
          (w.needs && w.needs.length
            ? T('codex.inv2.build.s1') + w.needs.map(_capLabel).join(' / ') + '</span>'
            : '') + '</td>' +
          '<td>' + _seekerLabel(w) + '</td>' +
          '<td>' + _fuzeTxt(w) + '</td>' +
          '<td>' + _blastTxt(w) + '</td>' +
          '<td>' + (w.cd ? w.cd + 's' : '—') + '</td>' +
          '</tr>';
      }
      if (!rows) continue;
      h += '<h4>' + cats[ci].t + '</h4>' +
        T('codex.inv2.build.s2') +
        T('codex.inv2.build.s3') +
        T('codex.inv2.build.s4') +
        rows + '</table>';
    }

    h += T('codex.inv2.build.s5');
    for (id in WEAPONS) {
      if (!Object.prototype.hasOwnProperty.call(WEAPONS, id)) continue;
      w = WEAPONS[id];
      if (w.fits && w.fits.length) continue;          // 只列敌方专用
      if (w.kind === 'gun') continue;
      h += '<tr><td><span class="cx-unit" data-unit="weapon:' + id + '"><b>' + w.name + '</b></span></td><td>' + w.cn + '</td>' +
        '<td>' + (w.role || '—') + '</td>' +
        '<td>' + _seekerLabel(w) + '</td>' +
        '<td>' + (w.cd ? w.cd + 's' : '—') + '</td>' +
        '<td>' + (w.desc || '') + '</td></tr>';
    }
    h += '</table>';
    return h;
  }
});
