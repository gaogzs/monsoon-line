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
    className: '', textContent: '',
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
  /* innerHTML 的 setter 必须清空 children ——
     真实的 DOM 会这么做，而只改字符串属性的话，
     重复构建（比如每次进机库）会让子元素越积越多，
     测试里就会看到"8 行应该是 4 行"这种假故障。 */
  Object.defineProperty(el, 'innerHTML', {
    get() { return el.__html; },
    set(v) { el.__html = String(v); el.children.length = 0; }
  });
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

/* 用自己推进的假时钟，而不是 Date.now()。
   原来每次 pump 都传 Date.now()，连续调 pump(1) 时时间戳几乎不变，
   于是 dt≈0、飞机不动 —— 卡死检测因此误报过。 */
let fakeClock = Date.now();
function pump(frames) {
  for (let i = 0; i < frames; i++) {
    const q = rafQ;
    rafQ = [];
    if (!q.length) break;
    fakeClock += 16;
    q.forEach(fn => fn(fakeClock));
  }
}

try {
  pump(240);
  ok('主循环推进 240 帧无异常');
} catch (e) {
  fail('主循环抛出异常 —— ' + e.message + '\n' + e.stack);
}

/* ---- 卡死检测：不能有飞机长时间停在原地 ----
   曾经出现过"有些敌人突然定在一个点不动"。
   位置来自 pos += vel*dt，所以停下只有两种可能：
   speed 归零，或者 vel 变成 NaN。这里跑一段较长的模拟，
   记录每架飞机连续静止的帧数，超过阈值就把它当时的
   状态整个打出来。 */
try {
  const fin = v => typeof v === 'number' && isFinite(v);
  const nanBad = [], stuckBad = [], dupeInFrame = [];
  let worst = 0, seen = 0;

  // 包装 stepAircraft，统计每架飞机究竟被处理了多少帧。
  // 主循环里读的就是 Ent.stepAircraft，所以包装是有效的。
  const origStepAircraft = sandbox.Ent.stepAircraft;
  const stepCount = new Map();
  sandbox.Ent.stepAircraft = function (a, dt, w) {
    stepCount.set(a, (stepCount.get(a) || 0) + 1);
    return origStepAircraft(a, dt, w);
  };

  // 三个任务都跑一遍 —— 有些问题只在特定任务的 AI 编成下出现
  for (const mi of [0, 1, 2]) {
    try { sandbox.Game.startMission(mi); } catch (e) { continue; }

    const tracks = new Map();
    let lastTime = null;
    for (let f = 0; f < 900; f++) {
      pump(1);
      const frameSeen = new Set();

      /* 任务结束（坠机/完成）之后 update() 就不再推进世界时间，
         这时所有飞机都会"静止" —— 那是正常的，不是卡死。
         判据用 world.time 是否还在走，比猜状态机可靠。 */
      const W = sandbox.Game.__world();
      if (lastTime !== null && W.time === lastTime) {
        tracks.forEach(t => { t.still = 0; t.prevObj = null; });
        continue;
      }
      lastTime = W.time;

      /* 模拟交战：定期给敌机扣血。
         真实游戏里敌人会挨打、「被击中后转逃离」这类分支才会走到，
         而之前只让它们追一个静止玩家，根本触发不到。 */
      if (f % 90 === 45) {
        const foes = W.actors.filter(x => x.team === 1 && x.alive);
        if (foes.length) {
          sandbox.Ent.damage(foes[(f / 90) % foes.length | 0], 25, W, null);
        }
      }
      for (const a of sandbox.Game.__world().actors) {
        if (!a.alive) continue;

        // 同一帧里同一个对象出现两次 = 数组里有重复
        if (frameSeen.has(a)) {
          if (!dupeInFrame.includes(a.name || a.id)) dupeInFrame.push(a.name || a.id);
        }
        frameSeen.add(a);

        // NaN 一旦出现就会污染位置，之后那架飞机要么消失要么卡在一点
        if (!fin(a.pos.x) || !fin(a.pos.y) || !fin(a.pos.z) ||
            !fin(a.speed) || !fin(a.fwd.x) || !fin(a.fwd.y) || !fin(a.fwd.z)) {
          if (nanBad.length < 3) {
            nanBad.push('任务' + (mi + 1) + ' ' + (a.name || a.id) +
              ' 出现非有限值：speed=' + a.speed +
              ' pos=(' + a.pos.x + ',' + a.pos.y + ',' + a.pos.z + ')' +
              ' fwd=(' + a.fwd.x + ',' + a.fwd.y + ',' + a.fwd.z + ')' +
              ' ctrl=' + JSON.stringify(a.ctrl));
          }
          continue;
        }

        let t = tracks.get(a);
        if (!t) { t = { prev: a.pos, still: 0, max: 0 }; tracks.set(a, t); }
        else {
          // pos 每帧都会被重新赋值（M3.add 返回新对象）。
          // 如果引用没变，说明 stepAircraft 根本没走到位置那一行。
          t.sameObj = (a.pos === t.prevObj);
          const d = sandbox.M3.dist(a.pos, t.prev);
          t.prevObj = a.pos;
          t.prev = a.pos;
          t.lastD = d;
          // 正常飞行每帧移动几十厘米以上；接近 0 才算静止
          if (d < 0.02) {
            if (t.still === 0) t.snap = a.pos;      // 记下开始静止时的位置
            t.still++;
            if (t.still > t.max) t.max = t.still;
          } else t.still = 0;
        }
      }
    }

    seen += tracks.size;
    for (const [a, t] of tracks) {
      if (t.max > worst) worst = t.max;
      if (t.max > 60 && stuckBad.length < 3) {
        stuckBad.push('任务' + (mi + 1) + ' ' + (a.name || a.id) +
          ' 连续静止 ' + t.max + ' 帧' +
          '  speed=' + a.speed.toFixed(2) +
          '  ctrl=' + JSON.stringify(a.ctrl) +
          '  fwd=(' + a.fwd.x.toFixed(3) + ',' + a.fwd.y.toFixed(3) + ',' + a.fwd.z.toFixed(3) + ')' +
          '  vel=(' + a.vel.x.toFixed(1) + ',' + a.vel.y.toFixed(1) + ',' + a.vel.z.toFixed(1) + ')' +
          '  pos=(' + a.pos.x.toFixed(0) + ',' + a.pos.y.toFixed(0) + ',' + a.pos.z.toFixed(0) + ')' +
          '  throttle=' + (a.throttle === undefined ? '?' : a.throttle) +
          '  静止起点pos=' + (t.snap
            ? '(' + t.snap.x.toFixed(1) + ',' + t.snap.y.toFixed(1) + ',' + t.snap.z.toFixed(1) + ')'
            : '?') +
          '  帧间位移=' + (t.lastD === undefined ? '?' : t.lastD.toFixed(4)) +
          '  pos引用未变=' + t.sameObj +
          '  alive=' + a.alive + ' dead=' + a.dead +
          '  ai.mode=' + (a.ai ? a.ai.mode : '无') +
          '  被step次数=' + (stepCount.get(a) || 0));
      }
    }
  }

  // world.actors 里不该有重复条目 —— 如果有，说明某个 spawn
  // 被调用了两次，数组里会躺着永远不被处理（或处理两次）的幽灵
  {
    const seenActors = new Set();
    const dupes = [];
    for (const a of sandbox.Game.__world().actors) {
      if (seenActors.has(a)) dupes.push(a.name || a.id);
      seenActors.add(a);
    }
    if (dupes.length) fail('world.actors 里有重复条目：' + dupes.join('、'));
  }

  sandbox.Ent.stepAircraft = origStepAircraft;

  nanBad.forEach(fail);
  stuckBad.forEach(fail);
  dupeInFrame.forEach(n => fail('同一帧里 ' + n + ' 出现两次'));
  if (!nanBad.length && !stuckBad.length && !dupeInFrame.length) {
    ok('卡死检测：三任务共 ' + seen + ' 架次，最长静止 ' + worst + ' 帧，无 NaN');
  }
} catch (e) {
  fail('卡死检测抛出异常 —— ' + e.message + '\n' + e.stack);
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

// 可发射的武器必须有飞行参数。
// PEJ-30 曾经是 speed:0 / life:99 —— 那样它在游戏里根本不往前走。
// 注意排除吊舱：ECM 与 DEW 不发射实体，没有 speed/life 是正常的。
{
  let bad = 0;
  for (const k in WEAPONS) {
    const w = WEAPONS[k];
    if (w.kind === 'gun' || w.passive) continue;
    if (w.kind === 'ecm' || w.kind === 'dew') continue;
    if (!w.speed || !w.life) {
      fail('武器 ' + k + '（' + w.name + '）缺少飞行参数：speed=' +
        w.speed + ' life=' + w.life);
      bad++;
    }
  }
  if (!bad) ok('全部可发射武器都有 speed / life');
}

// 冷却时间表要覆盖所有可发射武器 ——
// 漏掉的话那件武器会保留 data.js 里写的原始 cd，
// 而那个值可能是按旧语义（一次齐射打光）定的，会快得离谱
{
  const tbl = sandbox.STORE_COOLDOWN || {};
  const missing = [];
  for (const k in WEAPONS) {
    const w = WEAPONS[k];
    if (w.kind === 'gun' || w.passive) continue;
    if (!w.fits || !w.fits.length) continue;
    if (!(k in tbl)) missing.push(k + '(' + w.name + ')');
  }
  if (missing.length) fail('这些武器没写进 STORE_COOLDOWN：' + missing.join('、'));
  else ok('冷却时间表覆盖全部可发射武器');
}

// 有制导方式的武器都该有导引品质（lead）
// 注意：被动吊舱和 ECM/DEW 本来就不制导，不该要求它们有 lead
{
  let bad = 0;
  for (const k in WEAPONS) {
    const w = WEAPONS[k];
    if (w.kind === 'gun' || w.passive) continue;
    if (w.seeker === 'none') continue;
    if (w.lead === undefined) { fail('武器 ' + k + ' 有导引方式但没有导引品质 lead'); bad++; }
  }
  if (!bad) ok('全部制导武器都有导引品质字段');
}

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
const world = sandbox.Game.__world ? sandbox.Game.__world() : null;
try {
  if (world) {
    ok('世界状态：飞行器 ' + world.actors.length +
      ' · 导弹 ' + world.missiles.length +
      ' · 粒子 ' + world.particles.length);
  }
} catch (e) { /* 调试接口可选 */ }

/* ============================================================
   干扰与导弹机动性
   —— 这两件事直接影响"躲不躲得掉"，必须能客观测出来，
      而不是靠手感争论
   ============================================================ */
console.log('\n== 干扰与机动 ==');

const Ent = sandbox.Ent, M3 = sandbox.M3;
const me = sandbox.Game.__player();

if (Ent && M3 && me && world) {
  // 红外弹面对干扰弹的失锁率
  // 采样数要够：400 次时 σ≈2.2%，6 个百分点的容差偶尔会被涨落撞破
  const N = 1500;
  for (const wid of ['dl6', 'v9']) {
    let lost = 0;
    for (let i = 0; i < N; i++) {
      const m = Ent.makeMissile({
        weapon: wid, team: 1, pos: M3.V(me.pos.x, me.pos.y, me.pos.z - 900),
        fwd: M3.V(0, 0, 1), speed: 320, target: me, owner: null
      });
      m.team = 1;
      world.missiles.length = 0;
      world.particles.length = 0;      // 别让粒子堆到几千个
      world.missiles.push(m);
      me.flares = 80; me.flareCd = 0;
      Ent.breakLock(me, world);
      if (!m.target) lost++;
    }
    const want = WEAPONS[wid].flare;      // flare 本身就是被干扰的概率
    const rate = lost / N;
    // 1500 次采样，σ≈1.1%，允许 ±4 个百分点
    /* 容差 5%。

       1500 次二项采样在 p≈0.5 时 σ ≈ 1.29%，原来取 4%（3.1σ）
       意味着大约每 500 次运行就会误报一次 —— 实测确实偶发。
       放宽到 5%（3.9σ）把误报压到万分之一量级，
       而真正的实现错误（比如系数写反）偏差远大于 5%，照样抓得住。 */
    if (Math.abs(rate - want) > 0.05) {
      fail(wid + ' 干扰成功率 ' + (rate * 100).toFixed(0) +
        '%，但按 flare=' + WEAPONS[wid].flare + ' 应该是 ' + (want * 100).toFixed(0) + '%');
    } else {
      ok(wid + ' 干扰成功率 ' + (rate * 100).toFixed(0) + '%（预期 ' + (want * 100).toFixed(0) + '%）');
    }
  }

  /* ---- 雷达弹也吃干扰弹（箔丝），但比红外弹更难骗 ----
     干扰弹是热焰弹与箔丝一起投放的：前者骗红外导引头，后者骗雷达。
     早先的实现直接跳过了所有雷达弹，等于把箔丝当不存在。 */
  {
    const N = 1200;
    const runRate = (wid) => {
      const pl = sandbox.Game.__player();
      const w2 = sandbox.Game.__world();
      let lost = 0;
      for (let i = 0; i < N; i++) {
        const mm = Ent.makeMissile({
          weapon: wid, team: 1,
          pos: M3.V(pl.pos.x, pl.pos.y, pl.pos.z - 900),
          fwd: M3.V(0, 0, 1), speed: 320, target: pl, owner: null
        });
        mm.team = 1;
        w2.missiles.length = 0;
        w2.particles.length = 0;
        w2.missiles.push(mm);
        pl.flares = 80; pl.flareCd = 0;
        Ent.breakLock(pl, w2);
        if (!mm.target) lost++;
      }
      return lost / N;
    };

    const irRate = runRate('srm');       // 红外
    const rdRate = runRate('mrm');       // 雷达
    // flare 就是被干扰的概率，不需要再变换
    const wantIR = WEAPONS.srm.flare;
    const wantRD = WEAPONS.mrm.flare;

    const bad = [];
    if (Math.abs(irRate - wantIR) > 0.045) {
      bad.push('红外弹 ' + (irRate * 100).toFixed(0) + '%，预期 ' + (wantIR * 100).toFixed(0) + '%');
    }
    if (Math.abs(rdRate - wantRD) > 0.045) {
      bad.push('雷达弹 ' + (rdRate * 100).toFixed(0) + '%，预期 ' + (wantRD * 100).toFixed(0) + '%');
    }
    // 数据侧的一致性：抗干扰改型应当比基础弹更难骗
    if (WEAPONS.trm.flare >= WEAPONS.srm.flare) {
      bad.push('TOR-4（抗干扰改型）的 flare 不低于 TOR-2（基础弹），数据本身反了');
    }

    if (bad.length) bad.forEach(fail);
    else {
      ok('箔丝有效：雷达弹 ' + (rdRate * 100).toFixed(0) + '% 被干扰，' +
        '红外弹 ' + (irRate * 100).toFixed(0) + '%');
    }
  }

  /* ---- 飞控：前下方目标应当推杆俯冲 ---- */
  {
    const AI = sandbox.AI;
    const a = {
      fwd: M3.V(0, 0, 1), up: M3.V(0, 1, 0), right: M3.V(1, 0, 0)
    };
    const out = { pitch: 0, roll: 0, yaw: 0 };

    // 目标：机头前方、略微偏下
    const d1 = M3.norm(M3.V(0, -0.15, 0.99));
    AI.steerTo(a, d1, out, null);
    if (out.pitch >= -0.05) {
      fail('前下方的目标没有让飞机俯下（pitch=' + out.pitch.toFixed(3) + '）');
    } else if (Math.abs(out.roll) > 0.35) {
      fail('轻微下压触发了大幅滚转（roll=' + out.roll.toFixed(3) +
        '）—— 会变成滚筒，而不是俯冲');
    } else {
      ok('前下方目标 → 推杆俯冲（pitch=' + out.pitch.toFixed(2) +
        ' roll=' + out.roll.toFixed(2) + '）');
    }

    // 目标：正前方偏上，仍应拉杆
    const d2 = M3.norm(M3.V(0, 0.4, 0.92));
    AI.steerTo(a, d2, out, null);
    if (out.pitch <= 0.05) fail('前上方的目标没有让飞机抬头（pitch=' + out.pitch.toFixed(3) + '）');
    else ok('前上方目标 → 拉杆抬头（pitch=' + out.pitch.toFixed(2) + '）');

    // 目标：正左方，应当滚转
    const d3 = M3.norm(M3.V(-1, 0, 0));
    AI.steerTo(a, d3, out, null);
    if (Math.abs(out.roll) < 0.4) fail('正侧方目标没有触发滚转（roll=' + out.roll.toFixed(3) + '）');
    else ok('正侧方目标 → 滚转对齐（roll=' + out.roll.toFixed(2) + '）');
  }

  /* ---- 机库的选装面板 ---- */
  {
    // 上一步已经点进过机库，选装面板应当已经渲染
    const picker = byId.get('hpPicker');
    const list = byId.get('hpList');
    if (!picker) {
      fail('index.html 缺少 #hpPicker');
    } else {
      const cards = picker.children.filter(c => /pk-card/.test(c.className || ''));
      if (!cards.length) {
        fail('选装面板没有生成任何卡片');
      } else {
        let noRole = 0, noDesc = 0;
        cards.forEach(c => {
          if (!/pk-role/.test(c.innerHTML)) noRole++;
          if (!/pk-d/.test(c.innerHTML)) noDesc++;
        });
        if (noRole) fail(noRole + ' 张挂载卡片缺少定位行');
        else if (noDesc) fail(noDesc + ' 张挂载卡片缺少简介');
        else ok('选装面板：' + cards.length + ' 张卡片，均含定位与简介');
      }

      // 左栏每个挂载点组都要有一行
      if (!list) fail('index.html 缺少 #hpList');
      else {
        const rows = list.children.filter(c => /hp-row/.test(c.className || ''));
        const want = sandbox.AIRCRAFT.filter(a => !a.npcOnly)[0].hardpointGroups.length;
        if (rows.length !== want) {
          fail('挂载点组列表有 ' + rows.length + ' 行，应该是 ' + want + ' 行');
        } else {
          ok('挂载点组列表 ' + rows.length + ' 行');
        }
      }
    }
  }

  /* ---- 追尾镜头必须真的落到渲染器上 ----
     这条测试防的是一类特别隐蔽的 bug：镜头算对了，但紧接着被
     另一条分支覆盖 —— 曾经 `else if (camMode === 1)` 被误改成独立的 `if`，
     于是 camMode===0 掉进了目标视角的 else，而那里写死世界 up，
     画面完全退回"地平线永远水平"。

     上面那组三断言测试拦不住这种情况，因为它们只复现 camMode===0 的
     计算过程，根本没经过分支。这里改从渲染器读最终结果。 */
  {
    const Game = sandbox.Game, R = sandbox.Renderer;
    Game.startMission(0);
    pump(1);

    /* 拦截 setCamera，看**最后生效的那一次**传的是什么 up。

       判据不能是"倾斜度是否够大"—— 那个值随飞机姿态浮动，
       制造出 bug 时实测仍有 0.99，同样通过。
       但写死世界 up 的目标视角传的是精确的 (0,1,0)，
       而追尾镜头传的是 slerpDir 的平滑结果，几乎不可能正好等于它。
       所以"是否精确等于 (0,1,0)"是个干净得多的判据。 */
    /* 判据是**调用次数**，不是 up 的取值。

       试过"up 的倾斜度"：受飞机姿态影响太大，制造出 bug 时实测仍有 0.99。
       试过"up 是否精确等于 (0,1,0)"：飞机水平时机体 up 就等于世界 up，
       两者根本区分不开，正常情况也会误报。

       而分支结构本身有个干净的特征：camMode===0 只应该调用一次 setCamera。
       一旦那样写错，追尾镜头算完之后目标视角又调了一次，变成两次。 */
    const orig = R.setCamera;
    let calls = 0, ups = [];
    R.setCamera = function (pos, fwd, up, fov) {
      calls++;
      ups.push(up.x.toFixed(2) + ',' + up.y.toFixed(2) + ',' + up.z.toFixed(2));
      return orig(pos, fwd, up, fov);
    };

    pump(1);
    R.setCamera = orig;

    if (calls === 0) fail('本帧没有任何 setCamera 调用');
    else if (calls > 1) {
      fail('一帧内 setCamera 被调用了 ' + calls + ' 次（' + ups.join(' / ') +
        '）—— 追尾镜头算完之后又被另一条分支覆盖');
    } else {
      ok('追尾镜头是唯一生效的相机（本帧 1 次 setCamera）');
    }
  }

  /* ---- 追尾镜头：稳定水平 + 俯仰限位 ----
     相机 up 恒为世界 up，所以**无论飞机怎么滚转，地平线都不动**。
     俯仰被钳在 ±78°，视线因此永远不会与世界 up 共线、正交基不会退化。

     限位附近最容易出的毛病是来回抽动，所以要检查两件事：
     一是地平线在整个过程中是否真的纹丝不动，
     二是俯仰扫到限位时 up 的帧间差够不够小。 */
  {
    const M3 = sandbox.M3;
    const dt = 1 / 60;
    const CAM_PITCH_LIM = 78 * Math.PI / 180;
    const SIN_LIM = Math.sin(CAM_PITCH_LIM);
    const bad = [];

    // 复现 updateCamera 里 camMode===0 的那段
    function track(steps, pose) {
      let yawBase = 0, pitchSm = null, camFwd = M3.V(0, 0, 1);
      let maxJump = 0, prev = null, maxY = 0, maxTiltOfUp = 0;
      for (let i = 0; i < steps; i++) {
        const fwd = pose(i);
        const hx = fwd.x, hz = fwd.z;
        const hlen = Math.sqrt(hx * hx + hz * hz);

        if (hlen > 0.12) {
          const tYaw = Math.atan2(hx, hz);
          let dYaw = tYaw - yawBase;
          while (dYaw > Math.PI) dYaw -= Math.PI * 2;
          while (dYaw < -Math.PI) dYaw += Math.PI * 2;
          yawBase += dYaw * (1 - Math.exp(-1.2 * dt));
          if (yawBase > Math.PI) yawBase -= Math.PI * 2;
          if (yawBase < -Math.PI) yawBase += Math.PI * 2;
        }

        let pa = Math.atan2(fwd.y, Math.max(hlen, 1e-4));
        pa = Math.min(CAM_PITCH_LIM, Math.max(-CAM_PITCH_LIM, pa));
        if (pitchSm === null) pitchSm = pa;
        pitchSm += (pa - pitchSm) * (1 - Math.exp(-9 * dt));

        const cp = Math.cos(pitchSm), sp = Math.sin(pitchSm);
        camFwd = M3.V(Math.sin(yawBase) * cp, sp, Math.cos(yawBase) * cp);

        const fy = Math.min(SIN_LIM, Math.max(-SIN_LIM, camFwd.y));
        const fh2 = camFwd.x * camFwd.x + camFwd.z * camFwd.z;
        if (fh2 > 1e-8) {
          const fhz = Math.sqrt(fh2);
          const fsc = Math.sqrt(Math.max(0, 1 - fy * fy)) / fhz;
          camFwd = M3.V(camFwd.x * fsc, fy, camFwd.z * fsc);
        }
        maxY = Math.max(maxY, Math.abs(camFwd.y));

        const cam = M3.makeCamera(M3.V(0, 0, -52), camFwd, M3.V(0, 1, 0), 100, 100, 56);
        maxTiltOfUp = Math.max(maxTiltOfUp, Math.hypot(cam.up.x, cam.up.z));
        const s = [cam.up.x, cam.up.y, cam.up.z];
        if (prev) {
          let d = 0;
          for (let k = 0; k < 3; k++) d += Math.abs(s[k] - prev[k]);
          if (d > maxJump) maxJump = d;
        }
        prev = s;
      }
      return { maxJump, maxY, maxTiltOfUp };
    }

    /* 姿态输入用**真实角速度**。
       dPitch = p.pitch · ctrl · dt ≈ 0.76/60 ≈ 0.0127 rad/帧。
       一阶低通滤的是突变而不是斜坡，用超现实的扫掠速度去测，
       测出来的只会是测试参数的问题（这个坑踩过一次）。 */
    const PITCH_RATE = 0.0127;
    const ROLL_RATE = 0.045;

    // 1. 飞机滚转一整圈 —— 地平线必须纹丝不动
    {
      const r = track(600, (i) => {
        const ang = i * ROLL_RATE;
        const f = M3.V(0, 0, 1);
        // 用正交化保证 up 真的与 fwd 垂直（模拟机体基）
        const up = M3.norm(M3.rotAxis(M3.V(0, 1, 0), f, ang));
        return M3.V(f.x, f.y, f.z);
      });
      if (r.maxTiltOfUp > 0.02) {
        bad.push('滚转时地平线歪了（up 的水平分量峰值 ' + r.maxTiltOfUp.toFixed(3) + '）');
      }
      if (r.maxJump > 0.02) bad.push('滚转时镜头在动（帧间差 ' + r.maxJump.toFixed(3) + '）');
    }

    // 2. 俯仰扫到限位再回来 —— 不能抽动，也不能越过限位
    {
      const r = track(900, (i) => {
        const a = CAM_PITCH_LIM * Math.sin(i * PITCH_RATE * 1.6);
        return M3.V(0, Math.sin(a), Math.cos(a));
      });
      if (r.maxJump > 0.12) bad.push('俯仰扫到限位时镜头帧间差 ' + r.maxJump.toFixed(3));
      if (r.maxY > SIN_LIM + 1e-6) {
        bad.push('视线越过了限位：|y| 峰值 ' + r.maxY.toFixed(4) + ' > ' + SIN_LIM.toFixed(4));
      }
    }

    // 3. 直接垂直（正上/正下）—— 这是当初"极点卡动"的场景
    {
      const r = track(600, (i) => {
        const a = (i / 600) * Math.PI;        // 0 → 180°，穿过正上方
        return M3.V(0, Math.sin(a), Math.cos(a));
      });
      if (r.maxJump > 0.12) bad.push('穿越极点时镜头帧间差 ' + r.maxJump.toFixed(3));
      if (r.maxY > SIN_LIM + 1e-6) bad.push('穿越极点时视线越界：|y| ' + r.maxY.toFixed(4));
    }

    if (bad.length) bad.forEach(fail);
    else ok('追尾镜头：地平线稳定、俯仰钳在 78°、全程不抽动');
  }


  /* ---- 轰炸机：沿航线飞、到点投弹、不参与空战 ----
     它和所有其他单位都不一样：没有目标选择、没有追击、没有规避。
     存在的全部意义就是"能不能飞到位"，而玩家的全部任务就是"别让它飞到"。 */
  {
    const M3 = sandbox.M3;
    const AI = sandbox.AI;
    const bad = [];

    function m2() {
      sandbox.Game.startMission(1);
      return sandbox.Game.__world();
    }

    // 1. 第二关应当存在一架带航线的轰炸机，且基地是一个可攻击实体
    {
      const w = m2();
      const bmb = w.actors.filter(a => a.route && a.alive);
      if (bmb.length !== 2) bad.push('M2 应该有 2 架轰炸机，实际 ' + bmb.length);
      if (!w.baseTarget) bad.push('M2 没有设置基地目标');
      else if (!w.baseTarget.alive) bad.push('基地一开局就是毁的');
    }

    // 2. 轰炸机不得自己选目标、不得开加力缠斗
    {
      const w = m2();
      const bmb = w.actors.find(a => a.route && a.alive);
      for (let i = 0; i < 120; i++) AI.update(bmb, 1 / 60, w);
      if (bmb.ai.target) bad.push('轰炸机自己选了目标 —— 它不该有空战逻辑');
      if (bmb.ab) bad.push('轰炸机开了加力 —— 它不追人');
    }

    // 3. 飞到投弹点后应当真的伤到基地
    {
      const w = m2();
      const bmb = w.actors.find(a => a.route && a.alive);
      const hp0 = w.baseTarget.hp;
      // 直接挪到投弹点附近，省掉八十多秒的航程
      bmb.pos = M3.add(bmb.route.wp, M3.V(0, 700, 2200));
      for (let i = 0; i < 30; i++) AI.update(bmb, 1 / 60, w);
      if (w.baseTarget.hp >= hp0) {
        bad.push('轰炸机抵达投弹点后基地未受损（hp ' + hp0 + ' → ' + w.baseTarget.hp + '）');
      }
      if (bmb.route.phase !== 'egress') {
        bad.push('投弹后没有转入脱离，phase=' + bmb.route.phase);
      }
    }

    // 4. 投弹两次足以摧毁基地，且摧毁后判定为失败
    {
      const w = m2();
      const bmb = w.actors.find(a => a.route && a.alive);
      Ent.damage(w.baseTarget, 100000, w, bmb);
      const ms = sandbox.MISSIONS[1];
      if (w.baseTarget.alive) bad.push('基地承受致命伤害后仍然存活');
      else if (!ms.lose(w)) bad.push('基地被摧毁后没有判定为任务失败');
    }

    // 5. 基地健在且玩家存活时，不应误判失败
    {
      const w = m2();
      if (sandbox.MISSIONS[1].lose(w)) bad.push('基地健在、玩家存活时误判为失败');
    }

    if (bad.length) bad.forEach(fail);
    else ok('轰炸机行为正确：沿航线飞、到点投弹、击毁基地即判负');
  }

  /* ---- 无人僚机：授权开火 + 长机阵亡后盘旋 ----
     它和有人僚机的根本差别是"没有判断力"：
     目标只能来自长机授权，长机死了也不会自己找架打。 */
  {
    const AI = sandbox.AI, M3 = sandbox.M3;

    function scenario() {
      const w = { actors: [], missiles: [], particles: [], targets: [], time: 0 };
      const lead = Ent.makeAircraft({
        type: 'c11', team: 0, x: 0, y: 5000, z: 0,
        fwd: M3.V(0, 0, 1), speed: 300
      });
      const foe = Ent.makeAircraft({
        type: 'm27', team: 1, x: 0, y: 5000, z: 3000,
        fwd: M3.V(0, 0, -1), speed: 300
      });
      const drone = Ent.makeAircraft({
        type: 'ucav', team: 0, x: 140, y: 5025, z: -190,
        fwd: M3.V(0, 0, 1), speed: 300
      });
      w.player = lead;
      w.actors.push(lead, foe, drone);
      AI.attach(drone, {
        role: 'drone', skill: 0.6,
        formation: { dx: 140, dy: 25, dz: -190 }
      });
      return { w, lead, foe, drone };
    }

    const bad = [];

    // 1. 长机没锁定时，无人机不得有任何目标
    {
      const s = scenario();
      s.lead.target = null;
      for (let i = 0; i < 5; i++) AI.update(s.drone, 1 / 60, s.w);
      if (s.drone.ai.target) bad.push('长机未锁定时，无人机自己找到了目标');
    }

    // 2. 长机锁定后，无人机继承的必须是同一个目标
    {
      const s = scenario();
      s.lead.target = s.foe;
      for (let i = 0; i < 5; i++) AI.update(s.drone, 1 / 60, s.w);
      if (s.drone.ai.target !== s.foe) bad.push('长机锁定后，无人机没有继承该目标');
    }

    // 3. 长机阵亡后，无人机不得自主接战，且不能朝敌人逼近
    {
      const s = scenario();
      s.lead.target = s.foe;
      AI.update(s.drone, 1 / 60, s.w);
      s.lead.alive = false;
      s.drone.ai.target = null;

      const d0 = M3.dist(s.drone.pos, s.foe.pos);
      let minD = d0;
      for (let i = 0; i < 180; i++) {          // 3 秒
        AI.update(s.drone, 1 / 60, s.w);
        Ent.stepAircraft(s.drone, 1 / 60, s.w);
        if (s.drone.ai.target) { bad.push('长机阵亡后，无人机自己选了目标'); break; }
        const d = M3.dist(s.drone.pos, s.foe.pos);
        if (d < minD) minD = d;
      }
      // 盘旋不该让它冲向敌人
      if (minD < d0 * 0.55) {
        bad.push('长机阵亡后无人机仍在向敌人逼近（' +
          Math.round(d0) + 'm → ' + Math.round(minD) + 'm）');
      }
    }

    // 4. 长机健在时，无人机应当留在编队附近
    {
      const s = scenario();
      const d0 = M3.dist(s.drone.pos, s.lead.pos);
      let maxD = d0;
      for (let i = 0; i < 240; i++) {          // 4 秒
        AI.update(s.drone, 1 / 60, s.w);
        Ent.stepAircraft(s.drone, 1 / 60, s.w);
        Ent.stepAircraft(s.lead, 1 / 60, s.w);
        maxD = Math.max(maxD, M3.dist(s.drone.pos, s.lead.pos));
      }
      if (maxD > 1200) {
        bad.push('无人机跟丢了长机：编队距离拉到 ' + Math.round(maxD) + 'm');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('无人僚机行为正确：授权开火、长机阵亡后盘旋、编队不脱队');
  }

  /* ---- 鼠标压到屏幕下方 → 改用滚转仰起 ----
     这个行为踩过一次坑：原判据是目标方向的 ux 阈值（-0.62），
     但鼠标能指到的最大下方角度只有**半个 FOV** ——
     FOV 56° 时归一化后 ux 最小只有 -0.47，永远够不到，
     所以"移到屏幕底部还是俯下"。

     现在按鼠标在屏幕上的归一化位置判断，与 FOV 无关，
     这条断言就是锁住那个解耦。 */
  {
    const M3 = sandbox.M3, AI = sandbox.AI;
    const bad = [];

    // 给定 FOV 与鼠标纵向位置（0=屏幕中心，1=底边），返回是否走了滚转
    function rolls(FOV, k) {
      const H = 720;
      const focal = (H / 2) / Math.tan(FOV / 2 * Math.PI / 180);
      const cy = -(k * (H / 2)) / focal;
      const dir = M3.norm(M3.V(0, cy, 1));
      const a = {
        fwd: M3.V(0, 0, 1), up: M3.V(0, 1, 0), right: M3.V(1, 0, 0),
        ctrl: { pitch: 0, roll: 0, yaw: 0 },
        rollLock: undefined, aimDown: k
      };
      AI.steerTo(a, dir, a.ctrl, a);
      return Math.abs(a.ctrl.roll) > 0.35;
    }

    // 1. 屏幕中部到偏下：应当推杆俯下
    for (const k of [0.3, 0.5, 0.7, 0.8]) {
      if (rolls(56, k)) bad.push('鼠标在 ' + (k * 100) + '% 处就触发了滚转');
    }
    // 2. 压到底部：必须走滚转仰起
    if (!rolls(56, 0.95)) bad.push('鼠标压到屏幕底部仍未触发滚转仰起');
    // 3. 换 FOV 结果必须一致（这是解耦的关键）
    for (const FOV of [38, 56, 100]) {
      const mid = rolls(FOV, 0.5), bottom = rolls(FOV, 0.95);
      if (mid) bad.push('FOV ' + FOV + ' 下屏幕中部误触发滚转');
      if (!bottom) bad.push('FOV ' + FOV + ' 下屏幕底部未触发滚转');
    }

    if (bad.length) bad.forEach(fail);
    else ok('鼠标压到屏幕下方改用滚转仰起（三种 FOV 下一致）');
  }

  /* ---- 挂架上的实物：冷却中应当是空的 ----
     以前挂载只存在于 HUD 的俯视缩略图里，飞机模型永远是干净的。
     现在按挂点渲染实体，槽就绪时挂着、冷却中是空的。
     这条断言数的是"渲染器实际收到的模型数"，所以能真的抓到
     "打完弹机身外观没变化"这类问题。 */
  {
    const R = sandbox.Renderer;
    let calls = 0;
    const orig = R.pushModel;
    R.pushModel = function (mdl, pos, fwd, up, opts) {
      calls++;
      return orig(mdl, pos, fwd, up, opts);
    };

    sandbox.Game.startMission(0);
    const pl = sandbox.Game.__player();

    pump(1);
    const before = calls;

    // 把所有发射槽全部打进冷却
    for (const wid in (pl.slotCd || {})) {
      const arr = pl.slotCd[wid];
      for (let i = 0; i < arr.length; i++) arr[i] = 999;
    }
    calls = 0;
    pump(1);
    const after = calls;

    R.pushModel = orig;

    if (after >= before) {
      fail('打空所有发射槽后，渲染的模型数没有减少（' +
        before + ' → ' + after + '）—— 挂架上的实物没跟着消失');
    } else {
      ok('挂架实物随冷却变化：' + before + ' → ' + after + ' 个模型');
    }
  }

  /* ---- 储备打光后，挂架不再恢复 ----
     发射槽数 = 挂点数，而储备弹数可能刚好等于它（perPoint = 1 时）。
     打光之后那几个槽不该再"装填完成" —— 仓库里确实没有弹了。
     让它们停在冷却状态最省事，但那样 HUD 会一直显示"装填中"，等于说谎。 */
  {
    const Ent2 = sandbox.Ent, M3e = sandbox.M3;
    const bad = [];
    const dt = 1 / 60;
    const w0 = { missiles: [], particles: [], actors: [], targets: [] };

    function make(slots, pool) {
      const a = Ent2.makeAircraft({
        type: 'c11', team: 0, x: 0, y: 6000, z: 0,
        fwd: M3e.V(0, 0, 1), speed: 300
      });
      a.slotCd.srm = slots.slice();
      a.ammoPool = { srm: pool };
      a.special = 'srm';
      // 把 phys 之外的依赖备齐，stepAircraft 要用
      a.phys = a.phys || sandbox.AIRCRAFT[0].phys;
      return a;
    }

    // 1. 打光（pool = 0）：所有槽停在冷却里，永远不归零
    {
      const a = make([3, 3], 0);
      for (let i = 0; i < 900; i++) Ent2.stepAircraft(a, dt, w0);   // 15 秒
      if (a.slotCd.srm.some(v => v === 0)) {
        bad.push('弹打光后挂架仍然恢复了（' + a.slotCd.srm.join(',') + '）');
      }
    }

    // 2. 库存充足：正常装填完成
    {
      const a = make([3, 0], 3);
      for (let i = 0; i < 300; i++) Ent2.stepAircraft(a, dt, w0);
      if (a.slotCd.srm[0] !== 0) {
        bad.push('库存充足时挂架没能装填完成（剩余 ' + a.slotCd.srm[0].toFixed(2) + '）');
      }
    }

    // 3. 储备刚好够再装一发：应当恢复，但恢复后不再有多余的弹
    {
      const a = make([3, 3], 1);
      for (let i = 0; i < 900; i++) Ent2.stepAircraft(a, dt, w0);
      const ready = a.slotCd.srm.filter(v => v === 0).length;
      if (ready > 1) {
        bad.push('储备只剩 1 发，却有 ' + ready + ' 个挂架恢复了');
      } else if (ready < 1) {
        bad.push('储备还有 1 发，却没有任何挂架恢复');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('挂架装填受储备弹数约束：打光不恢复、有弹才装填');
  }

  /* ---- 诊断：AI 到底用不用机炮 ---- */
  {
    const Ent2 = sandbox.Ent, M3d = sandbox.M3, Wd = sandbox.WEAPONS;
    let aiFire = 0, plFire = 0;
    let hasTarget = 0, inRange = 0, inCone = 0, flag = 0;
    const orig = Ent2.fireGun;
    Ent2.fireGun = function (a, w) {
      if (a.team === 1) aiFire++; else plFire++;
      return orig(a, w);
    };

    sandbox.Game.startMission(0);
    const w2 = sandbox.Game.__world();
    for (let f = 0; f < 1800; f++) {          // 30 秒
      pump(1);
      for (const a of w2.actors) {
        if (a.team !== 1 || !a.alive || !a.ai) continue;
        const t = a.ai.target;
        if (!t || !t.alive) continue;
        hasTarget++;
        const d = M3d.dist(a.pos, t.pos);
        const off = M3d.angleBetween(a.fwd, M3d.norm(M3d.sub(t.pos, a.pos)));
        const gw = Wd[a.gun];
        const gr = (a.pos.y > 18000 ? gw.highRange : gw.range);
        if (d < gr) inRange++;
        if (d < gr * 0.9 && off < 0.118) inCone++;
        if (a.firingGun) flag++;
      }
    }
    Ent2.fireGun = orig;
    ok('诊断 有目标 ' + hasTarget + ' · 进射程 ' + inRange +
      ' · 进锥 ' + inCone + ' · 标志位 ' + flag + ' · 实开火 ' + aiFire);
  }

  /* ---- 命名体系（设定集 8.1）----
     装备编号一律取逻辑语三字母词根，机型用「单字母 + 序号」。
     两份表分开，所以 C-11（飞机）和 CEL-3（机炮）不会混。
     词根表在这里硬编码而不是从现有编号推导 ——
     推导出来的话，新武器用错词根就测不出来了。 */
  {
    const RAFSI = ['CEL', 'TOR', 'SUT', 'GIR', 'CLA', 'SPO', 'GUT', 'PEJ',
      'GUS', 'ZUN', 'DAR', 'BIN', 'BAD', 'CAV', 'DIL'];
    // 上游：按用途分类，同用途共用首字母；舰载型在尾部追加一个字母
    const UP_PREFIX = ['D', 'DB', 'F', 'G', 'KA'];
    // 下游：按设计局分类
    const DOWN_PREFIX = ['ROK', 'GAL', 'VAC'];
    const bad = [];

    sandbox.AIRCRAFT.forEach(a => {
      const m = a.name.match(/^([A-Z]+)-(\d+)$/);
      if (a.faction === '上游公约') {
        if (!m) bad.push('上游机型 ' + a.name + ' 不是「前缀-序号」格式');
        else if (UP_PREFIX.indexOf(m[1]) < 0) {
          bad.push('上游机型 ' + a.name + ' 的用途前缀 ' + m[1] + ' 不在表里');
        }
      } else if (a.faction === '下游同盟') {
        if (!m) bad.push('下游机型 ' + a.name + ' 不是「厂商前缀-序号」格式');
        else if (DOWN_PREFIX.indexOf(m[1]) < 0) {
          bad.push('下游机型 ' + a.name + ' 的设计局前缀 ' + m[1] + ' 不在表里');
        }
      } else {
        // 分水群岛国用商品名、管理局用批次名，都不该出现「字母-数字」
        if (m) bad.push(a.faction + ' 的 ' + a.name + ' 不该用「字母-数字」编号');
      }
    });

    // 舰载型必须是「用途字母 + 追加字母」，不能凭空冒出别的双字母
    sandbox.AIRCRAFT.forEach(a => {
      const m = a.name.match(/^([A-Z]{2})-/);
      if (m && UP_PREFIX.indexOf(m[1]) < 0) {
        bad.push('机型 ' + a.name + ' 用了未登记的双字母前缀 ' + m[1]);
      }
    });

    for (const k in WEAPONS) {
      const w = WEAPONS[k];
      const m = w.name.match(/^([A-Z]{3})-(\d+)$/);
      if (!m) { bad.push('武器 ' + w.name + ' 不是「三字母 rafsi - 序号」格式'); continue; }
      if (RAFSI.indexOf(m[1]) < 0) {
        bad.push('武器 ' + w.name + ' 的前缀 ' + m[1] + ' 不是逻辑语词根');
      }
    }

    if (bad.length) bad.slice(0, 5).forEach(fail);
    else ok('命名体系一致：机型两字母 rafsi、武器三字母 rafsi');
  }

  /* ---- 挂载的机体能力门槛 ---- */
  {
    const playable = sandbox.AIRCRAFT.filter(a => !a.npcOnly);
    const bad = [];

    // 1. 默认配置必须全部合法
    playable.forEach(a => {
      const dlo = a.defaultLoadout || {};
      for (const gid in dlo) {
        const w = WEAPONS[dlo[gid]];
        if (w && !sandbox.canCarry(a, w)) {
          bad.push(a.name + ' 默认带 ' + w.name + '，但缺少 ' + w.needs.join('/'));
        }
      }
    });

    // 2. 门槛必须真的起作用，不能形同虚设
    let blockedAny = 0;
    playable.forEach(a => {
      for (const k in WEAPONS) {
        const w = WEAPONS[k];
        if (w.needs && w.needs.length && !sandbox.canCarry(a, w)) blockedAny++;
      }
    });
    if (!blockedAny) bad.push('能力门槛形同虚设：没有任何武器被任何机型挡住');

    // 3. 盯住最初提出的那个例子
    const capOnly = playable.find(a => a.cn === '旗鱼');
    if (!capOnly) {
      bad.push('找不到制空机「旗鱼」，测试失去意义');
    } else if (sandbox.canCarry(capOnly, WEAPONS.lcm)) {
      bad.push('制空机「旗鱼」居然能挂远程巡航弹 GUT-30 —— 门槛没生效');
    }

    if (bad.length) bad.forEach(fail);
    else ok('机体能力门槛生效（含"制空机挂不了重型巡航弹"），共挡下 ' + blockedAny + ' 处');
  }

  /* ---- 挂载性能系数 ---- */
  {
    const lp0 = sandbox.loadoutPenalty(0);
    const lp1 = sandbox.loadoutPenalty(1);
    const bad = [];
    if (lp0.accel !== 1 || lp0.pitch !== 1 || lp0.vMax !== 1 || lp0.vStall !== 1) {
      bad.push('空载时不该有任何损失');
    }
    if (!(lp1.accel < lp1.pitch && lp1.pitch < lp1.roll)) {
      bad.push('惩罚权重排序不对：加速应当最重、滚转最轻（现在界面只显示俯仰那一项）');
    }
    if (!(lp1.vStall > 1)) bad.push('满载时失速速度应当升高');
    if (bad.length) bad.forEach(fail);
    else ok('挂载性能系数：空载无损、满载加速 −26% 最重、失速速度升高');
  }

  /* ---- 六维条必须随挂载变化 ---- */
  {
    const statsEl = byId.get('acStats');
    if (!statsEl) {
      fail('index.html 缺少 #acStats');
    } else {
      const base = statsEl.__html || '';
      const picker2 = byId.get('hpPicker');
      const cards2 = picker2
        ? picker2.children.filter(c => /pk-card/.test(c.className || ''))
        : [];

      // 逐个试：只要有一种挂载让六维条变了，就说明它是动态算的
      let changed = false;
      for (const c of cards2) {
        c.fire('click');
        if ((byId.get('acStats').__html || '') !== base) { changed = true; break; }
      }
      if (!changed) {
        fail('换了挂载但六维条纹丝不动 —— 面板显示的是机型的固有值，不是实际配置');
      } else {
        ok('六维条随挂载变化');
      }
    }
  }

  /* ---- 敌机的呼号与型号不能混为一谈 ---- */
  {
    let bad = 0, withCall = 0, noCall = 0;
    for (const a of world.actors) {
      if (a.team === 0) continue;

      // 呼号必须是人或编制的名字，格式为"中文 + 英文代号"
      if (a.label) {
        withCall++;
        if (!/[A-Z]{3,}/.test(a.label)) {
          fail('敌机呼号格式可疑：' + a.label);
          bad++;
        }
      } else {
        noCall++;
      }

      // name 是型号。出现" xxx 3"这种尾巴就说明内部下标漏出来了
      if (/\s\d+$/.test(a.name)) {
        fail('敌机名字像是内部编号：' + a.name);
        bad++;
      }
    }
    if (!bad) {
      ok('敌机命名正常（有呼号 ' + withCall + ' · 无呼号 ' + noCall + '）');
    }
  }

  /* ---- 资料库：动态生成的图鉴必须能跑 ---- */
  {
    const C = sandbox.CODEX || [];
    const dyn = C.filter(e => typeof e.build === 'function');
    if (!dyn.length) {
      fail('资料库里没有动态生成的条目（装备图鉴）');
    } else {
      let bad = 0;
      for (const e of dyn) {
        try {
          const h = e.build();
          if (!h || h.length < 200) {
            fail('图鉴「' + e.title + '」生成的内容只有 ' + (h ? h.length : 0) + ' 字符');
            bad++;
          }
        } catch (err) {
          fail('图鉴「' + e.title + '」抛异常 —— ' + err.message);
          bad++;
        }
      }
      if (!bad) ok('资料库动态条目全部可生成（' + dyn.length + ' 条）');
    }
  }

  // 切换挂载：既不能崩，也不能靠切枪跳过装填
  {
    const p = sandbox.Game.__player();
    const kd = docListeners['keydown'] || [];
    if (!kd.length) {
      fail('没有捕获到 keydown 监听器，切枪测试无法进行');
    } else if (!p.loadoutList || p.loadoutList.length < 2) {
      ok('只有一种挂载，跳过切枪测试');
    } else {
      const start = p.special;
      const slots0 = p.slotCd[start];
      slots0[0] = 3.0;
      p.spCd = Math.min.apply(null, slots0);

      // 按满一圈 R 应当回到起点
      for (let i = 0; i < p.loadoutList.length; i++) {
        kd.forEach(fn => fn({ code: 'KeyR', preventDefault() {} }));
      }
      // 注意检查的是槽数组，不是 spCd ——
      // spCd 取"最快就绪的槽"，这里只给槽 0 上了冷却，所以它是 0 才是对的
      const back = p.slotCd[start];
      if (p.special !== start) {
        fail('按 R 循环一圈后没有回到起始武器（' + start + ' → ' + p.special + '）');
      } else if (!back || back[0] < 2.5) {
        fail('切枪把装填时间清掉了（槽0=' +
          (back ? back[0].toFixed(2) : '无') + '）—— 那等于无冷却连射');
      } else {
        ok('切枪不会跳过装填（回到 ' + start + ' 时槽0 仍剩 ' +
          back[0].toFixed(1) + 's）');
      }
    }
  }

  /* ---- 发射槽：一次打一枚，各槽独立冷却 ---- */
  {
    const p = sandbox.Game.__player();
    const e = p.loadoutList[0];
    const slots = p.slotCd[e.wid];

    // 槽数必须等于该武器占用的挂载点总数
    if (!slots || slots.length !== e.points) {
      fail(e.wid + ' 的发射槽有 ' + (slots ? slots.length : 0) +
        ' 个，应该等于挂载点数 ' + e.points);
    } else {
      ok('发射槽数 = 挂载点数（' + e.wid + ' ' + slots.length + ' 个）');
    }

    // 找一个目标，然后连续按发射键 —— 每次应当只出 1 枚，
    // 而且总共只能出"槽数"枚（之后全部在装填）
    const foe = world.actors.find(a => a.team !== p.team && a.alive);
    if (!foe) {
      fail('世界里没有敌方目标，发射槽测试无法进行');
    } else {
      slots.forEach((v, i) => { slots[i] = 0; });
      p.spAmmo = 99;
      let fired = 0;
      const N = slots.length + 2;
      for (let i = 0; i < N; i++) {
        const n0 = world.missiles.length;
        world.fireMissile(p, foe);
        if (world.missiles.length > n0) fired++;
      }
      if (fired !== slots.length) {
        fail('连按 ' + N + ' 次打出了 ' + fired + ' 枚，应该正好 ' + slots.length +
          ' 枚（每槽一枚，打满后要等装填）');
      } else {
        ok('连按出 ' + fired + ' 枚后全部槽进入装填，每次只出 1 枚');
      }
    }
  }

  // 导弹急转应当掉速
  {
    const m = Ent.makeMissile({
      weapon: 'dl6', team: 1, pos: M3.V(0, 5000, 0),
      fwd: M3.V(0, 0, 1), speed: 900, target: null, owner: null
    });
    // 必须落在"超过动力段但还没到寿命"的窗口里：
    // age 超过 life 会被直接回收，那就什么都测不到了
    m.age = WEAPONS.dl6.life + 2;
    const speed0 = m.speed;
    // 假世界要带齐 stepMissile 会用到的容器
    const fake = {
      actors: [{ alive: true, team: 0, pos: M3.V(0, 5000, 60), vel: M3.V(0, 0, 0) }],
      particles: [], missiles: [], bullets: []
    };
    m.target = fake.actors[0];
    // 把目标放在正侧方，逼它满过载转弯
    fake.actors[0].pos = M3.V(400, 5000, 0);
    for (let i = 0; i < 30; i++) Ent.stepMissile(m, 1 / 60, fake);
    const drop = speed0 - m.speed;
    if (drop < 15) fail('导弹急转只掉了 ' + drop.toFixed(1) + ' m/s，等于不耗能量');
    else ok('导弹急转 0.5 s 掉速 ' + drop.toFixed(0) + ' m/s（会为机动付出代价）');
  }
} else {
  fail('拿不到 Ent / world，跳过干扰测试');
}

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
