/* ============================================================
   arena.js —— 战区边界（docs/POST2-0IMPL.md 批次 4.1）

   关卡声明 mission.arena = { cx, cz, half, warn }（世界米；方形）：
     half  真边界到中心的距离；越过它算"越界"
     warn  警告区宽度；边界内侧 warn 米之内算"警告"
   用切比雪夫距离（方形）：edge = half − max(|x−cx|, |z−cz|)。

     Arena.state(arena, pos) → { zone: 'in' | 'warn' | 'out', depth, edgeDist }
       depth：警告区内 0→1 随深入线性增加；越界恒为 1
       edgeDist：到真边界的距离（越界为负）
     没有 arena 的关卡（或 arena 为空）恒返回 'in'。

   只读 arena 与 pos，不依赖别的全局，所以加载期顺序无所谓。
   ============================================================ */
'use strict';

var Arena = (function () {
  var IN = { zone: 'in', depth: 0, edgeDist: Infinity };

  function state(arena, pos) {
    if (!arena || !pos) return IN;
    var d = Math.max(Math.abs(pos.x - arena.cx), Math.abs(pos.z - arena.cz));
    var edge = arena.half - d;
    if (edge <= 0) return { zone: 'out', depth: 1, edgeDist: edge };
    if (edge < arena.warn) return { zone: 'warn', depth: 1 - edge / arena.warn, edgeDist: edge };
    return { zone: 'in', depth: 0, edgeDist: edge };
  }

  /* 界外整备区：战场某一侧（side = '+x' | '-x' | '+z' | '-z'）的警告区或界外。
     "这一侧"按主导方向算：偏离中心最多的那根轴的符号；四个角落归偏得更多的那根轴，
     所以每个位置至多属于一侧。 */
  function inEdge(arena, pos, side) {
    if (!arena || !pos || !side) return false;
    var dx = pos.x - arena.cx, dz = pos.z - arena.cz;
    var v = side.charAt(1) === 'x' ? dx : dz;
    var o = side.charAt(1) === 'x' ? dz : dx;
    if (v * (side.charAt(0) === '-' ? -1 : 1) <= 0) return false;      // 不在这一侧
    if (Math.abs(v) < Math.abs(o)) return false;                      // 主导方向不是这一侧
    return arena.half - Math.abs(v) < arena.warn;                     // 进了警告区（含越界）
  }

  /** 校验 mission.arena 的字段（smoke 调）；返回错误串或 null */
  function validate(arena) {
    if (arena === undefined) return null;
    if (!arena) return 'arena is empty';
    var ks = ['cx', 'cz', 'half', 'warn'];
    for (var i = 0; i < ks.length; i++) {
      if (typeof arena[ks[i]] !== 'number' || !isFinite(arena[ks[i]])) return 'arena.' + ks[i] + ' is not a finite number';
    }
    if (arena.half <= 0 || arena.warn <= 0 || arena.warn >= arena.half) return 'arena.half / warn out of range';
    return null;
  }

  return { state: state, inEdge: inEdge, validate: validate };
})();
