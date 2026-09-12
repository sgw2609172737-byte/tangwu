'use strict';
// Vercel 静态根目录是 public；共享规则仍以仓库根目录版本为唯一源文件。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['skills.js', 'engine.js', 'ai.js']) {
  fs.copyFileSync(path.join(root, name), path.join(root, 'public', name));
  console.log(`Published shared script: ${name}`);
}
