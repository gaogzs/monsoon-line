#!/usr/bin/env node
/* ============================================================
   整备点探针（批次 4.2）

   单位整备点（m8，座头鲸号：r 1500、hold 4、uses 2、swap）：
     · 驻留满 hold 秒打开整备；整备打开期间主循环不推进（时间 / timeLimit 冻结）
     · 确认后玩家状态与"开局"逐项相等（弹药池 / 发射槽 / 机炮 / 干扰弹 / 血量 / 重量模型 …）
     · 换了挂载再确认，结果与"用同一份挂载开局"逐项相等
     · 整备完不离开不会连续整备；离开再回来才有第二次；次数用完 → empty、不再打开
   界外整备区（m1：-z 侧、hold 6、uses 1）：
     · 在 -z 侧警告区驻留：不渐黑；满 6 s 打开整备；次数用完后恢复越界规则
     · 在别的一侧的警告区：不触发整备
   规避：有敌方导弹逼近（< 6 km）时拒绝开始（Resupply 单元级，手搓 world）
   swap:false：不弹界面，直接补满
   用法：node tools/test/probes/probe-resupply.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}
const clone = o => JSON.parse(JSON.stringify(o, (k, v) => (v === Infinity ? 'INF' : v)));
function snap(p) {
  return clone({
    ammoPool: p.ammoPool, slotCd: p.slotCd, spAmmo: p.spAmmo, spSalvo: p.spSalvo, wpIdx: p.wpIdx, special: p.special,
    gunAmmo: p.gunAmmo, flares: p.flares, flareCd: p.flareCd, hp: p.hp, maxHp: p.maxHp,
    loadFactor: p.loadFactor, loadModel: p.loadModel, armor: p.armor, lockRangeK: p.lockRangeK,
    stall: p.stall, psm: p.psm || null
  });
}
function diff(a, b) {
  const bad = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) bad.push(k);
  return bad;
}
function drain(p) {            // 把玩家打残：弹药、机炮、干扰弹、血量、失速
  for (const k in p.ammoPool) p.ammoPool[k] = 0;
  for (const k in p.slotCd) p.slotCd[k] = p.slotCd[k].map(() => 5);
  p.spAmmo = 0; p.gunAmmo = 3; p.flares = 2; p.flareCd = 4; p.hp = 17; p.stall = true;
}

/* ---------- 单位整备点（m8）---------- */
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game;
  const MI = S.sandbox.MISSIONS.findIndex(m => m.id === 'm8');
  S.start(MI);
  const w = G.__world(), p = G.__player();
  const fresh = snap(p);                          // 开局状态
  const carrier = w.refs.carrier;
  const place = (dx, dz) => { p.pos.x = carrier.pos.x + dx; p.pos.z = carrier.pos.z + dz; p.pos.y = 3000; };
  const run = (secs) => { for (let i = 0; i < secs * 60; i++) { place(300, 0); p.hp = Math.max(p.hp, 17); S.step(1 / 60); if (G.__rearmOpen()) break; } };

  drain(p);
  run(3);
  chk('驻留 3 s（< hold 4 s）：还没打开', !G.__rearmOpen() && w.resupply.status.kind === 'hold', JSON.stringify(w.resupply.status));
  run(2);
  chk('驻留满 4 s：整备界面打开', G.__rearmOpen() === true);
  chk('uses 减 1，整备次数 +1', w.resupply.entries[0].uses === 1 && w.rearmCount === 1);

  // 整备打开期间主循环不推进
  w.timeLimit = 100; w.timeLeft = 100;
  const t0 = w.time;
  for (let i = 0; i < 180; i++) G.__frame(1 / 60);
  chk('整备打开期间：world.time / timeLeft 不变', w.time === t0 && w.timeLeft === 100, 'time ' + t0 + '→' + w.time);

  G.__confirmRearm();
  chk('确认后界面关闭', G.__rearmOpen() === false);
  const d1 = diff(fresh, snap(p));
  chk('确认后与开局状态逐项相等', d1.length === 0, d1.join(','));

  // 整备完不离开：不会连续整备
  drain(p); run(8);
  chk('整备完不离开：不会连续整备', !G.__rearmOpen() && w.resupply.entries[0].uses === 1);
  // 离开（> 3r）再回来：第二次
  p.pos.x = carrier.pos.x + 9000; S.step(1 / 60);
  run(5);
  chk('离开后回到范围：重新武装并再次整备', G.__rearmOpen() === true && w.resupply.entries[0].uses === 0);
  G.__confirmRearm();
  // 第三次：uses 用完
  p.pos.x = carrier.pos.x + 9000; S.step(1 / 60);
  drain(p); run(6);
  chk('次数用完：状态 empty，不再打开', !G.__rearmOpen() && w.resupply.status.kind === 'empty', JSON.stringify(w.resupply.status));
}

/* 换挂载再确认：与"用同一份挂载开局"逐项相等 */
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game, AC = S.sandbox.AIRCRAFT;
  const MI = S.sandbox.MISSIONS.findIndex(m => m.id === 'm8');
  S.start(MI);
  const w = G.__world(), p = G.__player(), carrier = w.refs.carrier;
  const ac = AC[0], st = G.__saveState();
  const lo = st.loadouts[ac.id] || (st.loadouts[ac.id] = S.sandbox.Loadout.defaults(ac));
  drain(p);
  for (let i = 0; i < 6 * 60 && !G.__rearmOpen(); i++) { p.pos.x = carrier.pos.x + 300; p.pos.z = carrier.pos.z; p.pos.y = 3000; p.hp = Math.max(p.hp, 17); S.step(1 / 60); }
  chk('（换挂载用例）整备已打开', G.__rearmOpen() === true);
  const g0 = ac.hardpointGroups[0].id;
  const before = lo[g0];
  lo[g0] = null;                                   // 界面里点了"空置"（卡片点击就是这么改的）
  G.__confirmRearm();
  const afterSwap = snap(p);
  S.start(MI);                                     // 同一份 loadouts 重新开局
  const d = diff(snap(G.__player()), afterSwap);
  chk('换挂载（' + g0 + ' ' + before + ' → 空）后整备 = 同一挂载开局', d.length === 0, d.join(','));
}

/* near 状态与规避拒绝：Resupply 单元级（手搓 world） */
{
  const S = Sim.load({ seed: 1 });
  const R = S.sandbox.Resupply, M3 = S.sandbox.M3;
  const unit = { alive: true, team: 0, pos: M3.V(0, 0, 0) };
  const mk = () => ({ missiles: [], refs: { u: unit }, arenaDef: null, resupply: null, rearmCount: 0 });
  const w = mk();
  R.init(w, { resupply: [{ ref: 'u', r: 1500, hold: 4, uses: 1, swap: true }] });
  const p = { alive: true, team: 0, pos: M3.V(3000, 3000, 0) };     // 水平距离只看 x、z（y 是高度）= 3000
  R.update(w, p, 1 / 60);
  chk('3r 以内、r 以外：status near，带距离', w.resupply.status.kind === 'near' && Math.abs(w.resupply.status.dist - 3000) < 1, JSON.stringify(w.resupply.status));
  p.pos = M3.V(5000, 3000, 0);
  R.update(w, p, 1 / 60);
  chk('3r 以外：无状态', w.resupply.status.kind === 'none');

  // 规避：一枚敌方导弹追着我、5 km
  p.pos = M3.V(200, 3000, 0);
  w.missiles.push({ alive: true, team: 1, target: p, pos: M3.V(5000, 3000, 0) });
  let ev = null;
  for (let i = 0; i < 600; i++) ev = R.update(w, p, 1 / 60) || ev;
  chk('有导弹逼近（< 6 km）：拒绝整备，status busy，计时清零', !(ev && ev.open) && w.resupply.status.kind === 'busy' && w.resupply.entries[0].t === 0);
  w.missiles[0].pos = M3.V(9000, 3000, 0);
  for (let i = 0; i < 300; i++) ev = R.update(w, p, 1 / 60) || ev;
  chk('导弹走远（> 6 km）后恢复计时并整备', ev && ev.open && w.resupply.entries[0].uses === 0);

  // 单位被击毁：不再算范围内
  const w2 = mk();
  R.init(w2, { resupply: [{ ref: 'u', r: 1500, hold: 4, uses: 1, swap: true }] });
  unit.alive = false;
  R.update(w2, { alive: true, team: 0, pos: M3.V(0, 3000, 0) }, 1);
  chk('整备点单位被击毁：不再提供整备', w2.resupply.status.kind === 'none');
}

/* ---------- 界外整备区（m1）---------- */
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game;
  S.start(0);
  const w = G.__world(), p = G.__player(), ar = w.arenaDef;
  const fresh = snap(p);
  const zIn = ar.cz - ar.half + 3000;               // -z 侧警告区里（深 3 km，没越界）
  const zOut = ar.cz - ar.half - 800;               // -z 侧界外
  let fadeMax = 0;
  drain(p);
  for (let i = 0; i < 9 * 60 && !G.__rearmOpen(); i++) {
    p.pos.x = ar.cx; p.pos.z = i < 3 * 60 ? zIn : zOut; p.pos.y = 5000; p.hp = Math.max(p.hp, 17);
    S.step(1 / 60); fadeMax = Math.max(fadeMax, w.arenaFade);
  }
  chk('-z 侧警告区 + 界外驻留：整备打开', G.__rearmOpen() === true);
  chk('整备区里不触发越界渐黑', fadeMax === 0, 'fadeMax=' + fadeMax);
  G.__confirmRearm();
  const d = diff(fresh, snap(p));
  chk('界外整备后弹药等与开局一致', d.length === 0, d.join(','));
  // 次数用完 → 恢复越界规则
  for (let i = 0; i < 300; i++) { p.pos.x = ar.cx; p.pos.z = zOut; p.hp = p.maxHp; S.step(1 / 60); }
  chk('次数用完后：在界外会渐黑', w.arenaFade > 0.3, 'fade=' + w.arenaFade);
}
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game;
  S.start(0);
  const w = G.__world(), p = G.__player(), ar = w.arenaDef;
  p.hp = p.maxHp = 1e9;
  for (let i = 0; i < 10 * 60; i++) { p.pos.x = ar.cx; p.pos.z = ar.cz + ar.half - 3000; p.hp = p.maxHp; S.step(1 / 60); }
  chk('+z 侧警告区（不是整备侧）：不整备', !G.__rearmOpen() && w.resupply.entries[0].uses === 1);
}

/* ---------- swap:false：不弹界面，直接补满 ---------- */
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game;
  S.start(0);
  const p = G.__player();
  const fresh = snap(p);
  drain(p);
  G.openRearm({ def: { swap: false } });
  chk('swap:false：不打开界面', G.__rearmOpen() === false);
  const d = diff(fresh, snap(p));
  chk('swap:false：直接补满，与开局一致', d.length === 0, d.join(','));
}

process.exit(ok ? 0 : 1);
