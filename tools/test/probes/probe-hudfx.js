#!/usr/bin/env node
/* ============================================================
   HudFx 探针：玻璃裂痕（受损特效）

   A. 随机：同一段伤害序列在不同时刻发生，裂痕形状不同；一次受击生成过程不碰 Math.random。
   B. 严重度：本次伤害越大越高；累计伤害越多，同样一下的严重度单调不减。
   C. 再次受伤：消退途中再受伤 → 可见度立刻回满，线段增加（生长或另起一簇）。
   D. 消退：满可见保持 crackHold 秒后才开始消退，最终清空且不再占用画布。
   E. 封顶：连续大量小伤害，线段总数不超过 crackMax 加一簇的量。
   F. 窗口比例变化、死亡、换玩家：不抛错 / 清零。
   用法：node tools/test/probes/probe-hudfx.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function fresh() {
  const S = Sim.load({ seed: 1 });
  const F = S.sandbox.HudFx;
  let T = 100000;
  S.sandbox.performance = { now: () => T };
  const p = { alive: true, hp: 100, maxHp: 100, suppressed: 0, ewPower: 0 };
  const ctx = S.sandbox.Renderer.ctx || {};
  F.reset();
  const tick = (ms, W, H) => { T += ms; F.draw(ctx, W || 800, H || 600, p); };
  const hit = (dmg) => { p.hp -= dmg; tick(16); };
  tick(16);
  return { S, F, p, tick, hit, at: () => T };
}

/* ---- A. 随机 ---- */
{
  const a = fresh(), b = fresh();
  a.hit(10);
  b.tick(777); b.hit(10);                       // 同样的伤害、不同的时刻
  chk('不同时刻的同样一下，裂痕形状不同', a.F.crackSignature() !== b.F.crackSignature(), a.F.crackSignature() + ' vs ' + b.F.crackSignature());
  const c = fresh();
  const orig = c.S.sandbox.Math.random;
  let n = 0;
  c.S.sandbox.Math.random = function () { n++; return orig(); };
  c.hit(10); c.hit(10); c.hit(30);
  c.S.sandbox.Math.random = orig;
  chk('生成裂痕不消耗 Math.random（不扰动游戏随机流）', n === 0, 'calls=' + n);
  const sigs = new Set();
  for (let i = 0; i < 8; i++) { const d = fresh(); d.tick(i * 131); d.hit(8); sigs.add(d.F.crackSignature()); }
  chk('8 次受击的形状两两不同', sigs.size === 8, 'distinct=' + sigs.size);
}

/* ---- B. 严重度 ---- */
{
  const a = fresh(), b = fresh();
  a.hit(5); b.hit(40);
  chk('单次伤害更大 → 严重度更高', b.F.crackSeverity() > a.F.crackSeverity(), a.F.crackSeverity().toFixed(2) + ' < ' + b.F.crackSeverity().toFixed(2));
  const c = fresh(), sev = [];
  for (let i = 0; i < 6; i++) { c.hit(5); sev.push(c.F.crackSeverity()); }
  chk('累计伤害越多，同样一下的严重度单调不减', sev.every((v, i) => i === 0 || v >= sev[i - 1] - 1e-9), sev.map(v => v.toFixed(2)).join(' → '));
  chk('严重度在 [0.12, 1]', sev.every(v => v >= 0.12 - 1e-9 && v <= 1 + 1e-9));
}

/* ---- C. 再次受伤 ---- */
{
  const a = fresh();
  a.hit(8);
  const segs1 = a.F.crackSegments(), cl1 = a.F.crackClusters();
  for (let i = 0; i < 50; i++) a.tick(100);     // 5 s：已过保持期、正在消退
  const mid = a.F.hurtLevel();
  chk('消退途中可见度小于 1', mid > 0 && mid < 1, 'vis=' + mid.toFixed(2));
  a.hit(8);
  chk('再次受伤：可见度立刻回满', a.F.hurtLevel() > 0.999, 'vis=' + a.F.hurtLevel().toFixed(3));
  chk('再次受伤：线段增加（生长或新簇，不是替换）', a.F.crackSegments() > segs1, segs1 + ' → ' + a.F.crackSegments());
  chk('再次受伤：旧簇还在', a.F.crackClusters() >= cl1);
  const b = fresh();
  b.hit(8);
  const s0 = b.F.crackSegments();
  b.hit(60);                                    // 大伤害必定另起一簇
  chk('单次 > 25% 满血必定另起一簇', b.F.crackClusters() === 2 && b.F.crackSegments() > s0);
}

/* ---- D. 消退 ---- */
{
  const a = fresh();
  a.hit(10);
  const hold = a.F.FX.crackHold;
  for (let i = 0; i < Math.floor(hold * 10) - 2; i++) a.tick(100);
  chk('保持期内满可见', a.F.hurtLevel() > 0.999, 'vis=' + a.F.hurtLevel().toFixed(3));
  const sevLo = fresh(); sevLo.hit(3);
  const sevHi = fresh(); sevHi.hit(45);
  let tl = 0, th = 0;
  for (let i = 0; i < 300 && sevLo.F.crackSegments() > 0; i++) { sevLo.tick(100); tl++; }
  for (let i = 0; i < 300 && sevHi.F.crackSegments() > 0; i++) { sevHi.tick(100); th++; }
  chk('伤得越重消退得越久', th > tl, tl / 10 + ' s < ' + th / 10 + ' s');
  chk('最终清空', sevLo.F.crackSegments() === 0 && sevHi.F.crackSegments() === 0 && sevHi.F.hurtLevel() === 0);
  chk('消退总时长不超过 hold + base + span', th / 10 <= a.F.FX.crackHold + a.F.FX.crackBase + a.F.FX.crackSpan + 0.5, th / 10 + ' s');
}

/* ---- E. 封顶 ---- */
{
  const a = fresh();
  let max = 0;
  for (let i = 0; i < 300; i++) { a.hit(0.2); max = Math.max(max, a.F.crackSegments()); }
  chk('连续小伤害：线段总数封顶', max <= a.F.FX.crackMax + 450, 'max=' + max + ' cap=' + a.F.FX.crackMax);
}

/* ---- F. 杂项 ---- */
{
  const a = fresh();
  a.hit(20);
  let thrown = null;
  try { a.tick(16, 400, 900); a.tick(16, 1920, 1080); a.tick(16, 800, 0); } catch (e) { thrown = e; }
  chk('窗口比例变化 / 高度为 0 不抛错', !thrown, thrown && thrown.message);
  const before = a.F.crackSegments();
  a.p.alive = false; a.p.hp -= 30; a.tick(16);
  chk('玩家已死亡时不再生成新裂痕', a.F.crackSegments() === before && before > 0, before + ' → ' + a.F.crackSegments());
  const np = Object.assign({}, a.p, { alive: true, hp: 100 });
  a.F.draw(a.S.sandbox.Renderer.ctx || {}, 800, 600, np);
  chk('换玩家对象：裂痕与告警清零', a.F.crackSegments() === 0 && !a.F.alertOn());
  const b = fresh();
  b.hit(20); b.F.reset();
  chk('reset 清零', b.F.crackSegments() === 0 && b.F.hurtLevel() === 0 && b.F.crackSeverity() === 0);
}

process.exit(ok ? 0 : 1);
