#!/usr/bin/env node
/* ============================================================
   敌机挂载对比探针（给"下游机型新增挂点后敌方挂载怎么改"那一轮用）

   逐关开局、每 0.5 s 清掉敌方（和 probe-missions 同一招，把各波次 / 增援都逼出来），
   把每架非玩家飞机出生时的挂载导出来：
     ac / team / 逐组 plan（a.mountWids）/ ammoPool / 各弹槽数 / loadFactor / 吊舱 / special
   固定种子，同一份代码每次导出一样。

     node tools/test/probes/probe-npc-loadouts.js --write   落基线 tools/test/baseline/npc-loadouts.json
     （基线 = 3.1.15 开放下游新挂点之后的状态，领队的槽数已计入；开放前的版本是 3.1.14，
      当时用同一个探针落基线、改完逐项比对过：除领队外池与槽数逐项相同。）
     node tools/test/probes/probe-npc-loadouts.js           与基线比对：
        · 弹药池（ammoPool）必须逐项相同
        · 槽数（同弹占的挂点数）必须相同 —— 只有 LEADS 里列出的领队机允许增加（池仍要相同）
        · 数量 / 机型 / 队伍必须相同（出生顺序对得上）
        · 下游机型（有 npcLoadouts）的敌机不许"special 非空而逐组 loadout 缺失"
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const Sim = require('../../lib/sim');
const ROOT = require('../../lib/root').ROOT;
const BASE = path.join(ROOT, 'tools', 'test', 'baseline', 'npc-loadouts.json');

/* 允许"池不变、槽数增加"的领队机：键 = 关卡 id + ':' + 该关内第几架非玩家飞机（0 起，出生顺序）。
   评审通过的领队：m2 伏击头机（skill 0.72）、m3 冬港与 skill 0.70 的 ROK-27、m4 skill 0.68 的 ROK-27、
   m6 老兵队长（skill 0.88）、m8 主波的"榔头"与第二波的头机 ROK-27、m10 skill 0.72 的 ROK-27、m12 冬港。 */
const LEADS = { 'm2:5': 1, 'm3:15': 1, 'm3:17': 1, 'm4:2': 1, 'm6:2': 1, 'm8:7': 1, 'm8:17': 1, 'm10:3': 1, 'm12:9': 1 };

const S = Sim.load({ seed: 1 });
const G = S.sandbox.Game, MISSIONS = S.sandbox.MISSIONS, Ent = S.sandbox.Ent;

function dump() {
  const out = {};
  for (let mi = 0; mi < MISSIONS.length; mi++) {
    const m = MISSIONS[mi];
    Ent.clearMountIssues();
    G.startMission(mi);
    const w = G.__world(), pl = G.__player();
    pl.hp = pl.maxHp = 1e9;
    for (let f = 0; f < 60 * 150; f++) {
      if (f % 30 === 0) {
        for (const a of w.actors) if (a.team === 1) a.alive = false;
        for (const t of w.targets) if (t.team === 1) { t.alive = false; t.dead = true; }
        pl.hp = pl.maxHp; pl.alive = true;
      }
      S.step(1 / 60);
      if (m.win(w)) break;
    }
    const rows = [];
    for (const a of w.actors) {
      if (a.isPlayer) continue;
      const slots = {};
      for (const k in (a.slotCd || {})) slots[k] = a.slotCd[k].length;
      rows.push({
        ac: a.type || a.ac && a.ac.id, team: a.team,
        plan: (a.mountWids || []).map(x => x || null),
        pool: Object.assign({}, a.ammoPool || {}), slots,
        lf: +(a.loadFactor || 0).toFixed(4),
        pods: a.pods || null, special: a.special || null,
        hasLoadout: !!a.loadout
      });
    }
    out[m.id] = rows;
  }
  return out;
}

const cur = dump();
if (process.argv.includes('--write')) {
  fs.writeFileSync(BASE, JSON.stringify(cur, null, 1) + '\n');
  let n = 0; for (const k in cur) n += cur[k].length;
  console.log('已写入 ' + path.relative(ROOT, BASE) + '（' + Object.keys(cur).length + ' 关，' + n + ' 架）');
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const bad = [], info = [];
const sameObj = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* 随机遭遇战（sk1）的刷怪队列是用带种子的 Math.random 现生成的：只要前面任何代码多 / 少消耗一次随机数，
   整个队列组成就换一批（v3.1.15 的基线是 26 架，后来一直是 15 架，且每次运行都一样），"第 i 架对第 i 架"的比对
   对它天生就脆。它真正要守的是"每种机型的挂载与弹药池没变"，所以改成按（机型, 队伍）做集合比对：
   现在出现的每一架的 弹药池 / 槽数 / loadFactor 必须在基线里同机型同队伍出现过；数量与顺序不比。 */
const RANDOM_QUEUE = { sk1: 1 };
const sig = r => JSON.stringify([r.pool, r.slots, r.lf]);
for (const mid of Object.keys(base)) {
  const A = base[mid], B = cur[mid] || [];
  if (RANDOM_QUEUE[mid]) {
    const known = {};
    for (const r of A) (known[r.ac + '/' + r.team] = known[r.ac + '/' + r.team] || new Set()).add(sig(r));
    if (!B.length) bad.push(mid + ' 一架敌机都没刷出来');
    B.forEach((r, i) => {
      const set = known[r.ac + '/' + r.team];
      if (!set) { bad.push(mid + '#' + i + ' ' + r.ac + '/' + r.team + ' 基线里没出现过这种机型 / 队伍（要么是有意新增，重存基线；要么刷怪出错）'); return; }
      if (!set.has(sig(r))) bad.push(mid + '#' + i + ' ' + r.ac + ' 的弹药池 / 槽数 / loadFactor 与基线里该机型的任何一架都不同：' + sig(r));
    });
    info.push(mid + ' 随机队列：按（机型, 队伍）集合比对，现在 ' + B.length + ' 架（基线 ' + A.length + ' 架，数量与顺序不比）');
    continue;
  }
  if (A.length !== B.length) { bad.push(mid + ' 敌机数量变了：' + A.length + ' → ' + B.length); continue; }
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = B[i], tag = mid + '#' + i + ' ' + a.ac;
    if (a.ac !== b.ac || a.team !== b.team) { bad.push(tag + ' 机型 / 队伍变了：' + b.ac + '/' + b.team); continue; }
    if (!sameObj(a.pool, b.pool)) bad.push(tag + ' 弹药池变了：' + JSON.stringify(a.pool) + ' → ' + JSON.stringify(b.pool));
    const lead = !!LEADS[mid + ':' + i];
    for (const k of new Set(Object.keys(a.slots).concat(Object.keys(b.slots)))) {
      const sa = a.slots[k] || 0, sb = b.slots[k] || 0;
      if (sa === sb) continue;
      if (lead && sb > sa) info.push(tag + ' [领队] ' + k + ' 槽 ' + sa + ' → ' + sb);
      else bad.push(tag + ' ' + k + ' 槽数变了：' + sa + ' → ' + sb + (lead ? '' : '（不在领队清单里）'));
    }
    if (!lead && Math.abs(a.lf - b.lf) > 1e-9) bad.push(tag + ' loadFactor 变了：' + a.lf + ' → ' + b.lf);
    if (!sameObj(a.plan, b.plan) && sameObj(a.slots, b.slots)) info.push(tag + ' 逐组位置变了：' + JSON.stringify(a.plan) + ' → ' + JSON.stringify(b.plan));
  }
}
/* 安全网：下游战斗机的 special 非空时必须是显式逐组 loadout（否则会被自动铺满所有组） */
const DOWN = { schist: 1, basalt: 1, sandstone: 1, tideline: 1 };
for (const mid in cur) cur[mid].forEach((r, i) => {
  if (DOWN[r.ac] && r.special && !r.hasLoadout) bad.push(mid + '#' + i + ' ' + r.ac + ' special=' + r.special + ' 却没有显式 loadout');
});
info.forEach(x => console.log('  . ' + x));
if (bad.length) { bad.forEach(x => console.log('  ✗ ' + x)); console.log('\n' + bad.length + ' 处不符'); process.exit(1); }
console.log('\n敌机挂载与基线一致（弹药池逐项相同，槽数除领队外相同）');
