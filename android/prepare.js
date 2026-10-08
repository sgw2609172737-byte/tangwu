'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
require('../scripts/build-dist');
const output = path.join(__dirname, 'app/src/main/assets/site');
fs.mkdirSync(output, {recursive:true});
// Remove only this generated asset folder, after checking it is inside android/app.
const expected = path.join(__dirname, 'app/src/main/assets/site');
if (path.resolve(output) !== path.resolve(expected)) throw Error('Unexpected Android asset path');
fs.rmSync(output, {recursive:true, force:true});
fs.cpSync(path.join(root, 'dist'), output, {recursive:true});
for (const name of ['mobile.js', 'mobile.css']) fs.copyFileSync(path.join(__dirname, name), path.join(output, name));
for (const name of ['index.html', 'local.html', 'studio.html']) {
  const file = path.join(output, name);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace('</head>', '<link rel="stylesheet" href="mobile.css">\n</head>')
    .replace('<script src="training-ui.js"></script>', '<script src="mobile.js"></script>\n<script src="training-ui.js"></script>');
  if(name==='studio.html')html=html.replace('<script src="studio.js">','<script src="mobile.js"></script><script src="studio.js">');
  fs.writeFileSync(file, html);
}
console.log('Android offline assets prepared: ' + output);
