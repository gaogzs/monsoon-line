/* ============================================================
   entities.js —— 飞行模型 / 武器 / 粒子
   本作物理的两个支点：
     · 动压 q = ½ρv²  决定操纵面权限，也决定导弹的可用过载
     · 20 km 高度 ρ=0.088 kg/m³（海平面的 7.2%）
   ============================================================ */
'use strict';

var Ent = (function () {

  var G = 9.80665, RHO0 = 1.225;
  var RHO_TROPO = 0.3639;     // 11 km 对流层顶密度，推力衰减的归一化基准
  var THRUST_TAPER = 1.0;     // 剩余推力在接近目标速度的最后一段渐弱，见 stepAircraft
  var TURN_BLEED = 0.20;      // 转弯诱导阻力系数

  /* 激光照射锥：载机的机头必须保持在这个角度内才算"还在照着"。

     25° 是按玩法定的 —— 太宽（比如 45°）玩家把机头随便一偏照射都不掉，
     那句"命中前保持照射"就形同虚设；太窄（10°）则俯冲投放时几乎
     不可能一边修正姿态一边保持照射。25° 大致是"稍微偏一下没事、
     真的转开就丢"的距离。 */
  var LASER_CONE = 25 * Math.PI / 180;

  /* ============================================================
     标准大气密度（ISA）
     ============================================================ */
  function airDensity(y) {
    if (y < 0) y = 0;
    if (y < 11000) {
      var T = 288.15 - 0.0065 * y;
      return 1.225 * Math.pow(T / 288.15, 4.2561);
    }
    if (y < 20000) {
      return 0.3639 * Math.exp(-(y - 11000) / 6341.6);
    }
    if (y < 32000) {
      var T3 = 216.65 + 0.001 * (y - 20000);
      return 0.08803 * Math.pow(T3 / 216.65, -35.16);
    }
    return 0.0132;
  }

  /** 动压（Pa） */
  function qOf(y, speed) {
    var rho = airDensity(y);
    return 0.5 * rho * speed * speed;
  }

  /** 气动权限系数：动压低于约 22 kPa 开始下降 */
  /* 操控权限随动压变化：q = ½ρv²。

     两个端点允许机型自己覆盖，这是把"高空强"具体化的唯一地方 ——
     否则一架飞机在高空好不好使，其实只由"它飞得快不快"决定。

       ctrlFull   满操控所需的动压。调低 = 高速时更早把操控拉满
       ctrlFloor  低动压时的保底操控。调高 = 能量耗尽后仍能控制

     默认 22000 / 0.13 是"普通机型"。D-14 与 F-9 各改写一端，
     于是虽然都在 18 公里以上强，性格完全不同：

       D-14   ctrlFloor 0.34
              第三涵道在稀薄空气里仍给得出控制力矩（这是它 desc 里
              本来就写了、但一直没落到物理上的设定）。
              能量耗尽时别人掉到 0.13、它还在 0.34 —— 2.6 倍。
              代价是结构只有 92、失速速度 122，硬碰硬不行。

       F-9    ctrlFull 16500
              高速区间里操控提前拉满；但 ctrlFloor 仍是默认的 0.13，
              所以一旦被拖慢，它掉得比谁都狠。 */
  function ctrlFactor(y, speed, ac) {
    var k = qOf(y, speed) / ((ac && ac.ctrlFull) || 22000);
    var lo = (ac && ac.ctrlFloor) || 0.13;
    return M3.clamp(k, lo, 1.0);
  }

  /* 阻力 / 掉速的密度系数（阶段 5.1）：以中空 7 km 为 1，
     低空放大、高空缩小，上下限免得两头失控。
     导弹滑翔掉速（基准 140 m/s²）和转弯掉速（基准 62 m/s²）都乘它。 */
  /* 地面高度钩子：现在只有海面（0），将来加陆地时由地形模块 Ent.setTerrain(fn(x,z)) 注入。
     落地判定、预计落点、瞄准圈、AI 射程都读它，不再写死 y = 0。 */
  var terrainFn = null;
  /* 两种"地面"分开看：
       海平面  SEA_Y = 0：水面。舰船、水柱、尾迹、落水都认它，永远是 0。
       地形高度 terrainY(x,z)：陆地。只有地形函数返回 > 海平面的地方才是陆地。
     groundY = max(海平面, 地形)：弹丸落地、撞地保护、离地高度（agl）读这一个；
     需要区分"落水 / 落地"的（水柱、舰船、浮空平台）用 isLand。 */
  var SEA_Y = 0;
  function terrainY(x, z) { return terrainFn ? terrainFn(x, z) : SEA_Y; }
  function groundY(x, z) { var h = terrainY(x, z); return h > SEA_Y ? h : SEA_Y; }
  function isLand(x, z) { return terrainY(x, z) > SEA_Y; }
  function agl(e) { return e.pos.y - groundY(e.pos.x, e.pos.z); }   // 离地（海面）高度
  function setTerrain(fn) { terrainFn = fn || null; }

  var BOMB_DRAG = 0.00006;    // 无动力弹 / 火箭的阻力系数：a = BOMB_DRAG × ρ × v²
  var FIN_BLEED = 0.3;        // 弹翼修正的诱导阻力：每 1 m/s 侧向速度改变耗掉 0.3 m/s 速率
  var DRAG_REF_Y = 7000, DRAG_K_MIN = 0.4, DRAG_K_MAX = 1.4;
  function airDragK(y) {
    return M3.clamp(airDensity(y) / airDensity(DRAG_REF_Y), DRAG_K_MIN, DRAG_K_MAX);
  }

  /** 导弹转弯率的气动缩放 */
  function turnFactor(y) {
    var r = airDensity(y) / RHO0;
    return Math.max(0.34, Math.sqrt(r));
  }

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
  var mountIssues = [];
  function mountIssue(msg) {
    if (mountIssues.indexOf(msg) >= 0) return;
    mountIssues.push(msg);
    if (typeof console !== 'undefined' && console.warn) console.warn('[挂载] ' + msg);
  }
  function clearMountIssues() { mountIssues.length = 0; }

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
    return false;
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
      var reach = aiReach(w, a.pos.y);      // min(锁定距离, 有效射程)
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

    // ① 任务写死的逐组配置
    var lo = a.loadout || null;
    if (lo) {
      for (gi = 0; gi < groups.length; gi++) {
        var lw = WEAPONS[lo[groups[gi].id]];
        if (!lw) continue;
        if (!fitsKind(lw, groups[gi].kind, false)) {
          mountIssue('机型 ' + (a.type || '?') + ' 的挂点组 ' + groups[gi].id +
            '（' + groups[gi].kind + '）挂不上 ' + lw.name +
            '「' + lw.cn + '」—— NPC 的挂载也必须符合该挂点的适配表');
          continue;
        }
        if (!canCarry(a.ac, lw)) {
          mountIssue('机型 ' + (a.type || '?') + ' 的挂点组 ' + groups[gi].id +
            ' 想挂 ' + lw.name + '「' + lw.cn + '」，但它需要机体能力 ' +
            lw.needs.join(' / ') + '，而这型机只有 [' +
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
        if (!fitsKind(pw, groups[gi].kind, false)) continue;
        plan[gi] = pods[pi];
        placed = true;
        break;
      }
      if (!placed) {
        mountIssue('机型 ' + (a.type || '?') + ' 挂不上吊舱 ' + pw.name +
          '「' + pw.cn + '」—— 它的适配表里没有这型机有的挂点类型');
      }
    }

    // ③ 制式弹
    /* 注意：任务给了逐组配置时**不再**用 special 兜底 —— 那张表就是
       全部装机，没写到的组就是空着。否则作者写 `{A:'srm'}`、
       special 又恰好被推断成同一个弹，剩下的组会凭空多出几发来。 */
    if (lo) return plan;
    for (gi = 0; gi < groups.length; gi++) {
      if (plan[gi] || !a.special) continue;
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

     弹药数取 w.ammo：那是 AI 一直在用的预算（spAmmo），
     不能换成玩家的 `挂点数 × perPoint` —— 下游弹的 perPoint 是 0，
     那样会建出 0 发。 */
  function buildNpcMounts(a) {
    var groups = (a.ac && a.ac.hardpointGroups) || [];
    var plan = mountPlan(a);
    var pts = {}, gi, k, mass = 0;

    for (gi = 0; gi < groups.length; gi++) {
      var wid = plan[gi];
      if (!wid) continue;
      var w = WEAPONS[wid];
      // 挂载重量：与 game.js 的 loadoutMass 同一条公式（吊舱也算重量）
      if (w) mass += groups[gi].pts.length * (w.perPoint || 1) * (w.mass || 100);
      /* 吊舱与定向能不是打出去的东西，不占发射槽（渲染那边也一直挂着） */
      if (!w || w.kind === 'gun' || w.kind === 'ecm' || w.kind === 'dew') continue;
      pts[wid] = (pts[wid] || 0) + groups[gi].pts.length;
    }

    /* NPC 也吃挂载重量惩罚。以前只有玩家设 loadFactor，
       满挂的敌机飞起来和空挂一样。 */
    a.loadFactor = Math.min(1, mass / ((a.ac && a.ac.maxLoad) || 5000));

    for (k in pts) {
      if (!Object.prototype.hasOwnProperty.call(pts, k)) continue;
      var ammo = WEAPONS[k].ammo || 0;
      /* 但预算不能超过机翼上实际挂得下的量：w.ammo 是"这架飞机打一仗的预算"，
         以前直接拿来当弹药池，于是 KA-7 一组轻挂点（2 点 × 2 发 = 4）
         能打出 44 发 v9。上游弹按 `挂点数 × perPoint` 封顶；
         下游弹 perPoint 是 0（没有挂载表），仍然只按 w.ammo。 */
      var per = WEAPONS[k].perPoint || 0;
      if (per > 0) ammo = Math.min(ammo, pts[k] * per);
      var arr = [];
      /* 与玩家同一条规矩：储备少于挂架数时，多出来的挂点一开始就是空的
         （SLOT_EMPTY 永远不会被减到 0，见 stepAircraft 的冷却段） */
      for (gi = 0; gi < pts[k]; gi++) arr.push(gi < ammo ? 0 : SLOT_EMPTY);
      a.slotCd[k] = arr;
      if (!a.ammoPool) a.ammoPool = {};
      a.ammoPool[k] = ammo;
    }

    /* special 兜底：任务写的逐组配置里如果那件被校验挡掉了（挂不上 /
       能力不足），a.special 可能指着一件根本没装上的东西。换成第一件
       真挂上的，否则 AI 会拿着一件不在机翼上的弹去挑、去开火。 */
    if (a.ammoPool && (!a.special || !a.ammoPool[a.special])) {
      var first = null;
      for (k in a.ammoPool) {
        if (!Object.prototype.hasOwnProperty.call(a.ammoPool, k)) continue;
        first = k;
        break;
      }
      setWeapon(a, first);
    }
    a.mountWids = plan;
    setStealth(a, null);
  }

  /* 挂载物的世界坐标。

     hardpointGroups 的 pts 只有 (x, y)，对应机体的(横向, 前后)，
     **没有高度** —— 所以按挂点类型补一个默认吊挂高度：翼下吊挂比翼尖低、
     机腹最低。放在这里而不是 game.js，是为了让离线预览器
     （tools/render-mounts.js）用同一份坐标，不然那几张图就没有意义了。

     默认值是按**战斗机**（机身深一米上下）定的。大型机体不行：
     ROK-44 干扰机与石英预警机的机腹在 -2.6 m，吊舱按 -1.95 挂会整件
     埋进机身里 —— 图上什么都看不见，而它是那架飞机唯一的外挂特征。
     所以挂点组可以自己带一个 `hy`（data.js 的 hardpointGroups），
     优先于默认值。 */
  var STORE_HY = { tip: -0.35, heavy: -1.35, light: -1.15, belly: -1.95 };

  /* 竖直射线穿模型：(x, z) 处最低的那层表面的 y；打不到给 null。
     与 tools/smoke.js 的 surfaceUnderModel 同一个算法（三角扇 + 重心坐标）。 */
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
    if (hy === null) hy = (typeof g.hy === 'number') ? g.hy : STORE_HY[g.kind];
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

  /* ============================================================
     飞机
     ============================================================ */
  function makeAircraft(o) {
    var ac = null, i;
    for (i = 0; i < AIRCRAFT.length; i++) if (AIRCRAFT[i].id === o.type) ac = AIRCRAFT[i];
    if (!ac) ac = AIRCRAFT[0];

    /* 挂载武器：优先用调用方指定的，没指定就翻逐组配置，再没有就退回该机型
       默认配置里的第一种（AI 走前两条路）。注意不能再用 ac.defSpecial ——
       挂载系统改造后那个字段已经不存在了，早先这里会读到 undefined 然后崩掉。 */
    var spWid = o.special || null;
    if (!spWid && o.loadout) {
      for (var lk in o.loadout) {
        if (o.loadout[lk]) { spWid = o.loadout[lk]; break; }
      }
    }
    if (!spWid && ac.defaultLoadout) {
      for (var dk in ac.defaultLoadout) {
        if (ac.defaultLoadout[dk]) { spWid = ac.defaultLoadout[dk]; break; }
      }
    }
    if (spWid && !WEAPONS[spWid]) spWid = null;

    var a = {
      kind: 'air',
      team: o.team === undefined ? 0 : o.team,
      type: ac.id,
      ac: ac,
      phys: ac.phys,
      model: ac.model,
      name: ac.name + ' ' + ac.cn,
      nick: ac.nick,
      alive: true,
      isPlayer: !!o.isPlayer,
      isDrone: !!o.isDrone,

      pos: M3.V(o.x || 0, o.y || 3000, o.z || 0),
      fwd: M3.norm(o.fwd || M3.V(0, 0, 1)),
      up: M3.V(0, 1, 0),
      right: M3.V(1, 0, 0),

      speed: o.speed || 300,
      vel: M3.V(0, 0, 300),
      throttle: o.throttle === undefined ? 0.72 : o.throttle,
      ab: false,

      hp: ac.phys.hp,
      maxHp: ac.phys.hp,
      gunResist: ac.gunResist || 0,

      ctrl: { pitch: 0, roll: 0, yaw: 0 },

      gun: ac.gun,
      /* 没有机炮的机型（预警机、重型轰炸机）`ac.gun` 是 null。
         这里以前直接写 WEAPONS[ac.gun].ammo，于是那一型一造出来就抛异常 ——
         而"预警机没有任何武器"是设定里写明的事，数据迟早要对齐。 */
      gunAmmo: (ac.gun && WEAPONS[ac.gun]) ? WEAPONS[ac.gun].ammo : 0,
      gunHeat: 0,
      firingGun: false,

      special: spWid,
      spAmmo: spWid ? WEAPONS[spWid].ammo : 0,
      spCd: 0,
      /* 并行发射槽：{ 武器 id: [槽1剩余, 槽2剩余, ...] }
         槽数 = 该武器占用的挂载点数。
         按一次发射键打 1 枚，占用一个冷却完毕的槽；
         所有槽都在装填时按不出去。这就是"齐射数"的真正含义。 */
      slotCd: {},
      spActive: 0,        // ECM 剩余生效时间
      /* 机体自带的电子对抗（AIRCRAFT[].stats.ecm，0–1）。吊舱的 ecmBonus
         由 setEcm() 叠加上来。它削弱**瞄准自己的导弹**的提前量预测，
         见 updateMissile 里的 ECM_LEAD_K。 */
      ecmBody: ac.stats.ecm || 0,
      ecm: ac.stats.ecm || 0,
      /* 认知电子战的闭环状态（设定集 7.3）。

         ewT       本次开机已持续的时间
         ewBurnT   对手完成对抗、重新建立跟踪的时刻（3–8 秒，开机时定）
         ewPower   当前压制强度 0..1，由 stepAircraft 每帧算出
         ewWid     正在干扰的是哪件吊舱（不能看 special —— 玩家会切枪）
         suppressed 本机被敌方压制的程度 0..1（驱动雷达雪花与数据链中断）

         ewPower 是**唯一**的压制出口：锁定判定读它，不读 spActive。 */
      ewT: 0,
      ewBurnT: 0,
      ewPower: 0,
      ewWid: null,
      ewLockReduce: 0,    // 那件吊舱的 lockReduce
      suppressed: 0,
      rwrT: 0,            // 被主动雷达照射的剩余告警时间（见 ai.js 的 RWR 扫描）
      rwrSrc: null,       // 正在照我的那一架
      gunTimer: 0,

      // 单位是"组"（一次投放一组诱饵），不是单发
      flares: o.flares === undefined ? 80 : o.flares,
      flareCd: 0,

      target: null,
      lockProgress: 0,
      locked: false,
      rwr: [],            // 正在锁定本机的导弹/敌机

      /* 空挂架：用一个远大于任何装填时间的冷却值表示"这里永远不会装填"。
         储备少于挂架数时，多出来的挂点从一开始就是这个状态。 */
      // （SLOT_EMPTY 在下方定义，slotCd 在 game.js 里填充时用到）

      q: 0,
      stall: false,
      dead: false,
      smokeTimer: 0,
      trailTimer: 0,

      ai: null,
      radio: o.radio || null,
      kills: 0,
      group: o.group || null,

      /* 任务写定的被动吊舱（spawnEnemy 的 o.pods）。
         它既是机制（Ent.passiveEffects 汇总），也是外观 ——
         mountPlan 会把它铺到某个挂得住的挂点组上。 */
      pods: o.pods || null,

      /* 任务写死的**逐组**挂载（spawnEnemy 的 o.loadout），形状与玩家的
         机库配置一样：{ 组id: 武器id }。玩家那份由 startMission 覆盖。 */
      loadout: o.loadout || null
    };
    a.right = M3.cross(a.up, a.fwd);
    /* NPC 的弹药池与发射槽。玩家那套由 startMission 按机库配置另建
       （那里要按 perPoint 算，和这里的口径不同）。 */
    if (!a.isPlayer) buildNpcMounts(a);
    // 炮塔（目前只有 ROK-40 的尾炮）
    if (ac.mounts && typeof Turret !== 'undefined') a.turrets = Turret.make(ac.mounts);
    return a;
  }

  /* 空挂架的冷却值。

     储备弹数少于挂架数时，打出去之后那几个槽不该再"装填完成" ——
     因为仓库里确实没有弹了。让它们停在冷却状态是最省事的做法，
     但那样 HUD 会一直显示"装填中"，等于说谎。

     所以用一个永远减不到 0 的值，语义是"这个挂架本来就空着"。 */
  var SLOT_EMPTY = 1e9;

  /* ============================================================
     飞机每帧更新
     ============================================================ */
  var STALL_SINK_MAX = 140;          // 失速下沉速度上限（m/s）

  /** 当前挂载拖累。有 loadModel（玩家）时随弹药池折算：
      每发弹的拖累 = 该类弹总拖累 / 弹药上限；吊舱等不消耗的部分恒定。 */
  function curLoadFactor(a) {
    var m = a.loadModel;
    if (!m || !m.total || !a.ammoPool) return a.loadFactor || 0;
    var mass = m.fixed;
    for (var i = 0; i < m.rounds.length; i++) {
      var r = m.rounds[i];
      var left = Math.max(0, Math.min(r.cap, a.ammoPool[r.wid] || 0));
      mass += r.mass * left / r.cap;
    }
    return m.k0 * mass / m.total;
  }

  function stepAircraft(a, dt, world) {
    if (a.gunFlashT > 0) a.gunFlashT -= dt;     // 炮口火光的余辉，见 flashRings
    if (!a.alive) return;
    var p = a.phys;

    // 挂载越重越笨拙：加速、转向、滚转都吃一点亏。
    // loadFactor：玩家按机库配置设定（game.js），NPC 由 buildNpcMounts 按实体挂载算。
    /* 必须放在函数开头：下面的失速判定、姿态旋转、目标速度全都读 p。
       以前这一段在姿态旋转之后，于是 pitch / roll 惩罚从未生效，
       失速判定也用的是未打折的 vStall。 */
    var lf = curLoadFactor(a);
    if (lf) {
      // 系数来自 loadoutPenalty() —— 和机库面板显示的是同一份，
      // 免得界面上的数字与实际手感对不上
      /* 注意：这里是**整体替换** p，所以每个用到的字段都得列上。
         之前漏了 accel / decel，还写了个根本不存在的 acc ——
         于是下面 `p.accel` 取到 undefined，加减速彻底失去节流，
         推油门的速度变化变成瞬时的。yaw 不受挂载影响，原样带过。 */
      var lp = loadoutPenalty(lf);
      p = {
        vMax: p.vMax * lp.vMax,
        vMil: p.vMil * lp.vMil,
        vStall: p.vStall * lp.vStall,
        accel: p.accel * lp.accel,
        decel: p.decel * lp.decel,
        pitch: p.pitch * lp.pitch,
        roll: p.roll * lp.roll,
        yaw: p.yaw
      };
    }

    // ---- 动压 ----
    var q = qOf(a.pos.y, a.speed);
    a.q = q / 1000;                        // kPa，供 HUD 显示

    var ctrl = ctrlFactor(a.pos.y, a.speed, a.ac);
    a.stall = a.speed < p.vStall;
    if (a.stall) ctrl *= 0.34;
    /* 存下来给两处读：AI.steerTo 按它估计每根轴此刻能转多快，
       HUD 的 P/R/Y 舵量表用它画"可用权限"底色。下一帧才被读到，差一帧无所谓。 */
    a.ctrlAuth = ctrl;

    // ---- 姿态：对机体基向量施加局部旋转 ----
    var pIn = M3.clamp(a.ctrl.pitch, -1, 1);
    var rIn = M3.clamp(a.ctrl.roll, -1, 1);
    var yIn = M3.clamp(a.ctrl.yaw, -1, 1);

    /* 高 G 过载倍率。主要由 game.js 的 controlPlayer() 驱动，
       但任何设置了 a.gLoad 的实体都会受影响（AI 目前不设，所以是 1）。
       俯仰放大得比滚转多 —— 拉杆才是真正产生过载的那个动作。 */
    var gl = (a.gLoad === undefined) ? 1 : M3.clamp(a.gLoad, 1, 2.3);

    /* 俯仰权限是不对称的，向上远大于向下。

       现实里飞行员能承受大约 +9G 的拉起过载，却只能承受 -3G 的推杆过载；
       机翼在负迎角方向的失速边界也来得更早。结果是**同一架飞机，
       向下机动的能力明显小于向上** —— 这就是为什么"推杆俯冲"从来
       不是空战里的首选动作，而"拉杆爬升"是。

       这里用 0.5 的系数体现，即推杆效率只有拉杆的一半。
       取 0.5 而不是现实里的约 1/3，是因为 1/3 会让俯冲攻击
       这个基本战术变得过于笨重。 */
    var PITCH_DOWN_K = 0.5;
    var pitchAuth = (pIn >= 0) ? 1 : PITCH_DOWN_K;
    var dPitch = p.pitch * pitchAuth * ctrl * dt * gl;
    var dRoll = p.roll * M3.clamp(ctrl * 1.8, 0.28, 1) * dt * (1 + (gl - 1) * 0.45);
    var dYaw = p.yaw * ctrl * dt;

    if (pIn) {                                   // 抬头为正 → 绕 right 转负角
      var ang = -dPitch * pIn;
      a.fwd = M3.rotAxis(a.fwd, a.right, ang);
      a.up = M3.rotAxis(a.up, a.right, ang);
    }
    /* 滚转带一点惯性：滚转角速度向目标值指数逼近（时间常数 0.14 s），
       推杆后要一瞬才滚到满速，松杆后也要一瞬才停住。
       以前输入多少当帧就转多少，手感发飘。 */
    var rTarget = rIn * dRoll / Math.max(dt, 1e-6);
    a.rollRate = (a.rollRate || 0) + (rTarget - (a.rollRate || 0)) * Math.min(1, dt / 0.14);
    if (Math.abs(a.rollRate) > 1e-4) {          // 右滚为正 → 绕 fwd 转负角
      var ang2 = -a.rollRate * dt;
      a.right = M3.rotAxis(a.right, a.fwd, ang2);
      a.up = M3.rotAxis(a.up, a.fwd, ang2);
    }
    if (yIn) {
      var ang3 = dYaw * yIn;
      a.fwd = M3.rotAxis(a.fwd, a.up, ang3);
      a.right = M3.rotAxis(a.right, a.up, ang3);
    }

    /* 失速低头力矩。以前是 0.55 —— 最深失速也只有十几度每秒，
       飞控一顶就顶住了，机头能一直竖着。现在加大一倍，
       深失速时玩家和飞控都压不住，机头自然往下掉。 */
    if (a.stall && a.pos.y > 60) {
      var st = (p.vStall - a.speed) / p.vStall;
      var angS = 1.2 * st * dt;
      a.fwd = M3.rotAxis(a.fwd, a.right, angS);
      a.up = M3.rotAxis(a.up, a.right, angS);
    }

    var B = M3.orthonormalize(a.fwd, a.up);
    a.fwd = B.fwd; a.up = B.up; a.right = B.right;

    // ---- 速度 ----
    // 油门轴可能超过 1（加力区），插值前先夹回 0..1；
    // 是否加力由 a.ab 单独决定，见 game.js controlPlayer()
    var th = M3.clamp(a.throttle, 0, 1);
    var vTarget = M3.lerp(p.vStall * 0.74, a.ab ? p.vMax : p.vMil, th);

    /* 高空推力衰减：跟着密度走，而不是另起一条直线。
       以 11 km 为基准归一化，保证在对流层顶连续；0.75 次幂是
       涡扇推力随密度衰减的常见近似。20 km ≈ 0.35，最低保底 0.20。 */
    if (a.pos.y > 11000) {
      var k = M3.clamp(Math.pow(airDensity(a.pos.y) / RHO_TROPO, 0.75), 0.20, 1);
      vTarget = M3.lerp(p.vStall * 0.55, vTarget, k);
    }

    // 可变后掠翼：低速展开（改善低速盘旋），高速后掠（减小波阻）
    if (a.ac && a.ac.variableSweep) {
      a.sweep = M3.clamp((a.speed - 170) / 250, 0, 1);
    }

    if (a.brake) vTarget = Math.min(vTarget, p.vStall * 0.92);

    /* 推力 / 阻力平衡。

       以前是"以恒定加速度逼近 vTarget"—— 那样任何额外的减速项
       （重力、转弯）都会被满额加速度吃掉，平衡点永远停在 vTarget。
       现在剩余推力在接近 vTarget 时才渐弱（最后约三成速度区间），
       于是爬升和急转会把平衡速度真的压下去，而低速段的加速手感不变。 */
    var r2 = (a.speed * a.speed) / Math.max(1, vTarget * vTarget);
    var acc;
    if (r2 < 1) acc = p.accel * Math.min(1, THRUST_TAPER * (1 - r2));
    else acc = -p.decel * Math.min(1, (r2 - 1) * 4);
    if (a.brake && a.speed > vTarget) acc = -p.decel * 1.8;

    // 重力沿航迹的分量：爬升掉速、俯冲增速
    acc -= G * a.fwd.y;

    /* 转弯掉速（诱导阻力）：实际角速度 × 速度 × 舵效。
       舵效乘进来，是因为高动压下拉出来的过载最大、阻力也最大；
       动压掉光以后转不动，也就不怎么掉速了 —— 角点速度由此而来。 */
    var wTurn = (Math.abs(dPitch * pIn) + Math.abs(dYaw * yIn)) / Math.max(1e-5, dt);
    acc -= TURN_BLEED * wTurn * a.speed * ctrl;

    a.speed = M3.clamp(a.speed + acc * dt, p.vStall * 0.42, p.vMax * 1.12);

    // ---- 位置 ----
    var vPrev = a.vel || M3.mul(a.fwd, a.speed);
    /* 失速下沉：速度不再永远沿着机头。

       以前 vel = fwd × speed，而 speed 有 0.42 vStall 的下限 ——
       机头朝上失速时重力只能把速度吃到下限，飞机就以四十多 m/s
       一直"爬"上去。现在失速时升力 ∝ (v / vStall)² 托不住的那部分
       重力累积成一个独立的竖直下沉速度：先悬停、再往下掉。
       改出失速后下沉速度在一秒左右并回航迹。 */
    if (a.stall && a.pos.y > 2) {
      var vr = a.speed / p.vStall;
      a.sink = Math.min(STALL_SINK_MAX, (a.sink || 0) + G * (1 - vr * vr) * dt);
    } else if (a.sink) {
      a.sink *= Math.exp(-dt / 0.9);
      if (a.sink < 0.05) a.sink = 0;
    }
    a.vel = M3.mul(a.fwd, a.speed);
    if (a.sink) a.vel.y -= a.sink;

    /* 载荷因数（G 表）：加速度加上 1G 抵消重力，投到机体 up 轴。
       平飞 1G，推杆为负。做一点平滑，免得逐帧抖动。 */
    if (dt > 1e-4) {
      var acv = M3.mul(M3.sub(a.vel, vPrev), 1 / dt);
      var nRaw = (M3.dot(acv, a.up) + G * a.up.y) / G;
      if (a.gNow === undefined) a.gNow = 1;
      a.gNow += (nRaw - a.gNow) * Math.min(1, dt / 0.15);
    }
    a.pos = M3.add(a.pos, M3.mul(a.vel, dt));

    // ---- 天花板 / 地形 ----
    if (a.pos.y > 23000) {
      a.pos.y = 23000 + (a.pos.y - 23000) * 0.2;
      a.fwd = M3.norm(M3.V(a.fwd.x, Math.min(a.fwd.y, -0.02), a.fwd.z));
      B = M3.orthonormalize(a.fwd, M3.V(0, 1, 0));
      a.fwd = B.fwd; a.up = B.up; a.right = B.right;
    }
    var aGy = groundY(a.pos.x, a.pos.z);
    if (a.pos.y <= aGy + 2) {
      a.pos.y = aGy + 2;
      kill(a, world, true);
      return;
    }

    // ---- 冷却 ----
    if (a.spCd > 0) a.spCd -= dt;
    // 每件武器分开计时。否则按 R 切一下挂载就等于跳过装填了 ——
    // 那会让"打一发就换枪"变成无冷却连射。
    for (var ck in a.slotCd) {
      var slots = a.slotCd[ck];
      var pool = a.ammoPool ? a.ammoPool[ck] : undefined;

      // 就绪（= 挂着弹）的槽数。SLOT_EMPTY 是大正数，不会被算进来。
      var ready = 0;
      for (var si = 0; si < slots.length; si++) if (slots[si] === 0) ready++;

      for (si = 0; si < slots.length; si++) {
        if (slots[si] <= 0) continue;
        if (slots[si] >= SLOT_EMPTY) continue;      // 空挂架，永不装填
        /* 就绪的槽已经和剩余弹数一样多 → 没有弹能装进这个槽了。

           储备少于挂架数时，打出去的那几个槽会一直空着。
           玩家看到的不是"还在装填"，而是"没得装了" ——
           这比让挂架凭空变出一发弹诚实。 */
        if (pool !== undefined && ready >= pool) continue;
        slots[si] = Math.max(0, slots[si] - dt);
        if (slots[si] === 0) ready++;               // 装完占用一枚储备
      }
    }
    /* ---- 认知电子战：闭环结算 ----

       感知 → 识别 → 建模 → 合成干扰 → 评估效果 → 修正。

       设定里的 200 微秒回路不逐拍模拟，但它买来的东西是**时间**，
       所以这里必须是一条曲线，而不是一个常数倍率：

         ramp   开机后迅速爬到满（识别与建模需要一点点时间，0.22 秒）
         burn   对手在这个时刻完成对抗、重新建立跟踪（开机时按对手水平定）
         slide  对抗完成之后压制迅速衰减到 0 —— 这就是"攻击窗口"的长度

       ewPower 是唯一的出口：AI 开火判定、防空平台判定、玩家锁定降级、
       雷达雪花全部读它。 */
    if (a.spActive > 0) {
      a.ewT += dt;
      var ewRamp = Math.min(1, a.ewT / 0.22);
      var ewBurn = a.ewBurnT > 0 ? a.ewBurnT : 6;
      var ewSlide = a.ewWave
        ? 1 - (1 - a.ewWave.to) * Math.min(1, a.ewT / a.ewWave.dur)
        : (a.ewT < ewBurn ? 1 : Math.max(0, 1 - (a.ewT - ewBurn) / 1.1));
      a.ewPower = ewRamp * ewSlide;
      a.spActive -= dt;
      if (a.spActive <= 0) {
        a.spActive = 0;
        a.ewPower = 0;
        a.ewWid = null;
        a.ewLockReduce = 0;
      }
    } else if (a.ewPower !== 0) {
      a.ewPower = 0;
    }
    if (a.flareCd > 0) a.flareCd -= dt;
    if (a.gunHeat > 0) a.gunHeat -= dt;
    if (a.gunTimer > 0) a.gunTimer -= dt;

    // ---- 拖烟（受损） ----
    if (a.hp < a.maxHp * 0.45 && world) {
      a.smokeTimer -= dt;
      if (a.smokeTimer <= 0) {
        a.smokeTimer = 0.045;
        var dmgK = 1 - a.hp / a.maxHp;
        spawnParticle(world.particles,
          M3.add(a.pos, M3.mul(a.fwd, -9)),
          M3.mul(a.vel, -0.06),
          M3.rnd(0.9, 2.1), M3.rnd(1.6, 4.0) * (0.6 + dmgK),
          dmgK > 0.75 ? '#2a2a2a' : '#6b6b6b',
          { grow: true, drag: 0.9 });
      }
    }

    // ---- 加力尾焰 ----
    if (a.ab && world) {
      a.trailTimer -= dt;
      if (a.trailTimer <= 0) {
        a.trailTimer = 0.028;
        var nzl = nozzlesOf(a.model);
        var nzz;
        if (nzl.length) {
          a.abIdx = ((a.abIdx || 0) + 1) % nzl.length;
          var nz = nzl[a.abIdx];
          nzz = M3.add(a.pos, M3.add(M3.mul(a.right, nz[0]),
            M3.add(M3.mul(a.up, nz[1]), M3.mul(a.fwd, nz[2] - 0.6))));
        } else {
          nzz = M3.add(a.pos, M3.mul(a.fwd, -10));
        }
        spawnParticle(world.particles, nzz, M3.mul(a.vel, 0.02),
          M3.rnd(0.10, 0.22), M3.rnd(1.1, 2.0), '#ffb14a', { grow: true, drag: 2.5 });
      }
    }
  }

  /* 模型上的喷口位置（机体坐标 [x, y, z]），按模型缓存。

     加力尾焰以前一律从"机身中心往后 10 米"喷出 —— G-6 的发动机吊在
     两侧机翼下，火却从机尾中线冒出来。现在直接从模型里找：
     喷口色（C.nozzle）的面按共用顶点分组，每组取横向中心与最靠后的 z。 */
  var NOZZLE_CACHE = {};
  var NOZZLE_HEX = '#333a42';
  function nozzlesOf(mk) {
    if (NOZZLE_CACHE[mk]) return NOZZLE_CACHE[mk];
    var m = (typeof MODELS !== 'undefined') ? MODELS[mk] : null, out = [];
    if (m) {
      var groups = [];
      for (var fi = 0; fi < m.f.length; fi++) {
        var f = m.f[fi];
        if (f.c !== NOZZLE_HEX) continue;
        var hit = null;
        for (var gi = 0; gi < groups.length && !hit; gi++) {
          for (var k = 0; k < f.i.length; k++) if (groups[gi].vs[f.i[k]]) { hit = groups[gi]; break; }
        }
        if (!hit) { hit = { vs: {} }; groups.push(hit); }
        for (k = 0; k < f.i.length; k++) hit.vs[f.i[k]] = true;
      }
      for (gi = 0; gi < groups.length; gi++) {
        var sx = 0, sy = 0, n = 0, mz = 1e9;
        for (var vi in groups[gi].vs) {
          var v = m.v[vi]; sx += v[0]; sy += v[1]; n++;
          if (v[2] < mz) mz = v[2];
        }
        if (n) out.push([sx / n, sy / n, mz]);
      }
    }
    return (NOZZLE_CACHE[mk] = out);
  }

  /* ============================================================
     导弹
     ============================================================ */
  function makeMissile(o) {
    var w = WEAPONS[o.weapon];
    var m = {
      kind: 'missile',
      team: o.team === undefined ? 0 : o.team,
      weapon: o.weapon,
      w: w,
      model: w.model || 'missile',
      alive: true,
      pos: M3.clone(o.pos),
      fwd: M3.norm(o.fwd),
      up: M3.V(0, 1, 0),
      right: M3.V(1, 0, 0),
      speed: o.speed || 120,
      /* 无动力弹的初速**必须在这里给**。

         有发动机的弹每帧都会用 vel = fwd × speed 重算速度，所以初始
         零向量无所谓。无动力弹的速度却完全靠 vel 自己累积 ——
         初值给 0 的话它是"从空中静止开始往下掉"，扔出去的动能全丢了。 */
      vel: (w.ballistic || w.burn)
        ? M3.mul(M3.norm(o.fwd), o.speed || 120)
        : M3.V(0, 0, 0),
      target: o.target || null,
      age: 0,
      life: w.vsLife,
      dmg: w.dmg,
      turn: w.turn,
      /* 近炸：上一帧弹相对目标的位置（fuzeRel），以及它是对谁量的（fuzeRef）。
         换目标时要重新开始量，否则一帧之内会"瞬移"出一条假的最近点线段。 */
      fuze: Combat.spec(w).fuze,
      fuzeRel: null, fuzeRef: null,
      owner: o.owner || null,
      trailTimer: 0,
      /* 双导引头（BIN-9 `twinSeeker`）：一次诱饵只能骗掉其中一个，
         剩下的那个继续咬着 —— 要骗走这枚弹得连中两次。见 breakLock。 */
      seekers: w.twinSeeker ? 2 : 1,
      /* 本机第一次进入定向能拦截包线时已经掷过骰（见 game.js 的 updateDEW）。 */
      dewRolled: null,
      seekerOn: true,
      lostTime: 0,
      /* 这一枚弹被同一次交战里的诱饵骗过几次。
         每投一组都会被记一次（不管骗没骗到）—— 见 breakLock。 */
      decoyTries: 0,
      /* 被诱饵骗走之后的"盲飞"时间。

         这一位取代了原来用 `reDone` 兼职的做法：那时 breakLock 把
         `reDone = true`，于是带 reAcquire 的弹**永久**失去重捕获能力，
         而 IR 弹那边靠 `m.spoofed` 永久排除骗过它的那一架 ——
         一次诱饵等于让这枚弹再也咬不到你。

         诱饵应该只买到**一段时间**，不是永久免疫。 */
      reLockT: 0,
      /* 出膛助推段（舰船发射器，4.3）：launchT 秒内强制无制导，沿出管方向飞；
         之后 pitchOver 期间转平，导引头视场暂不判丢失，直到第一次把目标转进视场。 */
      launchT: o.launchT || 0,
      pitchOver: (o.launchT || 0) > 0
    };
    /* 垂发时 fwd 竖直，和缺省 up 平行 —— 换一个水平的 up，免得基底退化 */
    if (Math.abs(m.fwd.y) > 0.95) m.up = M3.V(0, 0, 1);
    m.right = M3.cross(m.up, m.fwd);
    return m;
  }

  /* ============================================================
     红外导引头的自主寻的

     红外弹和雷达弹的根本差别：它不需要对方"被锁定"才能发现对方 ——
     它只是**看谁更热**。所以它可以盲射：出膛之后在自己的视场角里
     找一个热源咬上去。

     这也解释了为什么大离轴格斗弹值钱：TOR-6「环刃」的视场是 ±88°，
     机头都不用转过去；而基础弹只有 28°，得先把机头带过去。

     "更热"怎么算 —— 这里没有热力学模型，用三个现有量凑：
       ab         加力尾焰是最大的热源（3 倍权重）
       throttle   油门越大，尾喷温度越高
       phys.hp    机体越大，被照到的辐射面越大（大飞机更亮）

     再按离轴角和距离衰减：视场边缘、越远的目标越难咬住。
     ============================================================ */
  function irSignature(e) {
    var s = (e.ab ? 3.0 : 1.0) * (0.4 + (e.throttle === undefined ? 0.7 : e.throttle));
    var hp = (e.phys && e.phys.hp) ? e.phys.hp : 100;
    s *= 0.6 + hp / 300;
    return s;
  }

  /* 在导引头的视场与捕获距离内，挑"红外特征最明显"的那一架。 */
  function irAcquire(m, world) {
    var w = m.w;
    var cone = w.lockCone || 0.6;
    var maxD = (w.lockDist || 4000) * 1.5;
    var best = null, bs = 0;
    /* 对地 / 对海的红外弹（GUT-9、TUM-7）找的是**地面热源**，不是飞机。
       以前这里一律扫 world.actors —— 一枚滑翔锤丢了地面目标之后，
       会转头去追天上路过的敌机。现在对面弹只在 world.targets 里挑。 */
    if (w.target !== 'air') {
      var tl = world.targets || [];
      for (var j = 0; j < tl.length; j++) {
        var g = tl[j];
        if (!g.alive || g.team === m.team || g.team > 1) continue;   // 中立（team 2）谁都不认
        if (!weaponMatchesTarget(w, g)) continue;
        var tg = M3.sub(g.pos, m.pos);
        var dg = M3.len(tg);
        if (dg > maxD) continue;
        var og = M3.angleBetween(m.fwd, M3.mul(tg, 1 / Math.max(1, dg)));
        if (og > cone) continue;
        var sg = (0.6 + (g.radius || 10) / 30) * (1 - og / cone) / (1 + dg / 1500);
        if (sg > bs) { bs = sg; best = g; }
      }
      return best;
    }
    var taken = m.salvo ? m.salvo.claimed : null;
    var best2 = null, bs2 = 0;
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === m.team || e.team > 1) continue;   // 中立（team 2）谁都不认

      /* 骗过它的那一架：只在**盲飞期**内放过，之后照样可以重新咬住。
         以前这里是无条件 `continue` —— 一次诱饵 = 这枚弹永久咬不到你，
         而诱饵本该只买到一段时间（见 makeMissile 的 reLockT 注释）。 */
      if (e === m.spoofed && m.reLockT > 0) continue;

      var to = M3.sub(e.pos, m.pos);
      var d = M3.len(to);
      if (d > maxD) continue;
      var off = M3.angleBetween(m.fwd, M3.mul(to, 1 / Math.max(1, d)));
      if (off > cone) continue;                 // 不在导引头视场里
      var score = irSignature(e) * (1 - off / cone) / (1 + d / 1500);
      /* 齐射：兄弟弹已经咬住的目标排在后面 —— 视场里只剩它们时照样可以重复。 */
      if (taken && taken.indexOf(e) >= 0) {
        if (score > bs2) { bs2 = score; best2 = e; }
        continue;
      }
      if (score > bs) { bs = score; best = e; }
    }
    if (!best) best = best2;
    if (best && taken && taken.indexOf(best) < 0) taken.push(best);
    return best;
  }

  /* 盲飞期结束的那一帧：导引头重新睁眼，骗走它的诱饵云还亮不亮？

     还亮、还在视场里 → 没有记忆的导引头可能**再咬回那团云**（概率是
     当初被骗概率的一半），盲飞延长到云熄灭为止。每次被骗只判一次。
     带 `decoyMemory` 的弹（CLA-4）认得那团云，不会被它第二次骗走 ——
     它重新搜索时只看真目标。 */
  var DECOY_LIFE = 2.6;
  function decoyRecheck(m) {
    var dc = m.decoy;
    dc.done = true;
    if (m.w.decoyMemory) return;
    var tau = m.age - dc.t0;
    var remain = DECOY_LIFE - tau;
    if (remain <= 0.05) return;
    var cp = M3.add(dc.p, M3.mul(dc.v, tau));
    var to = M3.sub(cp, m.pos);
    var d = M3.len(to);
    if (d < 1) return;
    if (M3.angleBetween(m.fwd, M3.mul(to, 1 / d)) > (m.w.lockCone || 0.6)) return;
    if (Math.random() < dc.p2) m.reLockT = remain;
  }

  function stepMissile(m, dt, world) {
    if (!m.alive) return;
    var w = m.w;
    m.age += dt;
    /* 被诱饵骗走之后的盲飞计时；归零之后才重新允许捕获。
       递减必须发生在导引段**之前**，否则捕获分支永远读不到 0。 */
    if (m.reLockT > 0) m.reLockT -= dt;
    if (m.decoy && !m.decoy.done && m.reLockT <= 0) decoyRecheck(m);
    /* 寿命到期：在空中自爆（包括被电子干扰骗走、盲飞到期的弹）—— 以前是哑弹 */
    /* 无动力弹和火箭不按寿命自爆：重力迟早让它落地，动能耗尽砸偏也只是打空。
       有动力弹的滑翔段有 170 m/s 保底、不会自己落下，仍然要靠寿命收场。 */
    if (m.age > m.life && !w.ballistic && !w.burn) { killMissile(m, world, false); return; }
    /* 被近防炮判定拦截（turret.js 4.7）：短暂延迟后空爆，并报一个事件给 HUD / 无线电 */
    if (m.ciwsKill > 0) {
      m.ciwsKill -= dt;
      if (m.ciwsKill <= 0) {
        m.intercepted = true;
        killMissile(m, world, false);
        if (world && world.events) world.events.push({ type: 'intercept', m: m, host: m.ciwsHost });
        return;
      }
    }

    // ---- 动力段 ----
    if (w.ballistic || w.burn) {
      /* 无动力弹：出膛之后只剩重力和阻力。
         火箭（`w.burn`，PEJ-6）走同一条积分，只是前 burn 秒多一份沿弹轴的推力。

         以前它们和导弹走同一条路（speed 恒定、vel = fwd × speed），
         所以炸弹是"贴着机头平飞出去"的 —— 不加速也不下坠，
         完全不像扔出去的东西。现在它是一条真正的抛物线：
         初速来自载机，之后每一次下坠都由重力累积。 */
      m.vel.y -= G * dt;
      if (w.burn && m.age < w.burn) m.vel = M3.add(m.vel, M3.mul(m.fwd, w.boost * dt));
      var sp0 = M3.len(m.vel);
      if (sp0 > 1) {
        var rho0 = airDensity(m.pos.y);
        /* 滑翔弹的升力（`w.glide` = 升阻比）：垂直于速度、在铅垂面内向上，
           大小 = 升阻比 × 阻力加速度，封顶在 g·cosγ（刚好托住重力的法向分量，
           不会把弹往上拉）。高空稀薄升力小、先自由下落，进了稠密空气才滑得起来；
           速度越快动压越大、封顶越早到，滑得越远。 */
        var vh2 = m.vel.x * m.vel.x + m.vel.z * m.vel.z;
        /* 导引上一帧要往下修（目标在弹道下方）→ 卸掉升力（压低迎角），弹道变陡 */
        if (w.glide && vh2 > 1 && !m.glideOff) {
          var hs = Math.sqrt(vh2);
          var lift = Math.min(w.glide * BOMB_DRAG * rho0 * sp0 * sp0, G * hs / sp0);
          var lk = lift * dt / (hs * sp0);
          m.vel = M3.V(m.vel.x - m.vel.x * m.vel.y * lk, m.vel.y + hs * hs * lk, m.vel.z - m.vel.z * m.vel.y * lk);
        }
        // 阻力与动压同量级：低空稠密掉速快，高空稀薄掉得慢
        var dragK = BOMB_DRAG * rho0 * sp0;
        m.glideOff = false;
        m.vel = M3.mul(m.vel, Math.max(0.2, 1 - dragK * dt));
      }
      m.speed = M3.len(m.vel);
    } else {
      var powered = m.age < effectiveLife(w, m.pos.y);
      /* 高空专用弹（highAltImmune，SPO-9）的大舵面在稠密空气里是负担：
         低空加速慢、滑翔段掉速快。按相对密度插值 —— 两万米以上不受影响，
         海平面推力只剩 55%、滑翔阻力 ×1.6。这就是 desc 里那句
         "低空阻力大、加速慢"的落点。 */
      var rhoR = w.highAltImmune ? Math.min(1, airDensity(m.pos.y) / RHO0) : 0;
      if (powered) {
        /* 速度上限：低空不再有加成（稠密空气里极速更低不更高），
           高空略高（最多 +10%，4–16 km 线性爬升） */
        m.speed = Math.min(m.speed + w.boost * (1 - 0.45 * rhoR) * dt,
          w.speed * (1 + 0.1 * M3.clamp((m.pos.y - 4000) / 12000, 0, 1)));
      } else {
        /* 滑翔掉速随空气密度：低空快、高空慢（highAltImmune 的低空惩罚
           已经包含在密度系数里，不再单列 rhoR 项） */
        m.speed = Math.max(m.speed - 140 * airDragK(m.pos.y) * dt, 170);
      }
    }

    // ---- 导引 ----
    var t = m.target;
    if (t && (!t.alive || t.dead)) { t = null; }

    if (w.unguided) {
      /* 无制导：不找目标，也不做任何修正 ——
         出膛那一刻的指向就是它的一生。有 target 引用也当没有。 */
      m.target = null;
      t = null;
    }

    /* ---------- 红外弹的自主寻的 ----------

       出膛时没指定目标（玩家对着大概方向盲射），或者目标刚丢出视场，
       就在导引头的视场与捕获距离内重新挑一个**红外特征最明显**的。
       雷达弹不走这条路 —— 它得先有人把目标"锁定"给它。

       **盲飞期（`reLockT`）内不寻的**：那是诱饵买到的时间。
       这一条与下面雷达弹的重捕获共用同一个计时器。

       注意它跑在激光制导之前、制导段之前，所以这一帧挑中的目标
       当帧就能被修正。 */
    var boosting = m.launchT > 0;
    if (boosting) m.launchT -= dt;

    if (!boosting && w.seeker === 'ir' && (!t || !m.seekerOn) && m.reLockT <= 0 && world) {
      var acq = irAcquire(m, world);
      if (acq) {
        t = acq;
        m.target = acq;
        m.seekerOn = true;
        m.lostTime = 0;
      }
    }

    /* ---------- 激光制导：弹没有导引头，靠的是载机的照射 ----------

       **当前处于休眠状态** —— 没有任何武器在使用 seeker: 'laser'
       （PEJ-30 先改 eo 光电制导、5.3 起又改成无制导）。整段代码留着是因为机制本身是
       完整的、验证过的，将来要用直接给某件弹填上 'laser' 即可。

       原理：弹每一帧都去问投放它的那架飞机"你还在照着目标吗"。
       载机把机头转开、目标跑出照射锥，弹就立刻停止修正 ——
       但**不会消失**，它带着已有的速度和弹道继续往下掉，砸在哪算哪。
       这正是激光制导武器最真实的弱点：炸弹本身是瞎的。

       （写这段之前全项目只有 ir 和 radar 两种导引方式，
       "激光"只出现在文案里 —— 那时填个 'laser' 进数据也没人读。）
       ============================================================ */
    if (w.seeker === 'laser' && t) {
      var lit = false;
      var shooter = m.owner;
      if (shooter && shooter.alive) {
        var toSh = M3.sub(t.pos, shooter.pos);
        var dSh = M3.len(toSh);
        if (dSh > 1) {
          lit = M3.angleBetween(shooter.fwd, M3.mul(toSh, 1 / dSh)) < LASER_CONE;
        }
      }
      if (!lit) {
        m.laserLost = true;
        t = null;                 // 停止修正，继续自由落体
      } else {
        m.laserLost = false;
      }
    }

    /* 被诱饵骗走的盲飞期：把那团诱饵云当作虚拟目标继续追（见 decoyTarget），
       而不是直飞 —— 追上了就在云里起爆，爆炸照样会波及旁边的人。 */
    if (!t && world && !boosting) {
      var dcT = decoyTarget(m);
      if (dcT) { t = dcT; m.seekerOn = true; }
    }

    if (boosting) {
      /* 助推段：不导引、不重捕获，沿出管方向直飞 */
    } else if (t && m.seekerOn) {
      var toT = M3.sub(t.pos, m.pos);
      var dist = M3.len(toT);
      var los = M3.mul(toT, 1 / Math.max(1, dist));

      // 命中点预测（一阶提前量）
      var tGo = dist / Math.max(60, m.speed);
      var tvel = t.vel || M3.V(0, 0, 0);

      /* 导引品质（w.lead）：
         0 = 纯追踪，傻追着目标当前的位置，目标一横向机动就跟丢；
         1 = 完全预测，飞向解算出来的最优拦截点。

         这个系数比转弯率更能体现"这枚弹聪不聪明"：一枚转弯率一般
         但预测准的弹，打机动目标反而比一枚只会死咬尾巴的灵活弹更有效。 */
      var lead = (w.lead === undefined) ? 0.6 : w.lead;
      /* 目标的 ECM（机体 + 吊舱）压低预测品质：满值 ECM 把提前量砍掉 ECM_LEAD_K。 */
      if (t.ecm) lead *= 1 - ECM_LEAD_K * Math.min(1, t.ecm);
      var aim = M3.add(t.pos, M3.mul(tvel, tGo * lead));

      /* 高抛 / 攻顶弹道（`w.loft`，GUT-25、BOX-14）。

         水平距离还大于 `loft.dive` 时，瞄准点被抬到目标上方 `loft.alt` 米
         （不超过水平距离的 0.4 倍，免得近距发射也去爬高）——
         弹先爬升、平飞过去，进入末段才压头俯冲。只对水面 / 地面目标生效。 */
      if (w.loft && t.kind === 'target') {
        var hx = aim.x - m.pos.x, hz = aim.z - m.pos.z;
        var hd = Math.sqrt(hx * hx + hz * hz);
        if (hd > w.loft.dive) {
          aim = M3.V(aim.x, aim.y + Math.min(w.loft.alt, hd * 0.4), aim.z);
        }
      }
      var desired = M3.norm(M3.sub(aim, m.pos));

      /* 视场限制：目标偏出导引头视场视为丢失。

         视场取 max(±77°, 锁定锥)。以前写死 1.35 rad —— 于是 TOR-6
         （hobs，锁定锥 ±88°）在 77–88° 之间锁住的目标，出膛半秒就被判丢失，
         大离轴这项卖点在最需要它的那一段反而不成立。 */
      var fov = w.hobs ? Math.max(1.35, w.lockCone || 0) : 1.35;
      var off = M3.angleBetween(m.fwd, los);
      /* 转平中：目标还在视场外是正常的，不算丢失 */
      if (m.pitchOver && off <= fov) m.pitchOver = false;
      if (off > fov && !m.pitchOver) {
        m.lostTime += dt;
        if (m.lostTime > 0.5) m.seekerOn = false;
      } else {
        m.lostTime = 0;
        /* 有些弹是专门为稀薄大气造的（舵面比同级大一倍），
           它们的过载不随空气变稀而崩塌 —— 在这个游戏里
           这就是"高空拦截弹"唯一说得通的定义，
           否则所有弹在上两万米之后都退化成同一种东西。 */
        var tf = turnFactor(m.pos.y);
        if (w.highAltImmune) tf = Math.max(tf, 0.78);
        var maxTurn = m.turn * tf * dt;
        /* 偏差要在转之前量：转完之后再量，得到的是"还剩多少没转"，
           快对准时趋近零，转弯就几乎不花速度了。 */
        var want = M3.angleBetween(m.fwd, desired);
        var B = M3.turnToward(m.fwd, m.up, desired, maxTurn);
        m.fwd = B.fwd; m.up = B.up;
        m.right = M3.cross(m.up, m.fwd);
        var Bo = M3.orthonormalize(m.fwd, m.up);
        m.fwd = Bo.fwd; m.up = Bo.up; m.right = Bo.right;

        /* 无动力制导弹（GUT-9 滑翔锤）：修正的是**速度矢量**。

           以前这里只转了 m.fwd，而 ballistic 弹的位置靠 vel 积分、
           每帧末尾又把 fwd 掰回 vel 方向 —— 等于导引头算完了、舵面没动，
           "有制导"的炸弹其实全是自由落体。现在把 vel 转到新的 fwd 上、
           保持速率不变：能量仍然只来自投放初速与重力，弹翼只负责改方向。 */
        if (w.ballistic && w.fin) {
          /* 带弹翼的无动力制导弹（`w.fin`）：弹翼产生受动压（ρ·v²）限制的
             侧向加速度，只改方向不加能量 —— 能量仍只来自投放初速与重力。

             有 glide（GUT-9 滑翔锤）与无 glide（PEJ-14 精确制导炸弹）在这里分道：
               · 有 glide：往上托只靠升阻比那份升力（有 g·cosγ 封顶），弹翼不能再
                 往上修，否则会变成第二份升力把抛物线掰成平飞 —— 往上只留横向分量，
                 往下修则卸掉升力（glideOff）。
               · 无 glide：没有升力可卸，弹翼就是全向的（上下左右都能修）。不限制
                 向上分量，否则弹一下压过头就"上拉不回来"，圈内目标打不中 ——
                 这恰恰是精确制导炸弹"能精确命中"的来由。 */
          var spv = M3.len(m.vel);
          if (spv > 1) {
            var vh = M3.mul(m.vel, 1 / spv);
            var dv = M3.sub(M3.mul(desired, spv), m.vel);
            var perp = M3.sub(dv, M3.mul(vh, M3.dot(dv, vh)));
            if (w.glide) {
              if (perp.y < 0) m.glideOff = true;
              else {
                var lat = M3.cross(vh, M3.V(0, 1, 0)), ll = M3.len(lat);
                perp = ll > 1e-3 ? M3.mul(lat, M3.dot(perp, lat) / (ll * ll)) : M3.V(0, 0, 0);
              }
            }
            var pl = M3.len(perp);
            if (pl > 1e-3) {
              var aFin = w.fin * (airDensity(m.pos.y) / RHO0) * (spv / 250) * (spv / 250);
              var dvFin = Math.min(pl, aFin * dt);
              var nv = M3.add(m.vel, M3.mul(perp, dvFin / pl));
              /* 修正同样耗速：诱导阻力 ≈ 实际侧向加速度 × FIN_BLEED。
                 按弹翼真正用了多少力算，不按机头转角 —— 机头永远追不上重力，
                 按转角算会让滑翔弹一路持续掉速。 */
              var spn = Math.max(0, spv - dvFin * FIN_BLEED);
              m.vel = M3.mul(nv, spn / Math.max(1, M3.len(nv)));
            }
          }
        } else if (w.ballistic) {
          m.vel = M3.mul(m.fwd, M3.len(m.vel));
        }

        /* 转弯消耗动能。
           没有这一条，导弹的动力段之外照样能满过载无限机动，
           玩家的桶滚和 3/9 线规避全都没有意义 —— 因为对手不累。
           现在它必须为每一次急转付出速度。 */
        var used = Math.min(want, maxTurn) / Math.max(1e-5, dt);   // 实际转弯率 rad/s
        var load = M3.clamp(used / 3.0, 0, 1);
        if (!w.ballistic) m.speed = Math.max(170, m.speed - load * 62 * airDragK(m.pos.y) * dt);
      }

    } else if (!t) {
      /* 无目标时：直线飞一会儿，然后按各自的规则重新捕获。

         两种导引头走两条路，但**共用同一个盲飞计时**：
           ir     → irAcquire（在视场与捕获距离里挑红外特征最明显的）
           radar  → 只有 reAcquire 型才重获（目前只有 CLA-4；SUT-11 / SUT-7
                    也带这个标记，但它们是红外弹，走的是上面那条）

         盲飞期内谁都别想重锁 —— 那正是诱饵买到的时间。 */
      m.seekerOn = false;

      // 红外弹：冷却结束就允许自主寻的（irAcquire 内部会按盲飞期跳过欺骗源）
      if (w.seeker === 'ir' && m.reLockT <= 0 && world) {
        var acq2 = irAcquire(m, world);
        if (acq2) {
          m.target = acq2;
          m.seekerOn = true;
          m.lostTime = 0;
          t = acq2;
        }
      }

      // 雷达弹：只有 reAcquire 型会重获，而且同样要等在盲飞期之后
      if (!t && w.reAcquire && m.reLockT <= 0 && world) {
        var best = null, bd = 1e9;
        var rcone = w.lockCone || 0.6;
        for (var i = 0; i < world.actors.length; i++) {
          var e = world.actors[i];
          if (!e.alive || e.team === m.team || e.team > 1) continue;   // 中立（team 2）谁都不认
          /* 欺骗源在盲飞期后**可以被重新咬住** —— 只要它还在
             导引头的捕获距离与锁定锥内。这一条以前写成"永久跳过"，
             等于一次诱饵换来永久免疫。锥角限制是后加的：导引头只看得见
             弹头前方，不能捕获身后的东西。 */
          var d2 = M3.dist2(e.pos, m.pos);
          if (!(d2 < bd && d2 < 2600 * 2600)) continue;
          var dd = Math.sqrt(d2);
          if (dd > 1 && M3.angleBetween(m.fwd, M3.mul(M3.sub(e.pos, m.pos), 1 / dd)) > rcone) continue;
          bd = d2; best = e;
        }
        if (best) {
          m.target = best;
          m.seekerOn = true;
          m.turn = w.turn;
          m.lostTime = 0;
        }
      }
    }

    // ---- 位置 ----
    if (!w.ballistic && !w.burn) m.vel = M3.mul(m.fwd, m.speed);
    m.pos = M3.add(m.pos, M3.mul(m.vel, dt));

    if (w.ballistic || w.burn) {
      // 弹体顺着弹道走 —— 自由落体的炸弹是"跟着速度矢量"的，不是昂着头的
      var sp2 = M3.len(m.vel);
      if (sp2 > 1) {
        var Bb = M3.orthonormalize(M3.mul(m.vel, 1 / sp2), m.up);
        m.fwd = Bb.fwd; m.up = Bb.up; m.right = Bb.right;
      }
    }

    /* 近炸 / 撞上：按本帧的相对运动做线段最近点（见 fuzeCheck）。
       无制导弹不走这里 —— 它们的命中靠 game.js 的 scanShot。 */
    if (t && m.seekerOn && !w.unguided && world && fuzeCheck(m, t, world)) return;

    var gy = groundY(m.pos.x, m.pos.z);
    if (m.pos.y <= gy) {
      /* 撞地 / 落水：就地起爆。子母弹落地就是抛撒完成，按覆盖半径结算一片。 */
      if (world) { m.pos.y = gy; Combat.detonate(m, world, null, null, { ground: true }); }
      else m.alive = false;
      return;
    }

    /* ---- 尾迹：只有带发动机的才拉烟 ----

       这里必须按 **ballistic（无动力）** 判断，不能按 unguided（无制导）——
       两者是正交的，"没发动机"和"不找目标"根本不是一回事：

         PEJ-6 撒星    有发动机 / 无制导  → 拉烟（火箭当然有排气）
         GUT-9 滑翔锤  无发动机 / 有制导  → 不拉烟
         PEJ-30 铁蒺藜 无发动机 / 无制导  → 不拉烟
         PEJ-9 碎玉    无发动机 / 无制导  → 不拉烟

       之前按 unguided 判断，结果正好反了：火箭巢被当成纯炸弹不冒烟，
       而滑翔弹和激光制导炸弹一路拖着尾焰，看起来像有动力。 */
    if (w.ballistic) return;

    m.trailTimer -= dt;
    if (m.trailTimer <= 0) {
      m.trailTimer = 0.012;
      var whitish = m.age < effectiveLife(w, m.pos.y);
      spawnParticle(world.particles, m.pos,
        M3.mul(m.vel, -0.02),
        whitish ? M3.rnd(0.30, 0.75) : M3.rnd(0.8, 1.7),
        M3.rnd(0.7, 1.5), whitish ? '#e8e2d0' : '#b9b4a6',
        { grow: true, drag: 1.4 });
    }
  }

  /* ============================================================
     有效射程：这件弹从 alt 高度平飞发射，**真的能飞到多远**

     lockDist 只是导引头能锁多远。弹飞不飞得到，看的是速度、动力段、
     滑翔掉速、高抛弹道 —— BOX-14 锁得到 9 km，实际只飞得到 8.2 km。
     以前 AI 一律拿 lockDist 当射程，于是在"锁得上但打不到"的距离上开火。

     算法：用 stepMissile 本身对一个远在 60 km 外、正前方的假目标飞一次，
     记下弹体结束（寿命到、撞地）时离发射点的距离（对面弹取水平距离）。
     和实战用同一份弹道代码 —— 改了速度、寿命、loft，射程自动跟着变。
     结果按 2 km 高度分档缓存在武器上，第一次用到时才算（一次 < 2400 步）。
     ============================================================ */
  // 步数上限 5 分钟：不按寿命自爆的滑翔弹从高空投放要飞一分多钟
  var EFF_BAND = 2000, EFF_LAUNCH_V = 250, EFF_MAX_FRAMES = 60 * 300;
  /* effRange 是"平地、离地高度 alt"下的抽象射程（按高度分档缓存）：模拟里的坐标是虚构的，
     不能读真实地形 —— 否则弹会撞上不存在的山，缓存也跟着地形变。所以模拟期间临时把地形关掉，
     调用方按"本机高出目标多少"传 alt。 */
  function effRange(w, alt) {
    if (!w || !w.vsLife) return w ? (w.lockDist || 0) : 0;
    var saved = terrainFn; terrainFn = null;
    try { return effRangeFlat(w, alt); } finally { terrainFn = saved; }
  }
  function effRangeFlat(w, alt) {
    var band = Math.max(0, Math.round((alt || 0) / EFF_BAND));
    var c = w.__eff || (w.__eff = {});
    if (c[band] !== undefined) return c[band];
    var y0 = Math.max(200, band * EFF_BAND);
    var surf = w.target === 'ground' || w.target === 'ship';
    var far = 200000;   // 足够远：从 24 km 高空投放的滑翔弹也飞不到
    var dummy = surf
      ? { kind: 'target', alive: true, team: 99, radius: 10, pos: M3.V(0, 0, far), vel: M3.V(0, 0, 0) }
      : { kind: 'dummy', alive: true, team: 99, pos: M3.V(0, y0, far), vel: M3.V(0, 0, 0) };
    // silent：结束时的起爆不出声（Combat.detonate 认这个标记）
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = makeMissile({ weapon: w.id, team: 98, pos: M3.V(0, y0, 0),
      fwd: M3.norm(M3.sub(dummy.pos, M3.V(0, y0, 0))), speed: EFF_LAUNCH_V, target: dummy });
    m.owner = null;
    var last = M3.clone(m.pos);
    for (var f = 0; f < EFF_MAX_FRAMES && m.alive; f++) {
      last = M3.clone(m.pos);
      stepMissile(m, 1 / 60, world);
      world.particles.length = 0;
    }
    var r = surf ? Math.sqrt(last.x * last.x + last.z * last.z) : M3.len(M3.sub(last, M3.V(0, y0, 0)));
    /* 高抛弹（loft）：远处假目标让它一路高飞、到不了俯冲段，平飞估计偏大 15% 左右。
       在 [0.6 r, r] 里对真目标二分几次，取"真的打得到"的最远距离。 */
    if (w.loft && surf) r = loftReach(w, y0, r);
    return (c[band] = Math.round(r));
  }

  /* 从**当前投放 / 发射状态**出发，弹沿发射方向能飞到的最大水平距离（米）。
     这是 5.4 发射包线的基础：和 effRange 同一份弹道代码（stepMissile），
     但初始位置、速度、方向都取本机此刻的真实值，不按高度分档。
     假目标放在发射方向水平延长线上 200 km 外、高度 targetY 处，
     弹一路追到落地 / 寿命结束，量水平位移。
     步长 1/30 s（HUD 每 0.3 s 才重算一次，精度够用）。 */
  function maxReach(w, la, targetY) {
    var fwd = la.fwd, pos = la.pos;
    var hx = fwd.x, hz = fwd.z, hl = Math.sqrt(hx * hx + hz * hz);
    if (hl < 1e-3) { hx = 0; hz = 1; hl = 1; }
    hx /= hl; hz /= hl;
    var far = 200000;
    var dummy = { kind: 'target', alive: true, team: 98, radius: 10,
      pos: M3.V(pos.x + hx * far, targetY, pos.z + hz * far), vel: M3.V(0, 0, 0) };
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = makeMissile({ weapon: w.id, team: 98, pos: pos, fwd: fwd, speed: la.speed, target: dummy });
    m.owner = null;
    var last = M3.clone(m.pos);
    for (var f = 0; f < EFF_MAX_FRAMES / 2 && m.alive; f++) {
      last = M3.clone(m.pos);
      stepMissile(m, 1 / 10, world);
      world.particles.length = 0;
    }
    var dx = last.x - pos.x, dz = last.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* 滑翔弹专用入口（向后兼容）：同 maxReach，目标在投放方向的海面上。 */
  function glideReach(w, pos, fwd, speed) {
    return maxReach(w, { pos: pos, fwd: fwd, speed: speed }, 0);
  }

  /* ============================================================
     5.4 发射包线：从当前发射状态出发，弹**追不追得到**目标

     以前 rmax / NEZ 是解析式（动力段距离 + 目标背离速度的经验系数），
     目标高度、爬升 / 俯冲的射程损耗、"掉头逃逸"都算不准。现在换成
     真实弹道：flyTo 用 stepMissile 追一个会动的目标跑一遍，命中 / 够得着
     就返回 true，再二分出 rmax（目标保持航向）与 nez（目标掉头逃逸）。

     目标和实战用同一份 stepMissile —— 改了弹道、速度、loft，包线自动跟着变。
     ============================================================ */

  /* 目标逃逸 / 巡航时的最大航速：飞机取 vMax（加力上限），舰船取航速。 */
  function targetMaxSpeed(tg) {
    if (tg.phys && tg.phys.vMax) return tg.phys.vMax;
    if (tg.speed) return tg.speed;
    return (tg.kind === 'target') ? 12 : 300;
  }

  /* 单次可达性：从 la 发射 w，追 tg（克隆，不污染原实体），flee 时目标
     每帧掉头、以最大航速背离弹逃逸。返回是否命中 / 够得着。 */
  function flyTo(w, la, tg, flee) {
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    /* 克隆目标 team 与弹同号（98）：起爆结算时会跳过同队，不触发
       game.js 注册的 hitTarget（那需要完整的 world）。这里只看"够不够得着"，
       不结算伤害。 */
    var t = { kind: tg.kind, alive: true, team: 98, radius: tg.radius || 10,
      pos: M3.clone(tg.pos), vel: tg.vel ? M3.clone(tg.vel) : M3.V(0, 0, 0) };
    if (tg.fwd) t.fwd = M3.clone(tg.fwd);
    var m = makeMissile({ weapon: w.id, team: 98, pos: M3.clone(la.pos), fwd: M3.clone(la.fwd), speed: la.speed, target: t, owner: null });
    var vMax = targetMaxSpeed(tg);
    var isAir = w.target === 'air';
    var dt = 1 / 10, simT = 0;      // 包线 / 瞄准圈估算步长（见 estDt；近炸按线段最近点，不漏判）
    /* 目标的初始水平距离：弹一旦飞过它一段距离还没命中，就追不上了（滑翔过头 /
       逃逸甩掉），可以提前退出，不必等它滑到落地或烧完寿命。 */
    var ox = t.pos.x - m.pos.x, oz = t.pos.z - m.pos.z;
    var hit = false, minD = Infinity;
    for (var f = 0; f < EFF_MAX_FRAMES && m.alive; f++) {
      dt = estDt(w, simT); simT += dt;
      if (flee) {
        /* 掉头逃逸：机头**水平**背离弹、保持高度、以最大航速跑。方向每帧重算 ——
           弹在追，目标永远往背离它的方向逃，这是"甩掉"的最坏情况。
           （不能用三维背离：那样目标会沿"爬升 / 俯冲"方向逃，爬升掉速反而逃不快。） */
        var away = M3.sub(t.pos, m.pos);
        var ah = Math.sqrt(away.x * away.x + away.z * away.z);
        if (ah > 1) {
          var dir = M3.V(away.x / ah, 0, away.z / ah);
          t.fwd = dir; t.vel = M3.mul(dir, vMax);
          t.pos = M3.add(t.pos, M3.mul(dir, vMax * dt));
        }
      } else if (t.vel) {
        t.pos = M3.add(t.pos, M3.mul(t.vel, dt));   // 保持当前航向 / 航速
      }
      stepMissile(m, dt, world);
      world.particles.length = 0;
      if (!m.alive) {
        /* 起爆（命中 / 近炸 / 寿命到 / 落地）。判它是否够得着目标：
           对空看近炸 / 直接命中距离，对面看落地时是否进了溅射半径。 */
        if (isAir) {
          hit = M3.dist(m.pos, t.pos) - Combat.radiusOf(t) < (w.fuze || Combat.CONTACT) + 5;
        } else {
          var dx = m.pos.x - t.pos.x, dz = m.pos.z - t.pos.z;
          hit = Math.sqrt(dx * dx + dz * dz) < Combat.radiusOf(t) + (w.blast || 15);
        }
        break;
      }
      /* 提前退出：弹距目标已经从最近点拉开 2.5 km —— 追不上了（目标太远、
         逃逸甩掉，或滑翔过头），后面的弹道只会越来越远。用"弹距目标"而不是
         "弹距发射点"，是因为尾追时目标也在跑，弹飞过发射方向一段距离是正常的。 */
      var dd = M3.dist(m.pos, t.pos);
      if (dd < minD) minD = dd;
      if (f > 10 && dd > minD + 2500) break;
    }
    return hit;
  }

  /* 找"最远命中距离"。pred(D) 在距离上不是单调的：loft / 滑翔弹需要一段
     距离俯冲 / 滑翔，太近反而打不中 —— 命中区间是 [近界, rmax] 的一段。
     所以在区间里先采样定位命中段的右端，再在它和相邻的失手点之间二分，
     取最远命中距离（rmax）。 */
  function bisectFar(pred, lo, hi, iters) {
    iters = iters || 3;
    if (pred(hi)) return hi;                        // 上界都够得着：rmax = 上界
    var N = 4, step = (hi - lo) / N, lastHit = -1;
    for (var i = 0; i <= N; i++) {
      var d = lo + step * i;
      if (pred(d)) lastHit = d; else if (lastHit >= 0) break;   // 命中段结束
    }
    if (lastHit < 0) return 0;                      // 全程打不中
    var l = lastHit, r = Math.min(hi, lastHit + step);
    for (var j = 0; j < iters; j++) {
      var mid = (l + r) / 2;
      if (pred(mid)) l = mid; else r = mid;
    }
    return l;
  }

  /* 发射包线：{ rmax, nez }（米，斜距，与 HUD 的 M3.dist 同单位）。la = { pos, fwd, speed }，
     tg = 目标实体。rmax = 目标保持航向能命中的最远距离，nez = 目标掉头
     逃逸仍能命中的最远距离。不夹 lockDist（锁不锁得上由 HUD / AI 各自处理）。 */
  function envelopeRange(w, la, tg) {
    /* 水平视线方向：目标高度固定 tg.pos.y，只沿水平方向缩放距离 ——
       否则目标会"穿过地面"（对地弹）或让二分在无意义的斜距上浪费。
       lo 端俯角过大丢目标由 bisectFar 的采样跳过，不在这里特判。 */
    var tox = tg.pos.x - la.pos.x, toz = tg.pos.z - la.pos.z;
    var tdl = Math.sqrt(tox * tox + toz * toz) || 1;
    var dx = tox / tdl, dz = toz / tdl;
    var dh = la.pos.y - tg.pos.y;               // 发射高度 − 目标高度（斜距换算用）
    function at(D) {
      var nt = { kind: tg.kind, radius: tg.radius || 10,
        pos: M3.V(la.pos.x + dx * D, tg.pos.y, la.pos.z + dz * D),
        vel: tg.vel ? M3.clone(tg.vel) : M3.V(0, 0, 0) };
      if (tg.fwd) nt.fwd = M3.clone(tg.fwd);
      if (tg.phys) nt.phys = tg.phys;
      if (tg.speed) nt.speed = tg.speed;
      return nt;
    }
    var hi = maxReach(w, la, tg.pos.y);         // 弹最大水平射程
    var lo = 400;                               // 最小有效射程（太近俯角过大 / 出膛还追不上）
    var rmaxFlat = bisectFar(function (D) { return flyTo(w, la, at(D), false); }, lo, hi);
    var nezFlat = bisectFar(function (D) { return flyTo(w, la, at(D), true); }, lo, rmaxFlat);
    return {
      rmax: Math.sqrt(rmaxFlat * rmaxFlat + dh * dh),
      nez: Math.sqrt(nezFlat * nezFlat + dh * dh)
    };
  }

  /* 机库 / 图鉴的"标称射程"（公里）：读 effRange（真实弹道，与 AI、HUD 同一套），
     按弹种取一个代表性的平飞发射高度 —— 对地 / 对海弹取中高空（滑翔、巡航能发挥），
     空空弹取中空。无制导弹、吊舱、定向能返回 null（不显示"射程"）。
     以前这里用 data.js 的 missileRange（速度 × 寿命的解析式），滑翔弹被严重低估。 */
  function displayRange(w) {
    if (!w || w.passive) return null;
    if (w.kind === 'dew') return null;
    if (w.unguided || !w.seeker || w.seeker === 'none') return null;
    var alt = (w.target === 'ground' || w.target === 'ship') ? 8000 : 6000;
    var r = effRange(w, alt);
    return r > 0 ? r / 1000 : null;
  }

  /* ============================================================
     5.3 第 3 条：精确制导炸弹的落点可达区域（泪滴形瞄准圈）

     精确制导炸弹（PEJ-14 之类：ballistic + fin、无 glide）弹翼只能
     横向修 + 往下压，托不住重力 —— 落点可达区域天然不对称：
       后端（最远）= 自然抛物线落点，弹翼一步都越不过去；
       前端（最近）= 弹翼全力下压的落点；
       左右     = 弹翼全力横修的落点。
     所以它是一个近窄远宽的泪滴形。HUD 把它投影到屏幕画成圈，
     "目标套进圈内 = 物理上必中"。计算必须和真实弹道（stepMissile）
     是同一套，否则圈会骗人。
     ============================================================ */

  /* 估算用的步长：包线 / 瞄准圈 / 落点标记都是"每隔一会儿才算一次"的粗估，
     取 1/10；但火箭的动力段只有零点几秒，粗步长会把推力积分漏掉几百米（实测 PEJ-6
     在 1/10 下落点差 250 m），所以动力段内细到 1/60，之后再放粗。 */
  function estDt(w, t) { return (w.burn && t < w.burn + 0.1) ? 1 / 60 : 1 / 60; }

  /* 自然落点：弹翼不修（无目标），纯抛物线落地。 */
  function naturalPoint(w, la, planeY) {
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = makeMissile({ weapon: w.id, team: 98, pos: M3.clone(la.pos), fwd: M3.clone(la.fwd), speed: la.speed, owner: null });
    for (var f = 0, tt = 0; f < EFF_MAX_FRAMES / 2 && m.alive; f++) {
      var edt = estDt(w, tt); tt += edt;
      stepMissile(m, edt, world);
      world.particles.length = 0;
      /* planeY：HUD 指定目标所在高度时按这个平面截；否则按落点处的地面高度 */
      if (m.pos.y <= (planeY != null ? planeY : groundY(m.pos.x, m.pos.z))) break;
    }
    return { x: m.pos.x, y: Math.max(m.pos.y, planeY != null ? planeY : groundY(m.pos.x, m.pos.z)), z: m.pos.z };
  }

  /* 沿水平角 φ（0 = 前方，±90° = 左右），二分求"能命中"（flyTo）的最远地面目标
     水平距离。用真实命中判定，而不是弹翼满偏落点 —— 满偏上修会把抛物线掰成平飞
     （等于偷偷滑翔），那不是精确制导炸弹的"修正范围"。 */
  function reachAtAngle(w, la, phi, hi, ty) {
    var hx = Math.sin(phi), hz = Math.cos(phi);
    function at(D) {
      return { kind: 'target', radius: 20,
        pos: M3.V(la.pos.x + hx * D, ty || 0, la.pos.z + hz * D), vel: M3.V(0, 0, 0), speed: 0 };
    }
    return bisectFar(function (D) { return flyTo(w, la, at(D), false); }, 400, hi || maxReach(w, la, ty || 0));
  }

  /* 可达区域：{ natural, points }。natural = 自然落点（弹翼不修）；
     points = 沿各水平角 flyTo 二分出的"能命中"最远地面目标 —— 用真实命中判定
     （flyTo / stepMissile 同一套），所以目标套进圈内就真的打得中。返回 null 表示
     这枚弹没有弹翼修正（不画圈）。 */
  function finFootprint(w, la, n, ty) {
    if (!w || !w.fin) return null;
    n = n || 12;
    var pts = [], hi = maxReach(w, la, ty || 0);
    for (var i = 0; i <= n; i++) {
      var phi = (i / n - 0.5) * (90 * Math.PI / 180);   // -45°..45°（前方扇区）
      var D = reachAtAngle(w, la, phi, hi, ty);
      /* 该方向"能命中"距离 < 最小射程（弹翼横修不到那么侧）：跳过，不画进圈。 */
      if (D <= 400) continue;
      var hx = Math.sin(phi), hz = Math.cos(phi);
      pts.push({ x: la.pos.x + hx * D, z: la.pos.z + hz * D });
    }
    return { natural: naturalPoint(w, la, ty), points: pts };
  }

  function hitsAt(w, y0, D) {
    // 与弹同队：起爆照常判，但不结算伤害（不会碰到 game.js 的 hitTarget）
    var tg = { kind: 'target', alive: true, team: 98, radius: 10, pos: M3.V(0, 0, D), vel: M3.V(0, 0, 0) };
    var world = { time: 0, actors: [], targets: [], missiles: [], particles: [], bullets: [], silent: true };
    var m = makeMissile({ weapon: w.id, team: 98, pos: M3.V(0, y0, 0),
      fwd: M3.norm(M3.sub(tg.pos, M3.V(0, y0, 0))), speed: EFF_LAUNCH_V, target: tg });
    for (var f = 0; f < EFF_MAX_FRAMES && m.alive; f++) { stepMissile(m, 1 / 60, world); world.particles.length = 0; }
    return M3.dist(m.pos, tg.pos) < tg.radius + 15;
  }
  function loftReach(w, y0, r0) {
    var lo = r0 * 0.6, hi = r0;
    if (hitsAt(w, y0, hi)) return hi;
    for (var i = 0; i < 7; i++) {
      var mid = (lo + hi) / 2;
      if (hitsAt(w, y0, mid)) lo = mid; else hi = mid;
    }
    return lo;
  }

  /* 发射时的离轴角（玩家锁定、AI 开火、航线 strike 共用）。

     对空弹：机头与视线的三维夹角 —— 导引头在机头上。
     对面弹：只量**水平方位**，世界坐标的垂直方向不算。飞机保持高度飞，
     地面 / 海面目标在机头下方几十度是常态；俯冲是弹自己的事。 */
  function lockOff(a, t, w) {
    var to = M3.sub(t.pos, a.pos);
    if (w && (w.target === 'ground' || w.target === 'ship')) {
      var hx = to.x, hz = to.z, fx = a.fwd.x, fz = a.fwd.z;
      var hl = Math.sqrt(hx * hx + hz * hz), fl = Math.sqrt(fx * fx + fz * fz);
      if (hl < 1 || fl < 1e-3) return 0;          // 正上方 / 机头垂直：方位无从谈起，不拦
      return Math.acos(M3.clamp((hx * fx + hz * fz) / (hl * fl), -1, 1));
    }
    var d = M3.len(to);
    return d > 1 ? M3.angleBetween(a.fwd, M3.mul(to, 1 / d)) : 0;
  }

  /* AI 用的射程：min(锁定距离, 有效射程)。rangeK 留余量（目标在动、不一定正对着飞）。 */
  var AI_RANGE_K = 0.9;
  function aiReach(w, alt, k) {
    if (!w) return 0;
    var L = w.lockDist || Infinity;      // 无制导弹没有 lockDist：只看飞得到多远
    if (!w.vsLife) return w.lockDist || 0;
    return Math.min(L, effRange(w, alt) * (k === undefined ? AI_RANGE_K : k));
  }

  /** 动力段时长。冲压弹随空气密度连续变化（阶段 5.1）：
      10–16 km 效率最好；往上推力逐渐不足，16 km → 26 km 平滑降到 24%；
      往下推力足但阻力大、烧得更快，海平面只有 80% 的有效燃烧时间。 */
  function effectiveLife(w, y) {
    if (!w.scramjet) return w.life;
    var k;
    if (y >= 16000) {
      var u = M3.clamp((y - 16000) / 10000, 0, 1);
      k = 1 - 0.76 * u * u * (3 - 2 * u);
    } else if (y < 10000) {
      k = 0.8 + 0.2 * M3.clamp(y / 10000, 0, 1);
    } else {
      k = 1;
    }
    return Math.max(1.2, w.life * k);
  }

  /* ============================================================
     反辐射：谁"正在辐射"
     ============================================================ */
  /* 反辐射弹的判据（`w.antiRadar`）。

     这个字段曾经被从 SPO-8 上删掉过，理由写得很实在：全项目没有任何
     地方读它，世界里既没有"雷达开机状态"、也没有预警机 ——
     一枚只有文案的反辐射弹，实际表现和普通雷达弹毫无区别。

     现在两样都有了：预警机（`aewc`）会一直辐射到被压哑为止，
     干扰机在开机期间辐射，而 EMCON-Δ 是真的把雷达关掉了。
     所以这条语义可以落地了。 */
  /* ============================================================
     被压制时还看不看得见、锁不锁得上（玩家一侧）

     `p.suppressed`（game.js 的 updateJamming，0..1）压的是雷达和数据链。
     丢的是远处的信息：压制强度决定"看得清"能到多远，距离决定闪成什么样。

       d ≤ clearR(s)                 clear    —— 目标框正常
       clearR(s) < d < hideR(s)      flicker  —— 闪烁，越远亮的时间越短
       d ≥ hideR(s)                  hidden   —— 目标框消失

       clearR = max(JAM_BURN_R, JAM_CLEAR0 × (1 − s))      压得越重越近；烧穿距离保底
       hideR  = clearR + max(JAM_FADE_MIN, JAM_FADE0 × (1 − s))

     **只有 clear 的目标能被锁定、能进 F 键候选**；已有的锁定一旦
     变成 flicker / hidden 就被强制取消（game.js 的 updateLock）。
     HUD、锁定、选目标三处都读这里，口径不会对不上。
     友军标记同样受影响，而且看的是**两头**：友机自己在压制场里，
     它报给你的数据链位置也一样会断 —— 取 max(你的 s, 它的 s)（jamPress）。

     AI（友军和敌军都一样）锁目标读 jamLockOK + jamLockK：被压制的飞机
     只能对自己 clearR 以内的目标开火，锁定距离最多减半，开火也更犹豫
     （ai.js 的 fireAtTarget）。AI 没有目标框，闪烁那一段不用管。

     舰船 / 地面设施（kind 'target'）两头都打折：雷达功率大、回波强、
     有多套传感器，比战斗机难压得多。
       它们自己受的压制   updateJamming 里就 × JAM_SURF_K
       玩家看它们         压制 × JAM_SURF_K
       两头的烧穿距离     JAM_BURN_SURF（比飞机远）
     ============================================================ */
  var JAM_MIN = 0.05;            // 低于它当作没被压制
  var JAM_BURN_R = 1800;         // 烧穿距离：再重的压制，这么近也看得清
  var JAM_CLEAR0 = 16000;        // s → 0 时"看得清"的距离
  var JAM_FADE0 = 10000;         // s → 0 时闪烁带的宽度
  var JAM_FADE_MIN = 1500;       // 闪烁带最窄也有这么宽 —— 不会一下子从正常跳到消失
  var JAM_SURF_K = 0.5;          // 舰船 / 地面设施：压制打对折
  var JAM_BURN_SURF = 4500;      // 舰船 / 地面设施的烧穿距离
  function jamRanges(s, surf) {
    var clearR = Math.max(surf ? JAM_BURN_SURF : JAM_BURN_R, JAM_CLEAR0 * (1 - s));
    return { clear: clearR, hide: clearR + Math.max(JAM_FADE_MIN, JAM_FADE0 * (1 - s)) };
  }
  /* 亮的时间占比：clear 为 1，hidden 为 0，闪烁带里随距离线性掉到 0 */
  function jamPress(p, e) {
    var s = (p && p.suppressed) || 0;
    if (e && p && e.team === p.team) s = Math.max(s, e.suppressed || 0);
    return s;
  }
  function jamDuty(p, e) {
    if (!p || !e) return 1;
    var surf = e.kind === 'target';
    var s = jamPress(p, e) * (surf ? JAM_SURF_K : 1);
    if (s < JAM_MIN) return 1;
    var r = jamRanges(s, surf), d = M3.dist(p.pos, e.pos);
    if (d <= r.clear) return 1;
    if (d >= r.hide) return 0;
    return 1 - (d - r.clear) / (r.hide - r.clear);
  }
  function jamState(p, e) {
    var k = jamDuty(p, e);
    return k >= 1 ? 'clear' : (k <= 0 ? 'hidden' : 'flicker');
  }
  /* 被压制的一方还能不能锁这个目标：在 clearR 以内才行。玩家和 AI 共用。 */
  function jamLockOK(viewer, e) {
    var s = (viewer && viewer.suppressed) || 0;
    if (s < JAM_MIN || !e) return true;
    var surf = viewer.kind === 'target' || e.kind === 'target';
    return M3.dist(viewer.pos, e.pos) <= jamRanges(s, surf).clear;
  }
  /* 锁定距离与锁定速度的折扣：最多减半 */
  function jamLockK(viewer) {
    return 1 - 0.5 * ((viewer && viewer.suppressed) || 0);
  }

  /* 这一帧画不画。每个目标自己的相位（确定性，不用 Math.random —— 否则框会逐帧乱跳）。 */
  var jamSeq = 0;
  function jamShown(p, e, time) {
    var k = jamDuty(p, e);
    if (k >= 1) return true;
    if (k <= 0) return false;
    if (e.jamPhase === undefined) e.jamPhase = ((jamSeq++) * 0.618034) % 1;
    return ((time * 1.7 + e.jamPhase) % 1) < k;
  }

  function isRadiating(e) {
    if (!e || !e.alive) return false;
    if (e.aewc) return !e.aewcJammed;     // 预警机：被压哑就不再是辐射源
    if (e.ewPower > 0) return true;       // 干扰机 / 开机的电子战吊舱
    if (e.emcon) return false;            // 电磁静默：雷达关机
    return false;                         // 普通战斗机不构成反辐射目标
  }

  /* ============================================================
     加固目标与战斗部

     `HARD_MODELS`（data.js）列出哪些设施模型是**加固**的。对它们：
       penetrator（GUT-12）   全额伤害 —— 侵彻战斗部就是为这个造的
       cluster（子母 / 集束）  只剩 HARD_CLUSTER_K —— 破片啃不开混凝土
       其他战斗部              HARD_K
     ============================================================ */
  var HARD_K = 0.6, HARD_CLUSTER_K = 0.2;
  function isHard(t) {
    return !!(t && t.kind === 'target' &&
      (t.hard || (typeof HARD_MODELS !== 'undefined' && HARD_MODELS[t.model])));
  }
  function warheadK(w, t) {
    if (!w || !isHard(t)) return 1;
    if (w.penetrator) return 1;
    return w.cluster ? HARD_CLUSTER_K : HARD_K;
  }

  /* 对设施 / 舰船结算伤害。game.js 会通过 setTargetHitHandler 注册它的
     hitTarget（击毁计数、无线电、误击调节单元的处罚都在那里）；
     没注册时（工具脚本里）退回最小实现。 */
  var targetHitHandler = null;
  function setTargetHitHandler(fn) { targetHitHandler = fn; }
  function hitSurface(tg, dmg, world, source) {
    if (!tg.alive) return;
    if (targetHitHandler) { targetHitHandler(tg, dmg, source); return; }
    tg.hp -= dmg;
    if (tg.hp <= 0) killGround(tg, world);
  }
  /* 机炮抗性系数：小口径航炮弹（bullet 且 cal ≤ SMALL_CAL）打在 ent 上的伤害倍率。
     导弹、炸弹、大口径炮弹不受影响 —— 抗性模拟的是"弹丸太小、对方太大太结实"。
     上限 0.999：再硬的东西也不该是完全无敌的。数值表见 data.js GUN_RESIST_MODELS。 */
  var SMALL_CAL = 40;
  function gunResistK(ent, shot) {
    if (!shot || shot.kind !== 'bullet' || (shot.cal || 0) > SMALL_CAL) return 1;
    return 1 - M3.clamp(ent.gunResist || 0, 0, 0.999);
  }

  function hitAny(e, dmg, world, source) {
    if (e.kind === 'target') hitSurface(e, dmg, world, source);
    else damage(e, dmg, world, source);
  }

  /* 近炸 / 撞上的判定：在**最近的那一刻**起爆。

     每帧量一次"弹相对目标"的位置，上一帧到这一帧连成一条线段，
     求线段上离原点最近的那一点 —— 700 m/s 的弹一帧走 12 m，
     只看端点会从目标身边穿过去而判不到。

       最近点距目标表面 < CONTACT          直接撞上，当帧起爆，满伤
       < fuze，且最近点落在本帧内           相对距离已由减转增：在最近点起爆
       否则                                 记下这一帧，下一帧再看

     起爆点放在"目标当前位置 + 最近点的相对位置"：这样 blast 量到的
     弹目距离正好就是最近点距离。 */
  function fuzeCheck(m, t, world) {
    var rel1 = M3.sub(m.pos, t.pos);
    var rel0 = (m.fuzeRef === t && m.fuzeRel) ? m.fuzeRel : null;
    m.fuzeRel = rel1; m.fuzeRef = t;
    if (!rel0) return false;
    var d = M3.sub(rel1, rel0);
    var dd = M3.dot(d, d);
    var s = dd > 1e-9 ? M3.clamp(-M3.dot(rel0, d) / dd, 0, 1) : 1;
    var cp = M3.add(rel0, M3.mul(d, s));
    var r = t.kind === 'decoy' ? DECOY_R : Combat.radiusOf(t);
    var gap = M3.len(cp) - r;
    var isDecoy = t.kind === 'decoy';
    if (gap < Combat.CONTACT) {
      Combat.detonate(m, world, M3.add(t.pos, cp), isDecoy ? null : t);
      return true;
    }
    if (m.fuze > 0 && gap < m.fuze && s < 1) {
      Combat.detonate(m, world, M3.add(t.pos, cp), null);
      return true;
    }
    return false;
  }

  /* 盲飞期内追的那团诱饵云：外推位置 p + v × (age − t0)。
     云熄灭了、或者盲飞期已经结束（重新搜索 / 咬回真目标）就不再追。 */
  var DECOY_R = 4;
  function decoyTarget(m) {
    var dc = m.decoy;
    if (!dc || m.reLockT <= 0 || m.w.unguided) return null;
    var tau = m.age - dc.t0;
    if (tau < 0 || tau > DECOY_LIFE) return null;
    if (!dc.ent) dc.ent = { kind: 'decoy', alive: true, pos: dc.p, vel: dc.v };
    dc.ent.pos = M3.add(dc.p, M3.mul(dc.v, tau));
    return dc.ent;
  }

  /* 兼容入口：t 是直接命中的单位（可为空）。所有起爆都走 Combat.detonate。 */
  function detonate(m, t, world) {
    Combat.detonate(m, world, null, t || null);
  }

  /* 弹体结束：hit = 撞上了东西。寿命到期也会起爆（Combat.blast） —— 以前是哑弹。 */
  function killMissile(m, world, hit) {
    if (!m.alive) return;
    if (world) { Combat.detonate(m, world, null, null); return; }
    m.alive = false;
  }

  /** 干扰弹：尝试把追踪本机的红外弹骗走 */
  function breakLock(a, world) {
    if (a.flares <= 0 || a.flareCd > 0) return false;
    a.flares--;                      // 单位是"组"，一次投放一组诱饵
    /* 投放节奏。

       原来是 0.12 s —— 那等于"按住 V 就以每秒八组的速度连续丢"，
       而 `flares` 有 80 组：一枚已经咬住你的弹会在眨眼之间被
       反复掷骰，直到骗中为止。这既不像真的诱饵，也让来袭导弹
       失去了威胁。

       现在按**一次投放一次判定**来配节奏：
       0.45 s 的间隔给出一段可感知的"投放—观察—再投"的循环，
       而下面的抗欺骗机制保证这不会退化成"连点必脱锁"。 */
    a.flareCd = 0.45;
    SFX.flare();

    var i;
    /* 热焰弹：橙黄色，烧得亮、掉得快。

       初速必须有一个明确的**向机体下方**的分量。原来只有
       "载机速度 ×0.35 + 随机方向"，而相机就在飞机正后方，
       于是整团火被机速带着往前、直接糊在镜头上。
       现在继承的机速比例降到 0.22，再沿机体下方抛出去 ——
       视觉上就是真正"投"下去的一组火球。 */
    for (i = 0; i < 6; i++) {
      var dir = randUnit();
      var v = M3.add(M3.mul(a.vel, 0.22), M3.mul(dir, M3.rnd(26, 62)));
      v = M3.add(v, M3.mul(a.up, -M3.rnd(42, 78)));
      spawnParticle(world.particles, M3.add(a.pos, M3.mul(a.fwd, -6)), v,
        M3.rnd(1.1, 1.9), 0.85, '#ffd070', { grow: true, drag: 0.5, grav: 0.6 });
    }
    /* 箔丝（chaff）：淡白色的金属丝云，散得更开、下落更慢、停留更久。
       现代干扰弹是热焰弹与箔丝一起投放的 —— 前者骗红外，后者骗雷达，
       所以视觉上也该是两种东西，而不是一团橙色火光。

       尺寸比热焰弹小得多：它是丝，不是火球。上一轮把热焰弹从 2.2 缩到
       0.85 时漏掉了这里（1.25），结果丝团看着比火球还大。 */
    for (i = 0; i < 14; i++) {
      var cd2 = randUnit();
      var v2 = M3.add(M3.mul(a.vel, 0.28), M3.mul(cd2, M3.rnd(14, 44)));
      v2 = M3.add(v2, M3.mul(a.up, -M3.rnd(24, 48)));
      spawnParticle(world.particles, M3.add(a.pos, M3.mul(a.fwd, -5.5)), v2,
        M3.rnd(2.0, 3.2), 0.42, '#e6eef4', { drag: 1.15, grav: 0.10 });
    }

    var broke = 0, ineffective = 0;
    for (i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.target !== a) continue;

      /* 干扰弹是**热焰弹 + 箔丝**一起投放的：
         前者骗红外导引头，后者骗雷达导引头 —— 两种都能被干扰。

         早先这里写的是"雷达制导不吃干扰弹"，那句话是错的，
         等于把箔丝当成了不存在的东西。

         **flare 字段本身就是"被干扰的概率"**：越小越难骗。
         这一点也曾经被理解反过 —— 公式写成 1 − flare·k，等于把
         「抗干扰改型」TOR-4（flare 0.24，全表最低）变成了最容易
         被骗的那一枚。数据一直是对的，是公式错了。

         现在按**导引头**分流，因为两种干扰弹骗的不是同一种东西：

             ir         → flare      热焰弹
             radar      → flareRD    箔丝（缺省回退 flare）
             eo / laser → 0          成像导引头，两种都骗不到

         `flareRD` 是一张补丁表（见 data.js 的 FLARE_RD）。它修的是
         设定 8.3 里那句"雷达导引头有多普勒滤波，能滤掉静止的箔丝回波，
         所以雷达弹整体比红外弹难骗"—— 在那张表出现之前，flare 值是
         逐个手调的、没有按导引头排序，于是**雷达弹反而平均更好骗**。
         数值现状与那句设定的矛盾到此为止。 */
      var chance;
      if (m.w.seeker === 'radar') {
        chance = m.w.flareRD !== undefined ? m.w.flareRD : m.w.flare;
      } else if (m.w.seeker === 'eo' || m.w.seeker === 'laser') {
        chance = 0;
      } else {
        chance = m.w.flare;
      }

      /* ---- 抗欺骗：同一枚弹，第二次投放就明显更难骗 ----

         只按 `flare` 掷一次骰的话，80 组诱饵在 0.12 s 的间隔下
         等于"必脱锁" —— 玩家连点几组就能把任何导弹打发掉，
         而诱饵本来应该是**争取一次脱离机会**的东西。

         所以每一枚弹记下自己被投过几次诱饵（`decoyTries`），
         每投一次成功率乘 0.62：一枚 65% 的弹依次是
         65% → 40% → 25% → 15%…… 要么第一两组就成功，
         要么就得靠机动而不是靠继续丢。

         这个计数器**不会因为一次成功而清零**：导引头一旦学会了
         这架飞机丢诱饵的方式，重捕获之后它不会再被骗第二次。 */
      m.decoyTries = (m.decoyTries || 0) + 1;
      var k = Math.pow(0.62, m.decoyTries - 1);
      // 地板：永远留一点希望，但不让"连投"变成必胜
      // （chance 为 0 的 —— 光电 / 激光制导 —— 不设地板，否则"完全免疫"其实有 3% 会被骗）
      chance = chance > 0 ? Math.max(0.03, chance * k) : 0;
      if (!(Math.random() < chance)) {
        if (!m.spoofed) ineffective++;      // 已经被骗过的弹不再重复报
        continue;
      }

      /* 双导引头（BIN-9）：这一组只骗掉了其中一个，另一个还咬着。
         下一组再骗中才真正脱锁 —— 而那一组同样吃上面的抗欺骗递减。 */
      if (m.seekers > 1) {
        m.seekers--;
        ineffective++;
        continue;
      }

      m.target = null;
      m.seekerOn = false;
      m.lostTime = 1;
      /* 盲飞一段时间再允许重捕获 —— **不要**再用 reDone 兼职：
         那一位置同时被 `reAcquire`（雷达弹）和"刚被骗过"两种语义共用，
         结果一次诱饵就永久关掉了这枚弹的重捕获。见 makeMissile 的注释。 */
      m.reLockT = 1.4;
      m.spoofed = a;        // 记住是谁骗的：重捕获时优先避开它
      /* 骗走它的那一团诱饵云。它跟着载机的 0.22 倍速度往后、往下飘，
         亮 DECOY_LIFE 秒。盲飞期结束时它要是还亮着、还在视场里，
         没有记忆的导引头有一半原概率**再咬回这团云**（见 decoyRecheck）；
         带 decoyMemory 的（CLA-4）认得它，直接略过。 */
      m.decoy = {
        p: M3.clone(a.pos),
        v: M3.add(M3.mul(a.vel, 0.22), M3.mul(a.up, -40)),
        t0: m.age,
        p2: chance * 0.5,
        done: false
      };
      broke++;
    }
    /* 把"这组诱饵没起作用"告诉上层（玩家 HUD / 无线电）。
       返回值仍然表示**投放动作是否发生**，与命中数无关。 */
    a.decoysIneffective = ineffective;
    a.decoysBroke = broke;
    return true;
  }

  /* ============================================================
     机炮
     ============================================================ */

  /* 标准正态样本（Box–Muller）。
     一次算出两个，第二个存着下次用 —— 机炮每秒要抽两百多个数，
     不值得为它每发建一个数组。 */
  var gaussSpare = null;
  function gauss() {
    if (gaussSpare !== null) { var v = gaussSpare; gaussSpare = null; return v; }
    var u = Math.random();
    if (u < 1e-12) u = 1e-12;
    var r = Math.sqrt(-2 * Math.log(u));
    var ang = Math.PI * 2 * Math.random();
    gaussSpare = r * Math.sin(ang);
    return r * Math.cos(ang);
  }

  /* 生成一发炮弹 / 子弹 —— 机炮、炮塔都走这里（2-0IMPL 3.1）。
     shooter  开火的单位（飞机或舰船，取 team / vel / owner）
     w        炮的武器数据：speed / dmg / cal / range，可选
                gravity  重力倍率（缺省 1）
                fuze / blast / blastCore  近炸引信与爆炸半径 —— 写了才会近炸 / 起爆，
                                          没写（航空机炮）就只有直接命中
     muzzle   炮口世界坐标；dir 单位方向（已含散布）
     opt      { life }：缺省 range / speed
     炮弹的武器数据挂在 b.gw，不挂 b.w：b.w 会让 warheadK 把普通机炮也当成战斗部打折。
     起爆时 Combat.detonate 要读 shot.w，见 detonateShell。 */
  function fireGunFrom(shooter, w, muzzle, dir, world, opt) {
    var life = (opt && opt.life) || Ballistics.life(w);
    var base = shooter.vel || M3.V(0, 0, 0);
    var b = {
      kind: 'bullet', team: shooter.team, alive: true,
      pos: M3.clone(muzzle), prev: M3.clone(muzzle),
      vel: M3.add(M3.mul(dir, w.speed), base),
      dmg: w.dmg, cal: w.cal || 0, life: life, owner: shooter,
      gw: w, grav: w.gravity === undefined ? 1 : w.gravity, drag: w.drag || 0,
      fuze: w.fuze || 0, blast: w.blast || 0
    };
    world.bullets.push(b);
    return b;
  }

  /* 带战斗部的炮弹起爆：直接命中 / 近炸 / 寿命到点空爆 / 落地，都走 Combat.detonate */
  function detonateShell(b, world, pos, direct, opt) {
    b.w = b.gw;
    Combat.detonate(b, world, pos, direct || null, opt);
  }

  /* 近炸：本帧弹道线段离某架敌机的最近距离小于 fuze 就在最近点起爆。
     只查飞机（炮弹对空才用近炸；打舰船靠直接命中）。 */
  function shellFuze(b, world) {
    if (!b.alive || !(b.fuze > 0)) return false;
    var p0 = b.prev, d = M3.sub(b.pos, p0), dd = M3.dot(d, d);
    var acts = world.actors, R = Combat.HIT_R_AIR;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a.alive || a.team === b.team) continue;
      var rel = M3.sub(a.pos, p0);
      var s = dd > 1e-9 ? M3.clamp(M3.dot(rel, d) / dd, 0, 1) : 0;
      var cp = M3.add(p0, M3.mul(d, s));
      if (M3.dist(cp, a.pos) - R < b.fuze) { detonateShell(b, world, cp, null); return true; }
    }
    return false;
  }

  /* 机炮提前量：用真实弹道（Ballistics.step，与 fireGunFrom 同一套：载机速度叠加、重力、
     阻力）反解"机头该指向哪"。HUD 预测点和 AI 都应该读这个，而不是 距离 / 初速 的直线估算
     （那会漏掉载机速度、重力下坠和阻力）。
     迭代：猜方向 → 模拟弹到目标的最近接近点 → 按脱靶量修正方向（几次就收敛）。
     返回 { dir, tof, miss }；tof = 弹到最近接近点的时间。 */
  function gunLead(gw, P, base, tPos, tVel, maxT) {
    var speed = gw.speed, grav = gw.gravity === undefined ? 1 : gw.gravity;
    var to = M3.sub(tPos, P), d0 = M3.len(to) || 1;
    var tof = d0 / speed, dir = M3.norm(to), miss = Infinity;
    var tMax = maxT || Math.min(8, d0 / speed * 2 + 0.5);
    for (var it = 0; it < 12; it++) {
      var b = { pos: M3.clone(P), vel: M3.add(M3.mul(dir, speed), base), grav: grav, drag: gw.drag || 0 };
      var dt = 1 / 60, best = Infinity, bestT = 0, bestMiss = null, prevRel = M3.sub(tPos, P);
      for (var t = 0; t < tMax; t += dt) {
        Ballistics.step(b, dt);
        var rel = M3.sub(M3.add(tPos, M3.mul(tVel, t + dt)), b.pos);
        /* 一帧里弹相对目标走 20 m 以上：只比采样点会有量化误差，按线段取最近点 */
        var seg = M3.sub(rel, prevRel), sl = M3.dot(seg, seg);
        var u = sl > 1e-9 ? M3.clamp(-M3.dot(prevRel, seg) / sl, 0, 1) : 0;
        var cm = M3.add(prevRel, M3.mul(seg, u)), dd = M3.len(cm);
        if (dd < best) { best = dd; bestT = t + dt * u; bestMiss = cm; }
        else if (dd > best + 50) break;           // 已经飞过最近点
        prevRel = rel;
      }
      miss = best; tof = bestT;
      if (best < 0.5 || !bestMiss) break;
      /* 脱靶量 → 方向修正：把"目标未来点 − 弹到点"折成角度，叠到瞄准点上 */
      var aimPt = M3.add(M3.add(P, M3.mul(dir, d0)), bestMiss);
      dir = M3.norm(M3.sub(aimPt, P));
    }
    return { dir: dir, tof: tof, miss: miss };
  }

  function fireGun(a, world) {
    if (!a.alive || a.gunAmmo <= 0) return;
    var w = WEAPONS[a.gun];
    var rps = w.rpm / 60;
    if (a.gunTimer > 0) return;          // 由射速节流
    a.gunTimer = 1 / rps;
    var n = Math.max(1, Math.round(rps * 0.033));
    if (n > a.gunAmmo) n = a.gunAmmo;
    a.gunAmmo -= n;
    if (a.isPlayer && world) world.gunRounds = (world.gunRounds || 0) + n;

    /* 子弹寿命由**射程**算出，而不是写死 2.2 秒。

       以前两者是脱节的：数据里写着 range 1600 / highRange 2600，
       但子弹固定飞 2.2 秒，实际射程完全由 speed × 2.2 决定（约 2400 米）。
       于是 CEL-3「18 公里以上有效射程翻倍」这条设定从未生效，
       连它的基础射程 1600 也是假的 —— 那两个字段只有一个用处：
       让 AI 判断该在多远开火。

       现在 life = 射程 / 初速，并且 18 公里以上改用 highRange：
       高空空气稀薄、弹道平直，同样的弹药确实能打得更远。 */
    var gunRange = (a.pos.y > 18000 && w.highRange) ? w.highRange : (w.range || 1600);
    var bulletLife = gunRange / Math.max(1, w.speed);

    for (var i = 0; i < n; i++) {
      /* ---- 炮口散布 ----

         垂直于炮口轴的两个方向**各取一个独立的高斯样本**，
         标准差就是 w.spread（弧度）。合起来是一个圆形的角散布锥。

         以前是每轴取一个均匀随机数再归一化：那样"最外圈"和"正中心"
         的弹一样密，靶纸上是一个空心方块。高斯 → 半径是瑞利分布，
         中心密、边缘稀，才是实弹靶纸的样子。

         为什么做成锥形（散布随距离线性放大）：真枪的散布本来就是
         角度量，而这个形状正好给出想要的平衡 ——
         一千米以内 1σ 只有两三米，机炮还是精确武器；
         到最大射程它长成一片，打不打得中变成概率。
         远距离那一片不靠单发精度，靠**射速**兜住：CEL-3 每秒一百多发，
         即便最大射程上只有三成落靶，每秒仍有四十多发命中。
         数值、算式与"射速兜底"的余量见 docs/systems/weapons.md「机炮散布」。 */
      var dir = M3.norm(M3.add(a.fwd, M3.add(
        M3.mul(a.right, gauss() * w.spread),
        M3.mul(a.up, gauss() * w.spread))));
      /* 左右炮口交替。以前用 i % 2，而每轮通常只出 1 发 → 永远是左炮口，
         火光却画在右边，看上去子弹和火光不是一个地方出来的。
         现在按"发"轮换（a.gunSide 跨轮保留），火光跟着同一个点走。 */
      a.gunSide = a.gunSide ? 0 : 1;
      var b = fireGunFrom(a, w, gunMuzzle(a, a.gunSide), dir, world, { life: bulletLife });
      b.side = a.gunSide;           // 哪一侧炮口：曳光尾巴接回当前炮口，见 game.js drawTracers
    }

    /* 炮口火光：只记"正在开火"，真正的画法在 flashRings。
       以前每轮在炮口生成一对粒子、靠它们沿航迹漂开形成残影 ——
       可每一圈的出生时刻受帧率和射速节流的取整影响，位置和年龄都不齐，
       拖出来的是一串大小不一、间距忽大忽小的圆。 */
    a.gunFlashT = 0.05;
    a.gunFlashBoth = n >= 2;
  }

  /* 炮口火光的残影：每帧按**固定间距**沿机身向后排一串圆，
     越往后越大、越淡。它们挂在飞机上（按机体坐标算），
     所以无论帧率、射速、机动如何，间距永远均匀。
     只在本帧画一次（不进 world.particles），停火后 0.05 s 内消失。 */
  var FLASH_RINGS = 10;          // 圈数
  var FLASH_STEP = 0.22;         // 相邻两圈的间距（米）
  function flashRings(world) {
    var out = [];
    var acts = world.actors;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a.gunFlashT || a.gunFlashT <= 0) continue;
      if (!a.alive) continue;
      var sides = a.gunFlashBoth ? [0, 1] : [a.gunSide];
      for (var si = 0; si < sides.length; si++) {
        var mz = gunMuzzle(a, sides[si]);
        // 炮口白芯
        // 炮口白芯 —— 最亮的一点必须在炮口上，曳光也从这里接出去
        out.push({ pos: mz, size: 0.30, color: '#fff6d8', alive: true, life: 1, life0: 1, alpha: 0.95 });
        for (var k = 0; k < FLASH_RINGS; k++) {
          var t = k / (FLASH_RINGS - 1);
          out.push({
            pos: M3.add(mz, M3.mul(a.fwd, -k * FLASH_STEP)),
            size: 0.30 + 0.32 * t,
            color: '#ffd070', alive: true, life: 1, life0: 1,
            /* 加色混合下相邻几圈会叠在一起，单圈要淡：
               以前 0.44 起步，叠出来最亮的反而是炮口后面一截 */
            alpha: 0.20 * (1 - t) + 0.02
          });
        }
      }
    }
    return out;
  }

  /* 炮口位置（side 0 = 左，1 = 右）。子弹出膛与火光共用这一份。 */
  /* 模型上画了炮管的机型，按炮管口的机体坐标 [|x|, y, z] 出膛。
     G-6 的 CEL-7 两根炮管在机头下方 (±0.28, -0.78, 10.2)，
     以前统一用"机头前 6 m、左右 0.7 m"，火光和弹道都落在机身里面。 */
  var GUN_MUZZLE = { booby: [0.28, -0.78, 10.2] };
  function gunMuzzle(a, side) {
    var g = GUN_MUZZLE[a.model];
    if (g) {
      return M3.add(a.pos, M3.add(M3.mul(a.right, side ? g[0] : -g[0]),
        M3.add(M3.mul(a.up, g[1]), M3.mul(a.fwd, g[2]))));
    }
    return M3.add(a.pos, M3.add(M3.mul(a.fwd, 6), M3.mul(a.right, side ? 0.7 : -0.7)));
  }

  function stepBullet(b, dt, world) {
    if (!b.alive) return;
    // 保留上一帧位置，渲染曳光弹时用它画线段。
    // M3.add 返回新对象，所以这里的引用不会被下一步覆盖。
    b.prev = b.pos;
    Ballistics.step(b, dt);
    b.steps = (b.steps || 0) + 1;      // 走了几帧：drawTracers 只让第一帧的曳光接回炮口
    b.life -= dt;
    var bgy = groundY(b.pos.x, b.pos.z);
    if (b.life <= 0 || b.pos.y <= bgy) {
      /* 带战斗部的炮弹：落水就地起爆，寿命到点在空中自毁（对空射击时天上一团团的烟） */
      if (b.blast > 0 && world) {
        var gnd = b.pos.y <= bgy;
        if (gnd) b.pos.y = bgy;
        detonateShell(b, world, null, null, { ground: gnd });
      } else b.alive = false;
    }
  }

  /* ============================================================
     粒子
     ============================================================ */
  function spawnParticle(list, pos, vel, life, size, color, opt) {
    opt = opt || {};
    list.push({
      pos: M3.clone(pos),
      vel: M3.clone(vel),
      life: life, life0: life,
      size: size, color: color, alive: true,
      /* minPx：屏幕上至少这么多像素（半径）。炮口焰、空爆闪光要在几公里外也看得见，
         game.js 每帧按到相机的距离把 size 撑到这个下限（size0 是原值） */
      size0: size, minPx: opt.minPx || 0,
      grow: !!opt.grow, alpha: opt.alpha === undefined ? 1 : opt.alpha,
      drag: opt.drag || 0, grav: opt.grav || 0,
      /* streak：按速度拉成短线（破片）；delay：先隐身这么多秒再开始（子母弹错开起爆） */
      streak: !!opt.streak, delay: opt.delay || 0
    });
  }

  /* ============================================================
     舰尾螺旋桨水花（2-0IMPL 4.8）—— 纯演出

     每根轴每秒发 WAKE_RATE × (航速 / 最大航速) 个白色水花粒子，
     出生在螺旋桨后方 2–4 m 的水面上，往上溅一点再被重力拉回去，
     随寿命放大、淡出 —— 连起来是一条从舰尾往后拖开的翻腾白带。
     螺旋桨位置：SHIPS[].props（模型局部坐标 { x, z }），没写的按 dim 推导：
       舰尾 −len/2 × 0.92；船长 60 m 以上双轴（左右 beam × 0.18），以下单轴。
     转弯时外侧那根轴 ×1.3；航速 < 2 m/s 不发；离玩家 3 km 外减半、6 km 外不画；
     全场粒子太多（> WAKE_CAP）时停发，给爆炸特效让路。
     ============================================================ */
  var WAKE_RATE = 30, WAKE_CAP = 500, KNOT = 0.5144;
  function shipProps(s) {
    if (s.props) return s.props;
    var len = s.dim ? s.dim[0] : 100, beam = s.dim ? s.dim[1] : 12;
    var z = -len / 2 * 0.92;
    s.props = len >= 60 ? [{ x: -beam * 0.18, z: z }, { x: beam * 0.18, z: z }] : [{ x: 0, z: z }];
    return s.props;
  }
  function wakeSpray(t, world, dt) {
    var s = t.ship;
    if (!s || !t.alive || !t.vel || !world.particles) return;
    var spd = Math.sqrt(t.vel.x * t.vel.x + t.vel.z * t.vel.z);
    if (spd < 2 || world.particles.length > WAKE_CAP) return;
    var lod = 1, pl = world.player;
    if (pl) {
      var dp = M3.dist(pl.pos, t.pos);
      if (dp > 6000) return;
      if (dp > 3000) lod = 0.5;
    }
    var f = t.fwd || M3.norm(t.vel);
    var fh = M3.norm(M3.V(f.x, 0, f.z));
    var r = M3.V(fh.z, 0, -fh.x);                         // 右舷（与炮塔的 hostBasis 同一手性）
    // 转弯方向：船头往右舷偏 → 左舷那根是外侧
    var turn = 0;
    if (t.wakePrevF) turn = M3.dot(M3.sub(fh, t.wakePrevF), r) / Math.max(1e-4, dt);
    t.wakePrevF = fh;
    var k = M3.clamp(spd / Math.max(1, (s.speed || 30) * KNOT), 0, 1);
    var P = shipProps(s);
    for (var i = 0; i < P.length; i++) {
      var outer = (turn > 0.01 && P[i].x < 0) || (turn < -0.01 && P[i].x > 0);
      t.wakeAcc = t.wakeAcc || [];
      t.wakeAcc[i] = (t.wakeAcc[i] || 0) + WAKE_RATE * k * lod * (outer ? 1.3 : 1) * dt;
      while (t.wakeAcc[i] >= 1) {
        t.wakeAcc[i] -= 1;
        var back = P[i].z - M3.rnd(2, 4);
        var px = t.pos.x + r.x * P[i].x + fh.x * back, pz = t.pos.z + r.z * P[i].x + fh.z * back;
        var side = M3.rnd(-1.5, 1.5);
        spawnParticle(world.particles, M3.V(px + r.x * side * 0.4, 0.3, pz + r.z * side * 0.4),
          M3.V(r.x * side, M3.rnd(1, 3), r.z * side),
          M3.rnd(0.6, 1.2), M3.rnd(1.2, 2.0) * (0.6 + 0.4 * k), Math.random() < 0.7 ? '#e8f4f8' : '#cfe8ee',
          { grow: true, grav: 9.8, drag: 0.6, alpha: 0.55 });
      }
    }
  }

  function stepParticles(list, dt) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.pos = M3.add(p.pos, M3.mul(p.vel, dt));
      if (p.drag) { var k = Math.exp(-p.drag * dt); p.vel = M3.mul(p.vel, k); }
      if (p.grav) p.vel.y -= p.grav * dt;
    }
  }

  function randUnit() {
    var z = M3.rnd(-1, 1), t = M3.rnd(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
    return M3.V(r * Math.cos(t), z, r * Math.sin(t));
  }

  /** 爆炸：多色粒子 + 黑烟 */
  function explode(list, pos, scale, count) {
    scale = scale || 1;
    count = count || 16;
    var cols = ['#fff6d0', '#ffcf5c', '#ff8b2a', '#e2451c', '#8a2b12'];
    for (var i = 0; i < count; i++) {
      var dir = randUnit();
      var sp = M3.rnd(6, 58) * scale;
      spawnParticle(list, pos, M3.mul(dir, sp),
        M3.rnd(0.28, 0.95) * (0.7 + scale * 0.4),
        M3.rnd(1.6, 5.5) * scale,
        cols[M3.rndInt(0, cols.length - 1)],
        { grow: true, drag: 2.2, grav: 3 });
    }
    for (i = 0; i < Math.max(3, count >> 2); i++) {
      var d2 = randUnit();
      spawnParticle(list, pos, M3.mul(d2, M3.rnd(3, 22) * scale),
        M3.rnd(1.4, 3.4), M3.rnd(3, 9) * scale, '#3a3632',
        { grow: true, drag: 1.1, grav: -0.5 });
    }
  }

  /* ============================================================
     伤害
     ============================================================ */
  function damage(ent, amt, world, source) {
    if (!ent.alive) return false;
    // 附加装甲吊舱（JDA-3 护盾）的全向减伤。只有玩家会带，上限 60%。
    if (ent.armor) amt *= (1 - M3.clamp(ent.armor, 0, 0.6));
    ent.hp -= amt;
    if (source) ent.lastHitBy = source;   // 坠毁也能追到是谁打残的（战报分开记功）
    if (ent.hp <= 0) {
      kill(ent, world, false, source);
      return true;
    }
    return false;
  }

  /* 敌我判据：0 与 1 互为敌，2 是中立 —— 谁都不主动去打它，它也不打别人。
     导弹选目标那几处早就是这条规矩（`g.team > 1` 跳过），
     空中 AI、玩家锁定、预警机报告统一走这里。
     弹丸碰撞**不**走它：流弹照样会误伤中立，和水面中立船一致。 */
  function hostile(a, b) {
    return a.team !== b.team && a.team < 2 && b.team < 2;
  }

  function kill(ent, world, groundImpact, source) {
    if (!ent.alive) return;
    ent.alive = false;
    ent.dead = true;
    var s = ent.kind === 'air' ? (ent.phys.hp > 150 ? 3.2 : 2.2) : 3.5;
    if (world) {
      explode(world.particles, ent.pos, s, ent.phys && ent.phys.hp > 150 ? 26 : 20);
      SFX.boom(ent.phys && ent.phys.hp > 150 ? 1.5 : 1.1);
    }
    /* 记下击杀者：战报按"玩家 / 僚机 / 友舰"分开记功。没有直接来源的
       （被打残后坠海、失速撞海）算最后一个命中它的人。 */
    ent.killedBy = source || ent.lastHitBy || null;
    if (source && source.kills !== undefined) source.kills++;
  }

  function killGround(ent, world) {
    if (!ent.alive) return;
    ent.alive = false;
    ent.dead = true;
    if (world) {
      /* 设施/舰船的击毁要单独记一笔：主循环的 world.killed 只数飞机，
         没有这一行"摧毁 3 座浮空平台"在结算上就完全不体现。 */
      // 舰船打掉的不算玩家的战果（ent.killedBy 由 game.js 的 hitTarget 写入）
      var byShip = ent.killedBy && ent.killedBy.kind === 'target';
      if (world.groundKilled !== undefined && ent.team === 1 && !ent.friendlyAsset && !byShip) {
        world.groundKilled++;           // 只有敌方的才算战果：调节单元、准绳、中立船不加分
      }
      var s = (ent.radius || 8) / 6;
      explode(world.particles, ent.pos, s, 22 + (ent.radius | 0));
      SFX.bigHit();
    }
  }

  /* ============================================================
     被动吊舱汇总

     list 是 [{ wid, n }]，n 是该件占用的挂点数（左右各一 = 2）。
     玩家的挂载由 game.js 翻译成这个形状；敌机在 missions.js 里
     直接传 [{ wid, n: 1 }] —— 同一份实现，避免出现
     "玩家挂上有用、NPC 挂上没用"的两套逻辑。

     它不只是数值：silentLock（被动测距）会决定**敌方 RWR 是否看得到你**，
     所以结果必须写回 actor，而不只是留在机库面板上。
     ============================================================ */
  var ECM_LEAD_K = 0.6;
  /* 机体 ECM + 吊舱叠加，封顶 1。玩家与任务 NPC 都走这里。 */
  function setEcm(a, pe) {
    a.ecm = Math.min(1, (a.ecmBody || 0) + ((pe && pe.ecm) || 0));
  }

  /* 匿踪：机体匿踪（被外挂折损）+ 吊舱抗锁定 → a.lockResist。
     wids 缺省沿用上次的（NPC 造机时存在 a.mountWids），玩家由 startMission 传入。 */
  function setStealth(a, pe, wids) {
    if (wids) a.mountWids = wids;
    a.stealth = stealthValue(a.ac, exposedPoints(a.ac, a.mountWids));
    a.lockResist = lockCutOf(a.stealth, pe && pe.lockResist);
  }

  function passiveEffects(list) {
    var e = { lockResist: 0, armor: 0, lockRange: 1, flareBonus: 0, silentLock: false, ecm: 0 };
    if (!list) return e;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var w = WEAPONS[it.wid];
      if (!w || !w.passive) continue;
      var n = it.n || 1;
      if (w.lockResist) e.lockResist = Math.max(e.lockResist, w.lockResist);
      if (w.armorBonus) e.armor += w.armorBonus * n;
      if (w.lockRangeBonus) e.lockRange += w.lockRangeBonus * n;
      if (w.flareBonus) e.flareBonus += w.flareBonus * n;
      if (w.silentLock) e.silentLock = true;
      if (w.ecmBonus) e.ecm += w.ecmBonus * n;
    }
    e.armor = Math.min(e.armor, 0.55);
    e.lockRange = Math.min(e.lockRange, 1.9);
    return e;
  }

  /* ============================================================
     电子战开机

     这是**唯一**的开机入口：手动扣扳机（game.js 的 launch）、
     电子战协处理器的自主决策、任务脚本里干扰机航线到站，
     全部走这里。以前这段逻辑写在 launch 里，于是任何"绕过扳机"
     的开机方式都得把它抄一遍。

     ewBurnT 在这里定死是刻意的 —— 它描述的不是吊舱，而是**对手**：
     一支信号处理能力强的部队能在 3 秒内完成对抗，差的要 8 秒。
     这就是设定里那句"当你开启干扰吊舱时，对方雷达不会立刻致盲，
     而是会在 3 到 8 秒内完成对抗并重新建立跟踪"。
     ============================================================ */
  /* opt.wave（随队干扰机用，见 ai.js 的 jamAuto）：{ dur, to }
       —— 持续 dur 秒，强度从 1 线性降到 to，不走"被对抗掉"那条归零曲线。
       对手在适应，但压不干净；下一波重新开机又回到满强度。 */
  function openEcm(actor, wid, threatSkill, opt) {
    var w = WEAPONS[wid];
    if (!w || w.kind !== 'ecm' || w.passive) return false;
    var sk = M3.clamp(threatSkill === undefined ? 0.5 : threatSkill, 0, 1);
    actor.ewWave = (opt && opt.wave) || null;
    actor.spActive = actor.ewWave ? actor.ewWave.dur : (w.duration || 6);
    actor.ewT = 0;
    actor.ewBurnT = 3 + (1 - sk) * 5;
    actor.ewPower = 0;
    actor.ewWid = wid;
    actor.ewLockReduce = w.lockReduce || 0;
    /* 范围压制（下游的烧穿吊舱）：留下一个场，由 game.js 的
       updateJamming() 每帧结算。没有 jamRadius 的吊舱是"定向"干扰，
       只保护自己。 */
    actor.ewFieldR = w.jamRadius || 0;
    actor.ewFieldK = w.jamK || 0.7;
    return true;
  }

  /* ---------- 目标物（调节单元 / 中继平台 / 地面设施） ---------- */
  function makeTarget(o) {
    return {
      kind: 'target',
      team: o.team === undefined ? 1 : o.team,
      ttype: o.ttype || 'ground',
      label: o.label || '目标',
      model: o.model,
      alive: true,
      dead: false,
      pos: M3.V(o.x || 0, o.y || 0, o.z || 0),
      fwd: M3.norm(o.fwd || M3.V(0, 0, 1)),
      up: M3.V(0, 1, 0),
      right: M3.V(1, 0, 0),
      speed: o.speed || 0,
      vel: M3.V(0, 0, 0),
      hp: o.hp || 100,
      maxHp: o.hp || 100,
      radius: o.radius || 10,
      gunResist: o.gunResist !== undefined ? o.gunResist :
        ((typeof GUN_RESIST_MODELS !== 'undefined' && GUN_RESIST_MODELS[o.model]) || 0),
      ground: !!o.ground,
      big: !!o.big,
      drift: o.drift || 0,
      /* 航路（水面舰船用）。`wp` 是一串**海面**航点 [{x,z}…]，
         `speed` 是米/秒（`SHIPS[].speed` 是节，接入时自己换算）。
         有 `route` 时它优先于 `drift` —— 一条船要么沿航路走，
         要么原地漂，不必两套叠在一起。见 stepTarget。 */
      route: o.route || null,
      wpIdx: 0,
      arrive: 0,          // 航路到达阈值，在 makeTarget 末尾从 route 里取
      heading: 0,         // 当前航向（弧度），由实际位移反推，不是设定的
      fireCd: o.fireCd === undefined ? 6 : o.fireCd,
      weapon: o.weapon || null,
      value: o.value || 100,
      drifting: 0
    };
  }

  function stepTarget(t, dt, world) {
    if (!t.alive) return;

    /* ---------- 航路：水面舰船真的在航行 ----------

       以前只有 `drift`（正弦缓慢漂移）：浮空平台随气流飘是对的，
       而一条 40 节的导弹快艇"原地打转"就说不通了。这一支让目标能沿
       `route.wp` 走 —— 位置直线推进、`vel` 与 `fwd` 由**实际位移**反推。

       `fwd` 走位移而不是走线段方向，是为了让渲染与 HUD 在到达航点的
       拐弯处也能拿到连续朝向（线段方向会在换段的瞬间跳变）。 */
    var r = t.route;
    if (r && r.wp && r.wp.length) {
      t.arrive = r.arrive === undefined ? Math.max(120, t.radius * 2) : r.arrive;
      var last = r.wp.length - 1;
      if (t.wpIdx > last) {
        // 走完了：loop 就回绕，否则交给 onArrive 决定（默认原地停住）
        if (r.loop) {
          t.wpIdx = 0;
        } else {
          t.vel = M3.V(0, 0, 0);
          if (r.onArrive && !t.arrived) { t.arrived = true; r.onArrive(t, world); }
          if (r.despawn) t.alive = false;
          return;
        }
      }
      var wp = r.wp[t.wpIdx];
      var dx = wp.x - t.pos.x, dz = wp.z - t.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var spd = r.speed || t.speed || 12;
      var travel = spd * dt;
      if (d <= Math.max(t.arrive, travel)) {
        /* 一步就能到：直接落到航点上。不做"保留剩余位移"的精确分配 ——
           船一帧最多走十来米，分不分都对不齐，而少算这一段会让船
           永远差一点点到不了点。 */
        t.pos.x = wp.x; t.pos.z = wp.z;
        t.wpIdx++;
        var ux = d > 1e-6 ? dx / d : 0, uz = d > 1e-6 ? dz / d : 0;
        t.vel = M3.V(ux * spd, 0, uz * spd);
        if (d > 1e-6) t.heading = Math.atan2(dx, dz);
      } else {
        t.pos.x += dx / d * travel;
        t.pos.z += dz / d * travel;
        t.vel = M3.V(dx / d * spd, 0, dz / d * spd);
        t.heading = Math.atan2(dx, dz);
      }
      var vl = M3.len(t.vel);
      if (vl > 1e-3) t.fwd = M3.norm(t.vel);
      /* 航行的船不做"被打坏后下沉"那一套（那是浮空平台的事），所以
         航路分支 return —— 但 ttype 还是 ground，下沉本来也轮不到它。 */
    } else if (t.drift) {
      t.drifting += dt;
      t.pos.x += Math.cos(t.drifting * 0.02) * t.drift * dt;
      t.pos.z += Math.sin(t.drifting * 0.017) * t.drift * 0.6 * dt;
      t.vel = M3.V(Math.cos(t.drifting * 0.02) * t.drift, 0, Math.sin(t.drifting * 0.017) * t.drift * 0.6);
    }

    // 缓慢下沉（被打坏的浮空平台）
    if (t.ttype === 'air' && t.hp < t.maxHp * 0.5) {
      t.pos.y -= (1 - t.hp / t.maxHp) * 1.6 * dt;
    }
  }

  return {
    airDensity: airDensity, airDragK: airDragK, qOf: qOf, ctrlFactor: ctrlFactor, turnFactor: turnFactor,
    makeAircraft: makeAircraft, stepAircraft: stepAircraft,
    /* 挂点适配与 NPC 的挂载分配 —— game.js 的 pushStores 渲染实体挂载时
       要用同一份规则，不能再抄一遍。 */
    hostile: hostile,
    fitsKind: fitsKind, mountPlan: mountPlan, storePos: storePos, storeHy: storeHy, nozzlesOf: nozzlesOf, surfaceBelow: surfaceBelow, STORE_HY: STORE_HY,
    forEachStoreSlot: forEachStoreSlot, storeForSlot: storeForSlot,
    /* 选弹与"当前触发武器" —— game.js 的 syncWeapon（玩家换弹）与 ai.js
       的开火选弹都走 setWeapon，判据同源。 */
    chooseWeapon: chooseWeapon, setWeapon: setWeapon,
    weaponMatchesTarget: weaponMatchesTarget,
    /* 关卡里写错的 NPC 挂载（smoke.js 断言它是空的） */
    mountIssues: mountIssues, clearMountIssues: clearMountIssues,
    makeMissile: makeMissile, stepMissile: stepMissile, effectiveLife: effectiveLife,
    breakLock: breakLock, openEcm: openEcm, passiveEffects: passiveEffects, setEcm: setEcm, setStealth: setStealth, ECM_LEAD_K: ECM_LEAD_K,
    fireGun: fireGun, fireGunFrom: fireGunFrom, shellFuze: shellFuze, detonateShell: detonateShell, gunMuzzle: gunMuzzle, flashRings: flashRings, stepBullet: stepBullet, SLOT_EMPTY: SLOT_EMPTY,
    spawnParticle: spawnParticle, stepParticles: stepParticles, explode: explode,
    damage: damage, kill: kill, killGround: killGround, explode2: explode,
    detonate: detonate,
    /* 战斗部：面杀伤、加固判定、设施伤害的回调（game.js 注册 hitTarget） */
    wakeSpray: wakeSpray,
    effRange: effRange, glideReach: glideReach, maxReach: maxReach, flyTo: flyTo, envelopeRange: envelopeRange, displayRange: displayRange, naturalPoint: naturalPoint, gunLead: gunLead, groundY: groundY, terrainY: terrainY, isLand: isLand, agl: agl, SEA_Y: SEA_Y, setTerrain: setTerrain, finFootprint: finFootprint, aiReach: aiReach, AI_RANGE_K: AI_RANGE_K, lockOff: lockOff,
    isHard: isHard, warheadK: warheadK, hitAny: hitAny, isRadiating: isRadiating,
    jamState: jamState, jamShown: jamShown, jamDuty: jamDuty, jamRanges: jamRanges, jamPress: jamPress, jamLockOK: jamLockOK, jamLockK: jamLockK, JAM_BURN_R: JAM_BURN_R, JAM_SURF_K: JAM_SURF_K, JAM_BURN_SURF: JAM_BURN_SURF,
    gunResistK: gunResistK, SMALL_CAL: SMALL_CAL,
    setTargetHitHandler: setTargetHitHandler, hitSurface: hitSurface,
    makeTarget: makeTarget, stepTarget: stepTarget,
    randUnit: randUnit
  };
})();
