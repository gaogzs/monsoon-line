#!/usr/bin/env node
/**
 * 单位详情页布局截图器
 *
 * `render-units.js` 只能验证**模型**画得对不对 —— 它走的是离屏 canvas，
 * 看不见 CSS。而详情页有一半是布局（左栏 3D + 俯视图、右栏设定、
 * 下方参数表），那一半光读代码判断不了。
 *
 * 所以这个脚本生成一个只加载"资料库详情页需要的那几个模块"的
 * 最小页面，交给无头 Chrome 截一张图。它用的是**真正的 css/style.css
 * 与真正的 js/unitview.js**，所以截出来的就是游戏里的样子。
 *
 * 用法：node tools/shot-unitview.js [单位id ...]
 *      不带参数 = 截默认的四个（有/无俯视图的飞机各一 + 两种舰船）
 * 输出：tools/preview/shot-unit-<id>.png
 * 需要：本机装了 Chrome（或设 CHROME_PATH 指向可执行文件）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'preview');

/* 无头 Chrome 的常见位置。找不到就报错退出 —— 不要静默生成一堆
   "空壳页面"，那种失败最难查。 */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

/* 加载哪几个模块：只要详情页跑得起来就行。
   刻意**不加载 game.js** —— 它在 load 时会启动整个游戏，
   而这个页面只是想看一个详情页而已。 */
const SCRIPTS = ['version', 'math3d', 'models', 'planform', 'codex', 'data', 'unitview'];

function page(kind, id) {
  const tags = SCRIPTS.map(n => '<script src="../../js/' + n + '.js"></script>').join('\n');
  return `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<link rel="stylesheet" href="../../css/style.css">
<style>html,body{height:100%;margin:0;background:#05080c}
.screen{display:flex;flex-direction:column;height:100vh}</style>
</head><body>
<section id="scr-codex" class="screen active">
  <header class="bar"><span class="bar-t">资 料 库 / CODEX</span><span class="bar-r">详情页布局预览</span></header>
  <div class="codex-wrap">
    <nav class="codex-nav" id="codexNav"></nav>
    <div class="codex-body" id="codexBody"></div>
  </div>
  <footer class="bar bottom"><button class="btn">返回</button></footer>
</section>
${tags}
<script>
  var KIND = ${JSON.stringify(kind)}, ID = ${JSON.stringify(id)};
  document.getElementById('codexNav').innerHTML =
    '<div class="cx-cat">图鉴 / INVENTORY</div>' +
    '<div class="cx-item sel">机型图鉴</div>' +
    '<div class="cx-item">挂载图鉴</div>' +
    '<div class="cx-item">舰艇图鉴</div>';
  var b = document.getElementById('codexBody');
  b.innerHTML = UnitView.html(KIND, ID);
  UnitView.mount(KIND, ID);
</script>
</body></html>`;
}

const DEFAULTS = [
  { kind: 'aircraft', id: 'c14' },      // 有俯视图的机型
  { kind: 'aircraft', id: 'gal31' },    // 没有俯视图的机型
  { kind: 'ship', id: 'orca' },         // 舰船（无俯视图）
  { kind: 'ship', id: 'bluewhale' }         // 最重的一艘（386 面）
];

function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('找不到 Chrome / Edge。装了的话用 CHROME_PATH=<路径> 再跑一次。');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const args = process.argv.slice(2);
  const jobs = args.length
    ? args.map(a => ({ kind: a.indexOf('ship:') === 0 ? 'ship' : 'aircraft', id: a.replace(/^ship:/, '') }))
    : DEFAULTS;

  let n = 0;
  for (const j of jobs) {
    const htmlPath = path.join(OUT, 'demo-' + j.id + '.html');
    const pngPath = path.join(OUT, 'shot-unit-' + j.id + '.png');
    fs.writeFileSync(htmlPath, page(j.kind, j.id));

    const res = spawnSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--window-size=1400,1050',
      /* virtual-time-budget 让页面先跑几秒：3D 预览要靠 rAF 出第一帧，
         不等的话截到的是空画布 */
      '--virtual-time-budget=4000',
      '--screenshot=' + pngPath.replace(/\\/g, '/'),
      'file:///' + htmlPath.replace(/\\/g, '/')
    ], { stdio: 'ignore' });

    if (res.error || !fs.existsSync(pngPath)) {
      console.error('  截图失败：' + j.id + (res.error ? ' —— ' + res.error.message : ''));
      continue;
    }
    console.log('  shot-unit-' + j.id + '.png   ' + j.kind + ' ' + j.id +
      '  (' + Math.round(fs.statSync(pngPath).size / 1024) + ' KB)');
    n++;
  }
  console.log('\n生成 ' + n + ' 张详情页截图 → tools/preview/');
}

main();
