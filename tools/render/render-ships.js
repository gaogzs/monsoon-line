#!/usr/bin/env node
/**
 * 水面舰船外形预览器
 *
 * 这个项目没有浏览器可用，而"这条船看起来像不像船"是代码看不出来的。
 * 所以这里用**游戏自己的渲染代码**（js/models.js 的几何 + js/render.js 的
 * 投影 / 光照 / 画家算法）把每艘舰船落成 PNG，供人肉检查。
 *
 * 因为它走的是同一份代码，预览与实机看到的是同一个东西 ——
 * 这一点和 tools/render/render-planform.js 的做法一致。
 *
 * 用法：node tools/render/render-ships.js
 * 输出：tools/render/out/ship-<id>.png（单船 3/4 视角）
 *       tools/render/out/ship-lineup.png（全部同一比例，看相对大小）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Raster, makeCtx, encodePNG } = require('../lib/raster');

const ROOT = require('../lib/root').ROOT;
const OUT = path.join(__dirname, 'out');

const SHIP_W = 640, SHIP_H = 380;
const LINE_W = 1200, LINE_H = 640;

/* 相机：从右前上方 3/4 视角看。俯角小一点、方位角大一点，
   因为舰船的信息量主要在甲板和侧面轮廓上。

   FOV 取小值、距离按比例拉远，是为了压掉透视：一条 210 米的船
   如果用近距广角拍，艏部会被放大到框外，前后段的比例也会失真。 */
const AZ = process.env.AZ ? +process.env.AZ : 0.70;   // 方位角（从 +z 绕到 +x）
const EL = process.env.EL ? +process.env.EL : 0.33;   // 俯角（EL=-0.05 之类可以从水线下方看船底）
const FOV = 26;
const MARGIN = 1.35;  // 边距系数：1.0 = 刚好卡满画面宽度，越大留白越多

/* ---------- 载入真正的游戏模块 ---------- */
const Scripts = require('../lib/scripts');
const scripts = Scripts.loadOrder();   // 如 'js/data.js'

const sandbox = { console, Math, JSON, Object, Array, Float32Array, Buffer, performance: { now: () => 0 } };
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
sandbox.innerWidth = SHIP_W;
sandbox.innerHeight = SHIP_H;
sandbox.devicePixelRatio = 1;
sandbox.document = { getElementById: () => null, createElement: () => ({ getContext: () => null }) };
const ctxVm = vm.createContext(sandbox);

for (const file of Scripts.preview()) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctxVm, { filename: file });
}

const M3 = sandbox.M3;
const MODELS = sandbox.MODELS;
const SHIPS = sandbox.SHIPS;
const Renderer = sandbox.Renderer;

if (!M3 || !MODELS || !SHIPS || !Renderer) {
  console.error('加载失败：M3 / MODELS / SHIPS / Renderer 有一个没起来');
  process.exit(1);
}

/* ---------- 模型包围盒 ---------- */
function bounds(model) {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (var i = 0; i < model.v.length; i++) {
    var v = model.v[i];
    for (var k = 0; k < 3; k++) {
      if (v[k] < lo[k]) lo[k] = v[k];
      if (v[k] > hi[k]) hi[k] = v[k];
    }
  }
  return {
    lo: lo, hi: hi,
    c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    len: hi[2] - lo[2], beam: hi[0] - lo[0], high: hi[1] - lo[1]
  };
}

/* ---------- 相机位置：让模型大致填满画面 ---------- */
function frameCamera(model, w, h, fov) {
  var bd = bounds(model);
  // 近似的投影宽度：船长在视平面上的投影 + 船宽的一份
  var proj = bd.len * Math.cos(AZ) + bd.beam * Math.sin(AZ);
  var focal = (h * 0.5) / Math.tan(fov * Math.PI / 360);
  var d = proj * focal / (w * 0.86) * MARGIN;
  var cx = bd.c[0] + d * Math.cos(EL) * Math.sin(AZ);
  var cy = bd.c[1] + d * Math.sin(EL) * 0.85;
  var cz = bd.c[2] + d * Math.cos(EL) * Math.cos(AZ);
  return { pos: [cx, cy, cz], target: bd.c };
}

function shoot(model, w, h, camDef, bg, fwd, up, place) {
  const ras = new Raster(w, h);
  ras.clear(bg[0], bg[1], bg[2]);
  sandbox.innerWidth = w;
  sandbox.innerHeight = h;

  const canvas = { width: w, height: h, style: {}, getContext: () => makeCtx(ras) };
  Renderer.init(canvas);
  Renderer.resize();

  const P = M3.V(camDef.pos[0], camDef.pos[1], camDef.pos[2]);
  const T = M3.V(camDef.target[0], camDef.target[1], camDef.target[2]);
  Renderer.setCamera(P, M3.norm(M3.sub(T, P)), M3.V(0, 1, 0), camDef.fov || FOV);

  Renderer.begin();
  // begin() 会画天空与海面网格，预览里不需要 —— 直接盖成深色底
  ras.clear(bg[0], bg[1], bg[2]);

  Renderer.pushModel(model, place.P, fwd, up, { scale: place.scale || 1 });
  Renderer.flush();
  Renderer.end();

  return ras;
}

const BG = [0x0d, 0x16, 0x1c];
const FWD0 = M3.V(0, 0, 1);
const UP0 = M3.V(0, 1, 0);

fs.mkdirSync(OUT, { recursive: true });

/* ============================================================
   一、单船 3/4 视角
   ============================================================ */
let n = 0;
/* 海上平台（PLATFORMS）也出单张；它们另外出一张残骸（<model>_wreck）。
   同比例总览按吨位排，平台没有吨位，不进总览 */
const PLATFORMS = sandbox.PLATFORMS || [];
const singles = SHIPS.concat(PLATFORMS,
  PLATFORMS.map(p => ({ id: p.id + '-wreck', model: p.model + '_wreck', hull: p.hull, cn: '残骸', allMounts: null })));
for (const s of singles) {
  const mdl = MODELS.composeTurrets(MODELS[s.model], s.allMounts);   // 炮塔按零位合进来
  if (!mdl) { console.error('缺少模型：' + s.model); continue; }
  const cam = frameCamera(mdl, SHIP_W, SHIP_H, FOV);
  cam.fov = FOV;
  const ras = shoot(mdl, SHIP_W, SHIP_H, cam, BG, FWD0, UP0, { P: M3.V(0, 0, 0) });
  fs.writeFileSync(path.join(OUT, 'ship-' + s.id + '.png'), encodePNG(SHIP_W, SHIP_H, ras.rgb));
  console.log('  ship-' + s.id + '.png   ' + s.hull + ' ' + s.cn +
    '  (' + mdl.v.length + ' 顶点 / ' + mdl.f.length + ' 面)');
  n++;
}

/* ============================================================
   二、同一比例总览

   全部船按**同一个 scale** 分三行排列、艏朝画面右，所以这是一张
   "相对尺寸对照图"：吨位差多少，一眼就能看出来。

   两个实现细节值得记一笔：

   1. **每行单独渲染再上下拼接**，而不是塞进同一个相机。同一个相机里
      三行只能靠深度差分开，而深度差在接近侧视的角度下几乎完全
      投影不掉 —— 实测三行会重叠成一行。
   2. **px 取负**。相机在 +z 看向原点时 `right = up × fwd = (-1,0,0)`，
      也就是屏幕右对应世界 -x。不取负的话最大的船会排在最右边。
   ============================================================ */
{
  const ROW_N = 3;
  const ROW_H = Math.floor(LINE_H / ROW_N);
  const sorted = SHIPS.slice().sort((a, b) => b.disp - a.disp);
  const rows = [sorted.slice(0, 4), sorted.slice(4, 8), sorted.slice(8)];
  const GAP = 46;                          // 船与船之间的间隙（米，缩放前）

  // 排位置：每行从左到右累加船长
  const plan = rows.map(list => {
    let x = 0;
    const items = list.map(s => {
      const it = { s: s, x0: x, w: s.dim[0] };
      x += s.dim[0] + GAP;
      return it;
    });
    return { items: items, width: x - GAP };
  });
  const maxWidth = Math.max(...plan.map(p => p.width));

  // 统一比例：最宽的一行占画面 92%
  const camDist = 5200;
  const rowFov = 9;
  const focal = (ROW_H * 0.5) / Math.tan(rowFov * Math.PI / 360);
  const scale = (LINE_W * 0.92) * camDist / (focal * maxWidth);

  const out = new Raster(LINE_W, LINE_H);
  out.clear(BG[0], BG[1], BG[2]);

  for (let r = 0; r < plan.length; r++) {
    const row = plan[r];
    const ras = new Raster(LINE_W, ROW_H);
    ras.clear(BG[0], BG[1], BG[2]);
    sandbox.innerWidth = LINE_W;
    sandbox.innerHeight = ROW_H;
    const canvas = { width: LINE_W, height: ROW_H, style: {}, getContext: () => makeCtx(ras) };
    Renderer.init(canvas);
    Renderer.resize();
    // 相机略高于水线，接近侧视；观者看到的是一条船的正常轮廓
    const camPos = M3.V(0, maxWidth * 0.05, camDist);
    Renderer.setCamera(camPos, M3.norm(M3.sub(M3.V(0, 8, 0), camPos)), M3.V(0, 1, 0), rowFov);
    Renderer.begin();
    ras.clear(BG[0], BG[1], BG[2]);

    for (const it of row.items) {
      const mdl = MODELS.composeTurrets(MODELS[it.s.model], it.s.allMounts);
      if (!mdl) continue;
      // px 取负：屏幕右 = 世界 -x，不取负的话最大的船会跑到最右边
      const px = -(it.x0 + it.w / 2 - row.width / 2) * scale;
      Renderer.pushModel(mdl, M3.V(px, 0, 0), M3.V(1, 0, 0), M3.V(0, 1, 0), { scale: scale });
    }
    Renderer.flush();
    Renderer.end();

    // 拼接到总图：第 0 行在最上
    const yOff = r * ROW_H;
    for (let y = 0; y < ROW_H; y++) {
      for (let x = 0; x < LINE_W; x++) {
        const src = (y * LINE_W + x) * 3, dst = ((y + yOff) * LINE_W + x) * 3;
        out.rgb[dst] = ras.rgb[src];
        out.rgb[dst + 1] = ras.rgb[src + 1];
        out.rgb[dst + 2] = ras.rgb[src + 2];
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'ship-lineup.png'), encodePNG(LINE_W, LINE_H, out.rgb));
  console.log('  ship-lineup.png   全部 ' + SHIPS.length + ' 艘同一比例（按吨位降序，每行 4/4/3）');

}

console.log('\n生成 ' + (n + 1) + ' 张预览图 → tools/render/out/');
