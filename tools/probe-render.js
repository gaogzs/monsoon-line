#!/usr/bin/env node
/**
 * 画面对比探针（docs/2-0IMPL.md 阶段 2.5.6）
 *
 * 同一组固定场景分别用 WebGL（render-gl.js）和 2D 画家算法（render.js）各画一张，
 * 左右并排截图，并在页面里逐像素算两边的差异，写回页面标题由本脚本读出。
 *
 * 场景：
 *   wing-top    挂满弹的机翼，从后上方看 —— 翼下挂弹应被机翼挡住（2D 这里本来就会排错）
 *   wing-low    同一架，从下方看 —— 挂弹盖在机翼前面
 *   fleet-fog   远处带雾的编队
 *   ship        一艘大舰（面数最多）
 *   aircraft-*  几型飞机的固定角度
 *
 * "差异"= 两边颜色差超过 24（0–255 每通道最大值）的像素占比。遮挡场景（wing-top）
 * 的差异是预期内的 —— 那正是迁移要修的问题，它只报告不判失败。
 *
 * 用法：node tools/probe-render.js            需要本机 Chrome / Edge（或 CHROME_PATH）
 * 输出：tools/preview/probe-render.png
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'preview');
const LIMIT = 0.03;      // 非遮挡场景：差异像素占比上限

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const c of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ]) if (fs.existsSync(c)) return c;
  return null;
}

function page() {
  const order = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .match(/<script src="([^"]+)"><\/script>/g).map(s => s.match(/src="([^"]+)"/)[1])
    .filter(s => !/game\.js$/.test(s));                // 不启动主循环
  const tags = order.map(s => '<script src="../../' + s.replace(/^\.\//, '') + '"></script>').join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#05080c;color:#cfe;font:12px Consolas,monospace}
#grid{display:grid;grid-template-columns:repeat(2,480px);gap:6px;padding:6px}
.cell canvas{width:480px;height:300px;display:block}.cell div{padding:2px 4px}</style></head>
<body><canvas id="cv" style="display:none"></canvas><div id="grid"></div>
${tags}
<script>
(function () {
  var W = 480, H = 300;
  window.innerWidth = W; window.innerHeight = H;
  var cv = document.getElementById('cv');
  Renderer.init(cv);

  function plane(type, pos, fwd, up) {
    var a = Ent.makeAircraft({ type: type, team: 0, pos: pos });
    a.pos = pos; a.fwd = M3.norm(fwd); a.up = M3.norm(up || M3.V(0, 1, 0));
    a.right = M3.cross(a.up, a.fwd);
    a.isPlayer = true; a.loadout = a.ac.defaultLoadout || {};
    return a;
  }
  function pushPlane(a) {
    Renderer.pushModel(MODELS[a.model], a.pos, a.fwd, a.up, { sweep: a.sweep || 0 });
    Ent.forEachStoreSlot(a, function (g, pt, wid) {
      var w = WEAPONS[wid]; if (!w) return;
      var sc = MODELS.storeScale(w), mdl = MODELS.store(w);
      var p = M3.add(Ent.storePos(a, g, pt), M3.mul(a.up, -MODELS.storeDrop(mdl, sc)));
      Renderer.pushModel(mdl, p, a.fwd, a.up, { scale: sc, store: true });
    });
  }
  function look(from, at) {
    Renderer.setCamera(from, M3.norm(M3.sub(at, from)), M3.V(0, 1, 0), 50);
  }
  var O = M3.V(0, 3000, 0);
  var SC = [
    { id: 'wing-top', occl: true, fn: function () { look(M3.V(-6, 3009, -16), O); pushPlane(plane('sailfish', O, M3.V(0, 0, 1))); } },
    { id: 'wing-low', occl: true, fn: function () { look(M3.V(5, 2992, -13), O); pushPlane(plane('sailfish', O, M3.V(0, 0, 1))); } },
    { id: 'fleet-fog', fn: function () {
      // 300 m 到 7 km：近的几乎无雾，远的融进雾里
      look(M3.V(0, 3020, -60), M3.V(0, 3000, 2000));
      var Z = [300, 900, 1800, 3000, 4800, 7000];
      for (var i = 0; i < Z.length; i++) pushPlane(plane('basalt', M3.V((i - 2.5) * Z[i] * 0.06, 3000 - Z[i] * 0.004, Z[i]), M3.V(0.3, 0, 1)));
    } },
    { id: 'ship', fn: function () {
      var m = MODELS.bluewhale || MODELS.humpback || MODELS.orca;
      look(M3.V(-180, 90, -220), M3.V(0, 10, 0));
      Renderer.pushModel(m, M3.V(0, 0, 0), M3.V(0, 0, 1), M3.V(0, 1, 0), {});
    } }
  ];
  ['sailfish', 'basalt', 'boulder'].forEach(function (t) {
    SC.push({ id: 'aircraft-' + t, fn: function () { look(M3.V(18, 3008, -22), O); pushPlane(plane(t, O, M3.V(0, 0, 1))); } });
  });

  function shot(sc, mode) {
    Renderer.setMode(mode);
    sc.fn();
    Renderer.begin(); sc.fn(); Renderer.flush(); Renderer.end();
    var c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    return c;
  }
  var grid = document.getElementById('grid'), report = [];
  var glOK = typeof RenderGL !== 'undefined' && RenderGL.available();
  SC.forEach(function (sc) {
    var a = shot(sc, 'gl'), b = shot(sc, '2d');
    var da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
    var db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    var diff = 0, n = da.length / 4;
    for (var i = 0; i < da.length; i += 4) {
      var d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > 24) diff++;
    }
    report.push({ id: sc.id, occl: !!sc.occl, diff: diff / n });
    [[a, 'WebGL'], [b, '2D']].forEach(function (p) {
      var cell = document.createElement('div'); cell.className = 'cell';
      p[0].style.width = W + 'px'; p[0].style.height = H + 'px';
      cell.appendChild(p[0]);
      var t = document.createElement('div'); t.textContent = sc.id + ' · ' + p[1] + (p[1] === '2D' ? '  差异 ' + (diff / n * 100).toFixed(2) + '%' : '');
      cell.appendChild(t); grid.appendChild(cell);
    });
  });
  document.title = 'RESULT ' + JSON.stringify({ gl: glOK, report: report });
})();
</script></body></html>`;
}

function main() {
  const chrome = findChrome();
  if (!chrome) { console.error('找不到 Chrome / Edge。装了的话用 CHROME_PATH=<路径> 再跑一次。'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const html = path.join(OUT, 'probe-render.html');
  const png = path.join(OUT, 'probe-render.png');
  fs.writeFileSync(html, page());
  const url = 'file:///' + html.replace(/\\/g, '/');
  const common = ['--headless=new', '--hide-scrollbars', '--no-sandbox', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=990,1290', '--virtual-time-budget=6000'];
  spawnSync(chrome, common.concat(['--screenshot=' + png.replace(/\\/g, '/'), url]), { stdio: 'ignore' });
  const dom = spawnSync(chrome, common.concat(['--dump-dom', url]), { encoding: 'utf8' });
  const m = /RESULT (\{.*?\})<\/title>/.exec(dom.stdout || '');
  if (!m) { console.error('页面没有给出结果（脚本出错？）。打开 ' + html + ' 看控制台。'); process.exit(1); }
  const r = JSON.parse(m[1].replace(/&quot;/g, '"'));
  console.log('\n== 画面对比（WebGL vs 2D） ==   WebGL2 可用：' + r.gl);
  let bad = 0;
  for (const x of r.report) {
    const over = !x.occl && x.diff > LIMIT;
    if (over) bad++;
    console.log('  ' + x.id.padEnd(20) + (x.diff * 100).toFixed(2).padStart(6) + '%' +
      (x.occl ? '   （遮挡场景，只报告）' : over ? '   超过 ' + LIMIT * 100 + '%' : ''));
  }
  console.log('\n截图：' + path.relative(ROOT, png));
  if (!r.gl) { console.error('WebGL2 不可用：只截到了 2D。'); process.exit(1); }
  process.exit(bad ? 1 : 0);
}
main();
