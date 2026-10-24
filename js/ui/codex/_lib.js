'use strict';

/* ============================================================
   静态条目里的数值占位符
   —— 叙事页（t1 / t3 / t4 / s1 / s2 / 战役页）里凡是复述了
   WEAPONS / MISSIONS / 大气模型的数字，一律写成 {{键}}，
   渲染时由 _cxFill() 现场替换。这样改了 data.js，正文跟着变。

   同样受加载顺序约束：codex.js 在 data.js / entities.js /
   missions.js 之前加载，所以 _CX_VALS 里的每一项都是函数，
   只在 build() 被调用（玩家点进页面）时才去读那些全局。

   找不到的键原样保留 {{键}} —— smoke.js 会拦下来。
   ============================================================ */
function _cxW(id) { return WEAPONS[id]; }

function _cxNum(x, d) { return (+x).toFixed(d === undefined ? 0 : d); }

function _cxPct(r) { return Math.round(r * 100) + '%'; }

/** 相对海平面的密度，直接取 Ent.airDensity —— 与飞行 / 导弹物理同一条曲线 */
function _cxRel(y) { return Ent.airDensity(y) / Ent.airDensity(0); }

/** 机炮附带的"装备方"是叙事，不是数据；参数列全部现读 WEAPONS */
var _CX_GUN_OWNER = {
  cel1: T('ui.codex._lib._CX_GUN_OWNER.cel1'),
  cel3v: T('ui.codex._lib._CX_GUN_OWNER.cel3v'),
  cel3: T('ui.codex._lib._CX_GUN_OWNER.cel3'),
  cel7: T('ui.codex._lib._CX_GUN_OWNER.cel7'),
  tca11: T('ui.codex._lib._CX_GUN_OWNER.tca11')
};

function _cxGunTable() {
  var h = T('ui.codex._lib._cxGunTable.h.s1');
  for (var id in WEAPONS) {
    if (!Object.prototype.hasOwnProperty.call(WEAPONS, id)) continue;
    var w = WEAPONS[id];
    if (w.kind !== 'gun') continue;
    h += '<tr><td>' + w.name + '</td><td>' + w.cn.split(' ·')[0].replace(T('ui.codex._lib._cxGunTable.s1'), '') + '</td>' +
      '<td>' + w.rpm + T('ui.codex._lib._cxGunTable.s2') + w.ammo + '</td><td>' + w.speed + ' m/s</td>' +
      '<td>' + w.range + T('ui.codex._lib._cxGunTable.s3') + w.highRange + T('ui.codex._lib._cxGunTable.s4') +
      '<td>' + (_CX_GUN_OWNER[id] || '—') + '</td></tr>';
  }
  return h + '</table>';
}

/** 任务统计：从 MISSIONS 现数，不再手写"十一个任务里有两个" */
function _cxMissions() {
  var hi = [];
  for (var i = 0; i < MISSIONS.length; i++) {
    if (MISSIONS[i].altStart >= 17000) hi.push(T('ui.codex._lib._cxMissions.s1') + MISSIONS[i].name + T('ui.codex._lib._cxMissions.s2'));
  }
  return { total: MISSIONS.length, hi: hi };
}

function _cxMission(id) {
  for (var i = 0; i < MISSIONS.length; i++) if (MISSIONS[i].id === id) return MISSIONS[i];
  return null;
}

/** 秒 → "N 分钟" / "N 秒" */
function _cxDur(t) { return (t % 60 === 0) ? (t / 60) + T('ui.codex._lib._cxDur.s1') : t + T('ui.codex._lib._cxDur.s2'); }

var _CX_VALS = {
  'rho.0': function () { return _cxNum(_cxRel(0), 2); },
  'rho.11000': function () { return _cxNum(_cxRel(11000), 2); },
  'rho.18000': function () { return _cxNum(_cxRel(18000), 3); },
  'rho.20000': function () { return _cxNum(_cxRel(20000), 3); },
  'rho.22000': function () { return _cxNum(_cxRel(22000), 3); },
  'rho.pct20': function () { return _cxPct(_cxRel(20000)); },
  'rho.qSpeed20': function () { return _cxNum(Math.sqrt(1 / _cxRel(20000)), 1); },
  'rho.turn20': function () { return _cxNum(Ent.turnFactor(20000), 2); },
  'rho.turnFloor': function () { return _cxNum(Ent.turnFactor(1e9), 2); },

  'gunTable': _cxGunTable,
  'gun.cel3.name': function () { return _cxW('cel3').name; },
  'gun.cel3.cal': function () { return _cxW('cel3').cn.split(' ')[0] + T('ui.codex._lib._CX_VALS.gun_cel3_cal.s1'); },
  'gun.cel3.speed': function () { return _cxW('cel3').speed; },
  'gun.cel3.range': function () { return _cxW('cel3').range; },
  'gun.cel3.highRange': function () { return _cxW('cel3').highRange; },
  'gun.cel3.tof': function () { return _cxNum(_cxW('cel3').range / _cxW('cel3').speed, 1); },
  'gun.cel3.rps': function () { return Math.round(_cxW('cel3').rpm / 60); },

  'w.e4.name': function () { return _cxW('e4').name; },
  'w.e4.lockReducePct': function () { return _cxPct(_cxW('e4').lockReduce); },
  'w.e4.cd': function () { return _cxW('e4').cd; },
  'w.e4.duration': function () { return _cxW('e4').duration; },

  'w.l2.interceptRange': function () { return _cxW('l2').interceptRange; },
  'w.l2.coneDeg': function () { return Math.round(_cxW('l2').interceptCone * 180 / Math.PI); },
  'w.l2.chancePct': function () { return _cxPct(_cxW('l2').interceptChance); },
  'w.l2.highPct': function () { return _cxPct(_cxW('l2').highAltChance); },
  'w.l2.cd': function () { return _cxW('l2').cd; },

  'w.v17.name': function () { return _cxW('v17').name; },
  'w.v17.cnShort': function () { return _cxW('v17').cn.split(' ·')[0]; },
  'w.v17.life': function () { return _cxNum(_cxW('v17').life, 0); },
  'w.v17.vsLife': function () { return _cxNum(_cxW('v17').vsLife, 0); },
  'w.v17.turn': function () { return _cxNum(_cxW('v17').turn, 2); },
  /* 冲压弹高空衰减：直接问 entities.js，取 20 km 处的动力段 */
  'w.v17.lifeHigh': function () {
    return _cxNum(Ent.effectiveLife(_cxW('v17'), 20000), 1);
  },
  'w.mrm.name': function () { return _cxW('mrm').name; },
  'w.mrm.life': function () { return _cxNum(_cxW('mrm').life, 0); },
  'w.srm.name': function () { return _cxW('srm').name; },
  'w.srm.turn': function () { return _cxNum(_cxW('srm').turn, 2); },

  'ms.total': function () { return _cxMissions().total; },
  'ms.highN': function () { return _cxMissions().hi.length; },
  'ms.highList': function () { return _cxMissions().hi.join(T('ui.codex._lib._CX_VALS.ms_highList.s1')); },
  'ms.m10.limit': function () { var m = _cxMission('m10'); return m ? _cxDur(m.timeLimit) : '—'; }
};

/** 把 {{键}} 换成现读的数值。未知键原样保留，交给 smoke.js 报错 */
function _cxFill(html) {
  return html.replace(/\{\{([\w.]+)\}\}/g, function (all, k) {
    var f = _CX_VALS[k];
    return f ? String(f()) : all;
  });
}
