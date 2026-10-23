/* ============================================================
   scripts.js —— 脚本加载顺序的唯一读取入口（docs/POST2-0IMPL.md 1.1）

   加载顺序的唯一权威是 tools/build/gen-index.js 的层规则。
   所有工具都从这里取，不再各自写正则或硬编码名单 ——
   拆出子目录、带连字符的文件名之后也不会被静默漏掉。

     const Scripts = require('./lib/scripts');
     Scripts.loadOrder()            // ['js/version.js', 'js/core/math3d.js', …]
     Scripts.pick(['math3d','data'])// 按加载顺序，只留这些文件名（不含目录与扩展名）
     Scripts.baseName('js/a/b.js')  // 'b'
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/** 全部脚本（含语言包），按加载顺序；顺序的权威是 tools/build/gen-index.js */
function loadOrder(lang) {
  return require('../build/gen-index').scripts(lang || 'zh-CN');
}

function baseName(p) { return path.basename(p).replace(/\.js$/, ''); }

function pick(names, lang) {
  const want = new Set(names);
  return loadOrder(lang).filter(p => want.has(baseName(p)));
}

/** 离线预览 / 出图工具要的脚本：除了游戏控制器（Game 的界面、输入、相机、HUD、启动）之外的全部 */
function preview(lang) {
  return loadOrder(lang).filter(p => !/^js\/(engine\/game\/|ui\/screens\/|ui\/input\.js|ui\/camera\.js|ui\/frame\.js|ui\/hud\/|boot\/)/.test(p) &&
    !/^js\/ui\/(radio|sysnote)\.js$/.test(p));
}

module.exports = { loadOrder, pick, preview, baseName, ROOT };
