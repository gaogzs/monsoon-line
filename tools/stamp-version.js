/* ============================================================
   stamp-version.js —— 只刷新 js/core/version.js 的时间戳

   用途：主菜单左上角显示这个时间，用来确认"这一版到底部署了没有"。
   浏览器缓存、Pages 重建延迟、推送失败 —— 这些都不好肉眼判断，
   但时间戳变了就说明新的 commit 确实上线了。

   为什么不用 document.lastModified：
   那取的是 HTML 文件的响应头，Pages 有时会给一个与内容无关的时间，
   而且在缓存命中时不更新 —— 恰恰在最需要它的时候失效。

   为什么不用运行时算：本项目没有构建步骤，页面是静态托管的，
   运行时拿不到 git 信息。所以只能在推送前生成一次。

   **每次 git commit 之前跑一遍这个脚本。**

   实现搬去了 tools/release.js —— 版本号、时间戳、更新日志三样东西
   来自同一份 CHANGELOG.md，各写各的迟早会不一致。
   这个脚本留在原地，是因为它是"只想刷新时间戳"时最轻的那条路径。
   要发一个新版本请用：node tools/release.js vX.Y.Z（版本号手动指定）
   ============================================================ */
'use strict';
const release = require('./release.js');

const version = release.parseChangelog(
  require('fs').readFileSync(require('path').join(release.ROOT, 'CHANGELOG.md'), 'utf8')
)[0];

const stamp = release.writeStamp(version ? version.version : '');

if (!stamp) {
  console.log('  读不到 git 记录（可能不在仓库里），跳过');
} else {
  console.log('  js/core/version.js 已更新');
  console.log('    版本  ' + (stamp.version || '—'));
  console.log('    时间  ' + stamp.local);
  console.log('    提交  ' + stamp.hash + '  ' + stamp.subject);
}
