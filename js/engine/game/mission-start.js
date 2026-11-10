(function (Game) {
  'use strict';
  var $ = Game.$;
  $.startMission = startMission;

  /* ============================================================
     开始任务
     ============================================================ */
  function startMission(idx) {
    $.requestAimLock();
    $.missionIdx = idx;
    $.mission = MISSIONS[idx];
    /* 本关天色：按 mission.time / sun 设一次；没写就设缺省预设，上一关的天色不残留 */
    Shading.setEnv({ hour: ($.mission.time || {}).hour, sun: $.mission.sun }, $.mission.axis || 0);
    $.world = $.newWorld();
    $.stats = { startTime: 0, endTime: 0 };

    /* 关卡时限落到世界上。任务脚本声明 timeLimit，主循环负责倒计时与判负。 */
    $.world.timeLimit = $.mission.timeLimit || 0;
    $.world.timeLeft = $.world.timeLimit;
    // 本关世界 +z 轴的真方位（罗盘、方位报读、简报地图都按它换算）
    $.world.axis = $.mission.axis || 0;

    var ac = AIRCRAFT[$.selectedAC];
    var lo = $.getLoadout(ac);
    var wl = Loadout.resolve(ac, lo);

    var p = Ent.makeAircraft({
      type: ac.id, team: 0, isPlayer: true,
      /* 起手高度不能高过这架飞机的有效升限（min(数据升限, 失速升限)）减 500 m：
         失速速度随动压变化之后，高空关的 17–19.5 km 对一部分机型已经飞不住 */
      x: 0, y: Math.min($.mission.altStart, Ent.ceilingEff({ ac: ac, phys: ac.phys }) - 500), z: 0,
      fwd: M3.V(0, 0, 1),
      speed: $.mission.speedStart,
      special: wl.length ? wl[0].wid : null
    });

    // 挂载配置落到飞机上：武器列表 + 弹药池 + 发射槽 + 重量模型 + 被动吊舱（见 js/engine/loadout.js）
    Loadout.apply(p, ac, lo, wl);

    /* 电子战的两项玩家状态：
         ewAuto  协处理器可否自主开机（设定 7.3 授予它的权限）
         emcon   完全电磁静默（雷达关机 / 数据链断开 / 干扰机停辐射） */
    p.ewAuto = true;
    p.emcon = false;

    p.name = CALLSIGN.player;
    p.label = CALLSIGN.player;
    $.world.player = p;
    $.world.actors.push(p);
    $.player = p;

    $.mission.spawn($.world);

    // 初始镜头；瞄准方向下一帧从机头重新取
    $.aimInit = false;
    $.camFwd = M3.clone(p.fwd);
    $.camUp = M3.V(0, 1, 0);
    $.camPos = M3.add(p.pos, M3.V(0, 30, -110));
    $.camOff = null;
    $.camSpeedBack = null;
    $.camExtra = 0;
    $.camExtraHold = 0;

    Radio.clear();
    SysNote.clear();
    Radio.play($.mission.id, 'start');

    $.banner = { t: 3.4, title: $.mission.no.replace('OPERATION ', 'OPERATION '), sub: $.mission.name + '   //   ' + $.mission.en, col: HUD.AMBER };

    $.hideAll();
    $.state = 'playing';
    $.paused = false;
    $.failing = null;
    document.getElementById('pause').classList.remove('on');
    document.getElementById('failing').classList.remove('on');

    // 选择初始目标
    p.target = null;
    SFX.confirm();
  }
})(Game);
