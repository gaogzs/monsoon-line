#!/usr/bin/env node
/* ============================================================
   难度回归探针：玩家"不作为"时，敌方能把这一关推到什么程度

   建在后台模拟（tools/lib/sim.js）上，固定种子、多种子统计。
   玩家无敌、不开火、不机动 —— 量的是敌方行动本身的压力：
     loseAt     mission.lose 第一次为真的时刻（— = 时限内没输）
     ourLost    我方水面 / 地面单位被打掉的数量 / 开局总数
     ourHp      我方水面 / 地面单位剩余血量占比（合计）
     raids      敌方航线单位的动作次数（旧写法的 onArrive；分段航线的 call 段与 strike 每一发）

   v1.13.2 修了"航线永远到不了点"之后，第 2、5、8 关的轰炸机才第一次真的投弹 ——
   这个探针就是用来看那之后难度跳了多少。

   用法：node tools/test/probes/probe-balance.js [--seeds 5] [--t 240] [--only m2]
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const NSEED = +opt('--seeds', 5);
const T = +opt('--t', 240);
const ONLY = opt('--only', null);
const IDS = ONLY ? [ONLY] : ['m2', 'm5', 'm8'];

function scenario(id) {
  return function (S) {
    const M = S.sandbox.MISSIONS;
    const mi = M.findIndex(m => m.id === id);
    S.start(mi).godMode();
    const w = S.world, pl = S.player, m = M[mi];
    const ours = () => w.targets.filter(t => t.team === 0);
    const ours0 = ours().length;
    const hp0 = ours().reduce((a, t) => a + (t.maxHp || t.hp || 0), 0);
    let raids = 0;
    // 数航线单位的"动作"：旧写法的 onArrive，分段航线（route.js）的 call 段与 strike 的每一发
    const wrap = (a) => {
      const r = a.route;
      if (!r || r.__wrapped) return;
      r.__wrapped = true;
      if (r.onArrive) {
        const f = r.onArrive;
        r.onArrive = function () { raids++; return f.apply(this, arguments); };
      }
      for (const L of (r.legs || [])) {
        if (L.do === 'call') { const g = L.fn; L.fn = function () { raids++; return g.apply(this, arguments); }; }
        if (L.do === 'strike') { const h = L.onFire; L.onFire = function () { raids++; if (h) return h.apply(this, arguments); }; }
      }
    };
    let loseAt = -1;
    S.run(T, (t) => {
      pl.hp = pl.maxHp; pl.alive = true;
      pl.throttle = 0.6; pl.firing = false;
      for (const a of w.actors) wrap(a);
      if (loseAt < 0 && m.lose(w)) { loseAt = t; return true; }
    });
    const now = ours();
    const lost = ours0 - now.filter(t => t.alive).length;
    const hp = now.reduce((a, t) => a + (t.alive ? Math.max(0, t.hp) : 0), 0);
    return { loseAt, lost, ours0, hpK: hp0 ? hp / hp0 : 1, raids, flr: w.friendlyLoss || 0 };
  };
}

const seeds = [];
for (let i = 1; i <= NSEED; i++) seeds.push(i);
console.log('\n== 难度回归：玩家不作为（无敌、不开火），' + T + ' s，' + NSEED + ' 个种子 ==\n');
for (const id of IDS) {
  const rs = Sim.batch(seeds, scenario(id));
  const loses = rs.filter(r => r.loseAt >= 0);
  const la = loses.length ? Sim.stats(loses.map(r => r.loseAt)) : null;
  const hp = Sim.stats(rs.map(r => r.hpK));
  const rd = Sim.stats(rs.map(r => r.raids));
  const lost = Sim.stats(rs.map(r => r.lost));
  console.log('  ' + id.padEnd(4) +
    '  失守 ' + loses.length + '/' + rs.length +
    (la ? '（平均 ' + la.mean.toFixed(0) + ' s，最快 ' + la.min.toFixed(0) + ' s）' : '            ') +
    '  我方单位损失 ' + lost.mean.toFixed(1) + '/' + rs[0].ours0 +
    '  剩余血量 ' + (hp.mean * 100).toFixed(0) + '%' +
    '  航线动作 ' + rd.mean.toFixed(1) + ' 次');
}
console.log('');
