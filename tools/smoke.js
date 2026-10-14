#!/usr/bin/env node
/**
 * 冒烟测试 —— 在没有浏览器的环境里把游戏跑起来
 *
 * 用最小 DOM / Canvas / WebAudio 桩加载全部游戏脚本，然后：
 *   1. 检查脚本能否无异常加载
 *   2. 跑一遍开机自检，确认模块与数据引用一致
 *   3. 逐个点击导航按钮，确认目标屏幕真的被激活
 *      （导航失效过一次：flex item 缺 min-height 把 footer 顶出了视口）
 *   4. 启动任务并推进若干帧，确认主循环不抛异常
 *
 * 用法：node tools/smoke.js
 * 退出码：0 = 通过，1 = 失败
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');

/* 加载顺序直接从 index.html 里读，不手工维护 ——
   手工维护过一次就漏掉了新加的模块，测试反而先炸。 */
const ORDER = [...htmlSrc.matchAll(/<script\s+src="js\/([a-zA-Z0-9_]+)\.js"><\/script>/g)]
  .map(m => m[1]);

const problems = [];
function fail(msg) { problems.push(msg); console.log('  \x1b[31mFAIL\x1b[0m  ' + msg); }
function ok(msg) { console.log('  \x1b[32mOK\x1b[0m    ' + msg); }

/* ============================================================
   最小 DOM
   ============================================================ */
const byId = new Map();
const bySel = new Map();
const docListeners = Object.create(null);
const winListeners = Object.create(null);

function ctx2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'canvas') return { width: 1280, height: 720 };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 8 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function audioParam() {
  return {
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, setTargetAtTime() {}
  };
}

function audioNode() {
  const t = {};
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'frequency' || k === 'gain' || k === 'Q' || k === 'detune') {
        o[k] = audioParam();
        return o[k];
      }
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; }
  });
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = audioNode();
  }
  createGain() { return audioNode(); }
  createOscillator() { return audioNode(); }
  createBiquadFilter() { return audioNode(); }
  createBufferSource() { return audioNode(); }
  createBuffer(ch, len) {
    return { getChannelData: () => new Float32Array(Math.max(1, len | 0)) };
  }
  resume() {}
}

function makeEl(tag, id) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    children: [],
    parentNode: null,
    style: {},
    __cls: new Set(),
    __attr: Object.create(null),
    __listeners: Object.create(null),
    value: 0, checked: false, disabled: false,
    type: '', min: 0, max: 100, step: 1,
    className: '', textContent: '', innerHTML: '',
    width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
    onclick: null,
    getContext() { return ctx2d(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    setAttribute(k, v) { el.__attr[k] = String(v); },
    getAttribute(k) { return el.__attr[k] === undefined ? null : el.__attr[k]; },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    addEventListener(t, fn) { (el.__listeners[t] = el.__listeners[t] || []).push(fn); },
    removeEventListener() {},
    focus() {}, blur() {},
    fire(type, ev) {
      const e = ev || { preventDefault() {}, button: 0, code: '' };
      (el.__listeners[type] || []).forEach(fn => fn.call(el, e));
      if (type === 'click' && typeof el.onclick === 'function') el.onclick.call(el, e);
    }
  };
  Object.defineProperty(el, 'classList', {
    value: {
      add: (...c) => c.forEach(x => el.__cls.add(x)),
      remove: (...c) => c.forEach(x => el.__cls.delete(x)),
      contains: c => el.__cls.has(c),
      toggle: (c, on) => {
        if (on === undefined) on = !el.__cls.has(c);
        if (on) el.__cls.add(c); else el.__cls.delete(c);
        return on;
      }
    }
  });
  if (id) {
    if (byId.has(id)) fail('index.html 出现重复 id：' + id);
    byId.set(id, el);
  }
  return el;
}

/* ============================================================
   从 index.html 建立元素注册表
   ============================================================ */
const html = htmlSrc;

const screenIds = [...html.matchAll(/<section id="(scr-[^"]+)" class="([^"]*)"/g)]
  .map(m => ({ id: m[1], cls: m[2] }));
screenIds.forEach(s => {
  const el = makeEl('section', s.id);
  s.cls.split(/\s+/).filter(Boolean).forEach(c => el.__cls.add(c));
});

[...html.matchAll(/id="([^"]+)"/g)].forEach(m => {
  if (!byId.has(m[1])) makeEl('div', m[1]);
});

const goEls = [...html.matchAll(/data-go="([a-z]+)"/g)].map((m, i) => {
  const el = makeEl('button', 'go_' + i);
  el.__attr['data-go'] = m[1];
  return el;
});

const ptabEls = [...html.matchAll(/data-ptab="([a-z]+)"/g)].map((m, i) => {
  const el = makeEl('button', 'ptab_' + i);
  el.__attr['data-ptab'] = m[1];
  return el;
});

bySel.set('.screen', screenIds.map(s => byId.get(s.id)));
bySel.set('[data-go]', goEls);
bySel.set('[data-ptab]', ptabEls);

const bodyEl = makeEl('body', '__body');

const documentStub = {
  body: bodyEl,
  getElementById: id => byId.get(id) || null,
  createElement: tag => makeEl(tag),
  querySelectorAll: sel => bySel.get(sel) || [],
  addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); }
};

/* ============================================================
   最小 window / 全局
   ============================================================ */
let rafQ = [];
let rafSeq = 0;

const windowStub = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  AudioContext: FakeAudioContext,
  performance: { now: () => Date.now() },
  requestAnimationFrame(fn) { rafQ.push(fn); return ++rafSeq; },
  addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  localStorage: {
    _d: Object.create(null),
    getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  }
};

const sandbox = windowStub;
sandbox.window = windowStub;
sandbox.document = documentStub;
sandbox.console = console;
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;

const ctx = vm.createContext(sandbox);

/* ============================================================
   加载脚本
   ============================================================ */
console.log('\n== 加载脚本 ==');
let loadError = null;
for (const name of ORDER) {
  const file = path.join(ROOT, 'js', name + '.js');
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  } catch (e) {
    loadError = name + '.js: ' + e.message;
    break;
  }
}
if (loadError) {
  fail('脚本加载失败 —— ' + loadError);
} else {
  ok(ORDER.length + ' 个脚本全部加载，无语法/求值异常');
}

/* ============================================================
   初始化
   ============================================================ */
console.log('\n== 初始化 ==');
let initError = null;
try {
  (winListeners.load || []).forEach(fn => fn());
} catch (e) {
  initError = e;
}
if (initError) {
  fail('Game.init() 抛出异常 —— ' + initError.message + '\n' + initError.stack);
} else {
  ok('Game.init() 执行完毕');
}

// 开机自检若有问题会往 body 里塞一个红条
const preflightBox = bodyEl.children.find(c => /开机自检发现/.test(c.innerHTML || ''));
if (preflightBox) {
  fail('开机自检报出问题：' + String(preflightBox.innerHTML).replace(/<[^>]+>/g, ' ').trim());
} else {
  ok('开机自检通过：模块与数据引用一致');
}

function activeScreen() {
  const s = screenIds.find(x => byId.get(x.id).__cls.has('active'));
  return s ? s.id : '(无)';
}

if (activeScreen() === 'scr-title') ok('初始屏幕为 scr-title');
else fail('初始屏幕应为 scr-title，实际是 ' + activeScreen());

/* ============================================================
   导航
   ============================================================ */
console.log('\n== 导航 ==');
const NAV_EXPECT = {
  brief: 'scr-brief',
  hangar: 'scr-hangar',
  codex: 'scr-codex',
  settings: 'scr-settings',
  help: 'scr-help',
  title: 'scr-title'
};

// 每一个 data-go 都必须有对应的处理分支（早先兜底 else 会把未知值吞掉）
const handled = new Set([...fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8')
  .matchAll(/go === '([a-z]+)'/g)].map(m => m[1]));

for (const g of Object.keys(NAV_EXPECT)) {
  if (!handled.has(g)) fail("game.js 没有处理 data-go=\"" + g + '"');
}

for (const [go, want] of Object.entries(NAV_EXPECT)) {
  const btn = goEls.find(e => e.__attr['data-go'] === go);
  if (!btn) { fail('index.html 缺少 data-go="' + go + '" 的按钮'); continue; }
  btn.fire('click');
  const got = activeScreen();
  if (got === want) ok('data-go="' + go + '" → ' + want);
  else fail('data-go="' + go + '" 应激活 ' + want + '，实际 ' + got);
}

// 回到标题，再走一遍真实流程：简报 → 机库 → 出击
console.log('\n== 完整流程 ==');
goEls.find(e => e.__attr['data-go'] === 'brief').fire('click');
ok('进入简报，当前屏幕 ' + activeScreen());
goEls.find(e => e.__attr['data-go'] === 'hangar').fire('click');
ok('进入机库，当前屏幕 ' + activeScreen());

/* ============================================================
   启动任务并推进帧
   ============================================================ */
console.log('\n== 任务与主循环 ==');
let runError = null;
try {
  sandbox.Game.startMission(0);
} catch (e) {
  runError = e;
}
if (runError) {
  fail('startMission(0) 抛出异常 —— ' + runError.message + '\n' + runError.stack);
} else {
  ok('startMission(0) 成功');
}

function pump(frames) {
  for (let i = 0; i < frames; i++) {
    const q = rafQ;
    rafQ = [];
    if (!q.length) break;
    q.forEach(fn => fn(Date.now() + i * 16));
  }
}

try {
  pump(240);
  ok('主循环推进 240 帧无异常');
} catch (e) {
  fail('主循环抛出异常 —— ' + e.message + '\n' + e.stack);
}

/* ============================================================
   挂载系统
   ============================================================ */
console.log('\n== 挂载系统 ==');

const WEAPONS = sandbox.WEAPONS, AIRCRAFT = sandbox.AIRCRAFT;

// 每种武器都要能算重量与挂载量
let badStore = 0;
for (const k in WEAPONS) {
  const w = WEAPONS[k];
  if (w.kind === 'gun') continue;
  if (!w.fits || w.perPoint === undefined || w.mass === undefined) {
    fail('武器 ' + k + ' 缺少 fits / perPoint / mass');
    badStore++;
  }
}
if (!badStore) ok('全部武器都有挂载属性');

// 每个挂载点组都得有武器挂得上，且成对
let badGroup = 0;
for (const ac of AIRCRAFT) {
  if (!ac.hardpointGroups || !ac.hardpointGroups.length) {
    fail('机型 ' + ac.id + ' 没有挂载点组'); badGroup++; continue;
  }
  for (const g of ac.hardpointGroups) {
    if (g.pts.length % 2 !== 0) {
      fail('机型 ' + ac.id + ' 组' + g.id + ' 的点数是奇数，齐射数不会是偶数');
      badGroup++;
    }
    const okW = Object.keys(WEAPONS).some(k =>
      WEAPONS[k].kind !== 'gun' && WEAPONS[k].fits.indexOf(g.kind) >= 0);
    if (!okW) { fail('机型 ' + ac.id + ' 组' + g.id + ' 无可用武器'); badGroup++; }
  }
}
if (!badGroup) ok('每个机型的挂载点组都有效且成对');

// 玩家出击后应当拿到武器列表与弹药池
try {
  const p = sandbox.Game.__player();
  if (!p) fail('取不到玩家对象');
  else if (!p.loadoutList || !p.loadoutList.length) {
    fail('玩家出击后没有挂载武器列表');
  } else {
    let sum = 0;
    for (const e of p.loadoutList) {
      sum += e.salvo;
      if (!p.ammoPool || p.ammoPool[e.wid] === undefined) {
        fail('武器 ' + e.wid + ' 没有弹药池');
      }
      if (e.salvo !== e.points) {
        fail('武器 ' + e.wid + ' 的齐射数 ' + e.salvo + ' 与挂载点数 ' + e.points + ' 不一致');
      }
      if (e.salvo % 2 !== 0 && e.points > 1) {
        fail('武器 ' + e.wid + ' 的齐射数是奇数 ' + e.salvo);
      }
    }
    ok('武器列表：' + p.loadoutList.map(e => e.w.name + '×' + e.ammo + '(齐射' + e.salvo + ')').join(' '));
  }
} catch (e) {
  fail('挂载状态检查抛出异常 —— ' + e.message);
}

// 检查世界确实动起来了
try {
  const world = sandbox.Game.__world ? sandbox.Game.__world() : null;
  if (world) {
    ok('世界状态：飞行器 ' + world.actors.length +
      ' · 导弹 ' + world.missiles.length +
      ' · 粒子 ' + world.particles.length);
  }
} catch (e) { /* 调试接口可选 */ }

/* ============================================================
   结果
   ============================================================ */
console.log('');
if (problems.length) {
  console.log('\x1b[31m✗ 冒烟测试失败：' + problems.length + ' 项\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✓ 冒烟测试全部通过\x1b[0m\n');
  process.exit(0);
}
