#!/usr/bin/env node
/* ============================================================
   战场地图探针（按住 M）

   按键：
     · 点一下 M（< 0.22 s）= 切换鼠标引导 / 键盘直控，不显示地图
     · 按住 M（≥ 0.22 s）= world.mapOpen 置真，松开置假；松开**不**切换鼠标引导
     · 打开整备界面 / 失败画面时关地图，且不会自己冒出来（得重新按）
   画面：
     · 每一关开着地图整帧渲染不抛错（含没有 arena 的退化取景）
     · 敌方只画"已掌握"的：离玩家或友机 12 km 以内；12 km 以外不画（不因为开了地图就暴露）
   用法：node tools/test/probes/probe-tacmap.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

/* ---------- 按键 ---------- */
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game;
  S.start(0);
  const w = G.__world();

  const a0 = G.__aimMode();
  G.__mapKeyDown(1000); G.__updateMapKey(1100);
  chk('按下 0.1 s：还没显示地图', w.mapOpen === false);
  G.__mapKeyUp(1100);
  chk('点一下 M（0.1 s）：切换鼠标引导', G.__aimMode() !== a0 && w.mapOpen === false);
  G.__mapKeyDown(2000); G.__mapKeyUp(2100);       // 再点一下，切回去

  const a1 = G.__aimMode();
  G.__mapKeyDown(5000);
  G.__updateMapKey(5100);
  chk('按住 0.1 s：不显示', w.mapOpen === false);
  G.__updateMapKey(5300);
  chk('按住 0.3 s：显示地图', w.mapOpen === true);
  G.__updateMapKey(8000);
  chk('一直按着：一直显示（游戏没有因此暂停）', w.mapOpen === true);
  G.__mapKeyUp(8000);
  chk('松开：地图关闭，且不切换鼠标引导', w.mapOpen === false && G.__aimMode() === a1);

  // 按住时打开整备界面：地图关闭，整备结束后不会自己冒出来
  G.__mapKeyDown(10000); G.__updateMapKey(10500);
  chk('（再次按住）显示地图', w.mapOpen === true);
  G.openRearm({ def: { swap: true } });
  chk('打开整备界面：地图关闭', w.mapOpen === false);
  G.__confirmRearm();
  G.__updateMapKey(20000);
  chk('整备结束后仍按着 M：地图不会自己冒出来（得重新按）', w.mapOpen === false);
  G.__mapKeyUp(20000);
}

/* ---------- 渲染 ---------- */
{
  const S = Sim.load({ seed: 1, trace: true });
  const G = S.sandbox.Game, MS = S.sandbox.MISSIONS;
  const bad = [];
  for (let mi = 0; mi < MS.length; mi++) {
    S.start(mi);
    const w = G.__world();
    for (let i = 0; i < 30; i++) S.step(1 / 60);
    try {
      w.mapOpen = true; S.render();
      const ad = w.arenaDef; w.arenaDef = null; S.render(); w.arenaDef = ad;   // 没有 arena 的退化取景
    } catch (e) { bad.push(MS[mi].id + '：' + String(e.stack).split('\n').slice(0, 3).join(' | ')); }
  }
  chk('13 关开着地图整帧渲染不抛错（含无 arena 的退化取景）', !bad.length, bad.join('；'));
}

/* ---------- 敌方只画"已掌握"的 ---------- */
{
  const S = Sim.load({ seed: 1, trace: true });
  const G = S.sandbox.Game;
  S.start(0);
  const w = G.__world(), p = G.__player();
  const foes = w.actors.filter(a => a.team === 1 && a.alive);
  const redFill = () => {
    S.trace.length = 0;
    w.mapOpen = true; S.render();
    return S.trace.filter(s => s.indexOf('fillStyle') >= 0 && s.indexOf('rgba(255,74,74,0.9)') >= 0).length;
  };
  // 所有敌机、敌方设施都挪到离所有友机 > 12 km 的地方
  for (const a of foes) { a.pos.x = p.pos.x + 30000; a.pos.z = p.pos.z + 30000; }
  for (const t of w.targets) if (t.team === 1) { t.pos.x = p.pos.x - 40000; t.pos.z = p.pos.z - 40000; }
  const far = redFill();
  chk('敌方都在 12 km 以外：地图上一个敌方符号都不画', far === 0, 'red fills=' + far);
  foes[0].pos.x = p.pos.x + 5000; foes[0].pos.z = p.pos.z + 3000;
  const near = redFill();
  chk('一架敌机进到 12 km 以内：画出来', near >= 1, 'red fills=' + near);
  // 友机附近也算（共享数据链）：把敌机放到远离玩家、但贴着僚机的地方
  foes[0].pos.x = p.pos.x + 30000; foes[0].pos.z = p.pos.z + 30000;
  const wing = w.wings[2];
  if (wing) {
    wing.pos.x = p.pos.x + 30000; wing.pos.z = p.pos.z + 26000;
    const viaWing = redFill();
    chk('敌机离玩家很远、但在友机 12 km 以内：也算已掌握', viaWing >= 1, 'red fills=' + viaWing);
  }
}

process.exit(ok ? 0 : 1);
