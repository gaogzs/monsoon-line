(function (AI) {
  'use strict';
  var $ = AI.$;

  /* ============================================================
     态势记忆（docs/POST2-0IMPL.md 5.7「导演与系统」，批次 5f）

     以前 AI 全知：不管目标在哪、玩家怎么甩、怎么静默，它都知道你当前的位置。轻量版：
       能"感知到"目标 = 近距目视（< SEE_R）、或雷达前半球（< RADAR_R、离机头 ≤ 120°）、
                         或己方预警机在线（未被压制）、或同队有别的 AI 离目标 < LINK_R（数据链共享）
       感知不到 → 不再知道目标当前位置：向 lastKnown（位置 + 速度外推）飞去搜索；
                 T_SEARCH 秒内重新感知到就恢复，超时放弃目标（重选 / 外围游走）；有预警机时记忆时间翻倍
       目标开 emcon（电磁静默）或自带 lockResist（隐身 / 抗锁定吊舱）时，雷达与数据链的有效距离缩小。
     只给 skill ≥ MIN_SKILL 的飞行员；低技能保持全知（不改变入门关的体验）。面目标 / 无人僚机不适用。
     ============================================================ */
  $.MEM = { MIN_SKILL: 0.6, SEE_R: 6000, RADAR_R: 16000, LINK_R: 8000, T_SEARCH: 6, FWD_ANG: 2.094 };

  function hasAewc(a, world) {
    for (var i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (e.aewc && e.alive && e.team === a.team && !((e.suppressed || 0) > 0.3)) return true;
    }
    return false;
  }

  $.perceives = function (a, world, t) {
    var d = M3.dist(a.pos, t.pos);
    var k = (t.emcon ? 0.55 : 1) * (t.lockResist ? (1 - t.lockResist * 0.6) : 1);
    if (d < $.MEM.SEE_R) return true;
    if (hasAewc(a, world)) return true;
    var to = M3.mul(M3.sub(t.pos, a.pos), 1 / Math.max(1, d));
    if (d < $.MEM.RADAR_R * k && Math.acos(Math.max(-1, Math.min(1, M3.dot(a.fwd, to)))) < $.MEM.FWD_ANG) return true;
    for (var i = 0; i < world.actors.length; i++) {
      var m = world.actors[i];
      if (m === a || !m.alive || m.team !== a.team || !m.ai || m.route) continue;
      if (M3.dist(m.pos, t.pos) < $.MEM.LINK_R * k) return true;
    }
    return false;
  };

  /* 决策层调用：维护 s.lastKnown / s.lostSightT；超时放弃目标。返回 true = 此刻处于"搜索"（看不见目标） */
  $.memStep = function (a, s, world, dt) {
    var t = s.target;
    if (s.skill < $.MEM.MIN_SKILL || !t || !t.alive || t.kind === 'target' || s.role === 'drone') { s.lostSightT = 0; s.lastKnown = null; return false; }
    if ($.perceives(a, world, t)) {
      s.lastKnown = { pos: M3.clone(t.pos), vel: t.vel ? M3.clone(t.vel) : M3.mul(t.fwd, t.speed || 0), t: 0 };
      s.lostSightT = 0;
      return false;
    }
    s.lostSightT += dt;
    if (s.lastKnown) s.lastKnown.t += dt;
    var lim = $.MEM.T_SEARCH * (hasAewc(a, world) ? 2 : 1);
    if (s.lostSightT > lim) { s.target = null; s.lastKnown = null; s.lostSightT = 0; s.retargetT = 0; s.lostT = null; return false; }
    return true;
  };

  /* 搜索时的"伪目标"：lastKnown 按速度外推（随时间衰减），给 pursue() 用 */
  $.searchGhost = function (s) {
    var k = s.lastKnown;
    if (!k) return null;
    var tt = Math.min(k.t, 8), f = Math.exp(-k.t / 6);
    var pos = M3.add(k.pos, M3.mul(k.vel, tt * f));
    var sp = M3.len(k.vel);
    return { alive: true, kind: 'aircraft', pos: pos, vel: M3.mul(k.vel, f), speed: sp * f, fwd: sp > 1 ? M3.mul(k.vel, 1 / sp) : M3.V(0, 0, 1), up: M3.V(0, 1, 0), right: M3.V(1, 0, 0), ghost: true };
  };
})(AI);
