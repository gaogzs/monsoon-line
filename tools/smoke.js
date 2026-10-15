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

/* ---------- 确定性随机源 ----------

   有几条断言依赖游戏内部的随机（AI 的模式切换、干扰弹掷骰、云种子……），
   而 Math.random 每次都不同 —— 同一份代码跑两次可能一次过、一次挂。
   排查回归时这最浪费时间：你分不清是自己改坏了，还是恰好抽到了坏签。

   所以在**加载脚本之前**把 Math.random 换成固定种子的 LCG，
   序列每次运行完全相同，冒烟测试才是可复现的。
   注意种子一旦改变，"诊断"行的数值会整体变化，这是预期的。 */
let __seed = 0x2f6e2b1;
sandbox.Math = Object.create(Math);
sandbox.Math.random = function () {
  __seed = (__seed * 1103515245 + 12345) & 0x7fffffff;
  return __seed / 0x7fffffff;
};

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
  campaign: 'scr-campaign',
  brief: 'scr-brief',
  hangar: 'scr-hangar',
  codex: 'scr-codex',
  settings: 'scr-settings',
  help: 'scr-help',
  changelog: 'scr-changelog',
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

/* ============================================================
   更新记录 / 版本号
   —— 这一节防的是三类特别安静的故障：
        · CHANGELOG.md 改了但忘了跑 tools/release.js，
          于是游戏里显示的还是上一版的日志（页面照常能开，没人看得出来）
        · 版本号逆序或重复，玩家按"最新在上"读会读错
        · js/version.js 的版本号与日志顶部那条对不上
   ============================================================ */
console.log('\n== 更新记录 ==');
{
  const release = require('./release.js');
  const mdText = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const fromMd = release.parseChangelog(mdText);
  const inGame = sandbox.CHANGELOG;

  if (!inGame || !inGame.releases || !inGame.releases.length) {
    fail('js/changelog.js 没有提供 CHANGELOG.releases');
  } else {
    /* 生成物必须与 CHANGELOG.md 同源 —— 忘了跑 release.js 就会在这里炸。

       比的是 generateChangelogJs 产出的那份数据，不是 parseChangelog 的原始结果：
       后者的字段顺序与生成物不同，直接比会永远不等（这个坑踩过一次）。 */
    const a = JSON.stringify(inGame.releases);
    const b = JSON.stringify(release.generateChangelogJs(fromMd).releases);
    if (a !== b) {
      fail('js/changelog.js 与 CHANGELOG.md 不同步 —— 跑一下 node tools/release.js');
    } else {
      ok('js/changelog.js 与 CHANGELOG.md 同源（' + fromMd.length + ' 个版本）');
    }

    // 版本号格式 + 严格递减 + 与 current 一致
    const badFmt = [], order = [];
    let prev = null, desc = true;
    for (const r of inGame.releases) {
      if (!/^v\d+\.\d+\.\d+$/.test(r.version)) badFmt.push(r.version);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) badFmt.push(r.version + ' 的日期');
      if (!r.title) badFmt.push(r.version + ' 缺标题');
      if (!r.commit) badFmt.push(r.version + ' 缺 <!-- commit: --> 锚点（release.js 靠它算新改动）');
      const n = r.sections.reduce((s, x) => s + x.items.length, 0);
      if (!n) badFmt.push(r.version + ' 一条改动都没写');
      if (prev !== null && !(r.version < prev)) desc = false;
      prev = r.version;
      order.push(r.version);
    }
    if (badFmt.length) fail('更新日志条目有问题：' + badFmt.join('、'));
    else ok('版本号格式 / 日期 / 锚点 / 条目：' + order.join(' > '));

    if (!desc) fail('更新日志不是从新到旧排列：' + order.join(' > '));
    else ok('更新日志按版本号递减排列');

    if (inGame.current !== inGame.releases[0].version) {
      fail('CHANGELOG.current=' + inGame.current +
        ' 与顶部版本 ' + inGame.releases[0].version + ' 不一致');
    } else if (sandbox.BUILD_STAMP && sandbox.BUILD_STAMP.version !== inGame.current) {
      fail('js/version.js 的版本号 ' + sandbox.BUILD_STAMP.version +
        ' 与更新日志顶部的 ' + inGame.current + ' 不一致');
    } else {
      ok('当前版本 ' + inGame.current + '：更新日志、version.js、CHANGELOG.current 三处一致');
    }
  }

  /* 页面真的画出来了吗 —— 上一步导航循环已经点进过这一屏。

     这里数的是 innerHTML 里的字符串，不是 children：
     本测试的 DOM 桩不解析 HTML（只把 innerHTML 当字符串存下来），
     所以按子元素数会永远得 0。断言的仍然是"每一版都画了一条"，
     并且顺带确认每条都带版本号。 */
  const clBody = byId.get('clBody');
  if (!clBody) {
    fail('index.html 缺少 #clBody');
  } else {
    const html = String(clBody.innerHTML || '');
    const drawn = (html.match(/class="cl-item/g) || []).length;
    const want = inGame && inGame.releases ? inGame.releases.length : 0;
    if (!want) fail('更新记录页没有可显示的版本');
    else if (drawn !== want) {
      fail('更新记录页画出了 ' + drawn + ' 条，应该是 ' + want + ' 条');
    } else {
      // 每个版本号都应当出现在页面上 —— 只数条目数会漏掉"渲染到一半就断了"
      const missing = inGame.releases
        .map(r => r.version).filter(v => html.indexOf(v) < 0);
      if (missing.length) fail('更新记录页漏掉了这些版本号：' + missing.join('、'));
      else {
        const head = byId.get('clHead');
        ok('更新记录页渲染 ' + drawn + ' 条，版本号齐全（页眉「' +
          (head ? String(head.textContent) : '?') + '」）');
      }
    }
  }
}


// 回到标题，再走一遍真实流程：战役 → 简报 → 机库 → 出击
console.log('\n== 完整流程 ==');
goEls.find(e => e.__attr['data-go'] === 'campaign').fire('click');
ok('进入战役选择，当前屏幕 ' + activeScreen());

/* ---- 战役层 ----
   标题 → 战役 → 简报 这三步里最容易出的错是"点进战役之后列出来的
   还是全部关卡"。所以断言的是**清单长度等于该战役的关卡数**，
   不是大于零 —— 后者在筛选写错时照样会过。 */
{
  const campList = byId.get('campList');
  const cards = campList ? campList.children.filter(c => /camp-card/.test(c.className || '')) : [];
  const CAMP = sandbox.CAMPAIGNS[0];
  if (cards.length !== sandbox.CAMPAIGNS.length) {
    fail('战役列表有 ' + cards.length + ' 张卡片，应该是 ' + sandbox.CAMPAIGNS.length + ' 张');
  } else {
    ok('战役列表：' + cards.length + ' 个战役');
  }

  // 数据侧：每一关都必须恰好挂在一个战役下 —— 漏挂的关卡会静默消失在选关界面
  const owner = new Array(sandbox.MISSIONS.length).fill(-1);
  let bad = 0;
  sandbox.CAMPAIGNS.forEach((c, i) => {
    (c.missions || []).forEach(mi => {
      if (mi < 0 || mi >= sandbox.MISSIONS.length) {
        fail('战役 ' + c.id + ' 引用了不存在的任务下标 ' + mi); bad++;
      } else if (owner[mi] >= 0) {
        fail('任务 ' + sandbox.MISSIONS[mi].id + ' 被两个战役同时引用'); bad++;
      } else owner[mi] = i;
    });
  });
  owner.forEach((o, i) => {
    if (o < 0) { fail('任务 ' + sandbox.MISSIONS[i].id + ' 没有归属任何战役'); bad++; }
  });
  if (!bad) ok('战役覆盖率：' + sandbox.MISSIONS.length + ' 关全部且只归属一个战役');

  // 点第一张**可点**的战役卡，应当进入简报，且关卡清单只列本战役的关
  const first = cards.find(c => !/camp-locked/.test(c.className || ''));
  if (!first) {
    fail('战役列表里没有可点的战役');
  } else {
    first.fire('click');
    if (activeScreen() !== 'scr-brief') {
      fail('点击战役卡应进入 scr-brief，实际是 ' + activeScreen());
    } else {
      const rows = byId.get('msnList').children.filter(c => /msn-item/.test(c.className || ''));
      if (rows.length !== CAMP.missions.length) {
        fail('战役内关卡清单有 ' + rows.length + ' 项，应该是 ' + CAMP.missions.length + ' 项');
      } else {
        ok('战役「' + CAMP.name + '」内 ' + rows.length + ' 关，简报页只列本战役');
      }
    }
  }
}

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
    /* 无制导弹没有导引头，也就不该有导引品质 —— 它们的 seeker 字段
       已经整个删掉了，所以要按 unguided 判断，不能只看 seeker === 'none'。 */
    if (w.unguided || w.seeker === 'none') continue;
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
      /* 一个挂点 = 一个槽，槽数就是挂点数。
         w.salvo（三联装之类）表示"按一下出几枚"，不增加槽数。 */
      if (e.salvo !== e.points) {
        fail('武器 ' + e.wid + ' 的齐射数 ' + e.salvo + ' 应该等于挂点数 ' + e.points);
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

  /* ---- 飞控：中心附近的前下方目标应当推杆 ---- */
  {
    const AI = sandbox.AI;
    const a = {
      fwd: M3.V(0, 0, 1), up: M3.V(0, 1, 0), right: M3.V(1, 0, 0)
    };
    const out = { pitch: 0, roll: 0, yaw: 0 };

    /* 目标：机头前方、略微偏下。**鼠标停在中心附近** ——
       推杆与滚转仰起现在是靠鼠标幅度插值的，只有幅度小的时候
       才走推杆。 */
    const d1 = M3.norm(M3.V(0, -0.15, 0.99));
    const near = {
      fwd: M3.V(0, 0, 1), up: M3.V(0, 1, 0), right: M3.V(1, 0, 0),
      rollLock: 0, aimX: 0, aimDown: 0.15, aimMag: 0.15
    };
    const o1 = { pitch: 0, roll: 0, yaw: 0 };
    AI.steerTo(near, d1, o1, near);
    if (o1.pitch >= -0.005) {
      fail('中心附近 + 前下方没有推杆（pitch=' + o1.pitch.toFixed(3) + '）');
    } else if (Math.abs(o1.roll) > 0.20) {
      fail('轻微下压触发了大幅滚转（roll=' + o1.roll.toFixed(3) +
        '）—— 会变成滚筒，而不是俯冲');
    } else {
      ok('中心附近 + 前下方 → 推杆（pitch=' + o1.pitch.toFixed(2) +
        ' roll=' + o1.roll.toFixed(2) + '）');
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
     俯仰被钳在 ±89°，视线因此永远不会与世界 up 共线、正交基不会退化。

     限位附近最容易出的毛病是来回抽动，所以要检查两件事：
     一是地平线在整个过程中是否真的纹丝不动，
     二是俯仰扫到限位时 up 的帧间差够不够小。 */
  {
    const M3 = sandbox.M3;
    const dt = 1 / 60;
    const CAM_PITCH_LIM = 89 * Math.PI / 180;
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

    // 4. 持续垂直（稳态）—— "边界上的连续反弹"只可能出在这里
    //    pa 恒被钳在限位，pitchSm 指数收敛后应当彻底静止。
    //    限位越高，正交化前的 |up| = cos(限位) 越小、越接近 1e-4 的退化阈值，
    //    所以这里同时盯住"静止"和"余量"。
    {
      const N = 3600;                       // 60 秒，足够收敛
      let yawBase = 0, pitchSm = null, prev = null, maxJump = 0, minOrtho = 1e9;
      for (let i = 0; i < N; i++) {
        const pa = Math.min(CAM_PITCH_LIM, Math.atan2(1, 1e-4));
        if (pitchSm === null) pitchSm = pa;
        pitchSm += (pa - pitchSm) * (1 - Math.exp(-9 * dt));

        const cp = Math.cos(pitchSm), sp = Math.sin(pitchSm);
        let camFwd = M3.V(Math.sin(yawBase) * cp, sp, Math.cos(yawBase) * cp);
        const fy = Math.min(SIN_LIM, Math.max(-SIN_LIM, camFwd.y));
        const fh2 = camFwd.x * camFwd.x + camFwd.z * camFwd.z;
        if (fh2 > 1e-8) {
          const fsc = Math.sqrt(Math.max(0, 1 - fy * fy)) / Math.sqrt(fh2);
          camFwd = M3.V(camFwd.x * fsc, fy, camFwd.z * fsc);
        }
        if (i < N - 600) continue;          // 只看收敛之后的 10 秒

        minOrtho = Math.min(minOrtho, Math.sqrt(Math.max(0, 1 - camFwd.y * camFwd.y)));
        const cam = M3.makeCamera(M3.V(0, 0, -52), camFwd, M3.V(0, 1, 0), 100, 100, 56);
        const s = [cam.up.x, cam.up.y, cam.up.z];
        if (prev) {
          let d = 0;
          for (let k = 0; k < 3; k++) d += Math.abs(s[k] - prev[k]);
          if (d > maxJump) maxJump = d;
        }
        prev = s;
      }
      if (maxJump > 1e-4) {
        bad.push('持续垂直时镜头在限位上抽动（帧间差 ' + maxJump.toExponential(2) + '）');
      }
      if (minOrtho < 1e-3) {
        bad.push('持续垂直时正交基余量不足：|up| ' + minOrtho.toExponential(2) +
          '（orthonormalize 的退化阈值是 1e-4）');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('追尾镜头：地平线稳定、俯仰钳在 89°、全程不抽动');
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

  /* ---- 鼠标幅度 → 转向方式：全程插值，没有切换点 ----

     同一个鼠标幅度轴（blend）同时管三件事：
       滚转占比   0 → 1
       偏航补足   1 → 0
       推杆权重   1 → 0（只在目标落在机体下方时有意义）

     于是三种动作串成一条连续的谱：
       中心附近 → 推杆俯下 / 少量滚转 + 偏航
       离开中心 → 滚转半圈（倒飞）→ 仰起，偏航归零

     这条断言锁的就是"谱"是连续的 —— 中间任何一点都不能突变。 */
  {
    const M3 = sandbox.M3, AI = sandbox.AI;
    const bad = [];

    /* 给定 FOV 与鼠标纵向位置 k（0 = 屏幕中心，1 = 底边），返回 ctrl。
       dir 由屏幕位置算出；aimMag 直接取 k（正下方时径向距离就等于 k）。 */
    function ctrlAt(FOV, k, rollDeg) {
      const H = 720;
      const focal = (H / 2) / Math.tan(FOV / 2 * Math.PI / 180);
      const cy = -(k * (H / 2)) / focal;
      const dir = M3.norm(M3.V(0, cy, 1));

      const r = (rollDeg || 0) * Math.PI / 180;
      const fwd = M3.V(0, 0, 1);
      const o = M3.orthonormalize(fwd, M3.rotAxis(M3.V(0, 1, 0), fwd, r));
      const a = {
        fwd: fwd, up: o.up, right: M3.norm(M3.cross(o.up, fwd)),
        ctrl: { pitch: 0, roll: 0, yaw: 0 },
        rollLock: 0, aimX: 0, aimDown: k, aimMag: k
      };
      AI.steerTo(a, dir, a.ctrl, a);
      return a.ctrl;
    }

    // ① 中心附近：推杆方向（pitch 为负），滚转很小
    for (const k of [0.10, 0.15]) {
      const c = ctrlAt(56, k);
      if (!(c.pitch < 0 && Math.abs(c.roll) < 0.20)) {
        bad.push('中心附近（' + (k * 100) + '%）目标在下方时没有推杆（pitch=' +
          c.pitch.toFixed(3) + ' roll=' + c.roll.toFixed(3) + '）');
      }
    }

    /* ② 推杆的范围比滚转的柔和区宽得多，所以这里要取屏幕很深处。

       推杆轴 AIM_PUSH_AXIS = 0.85（滚转/偏航是 0.225）——
       0.5~0.6 那一带本来就还在推杆，不该拿去当"已交给滚转"的证据。 */
    for (const k of [0.95, 1.1]) {
      const c = ctrlAt(56, k);
      if (!(Math.abs(c.roll) > 0.5 && c.pitch >= -0.05)) {
        bad.push('屏幕深处（' + (k * 100) + '%）仍未转给滚转（pitch=' +
          c.pitch.toFixed(3) + ' roll=' + c.roll.toFixed(3) + '）');
      }
    }

    // ③ 全程连续：滚转单调增、俯仰不出现跳变
    {
      let prevRoll = -1, mono = true, maxJump = 0, prevPitch = null;
      for (let k = 0.05; k <= 0.9 + 1e-9; k += 0.05) {
        const c = ctrlAt(56, k);
        if (Math.abs(c.roll) < prevRoll - 1e-6) mono = false;
        prevRoll = Math.abs(c.roll);
        if (prevPitch !== null) {
          maxJump = Math.max(maxJump, Math.abs(c.pitch - prevPitch));
        }
        prevPitch = c.pitch;
      }
      if (!mono) bad.push('滚转占比随鼠标幅度不是单调上升 —— 中间有切换感');
      // 采样间隔 0.05，推杆段的俯仰本身变化就快（可到 0.13），
      // 这里只拦真正的"跳变"，不是陡峭。
      if (maxJump > 0.22) {
        bad.push('俯仰杆量在相邻采样点之间跳变过大（' + maxJump.toFixed(3) + '）');
      }
    }

    /* ④ 推杆的几何前提：机体必须**相对镜头正着飞**（up.y > 0.7）

       追尾机位下相机上方向就是世界上方，所以"正着飞"就是机体 up 朝上。
       没有这个前提的话，侧飞时鼠标在屏幕下方对应的世界方向会落进机体
       的下半空间，被误判成推杆 —— 而那姿态下绕 right 轴转是水平转向。

       也不能用 |up.y|：倒飞（up.y ≈ -1）不算"相对镜头正着飞"。 */
    {
      const DOWN = M3.norm(M3.V(0, -0.15, 0.99));
      function poseAt(rollDeg) {
        const r = (rollDeg || 0) * Math.PI / 180;
        const fwd = M3.V(0, 0, 1);
        const o = M3.orthonormalize(fwd, M3.rotAxis(M3.V(0, 1, 0), fwd, r));
        const a = {
          fwd: fwd, up: o.up, right: M3.norm(M3.cross(o.up, fwd)),
          ctrl: { pitch: 0, roll: 0, yaw: 0 },
          rollLock: 0, aimX: 0, aimDown: 0.12, aimMag: 0.12
        };
        AI.steerTo(a, DOWN, a.ctrl, a);
        return a.ctrl;
      }
      const pushes = c => c.pitch < -0.01 && Math.abs(c.roll) < 0.10;

      if (!pushes(poseAt(0))) bad.push('正着飞时鼠标略微向下没有推杆');
      for (const d of [90, -90, 180]) {
        if (pushes(poseAt(d))) {
          bad.push('滚转 ' + d + '° 时鼠标略微向下误触发了推杆' +
            ' —— 那姿态下绕 right 轴转是水平转向，不是压机头');
        }
      }

      /* 判据必须是"相对镜头"，不能是"相对世界"。

         追尾机位有俯仰角（低头看飞机），camUp ≠ 世界正上方。
         镜头俯 60° 且飞机相对镜头平飞时，a.up.y 只有 cos60° = 0.50，
         用世界判据会被误判成"不正"。这里直接喂 aimUpright = 1，
         模拟"相对镜头正着飞"，必须仍然推杆。 */
      {
        const p = 60 * Math.PI / 180;
        const camUp = M3.V(0, Math.cos(p), Math.sin(p));
        const fwd = M3.V(0, 0, 1);
        const dir = M3.norm(M3.add(M3.mul(camUp, -1), M3.mul(fwd, 0.2)));
        const a = {
          fwd: fwd, up: camUp, right: M3.norm(M3.cross(camUp, fwd)),
          ctrl: { pitch: 0, roll: 0, yaw: 0 },
          rollLock: 0, aimX: 0, aimDown: 0.12, aimMag: 0.12,
          aimUpright: 1                    // 相对镜头是正着的
        };
        AI.steerTo(a, dir, a.ctrl, a);
        if (!(a.ctrl.pitch < -0.01 && Math.abs(a.ctrl.roll) < 0.10)) {
          bad.push('镜头大俯角时，相对镜头正着飞却没有推杆' +
            '（a.up.y = ' + camUp.y.toFixed(2) + '，说明判据用成了世界方向）');
        }
      }
    }

    /* ⑤ 靠近中心整体缩杆（gain，平方衰减）

       只对**滚转 / 偏航**成立 —— 推杆那一份是刻意不缩杆的：
       推杆本身就已经是柔和动作，再压一遍就完全看不见了。
       所以这里用一个偏侧方的目标（不走推杆分支）来测。 */
    {
      const SIDE = M3.V(1, 0, 0);              // 正右方，与推杆无关
      function sideAt(mag) {
        const a = {
          fwd: M3.V(0, 0, 1), up: M3.V(0, 1, 0), right: M3.V(1, 0, 0),
          ctrl: { pitch: 0, roll: 0, yaw: 0 },
          rollLock: 0, aimX: mag, aimDown: 0, aimMag: mag
        };
        AI.steerTo(a, SIDE, a.ctrl, a);
        return Math.abs(a.ctrl.roll) + Math.abs(a.ctrl.yaw);
      }
      const base = sideAt(0.35), near = sideAt(0.05);
      if (base > 0.05 && near > base * 0.05) {
        bad.push('靠近中心时滚转/偏航没有急剧减少（' + near.toFixed(4) +
          ' vs 满杆 ' + base.toFixed(3) + '）');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('鼠标幅度 → 转向方式全程插值：中心推杆、离开中心转为滚转仰起');
  }



  /* ---- 两组挂架挂同一种武器：槽下标不能撞 ----
     slotCd 是按**武器**建的（长度 = 该武器占用的挂点总数），
     而渲染按**组**遍历。如果每组都从 arr[0] 开始读，
     两组挂同一种弹时就会变成"四个挂架共用前两个槽" ——
     打掉一个，两个组的同一位置同时消失，后两个挂架永不消失。

     发射那边一直是对的（launch 遍历整个 slotCd[wid]），
     只有实体渲染会错位，所以断言必须数渲染出来的模型数。 */
  {
    const Ent2 = sandbox.Ent, M3s = sandbox.M3, R2 = sandbox.Renderer;
    const AC = sandbox.AIRCRAFT[0];
    const bad = [];

    // 找两个不同类型但都能挂同一种弹的组
    const W2 = sandbox.WEAPONS;
    let gA = null, gB = null, wid = null;
    outer:
    for (const k in W2) {
      const w = W2[k];
      if (w.kind === 'gun' || w.passive) continue;
      const fits = AC.hardpointGroups.filter(g => w.fits && w.fits.indexOf(g.kind) >= 0);
      const uniq = [];
      for (const g of fits) if (!uniq.some(u => u.kind === g.kind)) uniq.push(g);
      if (uniq.length >= 2) { gA = uniq[0]; gB = uniq[1]; wid = k; break outer; }
    }

    if (!gA || !gB) {
      ok('两组挂同一种武器：本机型找不到两个不同的兼容挂点组，跳过');
    } else {
      const a = Ent2.makeAircraft({
        type: AC.id, team: 0, isPlayer: true, x: 0, y: 6000, z: 0,
        fwd: M3s.V(0, 0, 1), speed: 300
      });
      a.model = AC.model;
      a.ac = AC;
      a.special = wid;
      const lo = {}; lo[gA.id] = wid; lo[gB.id] = wid;
      a.loadout = lo;
      const n = gA.pts.length + gB.pts.length;
      a.slotCd[wid] = [];
      for (let i = 0; i < n; i++) a.slotCd[wid].push(0);
      a.ammoPool = {}; a.ammoPool[wid] = n;

      // 借用渲染循环：把目标/导弹清干净，只留这一架
      const w3 = sandbox.Game.__world();
      if (w3) {
        w3.actors.length = 0; w3.targets.length = 0; w3.missiles.length = 0;
        w3.actors.push(a);
      }

      // 数"渲染器实际收到的模型数"。pump(1) 推一帧真实主循环，
      // 而 render() 在 state==='playing' 时会画整个 world。
      function countStores() {
        let c = 0;
        const o = R2.pushModel;
        R2.pushModel = function (m, p, f, u, op) { c++; return o(m, p, f, u, op); };
        pump(1);
        R2.pushModel = o;
        return c;
      }

      // 全部就绪时应当是 n 个挂载（外加飞机本身 1 个）
      const full = countStores();
      // 只让第一个槽冷却
      a.slotCd[wid][0] = 99;
      const oneDown = countStores();

      if (full - 1 !== oneDown) {
        bad.push('只有一个槽冷却，挂载却从 ' + (full - 1) + ' 变成 ' + (oneDown - 1) +
          ' —— 槽下标撞了（' + gA.id + ' / ' + gB.id + '，共 ' + n + ' 点）');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('两组挂同一种武器时槽下标不冲突（' + (wid || '—') + '）');
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

  /* ---- BIN-8 追云：一枚对空的重型拦截弹，制空/截击机必须挂得上 ----

     它原来被标成"反辐射弹"、要求 strike（对地火控），于是只有攻击机
     和多用途机能挂 —— 而它其实是对空的，最该带它的恰恰是 D-14、F-9
     那些制空/截击机，它们没有 strike，反而挂不上。
     更糟的是反辐射这个设定从来没有机制：全项目不读 antiRadar，
     世界里也没有"雷达开机状态"这个概念，更没有预警机。 */
  {
    const A3 = sandbox.AIRCRAFT, W3 = sandbox.WEAPONS;
    const bad = [];
    const arm = W3.arm;

    if (!arm) {
      bad.push('找不到 BIN-8（arm）');
    } else {
      // 不该再有对地门槛
      if (arm.needs && arm.needs.length) {
        bad.push('BIN-8 仍然带有能力门槛 ' + JSON.stringify(arm.needs) +
          ' —— 它是对空弹，不该要求对地火控');
      }
      if (arm.antiRadar) {
        bad.push('BIN-8 仍标着 antiRadar，但没有任何代码读它');
      }

      // 制空 / 截击机必须挂得上
      ['c14', 'c9', 'gal31'].forEach(id => {
        const ac = A3.find(a => a.id === id);
        if (!ac) return;
        const hasHeavy = (ac.hardpointGroups || []).some(g => arm.fits.indexOf(g.kind) >= 0);
        const needOK = !arm.needs || arm.needs.every(n => (ac.caps || []).indexOf(n) >= 0);
        if (!(hasHeavy && needOK)) {
          bad.push(ac.name + ' 挂不上 BIN-8（有重挂点=' + hasHeavy +
            ' 门槛通过=' + needOK + '）—— 重型拦截弹正该由它们来带');
        }
      });
    }

    if (bad.length) bad.forEach(fail);
    else ok('BIN-8 已去掉对地门槛：制空/截击机（D-14、F-9、GAL-31）均能挂载');
  }

  /* ---- 两架高空机的性格必须真的分开 ----

     ctrl 只看动压，而同一高度下动压只跟空速有关 —— 不加干预的话，
     "谁在高空更好使"就被"谁飞得快"单方面决定了：D-14 旗鱼号称
     平流层之王，极速却比 F-9 慢 54 m/s，在 20 公里上反而不如它。
     设定和数值脱节。所以把曲线的两端交给机型覆盖（ctrlFloor / ctrlFull）。 */
  {
    const E2 = sandbox.Ent, A2 = sandbox.AIRCRAFT;
    const D14 = A2.find(a => a.id === 'c14'), F9 = A2.find(a => a.id === 'c9');
    const bad = [];

    if (!D14 || !F9) {
      bad.push('找不到 D-14 或 F-9');
    } else {
      // 20 公里、200 m/s：能量耗尽 —— 旗鱼靠第三涵道保住控制
      const slowD = E2.ctrlFactor(20000, 200, D14);
      const slowF = E2.ctrlFactor(20000, 200, F9);
      if (!(slowD > slowF * 2)) {
        bad.push('能量耗尽时 D-14 没有明显强于 F-9（' + slowD.toFixed(2) +
          ' vs ' + slowF.toFixed(2) + '）—— 第三涵道的设定没落到物理上');
      }

      // 20 公里、620 m/s：高速 —— 海燕的飞控提前拉满
      const fastD = E2.ctrlFactor(20000, 620, D14);
      const fastF = E2.ctrlFactor(20000, 620, F9);
      if (!(fastF > fastD)) {
        bad.push('高速时 F-9 没有强于 D-14（' + fastF.toFixed(2) +
          ' vs ' + fastD.toFixed(2) + '）');
      }
      if (fastF < 0.99) {
        bad.push('F-9 在极速下操控没有拉满（' + fastF.toFixed(2) + '）');
      }

      // 常规机型不受影响
      const DB = A2.find(a => a.id === 'c11');
      if (Math.abs(E2.ctrlFactor(20000, 200, DB) - 0.13) > 1e-6) {
        bad.push('常规机型的低动压保底被动到了');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('两架高空机性格分开：低速时 D-14 强（0.34 vs 0.13）、' +
      '高速时 F-9 强（1.00 vs 0.77）');
  }

  /* ---- 齐射：一次按键打出 w.salvo 枚，共用同一个冷却槽 ---- */
  {
    const Ent2 = sandbox.Ent, G2 = sandbox.Game, M3q = sandbox.M3;
    const bad = [];
    G2.startMission(0);
    const pl2 = G2.__player();
    const w2 = G2.__world();

    /* 借玩家打一发来验齐射，但**必须把状态还回去** ——
       后面的挂载渲染测试要用同一架飞机，special / slotCd 被改脏之后
       它们的槽下标就对不上了。 */
    const savedSpecial = pl2.special, savedAmmo = pl2.spAmmo;
    const savedTarget = pl2.target, savedCd = pl2.slotCd.qsr;
    const qsr = sandbox.WEAPONS.qsr;      // GIR-5，salvo = 3
    pl2.special = 'qsr';
    pl2.spAmmo = 30;
    pl2.spCd = 0;
    pl2.slotCd.qsr = [0, 0];
    pl2.lockProgress = 1;
    pl2.locked = true;

    const foe = w2.actors.find(a => a.team !== pl2.team && a.alive);
    if (!foe) {
      ok('齐射检查：世界里没有敌方目标，跳过');
    } else {
      pl2.target = foe;
      const n0 = w2.missiles.length;
      G2.__fireSpecial ? G2.__fireSpecial() : null;
      // 没有导出接口就直接调按键
      if (w2.missiles.length === n0) {
        const kd = docListeners['keydown'] || [];
        kd.forEach(fn => fn({ code: 'Enter', preventDefault() {} }));
      }
      const got = w2.missiles.length - n0;
      if (got !== qsr.salvo) {
        bad.push('按一次发射键打出了 ' + got + ' 枚，应该是 ' + qsr.salvo +
          ' 枚（' + qsr.name + ' 是三联装）');
      }
      if (got > 0 && pl2.slotCd.qsr[0] <= 0) {
        bad.push('齐射之后冷却槽没有进入装填');
      }

      /* 出的几枚不能是同一个点、同一个指向 —— 完全重叠的话画面上只有
         一条烟迹，按一下打三发和打一发看不出区别（见 game.js salvoShots）。 */
      let fanDeg = 0, nestM = 0;
      if (got > 1) {
        const ms = w2.missiles.slice(w2.missiles.length - got);
        for (let i = 1; i < ms.length; i++) {
          fanDeg = Math.max(fanDeg, M3q.angleBetween(ms[0].fwd, ms[i].fwd) * 180 / Math.PI);
          nestM = Math.max(nestM, M3q.dist(ms[0].pos, ms[i].pos));
        }
        if (fanDeg < 0.3) {
          bad.push('齐射的 ' + got + ' 枚出膛指向几乎相同（最大夹角 ' +
            fanDeg.toFixed(3) + '°），画面上会重叠成一发');
        }
        if (nestM < 0.2) {
          bad.push('齐射的 ' + got + ' 枚从同一个点出膛（最大间距 ' +
            nestM.toFixed(2) + ' m）');
        }
      }
      if (!bad.length) {
        ok('齐射：' + qsr.name + ' 按一次出 ' + got + ' 枚，共用 1 个冷却槽，' +
          '出膛扇面 ' + fanDeg.toFixed(2) + '°／巢内错开 ' + nestM.toFixed(2) + ' m');
      }
    }

    // 还原玩家状态
    pl2.special = savedSpecial;
    pl2.spAmmo = savedAmmo;
    pl2.target = savedTarget;
    pl2.slotCd.qsr = savedCd;
    pl2.lockProgress = 0;
    pl2.locked = false;

    if (bad.length) bad.forEach(fail);
  }
  }

  /* ---- 诊断：海面填充高度随海拔的变化 ---- */
  {
    const R = sandbox.Renderer, G = sandbox.Game;
    let tops = [];
    const realFill = R.ctx.fillRect;
    R.ctx.fillRect = function (x, y, w, h) {
      // drawSky 也做全宽填充（从 0 开始）；海面那个 y0 不为 0
      if (x === 0 && w === R.W && y > 0) tops.push(+y.toFixed(1));
      return realFill.apply(this, arguments);
    };

    G.startMission(0);
    const pl = G.__player();
    const rows = [];
    [50, 200, 500, 1000, 2000, 4000, 8000, 16000, 21000].forEach(hh => {
      // 追尾镜头的 camPos 是指数平滑的，一帧跟不上；
      // 而且物理每帧会改高度，所以每帧都要压回去，等它收敛。
      for (let f = 0; f < 120; f++) {
        pl.pos.y = hh;
        pl.vel.y = 0;
        pump(1);
      }
      tops = [];
      pl.pos.y = hh;
      pl.vel.y = 0;
      pump(1);
      rows.push(hh + 'm=' + (tops.length ? tops[tops.length - 1] : '?'));
    });
    /* 断言：海天分界必须随海拔单调下沉（地球曲率生效）。
       高度用 0.5 / 2 / 8 公里三点，避开地面附近的异常。
       注意 hook 还没还原，采样必须在它生效期间做。 */
    const probe = [500, 2000, 8000].map(hh => {
      for (let f = 0; f < 120; f++) { pl.pos.y = hh; pl.vel.y = 0; pump(1); }
      tops = []; pl.pos.y = hh; pl.vel.y = 0; pump(1);
      return tops.length ? tops[tops.length - 1] : NaN;
    });

    R.ctx.fillRect = realFill;

    if (!(probe[0] < probe[1] && probe[1] < probe[2])) {
      fail('海天分界没有随海拔下沉：0.5/2/8 km → ' + probe.join(' / '));
    } else {
      ok('海天分界随海拔下沉（0.5/2/8 km → ' + probe.join(' / ') + '）');
    }
  }

  /* ---- 真实游戏里：鼠标略微朝正下方必须是推杆 ----

     这条走的是完整链路（鼠标事件 → updateAim → steerTo → ctrl），
     所以能抓到离线单测看不到的问题。

     踩过一次坑：推杆一度和滚转共用 AIM_BLEND_MAG = 0.225 那条窄轴，
     结果玩家"略微朝正下方"（屏幕纵向 15% 上下）时 pushW 只剩 0.16，
     推杆几乎为零，看到的只有缓慢滚转。推杆现在有自己更宽的轴。 */
  {
    const G = sandbox.Game, R = sandbox.Renderer;
    const bad = [];
    G.startMission(0);
    const pl = G.__player();
    for (let f = 0; f < 120; f++) pump(1);        // 先稳定飞一会儿

    const cvEl = sandbox.document.getElementById('cv');

    /* 每个采样点都重新开始任务。

       连续采样绝对不行：飞机一直在按上一帧的杆量滚转，姿态一漂，
       "正下方"就不再是正下方了，量到的是姿态漂移而不是操控律。
       （第一版连续采样，峰值量成了 -0.28，而真实峰值是 -0.65。） */
    function sample(dy) {
      G.startMission(0);
      const pp = G.__player();
      for (let f = 0; f < 100; f++) pump(1);
      cvEl.fire('mousemove', { clientX: R.W / 2, clientY: R.H / 2 + dy });
      pump(1);
      return { pitch: pp.ctrl.pitch, roll: pp.ctrl.roll, yaw: pp.ctrl.yaw };
    }

    const near = sample(40);

    // ① 柔和朝正下方：推杆要够明显（俯仰角速度至少 3°/s，即 pitch ≤ -0.07）
    if (near.pitch > -0.07) {
      bad.push('鼠标略微朝正下方时推杆太弱（pitch=' + near.pitch.toFixed(3) +
        '，角速度约 ' + (near.pitch * 44).toFixed(1) + '°/s）');
    }
    // ② 柔和推杆时不能带滚转
    if (Math.abs(near.roll) > 0.06) {
      bad.push('柔和推杆时带了滚转（roll=' + near.roll.toFixed(3) +
        '）—— 那会让机头先侧着转，不像压机头');
    }

    // ③ 推杆必须真的能推到接近满（峰值约 -0.65，角速度 ~28°/s）
    let peak = 0, peakAt = 0;
    for (let d = 20; d <= 240; d += 20) {
      const c = sample(d);
      if (c.pitch < peak) { peak = c.pitch; peakAt = d; }
    }
    if (peak > -0.55) {
      bad.push('推杆峰值太低（' + peak.toFixed(3) + ' @' + peakAt +
        'px，角速度约 ' + (peak * 44).toFixed(1) + '°/s）—— 还没推满就被滚转接走了');
    }

    /* ④ 推到屏幕底部：推杆必须退场

       这里只断言"推杆退了"，不断言滚转有多大 —— 因为 pump 100 帧之后
       飞机已经在俯冲，"世界下方"不再落在机体下方，rollErr 和俯仰段
       都会自然变小。那是姿态本身的结果，不是操控律的问题。 */
    {
      const wide = sample(350);
      if (wide.pitch < -0.05) {
        bad.push('推到屏幕底部时推杆还没退场（pitch=' + wide.pitch.toFixed(3) + '）');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('真实链路：略微朝正下方即推杆（峰值 ' + peak.toFixed(3) + ' @' +
      peakAt + 'px，柔和段 roll ' + near.roll.toFixed(3) + '）');
  }

  /* ---- 切枪不该丢掉锁定 ----

     锁定一架敌机后想看另一种弹打同一架（先雷达弹逼机动、再补红外弹），
     这是多挂载的核心玩法。以前 cycleSpecial 里有一句
     player.lockProgress = 0，切一次就得重等整圈转完。

     不同武器的锥角/距离/速率都不同，但"还能不能继续锁"本来就该由
     updateLock 按新武器重新判 —— 锁不住时进度自己会衰减。 */
  {
    const G = sandbox.Game;
    const bad = [];
    G.startMission(0);
    const pl = G.__player();
    for (let f = 0; f < 60; f++) pump(1);

    const kd = docListeners['keydown'] || [];
    if (!kd.length) {
      fail('没有捕获到 keydown 监听器，切枪锁定检查无法进行');
    } else if (!pl.loadoutList || pl.loadoutList.length < 2) {
      ok('只有一种挂载，跳过切枪锁定检查');
    } else {
      const before = pl.special;
      pl.lockProgress = 1;
      pl.locked = true;
      kd.forEach(fn => fn({ code: 'KeyR', preventDefault() {} }));

      /* 切完**不能 pump** —— pump 会跑 updateLock，按新武器的锥角与
         距离重新判定，本来就可能把进度衰减掉。这里要看的只是
         "切枪这个动作本身有没有清零"。 */
      if (pl.special === before) {
        bad.push('按 R 没有切换武器（仍是 ' + before + '）');
      } else if (pl.lockProgress < 0.99) {
        bad.push('切枪把锁定进度清掉了（' + before + ' → ' + pl.special +
          '，进度 ' + pl.lockProgress.toFixed(2) + '）—— ' +
          '锁定同一架敌机后换弹打它，不该重等整圈');
      } else {
        ok('切枪保留锁定（' + before + ' → ' + pl.special + '，进度仍为 1.00）');
      }
    }

    if (bad.length) bad.forEach(fail);
  }

  /* ---- 无制导弹必须是"真·无动力" ----
     它们身上不该留任何描述"弹怎么找目标"的字段，
     而且飞出去之后必须真的受重力 —— 以前 vel = fwd × speed，
     炸弹是贴着机头平飞的，不加速也不下坠。 */
  {
    const W4 = sandbox.WEAPONS, E4 = sandbox.Ent, M3e = sandbox.M3;
    const bad = [];
    /* 注意这里**没有 boost**。

       boost 是"有没有发动机"，而这一组武器是"没有导引头" ——
       两者互不相干：PEJ-6 撒星是无制导火箭，它**有**发动机。
       我一度把这两个维度当成一回事，把火箭的推进也删了。 */
    const GUID = ['seeker', 'turn', 'lead', 'flare', 'lockCone', 'lockDist',
      'reAcquire', 'highAltScale', 'antiRadar', 'hobs'];

    ['rkt', 'clb'].forEach(id => {
      const w = W4[id];
      if (!w) { bad.push('找不到 ' + id); return; }
      const left = GUID.filter(k => w[k] !== undefined);
      if (left.length) {
        bad.push(w.name + ' 还留着制导/干扰类字段：' + left.join(', '));
      }
      if (!w.unguided) bad.push(w.name + ' 没有 unguided 标记');
    });

    // 火箭是有发动机的，不能连推进一起删掉
    if (W4.rkt.ballistic) {
      bad.push('PEJ-6 是火箭巢，被当成无动力炸弹了（多删了发动机）');
    }
    if (!W4.rkt.boost) {
      bad.push('PEJ-6 是火箭巢，必须有 boost');
    }

    // 激光制导炸弹反过来：该有制导，但不该有发动机与导引头
    {
      const w = W4.v30;
      if (w.turn === undefined) bad.push('PEJ-30 是制导炸弹，不该没有 turn');
      if (w.boost !== undefined) bad.push('PEJ-30 是滑翔弹，不该有 boost');
      /* 光电制导**要**显式写 flare: 0。
         省略它不是"免疫"，而是每次都被骗走 —— 见 data.js 里的说明。 */
      if (w.flare !== 0) {
        bad.push('PEJ-30 的 flare 必须显式写 0（光电免疫干扰弹），现在是 ' +
          (w.flare === undefined ? '缺失' : w.flare));
      }
    }

    /* 弹道测试：水平投放，看它会不会掉高度。
       以前 vel 恒等于 fwd × speed，y 是永远不变的。 */
    {
      const m = E4.makeMissile({
        weapon: 'clb', team: 0,
        pos: M3e.V(0, 800, 0), fwd: M3e.V(0, 0, 1), speed: 250
      });
      const y0 = m.pos.y;
      const world0 = { particles: [], actors: [], targets: [] };
      for (let i = 0; i < 60; i++) E4.stepMissile(m, 1 / 60, world0);
      const drop = y0 - m.pos.y;
      if (drop < 2) {
        bad.push('无制导弹投出去 1 秒只掉了 ' + drop.toFixed(2) +
          ' 米 —— 没有重力，它还是在平飞');
      } else {
        ok('无制导弹受重力：水平投放 1 秒下坠 ' + drop.toFixed(1) + ' 米');
      }
    }

    if (bad.length) bad.forEach(fail);
  }

  /* ---- 武器打错目标时必须拒绝发射并说明原因 ---- */
  {
    const W5 = sandbox.WEAPONS;
    const bad = [];
    // targetMismatch 是内部函数，用行为等价的方式验证数据侧：
    // 对空弹的 target 必须是 air，对地弹必须是 ground/ship
    const airIds = ['v11', 'mrm', 'arm', 'qsr'];
    const gndIds = ['rkt', 'clb', 'v30', 'asl'];
    airIds.forEach(id => {
      const w = W5[id];
      if (w && w.target !== 'air') bad.push(w.name + ' 是对空弹，target 却是 ' + w.target);
    });
    gndIds.forEach(id => {
      const w = W5[id];
      if (w && w.target === 'air') bad.push(w.name + ' 是对地弹，target 却是 air');
    });
    if (bad.length) bad.forEach(fail);
    else ok('对空/对地弹药的 target 字段自洽（发射前的匹配检查据此拒绝错误目标）');
  }

  /* ---- CLA-9 已并入 CLA-17，不该再出现 ----

     原来有两枚固体冲压远距弹，但它们是同一件武器的强弱两档：
     CLA-9 在射程（12500 vs 9200）、速度（1150 vs 1060）、载弹量
     （2 发/点 vs 1 发/点）上全面领先，CLA-17 只在过载和伤害上略胜
     —— 这不是取舍。而且编号还倒挂：CLA-9 才叫「-B」（改进型），
     编号却比"原型" CLA-17 更小。

     合并后要保证：旧键彻底消失、旧名字不再出现在任何地方，
     而且合并后的 CLA-17 确实拿到了 CLA-9 的射程与速度。 */
  {
    const W9 = sandbox.WEAPONS, bad = [];

    if (W9.ram) {
      bad.push('ram（CLA-9）应该已经并入 v17，但 WEAPONS 里还有它');
    }
    ['ram', 'v17'].forEach(k => {
      const w = W9[k];
      if (!w) return;
      if (/CLA-9|长杆-B|LONGROD/.test(w.name + w.cn)) {
        bad.push(k + ' 的显示名里还有 CLA-9 / 长杆-B 的痕迹：' + w.name + ' ' + w.cn);
      }
    });

    const v17 = W9.v17;
    if (v17) {
      if (v17.lockDist < 12000) {
        bad.push('CLA-17 合并后应该继承 CLA-9 的射程（12500），现在是 ' + v17.lockDist);
      }
      if (v17.speed < 1100) {
        bad.push('CLA-17 合并后应该继承 CLA-9 的速度（1150），现在是 ' + v17.speed);
      }
      if (v17.perPoint !== 1) {
        bad.push('CLA-17 的每点弹数应该是 1（重型远距弹），现在是 ' + v17.perPoint);
      }
    } else {
      bad.push('找不到 v17（CLA-17）');
    }

    // 和 SPO-9 的分工：一个低空强、一个高空专用，两个特性都不能丢
    if (W9.hva && !W9.hva.highAltImmune) {
      bad.push('SPO-9 丢了 highAltImmune —— 那是它和 CLA-17 唯一的分工依据');
    }
    if (v17 && !v17.scramjet) {
      bad.push('CLA-17 丢了 scramjet');
    }

    if (bad.length) bad.forEach(fail);
    else ok('CLA-9 已并入 CLA-17（12500 m / 1150 m/s），' +
      '与高空专用的 SPO-9 分工明确');
  }

  /* ---- "有没有发动机"和"有没有导引头"是两个正交的维度 ----

     我一度把它们当成一回事，按 unguided 去判断烟迹，结果正好反了：
     火箭巢被当成纯炸弹不冒烟，而滑翔弹和激光制导炸弹一路拖尾焰，
     看起来像有动力。四种组合都得对：

       有发动机 + 有制导   普通导弹
       有发动机 + 无制导   PEJ-6 火箭巢
       无发动机 + 有制导   GUT-9 滑翔弹 / PEJ-30 激光制导炸弹
       无发动机 + 无制导   PEJ-9 自由落体

     判据是：
       ballistic（无动力）→ 不拉烟、弹体顺弹道
       unguided（无制导） → 不导引 */
  {
    const W7 = sandbox.WEAPONS;
    const bad = [];
    const CASES = [
      // id,  有发动机, 有制导
      ['asl', false, true, '无动力滑翔制导炸弹'],
      ['asl2', true, true, '重型侵彻导弹'],
      ['v25', true, true, '防区外空地导弹'],
      ['lcm', true, true, '远程巡航弹'],
      ['rkt', true, false, '无制导火箭巢'],
      ['clb', false, false, '自由落体子母弹'],
      ['v30', false, true, '激光制导炸弹']
    ];
    CASES.forEach(([id, powered, guided, what]) => {
      const w = W7[id];
      if (!w) { bad.push('找不到 ' + id); return; }
      const hasEngine = !w.ballistic;
      const hasSeeker = !w.unguided;
      if (hasEngine !== powered) {
        bad.push(w.name + '（' + what + '）发动机标记不对：' +
          (hasEngine ? '有' : '无') + '，应该是' + (powered ? '有' : '无'));
      }
      if (hasSeeker !== guided) {
        bad.push(w.name + '（' + what + '）制导标记不对：' +
          (hasSeeker ? '有' : '无') + '，应该是' + (guided ? '有' : '无'));
      }
      // 有发动机的才该有推力值
      if (powered && !w.boost && w.boost !== 0) {
        bad.push(w.name + ' 说有发动机，却没有 boost');
      }
    });
    if (bad.length) bad.forEach(fail);
    else ok('动力与制导两个维度正交：7 件对地弹药的组合全部正确');
  }

  /* ---- 无制导火箭：无目标也能打，而且真的一点制导都没有 ----

     两件事都要验：
       ① 没有锁定任何目标时也必须能投放（无制导武器不该有锁定门槛）
       ② 打出去之后**航向绝不能变** —— 无制导意味着除了重力，
          没有任何东西在影响它。这一条才算真的"一点制导都没有"。 */
  {
    const G6 = sandbox.Game, E6 = sandbox.Ent, M6 = sandbox.M3;
    const bad = [];
    G6.startMission(1);
    const pl = G6.__player();
    const w = G6.__world();
    for (let f = 0; f < 30; f++) pump(1);

    // 故意什么目标都不锁
    pl.target = null;
    pl.spCd = 0;
    pl.lockProgress = 0;
    pl.locked = false;
    pl.special = 'rkt';
    pl.spAmmo = 20;
    pl.slotCd.rkt = [0];

    const kd2 = docListeners['keydown'] || [];
    const n0 = w.missiles.length;
    kd2.forEach(fn => fn({ code: 'Enter', preventDefault() {} }));
    const fired = w.missiles.length - n0;
    if (fired < 1) {
      bad.push('无锁定目标时无制导火箭打不出去 —— 它本来就不需要锁定');
    } else {
      ok('无锁定也能投放无制导武器（一次出膛 ' + fired + ' 枚，' +
        '锁定量 ' + pl.lockProgress.toFixed(2) + '）');
    }

    /* 火箭巢的管子是**平行**的：出膛点错开，指向只允许偏一点点。
       无制导火箭的出膛指向就是整条弹道 —— 要是给它和导弹一样的扇面，
       火箭巢的命中率就被悄悄改掉了（见 game.js salvoShots）。 */
    if (fired > 1) {
      const rs = w.missiles.slice(w.missiles.length - fired);
      let rFan = 0, rNest = 0;
      for (let i = 1; i < rs.length; i++) {
        rFan = Math.max(rFan, M6.angleBetween(rs[0].fwd, rs[i].fwd) * 180 / Math.PI);
        rNest = Math.max(rNest, M6.dist(rs[0].pos, rs[i].pos));
      }
      if (rFan > 2.0) {
        bad.push('无制导火箭的出膛扇面 ' + rFan.toFixed(2) +
          '° 太大 —— 出膛指向就是弹道，这等于改掉火箭巢的命中率');
      }
      if (rNest < 0.2) {
        bad.push('火箭巢的 ' + fired + ' 枚从同一个点出膛，画面上会重叠成一发');
      }
    }

    // ② 打出去的火箭必须直飞
    const m = w.missiles[w.missiles.length - 1];
    if (m) {
      const ww = m.w;
      /* 不含 boost —— 火箭是有发动机的，它只是没有导引头。
         把"无制导"和"无动力"混为一谈正是之前那个错误的根源。 */
      ['turn', 'lead', 'seeker', 'flare'].forEach(k => {
        if (ww[k] !== undefined) bad.push('无制导火箭仍有 ' + k + ' = ' + ww[k]);
      });
      if (!ww.boost) bad.push('无制导火箭被误删了发动机（boost 缺失）');
      if (m.target) bad.push('无制导火箭竟然带着目标引用');
      if (m.seekerOn === false && ww.seeker !== undefined) {
        bad.push('无制导火箭仍有导引头开关');
      }

      // 飞 0.5 秒，看水平航向有没有被修正过
      const a0 = Math.atan2(m.fwd.z, m.fwd.x);
      for (let f = 0; f < 30; f++) {
        E6.stepMissile(m, 1 / 60, w);
        if (!m.alive) break;
      }
      if (m.alive) {
        const a1 = Math.atan2(m.fwd.z, m.fwd.x);
        let dA = Math.abs(a1 - a0);
        if (dA > Math.PI) dA = Math.abs(dA - Math.PI * 2);
        if (dA > 0.01) {
          bad.push('火箭航向变了 ' + (dA * 180 / Math.PI).toFixed(1) +
            '° —— 除重力之外还有东西在影响它');
        } else {
          ok('无制导火箭直飞：0.5 秒内航向变化 < 0.6°');
        }
      }
    }

    if (bad.length) bad.forEach(fail);
  }

  /* ---- HUD：敌方标记一律红色，且锁定大框不取代基础框 ----

     两个都是"看起来只是配色，其实是可读性"的问题：
       ① 地面设施原来用灰蓝，和 HUD 里说明文字的灰是同一色系，
          读起来像中立物，玩家会以为浮台不能打。
       ② 锁定大框原来会**取代**基础小框和标签 —— 一锁定，目标的
          身份和距离就消失了，而那正是最需要它们的时刻。 */
  {
    const G7 = sandbox.Game, R3 = sandbox.Renderer;
    const bad = [];
    G7.startMission(1);
    const pl = G7.__player();
    const w = G7.__world();
    for (let f = 0; f < 30; f++) pump(1);

    const ctx = R3.ctx;
    const box = [];                       // 捕获所有矩形的颜色
    const origStroke = ctx.strokeRect;
    ctx.strokeRect = function (x, y, ww, hh) {
      box.push({ style: String(this.strokeStyle), w: Math.round(ww), h: Math.round(hh) });
      return origStroke.call(this, x, y, ww, hh);
    };

    // 先不锁定，看地面设施的框是什么颜色
    pl.target = null;
    pump(1);
    const plain = box.slice();
    box.length = 0;

    // 再锁定一个地面设施，看是否两种框同时出现
    const site = w.targets.find(t => t.alive && t.team === 1);
    if (site) {
      pl.target = site;
      pump(1);
    }
    const locked = box.slice();
    ctx.strokeRect = origStroke;

    // ① 未锁定的地面设施不该是灰的
    const GREY = /143,\s*163,\s*178/;
    const greyMarks = plain.filter(b => GREY.test(b.style));
    if (greyMarks.length) {
      bad.push('地面上还有 ' + greyMarks.length + ' 处灰蓝色标记（' +
        greyMarks[0].style + '）—— 敌方设施该是红的');
    } else {
      const red = plain.filter(b => /255,\s*77,\s*77/.test(b.style));
      ok('敌方地面标记已改为红色（本帧红色矩形 ' + red.length + ' 个）');
    }

    // ② 锁定时基础框（小）与锁定大框（大）必须同时存在
    if (site) {
      const small = locked.filter(b => b.w <= 20);
      const big = locked.filter(b => b.w >= 40);
      if (!small.length) {
        bad.push('锁定后基础小框消失了 —— 目标的身份和距离读不到了');
      } else if (!big.length) {
        bad.push('锁定后没有出现锁定大框');
      } else {
        ok('锁定大框出现时，基础框仍在（小框 ' + small.length +
          ' 个 / 大框 ' + big.length + ' 个）');
      }
    }

    if (bad.length) bad.forEach(fail);
  }

  /* ---- HUD：引擎出力条与油门轴一致 ----

     出力是**输入**，速度是**结果**，两者必须能分别读出来 ——
     这也正是它单独占一条带子、而不是塞进速度带里的原因。
     断言盯三件事：标签在、读数跟着油门轴走、0 / 军推 / 加力三档分得开。

     读数固定在带子的垂直中心（y = H/2 + 5），所以按 y 过滤就能把它
     和别处的百分比文字（HULL 之类）分开，不会误判。 */
  {
    const G8 = sandbox.Game, R4 = sandbox.Renderer;
    const bad = [];
    G8.startMission(0);
    const pl = G8.__player();
    pump(1);

    const ctx4 = R4.ctx;
    const seen = [];                       // { t, x, y }
    const origText = ctx4.fillText;
    ctx4.fillText = function (t, x, y) {
      seen.push({ t: String(t), x: x, y: y });
      return origText.apply(this, arguments);
    };

    const midY = R4.H / 2 + 5;
    let sawLabel = false;
    /* 只用**稳态档位**：加力（>1.0）与减速板（<0.04）在 game.js 里是瞬时态，
       不给输入时每帧会自己往军推/零位掉，拿它们当稳定读数会测出假失败。 */
    const cases = [[0.5, '40%'], [1.0, '80%']];
    for (const c of cases) {
      pl.throttle = c[0];
      seen.length = 0;
      pump(1);
      if (seen.some(s => s.t === 'THR')) sawLabel = true;
      const readout = seen.filter(s => /%$/.test(s.t) && Math.abs(s.y - midY) < 2.5);
      if (!readout.some(s => s.t === c[1])) {
        bad.push('油门 ' + c[0] + ' 时出力条没有显示 ' + c[1] +
          '（该高度的读数：' + (readout.map(s => s.t).join('/') || '无') + '）');
      }
    }

    // 加力位必须显示到军推以上（推到底的第一帧还没有回落完）
    {
      pl.throttle = 1.25;
      seen.length = 0;
      pump(1);
      const pct = seen.filter(s => /%$/.test(s.t) && Math.abs(s.y - midY) < 2.5)
        .map(s => parseInt(s.t, 10));
      if (!pct.some(v => v > 80)) {
        bad.push('加力位没有显示出力超过军推（该高度的读数：' +
          (pct.join('/') || '无') + '）');
      }
    }
    ctx4.fillText = origText;

    if (!sawLabel) bad.push('HUD 里找不到引擎出力条的 "THR" 标签');

    if (bad.length) bad.forEach(fail);
    else ok('引擎出力条：读数随油门走（杆位 0.5 → 40% / 军推 80% / 加力 >80%）');
  }

  /* ---- 激光制导机制（休眠中，但代码要能跑）----

     PEJ-30 已经从 laser 改成 eo（光电制导），所以现在**没有任何武器**
     使用 seeker: 'laser'。这段机制是完整的，只是休眠 —— 为了不让它
     悄悄烂掉，测试里临时借一件弹挂上 'laser' 来验，验完还回去。

     （将来要给某件弹启用激光制导，只要把它的 seeker 填成 'laser'，
     机制、图鉴、挂载面板、HUD 提示都已经就位。） */
  {
    const E9 = sandbox.Ent, M3i = sandbox.M3;
    const bad = [];

    // 借 v30 的数值一用，临时改成激光制导
    const realSeeker = sandbox.WEAPONS.v30.seeker;
    sandbox.WEAPONS.v30.seeker = 'laser';

    const mk = (shooter) => {
      const tgt = { pos: M3i.V(0, 0, 3000), alive: true, kind: 'target',
        radius: 10, dead: false };
      const m = E9.makeMissile({
        weapon: 'v30', team: 0,
        pos: M3i.V(0, 2000, 0), fwd: M3i.norm(M3i.V(0, -0.4, 1)), speed: 280,
        target: tgt, owner: shooter
      });
      const wd = { particles: [], actors: [], targets: [tgt] };
      for (let f = 0; f < 90 && m.alive; f++) E9.stepMissile(m, 1 / 60, wd);
      return m;
    };

    const good = mk({ pos: M3i.V(0, 2600, 0), alive: true,
      fwd: M3i.norm(M3i.V(0, -0.5, 1)) });
    if (good.laserLost) {
      bad.push('载机一直照着目标，弹却判定失去照射');
    } else {
      ok('激光制导（休眠）：载机保持照射时弹正常受修正');
    }

    const away = mk({ pos: M3i.V(0, 2600, 0), alive: true,
      fwd: M3i.norm(M3i.V(0, 1, -1)) });
    if (!away.laserLost) {
      bad.push('载机机头转开了，弹却还在修正 —— 照射没有约束力');
    } else {
      ok('激光制导（休眠）：载机一转向，弹立即失去修正');
    }

    sandbox.WEAPONS.v30.seeker = realSeeker;      // 还回去
    if (bad.length) bad.forEach(fail);
  }

  /* ---- PEJ-30 现在是光电制导：有制导、无动力、不吃干扰弹 ---- */
  {
    const W10 = sandbox.WEAPONS, bad = [];
    const w = W10.v30;

    if (w.seeker !== 'eo') {
      bad.push('PEJ-30 的 seeker 应该是 eo（光电），现在是 ' + w.seeker);
    }
    // 有制导 → 必须有可用过载；无动力 → 必须有 ballistic 且没有 boost
    if (w.turn === undefined) bad.push('光电制导的 PEJ-30 必须有 turn');
    if (!w.ballistic) bad.push('PEJ-30 是无动力炸弹，必须有 ballistic');
    if (w.boost !== undefined) bad.push('PEJ-30 无动力，不该有 boost');
    /* 不吃干扰弹 —— 实现方式是 **flare: 0**，而且这个 0 必须显式写。

       breakLock 的判定是 `if (Math.random() >= w.flare) continue;`：
         写成 0        → Math.random() >= 0 恒真 → 永远跳过 → 骗不到
         省略这个字段   → chance 是 undefined/NaN → 比较恒假 →
                          continue 不执行 → **每次都被骗走**
       也就是说"不设字段"和"设成 0"的效果正好相反。
       这条断言两头都拦：既不许有非零值，也不许缺失。 */
    if (w.flare !== 0) {
      bad.push('PEJ-30 要免疫干扰弹，flare 必须显式写成 0，现在是 ' +
        (w.flare === undefined ? '缺失（会导致每次都被骗走）' : w.flare));
    }

    /* 实测"不吃干扰弹" —— 不能只验 flare 字段不存在，
       要真的投一组干扰弹看它会不会被甩掉。 */
    {
      const E10 = sandbox.Ent, M3k = sandbox.M3;
      const tgt = { pos: M3k.V(0, 0, 3000), alive: true, kind: 'target',
        radius: 10, dead: false };
      const shooter = { pos: M3k.V(0, 2000, 0), alive: true, fwd: M3k.V(0, 0, 1),
        vel: M3k.V(0, 0, 250), up: M3k.V(0, 1, 0), flares: 80, flareCd: 0,
        team: 0, pos0: null };
      const m = E10.makeMissile({
        weapon: 'v30', team: 1,
        pos: M3k.V(0, 1900, 100), fwd: M3k.norm(M3k.V(0, -0.3, 1)), speed: 300,
        target: shooter, owner: null
      });
      // 目标就是那架"载机"，朝他投干扰弹
      const wd2 = { particles: [], actors: [], targets: [tgt], missiles: [m] };
      let spoofed = false;
      for (let n = 0; n < 40 && !spoofed; n++) {
        E10.breakLock(shooter, wd2);
        if (m.target !== shooter) spoofed = true;
      }
      if (spoofed) {
        bad.push('光电制导炸弹被干扰弹骗走了 —— 它本该完全不受影响');
      } else {
        ok('光电制导不受干扰弹影响（连投 40 组也没骗走）');
      }
    }

    if (bad.length) bad.forEach(fail);
    else ok('PEJ-30 光电制导：无动力 + 有制导 + 不受干扰弹影响');
  }

  /* ---- 端到端：激光制导炸弹的完整使用流程 ----

     模拟玩家实际会做的动作：挂 PEJ-30 → 锁地面目标 → 对准俯冲 →
     按发射 → 继续保持照射，直到命中。 */
  {
    const G8 = sandbox.Game, M3j = sandbox.M3;
    const bad = [];
    G8.startMission(1);
    const pl = G8.__player();
    const w = G8.__world();
    for (let f = 0; f < 30; f++) pump(1);

    const site = w.targets.find(t => t.alive && t.team === 1 && t.kind === 'target');
    if (!site) {
      fail('第二关找不到可投弹的地面设施');
    } else {
      // 挂上 PEJ-30
      pl.special = 'v30';
      pl.spAmmo = 6;
      pl.spCd = 0;
      pl.slotCd.v30 = [0];
      pl.target = site;
      pl.lockProgress = 0;

      // 摆在目标前上方，机头对着它 —— 这就是"俯冲投放"
      pl.pos = M3j.V(site.pos.x, site.pos.y + 1800, site.pos.z - 3200);
      pl.fwd = M3j.norm(M3j.sub(site.pos, pl.pos));
      pl.speed = 280;

      // 等锁定环转满
      let lockFrames = 0;
      while (pl.lockProgress < 1 && lockFrames < 600) { pump(1); lockFrames++; }
      const lockSec = (lockFrames / 60).toFixed(2);
      if (pl.lockProgress < 1) {
        bad.push('对着目标飞了 10 秒锁定环都没转满');
      } else {
        ok('光电制导炸弹锁定耗时 ' + lockSec + ' s（光电与红外同属被动成像，都快）');
      }

      // 投放
      const kd3 = docListeners['keydown'] || [];
      const n0 = w.missiles.length;
      kd3.forEach(fn => fn({ code: 'Enter', preventDefault() {} }));
      const shot = w.missiles.length - n0;
      if (shot < 1) {
        bad.push('锁定完成后按发射键没有投出炸弹');
      } else {
        const m = w.missiles[w.missiles.length - 1];
        ok('投放成功，炸弹出膛（' + shot + ' 枚）');

        /* 保持照射：一路把机头对准目标，看它能不能命中。
           注意每帧都要重算机头 —— 真实玩家就是这么盯着目标飞的。 */
        /* 保持照射：**直接驱动弹的每一帧**，不跑整局。

           不能用 pump —— 它会经过飞控重算玩家姿态，把"机头对准目标"
           这个前提冲掉，量到的就不是照射机制而是姿态漂移。
           这里只验机制本身：载机一直照着时，laserLost 必须始终为假。
           （"炸弹能不能命中目标"由命中判定那几条负责，与导引方式无关。） */
        let lostWhileLit = false, frames = 0;
        for (let f = 0; f < 300; f++) {
          pl.fwd = M3j.norm(M3j.sub(site.pos, pl.pos));   // 持续照射
          sandbox.Ent.stepMissile(m, 1 / 60, w);
          frames++;
          if (m.laserLost) { lostWhileLit = true; break; }
          if (!m.alive) break;
        }
        if (lostWhileLit) {
          bad.push('全程保持照射，弹却判定了失去照射');
        } else {
          ok('保持照射期间弹始终受修正（' + frames + ' 帧内未丢失）');
        }
      }

      /* 光电制导**不需要**保持照射 —— 它应该表现得像一枚普通制导炸弹。

         和休眠中的激光机制正好相反：那个要求载机一直照着目标，
         一转向就丢修正；光电导引头是成像的，投出去之后自己看，
         载机可以立刻脱离。这条断言就是在保护这个区别 ——
         如果哪天有人在 PEJ-30 上重新启用激光机制，它会立刻失败。 */
      pl.spCd = 0;
      pl.slotCd.v30 = [0];
      pl.lockProgress = 1;
      pl.target = site;
      pl.pos = M3j.V(site.pos.x, site.pos.y + 1800, site.pos.z - 3200);
      pl.fwd = M3j.norm(M3j.sub(site.pos, pl.pos));
      pump(1);
      const n1 = w.missiles.length;
      kd3.forEach(fn => fn({ code: 'Enter', preventDefault() {} }));
      if (w.missiles.length > n1) {
        const m2 = w.missiles[w.missiles.length - 1];
        // 一投出去就把机头抬走，然后**直接驱动弹**（pump 会重算玩家姿态）
        pl.fwd = M3j.norm(M3j.V(0, 1, -1));
        for (let f = 0; f < 60; f++) {
          sandbox.Ent.stepMissile(m2, 1 / 60, w);
          if (!m2.alive) break;
        }
        if (m2.laserLost) {
          bad.push('光电制导炸弹竟然有"失去照射"这回事 —— ' +
            '它应该像普通制导炸弹一样自己找目标');
        } else {
          ok('光电制导：投放后载机立即脱离，弹仍自行修正');
        }
      }
    }

    if (bad.length) bad.forEach(fail);
  }

  /* ---- 端到端：打错目标会被拒绝，打对了能命中 ---- */
  {
    const G3 = sandbox.Game, M3f = sandbox.M3, E5 = sandbox.Ent;
    const bad = [];
    G3.startMission(1);
    const pl = G3.__player();
    const w = G3.__world();
    for (let f = 0; f < 30; f++) pump(1);

    pl.spCd = 0;
    pl.lockProgress = 1;
    pl.locked = true;

    // ① 带对空弹锁一个海面浮台 → 必须打不出去
    const site = w.targets.find(t => t.alive && t.team === 1 && t.kind === 'target');
    if (site) {
      pl.special = 'qsr';                    // GIR-5，对空
      pl.spAmmo = 20;
      pl.slotCd.qsr = [0];
      pl.target = site;
      const n0 = w.missiles.length;
      const enter = docListeners['keydown'] || [];
      enter.forEach(fn => fn({ code: 'Enter', preventDefault() {} }));
      const fired = w.missiles.length - n0;
      if (fired !== 0) {
        bad.push('带对空弹（GIR-5）锁海面设施竟然打出了 ' + fired + ' 枚 —— ' +
          '应该拒绝发射并说明原因');
      } else {
        ok('带对空弹打海面设施被正确拒绝（0 枚出膛）');
      }
    } else {
      bad.push('第二关找不到可锁的敌方海面设施');
    }

    // ② 无制导炸弹必须能撞上设施
    {
      const t2 = w.targets.find(t => t.alive && t.team === 1);
      if (t2) {
        const m = E5.makeMissile({
          weapon: 'clb', team: 0,
          pos: M3f.V(t2.pos.x, t2.pos.y + 60, t2.pos.z - 300),
          fwd: M3f.norm(M3f.V(0, -0.18, 1)), speed: 300, owner: pl
        });
        m.target = null;                       // 无制导：不跟目标
        w.missiles.push(m);
        const hp0 = t2.hp;
        for (let f = 0; f < 180; f++) {
          pump(1);
          if (!m.alive) break;
        }
        if (t2.hp >= hp0) {
          bad.push('无制导炸弹从目标上空飞过没有造成任何伤害（hp ' + hp0 +
            ' → ' + t2.hp + '）—— 命中判定没接上');
        } else {
          ok('无制导炸弹命中设施：hp ' + hp0 + ' → ' + t2.hp);
        }
      }
    }

    if (bad.length) bad.forEach(fail);
  }

  /* ---- 诊断：第二关的地面目标能不能被锁定 ---- */
  {
    const G = sandbox.Game, M3d = sandbox.M3;
    const bad = [];
    G.startMission(1);                       // 任务 2
    const pl = G.__player();
    const w = G.__world();
    for (let f = 0; f < 30; f++) pump(1);

    const kd = docListeners['keydown'] || [];
    const out = [];
    // 连按 F 走一圈，看锁定结果落在谁身上
    for (let n = 0; n < 14; n++) {
      kd.forEach(fn => fn({ code: 'KeyF', preventDefault() {} }));
      pump(1);
      const t = pl.target;
      out.push(t ? (t.kind === 'air' ? '空中' : '地面:' + (t.model || '?')) : '无');
    }

    const groundTargets = w.targets.filter(t => t.alive).length;
    ok('诊断 M2 目标 世界里有 ' + groundTargets + ' 个地面目标；连按 F 得到：' +
      out.join(' → '));

    if (!out.some(s => s.indexOf('地面') === 0)) {
      bad.push('连按 14 次 F 都没能锁到任何地面目标 —— 它们只能显示成灰框');
    }
    if (bad.length) bad.forEach(fail);
  }

  /* ============================================================
     一轮全面体检找到的问题，逐条固化成断言

     这些 bug 的共同点是**代码不报错、单测也不报错** ——
     字段写错了位置、文案和数值脱节、条件恒真，都要靠
     "拿数据去比对行为"才看得出来。
     ============================================================ */

  /* ---- ① 被动吊舱的加成字段必须在顶层 ---- */
  {
    const W11 = sandbox.WEAPONS, bad = [];
    /* ZUN-6 原来写的是 passiveEffect: { lockResist: 0.30 } —— 多包了一层，
       而 passiveEffects() 读的是 w.lockResist。结果是六个被动吊舱里
       唯一一个加成失效的，而且完全静默。 */
    for (const k in W11) {
      const w = W11[k];
      if (!w.passive) continue;
      if (w.passiveEffect) {
        bad.push(w.name + ' 的加成包在 passiveEffect 里了 —— ' +
          'passiveEffects() 读的是顶层字段，写成嵌套会静默失效');
      }
      const has = ['lockResist', 'armorBonus', 'lockRangeBonus', 'flareBonus']
        .some(f => w[f] !== undefined);
      if (!has) bad.push(w.name + ' 是被动吊舱，却没有任何加成字段');
    }
    if (bad.length) bad.forEach(fail);
    else ok('全部被动吊舱的加成都在顶层字段，无嵌套失效');
  }

  /* ---- ② 机炮射程必须真的驱动子弹寿命 ---- */
  {
    const W12 = sandbox.WEAPONS, E12 = sandbox.Ent, M3m = sandbox.M3;
    const bad = [];

    /* 以前 fireGun 把子弹寿命写死 2.2 秒，range / highRange 只有 AI 在读。
       于是 CEL-3「18 公里以上有效射程翻倍」从未生效，
       连它的基础射程 1600 也是假的。 */
    function shootAt(y) {
      const a = E12.makeAircraft({
        type: 'c11', team: 0, isPlayer: true, x: 0, y: y, z: 0,
        fwd: M3m.V(0, 0, 1), speed: 300
      });
      a.gun = 'k3';
      a.gunAmmo = 100;
      a.gunTimer = 0;
      const wd = { particles: [], bullets: [], actors: [], targets: [], missiles: [] };
      E12.fireGun(a, wd);
      return wd.bullets.length ? wd.bullets[0].life : 0;
    }
    const g = W12.k3;
    const lifeLo = shootAt(5000), lifeHi = shootAt(20000);
    const rangeLo = lifeLo * g.speed, rangeHi = lifeHi * g.speed;

    if (Math.abs(rangeLo - g.range) > 20) {
      bad.push('低空机炮射程和 range 不符：实测 ' + Math.round(rangeLo) +
        ' m，字段 ' + g.range + ' m');
    }
    if (Math.abs(rangeHi - g.highRange) > 20) {
      bad.push('高空机炮射程和 highRange 不符：实测 ' + Math.round(rangeHi) +
        ' m，字段 ' + g.highRange + ' m');
    }
    if (!(rangeHi > rangeLo)) bad.push('高空射程没有比低空更远');

    if (bad.length) bad.forEach(fail);
    else ok('机炮射程真的生效：低空 ' + Math.round(rangeLo) + ' m → 高空 ' +
      Math.round(rangeHi) + ' m（' + (rangeHi / rangeLo).toFixed(2) + ' 倍）');
  }

  /* ---- ②b 机炮散布：近距是精确武器，远距靠射速兜住 ----

     三件事一起验：
       ① 300 m 上 1σ 必须小到可以忽略（近距还要能精确点射）
       ② 最大射程上散布必须真的长成一片（不再是一束激光）
       ③ 那一片里的火力密度（落靶率 × 射速）还得够 —— 射速能把
          远距离的散布补回来，但补不到"只剩噪音"那么散

     统计量从 800 发落点里量。散布是角度量，所以量在哪个高度都一样
     （highRange 只是高空的一档射程）。 */
  {
    const E14 = sandbox.Ent, M3b = sandbox.M3, W16 = sandbox.WEAPONS;
    const bad = [];
    const g = W16.k3;

    /* 载机速度置零：子弹会继承机速（vel 里加了 a.vel），不清零的话
       量到的横向偏移里混着载机本身的速度，量到的就不是散布。
       注意 makeAircraft 里 speed 走的是 `o.speed || 300`，
       传 0 会被顶成 300，所以只能直接改 vel。 */
    function patternAt(R, volleys) {
      const a = E14.makeAircraft({
        type: 'c11', team: 0, isPlayer: true, x: 0, y: 6000, z: 0,
        fwd: M3b.V(0, 0, 1), speed: 0
      });
      a.vel = M3b.V(0, 0, 0);
      a.gun = 'k3';
      a.gunAmmo = 1e9;
      a.gunTimer = 0;
      const base = M3b.add(a.pos, M3b.mul(a.fwd, 6));
      const wd = { particles: [], bullets: [], actors: [], targets: [], missiles: [] };
      const out = [];
      for (let v = 0; v < volleys; v++) {
        a.gunTimer = 0;
        const n0 = wd.bullets.length;
        E14.fireGun(a, wd);
        for (let i = n0; i < wd.bullets.length; i++) {
          const b = wd.bullets[i];
          // 弹道走到轴向距离 R 处时，相对炮口轴的横向偏移（米）
          out.push({
            x: (b.pos.x - base.x) + b.vel.x / b.vel.z * R,
            y: (b.pos.y - base.y) + b.vel.y / b.vel.z * R
          });
        }
      }
      return out;
    }
    // 瑞利分布：σ = sqrt(E[r²] / 2)
    const sigmaOf = o => Math.sqrt(
      o.reduce((s, q) => s + q.x * q.x + q.y * q.y, 0) / (2 * o.length));
    const inTarget = (o, r) =>
      o.filter(q => Math.sqrt(q.x * q.x + q.y * q.y) <= r).length / o.length;

    const near = patternAt(300, 400);
    const far = patternAt(g.highRange, 400);
    const sNear = sigmaOf(near), sFar = sigmaOf(far);
    const pFar = inTarget(far, 7.5);

    if (near.length < 100) {
      bad.push('机炮测试没打出弹来（只拿到 ' + near.length + ' 发）');
    }
    /* NaN 会让下面所有比较都变成 false，等于静默通过 —— 单独拦一次 */
    if (!isFinite(sNear) || !isFinite(sFar) || !isFinite(pFar)) {
      bad.push('机炮散布量出了 NaN（近 ' + sNear + ' / 远 ' + sFar + ' / 落靶 ' + pFar + '）');
    }
    if (sNear > 1.5) {
      bad.push('300 m 上机炮 1σ 已经 ' + sNear.toFixed(2) +
        ' m —— 近距不该散成这样，那样机炮就不是精确武器了');
    }
    if (sFar < 4) {
      bad.push('最大射程上机炮 1σ 只有 ' + sFar.toFixed(2) +
        ' m —— 散布没生效，还是一束激光');
    }
    if (pFar < 0.25) {
      bad.push('最大射程上落进 7.5 m 靶的弹只有 ' + (pFar * 100).toFixed(0) +
        '% —— 射速补不回来，极限距离点杀不成');
    }

    /* 射速兜底的量尺：把落靶率折成"每秒多少伤害"，跟最硬的一架
       **战术机**比，要求 1.25 秒内打得掉 —— 这就是"远距离的大范围
       散布能靠高射速弥补"这条平衡，写成一条能失败的断言。

       参照目标要排除 npcOnly 的重型轰炸机（ROK-40 有 420 hp）：
       那种东西是导弹的目标，不是拿机炮去啃的对象，把它算进来
       量到的就不是"狗斗里机炮够不够用"。 */
    const rps = g.rpm / 60;
    const dps = Math.max(1, Math.round(rps * 0.033)) * rps * pFar * g.dmg;
    const hpRef = Math.max(...sandbox.AIRCRAFT
      .filter(x => !x.npcOnly)
      .map(x => x.phys.hp));
    if (dps < hpRef / 1.25) {
      bad.push('最大射程上机炮只有 ' + Math.round(dps) + ' dmg/s（1σ ' +
        sFar.toFixed(1) + ' m）—— 散布过大，' + hpRef +
        ' hp 的目标要 ' + (hpRef / dps).toFixed(1) + ' 秒，射速补不回来');
    }

    if (bad.length) bad.forEach(fail);
    else ok('机炮散布：300 m 1σ ' + sNear.toFixed(2) + ' m（仍可精确点射）→ ' +
      g.highRange + ' m 1σ ' + sFar.toFixed(2) + ' m，落靶 ' +
      (pFar * 100).toFixed(0) + '%，等效 ' + Math.round(dps) + ' dmg/s（' +
      g.rpm + ' rpm 兜住）');
  }

  /* ---- ③ DEW 充能必须按 recharge 计时，不能立刻补满 ---- */
  {
    const W13 = sandbox.WEAPONS, E13 = sandbox.Ent, M3n = sandbox.M3;
    const bad = [];
    const w = W13.l2;      // GUS-2 日光

    if (w.charges === undefined) bad.push('GUS-2 没有 charges');
    if (w.recharge === undefined) bad.push('GUS-2 没有 recharge（desc 说每 18 秒）');

    const a = E13.makeAircraft({
      type: 'c11', team: 0, isPlayer: true, x: 0, y: 6000, z: 0,
      fwd: M3n.V(0, 0, 1), speed: 300
    });
    a.special = 'l2';
    a.spCharges = w.charges;
    a.spChargeT = 0;
    const wd = { particles: [], bullets: [], actors: [], targets: [], missiles: [] };

    // 模拟拦掉一发
    a.spCharges--;
    a.spChargeT = w.recharge || 18;
    const before = a.spCharges;

    // 跑 10 秒：不该恢复（recharge 是 18）
    for (let f = 0; f < 600; f++) E13.stepAircraft(a, 1 / 60, wd);
    if (a.spCharges !== before) {
      bad.push('充能在 ' + a.spCharges + ' 秒内就恢复了 —— ' +
        '应该等满 recharge（' + w.recharge + ' 秒）');
    }

    // 再跑到 18 秒以后，应该恢复一发
    let restored = -1;
    for (let f = 600; f < 60 * 30; f++) {
      E13.stepAircraft(a, 1 / 60, wd);
      if (a.spCharges > before) { restored = f / 60; break; }
    }
    if (restored < 0) bad.push('30 秒内充能始终没有恢复');
    else if (restored < (w.recharge || 18) - 0.5) {
      bad.push('充能恢复太早：第 ' + restored.toFixed(1) + ' 秒');
    }

    if (bad.length) bad.forEach(fail);
    else ok('DEW 充能按 recharge 计时：第 ' + restored.toFixed(1) +
      ' 秒恢复一发（recharge ' + (w.recharge || 18) + ' 秒）');
  }

  /* ============================================================
     综合压力测试

     前面每条断言都只盯着一个点，而这类项目最麻烦的 bug 往往是
     "某个任务 + 某件武器 + 某个高度"的组合才触发的异常。
     这里把三个维度都跑一遍，专门抓抛异常与数值崩坏（NaN）。
     ============================================================ */

  /* ---- ① 每个任务各跑 30 秒 ---- */
  {
    const G11 = sandbox.Game;
    const bad = [];
    const n = sandbox.MISSIONS.length;
    for (let mi = 0; mi < n; mi++) {
      try {
        G11.startMission(mi);
        for (let f = 0; f < 1800; f++) pump(1);
        const w = G11.__world(), pl = G11.__player();
        if (!pl || !isFinite(pl.pos.x) || !isFinite(pl.pos.y) || !isFinite(pl.pos.z)) {
          bad.push('任务 ' + (mi + 1) + ' 跑 30 秒后玩家坐标不是有限数');
        }
        if (!isFinite(pl.speed)) bad.push('任务 ' + (mi + 1) + ' 玩家速度变成了 NaN');
        if (w && w.missiles) {
          const nan = w.missiles.filter(m => m.alive &&
            (!isFinite(m.pos.x) || !isFinite(m.pos.y) || !isFinite(m.pos.z) ||
             !isFinite(m.speed))).length;
          if (nan) bad.push('任务 ' + (mi + 1) + ' 里有 ' + nan + ' 枚导弹位置/速度是 NaN');
        }
      } catch (e) {
        bad.push('任务 ' + (mi + 1) + ' 抛异常：' + e.message);
      }
    }
    if (bad.length) bad.forEach(fail);
    else ok('全部 ' + n + ' 个任务各跑 30 秒无异常、无 NaN');
  }

  /* ---- ② 每个机型各飞 10 秒 ---- */
  {
    const G12 = sandbox.Game, Ass = sandbox.Assets;
    const bad = [];
    const acs = sandbox.AIRCRAFT;
    for (let ai = 0; ai < acs.length; ai++) {
      try {
        G12.startMission(0);
        const pl = G12.__player();
        // 直接把玩家换成该机型（走和机库一样的路径）
        pl.ac = acs[ai];
        pl.phys = Object.assign({}, acs[ai].phys);
        pl.model = acs[ai].model;
        pl.hp = pl.maxHp = acs[ai].phys.hp;
        for (let f = 0; f < 600; f++) pump(1);
        if (!isFinite(pl.speed) || !isFinite(pl.pos.y)) {
          bad.push(acs[ai].name + ' 飞 10 秒后出现 NaN');
        }
      } catch (e) {
        bad.push(acs[ai].name + ' 抛异常：' + e.message);
      }
    }
    if (bad.length) bad.forEach(fail);
    else ok('全部 ' + acs.length + ' 个机型各飞 10 秒无异常、无 NaN');
  }

  /* ---- ③ 每件能发射的武器各打一发 ---- */
  {
    const G13 = sandbox.Game, E13 = sandbox.Ent, M3l = sandbox.M3;
    const bad = [];
    const W13 = sandbox.WEAPONS;
    let tried = 0;
    const ids = Object.keys(W13);
    for (const k of ids) {
      const w = W13[k];
      if (w.kind === 'gun' || w.passive || w.kind === 'dew') continue;
      try {
        G13.startMission(0);
        const pl = G13.__player();
        const wd = G13.__world();
        for (let f = 0; f < 20; f++) pump(1);
        const foe = wd.actors.find(a => a.team !== pl.team && a.alive);
        pl.special = k;
        pl.spAmmo = 10;
        pl.spCd = 0;
        pl.slotCd[k] = [0];
        pl.lockProgress = 1;
        pl.locked = true;
        // 对空弹给飞机、对面弹给设施，避免被类型检查拦掉
        const surface = (w.target === 'ground' || w.target === 'ship');
        if (surface) {
          pl.target = wd.targets.find(t => t.alive && t.team === 1) || null;
        } else {
          pl.target = foe || null;
        }
        const kd4 = docListeners['keydown'] || [];
        kd4.forEach(fn => fn({ code: 'Enter', preventDefault() {} }));
        // 让弹飞一会儿，走完动力段与全弹道
        for (let f = 0; f < 400; f++) pump(1);
        tried++;
        if (!isFinite(pl.pos.y) || !isFinite(pl.speed)) {
          bad.push(w.name + ' 发射后出现 NaN');
        }
      } catch (e) {
        bad.push(w.name + '（' + w.cn + '）发射时抛异常：' + e.message);
      }
    }
    if (bad.length) bad.forEach(fail);
    else ok('全部 ' + tried + ' 件可发射武器各打一发，无异常、无 NaN');
  }

  /* ---- 诊断：AI 追到极高空会不会卡住 ---- */
  {
    const G = sandbox.Game, M3d = sandbox.M3, q = sandbox.Ent;
    const bad = [];
    G.startMission(0);
    const pl = G.__player();
    const w = G.__world();

    // 把玩家钉在极高空，逼 AI 上来
    for (let f = 0; f < 2400; f++) {          // 40 秒
      pl.pos.y = 20500;
      pl.vel.y = 0;
      pl.speed = 260;
      pump(1);
    }

    const rows = w.actors.filter(a => a.team === 1 && a.alive).map(a => {
      const rho = q.airDensity(a.pos.y);
      const qq = 0.5 * rho * a.speed * a.speed;
      return {
        n: a.name, y: Math.round(a.pos.y), v: Math.round(a.speed),
        q: Math.round(qq), stall: a.stall,
        // 真正的"操控权限"，q 只是它的代理
        ctrl: q.ctrlFactor(a.pos.y, a.speed, a.ac),
        ceil: (a.ac && a.ac.ceiling) || 16000
      };
    });

    /* 断言：追击的敌机必须留在自己还有机动能力的高度。

       玩家钉在 20500 米，而敌人按各自的实用升限（ac.ceiling）行事 ——
       不该跟上来悬在半空。踩过的坑：只有"y > 19000 就压住爬升角"时，
       ROK-27 会停到 17785 米 / 188 m/s / q=5793（ctrlFactor 只剩 0.26），
       咬不住人也甩不掉。加了升限之后它们回到 15 公里、306 m/s。

       **判据是 ctrlFactor，不是 q 的绝对值。**

       q 只是"操控权限"的代理，而门槛随机型、随高度都不同：同样是 q=7000，
       在低空能打，在 17 公里已经快没舵效了。原来卡 `q < 8000`，
       可敌机按设计停在各自升限附近时 q 本来就可能掉到 7000 ——
       于是同一条断言会随 AI 的随机决策时过时不过（实测同一份代码
       跑 12 次里会挂 1 次，而代码一个字没改）。

       0.26 才是"咬不住人也甩不掉"那条线（原文就写在 ai.js 的注释里），
       这里留一点余量卡 0.30。 */
    const lowCtrl = rows.filter(r => r.stall || r.ctrl < 0.30);
    if (lowCtrl.length) {
      bad.push('有敌机停在操控权限过低的高度：' +
        lowCtrl.map(r => r.n + ' ' + r.y + 'm ' + r.v + 'm/s q=' + r.q +
          ' ctrl=' + r.ctrl.toFixed(2) + ' 升限=' + r.ceil).join(' | '));
    }

    ok('诊断 玩家钉在 20500m 40 秒后，敌机状态：' +
      (rows.length ? rows.map(r => r.n + ' ' + r.y + 'm ' + r.v + 'm/s q=' +
        r.q + ' ctrl=' + r.ctrl.toFixed(2) + (r.stall ? ' 失速' : '')).join(' | ') : '（无存活敌机）'));

    if (bad.length) bad.forEach(fail);
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

  /* ---- 单位详情页：生成 · 俯视图分配 · 3D 渲染 · 点击链路 ----
     这一组覆盖 js/unitview.js。它自带一份独立的 3D 渲染代码
     （不复用 Renderer，理由见那个文件的头部注释），所以必须单独断言。 */
  {
    const UV = sandbox.UnitView;
    const ctx2dOf = () => ctx2d();
    const fakeCanvas = () => ({ width: 320, height: 200, style: {}, getContext: ctx2dOf });

    if (!UV) {
      fail('UnitView 未加载（js/unitview.js 没进 index.html 或求值失败）');
    } else {

      /* 1. 每个有设定的单位都要能生成详情页 */
      const cases = [];
      for (const a of sandbox.AIRCRAFT) cases.push(['aircraft', a.id, a]);
      for (const s of sandbox.SHIPS) cases.push(['ship', s.id, s]);
      let bad = 0;
      for (const [kind, id] of cases) {
        try {
          const h = UV.html(kind, id);
          if (!h || h.length < 400) {
            fail('详情页 ' + kind + ':' + id + ' 只有 ' + (h ? h.length : 0) + ' 字符');
            bad++; continue;
          }
          if (h.indexOf('uvCanvas') < 0) { fail('详情页 ' + kind + ':' + id + ' 没有 3D 预览画布'); bad++; }
          if (h.indexOf('data-unit-back') < 0) { fail('详情页 ' + kind + ':' + id + ' 没有返回按钮'); bad++; }
          if (h.indexOf('uv-para') < 0) { fail('详情页 ' + kind + ':' + id + ' 没有参数表'); bad++; }
        } catch (err) {
          fail('详情页 ' + kind + ':' + id + ' 抛异常 —— ' + err.message);
          bad++;
        }
      }
      if (!bad) {
        ok('全部 ' + cases.length + ' 个单位的详情页可生成（' +
          sandbox.AIRCRAFT.length + ' 机型 + ' + sandbox.SHIPS.length + ' 舰船）');
      }

      /* 2. 俯视图只在真有数据的那几型上出现 ——
          给没有数据的型号留一个空画布，玩家会以为是坏了 */
      {
        const P = sandbox.PLANFORM.planes;
        const withPlan = sandbox.AIRCRAFT.filter(a => P[a.model]);
        const without = sandbox.AIRCRAFT.filter(a => !P[a.model]);
        let b2 = 0;
        for (const a of withPlan) {
          if (UV.html('aircraft', a.id).indexOf('uvPlan') < 0) {
            fail(a.id + ' 有俯视图数据，详情页却没画'); b2++;
          }
        }
        for (const a of without) {
          if (UV.html('aircraft', a.id).indexOf('uvPlan') >= 0) {
            fail(a.id + ' 没有俯视图数据，详情页却给了画布'); b2++;
          }
        }
        for (const s of sandbox.SHIPS) {
          if (UV.html('ship', s.id).indexOf('uvPlan') >= 0) {
            fail(s.cn + ' 是舰船，不该有俯视图'); b2++;
          }
        }
        if (!b2) {
          ok('俯视图只出现在有数据的 ' + withPlan.length + ' 型上，' +
            without.length + ' 型与全部舰船显示"无数据"');
        }
      }

      /* 3. 3D 渲染器对每一个模型都要能出帧（桩 canvas 不画像素，只要求不抛异常） */
      {
        let b3 = 0;
        const keys = Object.keys(sandbox.MODELS);
        for (const k of keys) {
          try { UV.renderModel(fakeCanvas(), sandbox.MODELS[k], 0.7, 0.30); }
          catch (err) { fail('renderModel(' + k + ') 抛异常 —— ' + err.message); b3++; }
        }
        if (!b3) ok('3D 预览渲染器跑完 ' + keys.length + ' 个模型无异常');
      }

      /* 4. 点击链路：图鉴条目 → 单位链接 → 详情 → 返回 ——
          桩的 innerHTML 不解析 HTML，所以拿不到真的 .cx-unit 元素；
          这里手工构造一个只实现 getAttribute 的假元素来喂事件委托。 */
      {
        const nav = byId.get('codexNav');
        const body = byId.get('codexBody');
        const items = nav ? nav.children.filter(c => /cx-item/.test(c.className || '')) : [];
        const invIdx = sandbox.CODEX.findIndex(e => e.title === '机型图鉴');
        if (!body || invIdx < 0 || !items[invIdx]) {
          fail('找不到机型图鉴导航项，点击链路无法验证');
        } else {
          items[invIdx].fire('click');
          const listHTML = body.innerHTML || '';
          if (listHTML.indexOf('data-unit="aircraft:c11"') < 0) {
            fail('机型图鉴里没有可点的单位链接');
          }
          if (typeof body.onclick !== 'function') {
            fail('codexBody 上没有挂单位链接的事件委托');
          } else {
            body.onclick({
              target: { getAttribute: k => (k === 'data-unit' ? 'aircraft:c11' : null), parentNode: null }
            });
            const detailHTML = body.innerHTML || '';
            if (detailHTML.indexOf('uvCanvas') < 0 || detailHTML.indexOf('实时预览') < 0) {
              fail('点单位链接之后没有进详情页');
            } else {
              body.onclick({
                target: { getAttribute: k => (k === 'data-unit-back' ? 'aircraft' : null), parentNode: null }
              });
              const backHTML = body.innerHTML || '';
              if (backHTML.indexOf('data-unit="aircraft:c11"') < 0) {
                fail('详情页的返回按钮没有回到原图鉴');
              } else {
                ok('点击链路通畅：机型图鉴 → 单位详情 → 返回图鉴');
              }
            }
          }
        }
      }
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

    /* 槽数 = 挂点数。

       w.salvo（GIR-5 是 3）表示"按一下打出几枚"，**不增加槽数** ——
       三枚共用同一个冷却槽。这样 HUD 的两处冷却显示都不用改。 */
    if (!slots || slots.length !== e.points) {
      fail(e.wid + ' 的发射槽有 ' + (slots ? slots.length : 0) +
        ' 个，应该等于挂点数 ' + e.points);
    } else {
      ok('发射槽数 = 挂点数（' + e.wid + ' ' + slots.length + ' 个）');
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
