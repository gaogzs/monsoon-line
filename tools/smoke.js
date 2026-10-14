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
    const want = 1 - WEAPONS[wid].flare * 0.55;      // 与被测实现同一公式
    const rate = lost / N;
    // 1500 次采样，σ≈1.1%，允许 ±4 个百分点
    if (Math.abs(rate - want) > 0.04) {
      fail(wid + ' 干扰成功率 ' + (rate * 100).toFixed(0) +
        '%，但按 flare=' + WEAPONS[wid].flare + ' 应该是 ' + (want * 100).toFixed(0) + '%');
    } else {
      ok(wid + ' 干扰成功率 ' + (rate * 100).toFixed(0) + '%（预期 ' + (want * 100).toFixed(0) + '%）');
    }
  }

  // 雷达制导不该吃干扰弹（设定如此）
  {
    const m = Ent.makeMissile({
      weapon: 'dl4', team: 1, pos: M3.V(me.pos.x, me.pos.y, me.pos.z - 900),
      fwd: M3.V(0, 0, 1), speed: 320, target: me, owner: null
    });
    m.team = 1;
    world.missiles.length = 0;
    world.missiles.push(m);
    me.flares = 80; me.flareCd = 0;
    Ent.breakLock(me, world);
    // target 还在 = 没被骗走 = 符合设定
    if (m.target) ok('雷达制导不吃干扰弹（符合设定）');
    else fail('雷达制导导弹被干扰弹骗走了 —— 与设定不符');
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
    if (lp0.acc !== 1 || lp0.pitch !== 1 || lp0.vMax !== 1 || lp0.vStall !== 1) {
      bad.push('空载时不该有任何损失');
    }
    if (!(lp1.acc < lp1.pitch && lp1.pitch < lp1.roll)) {
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
