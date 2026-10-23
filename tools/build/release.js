#!/usr/bin/env node
/* ============================================================
   release.js —— 发版（版本号手动指定）+ 追加更新日志

   **版本号完全由人定**，脚本不再按提交信息自动判大 / 中 / 小版本。
   发版时把版本号写在命令里，脚本干四件事：
     1. 从 CHANGELOG.md 顶部那条读出当前版本号与提交锚点，检查新版本号比它大
     2. git log <锚点>..HEAD 取出这批新提交，按前缀分组成草稿
     3. 把新版本追加到 CHANGELOG.md 顶部（标题与正文待润色）
     4. 由 CHANGELOG.md 生成 js/core/changelog.js（游戏内「更新记录」页读它），
        并刷新 js/core/version.js

   不带版本号只做第 4 步（重新生成两个生成物），不发版。
   流程写在 docs/VERSIONING.md 里。

   用法：
     node tools/build/release.js                 只重新生成 js/core/changelog.js 与 js/core/version.js
     node tools/build/release.js v1.11.0         发 v1.11.0（v 可省略）
     node tools/build/release.js v1.11.0 --dry   只打印将要写入什么，不落盘
   ============================================================ */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = require('../lib/root').ROOT;
const MD_PATH = path.join(ROOT, 'CHANGELOG.md');
const JS_PATH = path.join(ROOT, 'js', 'core', 'changelog.js');
const STAMP_PATH = path.join(ROOT, 'js', 'core', 'version.js');

const DRY = process.argv.indexOf('--dry') >= 0;
// 第一个不是 --xxx 的参数就是要发的版本号
const VERSION_ARG = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || '';

/* ============================================================
   git
   ============================================================ */
function git(args) {
  try {
    return execSync('git ' + args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

/* ============================================================
   CHANGELOG.md 解析

   只认一种格式 —— 就是这份仓库里实际在用的那种：
     ## [v1.2.3] 2026-10-15 · 标题
     <!-- commit: abc1234 -->
     ### 分类
     - 条目
   解析器刻意写得窄：格式一旦漂了，宁可报错也不要"差不多"地读，
   否则 js/core/changelog.js 会悄悄生成出半份日志。
   ============================================================ */
const HEAD_RE = /^## \[v(\d+)\.(\d+)\.(\d+)\]\s+(\d{4}-\d{2}-\d{2})\s*·\s*(.+?)\s*$/;

function parseChangelog(text) {
  const lines = text.split(/\r?\n/);
  const releases = [];
  let cur = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = HEAD_RE.exec(line);

    if (m) {
      cur = {
        version: 'v' + m[1] + '.' + m[2] + '.' + m[3],
        major: +m[1], minor: +m[2], patch: +m[3],
        date: m[4], title: m[5],
        commit: '',
        lead: '',
        sections: []
      };
      releases.push(cur);
      continue;
    }
    if (!cur) continue;

    if (line.indexOf('<!--') >= 0 && line.indexOf('-->') >= 0) {
      const c = /commit:\s*([0-9a-f]+)/i.exec(line);
      if (c && !cur.commit) cur.commit = c[1];
      continue;
    }
    if (/^-{3,}\s*$/.test(line) || /^\*{3,}\s*$/.test(line)) continue;

    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) { cur.sections.push({ h: h[1], items: [] }); continue; }

    if (/^-\s+/.test(line)) {
      const sec = cur.sections[cur.sections.length - 1];
      if (sec) sec.items.push(line.replace(/^-\s+/, '').trim());
      continue;
    }
    if (line.trim() === '') continue;

    // 续行：以空白开头、上一行还开着一条列表项
    const sec = cur.sections[cur.sections.length - 1];
    if (/^\s/.test(line) && sec && sec.items.length) {
      sec.items[sec.items.length - 1] += line.trim();
      continue;
    }
    // 其余算导语
    cur.lead += (cur.lead ? ' ' : '') + line.replace(/^>\s?/, '').trim();
  }

  return releases.filter(r => r.sections.length || r.lead);
}

/* ============================================================
   版本号
   ============================================================ */
function tagOf(r) {
  if (r.patch === 0 && r.minor === 0) return '大版本';
  if (r.patch === 0) return '中版本';
  return '小版本';
}

/** 'v1.2.3' / '1.2.3' → 'v1.2.3'；格式不对返回 '' */
function normalizeVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(s || '').trim());
  return m ? 'v' + (+m[1]) + '.' + (+m[2]) + '.' + (+m[3]) : '';
}

/** a > b 返回正数，相等 0，小于负数（按数字比，v1.10.0 > v1.9.0） */
function compareVersion(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/* ============================================================
   提交分组 —— 只决定草稿里一条提交放在哪个小标题下，与版本号无关
   ============================================================ */
function sectionOf(subject) {
  const s = String(subject || '').trim();
  if (/^feat(\([^)]*\))?!?:/i.test(s) || /新增|新加|新功能|重做/.test(s)) return '新增';
  if (/^docs(\([^)]*\))?:/i.test(s) || /文档|注释里|说明/.test(s)) return '文档';
  if (/^fix(\([^)]*\))?:/i.test(s) || /修|修正|改回|补上/.test(s)) return '修复';
  return '调整';
}

/* ============================================================
   js/core/changelog.js —— 游戏读的那份

   用 JSON.stringify 输出，不手写引号转义 ——
   日志里会出现的引号、括号、Unicode 全都不用管。
   ============================================================ */
function generateChangelogJs(releases) {
  const data = {
    current: releases.length ? releases[0].version : '',
    generated: '{GENERATED}',      // 写的时候再填，避免每次跑都改日期造成假 diff
    releases: releases.map(r => ({
      version: r.version,
      date: r.date,
      title: r.title,
      tag: tagOf(r),
      commit: r.commit,
      lead: r.lead,
      sections: r.sections.map(s => ({ h: s.h, items: s.items }))
    }))
  };
  return data;
}

function renderChangelogJs(data, iso) {
  const body = JSON.stringify(data, null, 2)
    .replace('"{GENERATED}"', JSON.stringify(iso || ''));
  return `/* 自动生成 —— 不要手改。
   由 tools/build/release.js 从 CHANGELOG.md 写出，每次发版后重新生成。
   主菜单的「更新记录」页读它。规则见 docs/VERSIONING.md。 */
var CHANGELOG = ${body};
`;
}

/* ============================================================
   js/core/version.js —— 主菜单左上角的版本戳
   原来的 tools/build/stamp-version.js 也调这里，两处只保留一份实现。
   ============================================================ */
function writeStamp(version) {
  const iso = git('log -1 --format=%cI');
  const hash = git('log -1 --format=%h');
  const subject = git('log -1 --format=%s');

  if (!iso) {
    console.log('  读不到 git 记录（可能不在仓库里），跳过 js/core/version.js');
    return null;
  }

  const d = new Date(iso);
  const p2 = n => (n < 10 ? '0' : '') + n;
  const local = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
    ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());

  const out = `/* 自动生成 —— 不要手改。
   由 tools/build/release.js 从 git 记录写出，每次提交前重新生成。
   主菜单左上角显示它的时间与版本号，用来确认当前部署的是哪一版。 */
var BUILD_STAMP = {
  version: ${JSON.stringify(version || '')},
  time: '${local}',
  iso: '${iso}',
  hash: '${hash}',
  subject: ${JSON.stringify(subject || '')}
};
`;
  if (!DRY) fs.writeFileSync(STAMP_PATH, out);
  return { iso: iso, local: local, hash: hash, subject: subject, version: version };
}

/* ============================================================
   主流程
   ============================================================ */
function main() {
  if (!fs.existsSync(MD_PATH)) {
    console.error('找不到 CHANGELOG.md，无法发版：' + MD_PATH);
    process.exit(1);
  }

  const text = fs.readFileSync(MD_PATH, 'utf8');
  const releases = parseChangelog(text);

  if (!releases.length) {
    console.error('CHANGELOG.md 里没有解析出任何版本条目 —— 检查标题格式是否被改坏了。');
    process.exit(1);
  }

  const top = releases[0];
  const anchor = top.commit;
  const headHash = git('rev-parse --short HEAD');
  const today = (() => {
    const n = new Date();
    const p2 = x => (x < 10 ? '0' : '') + x;
    return n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate());
  })();

  console.log('\n== 发版 ==');
  console.log('  当前版本  ' + top.version + '（' + tagOf(top) + '）  锚点 ' + (anchor || '—'));

  /* 取新提交。锚点缺失（比如 CHANGELOG.md 是新加的）时退化成"从第一个提交算起"，
     否则整批改动会被静默吞掉。 */
  let range = anchor ? anchor + '..HEAD' : '';
  const raw = git('log ' + (range || '') + ' --format=%h%x01%s');
  const commits = raw
    ? raw.split('\n').filter(Boolean).map(l => {
        const i = l.indexOf('\x01');
        return { hash: l.slice(0, i), subject: l.slice(i + 1) };
      })
    : [];

  /* 只刷新生成物、不涨版本号的两种情形：没有新提交、或这批改动全是文档。 */
  function refreshOnly(releases, version) {
    const stamp = writeStamp(version);
    const data = generateChangelogJs(releases);
    if (!DRY) fs.writeFileSync(JS_PATH, renderChangelogJs(data, stamp ? stamp.iso : ''));
    if (stamp) {
      console.log('  js/core/version.js ' + (DRY ? '将更新' : '已更新') +
        '  ' + stamp.version + '  ' + stamp.hash + '  ' + stamp.subject);
    }
    console.log('  js/core/changelog.js ' + (DRY ? '将更新' : '已更新') +
      '  ' + releases.length + ' 个版本\n');
  }

  /* 不带版本号：只重新生成两个生成物，不发版。
     版本号完全由人定 —— 脚本不再按提交信息判大 / 中 / 小版本。 */
  if (!VERSION_ARG) {
    console.log('  这批新提交 ' + commits.length + ' 条。没有指定版本号 —— 只重新生成 js/core/changelog.js 与 js/core/version.js');
    console.log('  要发版：node tools/build/release.js vX.Y.Z（版本号自己定，见 docs/VERSIONING.md）');
    refreshOnly(releases, top.version);
    return;
  }

  const next = normalizeVersion(VERSION_ARG);
  if (!next) {
    console.error('  版本号格式不对：' + VERSION_ARG + '（要 vX.Y.Z 三段式，v 可省略）');
    process.exit(1);
  }
  if (compareVersion(next, top.version) <= 0) {
    console.error('  ' + next + ' 不比当前版本 ' + top.version + ' 大 —— 版本号只能往上走，用过的不能再用');
    process.exit(1);
  }
  if (!commits.length) {
    console.error('  锚点 ' + (anchor || '—') + ' 之后没有新提交，没有东西可发');
    process.exit(1);
  }

  const groups = { 新增: [], 调整: [], 修复: [], 文档: [] };
  for (const c of commits) groups[sectionOf(c.subject)].push(c.subject);

  let body = '';
  for (const h of ['新增', '调整', '修复', '文档']) {
    if (!groups[h].length) continue;
    body += '\n### ' + h + '\n';
    for (const s of groups[h]) body += '- ' + s + '\n';
  }

  const entry =
    '## [' + next + '] ' + today + ' · 待润色\n' +
    '<!-- commit: ' + (headHash || '') + ' -->\n' +
    '<!-- TODO: 合并同类项，把标题与正文改成一句人话（见 docs/VERSIONING.md 第 4 节） -->\n' +
    body +
    '\n---\n\n';

  console.log('  这批新提交 ' + commits.length + ' 条 → ' + next + '（' +
    tagOf({ minor: +next.split('.')[1], patch: +next.split('.')[2] }) + '）');

  /* 插入点：第一条版本标题所在的行首。
     找不到就说明 CHANGELOG.md 的骨架被改坏了，直接报错退出 ——
     免得"追加"变成"覆盖"。 */
  const idx = text.search(/^## \[v/m);
  if (idx < 0) {
    console.error('CHANGELOG.md 里找不到插入点（第一条版本标题）');
    process.exit(1);
  }

  if (DRY) {
    console.log('\n--- --dry：将要追加到 CHANGELOG.md 顶部的内容 ---\n');
    console.log(entry);
  } else {
    fs.writeFileSync(MD_PATH, text.slice(0, idx) + entry + text.slice(idx));
    console.log('  CHANGELOG.md 已追加 ' + next + '（标题与正文待润色）');
  }

  /* 生成物总是重算 —— --dry 只跳过写盘，不跳过计算，
     否则"预览"和"真跑"出来的 js/core/changelog.js 不一样，预览就没意义了。 */
  const nextText = DRY
    ? text.slice(0, idx) + entry + text.slice(idx)
    : fs.readFileSync(MD_PATH, 'utf8');
  refreshOnly(parseChangelog(nextText), next);

  if (DRY) console.log('  （--dry：以上都没有真的写进文件）\n');
  else console.log('\n  别忘了润色 CHANGELOG.md 顶部那一节，然后跑 node tools/test/smoke.js\n');
}

module.exports = {
  parseChangelog: parseChangelog,
  generateChangelogJs: generateChangelogJs,
  renderChangelogJs: renderChangelogJs,
  writeStamp: writeStamp,
  tagOf: tagOf,
  normalizeVersion: normalizeVersion,
  compareVersion: compareVersion,
  sectionOf: sectionOf,
  git: git,
  ROOT: ROOT
};

if (require.main === module) main();
