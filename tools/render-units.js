#!/usr/bin/env node
/**
 * 单位详情页 3D 预览渲染器 · 离线校验
 *
 * `js/unitview.js` 里的 `renderModel()` 是**独立于 render.js 的一份渲染代码**
 * （理由见那个文件的头部注释：Renderer 是单例，抢不过主循环）。
 * 既然它是独立的一份，就必须单独肉眼验证 —— 这正是这个脚本的用途。
 *
 * 它用真正的 `js/unitview.js`，喂一个假 canvas，把每个单位的
 * 3D 预览落成 PNG。生成的就是详情页里那个转动的画面。
 *
 * 用法：node tools/render-units.js
 * 输出：tools/preview/unit-<机型|舰船>-<id>.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Raster, makeCtx, encodePNG } = require('./lib/raster');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'preview');
const W = 460, H = 300;

/* 详情页里的初始视角：右前上方 3/4。两个数都来自 unitview.js 的
   运动状态（yaw 0.7 / pitch 0.30），这里抄一份是为了复现同一个画面。 */
const YAW = 0.7, PITCH = 0.30;

const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...htmlSrc.matchAll(/<script\s+src="js\/([a-zA-Z0-9_]+)\.js"><\/script>/g)].map(m => m[1]);

const sandbox = {
  console, Math, JSON, Object, Array, Float32Array, Uint8Array, Buffer,
  parseInt, parseFloat, String, Number, isNaN
};
sandbox.window = sandbox;
sandbox.innerWidth = W;
sandbox.innerHeight = H;
sandbox.devicePixelRatio = 1;
sandbox.requestAnimationFrame = () => 0;
sandbox.cancelAnimationFrame = () => {};
sandbox.addEventListener = () => {};
sandbox.document = { getElementById: () => null, createElement: () => ({ getContext: () => null }) };
const ctxVm = vm.createContext(sandbox);

for (const name of ['math3d', 'models', 'planform', 'codex', 'data', 'unitview']) {
  if (!scripts.includes(name)) continue;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', name + '.js'), 'utf8'), ctxVm,
    { filename: name + '.js' });
}

const UnitView = sandbox.UnitView;
const MODELS = sandbox.MODELS;
const AIRCRAFT = sandbox.AIRCRAFT;
const SHIPS = sandbox.SHIPS;

if (!UnitView || !MODELS || !AIRCRAFT || !SHIPS) {
  console.error('加载失败：UnitView / MODELS / AIRCRAFT / SHIPS 有一个没起来');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

function shoot(model) {
  const ras = new Raster(W, H);
  ras.clear(0x07, 0x0d, 0x12);
  const canvas = { width: W, height: H, style: {}, getContext: () => makeCtx(ras) };
  UnitView.renderModel(canvas, model, YAW, PITCH);
  return ras;
}

/* ---------- 机型 ---------- */
let n = 0, miss = [];
for (const a of AIRCRAFT) {
  const mdl = MODELS[a.model];
  if (!mdl) { miss.push(a.id); continue; }
  const ras = shoot(mdl);
  fs.writeFileSync(path.join(OUT, 'unit-air-' + a.id + '.png'),
    encodePNG(W, H, ras.rgb));
  console.log('  unit-air-' + a.id.padEnd(6) + ' ' + a.name + ' ' + a.cn +
    '  (' + mdl.v.length + ' 顶点 / ' + mdl.f.length + ' 面)');
  n++;
}

/* ---------- 舰船 ---------- */
for (const s of SHIPS) {
  const mdl = MODELS.composeTurrets(MODELS[s.model], s.mounts);
  if (!mdl) { miss.push(s.id); continue; }
  const ras = shoot(mdl);
  fs.writeFileSync(path.join(OUT, 'unit-ship-' + s.id + '.png'),
    encodePNG(W, H, ras.rgb));
  console.log('  unit-ship-' + s.id.padEnd(8) + ' ' + s.hull + ' ' + s.cn +
    '  (' + mdl.v.length + ' 顶点 / ' + mdl.f.length + ' 面)');
  n++;
}

if (miss.length) console.error('缺少模型：' + miss.join(', '));
console.log('\n生成 ' + n + ' 张单位预览图 → tools/preview/');
