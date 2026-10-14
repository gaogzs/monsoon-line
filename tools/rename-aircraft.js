/* ============================================================
   rename-aircraft.js —— 把机型编号同步到注释与文档

   命名规范（设定集 8.1）：
     上游  —— 用途前缀，取逻辑语词根的首字母（舰载型在尾部追加一个字母）
                D-   damba  战斗      D-14 / D-21 / D-33
                DB-  damba + bloti  舰载战斗      DB-11
                F-   fanta  阻止（截击）          F-9
                G-   gunta  攻击                  G-6
     下游  —— 厂商前缀（参照苏联按设计局分的做法）
                ROK- rokci  岩石设计局            ROK-27
                GAL- galtu  高空设计局            GAL-31
                VAC- vacri  空气设计局            VAC-14
     分水  —— 商品名，无字母前缀（参照达索 Mirage）
     管理局 —— 批次名，不挂军标

   只做精确整串替换，不用通配，避免误伤更长或更短的编号。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const CWD = path.resolve(__dirname, '..');

const PLANES = [
  // 当前一轮
  ['DA-11', 'DB-11'],
  ['DA-14', 'D-14'],
  ['DA-21', 'D-21'],
  ['DA-33', 'D-33'],
  ['FA-9', 'F-9'],
  ['GU-6', 'G-6'],
  // 早先的中间命名
  ['BL-11', 'DB-11'],
  ['GA-14', 'D-14'],
  ['MI-21', 'D-21'],
  ['SU-33', 'D-33'],
  ['RO-27', 'ROK-27'],
  // 分水与管理局在正文里直接叫商品名 / 批次名
  ['XA-8', '潮线'],
  ['ME-2', '水准']
];

const FILES = [
  'js/data.js', 'js/models.js', 'js/planform.js', 'js/codex.js',
  'js/missions.js', 'js/game.js',
  'docs/world/SETTING.md',
  'docs/systems/flight-model.md',
  'docs/systems/planform.md',
  'docs/systems/weapons.md',
  'docs/systems/loadout.md',
  'docs/DESIGN.md', 'docs/README.md', 'README.md'
];

let total = 0;
for (const rel of FILES) {
  const f = path.join(CWD, rel);
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const [a, b] of PLANES) {
    // 编号两侧不能是字母数字，避免误伤更长/更短的编号
    const re = new RegExp('(?<![A-Za-z0-9])' + a.replace('-', '\\-') + '(?![0-9])', 'g');
    const hits = s.match(re);
    if (hits) { s = s.replace(re, b); n += hits.length; }
  }
  if (n) { fs.writeFileSync(f, s); console.log('  ' + rel + '  替换 ' + n + ' 处'); total += n; }
}
console.log('  合计 ' + total + ' 处');
