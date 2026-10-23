/* ============================================================
   route.js —— 分段航线（关卡脚本用）

   航线型单位（轰炸机、干扰机、勤务机）原来只有"飞到一个点、触发一次
   onArrive、再飞去出口"这一种写法。所以轰炸机只能"到点就放弹"，
   放不放得到全看航点写在哪 —— 第 8 关的两枚 BOX-14 就是在射程外放的。

   现在一条航线可以是一串"段"，一段做完再做下一段：

     a.route = Route.plan([
       { do: 'goto',   wp: M3.V(x, 0, z), alt: 4500 },
       { do: 'strike', weapon: 'vsr', pick: 'nearest', rangeK: 0.8, alt: 4500, shots: 1, timeout: 90 },
       { do: 'call',   fn: function (a, world) { ... } },
       { do: 'loiter', a: M3.V(...), b: M3.V(...), alt: 11000, time: 60, jam: {...} },
       { do: 'egress', wp: M3.V(x, 0, z), alt: 6000 }
     ]);

   段的类型：
     goto    飞到 wp（水平距离 < arrive，缺省 2000 m）
     strike  找一个这件武器能打的敌方目标，保持 alt 飞过去，
             进入"有效射程 × rangeK"、目标在锁定锥内、武器冷却好了就发射；
             发满 shots 发进入下一段。目标没了换一个；一个都没有就跳过；
             timeout 秒内没打完就放弃。只用 weapon 这一件 —— 自卫弹不参与
             pick：'nearest'（缺省）| 'biggest'（maxHp 最大）| function (t, a) → 分数（越小越优先，返回 null 跳过）
     call    执行 fn(a, world)，立刻进入下一段（播无线电、触发关卡事件）
     loiter  在 a ↔ b 之间来回飞；time 秒后（或 until(a, world) 为真时）进入下一段，
             两者都不给就永远盘旋。jam：随队干扰机的自动开机（ai.js 的 jamAuto）
     egress  飞到 wp 后离场消失（escaped，战报不给任何人记功）

   执行器只负责"现在往哪飞、多高、要不要开火"：把结果写进 route.wp / route.alt，
   转向和高度保持仍由 ai.js 的 updateRoute 做。旧的单段写法（wp + onArrive + exit）不变。
   ============================================================ */
var Route = (function () {
  'use strict';

  var ARRIVE = 2000;

  /* opt.jam：整条航线都生效的随队干扰（飞往站位途中也会开机）；loiter 段的 jam 可以覆盖它 */
  function plan(legs, opt) {
    var jam = (opt && opt.jam) || null;
    return { legs: legs.slice(), leg: 0, legT: 0, wp: null, alt: 0, arrive: ARRIVE, jamBase: jam, jam: jam };
  }

  function hdist(a, b) {
    var dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function next(r) {
    r.leg++;
    r.legT = 0;
    r.st = null;
    r.jam = r.jamBase || null;
  }

  /* strike 的选目标：敌对、活着、这件武器打得了 */
  function pickTarget(a, L, w, world) {
    var best = null, bs = Infinity, i, list;
    var surf = w.target === 'ground' || w.target === 'ship';
    list = surf ? (world.targets || []) : (world.actors || []);
    for (i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t.alive || t.dead || !Ent.hostile(t, a)) continue;
      if (!Ent.weaponMatchesTarget(w, t)) continue;
      var s;
      if (typeof L.pick === 'function') s = L.pick(t, a);
      else if (L.pick === 'biggest') s = -(t.maxHp || t.hp || 0);
      else s = M3.dist2(t.pos, a.pos);
      if (s === null || s === undefined) continue;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }

  function stepStrike(a, r, L, world) {
    var w = WEAPONS[L.weapon];
    var st = r.st || (r.st = { shots: 0, tgt: null });
    if (!w || (L.timeout && r.legT > L.timeout)) { next(r); return; }
    var ammo = a.ammoPool ? (a.ammoPool[L.weapon] || 0) : 0;
    if (ammo <= 0 || st.shots >= (L.shots || 1)) { next(r); return; }
    if (!st.tgt || !st.tgt.alive || st.tgt.dead) st.tgt = pickTarget(a, L, w, world);
    if (!st.tgt) { next(r); return; }
    var t = st.tgt;
    r.wp = t.pos;
    r.alt = L.alt !== undefined ? L.alt : a.pos.y;
    r.arrive = 0;                              // strike 不靠"到点"结束

    var surf = Ent.targetClass(w, t) === 'surface';
    var d = surf ? hdist(t.pos, a.pos) : M3.dist(t.pos, a.pos);
    var reach = Ent.aiReach(w, a.pos.y, L.rangeK === undefined ? 0.8 : L.rangeK);
    if (d > reach) return;
    /* 锁定锥：对面弹只量水平方位（Ent.lockOff）—— 轰炸机保持高度飞，目标在机头下方
       三十多度是常态（4.5 km 高、7 km 远就是 33°），俯冲交给弹自己。 */
    if (Ent.lockOff(a, t, w) > (w.lockCone || 0.6)) return;
    /* 动态射程（与 AI 同一套）：制导弹还要在真实弹道的 rmax 余量之内才放，
       静态 aiReach 只是上界。缓存挂在航线状态 r 上，0.2 s 刷新。 */
    if (w.seeker && w.seeker !== 'none' && !w.tags.unguided) {
      var env = Ent.envelopeCached(r, world.time || 0, { pos: a.pos, fwd: a.fwd, speed: a.speed + 70 }, w, L.weapon, t, 0.2);
      if (d > Math.min(w.lockDist || Infinity, env.rmax) * (t.kind === "target" ? 0.8 : 0.9)) return;   // 余量：对空 0.9、对地 0.8
    }
    Ent.setWeapon(a, L.weapon);
    if (!(a.spAmmo > 0) || a.spCd > 0) return;
    if (world.fireMissile && world.fireMissile(a, t)) {
      st.shots++;
      if (L.onFire) L.onFire(a, world, t);
    }
  }

  /* 每帧（ai.js 的 updateRoute 在转向之前调）。返回 'gone' 表示单位已离场。 */
  function step(a, r, dt, world) {
    r.legT += dt;
    for (var guard = 0; guard < 8; guard++) {
      var L = r.legs[r.leg];
      if (!L) { a.alive = false; a.escaped = true; return 'gone'; }
      var before = r.leg;
      switch (L.do) {
        case 'call':
          L.fn(a, world);
          next(r);
          break;
        case 'goto':
        case 'egress':
          r.wp = L.wp; r.alt = L.alt !== undefined ? L.alt : r.alt || a.pos.y;
          r.arrive = L.arrive || ARRIVE;
          if (hdist(L.wp, a.pos) < r.arrive) {
            if (L.do === 'egress') { a.alive = false; a.escaped = true; return 'gone'; }
            next(r);
          }
          break;
        case 'loiter':
          if (!r.st) r.st = { to: L.a };
          r.alt = L.alt !== undefined ? L.alt : a.pos.y;
          r.arrive = L.arrive || 2600;
          r.jam = L.jam || r.jamBase || null;
          if (hdist(r.st.to, a.pos) < r.arrive) r.st.to = (r.st.to === L.a) ? L.b : L.a;
          r.wp = r.st.to;
          if ((L.time && r.legT > L.time) || (L.until && L.until(a, world))) next(r);
          break;
        case 'strike':
          stepStrike(a, r, L, world);
          break;
        default:
          next(r);
      }
      if (r.leg === before) return null;       // 这一段还在进行
    }
    return null;
  }

  return { plan: plan, step: step };
})();
