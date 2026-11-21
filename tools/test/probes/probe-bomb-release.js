#!/usr/bin/env node
/* ============================================================
   无动力炸弹的投放初速探针（js/engine/entities/missile.js 的 launchSpeed / launchVel，js/engine/game/launch.js）

   以前所有挂载一律「载机速度 + 70 m/s、沿机头」出架：导弹的弹射助推被炸弹照单全收，炸弹被向前"推"出去 70 m/s，
   悬停的垂直起降机甚至会把炸弹打出去 70 m/s。现在无动力弹（ballistic 且没有 burn：碎玉 clb、PEJ-22 hbh、PEJ-4 hbl、
   PEJ-14 pgb、PEJ-30 v30）的初速 = 载机此刻的速度矢量 + 沿机腹向下 EJECT_BOMB（3 m/s）；有动力的弹（导弹 / 火箭）仍是 +70。
   A. 平飞 300 m/s 投碎玉：初速矢量 ≈ 载机速度 + 向下 3 m/s，沿机头没有额外分量
   B. 悬停（速度 0）投弹：只有向下 3 m/s，水平速度为 0
   C. 五种无动力弹各投一枚：都满足 A；带漂移 / 竖直速度的载机（vel 与 fwd × speed 不同）继承的是真实 vel
   D. 导弹（srm）初速仍是载机速度 + 70（沿用旧行为）
   E. HUD 落点预测（naturalPoint）与真实投下的炸弹落点一致（同一个初速矢量）
   F. launchSpeed：无动力弹 +3、导弹 +70（HUD 预测 / AI 包线 / 真实发射共用）
   用法：node tools/test/probes/probe-bomb-release.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function setup(seed) {
  const S = Sim.load({ seed });
  S.start(0);
  const sb = S.sandbox, G = sb.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0; w.arenaDef = null;
  p.hp = p.maxHp = 1e9;
  const drop = (wid, o) => {
    o = o || {};
    p.special = wid; p.spAmmo = 4; p.spCd = 0; p.slotCd = null; p.ammoPool = {}; p.ammoPool[wid] = 4;
    p.fwd = sb.M3.V(0, 0, 1); p.up = sb.M3.V(0, 1, 0); p.right = sb.M3.V(-1, 0, 0);
    p.pos = sb.M3.V(0, o.alt || 6000, 0);
    p.speed = o.speed === undefined ? 300 : o.speed;
    p.vel = o.vel || sb.M3.V(0, 0, p.speed);
    const fired = G.$.launch(p, null, w);
    return { fired, m: fired ? w.missiles[w.missiles.length - 1] : null };
  };
  return { S, sb, w, p, G, drop };
}
const len = v => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

const { sb, w, p, drop } = setup(1);
const EJ = sb.Ent.$.EJECT_BOMB;

/* A 平飞投碎玉 */
{
  const r = drop('clb', { speed: 300 });
  const d = sub(r.m.vel, p.vel);
  chk('A 碎玉平飞投放：初速 = 载机速度 + 向下 ' + EJ + ' m/s，沿机头没有额外分量', r.fired && Math.abs(d.z) < 0.01 && Math.abs(d.x) < 0.01 && Math.abs(d.y + EJ) < 0.01,
    'dvel=(' + d.x.toFixed(2) + ',' + d.y.toFixed(2) + ',' + d.z.toFixed(2) + ') |vel|=' + len(r.m.vel).toFixed(1));
}

/* B 悬停投弹 */
{
  const r = drop('clb', { speed: 0, vel: sb.M3.V(0, 0, 0) });
  chk('B 悬停（速度 0）投碎玉：只有向下 ' + EJ + ' m/s，水平速度为 0（旧版会被打出去 70 m/s）', r.fired && Math.hypot(r.m.vel.x, r.m.vel.z) < 0.01 && Math.abs(r.m.vel.y + EJ) < 0.01,
    'vel=(' + r.m.vel.x.toFixed(2) + ',' + r.m.vel.y.toFixed(2) + ',' + r.m.vel.z.toFixed(2) + ')');
}

/* C 五种无动力弹 + 带漂移 / 竖直速度的载机 */
{
  const bad = [];
  for (const wid of ['clb', 'hbh', 'hbl', 'pgb', 'v30']) {
    if (!sb.WEAPONS[wid]) { bad.push(wid + ' 不存在'); continue; }
    const r = drop(wid, { speed: 250 });
    if (!r.fired) { bad.push(wid + ' 没打出去'); continue; }
    const d = sub(r.m.vel, p.vel);
    if (!(Math.abs(d.z) < 0.01 && Math.abs(d.y + EJ) < 0.01)) bad.push(wid + ' dvel=' + JSON.stringify(d));
  }
  chk('C hbh / hbl / pgb / v30 / clb 五种无动力弹：初速都是载机速度 + 向下 ' + EJ + ' m/s', bad.length === 0, bad.join('；'));
  const drift = drop('clb', { speed: 40, vel: sb.M3.V(12, -6, 40) });                 // vel ≠ fwd × speed（带漂移 / 下沉）
  const d = sub(drift.m.vel, sb.M3.V(12, -6, 40));
  chk('C 载机带漂移 / 竖直速度时，炸弹继承真实速度矢量（不是机头方向 × 速度）', Math.abs(d.x) < 0.01 && Math.abs(d.z) < 0.01 && Math.abs(d.y + EJ) < 0.01, 'dvel=(' + d.x.toFixed(2) + ',' + d.y.toFixed(2) + ',' + d.z.toFixed(2) + ')');
}

/* D 导弹仍是 +70；F launchSpeed */
{
  const r = drop('srm', { speed: 300 });
  chk('D 导弹（srm）初速仍是载机速度 + 70 m/s（有动力的弹保持旧行为）', r.fired && Math.abs(r.m.speed - 370) < 0.01, 'speed=' + (r.m && r.m.speed));
  chk('F launchSpeed：无动力弹 +' + EJ + '、导弹 +70', sb.Ent.launchSpeed(sb.WEAPONS.clb, 300) === 300 + EJ && sb.Ent.launchSpeed(sb.WEAPONS.srm, 300) === 370 && sb.Ent.isUnpowered(sb.WEAPONS.clb) && !sb.Ent.isUnpowered(sb.WEAPONS.srm));
}

/* E 落点预测与真实投下的炸弹一致 */
{
  const rows = []; let good = true;
  for (const [speed, alt] of [[300, 6000], [200, 3000], [0, 4000]]) {
    const r = drop('clb', { speed, alt, vel: sb.M3.V(0, 0, speed) });
    const wp = sb.WEAPONS.clb;
    const la = { pos: sb.M3.clone(p.pos), fwd: sb.M3.clone(p.fwd), speed: sb.Ent.launchSpeed(wp, p.speed), vel: sb.Ent.launchVel(wp, p) };
    const pred = sb.Ent.naturalPoint(wp, la, null);
    const m = r.m, world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    for (let i = 0; i < 60 * 120 && m.alive && m.pos.y > sb.Ent.$.groundY(m.pos.x, m.pos.z); i++) { sb.Ent.stepMissile(m, 1 / 60, world); world.particles.length = 0; }
    const err = Math.hypot(m.pos.x - pred.x, m.pos.z - pred.z);
    rows.push(speed + ' m/s @ ' + alt + ' m: 预测 z=' + pred.z.toFixed(0) + ' 实际 z=' + m.pos.z.toFixed(0) + ' 差 ' + err.toFixed(0) + ' m');
    if (err > 60) good = false;
  }
  chk('E HUD 落点预测（naturalPoint）与真实投下的炸弹落点一致（差 < 60 m）', good, rows.join('；'));
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
