/* ============================================================
   sim.js —— 后台模拟框架（docs/2-0IMPL.md 阶段 2.5.1）

   在 Node 的 vm 沙箱里加载整套游戏脚本，不渲染、不出声，只跑游戏逻辑。
   smoke、probe-* 和临时排查脚本都可以建在它上面。

     const Sim = require('./lib/sim');
     const S = Sim.load({ seed: 42 });       // 每次 load 是一个全新的沙箱
     S.start(2);                              // 开第 3 关（MISSIONS 下标）
     S.run(30, (t, w, pl) => { ... });        // 推进 30 s 游戏时间，每帧回调
     S.seed(7);                               // 换种子（之后的随机序列从头来）

   与以前各工具自带的沙箱相比：
     · 随机数可以固定种子：同一个种子跑出同一场战斗
     · step 直接调 game.js 的 update(dt)（测试钩子 __update），
       不走 requestAnimationFrame，不画 HUD
     · 画布是一个"什么都不做"的假 2D 上下文；WebGL 拿不到，
       Renderer 自动落到 2D 实现 —— 渲染调用全部是空操作
   ============================================================ */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const noop = () => {};

/* mulberry32：短、快、分布够用 */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCtx2d() {
  return new Proxy({}, {
    get: (t, k) => {
      if (k === 'canvas') return { width: 1200, height: 700 };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'getImageData' || k === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return noop;
    },
    set: () => true
  });
}

function scriptOrder() {
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .match(/<script src="([^"]+)"><\/script>/g)
    .map(s => s.match(/src="([^"]+)"/)[1].replace(/^\.\//, ''));
}

/**
 * 建一个全新的沙箱并加载游戏。
 * opt.seed      随机种子（缺省 1）
 * opt.init      是否触发 window 'load'（Game.init）—— 缺省 true
 * opt.quiet     吞掉游戏自己的 console.log（缺省 true）
 */
function load(opt) {
  opt = opt || {};
  const ctx2d = makeCtx2d();
  let clock = 0;
  const fakeEl = () => ({
    style: {}, className: '', innerHTML: '', textContent: '', value: '',
    children: [], width: 1200, height: 700, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, insertBefore: noop, addEventListener: noop,
    removeEventListener: noop, setAttribute: noop, getAttribute: () => null,
    getContext: (kind) => (kind === '2d' || !kind ? ctx2d : null),
    focus: noop, blur: noop, click: noop, requestPointerLock: noop,
    querySelectorAll: () => [], querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 700 })
  });
  const winListeners = {};
  const sandbox = {
    console: opt.quiet === false ? console : { log: noop, warn: noop, error: console.error, info: noop },
    Date, JSON, Object, Array, String, Number, Boolean, isFinite, isNaN, parseFloat, parseInt,
    RegExp, Error, TypeError, Map, Set, WeakMap, Float32Array, Uint8Array, Uint16Array, Uint32Array,
    Int32Array, Uint8ClampedArray, Proxy, Symbol, Promise,
    setTimeout: (fn) => { try { fn(); } catch (e) { /* 音频节流之类，失败无所谓 */ } return 0; },
    clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    performance: { now: () => clock * 1000 },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    innerWidth: 1200, innerHeight: 700, devicePixelRatio: 1,
    navigator: { userAgent: 'sim' }
  };
  sandbox.Math = Object.create(Math);
  let rng = makeRng(opt.seed === undefined ? 1 : opt.seed);
  sandbox.Math.random = () => rng();
  sandbox.window = sandbox;
  sandbox.document = {
    getElementById: () => fakeEl(), createElement: () => fakeEl(),
    querySelectorAll: () => [], querySelector: () => null,
    body: fakeEl(), documentElement: fakeEl(), addEventListener: noop,
    removeEventListener: noop, createTextNode: () => fakeEl(), exitPointerLock: noop
  };
  sandbox.addEventListener = (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); };
  sandbox.removeEventListener = noop;
  function FakeAudioCtx() { return ctx2d; }
  sandbox.AudioContext = FakeAudioCtx;
  sandbox.webkitAudioContext = FakeAudioCtx;

  const c = vm.createContext(sandbox);
  for (const src of scriptOrder()) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), c, { filename: src });
  }
  if (opt.init !== false) for (const fn of (winListeners.load || [])) fn({});

  const G = sandbox.Game;
  const api = {
    sandbox: sandbox,
    get world() { return G.__world(); },
    get player() { return G.__player(); },
    get time() { return clock; },
    /** 换种子：之后的随机序列从头开始 */
    seed(n) { rng = makeRng(n); return api; },
    /** 开第 idx 关（MISSIONS 下标） */
    start(idx) { G.startMission(idx); return api; },
    /** 推进一步游戏逻辑（不渲染） */
    step(dt) {
      dt = dt || 1 / 60;
      clock += dt;
      G.__update(dt);
      return api;
    },
    /** 推进 seconds 秒；每帧调 cb(t, world, player)，cb 返回 true 就提前停 */
    run(seconds, cb, dt) {
      dt = dt || 1 / 60;
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        api.step(dt);
        if (cb && cb(clock, G.__world(), G.__player()) === true) break;
      }
      return api;
    },
    /** 玩家无敌（每帧回满血），便于只看敌方行为 */
    godMode() {
      const pl = G.__player();
      if (pl) { pl.hp = pl.maxHp = 1e9; }
      return api;
    }
  };
  return api;
}

/**
 * 批量：同一场景跑 seeds 个种子，返回每次 scenario(S, seed) 的返回值。
 * 每个种子一个全新的沙箱 —— 上一场的状态不会漏进下一场。
 */
function batch(seeds, scenario, opt) {
  const out = [];
  for (const s of seeds) {
    const S = load(Object.assign({}, opt || {}, { seed: s }));
    out.push(scenario(S, s));
  }
  return out;
}

function stats(xs) {
  const n = xs.length || 1;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  return { n: xs.length, mean, sd, min: Math.min.apply(null, xs), max: Math.max.apply(null, xs) };
}

module.exports = { load, batch, stats, makeRng, ROOT };
