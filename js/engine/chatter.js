'use strict';

/* ============================================================
   Chatter —— 条件触发的无线电（docs/POST2-0IMPL.md 5.5b）

   事件 → 台词变体 → 走 Radio 的优先级队列。目的是烘托战场气氛、让 5a 的撤离 / 整备等 AI 行为
   在无线电里有反应，不是向玩家报告威胁：台词不带方位，敌方的只在附近才听得到。

   不改世界状态，不用 Math.random（私有 LCG，种子固定）——所以不影响 golden 回放。
   只在函数体内引用 Radio / T / M3，加载期不依赖任何后加载的模块。

   钩子：
     Chatter.update(world, dt)       update.js 每帧调：每帧扫新击杀（splash）；0.5 s 节拍轮询弹药 / 血量 / 规避
     Chatter.emit(world, type, unit) 通用入口（rtb 由 ai/retreat.js 调；其余多由 update 轮询触发）
     Chatter.fox(world, actor)       world.fireMissile 里调：NPC 发射的概率喊话
     Chatter.rearmed(world, unit)    Resupply.reappear 里调：整备完成，并重置该单位的轮询标记
   限频：同一（事件，说话人）有冷却；全场时间窗内总量有上限；说话人 = 单位呼号（label），没有就不播。
   台词：locales/zh-CN/text/radio.json，键 radio.<事件>.<ally|foe>.variants（数组，T.pick 随机挑）。
   声线集按队伍选：team 0 = ally，其余 = foe（设计里的"上游 / 下游"按机型 faction 选，faction 是本地化文本、不能当键）。
   ============================================================ */
var Chatter = (function () {
  var TICK = 0.5;                 // 轮询节拍（s）
  var FOX_P = 0.12;               // 每次 NPC 发射喊 Fox 的概率
  var GLOBAL_WIN = 10;            // 全场限频时间窗（s）
  var GLOBAL_MAX = 3;             // 时间窗内最多几条
  var FOE_RANGE = 20000;          // 敌方台词：离玩家多近才听得到（m）
  var BINGO_FRAC = 0.25;          // 导弹弹药低于此比例 → bingoAmmo
  var CD = {                      // 同一（事件，说话人）的冷却（s）
    bingoAmmo: 30, winchester: 30, rtb: 30, rearmed: 20, splash: 8, damaged: 8, fox: 20, defensive: 12
  };
  var ATMOS = { fox: 1, defensive: 1 };       // 气氛类：一律 pri chatter（可过期、可被丢弃）

  function state(world) {
    if (!world.chat) world.chat = { rs: 20260116, cd: {}, win: [], acc: 0 };
    return world.chat;
  }
  function rnd01(st) {
    st.rs = (Math.imul(st.rs, 1664525) + 1013904223) >>> 0;
    return (st.rs + 0.5) / 4294967296;
  }

  function emit(world, type, unit, ctx) {
    var def = CD[type];
    if (!world || !unit || !unit.label || def === undefined) return false;
    var st = state(world), t = world.time || 0;
    var key = type + ':' + unit.label;
    if (st.cd[key] !== undefined && t < st.cd[key]) return false;
    var p = world.player;
    if (unit.team !== 0 && !(p && p.alive && M3.dist(unit.pos, p.pos) < FOE_RANGE)) return false;
    var w = st.win;
    while (w.length && t - w[0] >= GLOBAL_WIN) w.shift();
    if (w.length >= GLOBAL_MAX) return false;
    w.push(t);
    st.cd[key] = t + def;
    var friendly = unit.team === 0;
    var tx = T.pick('radio.' + type + '.' + (friendly ? 'ally' : 'foe') + '.variants', function () { return rnd01(st); }, ctx);
    Radio.raw({
      who: unit.label, cls: friendly ? 'ally' : 'enemy', tx: tx,
      pri: friendly && !ATMOS[type] ? 'ally' : 'chatter', key: key, gap: 0.4
    });
    return true;
  }

  function fox(world, actor) {
    if (!actor || !actor.label || actor.isPlayer) return false;
    var st = state(world);
    if (rnd01(st) >= FOX_P) return false;
    return emit(world, 'fox', actor);
  }

  function missileAmmo(a) {
    var n = 0;
    if (a.ammoPool) for (var k in a.ammoPool) if (Object.prototype.hasOwnProperty.call(a.ammoPool, k)) n += a.ammoPool[k] || 0;
    return n;
  }

  function poll(world) {
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive || !a.ai || a.route || a.isPlayer || !a.label) continue;
      var c = a.chat || (a.chat = { ammoMax: 0, bingo: false, win: false, d50: false, d25: false, evading: false });
      var cur = missileAmmo(a);
      if (cur > c.ammoMax) c.ammoMax = cur;
      if (c.ammoMax > 0) {
        if (!c.win && cur <= 0) { c.win = true; c.bingo = true; emit(world, 'winchester', a); }
        else if (!c.bingo && cur < c.ammoMax * BINGO_FRAC) { c.bingo = true; emit(world, 'bingoAmmo', a); }
      }
      var f = a.hp / a.maxHp;
      if (!c.d50 && f < 0.5) { c.d50 = true; emit(world, 'damaged', a); }
      if (!c.d25 && f < 0.25) { c.d25 = true; emit(world, 'damaged', a); }
      var ev = a.ai.mode === 'evade';
      if (ev && !c.evading) emit(world, 'defensive', a);
      c.evading = ev;
    }
  }

  function update(world, dt) {
    if (!world || !world.actors) return;
    var st = state(world), i;
    // 击杀：每帧扫（阵亡的飞机在清理前只在 world.actors 里停留很短）
    for (i = 0; i < world.actors.length; i++) {
      var d = world.actors[i];
      if (d.alive || d.chatSplash || !d.killedBy) continue;
      d.chatSplash = true;
      var k = d.killedBy;
      if (k.ai && !k.isPlayer && k.alive) emit(world, 'splash', k);
    }
    st.acc += dt;
    if (st.acc < TICK) return;
    st.acc = 0;
    poll(world);
  }

  /* 整备完成：台词 + 重置轮询标记（补满之后弹药 / 血量的"一次性"标记要重新计） */
  function rearmed(world, unit) {
    if (unit) unit.chat = null;
    return emit(world, 'rearmed', unit);
  }

  return { update: update, emit: emit, fox: fox, rearmed: rearmed, CD: CD, FOX_P: FOX_P, GLOBAL_MAX: GLOBAL_MAX, GLOBAL_WIN: GLOBAL_WIN };
})();
