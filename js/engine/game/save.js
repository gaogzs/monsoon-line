(function (Game) {
  'use strict';
  var $ = Game.$;
  $.SAVE_KEY = 'monsoonline.save.v1';
  $.loadSave = loadSave; $.saveGame = saveGame; $.sanitizeLoadout = sanitizeLoadout;

  /* ============================================================
     存档（docs/POST2-0IMPL.md 2.6）

     设置早就持久化了（settings.js 的 'monsoonline.settings.v1'）。这里只补两样：
       cleared   { 关卡 id: true }      finish(true) 写、简报页读
       loadouts  { 机型 id: { 组 id: 武器 id | null } }   机库里改挂载时写
     键 'monsoonline.save.v1' 与设置分开，内容 { v: 1, cleared, loadouts }。
     读到不认识的版本号、坏数据、没有 localStorage（无痕模式 / 禁用存储）都静默降级，
     不抛、不弹。存下来的挂载可能引用已被移除的武器 / 挂点组（或旧存档里缺 2.4 新加的组），
     读取时逐组校验，不合法的回退到默认。
     ============================================================ */

  /* 把存下来的一份挂载配置校验成"现在这架飞机真的挂得上"的版本：
     缺的组、不存在的武器、挂点类型不适配、机体能力不够 —— 都回退到 defaultLoadout 的值。 */
  function sanitizeLoadout(ac, saved) {
    var lo = Loadout.defaults(ac);
    if (!saved || typeof saved !== 'object') return lo;
    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (!Object.prototype.hasOwnProperty.call(saved, g.id)) continue;
      var wid = saved[g.id];
      if (wid === null) { lo[g.id] = null; continue; }          // 玩家明确选了"空置"
      var w = (typeof wid === 'string') ? WEAPONS[wid] : null;
      if (!w || w.kind === 'gun') continue;
      if (!Ent.fitsKind(w, g.kind, !ac.npcOnly)) continue;
      if (!canCarry(ac, w)) continue;
      lo[g.id] = wid;
    }
    return lo;
  }

  function loadSave() {
    var raw = null, data;
    try { raw = window.localStorage.getItem($.SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try { data = JSON.parse(raw); } catch (e2) { return false; }
    if (!data || data.v !== 1) return false;

    var i;
    if (data.cleared && typeof data.cleared === 'object') {
      for (i = 0; i < MISSIONS.length; i++) {
        if (data.cleared[MISSIONS[i].id] === true) $.cleared[MISSIONS[i].id] = true;
      }
    }
    if (data.loadouts && typeof data.loadouts === 'object') {
      for (i = 0; i < AIRCRAFT.length; i++) {
        var ac = AIRCRAFT[i];
        if (Object.prototype.hasOwnProperty.call(data.loadouts, ac.id)) {
          $.loadouts[ac.id] = sanitizeLoadout(ac, data.loadouts[ac.id]);
        }
      }
    }
    return true;
  }

  function saveGame() {
    try {
      window.localStorage.setItem($.SAVE_KEY, JSON.stringify({ v: 1, cleared: $.cleared, loadouts: $.loadouts }));
    } catch (e) { /* 无痕模式或禁用存储时静默降级 */ }
  }
})(Game);
