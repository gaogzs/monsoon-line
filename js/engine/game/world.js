(function (Game) {
  'use strict';
  var $ = Game.$;
  $.newWorld = newWorld; $.syncWeapon = syncWeapon;

  /* ============================================================
     世界
     ============================================================ */
  function newWorld() {
    var w = {
      time: 0,
      actors: [], missiles: [], shotQueue: [], bullets: [], particles: [], targets: [],
      wings: {},
      player: null,
      flags: {},
      objective: '', objectiveSub: '',
      detected: false,
      killed: 0, hitsLanded: 0, shotsFired: 0, gunRounds: 0, gunHits: 0,
      /* 友军的击落单独记：进战报，但不进综合评定（见 finish）。
         killed 只数玩家自己的。 */
      wingKilled: 0, shipKilled: 0,
      /* 被摧毁的地面/海面目标数。`killed` 只数 team===1 的**飞机**，
         设施与舰船从不进那个统计 —— 于是打掉一座平台在结算上等于没发生。
         新关卡里有大量反舰/压制目标，必须单独记一笔。 */
      groundKilled: 0,
      /* 一帧里发生的战斗事件（命中 / 拦截），各模块往里推，主循环每帧消化后清空。
         { type: 'hit' }                     玩家的弹打中了东西（Combat.blast）
         { type: 'intercept', m, host }     导弹被近防炮拦下（stepMissile） */
      events: [],
      flags2: { icptRadioT: -99 },
      /* 关卡时限（秒）。timeLimit 是这一关的总额度、timeLeft 是剩余；
         0 表示没有时限。startMission 从 mission.timeLimit 落进来 ——
         在此之前 timeLimit 声明了却全项目没人读，于是"限时任务"只有
         简报上的一句话，没有对应的机制。 */
      timeLimit: 0, timeLeft: 0
    };
    w.fireMissile = function (actor, target) {
      var m = $.launch(actor, target, w);
      /* 别人发射导弹的声音，按距离衰减。

         这条路径也是 AI 唯一的发射入口，所以挂在这里就全覆盖了。
         玩家自己发射时 SFX.missile() 已经在 fireSpecial 里播过，
         不要重复。 */
      if (m && $.player && actor !== $.player) {
        SFX.missileAt(M3.dist(actor.pos, $.player.pos));
      }
      return m;
    };
    w.radio = Radio;
    return w;
  }

  /** 把 wpIdx 指向的那一组同步到 special / spAmmo / spSalvo / spCd */
  function syncWeapon(a) {
    if (!a || !a.loadoutList || !a.loadoutList.length) {
      if (a) { a.spSalvo = 1; Ent.setWeapon(a, null); }
      return;
    }
    if (a.wpIdx >= a.loadoutList.length) a.wpIdx = 0;
    var e = a.loadoutList[a.wpIdx];
    a.spSalvo = e.salvo;
    /* 选中的这一件 → special / spAmmo / spCd。
       实际赋值在 entities.js 的 setWeapon 里 —— AI 的开火选弹用的是同一份，
       两边各写一份迟早不一致。 */
    Ent.setWeapon(a, e.wid);
  }
})(Game);
