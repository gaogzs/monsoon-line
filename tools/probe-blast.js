/* 探针：空空弹的近炸 / 爆炸伤害分布。

   对每一种空空弹，按四档目标机动各打 N 发，统计：
     hit    —— 造成了伤害的比例
     dmg    —— 平均交付伤害（占武器 dmg 的比例，便于跨弹比较）
     det    —— 起爆时弹目距离（测到目标表面）的均值 / 标准差，单位 m
   目标是一个**按脚本运动**的靶机（不走 AI），这样新旧版本跑出来的是同一组交战。

   机动档：
     straight  匀速直线平飞
     gentle    全程 0.12 rad/s 缓慢转弯
     hard      导弹进入 1800 m 后 0.5 rad/s 置尾 / 置侧急转（转向导弹视线的垂直方向）
     jink      导弹进入 2500 m 后 0.6 rad/s 急转，每 0.8 s 反向一次（蛇形规避）
     max       导弹进入 700 m 后 1.6 rad/s 极限拉杆（≈ 玩家高 G 上限），转向视线的垂直方向
     flare     hard + 进入 1200 m 起每 0.45 s 投一组干扰弹（最多 3 组）

   用法：
     node tools/probe-blast.js              跑一遍并和基线对比
     node tools/probe-blast.js --save       把这一遍存为基线（tools/probe-blast.baseline.json）
     node tools/probe-blast.js --n 80       每档发数（默认 120）
     node tools/probe-blast.js --only srm   只跑一种弹
     node tools/probe-blast.js --flare      投弹时机实验：srm 来袭，目标平飞，
                                            在 3 km / 1 km / 300 m / 100 m 时投一组干扰弹，
                                            统计目标的平均受伤（期望早投≈0、贴脸投 > 0、单调） */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'probe-blast.baseline.json');

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const N = +(args[args.indexOf('--n') + 1]) || 120;
const FLARE = args.includes('--flare');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

/* ---- 最小沙箱：只需要数据、数学和实体层，不跑游戏主循环 ---- */
const noop = () => {};
let seed = 0x1b2c3d;
const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const sandbox = {
  console, Date, JSON, Object, Array, String, Number, Boolean, isFinite, parseFloat, parseInt,
  RegExp, Error, Map, Set, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop
};
sandbox.Math = Object.create(Math);
sandbox.Math.random = rnd;
sandbox.window = sandbox;
sandbox.performance = { now: () => Date.now() };
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : noop), set: () => true });
const fakeEl = () => ({
  style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: noop, addEventListener: noop, setAttribute: noop, getAttribute: () => null,
  getContext: () => ctx2d, querySelectorAll: () => [], querySelector: () => null
});
sandbox.document = {
  getElementById: fakeEl, createElement: fakeEl, querySelectorAll: () => [], querySelector: () => null,
  body: fakeEl(), documentElement: fakeEl(), addEventListener: noop, createTextNode: fakeEl
};
sandbox.addEventListener = noop;
sandbox.requestAnimationFrame = () => 1;
sandbox.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
sandbox.AudioContext = function () { return ctx2d; };

const order = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .match(/<script src="([^"]+)"><\/script>/g).map(s => s.match(/src="([^"]+)"/)[1]);
const ctx = vm.createContext(sandbox);
for (const src of order) {
  if (/game\.js$/.test(src)) continue;          // 不需要主循环
  vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src });
}
const { Ent, M3, WEAPONS } = sandbox;
if (sandbox.SFX) for (const k in sandbox.SFX) if (typeof sandbox.SFX[k] === 'function') sandbox.SFX[k] = noop;

/* 靶机的"表面"半径，与命中判定一致 */
const HIT_R = (sandbox.Combat && sandbox.Combat.HIT_R_AIR) || 7.5;
const DT = 1 / 60;
const MODES = ['straight', 'gentle', 'hard', 'jink', 'max', 'flare'];

function rotate(v, axis, ang) {
  // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang);
  const k = M3.norm(axis);
  const kxv = M3.cross(k, v), kdv = M3.dot(k, v);
  return M3.add(M3.add(M3.mul(v, c), M3.mul(kxv, s)), M3.mul(k, kdv * (1 - c)));
}

function trial(wid, mode, dropAt) {
  const w = WEAPONS[wid];
  const D = dropAt ? Math.max(3600, dropAt + 600) : Math.max(1500, Math.min(6000, (w.lockDist || 4000) * 0.55));
  const tgt = Ent.makeAircraft({ type: 'frigatebird', team: 1, pos: M3.V(0, 6000, D) });
  const head = rnd() * Math.PI * 2;
  tgt.pos = M3.V(0, 6000, D);
  tgt.fwd = M3.V(Math.sin(head), 0, Math.cos(head));
  tgt.up = M3.V(0, 1, 0);
  tgt.right = M3.cross(tgt.up, tgt.fwd);
  tgt.speed = 250;
  tgt.vel = M3.mul(tgt.fwd, 250);
  tgt.hp = tgt.maxHp = 1e9;
  tgt.armor = 0;
  tgt.flares = 3; tgt.flareCd = 0;
  const owner = { team: 0, alive: true, kills: 0, isPlayer: false, pos: M3.V(0, 6000, 0) };
  const m = Ent.makeMissile({
    weapon: wid, team: 0, pos: M3.V(0, 6000, 0), fwd: M3.norm(M3.sub(tgt.pos, M3.V(0, 6000, 0))),
    speed: 300, target: tgt, owner: owner
  });
  const world = { time: 0, actors: [tgt], targets: [], missiles: [m], bullets: [], particles: [] };
  const turnSign = rnd() < 0.5 ? -1 : 1;
  let breakAxis = null, lastPos = M3.clone(m.pos), flareT = 0, flares = 0, jinkT = 0;
  for (let f = 0; f < 60 * 30 && m.alive; f++) {
    world.time += DT;
    const d = M3.dist(m.pos, tgt.pos);
    // ---- 靶机机动 ----
    let rate = 0, axis = M3.V(0, 1, 0);
    if (mode === 'gentle') rate = 0.12 * turnSign;
    if ((mode === 'hard' || mode === 'flare') && d < 1800) {
      if (!breakAxis) {
        const los = M3.norm(M3.sub(tgt.pos, m.pos));
        let ax = M3.cross(los, tgt.fwd);
        if (M3.len(ax) < 0.05) ax = M3.V(0, 1, 0);
        breakAxis = M3.norm(ax);
      }
      rate = 0.5 * turnSign; axis = breakAxis;
    }
    if (mode === 'max' && d < 700) {
      if (!breakAxis) {
        const los = M3.norm(M3.sub(tgt.pos, m.pos));
        let ax = M3.cross(los, tgt.fwd);
        if (M3.len(ax) < 0.05) ax = M3.V(0, 1, 0);
        breakAxis = M3.norm(ax);
      }
      rate = 1.6 * turnSign; axis = breakAxis;
    }
    if (mode === 'jink' && d < 2500) {
      if (!breakAxis) breakAxis = M3.V(0, 1, 0);
      jinkT += DT;
      rate = 0.6 * turnSign * (Math.floor(jinkT / 0.8) % 2 ? -1 : 1);
      axis = tgt.up;
    }
    if (rate) {
      tgt.fwd = M3.norm(rotate(tgt.fwd, axis, rate * DT));
      tgt.up = M3.norm(rotate(tgt.up, axis, rate * DT));
      tgt.right = M3.cross(tgt.up, tgt.fwd);
    }
    tgt.vel = M3.mul(tgt.fwd, tgt.speed);
    tgt.pos = M3.add(tgt.pos, M3.mul(tgt.vel, DT));
    if (dropAt && d < dropAt && flares < 1) {
      /* 保证这一组一定骗中：实验看的是"在哪里被骗"的后果，不是骗中率 */
      const fl = w.flare; w.flare = 1;
      tgt.flareCd = 0; Ent.breakLock(tgt, world); flares++;
      w.flare = fl;
    }
    if (mode === 'flare' && d < 1200 && flares < 3) {
      flareT -= DT;
      if (flareT <= 0) { tgt.flareCd = 0; Ent.breakLock(tgt, world); flares++; flareT = 0.45; }
    }
    if (tgt.flareCd > 0) tgt.flareCd -= DT;
    // ---- 导弹 ----
    lastPos = M3.clone(m.pos);
    Ent.stepMissile(m, DT, world);
    world.particles.length = 0;
  }
  const dmg = 1e9 - tgt.hp;
  const det = Math.max(0, M3.dist(m.pos, tgt.pos) - HIT_R);
  return { dmg: dmg, frac: dmg / Math.max(1, w.dmg), det: det, exploded: !m.alive };
}

function stats(xs) {
  const n = xs.length || 1;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  return { mean: mean, sd: sd };
}

if (FLARE) {
  console.log('\n== 投弹时机（srm 来袭、目标平飞、必定骗中，每档 ' + N + ' 发） ==');
  for (const at of [3000, 1000, 300, 100]) {
    seed = 0x5eed + at;
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(trial('srm', 'straight', at));
    const hurt = rs.filter(r => r.dmg > 0).length;
    console.log(('  ' + at + ' m').padEnd(10) + '平均受伤 ' + stats(rs.map(r => r.frac)).mean.toFixed(3) +
      ' × dmg   受伤比例 ' + (hurt / N * 100).toFixed(0) + '%');
  }
  process.exit(0);
}

const ids = Object.keys(WEAPONS).filter(id => {
  const w = WEAPONS[id];
  return w.kind === 'aam' && w.target === 'air' && w.dmg > 0 && (!ONLY || id === ONLY);
});
const out = {};
for (const id of ids) {
  out[id] = {};
  for (const mode of MODES) {
    if (mode === 'flare' && WEAPONS[id].seeker === 'eo') continue;
    seed = 0x1b2c3d + id.length * 7919 + MODES.indexOf(mode) * 104729;
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(trial(id, mode));
    const hits = rs.filter(r => r.dmg > 0);
    const det = stats(hits.map(r => r.det));
    out[id][mode] = {
      hit: +(hits.length / N).toFixed(3),
      dmg: +stats(rs.map(r => r.frac)).mean.toFixed(3),
      detMean: +det.mean.toFixed(1), detSd: +det.sd.toFixed(1)
    };
  }
}

let base = null;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* 还没有基线 */ }

const pad = (s, n) => (s + '').padEnd(n);
console.log('\n== 空空弹近炸探针（每档 ' + N + ' 发） ==');
console.log(pad('弹', 6) + pad('机动', 10) + pad('命中', 8) + pad('伤害', 8) + pad('起爆距离 m', 14) + '对比基线（伤害）');
let worst = 0;
for (const id of ids) {
  for (const mode in out[id]) {
    const r = out[id][mode];
    let cmp = '';
    const b = base && base[id] && base[id][mode];
    if (b) {
      const dd = b.dmg > 0 ? (r.dmg - b.dmg) / b.dmg : 0;
      cmp = (dd >= 0 ? '+' : '') + (dd * 100).toFixed(0) + '%  (基线 ' + b.dmg + ')';
      if (mode !== 'flare') worst = Math.max(worst, Math.abs(dd));
    }
    console.log(pad(id, 6) + pad(mode, 10) + pad((r.hit * 100).toFixed(0) + '%', 8) + pad(r.dmg, 8) +
      pad(r.detMean + ' ± ' + r.detSd, 14) + cmp);
  }
}
if (base) console.log('\n非干扰弹档的最大伤害偏差：' + (worst * 100).toFixed(0) + '%');
if (SAVE) {
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
  console.log('\n已存为基线：' + path.relative(ROOT, BASELINE));
}
