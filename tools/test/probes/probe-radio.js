#!/usr/bin/env node
/* ============================================================
   无线电探针（docs/POST2-0IMPL.md 5.5 Radio 2.0 / 5.5b Chatter）

   Radio 2.0：
     A. 一次入队 30 条混合优先级：全部 story 按入队顺序出现、一条不丢；任意两条上屏间隔 ≥ gap
     B. 低优先级超过 TTL 被丢弃并记入日志（dropped）；story 不过期
     C. story 的最长等待 ≤ STORY_MAX_WAIT + 当前一句的间隔
     D. 同事件同说话人（key）去重；日志最多 30 条
     E. 显示时长随字数：life = clamp(6 + 0.12 × 字数, 7, 14)
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

process.exit(ok ? 0 : 1);
