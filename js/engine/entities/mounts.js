(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.fitsKind = fitsKind; $.clearMountIssues = clearMountIssues; $.weaponMatchesTarget = weaponMatchesTarget; $.targetClass = targetClass; $.chooseWeapon = chooseWeapon; $.setWeapon = setWeapon; $.mountPlan = mountPlan; $.buildNpcMounts = buildNpcMounts; $.surfaceBelow = surfaceBelow; $.storeHy = storeHy; $.storePos = storePos; $.forEachStoreSlot = forEachStoreSlot; $.storeForSlot = storeForSlot;

  /* ============================================================
     挂点适配：玩家一张表，NPC 另一张
     ============================================================ */
  /* 一件武器能挂在哪几类挂点上，**按谁来挂**分两张表：

       fits     玩家机库能选的（在 STORE_ATTR 里维护）
       npcFits  任务脚本给 NPC 写定的制式装机

     下游弹的 fits 是**空数组**，那不是"哪儿都挂不上"，而是
     "玩家拿不到实物"（见 data.js 的说明）。可空数组在 `w.fits && ...`
     里是 truthy，于是渲染那段曾经把它们全部过滤掉 ——
     敌机机翼永远是干净的。所以 NPC 改读 npcFits；没写 npcFits 的
     武器（比如上游弹被任务直接塞给敌机）退回 fits。

     注意适配表**不能不要**：`datum / pelican / quartz / lodestone` 这些
     npcOnly 机型只有机腹挂点，而 spawnEnemy 的默认弹是空空弹，
     不查的话就会被画到机腹上去。 */
  function fitsKind(w, kind, playerStyle) {
    var list = playerStyle ? w.fits : (w.npcFits || w.fits);
    return !list || list.indexOf(kind) >= 0;
  }

  /* ============================================================
     关卡里写错的 NPC 挂载记在这里
     ============================================================ */
  /* 任务脚本给 NPC 挂东西时，写错不会崩 —— 那一组静默少画几件而已。
     所以必须有人喊：这里记一条人话，`smoke.js` 跑完所有任务后断言它是空的。
     同一句只记一次（三架同型机犯同一个错不该刷屏）。 */
  $.mountIssues = [];

  function mountIssue(msg) {
    if ($.mountIssues.indexOf(msg) >= 0) return;
    $.mountIssues.push(msg);
    if (typeof console !== 'undefined' && console.warn) console.warn('[挂载] ' + msg);
  }

  function clearMountIssues() { $.mountIssues.length = 0; }

  /* ============================================================
     选弹与触发武器
     ============================================================ */
  /* 这件武器能不能打这个目标。

     判据与**玩家那边同源**（game.js 的 targetMismatch）：目标是
     `kind === 'target'` 的东西（海上平台 / 地面设施）就算"对面"，
     其余（飞机、导弹）算"空中"。 */
  function weaponMatchesTarget(w, t) {
    if (!w || !t) return false;
    var surface = (t.kind === 'target');
    if (w.target === 'air') return !surface;
    if (w.target === 'ground' || w.target === 'ship') return surface;
    if (w.target === 'any') return true;     // 对空对地通用（TOR-3）：锁距离两边一样
    return false;
  }

  /* 这件武器打这个目标时，按哪一类物理处理（'air' 或 'surface'）。
     'any' 随目标走：对面目标按对面，其余按空中。其它取值不变。 */
  function targetClass(w, t) {
    if (w && w.target === 'any') return (t && t.kind === 'target') ? 'surface' : 'air';
    return (w && (w.target === 'ground' || w.target === 'ship')) ? 'surface' : 'air';
  }

  /* AI 开火前挑一件武器 —— "换武器"的全部就是这一次挑选。

       ① 只挑打得着这个目标类别的（对空 / 对面）
       ② 射程最适合：**够得着里面射程最短的那件** —— 用远距弹打近目标是
          浪费掉一场只能带几发的东西；够不着的里面取射程最接近的
       ③ 已经装填完的优先；全在装填里就垫底（打不出去，但"想用哪件"仍成立）
       ④ 无制导弹（炸弹 / 火箭巢）不参与选弹 —— AI 没有投弹瞄准逻辑，
          给它们一件也只会瞎扔。这条在文档里写成了设计约束

     返回武器 id；一件能用的都没有就返回 null。 */
  function chooseWeapon(a, t, dist) {
    if (!a || !a.ammoPool || !t) return null;
    if (dist === undefined) dist = M3.dist(a.pos, t.pos);
    var best = null, bestScore = Infinity;
    for (var wid in a.ammoPool) {
      if (!Object.prototype.hasOwnProperty.call(a.ammoPool, wid)) continue;
      if (!(a.ammoPool[wid] > 0)) continue;
      var w = WEAPONS[wid];
      if (!w || w.kind === 'gun' || w.kind === 'ecm' || w.kind === 'dew') continue;
      if (!w.seeker || w.seeker === 'none') continue;      // 无制导：AI 不会瞄
      if (!weaponMatchesTarget(w, t)) continue;
      var reach = $.aiReach(w, a.pos.y);      // min(锁定距离, 有效射程)
      if (reach <= 0) continue;
      var score = (reach >= dist) ? reach : 1e6 + (dist - reach);
      var sl = a.slotCd ? a.slotCd[wid] : null;
      if (sl && Math.min.apply(null, sl) > 0) score += 1e9;   // 装填中：垫底
      if (score < bestScore) { bestScore = score; best = wid; }
    }
    return best;
  }

  /* 把某件武器设成"当前触发的那件"：special / spAmmo / spCd。

     玩家按 R 换弹（game.js 的 syncWeapon）与 AI 按目标挑弹都汇到这里，
     免得两边各写一份、迟早不一致。 */
  function setWeapon(a, wid) {
    if (!a) return;
    if (!wid || !WEAPONS[wid]) {
      a.special = null; a.spAmmo = 0; a.spCd = 0;
      return;
    }
    a.special = wid;
    a.spAmmo = a.ammoPool ? (a.ammoPool[wid] || 0) : 0;
    var sl = a.slotCd ? a.slotCd[wid] : null;
    a.spCd = sl ? Math.min.apply(null, sl) : 0;
  }

  /* 逐个挂点组的弹种分配，下标与 ac.hardpointGroups 对齐。

     玩家那边这张表就是机库配置（game.js 的 a.loadout）。NPC 按三条规矩
     依次落位：

       ① 任务写死的**逐组配置**（`a.loadout`，与玩家那张表同一种形状）
          —— 作者说了算，但必须真的挂得上：组的 kind 要在武器的适配表里
          （`fitsKind`），机体能力也要够（`canCarry`）。不满足就记一条
          mountIssue 并把那一组空着 —— 挂错不该崩，但必须有人喊。
       ② 任务写定的吊舱占剩下的组 —— 数量少，而且"编队里那一架带干扰吊舱"
          是设定里写明的事（missions.js 的 o.pods）
       ③ 制式弹 `a.special` 铺满再剩下的

     同一个组不会被两件东西共用。

     吊舱的占位顺序是**从最后一组往前**（不是从第一组往后）。
     理由是挂点组在 data.js 里按"内侧 → 外侧"排，倒着走等于让吊舱
     优先落在外侧/机腹，把靠里的重挂点留给制式弹。按正序会踩到一个坑：
     `spray`（light + belly）挂一枚空空弹加一个吊舱时，吊舱先吃掉
     light 组，而这只弹挂不上 belly —— 于是机腹上是吊舱、导弹一枚都画不出来，
     可 AI 照样在发射。倒着走则是吊舱进机腹、导弹占 light，两样都在。 */
  function mountPlan(a) {
    var groups = (a.ac && a.ac.hardpointGroups) || [];
    var plan = [], gi, pi;
    for (gi = 0; gi < groups.length; gi++) plan.push(null);
    /* playerOnly 的挂点组（2.4 给每架战斗机多加的一对）：NPC 一律跳过 ——
       槽数、弹药池、重量与 mountPlan 的结果与加这一对之前逐字节一致，关卡难度不变。
       玩家的 loadout 走机库（Loadout），不经过这里的 NPC 分支。 */
    var npc = !a.isPlayer;

    // ① 任务写死的逐组配置
    var lo = a.loadout || null;
    if (lo) {
      for (gi = 0; gi < groups.length; gi++) {
        if (npc && groups[gi].playerOnly) continue;
        var lw = WEAPONS[lo[groups[gi].id]];
        if (!lw) continue;
        if (!fitsKind(lw, groups[gi].kind, false)) {
          mountIssue(T('engine.entities.mounts.mountPlan.s1') + (a.type || '?') + T('engine.entities.mounts.mountPlan.s2') + groups[gi].id +
            T('engine.entities.mounts.mountPlan.s3') + groups[gi].kind + T('engine.entities.mounts.mountPlan.s4') + lw.name +
            T('engine.entities.mounts.mountPlan.s5') + lw.cn + T('engine.entities.mounts.mountPlan.s6'));
          continue;
        }
        if (!canCarry(a.ac, lw)) {
          mountIssue(T('engine.entities.mounts.mountPlan.s7') + (a.type || '?') + T('engine.entities.mounts.mountPlan.s8') + groups[gi].id +
            T('engine.entities.mounts.mountPlan.s9') + lw.name + T('engine.entities.mounts.mountPlan.s10') + lw.cn + T('engine.entities.mounts.mountPlan.s11') +
            lw.needs.join(' / ') + T('engine.entities.mounts.mountPlan.s12') +
            ((a.ac && a.ac.caps) || []).join(' / ') + ']');
          continue;
        }
        plan[gi] = lo[groups[gi].id];
      }
    }

    // ② 任务写定的吊舱
    var pods = a.pods || [];
    for (pi = 0; pi < pods.length; pi++) {
      var pw = WEAPONS[pods[pi]];
      if (!pw) continue;
      var placed = false;
      for (gi = groups.length - 1; gi >= 0; gi--) {
        if (plan[gi]) continue;
        if (npc && groups[gi].playerOnly) continue;
        if (!fitsKind(pw, groups[gi].kind, false)) continue;
        plan[gi] = pods[pi];
        placed = true;
        break;
      }
      if (!placed) {
        mountIssue(T('engine.entities.mounts.mountPlan.s13') + (a.type || '?') + T('engine.entities.mounts.mountPlan.s14') + pw.name +
          T('engine.entities.mounts.mountPlan.s15') + pw.cn + T('engine.entities.mounts.mountPlan.s16'));
      }
    }

    // ③ 制式弹
    /* 注意：任务给了逐组配置时**不再**用 special 兜底 —— 那张表就是
       全部装机，没写到的组就是空着。否则作者写 `{A:'srm'}`、
       special 又恰好被推断成同一个弹，剩下的组会凭空多出几发来。 */
    if (lo) return plan;
    for (gi = 0; gi < groups.length; gi++) {
      if (plan[gi] || !a.special) continue;
      if (npc && groups[gi].playerOnly) continue;
      var sw = WEAPONS[a.special];
      if (!sw || !fitsKind(sw, groups[gi].kind, false)) continue;
      plan[gi] = a.special;
    }
    return plan;
  }

  /* 给 NPC 建弹药池与发射槽。

     没有这两样，实体挂载就只是装饰：pushStores 判断"这枚还在不在"
     靠的是 ammoPool（打光即不画）与 slotCd（装填中则挂架空），
     而它们以前只有玩家有 —— 于是敌机的弹永远挂在翼下，打光也不消失。

     **弹药与重量跟玩家同一套**：mountPlan 先把"哪组挂什么"定下来，转成和机库一样的
     逐组配置 { 组id: 武器id }，再交给 Loadout.resolve / Loadout.arm（js/engine/loadout.js）——
     池 = 挂点数 × 武器的 perPoint，槽数 = 挂点数，重量 = 挂点数 × perPoint × 单件重量。
     武器的弹数只写在 perPoint 一处，玩家和敌机读的是同一个数；NPC 不再有另外一份"w.ammo 预算"。 */
  function buildNpcMounts(a) {
    var ac = a.ac, groups = (ac && ac.hardpointGroups) || [];
    var plan = mountPlan(a), lo = {}, gi;
    for (gi = 0; gi < groups.length; gi++) if (plan[gi]) lo[groups[gi].id] = plan[gi];

    // NPC 也吃挂载重量惩罚（loadFactor），弹打出去、池变小，总重跟着减轻（curLoadFactor）
    Loadout.arm(a, ac, lo, Loadout.resolve(ac, lo));

    /* special 兜底：任务写的逐组配置里如果那件被校验挡掉了（挂不上 /
       能力不足），a.special 可能指着一件根本没装上的东西。换成第一件
       真挂上的，否则 AI 会拿着一件不在机翼上的弹去挑、去开火。 */
    if (!a.special || !a.ammoPool[a.special]) {
      var first = null;
      for (var k in a.ammoPool) {
        if (!Object.prototype.hasOwnProperty.call(a.ammoPool, k)) continue;
        first = k;
        break;
      }
      setWeapon(a, first);
    }
    a.mountWids = plan;
    $.setStealth(a, null);
  }

  /* 挂载物的世界坐标。

     hardpointGroups 的 pts 只有 (x, y)，对应机体的(横向, 前后)，
     **没有高度** —— 所以按挂点类型补一个默认吊挂高度：翼下吊挂比翼尖低、
     机腹最低。放在这里而不是 game.js，是为了让离线预览器
     （tools/render/render-mounts.js）用同一份坐标，不然那几张图就没有意义了。

     默认值是按**战斗机**（机身深一米上下）定的。大型机体不行：
     ROK-44 干扰机与石英预警机的机腹在 -2.6 m，吊舱按 -1.95 挂会整件
     埋进机身里 —— 图上什么都看不见，而它是那架飞机唯一的外挂特征。
     所以挂点组可以自己带一个 `hy`（data.js 的 hardpointGroups），
     优先于默认值。 */
  $.STORE_HY = { tip: -0.35, heavy: -1.35, light: -1.15, belly: -1.95 };

  /* 竖直射线穿模型：(x, z) 处最低的那层表面的 y；打不到给 null。
     与 tools/test/smoke.js 的 surfaceUnderModel 同一个算法（三角扇 + 重心坐标）。 */
  function surfaceBelow(m, px, pz) {
    var best = null;
    for (var fi = 0; fi < m.f.length; fi++) {
      var idx = m.f[fi].i;
      if (idx.length < 3) continue;
      for (var t = 1; t < idx.length - 1; t++) {
        var A = m.v[idx[0]], B = m.v[idx[t]], C = m.v[idx[t + 1]];
        var d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
        if (Math.abs(d) < 1e-9) continue;
        var w1 = ((B[2] - C[2]) * (px - C[0]) + (C[0] - B[0]) * (pz - C[2])) / d;
        var w2 = ((C[2] - A[2]) * (px - C[0]) + (A[0] - C[0]) * (pz - C[2])) / d;
        var w3 = 1 - w1 - w2;
        if (w1 < -0.02 || w2 < -0.02 || w3 < -0.02) continue;
        var y = w1 * A[1] + w2 * B[1] + w3 * C[1];
        if (best === null || y < best) best = y;
      }
    }
    return best;
  }

  /* 挂点高度 = 那一层机体下表面。挂载怎么往下挂、留多少间隙
     由 MODELS.storeDrop() 按挂载模型的实际最高点决定。

     以前按挂点类型取固定高度（STORE_HY），机身扁、机翼高的机型上
     挂载就悬在半空。现在直接从模型里量：在挂点和前后各 0.8 m 处
     各打一条竖直射线，取最低的那层表面 —— 长弹的前后段也不会
     穿进进气道或发动机舱。打不到机体（翼尖外侧）才退回 g.hy / STORE_HY。
     挂载模型自己负责往下挂（MODELS.store 已经按弹径下移）。 */
  var HY_CACHE = {};

  function storeHy(a, g, pt) {
    var mk = a.model || (a.ac && a.ac.model);
    var key = mk + ':' + g.id + ':' + pt.x + ':' + pt.y;
    if (Object.prototype.hasOwnProperty.call(HY_CACHE, key)) return HY_CACHE[key];
    var m = (typeof MODELS !== 'undefined') ? MODELS[mk] : null;
    var hy = null;
    if (m) {
      /* 分级找：① 挂点前后 0.8 m；② 打不到就沿弹体扩大到前 1.5 / 后 2.5 m
         （识别图上的挂点常落在机翼前缘之前，弹体其实往后伸进翼下）；
         ③ 还打不到就往机身方向内移，最多 2 m（翼尖挂点）。 */
      var lowest = function (x, zs) {
        var r = null;
        for (var i = 0; i < zs.length; i++) {
          var sy = surfaceBelow(m, x, zs[i]);
          if (sy !== null && (r === null || sy < r)) r = sy;
        }
        return r;
      };
      var near = [pt.y, pt.y + 0.8, pt.y - 0.8];
      var wide = [pt.y + 1.5, pt.y - 1.2, pt.y - 1.8, pt.y - 2.5];
      hy = lowest(pt.x, near);
      if (hy === null) hy = lowest(pt.x, wide);
      var sgn = pt.x >= 0 ? 1 : -1;
      for (var dx = 0.4; hy === null && dx <= 2.0 + 1e-9; dx += 0.4) {
        var x2 = pt.x - sgn * dx;
        if (x2 * sgn < 0) break;
        hy = lowest(x2, near.concat(wide));
      }
    }
    if (hy === null) hy = (typeof g.hy === 'number') ? g.hy : $.STORE_HY[g.kind];
    if (hy === undefined) hy = -1.2;
    return (HY_CACHE[key] = hy);
  }

  function storePos(a, g, pt) {
    var hy = storeHy(a, g, pt);
    // 机体坐标 → 世界：x 取右、y 取上、z 取机头方向
    var local = M3.V(pt.x, hy, pt.y);
    return M3.add(a.pos, M3.add(M3.mul(a.right, local.x),
      M3.add(M3.mul(a.up, local.y), M3.mul(a.fwd, local.z))));
  }

  /* 逐个挂点遍历：cb(g, pt, wid, slotIdx)。

     发射槽数组是**按武器**建的，长度 = 这种武器占用的挂点总数；
     挂点却是**按组**排的。槽号 ↔ 挂点的对应只有这一份：
     game.js 的 pushStores（画翼下的弹）与 launch（出膛点）都走这里，
     不然打出去的那一发和消失的那个挂架会对不上。

     吊舱 / 定向能不占槽下标，slotIdx 给 null。
     挂不上的组（fitsKind 不过）必须在推进下标**之前**跳过。 */
  function forEachStoreSlot(a, cb) {
    if (!a.ac || !a.ac.hardpointGroups) return;
    var isPlayer = !!a.isPlayer;
    if (isPlayer && !a.loadout) return;
    var lo = a.loadout || {};
    var plan = isPlayer ? null : mountPlan(a);
    var used = {};
    for (var gi = 0; gi < a.ac.hardpointGroups.length; gi++) {
      var g = a.ac.hardpointGroups[gi];
      var wid = isPlayer ? lo[g.id] : plan[gi];
      if (!wid) continue;
      var w = WEAPONS[wid];
      if (!w || w.kind === 'gun') continue;
      if (!fitsKind(w, g.kind, isPlayer)) continue;
      var pod = (w.kind === 'ecm' || w.kind === 'dew');
      var base = used[wid] || 0;
      if (!pod) used[wid] = base + g.pts.length;
      for (var pi = 0; pi < g.pts.length; pi++) {
        cb(g, g.pts[pi], wid, pod ? null : base + pi);
      }
    }
  }

  /* 某武器第 idx 个发射槽对应的挂点 → { g, pt }，找不到给 null。 */
  function storeForSlot(a, wid, idx) {
    var hit = null;
    forEachStoreSlot(a, function (g, pt, w2, si) {
      if (!hit && w2 === wid && si === idx) hit = { g: g, pt: pt };
    });
    return hit;
  }
})(Ent);
