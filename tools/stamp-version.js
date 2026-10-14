/* ============================================================
   stamp-version.js —— 把当前提交写进 js/version.js

   用途：主菜单左上角显示这个时间，用来确认"这一版到底部署了没有"。
   浏览器缓存、Pages 重建延迟、推送失败 —— 这些都不好肉眼判断，
   但时间戳变了就说明新的 commit 确实上线了。

   为什么不用 document.lastModified：
   那取的是 HTML 文件的响应头，Pages 有时会给一个与内容无关的时间，
   而且在缓存命中时不更新 —— 恰恰在最需要它的时候失效。

   为什么不用运行时算：本项目没有构建步骤，页面是静态托管的，
   运行时拿不到 git 信息。所以只能在推送前生成一次。

   **每次 git commit 之前跑一遍这个脚本。**
   ============================================================ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CWD = path.resolve(__dirname, '..');

function git(args) {
  try {
    return execSync('git ' + args, { cwd: CWD, encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

// 上一次提交的时间与短哈希
const iso = git('log -1 --format=%cI');
const hash = git('log -1 --format=%h');
const subject = git('log -1 --format=%s');

if (!iso) {
  console.log('  读不到 git 记录（可能不在仓库里），跳过');
  process.exit(0);
}

// 转成本地可读格式：2026-10-14 19:39
const d = new Date(iso);
function p2(n) { return (n < 10 ? '0' : '') + n; }
const local = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
  ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());

const out = `/* 自动生成 —— 不要手改。
   由 tools/stamp-version.js 从 git 记录写出，每次提交前重新生成。
   主菜单左上角显示它的时间，用来确认当前部署的是哪一版。 */
var BUILD_STAMP = {
  time: '${local}',
  iso: '${iso}',
  hash: '${hash}',
  subject: ${JSON.stringify(subject || '')}
};
`;

fs.writeFileSync(path.join(CWD, 'js', 'version.js'), out);
console.log('  js/version.js 已更新');
console.log('    时间  ' + local);
console.log('    提交  ' + hash + '  ' + subject);
