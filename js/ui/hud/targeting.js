(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawLeadReticle = drawLeadReticle; $.drawTargets = drawTargets; $.drawLaserStatus = drawLaserStatus; $.drawConeCue = drawConeCue; $.pointInPolygon = pointInPolygon; $.drawPlainMark = drawPlainMark;

  /* ============================================================
     机炮提前量准星

     弹丸有飞行时间，打移动目标必须往前带 —— 这一点是真实的，
     但不该让玩家在座舱里心算三角函数。所以把"该瞄哪里"直接画出来。

     算法和 AI 用的 leadTo() 完全一致：目标位置 + 目标速度 × 弹丸飞行时间。
     只是这里不自动瞄准，而是把它标出来，玩家自己把机头摆上去 ——
     保留了手动瞄准的手感，去掉了心算提前量的负担。

     一选中目标就画，不等导弹锁定 —— 锁定时间取决于手上那枚弹，
     和机炮无关。超出机炮有效射程时画成淡虚线（"往这儿带，但还够不着"），
     进入射程才变实线。
     ============================================================ */
  function drawLeadReticle(ctx, W, H, cam, p) {
    var t = p.target;
    if (!t || !t.alive) return;
    if (!p.ac) return;

    var gunW = WEAPONS[p.gun];
    if (!gunW || gunW.kind !== 'gun') return;

    var dist = M3.dist(t.pos, p.pos);
    var gunRange = (p.pos.y > 18000 ? gunW.highRange : gunW.range) * 0.95;
    var inRange = dist <= gunRange;

    /* 真实弹道求解：载机速度叠加、重力下坠、阻力都算进去（Ent.gunLead，与实弹同一套）。
       预测点 = 机头沿解算方向在目标距离处的点。 */
    var tv = t.vel || M3.V(0, 0, 0);
    var lead = Ent.gunLead(gunW, p.pos, p.vel || M3.V(0, 0, 0), t.pos, tv);
    var aim = M3.add(p.pos, M3.mul(lead.dir, dist));

    var s = M3.project(cam, aim);
    if (!s) return;

    // 距离越近圈越小，暗示"该更精确了"
    var r = 8 + M3.clamp(dist / 1800, 0, 1) * 5;

    ctx.strokeStyle = inRange ? 'rgba(255,228,150,0.70)' : 'rgba(255,228,150,0.50)';
    ctx.lineWidth = 1.4;
    if (!inRange) ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 圆心小点：真正的瞄准点
    ctx.fillStyle = inRange ? 'rgba(255,244,200,0.92)' : 'rgba(255,244,200,0.55)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ============================================================
     目标框 / 屏幕外指示 / NEZ
     ============================================================ */
  function drawTargets(ctx, W, H, cam, p, world) {
    var list = [];
    var i;
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      // 友军也要进列表 —— 以前这里过滤掉了同队，于是僚机在视野里
      // 完全没有标记，编队飞行时根本找不到自己的二号三号机。
      if (e.alive && e !== p) list.push(e);
    }
    if (world.targets) {
      for (i = 0; i < world.targets.length; i++) {
        if (world.targets[i].alive && !$.farCell(world.targets[i], p)) list.push(world.targets[i]);
      }
    }

    // 屏外标记的落点每帧只算一次 —— 与目标数量无关
    var offRect = $.offscreenRect(W, H, p);

    for (i = 0; i < list.length; i++) {
      var t = list[i];
      /* 被压制：远处的敌方目标框闪烁（flicker）或消失（hidden），屏外标记同样处理。
         判据在 Ent.jamState —— 与锁定、F 键候选同一个口径。 */
      if (!Ent.jamShown(p, t, world.time || 0)) continue;
      var s = M3.projectUnclamped(cam, t.pos);
      var dist = M3.dist(p.pos, t.pos);
      var isAlly = (t.team === p.team);
      var isLock = (p.target === t);

      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        $.drawOffscreen(ctx, W, H, cam, t, isLock, dist, isAlly, offRect, isLock && p.locked);
        continue;
      }

      if (isAlly) {
        drawAllyMark(ctx, s, t, dist);
      } else {
        /* 锁定时只画大框：大框自己带呼号 / 机型 / 距离 / 高度差，
           两份标签叠在一起反而谁都读不清。未锁定画基础框。
           中立（team 2）用灰色 —— 它不是敌人，红色会让人想去打它。 */
        if (isLock) drawLockBox(ctx, s, t, p, dist, world);
        else drawPlainMark(ctx, s, t, dist, t.team > 1,
          Ent.jamState(p, t) === 'flicker' ? { time: world.time || 0, phase: t.jamPhase } : null);
      }
    }
  }

  /* ============================================================
     激光照射状态（**当前休眠**：没有任何武器用 seeker: 'laser'）

     PEJ-30 已改成无制导，所以下面两个分支都不会触发。
     留着是为了将来给某件弹填上 'laser' 时，HUD 反馈能立刻跟上 ——
     没有这段提示，玩家不会知道有"保持照射"这回事。

     激光制导的核心操作是"投放之后继续保持照射"：弹每一帧都在问
     载机"你还在照着目标吗"，机头一偏出 25° 它就不再修正，
     之后只是一块自由落体的铁。

     这件事如果不显示出来，玩家根本不知道有这回事，
     只会觉得"这炸弹有时候准有时候不准"。所以两段都要给：

       投放前 —— 目标框下方写照射进度（它和锁定环是同一个量）
       投放后 —— 屏幕下缘一条常驻状态条，直接告诉他照射还在不在
     ============================================================ */
  function drawLaserStatus(ctx, W, H, p, world) {
    var w = WEAPONS[p.special];

    // ---- 投放前：手里拿着激光弹，而且已经锁上了 ----
    if (w && w.seeker === 'laser' && p.target && p.target.alive) {
      var s = M3.projectUnclamped(Renderer.getCam(), p.target.pos);
      if (!s.behind && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
        var ready = p.lockProgress >= 1;
        $.text(ctx, ready ? T('ui.hud.targeting.drawLaserStatus.s1') : T('ui.hud.targeting.drawLaserStatus.s2') + Math.round(p.lockProgress * 100) + '%',
          s.x, s.y + 32, ready ? $.AMBER : 'rgba(255,176,58,0.55)', $.FS, 'center');
      }
    }

    // ---- 投放后：自己的激光弹还在飞 ----
    var flying = null;
    if (world && world.missiles) {
      for (var i = 0; i < world.missiles.length; i++) {
        var m = world.missiles[i];
        if (m.alive && m.owner === p && m.w && m.w.seeker === 'laser') {
          flying = m;
          break;
        }
      }
    }
    if (!flying) return;

    var y = H * 0.87;
    if (flying.laserLost) {
      $.text(ctx, T('ui.hud.targeting.drawLaserStatus.s3'), W / 2, y, $.RED, $.FB, 'center');
      $.text(ctx, T('ui.hud.targeting.drawLaserStatus.s4'), W / 2, y + 16,
        'rgba(185,200,212,0.72)', $.FS, 'center');
    } else {
      $.text(ctx, T('ui.hud.targeting.drawLaserStatus.s5'), W / 2, y, $.AMBER, $.FB, 'center');
    }
  }

  /* ============================================================
     友军标记

     绿色在 HUD 里的语义本来就是"友军"，正好用上。
     画法和敌方刻意区分：敌方是**实线整框**，友军是**四角短线**，
     而且更细、更暗 —— 远处一眼扫过不会混淆。

     呼号优先，没有呼号就退到机型。
     ============================================================ */
  function drawAllyMark(ctx, s, t, dist) {
    var col = 'rgba(90,168,255,0.70)';
    var c = 9, g = c * 0.45;

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(s.x - c, s.y - c + g); ctx.lineTo(s.x - c, s.y - c); ctx.lineTo(s.x - c + g, s.y - c);
    ctx.moveTo(s.x + c - g, s.y - c); ctx.lineTo(s.x + c, s.y - c); ctx.lineTo(s.x + c, s.y - c + g);
    ctx.moveTo(s.x + c, s.y + c - g); ctx.lineTo(s.x + c, s.y + c); ctx.lineTo(s.x + c - g, s.y + c);
    ctx.moveTo(s.x - c + g, s.y + c); ctx.lineTo(s.x - c, s.y + c); ctx.lineTo(s.x - c, s.y + c - g);
    ctx.stroke();

    if (dist > 14000) return;

    var distTxt = dist < 1000
      ? Math.round(dist) + ' M'
      : (dist / 1000).toFixed(1) + ' KM';
    /* 与敌方未锁定框同一格式：第一行机型，第二行呼号（压暗），再下面距离。 */
    /* 海上单位同敌方：第一行舰级，第二行舰名。 */
    var acTxt = t.ac ? (t.ac.name + ' ' + t.ac.cn) : (t.shipClass || null);
    var line1 = acTxt || t.label || t.name || T('ui.hud.targeting.drawAllyMark.line1.s1');
    var line2 = acTxt && t.label ? t.label : null;
    $.text(ctx, line1, s.x + c + 6, s.y - c + 8, col, $.FS, 'left');
    var ly = s.y - c + 21;
    if (line2) { $.text(ctx, line2, s.x + c + 6, ly, 'rgba(185,200,212,0.62)', $.FS, 'left'); ly += 13; }
    $.text(ctx, distTxt, s.x + c + 6, ly, 'rgba(130,170,215,0.60)', $.FS, 'left');
    ly += 13;

    /* 僚机的当前指令。

       1/2/3 这三条指令长期对无人僚机无效（见 docs/systems/ai.md），
       所以玩家按下去之后看不到任何变化。现在指令真的生效了，
       就得有地方看得见它 —— 顺带把"数据链中断"这个降级状态
       也画出来：那是强对抗环境下无人机转入自主防御的标志。 */
    if (t.ai && t.wingIdx) {
      var jammed = t.suppressed > 0.35;
      var cmdTxt = t.ai.cmd === 'spread' ? T('ui.hud.targeting.drawAllyMark.cmdTxt.s1')
        : (t.ai.cmd === 'cover' ? T('ui.hud.targeting.drawAllyMark.cmdTxt.s2') : T('ui.hud.targeting.drawAllyMark.cmdTxt.s3'));
      $.text(ctx, jammed ? T('ui.hud.targeting.drawAllyMark.s1') : cmdTxt,
        s.x + c + 6, ly,
        jammed ? '#ff8b2a' : 'rgba(130,170,215,0.60)', $.FS, 'left');
    }
  }

  /* ============================================================
     未锁定的目标标记
     红框旁边照样写清"谁在开、开的是什么" —— 一眼扫过去也要能
     判断该先打谁。标签只在较近时才画，否则满屏都是字。
     ============================================================ */
  /* glitch：{ time, phase } —— 目标在电磁干扰的闪烁带里（真假一视同仁）时传入，
     型号 / 舰级 / 呼号 / 设施名换成同形状的乱码，距离保持真实（2.3b） */
  function drawPlainMark(ctx, s, t, dist, neutral, glitchInfo) {
    var gl = glitchInfo ? function (str) { return $.glitch(str, glitchInfo.time, glitchInfo.phase); }
      : function (str) { return str; };
    var isGnd = t.kind === 'target';
    var sz = isGnd ? 8 : 11;

    /* 敌方一律红色，不分空地。

       地面目标原来用灰蓝 rgba(143,163,178) —— 那是 HUD 里"一般说明文字、
       距离数字"用的同一个色系，读起来像中立物体，玩家会以为浮台不能打。
       它们确实是敌方设施，就该和敌机同色。

       尺寸仍然保留差别（地面设施画小一点）：那是**识别**用的，
       告诉你"这是个固定设施"，不是用来区分敌我的。 */
    var col = neutral ? 'rgba(160,170,178,0.62)' : 'rgba(255,77,77,0.68)';

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(s.x - sz, s.y - sz, sz * 2, sz * 2);

    if (dist > 12000) return;      // 太远的只留框

    // 相对本机的距离 —— 未锁定也要看得到，否则没法判断该不该追
    var distTxt = dist < 1000
      ? Math.round(dist) + ' M'
      : (dist / 1000).toFixed(1) + ' KM';
    var dim = 'rgba(185,200,212,0.62)';

    // 地面设施只有名字，没有呼号也没有机型
    if (isGnd && !t.shipClass) {
      $.text(ctx, gl(t.label || t.name || T('ui.hud.targeting.drawPlainMark.s1')),
        s.x + sz + 7, s.y - sz + 8, col, $.FS, 'left');
      $.text(ctx, distTxt, s.x + sz + 7, s.y - sz + 21, dim, $.FS, 'left');
      return;
    }

    /* 空中目标：第一行机型（认机 —— 对火控来说这才是要紧的），
       第二行呼号（风味信息，压暗），最后一行距离。以前呼号在前。 */
    /* 两支海军的船同一格式：第一行舰级，第二行呼号 */
    var acTxt = t.ac ? (t.ac.name + ' ' + t.ac.cn) : (t.shipClass || null);
    var line1 = gl(acTxt || t.label || t.name || '');
    var line2 = acTxt && t.label ? gl(t.label) : null;

    var tx = s.x + sz + 7, ty = s.y - sz + 8;
    $.text(ctx, line1, tx, ty, col, $.FS, 'left');
    var ly = ty + 13;
    if (line2) {
      $.text(ctx, line2, tx, ly, dim, $.FS, 'left');
      ly += 13;
    }
    $.text(ctx, distTxt, tx, ly, dim, $.FS, 'left');
  }

  /* 舰种：spawnShip 写在 t.shipCls 上；不是走 spawnShip 生成的舰船按模型回查 SHIPS */
  var SHIP_CLS = null;

  function shipClsOf(t) {
    if (t.shipCls) return t.shipCls;
    if (!SHIP_CLS) {
      SHIP_CLS = {};
      for (var i = 0; i < SHIPS.length; i++) SHIP_CLS[SHIPS[i].model] = SHIPS[i].cls;
    }
    return SHIP_CLS[t.model] || null;
  }

  function drawLockBox(ctx, s, t, p, dist, world) {
    var w = 30, h = 30;
    if (t.kind === 'target') { w = 46; h = 34; }

    /* 发射包线分三档，框的颜色跟着走：

         淡橙  最大射程之外 —— 打出去够不着
         橙色  最大射程之内 —— 能追上，但目标掉头还能跑掉
         红色  不可逃逸区（NEZ）—— 发射就有意义

       对面制导弹（对地 / 对海）也有包线：射程外 / 射程内 / 最佳射程（见 computeEnvelope）。
       炸弹、火箭等无制导的没有，一律按橙色。
       **不要用绿色**。绿色在 HUD 里的语义是"友军 / 正常状态"，
       拿它标一个敌人，玩家会下意识以为那是友机 —— 这比颜色突变更糟。 */
    var env = $.computeEnvelope(p, t);
    var inNez = !!env && dist < env.nez;
    var outMax = !!env && dist > env.rmax;
    var FAR = 'rgba(255,176,58,0.45)';
    ctx.strokeStyle = inNez ? $.RED : (outMax ? FAR : $.AMBER);
    ctx.lineWidth = inNez ? 2.4 : 2;

    // 四角括号
    var c = 9;
    var x0 = s.x - w, y0 = s.y - h, x1 = s.x + w, y1 = s.y + h;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + c); ctx.lineTo(x0, y0); ctx.lineTo(x0 + c, y0);
    ctx.moveTo(x1 - c, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + c);
    ctx.moveTo(x1, y1 - c); ctx.lineTo(x1, y1); ctx.lineTo(x1 - c, y1);
    ctx.moveTo(x0 + c, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - c);
    ctx.stroke();

    /* 已锁定：四角括号变成双层（内侧再加一圈短角），锁定环消失。
       不换颜色 —— 框的颜色已经在表达发射包线了。 */
    if (p.locked) {
      var g2 = 5, c2 = 6;
      var u0 = x0 + g2, v0 = y0 + g2, u1 = x1 - g2, v1 = y1 - g2;
      ctx.beginPath();
      ctx.moveTo(u0, v0 + c2); ctx.lineTo(u0, v0); ctx.lineTo(u0 + c2, v0);
      ctx.moveTo(u1 - c2, v0); ctx.lineTo(u1, v0); ctx.lineTo(u1, v0 + c2);
      ctx.moveTo(u1, v1 - c2); ctx.lineTo(u1, v1); ctx.lineTo(u1 - c2, v1);
      ctx.moveTo(u0 + c2, v1); ctx.lineTo(u0, v1); ctx.lineTo(u0, v1 - c2);
      ctx.stroke();
      // 框正上方写 LOCK，与框下方的 IN RNG / NEZ 上下对应
      $.text(ctx, 'LOCK', s.x, y0 - 6, ctx.strokeStyle, 'bold 12px Consolas,monospace', 'center');
    }

    // 目标速度矢量线
    if (t.kind === 'air' && t.fwd) {
      ctx.strokeStyle = 'rgba(79,224,138,0.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + t.fwd.x * 34, s.y - t.fwd.y * 34);
      ctx.stroke();
    }

    /* 数据块。行高统一由 ly 递推 —— 之前每一行都写死 y 偏移，
       中间插一行就得手工挪后面所有的数字。 */
    var tx = s.x + w + 8, ty = s.y - h;
    var label = t.label || (t.name || T('ui.hud.targeting.drawLockBox.label.s1'));
    // 数据块的颜色跟着框走，保持一致
    var col = inNez ? $.RED : (outMax ? FAR : $.AMBER);

    /* 第一行机型代号（粗体，框色）—— 效仿皇牌空战，红框旁边直接写清那是什么飞机，
       用 cn（中文名）而不是 nick（英文绰号）。对火控来说认机型才是要紧的；
       呼号是风味信息，放第二行、用普通字重。以前呼号在前。 */
    var ly = ty + 10;
    if (t.ac || t.shipClass) {
      $.text(ctx, t.ac ? (t.ac.name + ' ' + t.ac.cn) : t.shipClass, tx, ly, col, 'bold 12px Consolas,monospace', 'left');
      ly += 14;
      if (t.label) { $.text(ctx, t.label, tx, ly, col, $.FS, 'left'); ly += 14; }
    } else {
      $.text(ctx, label, tx, ly, col, 'bold 12px Consolas,monospace', 'left');
      ly += 14;
    }

    $.text(ctx, (dist / 1000).toFixed(2) + ' KM', tx, ly, $.DIM, $.FS, 'left');
    ly += 14;

    if (t.kind === 'air') {
      var dh = t.pos.y - p.pos.y;
      $.text(ctx, (dh >= 0 ? '+' : '') + dh.toFixed(0) + ' M', tx, ly, $.DIM, $.FS, 'left');
      ly += 14;
      // 目标动压
      if (t.q !== undefined) {
        $.text(ctx, 'Q ' + t.q.toFixed(0), tx, ly, t.q < 12 ? $.AMBER : $.DIM, $.FS, 'left');
        ly += 14;
      }
    } else {
      // 舰船写舰种（SHIPS[].cls）；其余按浮空 / 海面设施
      var scls = shipClsOf(t);
      $.text(ctx, scls ? (t.platform ? T('ui.hud.targeting.drawLockBox.s1') : T('ui.hud.targeting.drawLockBox.s2')) + scls : (t.ttype === 'air' ? T('ui.hud.targeting.drawLockBox.s3') : T('ui.hud.targeting.drawLockBox.s4')), tx, ly, $.DIM, $.FS, 'left');
      ly += 14;
    }

    /* 包线状态写在框的**正下方**居中：它是"现在能不能打"的判断，
       该和框本身挨在一起，而不是混在右侧的数据列里。
       让开锁定进度环（半径 max(w,h)+10）。 */
    var envY = s.y + Math.max(w, h) + 24;
    if (inNez) {
      $.text(ctx, 'NEZ', s.x, envY, $.RED, 'bold 12px Consolas,monospace', 'center');
    } else if (env && !outMax) {
      $.text(ctx, 'IN RNG', s.x, envY, $.AMBER, 'bold 12px Consolas,monospace', 'center');
    }

    /* 锁定进度环：
         锁定中（在锥内、射程内）   琥珀实线，往前走
         锁不了（锥外或射程外）     暗色虚线，进度往回掉 —— 一眼看出"现在不在锁"
         已锁定                     不画（改由上面的双层角框表示） */
    if (!p.locked) {
      var rr = Math.max(w, h) + 10;
      ctx.save();
      if (p.lockOk) { ctx.strokeStyle = $.AMBER; ctx.lineWidth = 3; }
      else { ctx.strokeStyle = 'rgba(255,176,58,0.38)'; ctx.lineWidth = 2; if (ctx.setLineDash) ctx.setLineDash([4, 4]); }
      ctx.beginPath();
      if (p.lockOk || p.lockProgress > 0.01) {
        ctx.arc(s.x, s.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(p.lockOk ? 0 : 1, p.lockProgress));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ============================================================
     导弹视场提示（常驻）

     拿着制导武器就一直画，没有出现 / 消失的条件 —— 只换样式：
       没有目标                       暗色虚线
       有目标，但在锥外或锁定距离外   淡橙虚线
       目标在锥内且在锁定距离内       红色实线（能锁）
     对空弹：机头周围的圆，半径 = 锁定锥；圆比屏幕还大就不画（大离轴弹）。
     对面弹：锥只量水平方位，在地平线附近画两道短竖线标出左右边界。
     锥宽的弹，圆多数时候整个在画面外，不会增加画面负担。
     ============================================================ */
  function drawConeCue(ctx, W, H, cam, p) {
    var w = WEAPONS[p.special];
    if (!w || !w.seeker || w.seeker === 'none' || w.tags.unguided || !w.lockCone) return;
    var cone = p.lockCone || w.lockCone;
    var t = p.target && p.target.alive ? p.target : null;
    var hot = !!(t && p.lockInCone && p.lockInRange);
    ctx.save();
    ctx.strokeStyle = hot ? $.RED : (t ? 'rgba(255,176,58,0.42)' : 'rgba(150,170,180,0.22)');
    ctx.lineWidth = hot ? 1.6 : 1.4;
    if (!hot && ctx.setLineDash) ctx.setLineDash([6, 6]);
    if (Ent.targetClass(w, t) === 'air') {      // 对空对地通用（any）随当前目标走；无目标默认圆
      var bs = M3.project(cam, M3.add(p.pos, M3.mul(p.fwd, 2000)));
      var r = cam.focal * Math.tan(Math.min(1.45, cone));
      if (bs && r < Math.max(W, H)) {
        ctx.beginPath(); ctx.arc(bs.x, bs.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      var hx = p.fwd.x, hz = p.fwd.z, hl = Math.sqrt(hx * hx + hz * hz);
      if (hl > 0.05) {
        hx /= hl; hz /= hl;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var a = sgn * cone, ca = Math.cos(a), sa = Math.sin(a);
          // 绕世界竖轴转 a：方位边界的方向，取远处海平面附近的一点
          var dx = hx * ca + hz * sa, dz = -hx * sa + hz * ca;
          var q = M3.project(cam, M3.V(p.pos.x + dx * 20000, Math.max(0, p.pos.y - 3000), p.pos.z + dz * 20000));
          if (!q) continue;
          ctx.beginPath(); ctx.moveTo(q.x, q.y - $.U(22)); ctx.lineTo(q.x, q.y + $.U(22)); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /** 点在多边形内（射线法）。poly 是 [[x,z], ...] 数组，pt 是 [x,z]。 */
  function pointInPolygon(pt, poly) {
    var x = pt[0], z = pt[1], inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  }
})(HUD);
