/* ============================================================
   上游公约 · 主力舰队

   上面那两艘（虎鲸 / 蓝鲸）是"在这片海面上干活"的船；
   下面这三艘是**一支完整的编队**该有的样子 ——
   上游是群岛与海洋国家，海军是他们的传统军种，
   所以他们的重舰不是临时改的，是几十年攒下来的。

   三艘都用鲸命名，与飞机（海鸟 / 海鱼）分开 —— 见设定集 8.0.1。
   ============================================================ */

/* ============================================================
   座头鲸级航空母舰 · 上游公约海军

   现代大型航母的外形：330 m 长、飞行甲板最宽 78 m（含斜角甲板）、满载 10 万吨级。
   坐标：x 右舷、y 向上（水线 0）、z 舰首；飞行甲板上表面 y = 19.2。

   甲板的轮廓是这条船最好认的东西，所以不用一块直板，而是三块凸多边形拼出来：
     A 艉段    艉部最宽（-46 … +32），左舷边沿一条斜线从艉部向前收到腰部 —— 这就是斜角甲板，
               与舰体中线约 8° 夹角；斜角着舰区的标线 / 拦阻索沿同一个方向画
     B 腰段    -31 … +32 的矩形，左右各一部升降机、右舷一具腰部弹射器
     C 艏段    向舰首收窄，艏部两具弹射器
   舰岛在右舷靠后（-48 … -12），整条船唯一高起来的东西。
   跑道（js/data/ships/humpback.js 的 runways）取三具弹射器的起飞端，坐标要与这里的弹射器轨道对上，
   tools/test/probes/probe-resupply.js 会拿模型表面核对。
   ============================================================ */
Registry.model({
  id: 'humpback', order: 260, settle: true,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, mast = L.mast, house = L.house, done = L.done;
    var b = new MB();
    var DECK_TOP = 19.2, DECK_BOT = 17.0;
    var KANG = Math.tan(9 * Math.PI / 180);      // 着舰轴线与舰体中线的夹角 9°

    // 船体：机库舷侧是高而方正的，飞行甲板架在它上面（甲板底面 17.0 与船体上缘齐平）
    b.hull([
      { z: 165, w: 2.6, y0: -3.0, y1: 17.0 },
      { z: 150, w: 8.0, y0: -6.0, y1: 17.0 },
      { z: 125, w: 14.5, y0: -9.5, y1: 17.0 },
      { z: 90, w: 18.8, y0: -11.5, y1: 17.0 },
      { z: 50, w: 20.4, y0: -12.0, y1: 17.0 },
      { z: -90, w: 20.5, y0: -12.0, y1: 17.0 },
      { z: -140, w: 19.0, y0: -11.0, y1: 17.0 },
      { z: -165, w: 15.5, y0: -9.5, y1: 17.0 }
    ], C.hull, C.deck, C.boot);

    /* 凸多边形厚板：poly 是 [[x, z], …]；上表面 colTop，侧面 colSide，底面 colBot。
       每块必须是凸的（渲染按扇形铺面），所以斜角甲板那处凹角要拆成几块。 */
    function slab(poly, yTop, yBot, colTop, colSide, colBot) {
      var top = [], bot = [], i;
      for (i = 0; i < poly.length; i++) {
        top.push(b.pt(poly[i][0], yTop, poly[i][1]));
        bot.push(b.pt(poly[i][0], yBot, poly[i][1]));
      }
      b.face(top, colTop);
      b.face(bot.slice().reverse(), colBot);
      for (i = 0; i < poly.length; i++) {
        var j = (i + 1) % poly.length;
        b.quad(top[i], top[j], bot[j], bot[i], colSide);
      }
    }
    // 飞行甲板（A 艉段 / B 腰段 / C 艏段）
    // 斜角舷台：左舷外沿从舰尾 (-14.4) 按 9° 一直向外斜到 z = +34 处最宽（x ≈ −46）（SPON_X），再斜着收回前甲板边沿（-31）
    var SPON_Z = 34, SPON_X = -14.4 - KANG * (SPON_Z + 165);
    slab([[-14.4, -165], [32, -165], [32, SPON_Z], [SPON_X, SPON_Z]], DECK_TOP, DECK_BOT, C.deck, C.hull2, C.hull2);
    slab([[SPON_X, SPON_Z], [32, SPON_Z], [32, 60], [-31, 60]], DECK_TOP, DECK_BOT, C.deck, C.hull2, C.hull2);
    /* 艏段：两舷各两段近乎笔直的边向舰首收拢（腰部 ±31 → z = 120 处 ±27 → 舰首 −9 … +7 一段窄平头），
       现代大型航母的飞行甲板前部就是这种楔形，不是圆弧鼓出来的 */
    slab([[-31, 60], [32, 60], [27, 120], [7, 165], [-9, 165], [-27, 120]], DECK_TOP, DECK_BOT, C.deck, C.hull2, C.hull2);

    // 甲板外飘的下面：船体往外一圈外倾的舷侧（右舷整段、左舷腰段、左舷斜角段）
    b.wing(V(20.5, 10, -165), V(32, 17, -165), V(32, 17, 60), V(20.5, 10, 60), C.hull2);
    b.face([b.pt(-19.5, 10, -133), b.pt(SPON_X, 17, SPON_Z), b.pt(-20.5, 10, SPON_Z)], C.hull2);
    b.face([b.pt(-20.5, 10, SPON_Z), b.pt(SPON_X, 17, SPON_Z), b.pt(-19.5, 10, -133)], C.hull2);
    b.face([b.pt(-20.5, 10, SPON_Z), b.pt(SPON_X, 17, SPON_Z), b.pt(-31, 17, 60), b.pt(-20.5, 10, 60)], C.hull2);
    b.face([b.pt(-20.5, 10, 60), b.pt(-31, 17, 60), b.pt(SPON_X, 17, SPON_Z), b.pt(-20.5, 10, SPON_Z)], C.hull2);
        // 斜角甲板外沿的几根支撑
    var zs = [-120, -90, -60, -30, 0];
    for (var si = 0; si < zs.length; si++) {
      var xe = -14.4 - (zs[si] + 165) * KANG;
      b.box(xe + 3, 12.5, zs[si], 1.4, 9, 1.4, C.hull2);
    }

    /* 甲板上的线：a→b 的一条宽 w 的细带，贴在甲板上方 0.05 m */
    function stripe(x0, z0, x1, z1, w, col, y) {
      var dx = x1 - x0, dz = z1 - z0, l = Math.sqrt(dx * dx + dz * dz) || 1;
      var nx = dz / l * w / 2, nz = -dx / l * w / 2, yy = y || (DECK_TOP + 0.06);
      b.wing(V(x0 + nx, yy, z0 + nz), V(x1 + nx, yy, z1 + nz), V(x1 - nx, yy, z1 - nz), V(x0 - nx, yy, z0 - nz), col);
    }
    /* 斜角着舰区：轴线 x(z) = 2 − KANG·(z + 160)，越往前越偏向左舷（与舰体中线夹 9°）。
       飞机顺着轴线往前滑，复飞时从左舷飞出去，不会撞上右舷的舰岛 —— 这也是左舷舷台
       越往前越宽的原因。宽 16 m，从舰尾延伸到 z = +8（占全长一半多；舷台在 z = +34 才收回）。 */
    function axisX(z) { return 2 - KANG * (z + 160); }
    var HW = 8, cs = Math.cos(9 * Math.PI / 180), sn = Math.sin(9 * Math.PI / 180);
    stripe(axisX(-160), -160, axisX(8), 8, 0.7, C.white);                       // 着舰中线
    stripe(axisX(-160) - HW * cs, -160 - HW * sn, axisX(8) - HW * cs, 8 - HW * sn, 0.55, C.yellow);   // 左边线
    stripe(axisX(-160) + HW * cs, -160 + HW * sn, axisX(8) + HW * cs, 8 + HW * sn, 0.55, C.yellow);   // 右边线
    var wires = [-132, -120, -108, -96];                                          // 四道拦阻索
    for (var wi = 0; wi < wires.length; wi++) {
      var cx0 = axisX(wires[wi]);
      stripe(cx0 - (HW - 0.6) * cs, wires[wi] - (HW - 0.6) * sn, cx0 + (HW - 0.6) * cs, wires[wi] + (HW - 0.6) * sn, 0.35, C.metal, DECK_TOP + 0.08);
    }
    // 甲板边缘警示带：右舷整段、左舷腰段 / 艏段（斜角段的外沿已经被着舰区边线占了）
    stripe(31, -165, 31, 58, 0.9, C.yellow);
    stripe(-14.4 + 0.4, -165, SPON_X + 0.5, SPON_Z, 0.9, C.yellow);
    stripe(SPON_X + 0.5, SPON_Z, -30.5, 58, 0.9, C.yellow);
    /* 艏部涂装（按真实航母的画法）：
         ① 边缘黄线沿艏部轮廓一直描到舰首（两舷各一条，舰首尖端一道横线）
         ② 每条弹射轨道有两侧白色虚线车道线（车道宽 5.6 m）、起点一道黄色横线（越线禁区）、
            终点一道白色横标（弹射终点）
         ③ 两条艏部轨道之间不画中线 —— 那一带是停机 / 滑行区，真实甲板上也是空的 */
    function dashed(x0, z0, x1, z1, w, col, on, off) {
      var L = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0)) || 1, ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      for (var t = 0; t < L; t += on + off) {
        var e = Math.min(L, t + on);
        stripe(x0 + ux * t, z0 + uz * t, x0 + ux * e, z0 + uz * e, w, col);
      }
    }
    // 艏部边缘黄线（左舷 / 右舷各 2 段，沿艏部多边形内缩 0.5 m；舰首窄平头一道横线）
    stripe(-30.5, 58, -26.6, 120, 0.9, C.yellow);
    stripe(-26.6, 120, -8.6, 164.2, 0.9, C.yellow);
    stripe(31, 58, 26.6, 120, 0.9, C.yellow);
    stripe(26.6, 120, 6.6, 164.2, 0.9, C.yellow);
    stripe(-8.6, 164.2, 6.6, 164.2, 0.9, C.yellow);
    // 艏部两条弹射轨道的车道：(x, 起点 z, 终点 z) 与下面的轨道 box 对上
    var lanes = [[-9, 70, 156], [6, 62, 150]];
    for (var li = 0; li < lanes.length; li++) {
      var lx = lanes[li][0], lz0 = lanes[li][1], lz1 = lanes[li][2];
      dashed(lx - 2.8, lz0, lx - 2.8, lz1, 0.35, C.white, 14, 8);
      dashed(lx + 2.8, lz0, lx + 2.8, lz1, 0.35, C.white, 14, 8);
      stripe(lx - 3.0, lz0 - 1.0, lx + 3.0, lz0 - 1.0, 0.55, C.yellow);      // 起点：越线禁区
      stripe(lx - 3.0, lz1, lx + 3.0, lz1, 0.45, C.white);                   // 终点：弹射终点
    }
    // 腰部（右舷）弹射轨道的车道：x = 17，z −22 … 64；车道边线收到 ±2.6 m，免得压到舰岛根部与前升降机
    dashed(17 - 2.6, -22, 17 - 2.6, 44, 0.35, C.white, 14, 8);
    dashed(17 + 2.6, -22, 17 + 2.6, 44, 0.35, C.white, 14, 8);
    stripe(17 - 2.8, -23, 17 + 2.8, -23, 0.55, C.yellow);
    stripe(17 - 2.8, 44, 17 + 2.8, 44, 0.45, C.white);

    /* 弹射器轨道：艏部两具 + 右舷腰部一具。跑道数据（runways）的起飞端就是它们的前端。 */
    b.box(-9, DECK_TOP + 0.12, 113, 1.1, 0.16, 86, C.metal);      // 艏 1（左），z 70 … 156
    b.box(6, DECK_TOP + 0.12, 106, 1.1, 0.16, 88, C.metal);       // 艏 2（右），z 62 … 150
    b.box(17, DECK_TOP + 0.12, 21, 1.1, 0.16, 86, C.metal);       // 腰部（右），z -22 … 64
    // 偏流板（艏部弹射器后面那几块竖起来的板子）
    b.boxTilt(-9, DECK_TOP + 1.4, 62, 6.5, 2.6, 0.5, -0.9, C.hull2, C.hull2);
    b.boxTilt(6, DECK_TOP + 1.4, 54, 6.5, 2.6, 0.5, -0.9, C.hull2, C.hull2);

    // 三部舷侧升降机（甲板上颜色不同的方板）：右舷前后各一、左舷腰段一
    b.box(26, DECK_TOP + 0.1, 56, 12, 0.25, 22, C.metal);
    b.box(26, DECK_TOP + 0.1, -100, 12, 0.25, 22, C.metal);
    b.box(-25, DECK_TOP + 0.1, 32, 12, 0.25, 24, C.metal);

    /* 舰岛：右舷靠后，整条船上唯一高起来的东西。
       下层是舰体，上层是舰桥（带一圈玻璃），桅杆挑得很高；相控阵板贴在前 / 左两个面上。 */
    house(b, 26, -30, 11.5, 18.0, 36.0, DECK_TOP + 0.2, C.hull2, C.hull);
    house(b, 25.5, -26, 9.5, 7.0, 22.0, DECK_TOP + 18.2, C.hull, C.hull2);
    b.box(25.5, DECK_TOP + 21.5, -26, 9.9, 1.6, 22.4, C.canopy);
    b.box(26, 30, -11.9, 8.5, 8, 0.5, C.dark);                    // 前面的相控阵板
    b.box(20.0, 30, -30, 0.5, 8, 8.5, C.dark);                    // 左面的相控阵板
    mast(b, 26, -36, DECK_TOP + 25.2, 78, 1.8, 0.5, C.hull2);     // 主桅
    mast(b, 25.5, -19, DECK_TOP + 25.2, 62, 1.0, 0.4, C.hull2);   // 前桅
    b.tube(V(26, 31, -52), V(26, 40, -52), 2.4, 2.0, 6, C.hull2, C.boot);   // 烟囱 / 排气

    return done(b, { span: 78, len: 330, ground: true, sea: true, radius: 100 });
  }
});
