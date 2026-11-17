#!/usr/bin/env node
/* ============================================================
   无线电探针（docs/POST2-0IMPL.md 5.5 Radio 2.0 / 5.5b Chatter）

   Radio 2.0：
     A. 一次入队 30 条混合优先级：全部 story 按入队顺序出现、一条不丢；任意两条上屏间隔 ≥ gap
     B. 低优先级超过 TTL 被丢弃并记入日志（dropped）；story 不过期
     C. story 的最长等待 ≤ STORY_MAX_WAIT + 当前一句的间隔
     D. 同事件同说话人（key）去重；日志最多 30 条
     E. 显示时长随字数：life = clamp(6 + 0.12 × 字数, 7, 14)
   F. 暂停菜单「无线电记录」页签接线
   G. Chatter：无呼号不播、同（事件，说话人）冷却、全场时间窗上限、fox 概率、敌方只在附近听得到、
      弹药 / 血量 / 击杀 / 规避的轮询事件、撤离与整备钩子、不用 Math.random
   用法：node tools/test/probes/probe-radio.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

const S = Sim.load({ seed: 1 });
const Radio = S.sandbox.Radio;
const line = (pri, n, extra) => Object.assign({ who: 'X' + n, cls: 'ally', tx: 'line ' + n, pri }, extra || {});
function run(secs) { for (let i = 0; i < secs * 60; i++) Radio.update(1 / 60); }
const shown = () => Radio.log().filter(e => !e.dropped);

/* ---------- A / C. 混合优先级 ---------- */
{
  Radio.clear();
  const pris = ['story', 'chatter', 'ally', 'player'];
  const stories = [];
  for (let i = 0; i < 30; i++) {
    const pri = pris[i % 4];
    Radio.raw(line(pri, i));
    if (pri === 'story') stories.push('line ' + i);
  }
  run(120);
  const log = Radio.log();
  const sh = log.filter(e => !e.dropped);
  const storyShown = sh.filter(e => e.pri === 'story').map(e => e.tx);
  chk('全部 story 按入队顺序出现、无一丢失', JSON.stringify(storyShown) === JSON.stringify(stories), storyShown.length + '/' + stories.length);
  let gapOk = true, minGap = 99;
  for (let i = 1; i < sh.length; i++) {
    const g = sh[i].t - sh[i - 1].t;
    minGap = Math.min(minGap, g);
    if (g < Radio.gapAfter({ tx: sh[i - 1].tx }) - 0.03) gapOk = false;
  }
  chk('任意两条上屏间隔 ≥ gap', gapOk, 'min=' + minGap.toFixed(2));
  // story 总是先于同批的低优先级（除了被它们之前就开始的那一句）
  const firstLow = sh.findIndex(e => e.pri !== 'story');
  const lastStoryBeforeLow = sh.slice(0, Math.max(firstLow, 0)).every(e => e.pri === 'story');
  chk('story 排在低优先级之前', lastStoryBeforeLow);
  const dropped = log.filter(e => e.dropped);
  chk('超时的低优先级被丢弃并进日志', dropped.length > 0 && dropped.every(e => e.pri !== 'story'), 'dropped=' + dropped.length);
  chk('日志最多 30 条', log.length <= 30, 'len=' + log.length);
}

/* ---------- B. TTL ---------- */
{
  Radio.clear();
  Radio.raw(line('story', 100));
  Radio.raw(line('story', 101));
  Radio.raw(line('chatter', 102));
  Radio.raw(line('ally', 103));
  run(30);
  const log = Radio.log();
  const find = t => log.find(e => e.tx === t);
  chk('chatter 在队里超过 TTL 被丢弃', find('line 102') && find('line 102').dropped === true);
  chk('story 都播出了、没被丢', !find('line 100').dropped && !find('line 101').dropped);
}

/* ---------- C. story 最长等待 ---------- */
{
  Radio.clear();
  for (let i = 0; i < 6; i++) Radio.raw(line('player', 200 + i, { tx: '很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长' }));
  run(0.1);
  Radio.raw(line('story', 300));
  const t0 = Radio.log().length ? Radio.log()[Radio.log().length - 1].t : 0;
  let tStory = -1;
  for (let i = 0; i < 60 * 40; i++) {
    Radio.update(1 / 60);
    const e = Radio.log().find(x => x.tx === 'line 300' && !x.dropped);
    if (e) { tStory = e.t; break; }
  }
  const slack = Radio.gapAfter({ tx: '很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长' });
  chk('story 的最长等待 ≤ STORY_MAX_WAIT + 当前一句的间隔', tStory >= 0 && tStory - t0 <= Radio.STORY_MAX_WAIT + slack + 0.1,
    'wait=' + (tStory - t0).toFixed(2) + ' limit=' + (Radio.STORY_MAX_WAIT + slack).toFixed(2));
}

/* ---------- D. 去重 ---------- */
{
  Radio.clear();
  Radio.raw(line('story', 400));                       // 占住出队
  run(0.05);
  Radio.raw(line('chatter', 401, { key: 'fox:A' }));
  Radio.raw(line('chatter', 402, { key: 'fox:A' }));
  const dups = Radio.log().filter(e => e.tx === 'line 402');
  chk('同事件同说话人（key）：队里已有就不再入队，记为 dropped', dups.length === 1 && dups[0].dropped === true);
}

/* ---------- E. 时长 ---------- */
{
  const short = Radio.lifeOf({ tx: '短' }), mid = Radio.lifeOf({ tx: 'x'.repeat(30) }), long = Radio.lifeOf({ tx: 'x'.repeat(200) });
  const html = Radio.lifeOf({ tx: '<b>' + 'x'.repeat(30) + '</b>' });
  chk('life = clamp(6 + 0.12×字数, 7, 14)', short === 7 && Math.abs(mid - 9.6) < 1e-9 && long === 14, [short, mid, long].join(' / '));
  chk('字数不含 HTML 标记', Math.abs(html - mid) < 1e-9);
  chk('台词自己的 gap 更大时取它', Radio.gapAfter({ tx: 'x', gap: 3 }) === 3 && Radio.gapAfter({ tx: 'x', gap: 0.4 }) === 1.2);
}

/* ---------- F. 暂停菜单「无线电记录」页签接线 ---------- */
{
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..', '..', '..');
  const html = fs.readFileSync(path.join(root, 'locales/_html/overlays/pause.html'), 'utf8');
  chk('pause.html 有 data-ptab="radio" 与 pane-radio / pauseRadio', /data-ptab="radio"/.test(html) && /id="pane-radio"/.test(html) && /id="pauseRadio"/.test(html));
  const G = S.sandbox.Game;
  Radio.clear(); Radio.raw(line('story', 900)); run(2);
  let threw = null;
  try { G.$.switchPauseTab('radio'); G.$.renderRadioLog(); } catch (e) { threw = e; }
  chk('切到记录页签并渲染不抛错', !threw, threw ? String(threw.stack).split('\n')[0] : '');
}

/* ---------- G. Chatter ---------- */
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'js/engine/chatter.js'), 'utf8');
  chk('chatter.js 不用 Math.random（私有 LCG，不影响 golden）', !/Math\.random\s*\(/.test(src));

  const S2 = Sim.load({ seed: 1 });
  const { M3, Ent, AI, Chatter, Radio: R2, MISSIONS } = S2.sandbox;
  S2.start(MISSIONS.findIndex(m => m.id === 'm1'));
  const G = S2.sandbox.Game, w = G.__world(), p = G.__player(), ar = w.arenaDef;
  const logOf = () => { for (let i = 0; i < 300; i++) R2.update(1 / 60); return R2.log(); };   // 先让队列走完再看日志
  const reset = () => { R2.clear(); w.chat = null; };
  const mk = (team, label, x, z) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x: p.pos.x + x, y: 4000, z: p.pos.z + z, fwd: M3.V(1, 0, 0), speed: 250, special: 'dl6' });
    AI.attach(a, { role: team === 0 ? 'ally' : 'enemy', skill: 0.55, rank: 'pawn' });
    a.label = label; a.hp = a.maxHp = 100; w.actors.push(a);
    return a;
  };
  const al = [mk(0, 'ALPHA-1', 500, 0), mk(0, 'ALPHA-2', 600, 0), mk(0, 'ALPHA-3', 700, 0), mk(0, 'ALPHA-4', 800, 0)];
  const nolabel = mk(0, null, 900, 0);
  p.hp = p.maxHp = 1e9;

  reset();
  chk('无呼号的单位不播', Chatter.emit(w, 'rtb', nolabel) === false && logOf().length === 0);
  w.time = 100;
  chk('第一次播', Chatter.emit(w, 'rtb', al[0]) === true);
  chk('同（事件，说话人）冷却内不重复', Chatter.emit(w, 'rtb', al[0]) === false);
  w.time = 100.5; Chatter.emit(w, 'rtb', al[1]); Chatter.emit(w, 'rtb', al[2]);
  chk('全场时间窗内最多 GLOBAL_MAX 条', Chatter.emit(w, 'rtb', al[3]) === false, 'max=' + Chatter.GLOBAL_MAX);
  w.time = 100 + Chatter.GLOBAL_WIN + 1;
  chk('时间窗过去后又能播', Chatter.emit(w, 'rtb', al[3]) === true);

  // fox 概率
  reset(); w.time = 500;
  let hit = 0; const N = 2000;
  Chatter.fox(w, al[0]);      // 先建状态
  for (let i = 0; i < N; i++) { w.chat.cd = {}; w.chat.win = []; if (Chatter.fox(w, al[0])) hit++; }
  const rate = hit / N;
  chk('fox：每次发射约 FOX_P 概率喊话', Math.abs(rate - Chatter.FOX_P) < 0.04, 'rate=' + rate.toFixed(3));
  reset(); w.time = 700; Chatter.emit(w, 'fox', al[1]);
  chk('fox 走 chatter 优先级', logOf().some(e => e.who === 'ALPHA-2' && e.pri === 'chatter'));
  R2.clear(); w.chat = null; w.time = 800;
  // 敌方：远了听不到，近了听得到
  const foeFar = mk(1, 'FLINT-1', 60000, 60000), foeNear = mk(1, 'FLINT-2', 3000, 0);
  chk('敌方台词：离玩家太远不播', Chatter.emit(w, 'defensive', foeFar) === false);
  chk('敌方台词：附近播，且是 chatter 优先级', Chatter.emit(w, 'defensive', foeNear) === true);
  chk('敌方台词用敌方声线（cls enemy）', logOf().some(e => e.who === 'FLINT-2' && e.cls === 'enemy' && e.pri === 'chatter'));

  // 轮询事件
  reset(); w.time = 900;
  const u = al[0];
  u.ammoPool = { drm: 8 }; Chatter.update(w, 1);           // 记下弹药上限
  u.ammoPool = { drm: 1 }; Chatter.update(w, 1);
  chk('bingoAmmo：弹药 < 25%', logOf().some(e => e.who === 'ALPHA-1'));
  reset(); w.time = 1000; u.chat = null;
  u.ammoPool = { drm: 8 }; Chatter.update(w, 1);
  u.ammoPool = { drm: 0 }; Chatter.update(w, 1);
  chk('winchester：弹药全空', logOf().some(e => e.who === 'ALPHA-1'));
  reset(); w.time = 1100; u.chat = null; u.hp = 100; Chatter.update(w, 1);
  u.hp = 40; Chatter.update(w, 1);
  chk('damaged：血量跨 50%', logOf().some(e => e.who === 'ALPHA-1'));
  reset(); w.time = 1200; u.chat = null; u.hp = 100; Chatter.update(w, 1);
  u.ai.mode = 'evade'; Chatter.update(w, 1);
  chk('defensive：进入规避', logOf().some(e => e.who === 'ALPHA-1'));
  reset(); w.time = 1300;
  const victim = mk(1, 'V', 2000, 0); victim.alive = false; victim.killedBy = al[1];
  Chatter.update(w, 0.1);
  chk('splash：我方 AI 击落敌机', logOf().some(e => e.who === 'ALPHA-2'));
  u.ai.mode = 'pursue';
  w.actors = w.actors.filter(a => a === p);          // 清掉测试机，下面用干净世界测钩子
}

/* ---------- G2. 撤离 / 整备钩子 ---------- */
{
  const S3 = Sim.load({ seed: 5 });
  const { M3, Ent, AI, MISSIONS } = S3.sandbox;
  S3.start(MISSIONS.findIndex(m => m.id === 'm1'));
  const G = S3.sandbox.Game, w = G.__world(), p = G.__player(), ar = w.arenaDef, R3 = S3.sandbox.Radio, T3 = S3.sandbox.T;
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x = ar.cx; p.pos.z = ar.cz - (ar.half - ar.warn - 4000) + 1500; p.hp = p.maxHp = 1e9;
  const sentinel = Ent.makeAircraft({ type: 'albatross', team: 1, x: ar.cx - 30000, y: 4000, z: ar.cz + 30000, fwd: M3.V(1, 0, 0), speed: 250, special: 'dl6' });
  AI.attach(sentinel, { role: 'enemy', skill: 0.55, rank: 'pawn' }); sentinel.hp = sentinel.maxHp = 1e9; w.actors.push(sentinel);
  const a = Ent.makeAircraft({ type: 'albatross', team: 0, x: ar.cx, y: 4000, z: ar.cz - (ar.half - ar.warn - 4000), fwd: M3.V(1, 0, 0), speed: 250, special: 'dl6' });
  AI.attach(a, { role: 'ally', skill: 0.55, rank: 'pawn' }); a.label = 'ALPHA-9'; a.hp = a.maxHp = 100; w.actors.push(a);
  w.retreatOn = true; R3.clear();
  a.hp = 20; a.ai.retreating = false;
  // 直接让它撤：评估必中（概率设 1）
  S3.sandbox.AI.$.retreatProb = () => 1;
  for (let f = 0; f < 60; f++) { a.hp = Math.min(a.hp, 20); S3.step(1 / 60); p.alive = true; p.hp = p.maxHp; a.hp -= (f === 5 ? 1 : 0); }
  for (let f = 0; f < 60 * 150; f++) { S3.step(1 / 60); p.alive = true; p.hp = p.maxHp; if (w.actors.indexOf(a) >= 0 && a.hp === a.maxHp && f > 600) break; }
  for (let f = 0; f < 600; f++) { S3.step(1 / 60); p.alive = true; p.hp = p.maxHp; }
  const lg = R3.log().filter(e => e.who === 'ALPHA-9');
  const rtbTx = T3.all('radio.rtb.ally.variants'), reTx = T3.all('radio.rearmed.ally.variants');
  chk('撤离开始：rtb 钩子播出', lg.some(e => rtbTx.indexOf(e.tx) >= 0), 'lines=' + lg.length);
  chk('整备完成：rearmed 钩子播出', lg.some(e => reTx.indexOf(e.tx) >= 0), lg.map(e => e.tx).join(' | '));
}

/* ---------- H. 性格台词（v3.6.2） ---------- */
{
  const S4 = Sim.load({ seed: 1 });
  const { M3, Ent, AI, Chatter, Radio: R4, MISSIONS, T: T4 } = S4.sandbox;
  S4.start(MISSIONS.findIndex(m => m.id === 'm1'));
  const G = S4.sandbox.Game, w = G.__world(), p = G.__player();
  p.hp = p.maxHp = 1e9;
  const mk = (team, label, temperament, x) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x: p.pos.x + x, y: 4000, z: p.pos.z + 500, fwd: M3.V(1, 0, 0), speed: 250, special: 'dl6' });
    AI.attach(a, { role: team === 0 ? 'ally' : 'enemy', skill: 0.55, rank: 'pawn', temperament });
    a.label = label; a.hp = a.maxHp = 100; w.actors.push(a);
    return a;
  };
  const say = (type, unit) => {
    R4.clear(); w.chat = null; w.time = 100;
    Chatter.emit(w, type, unit);
    for (let i = 0; i < 300; i++) R4.update(1 / 60);
    const lg = R4.log().filter(e => e.who === unit.label);
    return lg.length ? lg[lg.length - 1].tx : null;
  };
  const TYPES = ['fox', 'splash', 'defensive', 'rtb'];
  let allOk = true, miss = [];
  for (const tp of ['aggressive', 'cautious', 'sniper']) {
    for (const ty of TYPES) {
      const a = mk(0, 'TP-' + tp + '-' + ty, tp, 600), f = mk(1, 'TF-' + tp + '-' + ty, tp, 900);
      const lineA = say(ty, a), lineF = say(ty, f);
      if (!T4.all('radio.' + ty + '.ally.' + tp + '.variants').includes(lineA)) { allOk = false; miss.push('ally ' + tp + ' ' + ty + ': ' + lineA); }
      if (!T4.all('radio.' + ty + '.foe.' + tp + '.variants').includes(lineF)) { allOk = false; miss.push('foe ' + tp + ' ' + ty + ': ' + lineF); }
    }
  }
  chk('H aggressive / cautious / sniper：4 个事件 × ally / foe 都取性格台词', allOk, miss.join(' | '));
  const neutral = mk(0, 'TN-1', null, 700), loyal = mk(0, 'TL-1', 'loyal', 750);
  const lN = say('fox', neutral), lL = say('fox', loyal);
  const gen = T4.all('radio.fox.ally.variants');
  chk('H 中性 / loyal（没有性格台词）回退通用', gen.includes(lN) && gen.includes(lL), lN + ' | ' + lL);
  const evTypes = ['bingoAmmo', 'winchester', 'rearmed', 'damaged', 'help'];
  const ag = mk(0, 'TA-9', 'aggressive', 800);
  const lb = evTypes.map(ty => say(ty, ag)), okB = evTypes.every((ty, i) => T4.all('radio.' + ty + '.ally.variants').includes(lb[i]));
  chk('H 没有性格台词的事件对有性格的单位也回退通用', okB, lb.join(' | '));
  const x = mk(0, 'TX-1', 'aggressive', 600), y = mk(0, 'TX-2', null, 650);
  R4.clear(); w.chat = null; w.time = 100; Chatter.emit(w, 'fox', x); const rsA = w.chat.rs;
  R4.clear(); w.chat = null; w.time = 100; Chatter.emit(w, 'fox', y); const rsB = w.chat.rs;
  chk('H 性格查键不额外消耗 Chatter 抽签（两种单位各抽一次，结果同一个 LCG 状态）', rsA === rsB, rsA + ' vs ' + rsB);
}

process.exit(ok ? 0 : 1);
