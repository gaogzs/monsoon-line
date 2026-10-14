/* ============================================================
   audio.js —— 全程序化音效合成（WebAudio，无外部资源）
   ============================================================ */
'use strict';

var SFX = (function () {

  var ctx = null, master = null, noiseBuf = null;
  var muted = false;
  var ready = false;

  /* 音量（0..1）。主音量作用在总线上，引擎与音效各自再缩放一次。
     引擎是持续音，最容易变成"底噪"，所以默认压得比较低。 */
  var volMaster = 0.45;
  var volEngine = 0.45;
  var volSfx = 0.85;

  /* 持续音开关状态，改音量时要用它重新施加 */
  var gunOn = false;

  /* ---------- 持续音节点 ---------- */
  /* 喷气发动机的声源分三层：宽带喷流噪声、压气机啸叫、低频轰鸣 */
  var engSrc = null, jetF = null, jetG = null;
  var whineF = null, whineG = null, subG = null;
  var engA = null, engB = null, engG = null, engLfo = null, engLfoG = null;
  var gunSrc = null, gunF = null, gunG = null, gunLfo = null, gunLfoG = null;
  var warnOsc = null, warnG = null, warnLfo = null, warnLfoG = null;
  var warnOn = false;

  function makeNoise(sec) {
    var len = Math.floor(ctx.sampleRate * sec);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ============================================================
     初始化（必须在用户手势之后调用）
     ============================================================ */
  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volMaster;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(2.0);
      buildEngine();
      buildGun();
      buildWarn();
      ready = true;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function T() { return ctx.currentTime; }

  /* ---------- 引擎：锯齿 + 方波 → 低通 ---------- */
  /* ---------- 发动机：喷气式 ----------
     活塞机靠低频周期性脉动发声（锯齿波 + 方波 + 低通），喷气机不是。
     它的声音由三部分组成：

       ① 宽带喷流噪声 —— 主体
       ② 压气机啸叫   —— 高频窄带，转速越高越尖
       ③ 低频轰鸣     —— 很轻，只提供厚度

     早先版本用 74 Hz 锯齿 + 37 Hz 方波，那是螺旋桨的频谱。 */
  function buildEngine() {
    engG = ctx.createGain(); engG.gain.value = 0.0;

    // ① 喷流噪声（主体）
    engSrc = ctx.createBufferSource();
    engSrc.buffer = noiseBuf; engSrc.loop = true;
    jetF = ctx.createBiquadFilter();
    jetF.type = 'bandpass'; jetF.frequency.value = 850; jetF.Q.value = 0.5;
    jetG = ctx.createGain(); jetG.gain.value = 1.0;
    engSrc.connect(jetF); jetF.connect(jetG); jetG.connect(engG);

    // ② 压气机啸叫
    engA = ctx.createOscillator(); engA.type = 'sawtooth'; engA.frequency.value = 1750;
    whineF = ctx.createBiquadFilter();
    whineF.type = 'bandpass'; whineF.frequency.value = 2800; whineF.Q.value = 7.0;
    whineG = ctx.createGain(); whineG.gain.value = 0.0;
    engA.connect(whineF); whineF.connect(whineG); whineG.connect(engG);

    // ③ 低频轰鸣
    engB = ctx.createOscillator(); engB.type = 'triangle'; engB.frequency.value = 62;
    subG = ctx.createGain(); subG.gain.value = 0.0;
    engB.connect(subG); subG.connect(engG);

    // ④ 让喷流噪声的中心频率轻微游走，免得听起来像纯白噪
    engLfo = ctx.createOscillator(); engLfo.type = 'sine'; engLfo.frequency.value = 23;
    engLfoG = ctx.createGain(); engLfoG.gain.value = 110;
    engLfo.connect(engLfoG); engLfoG.connect(jetF.frequency);

    engG.connect(master);
    engSrc.start(); engA.start(); engB.start(); engLfo.start();
  }

  /* ---------- 机炮：带通噪声 + 65Hz 方波调制 ---------- */
  function buildGun() {
    gunG = ctx.createGain(); gunG.gain.value = 0.0;
    gunF = ctx.createBiquadFilter();
    gunF.type = 'bandpass'; gunF.frequency.value = 1250; gunF.Q.value = 0.9;

    gunSrc = ctx.createBufferSource();
    gunSrc.buffer = noiseBuf; gunSrc.loop = true;

    gunLfo = ctx.createOscillator(); gunLfo.type = 'square'; gunLfo.frequency.value = 64;
    /* LFO 深度**必须从 0 开始**。

       AudioParam 的最终值 = 基础值 + 所有连入信号之和，所以 gunG.gain = 0
       并不代表无声 —— 只要 LFO 还在推，噪声源就会一直漏出来。
       这里原来给的是 0.075，于是从页面启动起就有一路常驻的"突突"底噪；
       gun() 只在开火时才会把它设回去，而主菜单根本不会调 gun()。 */
    gunLfoG = ctx.createGain(); gunLfoG.gain.value = 0.0;
    gunLfo.connect(gunLfoG); gunLfoG.connect(gunG.gain);

    gunSrc.connect(gunF); gunF.connect(gunG); gunG.connect(master);
    gunSrc.start(); gunLfo.start();
  }

  /* ---------- 导弹告警：脉冲高频 ---------- */
  function buildWarn() {
    warnG = ctx.createGain(); warnG.gain.value = 0.0;
    warnOsc = ctx.createOscillator(); warnOsc.type = 'square'; warnOsc.frequency.value = 1150;
    warnLfo = ctx.createOscillator(); warnLfo.type = 'square'; warnLfo.frequency.value = 7;
    /* 同上：深度从 0 开始，否则主菜单上就会一直响。

       这是"点一下页面就能听到的那个高频持续音"的真正来源：
       warnOsc 是 1150 Hz 方波，warnLfoG 把它以 7 Hz 通断，
       而 warning(false) 开头有 `if (on === warnOn) return;` ——
       warnOn 初值就是 false，于是这个函数**永远不会**把初始深度清掉。 */
    warnLfoG = ctx.createGain(); warnLfoG.gain.value = 0.0;
    warnLfo.connect(warnLfoG); warnLfoG.connect(warnG.gain);
    warnOsc.connect(warnG); warnG.connect(master);
    warnOsc.start(); warnLfo.start();
  }

  /* ============================================================
     一次性音效
     ============================================================ */

  /** 通用噪声爆发 */
  function burst(vol, f0, f1, dur, type) {
    if (!ready || muted) return;
    var t = T();
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(Math.max(40, f0), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    vol *= volSfx;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  /** 正弦扫频 */
  function sweep(vol, f0, f1, dur, type) {
    if (!ready || muted) return;
    var t = T();
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    vol *= volSfx;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** 短促哔声 */
  function beep(vol, freq, dur, type) {
    if (!ready || muted) return;
    var t = T();
    var o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    vol *= volSfx;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ============================================================
     对外的音效接口
     ============================================================ */
  var API = {

    unlock: function () { unlock(); },
    isReady: function () { return ready; },

    setMuted: function (m) {
      muted = m;
      if (ready) master.gain.value = m ? 0 : volMaster;
    },
    isMuted: function () { return muted; },

    /** 音量设置（0..1）：主音量 / 引擎 / 音效 */
    setVolumes: function (m, e, s) {
      volMaster = M3.clamp(m, 0, 1);
      volEngine = M3.clamp(e, 0, 1);
      volSfx = M3.clamp(s, 0, 1);
      if (!ready) return;
      master.gain.value = muted ? 0 : volMaster;
      // 正在响的持续音要立刻跟上新音量，否则要等下一次状态翻转
      API.gun(gunOn);
      if (warnOn) { warnOn = false; API.warning(true); }
    },
    getVolumes: function () {
      return { master: volMaster, engine: volEngine, sfx: volSfx };
    },

    /** 每帧：油门 0..1，加力，是否开加力视觉 */
    engine: function (throttle, ab, alive) {
      if (!ready) return;
      var t = T();

      // 喷流噪声：中心频率随油门升高、加力时再往上顶一截
      jetF.frequency.setTargetAtTime(760 + throttle * 1500 + (ab ? 700 : 0), t, 0.15);
      jetF.Q.setTargetAtTime(0.5 + throttle * 0.5, t, 0.15);

      // 压气机啸叫：转速越高越尖、越响
      engA.frequency.setTargetAtTime(1450 + throttle * 2700 + (ab ? 950 : 0), t, 0.14);
      whineF.frequency.setTargetAtTime(2600 + throttle * 1700, t, 0.14);
      whineG.gain.setTargetAtTime(
        alive ? (0.09 + throttle * 0.16 + (ab ? 0.10 : 0)) : 0, t, 0.15);

      // 低频轰鸣只负责厚度，音量压得很低
      subG.gain.setTargetAtTime(
        alive ? (0.13 + throttle * 0.13 + (ab ? 0.06 : 0)) : 0, t, 0.18);
      engB.frequency.setTargetAtTime(56 + throttle * 26, t, 0.2);
      engLfo.frequency.setTargetAtTime(17 + throttle * 19, t, 0.2);

      var vol = alive ? (0.030 + throttle * 0.075 + (ab ? 0.030 : 0)) * volEngine : 0;
      engG.gain.setTargetAtTime(vol, t, 0.12);
    },

    /**
     * 机炮持续音开关。
     *
     * 这里有一个 AudioParam 的坑：参数的最终值 = 基础值 + 所有连入信号之和。
     * gunLfo 直接连在 gunG.gain 上，所以就算把基础值设成 0，
     * LFO 依然会把增益推到 ±0.075 —— 而 gunSrc 是循环噪声、一直在播，
     * 结果就是一路常驻的"突突"底噪，且不受 volSfx 控制。
     * 关炮时必须把 LFO 深度也归零。
     */
    gun: function (on) {
      if (!ready) return;
      gunOn = on;
      var t = T();
      gunG.gain.setTargetAtTime(on ? 0.115 * volSfx : 0.0, t, 0.012);
      gunLfoG.gain.setTargetAtTime(on ? 0.075 * volSfx : 0.0, t, 0.012);
    },

    /** 导弹告警开关（同样的坑：warnLfo 也直接接在 warnG.gain 上） */
    warning: function (on) {
      if (!ready) return;
      if (on === warnOn) return;
      warnOn = on;
      var t = T();
      warnG.gain.setTargetAtTime(on ? 0.075 * volSfx : 0.0, t, 0.03);
      warnLfoG.gain.setTargetAtTime(on ? 0.055 * volSfx : 0.0, t, 0.03);
    },

    /** 雷达锁定：递增哔声 */
    lock: function () { beep(0.10, 1480, 0.055, 'square'); },
    lockTone: function (hi) { beep(0.09, hi ? 2100 : 1250, 0.045, 'square'); },
    loseLock: function () { beep(0.07, 620, 0.11, 'triangle'); },

    /** 机炮单发（用于点射反馈） */
    gunShot: function () { burst(0.16, 2600, 500, 0.055, 'bandpass'); },

    /** 导弹点火 */
    missile: function () {
      sweep(0.20, 1500, 180, 0.42, 'sawtooth');
      burst(0.22, 3400, 320, 0.55, 'lowpass');
    },

    /** 敌方发射（更远、更闷） */
    missileFar: function () {
      sweep(0.10, 900, 130, 0.5, 'sawtooth');
    },

    /** 爆炸：size 0.3 小 / 1.0 中 / 2.6 大 */
    boom: function (size) {
      size = size || 1;
      burst(0.30 * size, 2200, 80, 0.75 * size, 'lowpass');
      sweep(0.26 * size, 110, 26, 0.52 * size, 'sine');
    },

    /** 命中金属声 */
    hit: function () { burst(0.22, 4200, 1400, 0.10, 'bandpass'); },

    /** 被击中（自己） */
    playerHit: function () {
      burst(0.34, 1500, 120, 0.42, 'lowpass');
      sweep(0.22, 200, 40, 0.36, 'square');
    },

    /** 干扰弹 */
    flare: function () { burst(0.14, 3000, 2600, 0.35, 'highpass'); },

    /** UI 点击 */
    click: function () { beep(0.07, 880, 0.045, 'square'); },
    confirm: function () { beep(0.09, 1180, 0.07, 'square'); setTimeout(function () { beep(0.09, 1580, 0.09, 'square'); }, 70); },

    /** 无线电语音条的底噪 */
    radio: function () { burst(0.045, 2400, 1900, 0.20, 'bandpass'); },

    /** 任务达成 / 失败 */
    fanfare: function () {
      var seq = [523, 659, 784, 1046], i = 0;
      var self = this;
      (function step() {
        if (i >= seq.length) return;
        beep(0.11, seq[i++], 0.30, 'triangle');
        setTimeout(step, 165);
      })();
    },
    fail: function () {
      var seq = [392, 330, 262], i = 0;
      (function step() {
        if (i >= seq.length) return;
        beep(0.11, seq[i++], 0.45, 'sawtooth');
        setTimeout(step, 260);
      })();
    },

    /** 定向能武器开火 */
    laser: function () { sweep(0.14, 2400, 900, 0.28, 'sawtooth'); },

    /** 警告：失速 / 撞地 */
    stall: function () { beep(0.09, 400, 0.20, 'triangle'); },
    terrain: function () { beep(0.10, 320, 0.14, 'square'); },

    /** 大型目标受创 */
    bigHit: function () {
      burst(0.34, 1200, 60, 1.15, 'lowpass');
      sweep(0.30, 90, 22, 1.0, 'sine');
    },

    /** 全部静音（暂停用） */
    silence: function () {
      if (!ready) return;
      var t = T();
      engG.gain.setTargetAtTime(0, t, 0.05);
      gunG.gain.setTargetAtTime(0, t, 0.05);
      warnG.gain.setTargetAtTime(0, t, 0.05);
      // LFO 深度也要归零，不然噪声门还开着
      gunLfoG.gain.setTargetAtTime(0, t, 0.05);
      warnLfoG.gain.setTargetAtTime(0, t, 0.05);
      gunOn = false;
      warnOn = false;
    }
  };

  return API;
})();
