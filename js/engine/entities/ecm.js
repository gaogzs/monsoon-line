(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.setEcm = setEcm; $.setStealth = setStealth; $.passiveEffects = passiveEffects; $.openEcm = openEcm;

  /* ============================================================
     被动吊舱汇总

     list 是 [{ wid, n }]，n 是该件占用的挂点数（左右各一 = 2）。
     玩家的挂载由 game.js 翻译成这个形状；敌机在 missions.js 里
     直接传 [{ wid, n: 1 }] —— 同一份实现，避免出现
     "玩家挂上有用、NPC 挂上没用"的两套逻辑。

     它不只是数值：silentLock（被动测距）会决定**敌方 RWR 是否看得到你**，
     所以结果必须写回 actor，而不只是留在机库面板上。
     ============================================================ */
  $.ECM_LEAD_K = 0.6;

  /* 机体 ECM + 吊舱叠加，封顶 1。玩家与任务 NPC 都走这里。 */
  function setEcm(a, pe) {
    a.ecm = Math.min(1, (a.ecmBody || 0) + ((pe && pe.ecm) || 0));
  }

  /* 匿踪：机体匿踪（被外挂折损）+ 吊舱抗锁定 → a.lockResist。
     wids 缺省沿用上次的（NPC 造机时存在 a.mountWids），玩家由 startMission 传入。 */
  function setStealth(a, pe, wids) {
    if (wids) a.mountWids = wids;
    a.stealth = stealthValue(a.ac, exposedPoints(a.ac, a.mountWids));
    a.lockResist = lockCutOf(a.stealth, pe && pe.lockResist);
  }

  function passiveEffects(list) {
    var e = { lockResist: 0, armor: 0, lockRange: 1, flareBonus: 0, silentLock: false, ecm: 0 };
    if (!list) return e;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var w = WEAPONS[it.wid];
      if (!w || !w.tags.passive) continue;
      var n = it.n || 1;
      if (w.lockResist) e.lockResist = Math.max(e.lockResist, w.lockResist);
      if (w.armorBonus) e.armor += w.armorBonus * n;
      if (w.lockRangeBonus) e.lockRange += w.lockRangeBonus * n;
      if (w.flareBonus) e.flareBonus += w.flareBonus * n;
      if (w.tags.silentLock) e.silentLock = true;
      if (w.ecmBonus) e.ecm += w.ecmBonus * n;
    }
    e.armor = Math.min(e.armor, 0.55);
    e.lockRange = Math.min(e.lockRange, 1.9);
    return e;
  }

  /* ============================================================
     电子战开机

     这是**唯一**的开机入口：手动扣扳机（game.js 的 launch）、
     电子战协处理器的自主决策、任务脚本里干扰机航线到站，
     全部走这里。以前这段逻辑写在 launch 里，于是任何"绕过扳机"
     的开机方式都得把它抄一遍。

     ewBurnT 在这里定死是刻意的 —— 它描述的不是吊舱，而是**对手**：
     一支信号处理能力强的部队能在 3 秒内完成对抗，差的要 8 秒。
     这就是设定里那句"当你开启干扰吊舱时，对方雷达不会立刻致盲，
     而是会在 3 到 8 秒内完成对抗并重新建立跟踪"。
     ============================================================ */
  /* opt.wave（随队干扰机用，见 ai.js 的 jamAuto）：{ dur, to }
       —— 持续 dur 秒，强度从 1 线性降到 to，不走"被对抗掉"那条归零曲线。
       对手在适应，但压不干净；下一波重新开机又回到满强度。 */
  function openEcm(actor, wid, threatSkill, opt) {
    var w = WEAPONS[wid];
    if (!w || w.kind !== 'ecm' || w.tags.passive) return false;
    var sk = M3.clamp(threatSkill === undefined ? 0.5 : threatSkill, 0, 1);
    actor.ewWave = (opt && opt.wave) || null;
    actor.spActive = actor.ewWave ? actor.ewWave.dur : (w.duration || 6);
    actor.ewT = 0;
    actor.ewBurnT = 3 + (1 - sk) * 5;
    actor.ewPower = 0;
    actor.ewWid = wid;
    actor.ewLockReduce = w.lockReduce || 0;
    /* 范围压制（下游的烧穿吊舱）：留下一个场，由 game.js 的
       updateJamming() 每帧结算。没有 jamRadius 的吊舱是"定向"干扰，
       只保护自己。 */
    actor.ewFieldR = w.jamRadius || 0;
    actor.ewFieldK = w.jamK || 0.7;
    return true;
  }
})(Ent);
