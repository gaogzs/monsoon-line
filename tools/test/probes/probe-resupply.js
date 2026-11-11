#!/usr/bin/env node
/* ============================================================
   整备点探针（批次 4.2）

   单位整备点（m8，座头鲸号：r 1500、hold 4、swap、reset 'runway'，次数缺省 = 无限）：
     · 驻留满 hold 秒打开整备；整备打开期间主循环不推进（时间 / timeLimit 冻结）
     · 确认后玩家状态与"开局"逐项相等（弹药池 / 发射槽 / 机炮 / 干扰弹 / 血量 / 重量模型 …）
     · 补给结束后玩家被重置到甲板跑道末端（两条里的一条）：刚离舰、顺舰首方向、略爬升、速度 ≥ 失速速度
     · 换了挂载再确认，结果与"用同一份挂载开局"逐项相等
     · 整备完不离开不会连续整备；离开再回来可以无限次
   界外整备区（m1：-z 侧、hold 6、reset 'inward'，无限）：
     · 在 -z 侧警告区驻留：不渐黑；满 6 s 打开整备；整备后同一位置、机头背对界外、平飞
     · 整备完赖在界外：宽限期（15 s）过后恢复越界渐黑
     · 在别的一侧的警告区：不触发整备
   reset 的几种取值（Resupply 单元级）：keep / runway / inward / 自定义 { pos, y, heading, speed }
   有限次数（uses 写了数字）：耗尽后 empty、不再打开
   规避：有敌方导弹逼近（< 6 km）时拒绝开始
   NPC（我方 AI 飞机，含僚机）：触发后过 npcDelay 秒从战场消失（alive 仍为 true），再过 npcAway 秒
     在重置位置补满出现；开局就在范围里的先要离开一次
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
function drain(p) {            // 把飞机打残：弹药、机炮、干扰弹、血量、失速
  for (const k in p.ammoPool) p.ammoPool[k] = 0;
  for (const k in p.slotCd) p.slotCd[k] = p.slotCd[k].map(() => 5);
  p.spAmmo = 0; p.gunAmmo = 3; p.flares = 2; p.flareCd = 4; p.hp = 17; p.stall = true;
}
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/* 座头鲸号的跑道末端在世界里的位置（与 Resupply.resetPose 同一公式，独立再写一遍用来对照） */
function runwayEnds(carrier) {
  const f = carrier.fwd, fl = Math.hypot(f.x, f.z), fx = f.x / fl, fz = f.z / fl, rx = fz, rz = -fx;
  return carrier.ship.runways.map(w => ({ x: carrier.pos.x + rx * w.x + fx * w.z, z: carrier.pos.z + rz * w.x + fz * w.z, y: carrier.pos.y + w.y, yaw: Math.atan2(fx, fz) + (w.yaw || 0) }));
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
  const run = (secs, dx) => { for (let i = 0; i < secs * 60; i++) { place(dx === undefined ? 300 : dx, 0); p.hp = Math.max(p.hp, 17); S.step(1 / 60); if (G.__rearmOpen()) break; } };

  chk('整备点次数缺省 = 无限', w.resupply.entries[0].uses === Infinity);
  drain(p);
  run(3);
  chk('驻留 3 s（< hold 4 s）：还没打开', !G.__rearmOpen() && w.resupply.status.kind === 'hold', JSON.stringify(w.resupply.status));
  run(2);
  chk('驻留满 4 s：整备界面打开', G.__rearmOpen() === true);
  chk('整备次数 +1', w.rearmCount === 1);

  // 整备打开期间主循环不推进
  w.timeLimit = 100; w.timeLeft = 100;
  const t0 = w.time;
  for (let i = 0; i < 180; i++) G.__frame(1 / 60);
  chk('整备打开期间：world.time / timeLeft 不变', w.time === t0 && w.timeLeft === 100, 'time ' + t0 + '→' + w.time);

  G.__confirmRearm();
  chk('确认后界面关闭', G.__rearmOpen() === false);
  const d1 = diff(fresh, snap(p));
  chk('确认后与开局状态逐项相等', d1.length === 0, d1.join(','));

  // 补给结束后：重置到甲板跑道末端（两条里的一条），刚离舰
  const ends = runwayEnds(carrier);
  const best = ends.map(e => hd(e, p.pos)).sort((a, b) => a - b)[0];
  const vs = S.sandbox.Ent.vStallAt(p);
  chk('补给后被重置到某条跑道的末端（水平偏差 < 2 m）', best < 2, 'best=' + best.toFixed(2));
  chk('高度 = 甲板 + 8 m（刚离舰）', Math.abs(p.pos.y - (carrier.pos.y + 19.2 + 8)) < 0.5, 'y=' + p.pos.y.toFixed(1));
  const hdg = Math.atan2(p.fwd.x, p.fwd.z), want = ends[0].yaw;
  chk('朝向 = 舰首方向，略爬升', Math.abs(Math.atan2(Math.sin(hdg - want), Math.cos(hdg - want))) < 0.02 && p.fwd.y > 0.03 && p.fwd.y < 0.12, 'fwd=' + JSON.stringify(p.fwd));
  chk('速度 ≥ 1.3 × 失速速度（不会一出来就失速）', p.speed >= vs * 1.3, 'speed=' + p.speed.toFixed(0) + ' vStall=' + vs.toFixed(0));

  // 整备完不离开：不会连续整备
  drain(p); place(300, 0); run(8);
  chk('整备完不离开：不会连续整备', !G.__rearmOpen() && w.rearmCount === 1);
  // 离开再回来：无限次，第 2、3 次都能整备
  let times = 1;
  for (let n = 0; n < 2; n++) {
    p.pos.x = carrier.pos.x + 9000; S.step(1 / 60);
    drain(p); run(5);
    if (G.__rearmOpen()) { times++; G.__confirmRearm(); }
  }
  chk('离开再回来：可以无限次整备（共 ' + times + ' 次）', times === 3 && w.rearmCount === 3 && w.resupply.status.kind !== 'empty');
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

/* Resupply 单元级（手搓 world）：near / 规避 / 被击毁 / 有限次数 / reset 的几种取值 */
{
  const S = Sim.load({ seed: 1 });
  const R = S.sandbox.Resupply, M3 = S.sandbox.M3;
  const unit = { alive: true, team: 0, pos: M3.V(0, 0, 0), fwd: M3.V(0, 0, 1) };
  const mk = () => ({ missiles: [], actors: [], refs: { u: unit }, arenaDef: null, resupply: null, rearmCount: 0, time: 0 });
  const w = mk();
  R.init(w, { resupply: [{ ref: 'u', r: 1500, hold: 4, swap: true }] });
  const p = { alive: true, team: 0, pos: M3.V(3000, 3000, 0) };     // 水平距离只看 x、z（y 是高度）= 3000
  R.update(w, p, 1 / 60);
  chk('3r 以内、r 以外：status near，带距离', w.resupply.status.kind === 'near' && Math.abs(w.resupply.status.dist - 3000) < 1, JSON.stringify(w.resupply.status));
  p.pos = M3.V(5000, 3000, 0);
  R.update(w, p, 1 / 60);
  chk('3r 以外：无状态', w.resupply.status.kind === 'none');

  p.pos = M3.V(200, 3000, 0);
  w.missiles.push({ alive: true, team: 1, target: p, pos: M3.V(5000, 3000, 0) });
  let ev = null;
  for (let i = 0; i < 600; i++) ev = R.update(w, p, 1 / 60) || ev;
  chk('有导弹逼近（< 6 km）：拒绝整备，status busy，计时清零', !(ev && ev.open) && w.resupply.status.kind === 'busy' && w.resupply.entries[0].t === 0);
  w.missiles[0].pos = M3.V(9000, 3000, 0);
  for (let i = 0; i < 300; i++) ev = R.update(w, p, 1 / 60) || ev;
  chk('导弹走远（> 6 km）后恢复计时并整备', ev && ev.open);

  const w2 = mk();
  R.init(w2, { resupply: [{ ref: 'u', r: 1500, hold: 4, swap: true }] });
  unit.alive = false;
  R.update(w2, { alive: true, team: 0, pos: M3.V(0, 3000, 0) }, 1);
  chk('整备点单位被击毁：不再提供整备', w2.resupply.status.kind === 'none');
  unit.alive = true;

  // 有限次数：写了 uses 才会耗尽
  const w3 = mk();
  R.init(w3, { resupply: [{ ref: 'u', r: 1500, hold: 1, swap: true, uses: 1 }] });
  const q = { alive: true, team: 0, pos: M3.V(200, 3000, 0) };
  let opened = 0;
  for (let i = 0; i < 300; i++) { const e = R.update(w3, q, 1 / 60); if (e && e.open) opened++; }
  chk('uses 写了数字：只整备一次，之后 status empty', opened === 1 && w3.resupply.entries[0].uses === 0 && w3.resupply.status.kind === 'empty');

  // reset 的几种取值
  const pl = { alive: true, team: 0, pos: M3.V(10, 2000, 20), fwd: M3.V(0, 0, 1), speed: 200, ac: S.sandbox.AIRCRAFT[0], phys: S.sandbox.AIRCRAFT[0].phys };
  const E = def => ({ def: def, unit: unit });
  chk('reset 缺省 / keep：不改动（null）', R.resetPose(w, E({}), pl) === null && R.resetPose(w, E({ reset: 'keep' }), pl) === null);
  const cu = R.resetPose(w, E({ reset: { pos: [100, 200], y: 3000, heading: 90, speed: 250 } }), pl);
  chk('reset 自定义：位置 / 高度 / 航向（90° = +x）/ 速度', cu && cu.x === 100 && cu.z === 200 && cu.y === 3000 && Math.abs(cu.fwd.x - 1) < 1e-9 && Math.abs(cu.fwd.z) < 1e-9 && cu.speed === 250, JSON.stringify(cu));
  const part = R.resetPose(w, E({ reset: { heading: 180 } }), pl);
  chk('reset 自定义缺的字段保持不变', part && part.x === 10 && part.z === 20 && part.y === 2000 && Math.abs(part.fwd.z + 1) < 1e-9 && part.speed === 200, JSON.stringify(part));
  chk('reset runway 但单位没有跑道数据：不改动', R.resetPose(w, E({ reset: 'runway' }), pl) === null);
  for (const [side, fx, fz] of [['-z', 0, 1], ['+z', 0, -1], ['-x', 1, 0], ['+x', -1, 0]]) {
    const ip = R.resetPose(w, { def: { edge: side, reset: 'inward' } }, pl);
    chk('reset inward：' + side + ' 侧 → 机头背对界外（' + fx + ',0,' + fz + '）平飞，位置不变', ip && ip.fwd.x === fx && ip.fwd.y === 0 && ip.fwd.z === fz && ip.x === 10 && ip.z === 20 && ip.y === 2000);
  }
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
  const px = p.pos.x, py = p.pos.y, pz = p.pos.z;
  p.fwd = S.sandbox.M3.V(0, 0.3, -1);               // 故意朝外、带俯仰
  G.__confirmRearm();
  const d = diff(fresh, snap(p));
  chk('界外整备后弹药等与开局一致', d.length === 0, d.join(','));
  chk('同一位置', p.pos.x === px && p.pos.y === py && p.pos.z === pz);
  chk('机头背对界外（+z）、平飞', Math.abs(p.fwd.x) < 1e-9 && Math.abs(p.fwd.y) < 1e-9 && p.fwd.z > 0.999, JSON.stringify(p.fwd));
  chk('速度 ≥ 1.3 × 失速速度', p.speed >= S.sandbox.Ent.vStallAt(p) * 1.3);

  // 整备完赖在界外：宽限期内不渐黑，宽限（15 s）过后恢复渐黑
  let fadeEarly = 0;
  for (let i = 0; i < 10 * 60; i++) { p.pos.x = ar.cx; p.pos.z = zOut; p.hp = p.maxHp; S.step(1 / 60); fadeEarly = Math.max(fadeEarly, w.arenaFade); }
  chk('整备后 10 s 内（宽限期）仍不渐黑', fadeEarly === 0, 'fade=' + fadeEarly);
  for (let i = 0; i < 10 * 60; i++) { p.pos.x = ar.cx; p.pos.z = zOut; p.hp = p.maxHp; S.step(1 / 60); }
  chk('宽限（15 s）过后赖在界外：恢复渐黑', w.arenaFade > 0.3, 'fade=' + w.arenaFade);
}
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game;
  S.start(0);
  const w = G.__world(), p = G.__player(), ar = w.arenaDef;
  p.hp = p.maxHp = 1e9;
  for (let i = 0; i < 10 * 60; i++) { p.pos.x = ar.cx; p.pos.z = ar.cz + ar.half - 3000; p.hp = p.maxHp; S.step(1 / 60); }
  chk('+z 侧警告区（不是整备侧）：不整备', !G.__rearmOpen() && w.rearmCount === 0);
}

/* ---------- NPC：触发 → 延迟消失 → 延迟后在重置位置出现 ---------- */
function npcCase(label, missionId, setup, check) {
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game;
  const MI = S.sandbox.MISSIONS.findIndex(m => m.id === missionId);
  S.start(MI);
  const w = G.__world(), p = G.__player();
  p.hp = p.maxHp = 1e9;
  const a = w.wings[2];
  if (!a) { chk(label + '：找到僚机', false, '该关没有 wings[2]'); return; }
  const full = clone({ ammoPool: a.ammoPool, gunAmmo: a.gunAmmo, flares: a.flares, hp: a.hp });
  const ctx = setup(S, w, a);
  ctx.far();                                      // 先在范围外走一帧：武装
  S.step(1 / 60);
  for (const k in a.ammoPool) a.ammoPool[k] = 0;
  a.gunAmmo = 2; a.hp = a.maxHp * 0.4;
  for (let i = 0; i < 4 * 60 && !(a.rs && a.rs.cyc); i++) { ctx.near(); S.step(1 / 60); }
  chk(label + '：进入范围且弹药不足 → 触发周期', !!(a.rs && a.rs.cyc));
  let gone = null, back = null;
  const t0 = w.time;
  for (let i = 0; i < 12 * 60; i++) {
    if (gone === null) ctx.near();                // 消失之前一直把它留在范围里
    S.step(1 / 60);
    const inW = w.actors.indexOf(a) >= 0;
    if (gone === null && !inW) gone = w.time - t0;
    if (gone !== null && back === null && inW) { back = w.time - t0; break; }
  }
  chk(label + '：约 3 s 后从战场消失（alive 仍为 true，不触发僚机损失）', gone !== null && Math.abs(gone - 3) < 0.3 && a.alive === true && !w.flags.allyDown, 'gone=' + gone);
  chk(label + '：再过约 4 s 重新出现', back !== null && Math.abs((back - gone) - 4) < 0.3, 'back-gone=' + (back === null ? null : (back - gone).toFixed(2)));
  if (back === null) return;
  const dd = diff(full, clone({ ammoPool: a.ammoPool, gunAmmo: a.gunAmmo, flares: a.flares, hp: a.hp }));
  chk(label + '：重新出现时弹药 / 机炮 / 干扰弹 / 血量全部补满', dd.length === 0, dd.join(','));
  check(S, w, a, ctx);
}
npcCase('NPC·航母（m8，reset runway）', 'm8', (S, w, a) => {
  const c = w.refs.carrier;
  return { far: () => { a.pos.x = c.pos.x + 30000; a.pos.z = c.pos.z; a.pos.y = 3000; }, near: () => { a.pos.x = c.pos.x + 400; a.pos.z = c.pos.z; a.pos.y = 3000; }, c };
}, (S, w, a, ctx) => {
  const ends = runwayEnds(ctx.c);
  const best = ends.map(e => hd(e, a.pos)).sort((x, y) => x - y)[0];
  chk('NPC·航母：重新出现在某条跑道的末端（< 5 m）、略爬升、速度 ≥ 失速速度', best < 5 && a.fwd.y > 0.03 && a.speed >= S.sandbox.Ent.vStallAt(a) * 1.3, 'best=' + best.toFixed(2));
});
npcCase('NPC·界外整备区（m1，reset inward）', 'm1', (S, w, a) => {
  const ar = w.arenaDef, z = ar.cz - ar.half + 2500;
  return { far: () => { a.pos.x = ar.cx; a.pos.z = ar.cz; a.pos.y = 5000; }, near: () => { a.pos.x = ar.cx + 100; a.pos.z = z; a.pos.y = 5000; }, z, ar };
}, (S, w, a, ctx) => {
  chk('NPC·界外区：同一位置、机头背对界外（+z）、平飞',
    Math.abs(a.pos.x - (ctx.ar.cx + 100)) < 5 && Math.abs(a.pos.z - ctx.z) < 5 && Math.abs(a.fwd.y) < 1e-6 && a.fwd.z > 0.999, JSON.stringify({ x: a.pos.x, z: a.pos.z, fwd: a.fwd }));
});
npcCase('NPC·平台（m9，reset 缺省 keep）', 'm9', (S, w, a) => {
  const rig = w.refs.rigA;
  return { far: () => { a.pos.x = rig.pos.x + 20000; a.pos.z = rig.pos.z; a.pos.y = 2500; }, near: () => { a.pos.x = rig.pos.x + 300; a.pos.z = rig.pos.z; a.pos.y = 2500; }, rig };
}, (S, w, a, ctx) => {
  chk('NPC·keep：原位置重新出现（不被挪到别处）', Math.abs(a.pos.x - (ctx.rig.pos.x + 300)) < 5 && Math.abs(a.pos.z - ctx.rig.pos.z) < 5 && Math.abs(a.pos.y - 2500) < 5, JSON.stringify(a.pos));
});

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
