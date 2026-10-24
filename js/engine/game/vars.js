(function (Game) {
  'use strict';
  var $ = Game.$;
  $.state = 'title';
  $.paused = false;

  /* 失败后的停留画面（state 仍是 'playing' 的子状态）：{ t0, hold, fail }，
     beginFail 写、endFail 清。非空时世界继续模拟、输入冻结，几秒后或点"结束"才进结算页。 */
  $.failing = null;
  $.FAIL_HOLD_S = 5;

  $.world = null;
  $.player = null;
  $.mission = null;
  $.missionIdx = 0;

  $.selectedAC = 0;

  /* 当前所处的战役（CAMPAIGNS 的下标）。它**不复制索引体系**：
     missionIdx 仍然是 MISSIONS 的全局下标，startMission(idx) 的语义不变。
     activeCampaign 只决定两件事 —— 简报页的关卡选择器列出哪几关、
     各处的"返回"回到哪一层。 */
  $.activeCampaign = 0;

  /* 挂载配置：机型 id → { 组 id: 武器 id | null }
     玩家在机库里改的就是这个，改动会一直留着直到换机型 */
  $.loadouts = {};

  /* 当前正在编辑的挂载点组在 $.hangarView.group（js/ui/screens/hangar.js） */

  $.keys = {};
  $.mouse = { left: false, right: false, x: 0, y: 0 };

  $.aimMode = true;

  // true = 鼠标引导（指令增稳），false = 键盘直控
  /* 战雷式瞄准方向：世界坐标里的一根方向，用偏航 / 俯仰两个角存。
     鼠标**位移**转动它（指针锁定，没有屏幕边界），镜头跟着它走，
     飞控再去追它 —— 所以机头最终会稳稳压在准星上，而不是追一个
     跟着镜头一起跑的屏幕点。aimInit = false 时下一帧从机头重新取。 */
  $.aimYaw = 0;
  $.aimPitch = 0;
  $.aimInit = false;

  $.AIM_SENS = 0.0022;

  // rad / 像素
  $.AIM_SPIKE_PX = 200;

  // 单个 mousemove 位移超过它就当尖峰丢掉（≈ 25°）
  $.AIM_PITCH_LIM = 89 * Math.PI / 180;

  $.last = 0;

  /* 机位现在由设置项 S.camMode 决定，没有热切换键 ——
     切换机位会让玩家瞬间失去态势感知，必须主动确认。
     另外两个是追尾镜头的平滑状态：camYawBase 是按最短角差平滑的基准偏航，
     camPitchSmooth 是平滑后的基准俯仰，首帧惰性初始化。 */
  $.camYawBase = 0;
  $.camPitchSmooth = null;

  /* 单一油门轴：THR_IDLE..1 是常规推力区，1..1.25 是加力区，THR_IDLE 以下张减速板。
     不再需要单独的加力/减速板按键。HUD 的 THR 读数按这两个点重新标度
     （慢车 0%、军推 100%，见 hud.js thrPercent），两边的值必须一致。 */
  $.THR_MAX = 1.25;

  $.THR_IDLE = 0.04;

  /* 高 G 机动：转向率放大倍率。
     速度代价不再单独扣 —— stepAircraft 的转弯掉速按实际角速度算，
     高 G 放大了角速度，掉速自然约是普通拉杆的两倍。以前这里另扣
     82 m/s²，和物理掉速叠在一起，三秒就能把 G-6 拉到失速以下。 */
  $.HIG_MAX = 1.90;

  $.camFwd = M3.V(0, 0, 1);
  $.camUp = M3.V(0, 1, 0);
  $.camPos = M3.V(0, 0, 0);

  $.camOff = null;

  // 追尾镜头相对飞机的平滑偏移
  $.camExtra = 0;
  $.camExtraHold = 0;

  // 出画处理 C：额外拉远量与剩余保持时间
  $.camSpeedBack = null;

  // 速度感距离（平滑后，米），首帧惰性初始化
  $.CAM_SPEED_RATE = 1.5;

  // 速度感距离的平滑速率（1/s）：加力 / 掉速时慢慢拉开、凑近
  $.camYaw = 0;
  $.camPitch = 0;

  /* 追尾镜头的基准朝向。它不直接等于机头方向 —— 见 updateCamera 里的说明：
     俯仰被限制在 ±89°，而且偏航要按最短角差平滑，否则翻过顶点时会瞬移。 */
  $.banner = { t: 0, title: '', sub: '', col: '' };

  $.hits = [];

  $.stats = null;

  $.cleared = {};

  // 本次会话内已完成的任务
  var MAX_HP_ACE = 0;
})(Game);
