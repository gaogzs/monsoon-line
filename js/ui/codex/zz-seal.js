'use strict';

Registry.sealCodex();

/* 带占位符的静态条目统一改走 build()：buildCodex 已经认 build，
   不需要动 game.js；smoke.js 也会顺带把它们当动态条目跑一遍。 */
for (var _cxi = 0; _cxi < CODEX.length; _cxi++) {
  if (CODEX[_cxi].html && CODEX[_cxi].html.indexOf('{{') >= 0 && !CODEX[_cxi].build) {
    CODEX[_cxi].build = function () { return _cxFill(this.html); };
  }
}

/* ============================================================
   装备图鉴
   —— 内容由 build() 现场从 AIRCRAFT / WEAPONS / STORE_ATTR 生成，
   所以改了武器数据这里会自动跟上，不会出现"文档说 A、实际是 B"。
   注意 codex.js 在 data.js 之前加载，所以 build() 里引用那些表
   必须等到被调用时才求值 —— 这正是把它们写成函数的原因。
   ============================================================ */

/** 把挂点类型翻译成人话 */
function _hpKind(k) {
  return ({ tip: T('ui.codex.zz-seal._hpKind.tip'), light: T('ui.codex.zz-seal._hpKind.light'), heavy: T('ui.codex.zz-seal._hpKind.heavy'), belly: T('ui.codex.zz-seal._hpKind.belly') })[k] || k;
}

/** 能力标签的中文名 */
function _capLabel(c) {
  /* strike 不等于"对地"。

     它表示"需要完整的重型火控与重挂架"，用在加固侵彻、防区外对地、
     远程巡航、反舰这些真正的重型弹药上。以前这里写作"对地火控"，
     而当时 SPO-8 追云（一枚对空的重型拦截弹）也被挂在这个门槛下，
     于是图鉴把它标成"限 对地火控" —— 看着像分类错了。
     那个挂载门槛已经删掉，这里保留"重型火控"是为了准确地描述
     剩下那几件弹药的共同要求。 */
  return ({ strike: T('ui.codex.zz-seal._capLabel.strike'), intercept: T('ui.codex.zz-seal._capLabel.intercept'), ew: T('ui.codex.zz-seal._capLabel.ew') })[c] || c;
}

/** 射程列的文字 */
/* 战斗部的两列：引信（近炸触发半径）与爆炸半径（满伤半径 / 外缘）。
   数从 Combat.spec 读 —— 与实际结算同一个口径。 */
function _fuzeTxt(w) {
  if (w.tags.passive || !w.dmg) return '—';
  var s = Combat.spec(w);
  return s.fuze > 0 ? T('ui.codex.zz-seal._fuzeTxt.s1') + s.fuze + ' m' : T('ui.codex.zz-seal._fuzeTxt.s2');
}
function _blastTxt(w) {
  if (w.tags.passive || !w.dmg) return '—';
  var s = Combat.spec(w);
  if (s.blast <= 0) return T('ui.codex.zz-seal._blastTxt.s1');
  if (s.core >= s.blast) return s.blast + T('ui.codex.zz-seal._blastTxt.s2') + (s.air ? '' : T('ui.codex.zz-seal._blastTxt.s3'));
  return s.core + ' / ' + s.blast + ' m' + (s.air ? '' : T('ui.codex.zz-seal._blastTxt.s4'));
}

function _rngTxt(w) {
  // 定向能吊舱不"飞过去"，它有一个拦截半径
  if (w.kind === 'dew' && w.interceptRange) {
    return T('ui.codex.zz-seal._rngTxt.s1') + (w.interceptRange / 1000).toFixed(1) + ' km';
  }
  var r = (typeof Ent !== 'undefined' && Ent.displayRange) ? Ent.displayRange(w) : null;
  if (r === null || r === undefined || r <= 0) return '—';
  return r.toFixed(1) + ' km';
}

/** 导引方式 —— 图鉴（_seekerLabel）与机库挂载卡片（game.js storeStatLine）
    共用这一个判定，避免两处各写一份映射再各自漂移。

    返回 { name, note, lead }：
      name  中文导引方式；被动吊舱 = '被动'，没有导引头 = '无制导'
      note  附注（光电"不受干扰弹影响"、激光"需保持照射"），没有则为 ''
      lead  预测品质 0–1；光电 / 激光 / 无制导不报（null）

    无制导的判据是 `w.tags.unguided` 或 seeker 缺省 / 'none'。
    以前缺省 seeker 的火箭弹（rkt）和子母弹（clb）落进了最后的
    else 分支，被图鉴标成了"雷达"。 */
function weaponGuidance(w) {
  if (w.tags.passive) return { name: T('ui.codex.zz-seal.weaponGuidance.name_'), note: '', lead: null };
  if (w.tags.unguided || !w.seeker || w.seeker === 'none') {
    return { name: T('ui.codex.zz-seal.weaponGuidance.name_2'), note: '', lead: null };
  }
  if (w.seeker === 'eo') return { name: T('ui.codex.zz-seal.weaponGuidance.name_3'), note: T('ui.codex.zz-seal.weaponGuidance.note'), lead: null };
  if (w.seeker === 'laser') return { name: T('ui.codex.zz-seal.weaponGuidance.name_4'), note: T('ui.codex.zz-seal.weaponGuidance.note_2'), lead: null };
  var name = ({ ir: T('ui.codex.zz-seal.weaponGuidance.name.ir'), radar: T('ui.codex.zz-seal.weaponGuidance.name.radar') })[w.seeker] || w.seeker;
  return { name: name, note: '', lead: (w.lead !== undefined ? w.lead : null) };
}

/** 导引方式描述（图鉴表格用） */
function _seekerLabel(w) {
  if (w.kind === 'dew') return T('ui.codex.zz-seal._seekerLabel.s1');
  var g = weaponGuidance(w);
  var s = g.name;
  if (g.note) return s + ' · ' + g.note;
  if (g.lead !== null) s += T('ui.codex.zz-seal._seekerLabel.s2') + Math.round(g.lead * 100) + '%';
  return s;
}

/* 机炮抗性的显示：0 / 缺省 → —，其余按百分比（保留一位小数，航母是 99.5%） */
function _gunResistTxt(r) { return r ? (Math.round(r * 1000) / 10) + '%' : '—'; }
