/* ============================================================
   registry.js —— 注册表与标签（docs/POST2-0IMPL.md 1.3 / 1.8）

   数据文件的写法：一个单位一个文件，文件里只调用注册函数：

     Registry.aircraft({ id: 'frigatebird', order: 10, … });
     Registry.weapon({ id: 'mrm', order: 40, attr: { fits: […], perPoint: 4, mass: 120 }, … });
     Registry.ship / platform / turretGun({ id, order, … });

   · order 决定在兼容数组 / 对象里的先后（机库列表、图鉴顺序都靠它），
     注册完就从 def 上摘掉，不会出现在运行时对象里。
   · 重复 id 在注册时直接抛错。
   · 每一层末尾的 zz-seal.js 调一次 seal：生成消费者代码读的全局
     （AIRCRAFT / SHIPS / PLATFORMS / WEAPONS / TURRET_GUNS …），
     然后冻结该层 —— 之后再注册会抛错。消费者代码一行不用改。
   ============================================================ */
'use strict';

var Registry = (function () {
  var kinds = {};          // kind → [{ order, seq, def }]
  var sealed = {};         // kind → true
  var seq = 0;
  /* 带标签的种类：def.tags 写成字符串数组，注册时展开成 { 名字: true }，运行时 O(1) 查 */
  var TAGGED = { aircraft: 1, ship: 1, platform: 1, weapon: 1, turretGun: 1, target: 1 };

  function reg(kind, def) {
    if (sealed[kind]) throw new Error('Registry.' + kind + '：该层已 seal，不能再注册 ' + (def && def.id));
    if (!def || typeof def.id !== 'string' || !def.id) throw new Error('Registry.' + kind + '：缺少 id');
    if (typeof def.order !== 'number') throw new Error('Registry.' + kind + '(' + def.id + ')：缺少 order');
    var list = kinds[kind] || (kinds[kind] = []);
    for (var i = 0; i < list.length; i++) {
      if (list[i].def.id === def.id) throw new Error('Registry.' + kind + '：重复 id ' + def.id);
    }
    if (TAGGED[kind]) def.tags = Tags.expand(def.tags, kind + ':' + def.id);
    var order = def.order;
    delete def.order;
    list.push({ order: order, seq: seq++, def: def });
    return def;
  }

  /** 按 order（再按注册先后）排好的定义列表 */
  function list(kind) {
    return (kinds[kind] || []).slice()
      .sort(function (a, b) { return a.order - b.order || a.seq - b.seq; })
      .map(function (x) { return x.def; });
  }

  function seal(kindNames) {
    for (var i = 0; i < kindNames.length; i++) sealed[kindNames[i]] = true;
  }

  function byId(kind) {
    var o = {};
    var l = list(kind);
    for (var i = 0; i < l.length; i++) o[l[i].id] = l[i];
    return o;
  }

  /* ---------- 数据层的 seal：生成兼容全局 ---------- */
  function sealData() {
    var g = window;
    g.AIRCRAFT = list('aircraft');
    g.SHIPS = list('ship');
    g.PLATFORMS = list('platform');

    /* 设施 / 调节单元的数据（按模型名取）：机制标签与默认机炮抗性 */
    var TG = {};
    var tl = list('target');
    for (var k = 0; k < tl.length; k++) TG[tl[k].id] = tl[k];
    g.TARGETS = TG;

    /* 舰船 / 平台：预览用的 allMounts = 炮位 + 有实体模型的发射架，只拼一次（预览按数组缓存网格） */
    [g.SHIPS, g.PLATFORMS].forEach(function (arr) {
      for (var i = 0; i < arr.length; i++) {
        var u = arr[i];
        u.allMounts = u.launchers ? (u.mounts || []).concat(u.launchers) : u.mounts;
      }
    });

    /* 武器：attr 里的字段平铺到武器上（fits / perPoint / mass …，覆盖同名字段） */
    var W = {};
    var ws = list('weapon');
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (w.attr) {
        for (var f in w.attr) w[f] = w.attr[f];
        delete w.attr;
      }
      W[w.id] = w;
    }
    g.WEAPONS = W;

    var T = {};
    var ts = list('turretGun');
    for (var j = 0; j < ts.length; j++) {
      var tg = ts[j];
      T[tg.id] = tg;
      delete tg.id;        // 炮塔炮原来没有 id 字段，只用表键；这里只拿 id 当键
    }
    g.TURRET_GUNS = T;

    seal(['aircraft', 'ship', 'platform', 'weapon', 'turretGun', 'target']);
  }

  /* ---------- 模型层的 seal：建出 MODELS ---------- */
  function sealModels() {
    var L = ModelLib, M = {}, settleIds = [];
    var defs = list('model');
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (d.group) d.build(L, M);        // 一组相关的模型 / 辅助函数，直接往 M 上挂
      else {
        M[d.id] = d.build(L);
        if (d.settle) settleIds.push(d.id);
      }
    }
    L.finish(M, settleIds);              // 座舱盖落座、垂尾补缝、舰船零件落座
    window.MODELS = M;
    seal(['model']);
  }

  /* ---------- 关卡层的 seal：MISSIONS / CAMPAIGNS ---------- */
  function sealMissions() {
    var ms = list('mission'), idx = {};
    for (var i = 0; i < ms.length; i++) idx[ms[i].id] = i;
    var cs = list('campaign');
    for (var c = 0; c < cs.length; c++) {
      /* 战役按关卡 id 引用；运行时仍用全局下标（MISSIONS 的先后 = 注册 order） */
      cs[c].missions = cs[c].missions.map(function (id) {
        if (!(id in idx)) throw new Error('战役 ' + cs[c].id + ' 引用了不存在的关卡 ' + id);
        return idx[id];
      });
    }
    window.MISSIONS = ms;
    window.CAMPAIGNS = cs;
    seal(['mission', 'campaign']);
  }

  /* ---------- 资料库：CODEX ---------- */
  function sealCodex() {
    window.CODEX = list('codex');
    seal(['codex']);
  }

  return {
    aircraft: function (d) { return reg('aircraft', d); },
    ship: function (d) { return reg('ship', d); },
    platform: function (d) { return reg('platform', d); },
    weapon: function (d) { return reg('weapon', d); },
    turretGun: function (d) { return reg('turretGun', d); },
    target: function (d) { return reg('target', d); },
    /** 单个模型：build(L) 返回网格；settle: true = 收尾遍里让零件落座（舰船） */
    model: function (d) { return reg('model', d); },
    /** 一组相关的东西（炮塔、平台及其残骸、挂载弹体生成器）：build(L, M) 直接往 M 上挂 */
    modelGroup: function (d) { d.group = true; return reg('model', d); },
    mission: function (d) { return reg('mission', d); },
    codexEntry: function (d) { return reg('codex', d); },
    campaign: function (d) { return reg('campaign', d); },
    list: list,
    byId: byId,
    seal: seal,
    sealData: sealData,
    sealModels: sealModels,
    sealMissions: sealMissions,
    sealCodex: sealCodex,
    isSealed: function (kind) { return !!sealed[kind]; }
  };
})();

/* ============================================================
   Tags —— 单位的独有机制 = 数据里一个标签 + 机制代码里认标签

     Tags.declare('hard', { owner: 'combat', doc: '受非穿甲伤害 ×0.6（集束 ×0.2）' });
     Tags.has(def, 'hard');          // 数据里 tags 写成数组，运行时是 { hard: true }，机制代码直接读 def.tags.hard

   数值参数仍是字段（gunResist / lockResist / lead …），标签只表达
   "有没有这条机制"。smoke 断言：数据里用到的标签都已 declare。
   ============================================================ */
var Tags = (function () {
  var decl = {};
  return {
    declare: function (name, info) {
      if (decl[name]) throw new Error('标签重复声明：' + name);
      decl[name] = info || {};
    },
    /** 数据里写数组，注册时展开成 { 名字: true }；未声明的标签直接抛错 */
    expand: function (list, who) {
      var out = {};
      if (!list) return out;
      if (!Array.isArray(list)) return list;
      for (var i = 0; i < list.length; i++) {
        if (!decl[list[i]]) throw new Error(who + ' 用了没有声明的标签：' + list[i] + '（见 js/core/tags.js）');
        out[list[i]] = true;
      }
      return out;
    },
    has: function (def, name) {
      return !!(def && def.tags && def.tags[name]);
    },
    declared: function () { return decl; }
  };
})();
