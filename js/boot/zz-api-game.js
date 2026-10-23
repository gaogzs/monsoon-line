(function (Game) {
  'use strict';
  var $ = Game.$;

  Game.init = $.init;
  Game.startMission = $.startMission;
  // 调试/测试接口：把内部状态露出来，tools/smoke.js 靠它做断言
  Game.__player = function () { return $.player; };
  Game.__world = function () { return $.world; };
  // 实体挂载的渲染：断言要能单独喂一架飞机进来数它画了几个挂载
  Game.__pushStores = $.pushStores;
  // 水面目标的对空射击：断言要能单独推一帧，确认我方舰艇不朝玩家打
  Game.__updateTargets = $.updateTargets;
  // 后台模拟（tools/lib/sim.js）：只推进游戏逻辑，不渲染
  Game.__update = function (dt) { if ($.state === 'playing' && $.world && $.player) $.update(dt); };
  // 画面回归（tools/golden-render.js）：只画一帧，不推进逻辑
  Game.__render = function () { $.render(); };
  Game.__updateLock = $.updateLock;
  Game.__cycleTarget = $.cycleTarget;
  // 弹体命中结算：断言要能单独喂一发子弹进来，量它实际打掉多少血（机炮抗性）
  Game.__scanShot = $.scanShot;
  // 追尾镜头出画处理：断言要能脱离整局游戏单独推镜头
  Game.__camFrame = {
      frameDeficit: $.frameDeficit,
      softClampFrame: $.softClampFrame,
      stepFrameExtra: $.stepFrameExtra,
      FRAME_SOFT_LIM: $.FRAME_SOFT_LIM
    };
  // 油门轴的两个分界点：HUD 的 THR 读数按它们标度，断言两边一致
  Game.__thr = { IDLE: $.THR_IDLE, MAX: $.THR_MAX };
  // 鼠标引导时镜头俯仰与瞄准俯仰的映射（天顶卡在画面上沿）
  Game.__camPitch = {
      camPitchFor: $.camPitchFor,
      AIM_LIM: $.AIM_PITCH_LIM
    };
})(Game);

window.addEventListener('load', function () { Game.init(); });
