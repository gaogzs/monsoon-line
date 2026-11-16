'use strict';

/* ============================================================
   Ambient —— 战场环境事件（docs/POST2-0IMPL.md 5.7「导演与系统」，批次 5f）

   关卡级、低频的随机事件，由 mission.ambient = [{ type, p, cooldown, … }] 声明；**缺省没有**（默认关，批次 8 逐关选用）。
   只用现有的 spawn、Chatter、Radio 拼出来，不新增机制：
     distress   友军遇袭求援信号：挑一架有呼号的我方 AI，让 Chatter 喊求援（help）
     reinforce  增援编队抵达：{ team, n, ac, rank, side, max }，在战区边缘生成 n 架（我方用 spawnAlly，敌方用 spawnEnemy），
                并播一句无线电；max = 整局最多触发几次（缺省 1）
     straggler  受损残机返航：{ team, ac }，一架 hp 25% 的飞机从边缘生成、直接进入撤离（贴边界低速离场，不计击毁）
     distant    远处交火：只播一句"远处舰队交火"的无线电（cls fx，不受乱码影响）
   每条每 TICK 秒掷一次骰（概率 p），触发后进入 cooldown 秒；随机数用私有 LCG，不碰 Math.random。
   只在函数体内引用 spawnEnemy / spawnAlly / Chatter / Radio / T / M3 / Arena，加载期不依赖它们。
   ============================================================ */
var Ambient = (function () {
  var TICK = 5;

  function state(world) {
    if (!world.ambient) world.ambient = { rs: 77177, acc: 0, cd: {}, count: {} };
    return world.ambient;
  }
  function rnd01(st) { st.rs = (Math.imul(st.rs, 1664525) + 1013904223) >>> 0; return (st.rs + 0.5) / 4294967296; }

  function edgePos(world, side, st) {
    var ar = world.arenaDef;
    if (!ar) return null;
    var inset = ar.half - ar.warn * 0.5, j = (rnd01(st) - 0.5) * ar.half * 0.6;
    var sg = side.charAt(0) === '-' ? -1 : 1;
    return side.charAt(1) === 'x' ? { x: ar.cx + sg * inset, z: ar.cz + j } : { x: ar.cx + j, z: ar.cz + sg * inset };
  }

  function say(world, who, key, ctxRnd, cls) {
    Radio.raw({ who: who, cls: cls || 'ally', tx: T.pick(key, ctxRnd), pri: 'chatter', gap: 0.8 });
  }

  var HANDLERS = {
    distress: function (world, d, st) {
      var pool = world.actors.filter(function (a) { return a.alive && a.team === 0 && a.ai && !a.isPlayer && !a.route && a.label; });
      if (!pool.length) return false;
      var u = pool[Math.floor(rnd01(st) * pool.length)];
      st.cd['help:' + u.label] = undefined;                 // 环境事件不被 Chatter 自己的冷却挡住
      if (world.chat && world.chat.cd) delete world.chat.cd['help:' + u.label];
      return Chatter.emit(world, 'help', u);
    },
    reinforce: function (world, d, st) {
      var team = d.team === undefined ? 0 : d.team, side = d.side || (team === 0 ? '-z' : '+z');
      var pos = edgePos(world, side, st);
      if (!pos) return false;
      var n = d.n || 2, mk = team === 0 ? spawnAlly : spawnEnemy;
      var fwd = side.charAt(1) === 'x' ? M3.V(side.charAt(0) === '-' ? 1 : -1, 0, 0) : M3.V(0, 0, side.charAt(0) === '-' ? 1 : -1);
      for (var i = 0; i < n; i++) {
        mk(world, { ac: d.ac || 'albatross', rank: d.rank || 'pawn', x: pos.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 700, y: d.y || 5000,
          z: pos.z, fwd: fwd, speed: 260, special: d.special === undefined ? 'dl6' : d.special, callsign: d.callsign || null });
      }
      say(world, 'SEXTANT', 'radio.ambient.reinforce.' + (team === 0 ? 'ally' : 'foe') + '.variants', function () { return rnd01(st); }, team === 0 ? 'cmd' : 'enemy');
      return true;
    },
    straggler: function (world, d, st) {
      var team = d.team === undefined ? 1 : d.team, side = d.side || (team === 0 ? '-z' : '+z');
      var pos = edgePos(world, side, st);
      if (!pos) return false;
      var a = (team === 0 ? spawnAlly : spawnEnemy)(world, { ac: d.ac || 'albatross', rank: 'pawn', x: pos.x, y: 3000, z: pos.z, fwd: M3.V(0, 0, 1), speed: 180, special: null });
      a.hp = a.maxHp * 0.25;
      a.ai.retreating = true;                               // 直接进入撤离：沿最近出界口离场，不计击毁
      return true;
    },
    distant: function (world, d, st) {
      say(world, '', 'radio.ambient.distant.variants', function () { return rnd01(st); }, 'fx');
      return true;
    }
  };

  function update(world, mission, dt) {
    var list = mission && mission.ambient;
    if (!list || !list.length || !world) return;
    var st = state(world);
    st.acc += dt;
    if (st.acc < TICK) return;
    st.acc = 0;
    var t = world.time || 0;
    for (var i = 0; i < list.length; i++) {
      var d = list[i], key = i + ':' + d.type, h = HANDLERS[d.type];
      if (!h) continue;
      if (st.cd[key] !== undefined && t < st.cd[key]) continue;
      if ((st.count[key] || 0) >= (d.max === undefined ? (d.type === 'reinforce' ? 1 : 99) : d.max)) continue;
      if (rnd01(st) >= (d.p === undefined ? 0.1 : d.p)) continue;
      if (h(world, d, st)) { st.cd[key] = t + (d.cooldown || 60); st.count[key] = (st.count[key] || 0) + 1; }
    }
  }

  return { update: update, TICK: TICK };
})();
