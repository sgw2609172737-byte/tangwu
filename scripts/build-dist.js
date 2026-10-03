'use strict';
// 可直接托管的离线版本；本地菜单作为首页，共享规则来自仓库根目录。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive:true });
for (const name of ['local.html','artbook.html','rules.html','ui.js','local.js','style.css','home.css','refinement.css','home.js','battle-fx.js','ai-worker.js','assets','favicon.svg']) {
  const source = path.join(root, 'public', name);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(dist, name), { recursive:true });
}
for (const name of ['skills.js','engine.js','ai.js']) fs.copyFileSync(path.join(root, name), path.join(dist, name));
for (const name of ['local.html','artbook.html']) {
  const file = path.join(dist, name);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/src="\.\.\/(skills|engine|ai)\.js"/g, 'src="$1.js"'));
}
fs.copyFileSync(path.join(dist, 'local.html'), path.join(dist, 'index.html'));
console.log('Static local build synchronized: ' + dist);
