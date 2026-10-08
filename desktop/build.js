'use strict';
// 组装 Electron 打包目录：拷贝本地版依赖文件 + 写入 main.js / package.json
// 用法：node tools/build-electron.js [输出目录]   （默认 ../../tangwu-electron/app）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', '..', 'tangwu-electron', 'app');

const files = [
  ['desktop/main.js', 'main.js'],
  ['desktop/preload.js', 'preload.js'],
  ['desktop/studio-preload.js', 'studio-preload.js'],
  ['lib/local-training.js', 'lib/local-training.js'],
  ['skills.js', 'skills.js'],
  ['engine.js', 'engine.js'],
  ['ai.js', 'ai.js'],
  ['learning.js', 'learning.js'],
  ['neural-model.js', 'neural-model.js'],
  ['ranked.js', 'ranked.js'],
  ['replay.js','replay.js'],
  ['public/training-ui.js','public/training-ui.js'],
  ['public/training.css','public/training.css'],
  ['public/local.html', 'public/local.html'],
  ...['studio.html','studio.css','studio.js','study-core.js','study-worker.js','command-palette.js','design-interactions.css','vendor'].map(name=>['public/'+name,'public/'+name]),
  ['public/ui.js', 'public/ui.js'],
  ['public/local.js', 'public/local.js'],
  ['public/ai-worker.js', 'public/ai-worker.js'],
  ['public/rank-ui.js', 'public/rank-ui.js'],
  ['public/ranked.css', 'public/ranked.css'],
  ['public/style.css', 'public/style.css'],
  ['public/home.css', 'public/home.css'],
  ['public/refinement.css', 'public/refinement.css'],
  ['public/liquid-glass.css', 'public/liquid-glass.css'],
  ['public/glass-controls.js', 'public/glass-controls.js'],
  ['public/glass-material.js', 'public/glass-material.js'],
  ['public/licenses', 'public/licenses'],
  ['public/home.js', 'public/home.js'],
  ['public/battle-fx.js', 'public/battle-fx.js'],
  ['public/rules.html', 'public/rules.html'],
  ['public/artbook.html', 'public/artbook.html'],
  ['public/assets', 'public/assets'],
  ['tools/icon.ico', 'icon.ico'],
];

fs.mkdirSync(path.join(OUT, 'public'), { recursive: true });
for (const [src, dst] of files) {
  const full = path.join(ROOT, src);
  const target = path.join(OUT, dst);
  if (fs.existsSync(full)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(full, target, { recursive: true, force: true });
  }
  else console.warn('  [跳过] 缺少文件:', src);
}

const pkg = {
  name: 'tangwu-local',
  version: '1.0.0',
  description: '唐五 本地版',
  main: 'main.js',
  scripts: { dist: 'electron-builder --win portable' },
  devDependencies: { electron: '^31.7.7', 'electron-builder': '^24.13.3' },
  build: {
    appId: 'com.tangwu.local',
    productName: 'TangWu',
    directories: { output: 'dist' },
    files: ['main.js', 'studio-preload.js', 'preload.js','lib/local-training.js','skills.js', 'engine.js', 'ai.js', 'ranked.js', 'learning.js', 'neural-model.js','replay.js', 'icon.ico', 'public/**/*'],
    win: { target: ['portable'], icon: 'icon.ico' },
    // In the installed electron-builder 24, true omits UNPACK_DIR_NAME and
    // selects per-launch $PLUGINSDIR. false is incorrectly treated as default.
    portable: { artifactName: 'TangWu.exe', unpackDirName: true },
  },
};

fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('已组装 Electron 应用目录：', OUT);
console.log('文件：', files.map(([, d]) => d).join(', '), '+ main.js + package.json');
