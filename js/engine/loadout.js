/* ============================================================
   loadout.js —— 挂载配置：展开、称重、被动吊舱汇总、装到飞机上

   从 Game 里抽出来（docs/POST2-0IMPL.md 1.7 第 3 步）。机库、开局、
   以及之后的整备点（批次 4）都走同一份，不再各写一套。

     Loadout.defaults(ac)          机型的默认配置 { 组号: 武器 id | null }
     Loadout.resolve(ac, lo)       展开成武器列表（同种武器合并，弹药累加）
     Loadout.mass(ac, lo)          挂载总重量 kg
     Loadout.passive(ac, lo)       被动吊舱汇总（交给 Ent.passiveEffects）
     Loadout.apply(ent, ac, lo, wl?)  把配置落到飞机实体上，返回武器列表
   ============================================================ */
'use strict';

var Loadout = (function () {

  /** 机型的默认挂载配置 */
  function defaults(ac) {
    var lo = {};
    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      lo[g.id] = (ac.defaultLoadout && ac.defaultLoadout[g.id]) || null;
    }
    return lo;
  }

  /**
   * 把挂载配置展开成武器列表。
   * 同一种武器占了多个挂载点就合并成一條：弹药累加，齐射数 = 挂载点总数。
   */
  function resolve(ac, lo) {
    var groups = ac.hardpointGroups || [];
    var map = {};
    var order = [];

    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var wid = lo ? lo[g.id] : null;
      if (!wid || !WEAPONS[wid]) continue;
      var w = WEAPONS[wid];
      // 被动吊舱不进武器纵列表 —— 它没有扳机可扣。
      // 它提供的加成由 passive() 单独汇总。
      if (w.tags.passive) continue;
      var e = map[wid];
      if (!e) {
        e = map[wid] = { wid: wid, w: w, points: 0, ammo: 0, salvo: 0 };
        order.push(wid);
      }
      e.points += g.pts.length;
      /* 一个挂点 = 一个发射槽，槽数就是挂点数。

         "三联装"（w.salvo = 3）的含义是**按一下打出三枚**，不是
         "一个挂点占三个冷却槽"。后者会让槽数和挂点数脱钩，
         右下角的俯视缩略图、武器纵列表的圆点指示、3D 挂载的下标
         都得改成"一点多槽"；而按一下出三枚共用一槽，架构完全不用动。
         实际发射见 launch()。 */
      e.salvo += g.pts.length;
      e.ammo += g.pts.length * (w.perPoint || 1);
    }

    // 空空弹排前面，其余按名称
    order.sort(function (a, b) {
      var wa = WEAPONS[a], wb = WEAPONS[b];
      var ka = wa.kind === 'aam' ? 0 : 1, kb = wb.kind === 'aam' ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return wa.name < wb.name ? -1 : 1;
    });

    var out = [];
    for (i = 0; i < order.length; i++) out.push(map[order[i]]);
    return out;
  }

  /** 挂载总重量（kg） */
  function mass(ac, lo) {
    var m = 0;
    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var wid = lo ? lo[g.id] : null;
      if (!wid || !WEAPONS[wid]) continue;
      var w = WEAPONS[wid];
      m += g.pts.length * (w.perPoint || 1) * (w.mass || 100);
    }
    return m;
  }

  /**
   * 把机库的"挂载点分组 + 配置"翻译成被动吊舱列表，交给
   * `Ent.passiveEffects()` 汇总。
   *
   * 真正的实现在 entities —— 因为**敌机也要用同一套**：
   * 任务脚本给 NPC 挂吊舱（`spawnEnemy` 的 `o.pods`）时，
   * 不能再写第二份汇总逻辑，否则迟早出现两边不一致。
   */
  function passive(ac, lo) {
    var list = [];
    var groups = ac.hardpointGroups || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var wid = lo ? lo[g.id] : null;
      if (!wid || !WEAPONS[wid]) continue;
      list.push({ wid: wid, n: g.pts.length });
    }
    return Ent.passiveEffects(list);
  }

  /**
   * 弹药与重量：武器列表 → 弹药池 + 发射槽 + 挂载重量模型。**玩家与 NPC 同一份**
   * （NPC 的 Ent.buildNpcMounts 也走这里）：池 = 挂点数 × 武器的 perPoint，
   * 槽数 = 挂点数，重量 = 挂点数 × perPoint × 单件重量。不再有"NPC 另按 w.ammo 算"这一支。
   * 不碰触发武器（special / spAmmo）与被动吊舱 —— 那是各自调用方的事。
   */
  function arm(p, ac, lo, wl) {
    var loadK = Math.min(1, mass(ac, lo) / (ac.maxLoad || 5000));

    p.loadoutList = wl;
    p.ammoPool = {};
    for (var wi = 0; wi < wl.length; wi++) p.ammoPool[wl[wi].wid] = wl[wi].ammo;

    p.slotCd = {};
    for (wi = 0; wi < wl.length; wi++) {
      var sArr = [];
      /* 初始分配：发射槽数 = 挂点数，而储备弹数可能少于它
         （一个挂点只带一发、而飞机上有两个这样的挂点）。

         这时多出来的挂架**一开始就该是空的**，不能当成"已装填" ——
         否则挂架上的弹会比仓库里还多。空位用 SLOT_EMPTY 标记，
         它在 stepAircraft 里永远不会被减到 0。 */
      var ammoW = wl[wi].ammo;
      for (var sj = 0; sj < wl[wi].salvo; sj++) {
        sArr.push(sj < ammoW ? 0 : Ent.SLOT_EMPTY);
      }
      p.slotCd[wl[wi].wid] = sArr;
    }

    // 挂载重量：拖累机动性，空挂架能换回一点
    p.loadFactor = loadK;
    /* 打出去的弹不再拖累飞机：每枚弹摊到的拖累 = 该类弹的总拖累 / 该类弹的弹药上限，
       吊舱不消耗，拖累始终保留。entities 的 curLoadFactor 每帧按弹药池折算。 */
    var rounds = [], roundsMass = 0;
    for (wi = 0; wi < wl.length; wi++) {
      var rm = wl[wi].ammo * (wl[wi].w.mass || 100);
      rounds.push({ wid: wl[wi].wid, cap: wl[wi].ammo, mass: rm });
      roundsMass += rm;
    }
    var totalMass = mass(ac, lo);
    p.loadModel = { k0: loadK, total: totalMass, fixed: Math.max(0, totalMass - roundsMass), rounds: rounds };
    return wl;
  }

  /**
   * 把挂载配置落到玩家飞机实体上：arm（武器列表 + 弹药池 + 发射槽 + 重量模型）
   * + 触发武器 + 被动吊舱效果。wl 缺省时现场 resolve。返回武器列表。
   */
  function apply(p, ac, lo, wl) {
    wl = arm(p, ac, lo, wl || resolve(ac, lo));

    p.wpIdx = 0;
    p.spAmmo = wl.length ? wl[0].ammo : 0;
    p.spSalvo = wl.length ? wl[0].salvo : 1;

    // 被动吊舱的效果（不占扳机，装上就生效）
    var pe = passive(ac, lo);
    p.armor = pe.armor;              // 全向减伤
    var widsByGroup = (ac.hardpointGroups || []).map(function (g) { return lo[g.id]; });
    Ent.setStealth(p, pe, widsByGroup);   // 匿踪 + 吊舱抗锁定 → 缩短敌方对我的锁定距离
    p.lockRangeK = pe.lockRange;     // 放大我的锁定距离
    Ent.setEcm(p, pe);               // 机体 ECM + 吊舱叠加
    p.flares += pe.flareBonus;
    /* 被动测距（GUS-6 明瞳 / GUS-9 夜枭）：用被动方式锁定时，
       对方的 RWR 收不到告警 —— 见 ai 里 rwrT 的判定。 */
    p.silentLock = pe.silentLock;

    // 原始配置留着 —— HUD 的挂载状态图要按它来画
    p.loadout = lo;
    return wl;
  }

  return { defaults: defaults, resolve: resolve, mass: mass, passive: passive, arm: arm, apply: apply };
})();
