/* ============================================================
   rename-aircraft.js —— 一次性工具：把机型改名同步到注释与文档

   只做精确的整串替换，不做通配 —— 否则 `S-6` 会误伤武器编号 `GUS-6`。
   用完即弃，但留着以防以后还有批次需要改。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const CWD = path.resolve(__dirname, '..');

const JOBS = [
  ['js/models.js', [
    ['C-14「旗鱼」', 'I-14「旗鱼」'],
    ['S-6「鲣鸟」', 'A-6「鲣鸟」'],
    ['C-9「海燕」', 'I-9「海燕」'],
    ['C-21「贼鸥」', 'F-21「贼鸥」'],
    ['C-33「信天翁」Albatross —— 无人僚机母机', 'F-33「信天翁」Albatross —— 高机动格斗机']
  ]],
  ['js/planform.js', [
    ['C-14 旗鱼', 'I-14 旗鱼'],
    ['S-6 鲣鸟', 'A-6 鲣鸟'],
    ['C-9 海燕', 'I-9 海燕'],
    ['C-21 贼鸥', 'F-21 贼鸥'],
    ['C-33 信天翁 · 前掠翼僚机母机', 'F-33 信天翁 · 前掠翼高机动格斗机']
  ]],
  ['docs/world/SETTING.md', [
    ['**C-14**', '**I-14**'],
    ['**S-6**', '**A-6**'],
    ['**C-9**', '**I-9**'],
    ['**C-21**', '**F-21**'],
    ['**C-33**', '**F-33**'],
    ['**A-2**', '**G-2**'],
    ['C-33 | 信天翁 | 无人僚机母机 | **前掠翼** | 转得比这里任何一架都快',
      'F-33 | 信天翁 | 高机动格斗机 | **前掠翼** | 转得比这里任何一架都快']
  ]],
  ['docs/systems/weapons.md', [
    ['C-11 · C-14', 'C-11 · I-14'],
    ['| S-6 |', '| A-6 |']
  ]]
];

let total = 0;
for (const [rel, pairs] of JOBS) {
  const f = path.join(CWD, rel);
  if (!fs.existsSync(f)) { console.log('  (跳过，不存在) ' + rel); continue; }
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const [a, b] of pairs) {
    const cnt = s.split(a).length - 1;
    if (cnt) { s = s.split(a).join(b); n += cnt; }
  }
  if (n) {
    fs.writeFileSync(f, s);
    console.log('  ' + rel + '  替换 ' + n + ' 处');
    total += n;
  } else {
    console.log('  ' + rel + '  (无需替换)');
  }
}
console.log('  合计 ' + total + ' 处');
