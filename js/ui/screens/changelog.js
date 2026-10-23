(function (Game) {
  'use strict';
  var $ = Game.$;
  $.buildChangelog = buildChangelog;

  /* ============================================================
     更新记录页

     内容来自 js/changelog.js（全局 CHANGELOG），而那个文件由
     tools/build/release.js 从根目录的 CHANGELOG.md 生成。
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
        '<br>在项目根目录跑一次 <b>node tools/build/release.js</b> 就有了。</div>';
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
      '版本号发版时手动指定，由 tools/build/release.js 追加到这里。</div>';

    body.innerHTML = html;
  }
})(Game);
