#!/usr/bin/env node
/* ============================================================
   战场环境事件探针（docs/POST2-0IMPL.md 5.7，批次 5f）
   A. 没声明 mission.ambient：什么都不发生（world.ambient 不存在）
   B. distress：播出我方呼号的求援；reinforce：在边缘生成 n 架、播无线电、受 max 限制；
      straggler：生成 hp 25% 的飞机且直接撤离；distant：播一句 fx 无线电
   C. cooldown 生效；概率 0 不触发
   用法：node tools/test/probes/probe-ambient.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}
function scene(ambient, trace) {
  const S = Sim.load({ seed: 3, trace: !!trace });
  const { M3, Ent, AI, MISSIONS } = S.sandbox;
  const idx = MISSIONS.findIndex(m => m.id === 'm1');
  if (ambient) MISSIONS[idx].ambient = ambient;
  S.start(idx);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  p.hp = p.maxHp = 1e9;
  const ally = Ent.makeAircraft({ type: 'albatross', team: 0, x: p.pos.x + 800, y: 4000, z: p.pos.z + 500, fwd: M3.V(0, 0, 1), speed: 250, special: null });
  ally.label = 'ALPHA-1'; ally.hp = ally.maxHp = 1e9; AI.attach(ally, { role: 'ally', skill: 0.5 }); w.actors.push(ally);
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  return { S, w, p, step, R: S.sandbox.Radio, M3 };
}

{
  const W = scene(null);
  W.step(60 * 30);
  chk('A 没声明 ambient：什么都不发生', W.w.ambient === undefined);
}
{
  const W = scene([{ type: 'distress', p: 1, cooldown: 10 }]);
  W.step(60 * 30);
  const lines = W.R.log().filter(e => e.who === 'ALPHA-1');
  chk('B distress：我方呼号播出求援', lines.length >= 1, 'lines=' + lines.length);
  chk('C cooldown：30 s 内最多触发 3 次（冷却 10 s，节拍 5 s）', lines.length <= 3, 'lines=' + lines.length);
}
{
  const W = scene([{ type: 'reinforce', team: 0, n: 2, p: 1, cooldown: 5, max: 1 }]);
  const n0 = W.w.actors.length;
  W.step(60 * 40);
  const fresh = W.w.actors.length - n0;
  chk('B reinforce：在边缘生成 n 架我方机，且受 max = 1 限制', fresh === 2, 'new=' + fresh);
  chk('B reinforce：播了一句无线电', W.R.log().some(e => e.who === 'SEXTANT'));
}
{
  const W = scene([{ type: 'straggler', team: 1, p: 1, cooldown: 999 }]);
  const n0 = W.w.actors.length;
  W.step(60 * 12);
  const s = W.w.actors.slice(n0).find(a => a.team === 1 && a.ai);
  chk('B straggler：生成 hp 25% 的敌机并进入撤离', !!s && s.hp <= s.maxHp * 0.3 && (s.ai.retreating || !s.alive), s ? 'hp=' + (s.hp / s.maxHp).toFixed(2) + ' retreating=' + s.ai.retreating : 'none');
}
{
  const W = scene([{ type: 'distant', p: 1, cooldown: 999 }]);
  W.step(60 * 12);
  chk('B distant：触发并入队了一句 fx 无线电（杂项优先级，被剧情台词压着时可能被丢弃，日志里仍有）', W.R.log().some(e => e.cls === 'fx'));
  const Z = scene([{ type: 'distant', p: 0, cooldown: 1 }]);
  Z.step(60 * 30);
  chk('C 概率 0：不触发', Z.R.log().filter(e => e.cls === 'fx').length === 0);
}

/* ---------- F：?debug=ai 叠加层渲染不抛错（只读状态） ---------- */
{
  const W = scene(null);
  W.step(60 * 3);
  W.S.sandbox.HUD.debugAI = true;
  let err = null;
  try { W.S.render(); } catch (e) { err = e; }
  chk('F AI 调试叠加层（?debug=ai）整帧渲染不抛错', !err, err ? String(err.stack).split('\n')[0] : '');
}

/* ---------- F2：Director 扇区环（≥ 2 架友机）---------- */
{
  const W = scene(null, true);
  const { M3, Ent, AI } = W.S.sandbox;
  const ally2 = Ent.makeAircraft({ type: 'albatross', team: 0, x: W.p.pos.x - 800, y: 4000, z: W.p.pos.z + 700, fwd: M3.V(0, 0, 1), speed: 250, special: null });
  ally2.label = 'ALPHA-2'; ally2.hp = ally2.maxHp = 1e9; AI.attach(ally2, { role: 'ally', skill: 0.5 }); W.w.actors.push(ally2);
  const foe = Ent.makeAircraft({ type: 'albatross', team: 1, x: W.p.pos.x, y: 4000, z: W.p.pos.z + 6000, fwd: M3.V(0, 0, -1), speed: 250, special: null });
  foe.hp = foe.maxHp = 1e9; AI.attach(foe, { role: 'enemy', skill: 0.5 }); W.w.actors.push(foe);
  W.step(60 * 3);
  const d = W.w.aiDir;
  chk('F2 两架友机：aiDir 有 2 个友机，且 AI.sectorOf 返回 [中心角, 半宽]', d && d.allies.length >= 2 && Array.isArray(AI.sectorOf(d, d.allies[0])) && Math.abs(AI.sectorOf(d, d.allies[0])[1] - Math.PI / d.allies.length) < 1e-9);
  const lines = () => W.S.trace.filter(t => t.startsWith('lineTo(')).length;
  W.S.trace.length = 0; W.S.sandbox.HUD.debugAI = false; W.S.render();
  const off = lines();
  W.S.trace.length = 0; W.S.sandbox.HUD.debugAI = true;
  let err = null;
  try { W.S.render(); } catch (e) { err = e; }
  const on = lines();
  chk('F2 扇区环整帧渲染不抛错', !err, err ? String(err.stack).split('\n')[0] : '');
  chk('F2 开 ?debug=ai 后确实多画了扇区环的线（关掉时不画）', on > off, 'lineTo ' + off + ' → ' + on);
  W.S.sandbox.HUD.debugAI = false;
}

process.exit(ok ? 0 : 1);
