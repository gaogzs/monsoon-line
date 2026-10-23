/* 仓库根目录（tools 下的脚本搬到哪一层都用它，不再数 '..'） */
'use strict';
const path = require('path');
module.exports = { ROOT: path.resolve(__dirname, '..', '..') };
