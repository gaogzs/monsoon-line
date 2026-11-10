(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.airDensity = airDensity; $.qOf = qOf; $.ctrlFactor = ctrlFactor; $.terrainY = terrainY; $.groundY = groundY; $.isLand = isLand; $.agl = agl; $.setTerrain = setTerrain; $.airDragK = airDragK; $.turnFactor = turnFactor;
  $.stallK = stallK; $.ceilingEff = ceilingEff; $.thrustK = thrustK;

  $.G = 9.80665;
  $.RHO0 = 1.225;

  $.RHO_TROPO = 0.3639;

  // 11 km 对流层顶密度，推力衰减的归一化基准
  $.THRUST_TAPER = 1.0;

  // 剩余推力在接近目标速度的最后一段渐弱，见 stepAircraft
  $.TURN_BLEED = 0.20;

  // 转弯诱导阻力系数

  /* 激光照射锥：载机的机头必须保持在这个角度内才算"还在照着"。

     25° 是按玩法定的 —— 太宽（比如 45°）玩家把机头随便一偏照射都不掉，
     那句"命中前保持照射"就形同虚设；太窄（10°）则俯冲投放时几乎
     不可能一边修正姿态一边保持照射。25° 大致是"稍微偏一下没事、
     真的转开就丢"的距离。 */
  $.LASER_CONE = 25 * Math.PI / 180;

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

  /* ============================================================
     失速速度随动压变化与高空推力包线
     ============================================================
     失速的是**动压**，不是空速：同样的机翼，同样的升力系数，½ρv² 够不够托住机体才是关键。
     所以 vStall(y) = vStall₀ · √(ρ₀ / ρ(y))：海平面是 vStall₀，11 km 约 1.8 倍，20 km 约 3.7 倍。
     （a.speed 一直是真空速；舵效 ctrlFactor、PSM 的动压上限本来就按动压算，现在失速也一致了。）

     推力一侧：旧写法把"推力比 ρ^0.75"直接乘在速度上，14–15 km 就压到了失速速度以下，
     数据里的升限（10–21 km）更是对不上。现在的模型：
       机翼升限 coffin：1.1·vStall₀·S(y) = vMil 的高度（"棺材角"：能飞的速度窗口夹到 1.1 倍余量）
       推力升限 ceiling：机型数据里的升限（保留）
       有效升限 ceilingEff = min(两者)
     军推 / 加力的目标速度从 yT = min(11 km, ceilingEff − 2.5 km) 起，在 S 空间里线性压低，
     到有效升限处刚好是 1.1·vStall(y)；vStall(y) 在 S 里也是线性的，所以整段都留有余量。
     升限以上继续外推（有下限）—— 速度掉到失速速度以下，自然失速下沉，回到升限以下才改得出来。 */
  var CEIL_MARGIN = 1.1;
  $.CEIL_MARGIN = CEIL_MARGIN;
  var envCache = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function stallK(y) { return Math.sqrt($.RHO0 / airDensity(y)); }

  /* 某架飞机的高空包线参数。按 phys 对象缓存（关卡里给个别机体换了 phys 时各算各的）。 */
  function envOf(phys, ceiling) {
    var e = envCache && envCache.get(phys);
    if (e && e.cap === ceiling) return e;
    var v0 = phys.vStall, vm = phys.vMil, y;
    var coffin = 30000;
    for (y = 0; y <= 30000; y += 50) {
      if (CEIL_MARGIN * v0 * stallK(y) >= vm) { coffin = y; break; }
    }
    var cEff = Math.max(3000, Math.min(ceiling, coffin));
    var yT = Math.max(0, Math.min(11000, cEff - 2500));
    var Sy = stallK(yT), Sc = stallK(cEff);
    e = { cap: ceiling, coffin: coffin, cEff: cEff, yT: yT, Sy: Sy, Sc: Sc,
          kEnd: CEIL_MARGIN * v0 * Sc / vm };
    if (envCache) envCache.set(phys, e);
    return e;
  }

  /** 这架飞机的有效升限（m）：min(数据升限, 失速升限)。a 是实体或 { ac, phys }。 */
  function ceilingEff(a) {
    var ph = a.phys || (a.ac && a.ac.phys);
    return envOf(ph, (a.ac && a.ac.ceiling) || 16000).cEff;
  }

  /** 高度 y 处的目标速度系数（乘在 vMil / vMax 上）：yT 以下为 1，往上到有效升限处压到 kEnd，再往上外推（下限 0.3）。 */
  function thrustK(a, y) {
    var e = envOf(a.phys || (a.ac && a.ac.phys), (a.ac && a.ac.ceiling) || 16000);
    if (y <= e.yT) return 1;
    var t = (stallK(y) - e.Sy) / Math.max(1e-6, e.Sc - e.Sy);
    return Math.max(0.3, 1 + (e.kEnd - 1) * t);
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
  $.terrainFn = null;

  /* 两种"地面"分开看：
       海平面  SEA_Y = 0：水面。舰船、水柱、尾迹、落水都认它，永远是 0。
       地形高度 terrainY(x,z)：陆地。只有地形函数返回 > 海平面的地方才是陆地。
     groundY = max(海平面, 地形)：弹丸落地、撞地保护、离地高度（agl）读这一个；
     需要区分"落水 / 落地"的（水柱、舰船、浮空平台）用 isLand。 */
  $.SEA_Y = 0;

  function terrainY(x, z) { return $.terrainFn ? $.terrainFn(x, z) : $.SEA_Y; }

  function groundY(x, z) { var h = terrainY(x, z); return h > $.SEA_Y ? h : $.SEA_Y; }

  function isLand(x, z) { return terrainY(x, z) > $.SEA_Y; }

  function agl(e) { return e.pos.y - groundY(e.pos.x, e.pos.z); }

  // 离地（海面）高度
  function setTerrain(fn) { $.terrainFn = fn || null; }

  $.BOMB_DRAG = 0.00006;

  // 无动力弹 / 火箭的阻力系数：a = BOMB_DRAG × ρ × v²
  $.FIN_BLEED = 0.3;

  // 弹翼修正的诱导阻力：每 1 m/s 侧向速度改变耗掉 0.3 m/s 速率
  var DRAG_REF_Y = 7000, DRAG_K_MIN = 0.4, DRAG_K_MAX = 1.4;

  function airDragK(y) {
    return M3.clamp(airDensity(y) / airDensity(DRAG_REF_Y), DRAG_K_MIN, DRAG_K_MAX);
  }

  /** 导弹转弯率的气动缩放 */
  function turnFactor(y) {
    var r = airDensity(y) / $.RHO0;
    return Math.max(0.34, Math.sqrt(r));
  }
})(Ent);
