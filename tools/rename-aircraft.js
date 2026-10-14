/* ============================================================
   rename-aircraft.js —— 把机型编号同步到注释与文档

   命名规则（设定集 8.1）：
     · 外号   —— 自然语言传统（上游海鸟/海鱼、下游矿物/岩石）
     · 前缀   —— 逻辑语 rafsi 取两字母，含义对应用途
     · 武器   —— 逻辑语 rafsi 取三字母

   只做精确整串替换，不用通配 —— 否则 `A-6` 会误伤 `BAD-6` 之类。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const CWD = path.resolve(__dirname, '..');

// 旧编号 → 新编号（按长度降序，避免 A-6 先被 G-2 之类的规则干扰）
const PLANES = [
  ['C-11', 'BL-11'],   // bloti 船/艇   —— 舰载
  ['I-14', 'GA-14'],   // galtu 高      —— 平流层制空
  ['A-6',  'GU-6'],    // gunta 攻击    —— 近距支援
  ['I-9',  'FA-9'],    // fanta 阻止    —— 高空截击
  ['F-21', 'MI-21'],   // mipri 秘密    —— 隐形
  ['F-33', 'SU-33'],   // sutra 快      —— 高机动格斗
  ['M-27', 'RO-27'],   // rokci 岩石    —— 下游
  ['K-8',  'XA-8'],    // xamsi 海      —— 分水群岛国
  ['G-2',  'ME-2']     // merli 测量    —— 管理局
];

const FILES = [
  'js/data.js',        // 注释与 desc 里的机型名（name 字段已单独改过）
  'js/models.js',
  'js/planform.js',
  'js/codex.js',
  'js/missions.js',
  'docs/world/SETTING.md',
  'docs/systems/flight-model.md',
  'docs/systems/planform.md',
  'docs/systems/weapons.md',
  'docs/systems/loadout.md',
  'docs/DESIGN.md',
  'docs/README.md',
  'README.md'
];

let total = 0;
for (const rel of FILES) {
  const f = path.join(CWD, rel);
  if (!fs.existsSync(f)) { continue; }
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const [a, b] of PLANES) {
    // 编号前后不能是字母或数字，避免误伤更长/更短的编号
    const re = new RegExp('(?<![A-Za-z0-9])' + a.replace('-', '\\-') + '(?![0-9])', 'g');
    const hits = s.match(re);
    if (hits) { s = s.replace(re, b); n += hits.length; }
  }
  if (n) {
    fs.writeFileSync(f, s);
    console.log('  ' + rel + '  替换 ' + n + ' 处');
    total += n;
  }
}
console.log('  合计 ' + total + ' 处');
