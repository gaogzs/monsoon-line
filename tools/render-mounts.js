#!/usr/bin/env node
/**
 * NPC 实体挂载预览器
 *
 * "挂架上的实物"是**画出来的**东西，数值断言只能确认"几件"，
 * 确认不了"看起来是不是挂在翼下、机腹的吊舱有没有穿进机身"。
 * 所以这里把几个有代表性的敌我配置落成 PNG，供人肉检查。
 *
 * 关键点：它不重写任何一行挂载逻辑 ——
 *   ① 飞机用真正的 `Ent.makeAircraft()` 造（含 NPC 的弹药池与发射槽）
 *   ② 挂载物用真正的 `Game.__pushStores()` 推（与实机同一份代码路径）
 *   ③ 投影 / 光照 / 画家算法用真正的 `js/render.js`
 * 唯一自己写的是相机取景。
 *
 * 用法：node tools/render-mounts.js
 * 输出：tools/preview/mount-<机型>-<配置>.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Raster, makeCtx, encodePNG } = require('./lib/raster');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'preview');
const W = 620, H = 360;

/* 相机：右前上方 3/4 —— 与图鉴详情页同一套角度习惯（方位 0.7 / 俯角 0.30），
   翼下挂载在这个高度上看得最清楚。 */
const AZ = 0.70, EL = 0.34;
const FOV = 24;
const MARGIN = 1.30;

/* ---------- 载入真正的游戏模块 ----------
   脚本清单与顺序直接读 index.html，不手工维护（tools/smoke.js 同样做法）。 */
const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const Scripts = require('./lib/scripts');
const scripts = Scripts.loadOrder();   // 如 'js/data.js'

function fakeEl() {
  return {
    style: {}, classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, getContext: () => null,
    setAttribute() {}, getAttribute: () => null,
    querySelectorAll: () => [], querySelector: () => null,
    textContent: '', innerHTML: '', value: '', width: 1280, height: 720
  };
}

const sandbox = { console, Math, JSON, Object, Array, Float32Array, Buffer, isNaN, parseInt, parseFloat, String, Number };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.innerWidth = W;
sandbox.innerHeight = H;
sandbox.devicePixelRatio = 1;
sandbox.requestAnimationFrame = () => 0;
sandbox.cancelAnimationFrame = () => {};
sandbox.addEventListener = () => {};
sandbox.setTimeout = () => 0;
sandbox.AudioContext = function () { return { createGain: fakeEl, createOscillator: fakeEl, createBiquadFilter: fakeEl, createBufferSource: fakeEl, createBuffer: fakeEl, destination: fakeEl, currentTime: 0, sampleRate: 48000, resume() {} }; };
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
sandbox.document = {
  getElementById: () => fakeEl(), createElement: () => fakeEl(),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, body: fakeEl()
};
const ctxVm = vm.createContext(sandbox);

for (const file of scripts) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctxVm, { filename: file });
}

const M3 = sandbox.M3, MODELS = sandbox.MODELS, Ent = sandbox.Ent;
const Renderer = sandbox.Renderer, Game = sandbox.Game;

if (!M3 || !MODELS || !Ent || !Renderer || !Game || !Game.__pushStores) {
  console.error('加载失败：M3 / MODELS / Ent / Renderer / Game.__pushStores 有一个没起来');
  process.exit(1);
}

/* ---------- 取景 ---------- */
function bounds(model) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const v of model.v) {
    for (let k = 0; k < 3; k++) {
      if (v[k] < lo[k]) lo[k] = v[k];
      if (v[k] > hi[k]) hi[k] = v[k];
    }
  }
  return { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    len: hi[2] - lo[2], beam: hi[0] - lo[0] };
}

function frameCamera(model, el) {
  const bd = bounds(model);
  const proj = bd.len * Math.cos(AZ) + bd.beam * Math.sin(AZ);
  const focal = (H * 0.5) / Math.tan(FOV * Math.PI / 360);
  const d = proj * focal / (W * 0.86) * MARGIN;
  return {
    pos: M3.V(bd.c[0] + d * Math.cos(el) * Math.sin(AZ),
      bd.c[1] + d * Math.sin(el) * 0.85,
      bd.c[2] + d * Math.cos(el) * Math.cos(AZ)),
    target: M3.V(bd.c[0], bd.c[1], bd.c[2])
  };
}

/* ---------- 一个配置 = 一张图 ----------
   `pods` 与关卡文件里写的是同一种东西（missions.js 的 spawnEnemy）。 */
const CASES = [
  { tag: 'schist-dl6', type: 'schist', special: 'dl6', note: 'ROK-27 + BIN-6（重挂点 2 + 通用挂点 2）' },
  { tag: 'schist-dl6-dry', type: 'schist', special: 'dl6', empty: true, note: '同上，但弹已打光（应当只剩裸机）' },
  { tag: 'basalt-dl4-vzu', type: 'basalt', special: 'dl4', pods: ['vzu'], note: 'GAL-31 + DAR-4 + SAV-6 吊舱（吊舱占外侧，导弹保住重挂点）' },
  { tag: 'schist-dl6-vzu', type: 'schist', special: 'dl6', pods: ['vzu'], note: 'ROK-27 + BIN-6 + SAV-6（一型导弹 + 吊舱，导弹的可见挂架变少但弹药池不变）' },
  { tag: 'spray-vbn-vzu', type: 'spray', special: 'vbn', pods: ['vzu'], note: 'DJACU Mk.1 浪花 + BIN-9 + SAV-6（吊舱进机腹，制式弹不被挤掉）' },
  { tag: 'sandstone-vbn', type: 'sandstone', special: 'vbn', note: 'VAC-14 + BIN-9（储备 2 发 < 挂点 4 个，多出来的挂点出厂就是空的）' },
  { tag: 'lodestone-vsc', type: 'lodestone', special: 'vsc', note: 'ROK-44 干扰机 + SAV-14 烧穿吊舱（机腹）' },
  { tag: 'lodestone-vsc-belly', type: 'lodestone', special: 'vsc', el: -0.42, note: '同上，从**下**往上看机腹 —— 机腹挂载只有这个角度看得见' },
  { tag: 'spray-vbn-vzu-belly', type: 'spray', special: 'vbn', pods: ['vzu'], el: -0.42, note: '浪花，从下看机腹的吊舱' },
  { tag: 'schist-dl6-belly', type: 'schist', special: 'dl6', el: -0.42, note: '片岩，从下看：翼下挂载的高度对不对' },
  { tag: 'pelican-dl6', type: 'pelican', special: 'dl6', note: 'J-2 鹈鹕预警机 + 空空弹：适配表拦住它（应当一件都没有）' },
  { tag: 'folded_wing-default', type: 'folded_wing', note: 'KA-7 僚机默认配置：翼下 TOR-3（头部改装）+ 内埋 CLA-4 中继' },
  { tag: 'frigatebird-drm', type: 'frigatebird', special: 'drm', note: '外观对照：TOR-3 单枚（应比 TOR-2 多一段战斗部与钝头）' },
  { tag: 'skua-default', type: 'skua', note: 'D-21 贼鸥：机腹与翼下挂载要贴着扁平机身' },
  { tag: 'skua-default-belly', type: 'skua', el: -0.42, note: '同上，从下看' },
  { tag: 'frigatebird-srm', type: 'frigatebird', special: 'srm', note: '外观：TOR-2 双联格斗弹（应当短小）' },
  { tag: 'frigatebird-wasp', type: 'frigatebird', special: 'wasp', note: '外观：SUT-7 三联挂梁' },
  { tag: 'frigatebird-qsr', type: 'frigatebird', special: 'qsr', note: '外观：GIR-5 三管方巢' },
  { tag: 'frigatebird-swm', type: 'frigatebird', special: 'swm', note: '外观：GIR-12 四格方巢' },
  { tag: 'frigatebird-rkt', type: 'frigatebird', special: 'rkt', note: '外观：PEJ-6 七管火箭巢' },
  { tag: 'frigatebird-vlar', type: 'frigatebird', special: 'vlar', note: '外观：CLA-12 超远程（应当最大）' },
  { tag: 'frigatebird-lcm', type: 'frigatebird', special: 'lcm', note: '外观：GUT-30 巡航弹' }
];

const BG = [0x0d, 0x16, 0x1c];

fs.mkdirSync(OUT, { recursive: true });

let n = 0, miss = [];
for (const c of CASES) {
  const ac = sandbox.AIRCRAFT.filter(a => a.id === c.type)[0];
  if (!ac) { miss.push(c.type); continue; }
  const mdl = MODELS[ac.model];
  if (!mdl) { miss.push(ac.model); continue; }

  /* 与 spawnEnemy 一样地造飞机 —— 这架飞机的弹药池 / 发射槽 / 挂载分配
     全部是 makeAircraft 建出来的，没有一处是这里补的。 */
  const a = Ent.makeAircraft({
    type: c.type, team: 1, x: 0, y: 0, z: 0,
    fwd: M3.V(0, 0, 1), speed: 300,
    special: c.special, pods: c.pods || null
  });
  a.pos = M3.V(0, 0, 0);
  if (c.empty) {                       // 打光：弹药池清零，翼下应当变干净
    for (const k in (a.ammoPool || {})) a.ammoPool[k] = 0;
  }

  const cam = frameCamera(mdl, c.el === undefined ? EL : c.el);
  const ras = new Raster(W, H);
  ras.clear(BG[0], BG[1], BG[2]);
  sandbox.innerWidth = W;
  sandbox.innerHeight = H;
  const canvas = { width: W, height: H, style: {}, getContext: () => makeCtx(ras) };
  Renderer.init(canvas);
  Renderer.resize();
  Renderer.setCamera(cam.pos, M3.norm(M3.sub(cam.target, cam.pos)), M3.V(0, 1, 0), FOV);

  let stores = 0;
  Renderer.begin();
  ras.clear(BG[0], BG[1], BG[2]);      // begin() 画的天空/海面网格不要
  Renderer.pushModel(mdl, M3.V(0, 0, 0), M3.V(0, 0, 1), M3.V(0, 1, 0), { sweep: a.sweep || 0 });
  const orig = Renderer.pushModel;
  Renderer.pushModel = function (m, p, f, u, o) { if (o && o.store) stores++; return orig(m, p, f, u, o); };
  Game.__pushStores(a);                // ← 实机那条渲染路径
  Renderer.pushModel = orig;
  Renderer.flush();
  Renderer.end();

  const file = 'mount-' + c.tag + '.png';
  fs.writeFileSync(path.join(OUT, file), encodePNG(W, H, ras.rgb));
  console.log('  ' + file.padEnd(28) + ' ' + stores + ' 件挂载   ' + c.note);
  n++;
}

if (miss.length) console.error('缺少机型/模型：' + miss.join(', '));
console.log('\n生成 ' + n + ' 张挂载预览图 → tools/preview/');
