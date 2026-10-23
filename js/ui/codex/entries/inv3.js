/* ------------------------------------------------------------
   舰艇图鉴

   与机型 / 挂载图鉴同一个理由：手写的舰船表一定会和 data.js 脱节。
   所以这里现场遍历 SHIPS，一个字段都不复述。

   注意 codex.js 在 data.js 之前加载，所以对 SHIPS 的引用必须
   留在 build() 体内 —— 与 inv1 / inv2 的写法一致。
   ------------------------------------------------------------ */
Registry.codexEntry({
  order: 240,
  cat: T('codex.inv3.cat'),
  id: 'inv3',
  title: T('codex.inv3.title'),
  sub: T('codex.inv3.sub'),
  build: function () {
    var h = T('codex.inv3.build.h.s1');

    /* 势力顺序写死 —— 先参战四方，再未参战三方。
       顺序在这里是叙事，不是数据。 */
    var order = [T('codex.inv3.build.order.i0.s1'), T('codex.inv3.build.order.i1.s1'), T('codex.inv3.build.order.i2.s1'), T('codex.inv3.build.order.i3.s1'),
      T('codex.inv3.build.order.i4.s1'), T('codex.inv3.build.order.i5.s1'), T('codex.inv3.build.order.i6.s1')];

    var si, oi, s;
    for (oi = 0; oi < order.length; oi++) {
      var rows = '';
      for (si = 0; si < SHIPS.length; si++) {
        s = SHIPS[si];
        if (s.faction !== order[oi]) continue;
        rows += '<tr>' +
          '<td><span class="cx-unit" data-unit="ship:' + s.id + '">' +
          '<b>' + s.hull + '</b><br><span class="d">' + s.cn + ' ' + s.name + '</span>' +
          (s.neutral ? T('codex.inv3.build.s1') : '') + '</span></td>' +
          '<td>' + s.cls + '</td>' +
          '<td>' + s.role + '</td>' +
          '<td>' + s.disp + ' t</td>' +
          '<td>' + s.dim[0] + ' × ' + s.dim[1] + ' × ' + s.dim[2] + '</td>' +
          '<td>' + s.speed + ' kn</td>' +
          '<td>' + s.crew + '</td>' +
          '</tr>';
      }
      if (!rows) continue;
      h += '<h4>' + order[oi] + '</h4>' +
        T('codex.inv3.build.s2') +
        T('codex.inv3.build.s3') +
        rows + '</table>';
    }

    // 要害与舰载武备
    h += T('codex.inv3.build.s4');
    for (si = 0; si < SHIPS.length; si++) {
      s = SHIPS[si];
      h += '<tr><td><b>' + s.cn + '</b><br><span class="d">' + s.hull + '</span></td>' +
        '<td>' + s.vials.join(' · ') + '</td>' +
        '<td>' + s.arms.join(' · ') + '</td>' +
        '<td>' + s.hp + '</td>' +
        '<td>' + _gunResistTxt(s.gunResist) + '</td>' +
        '<td>' + s.radius + ' m</td></tr>';
    }
    h += '</table>';

    /* 固定式海上平台（PLATFORMS）：单独一组。它们不动，所以不列排水量与航速，
       主尺度写甲板宽 × 长 × 甲板高 */
    if (typeof PLATFORMS !== 'undefined' && PLATFORMS.length) {
      h += T('codex.inv3.build.s5');
      for (si = 0; si < PLATFORMS.length; si++) {
        s = PLATFORMS[si];
        h += '<tr><td><span class="cx-unit" data-unit="ship:' + s.id + '">' +
          '<b>' + s.hull + '</b><br><span class="d">' + s.name + '</span>' +
          (s.neutral ? T('codex.inv3.build.s6') : '') + '</span></td>' +
          '<td>' + s.faction + '</td><td>' + s.cls + '</td><td>' + s.role + '</td>' +
          '<td>' + s.dim[0] + ' × ' + s.dim[1] + ' × ' + s.dim[2] + '</td>' +
          '<td>' + s.arms.join(' · ') + '</td><td>' + s.hp + '</td>' +
          '<td>' + _gunResistTxt(s.gunResist) + '</td></tr>';
      }
      h += '</table>';
    }

    h += T('codex.inv3.build.s7');

    return h;
  }
});
