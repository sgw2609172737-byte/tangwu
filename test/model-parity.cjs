'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),L=require('../learning');
const path=process.argv[2];if(!path) throw new Error('Model path is required');
const model=L.prepareModel(JSON.parse(fs.readFileSync(path,'utf8'))),reference=JSON.parse(fs.readFileSync(path.replace(/\.json$/,'.parity.json'),'utf8'));
let maxError=0;
for(let n=0;n<reference.x.length;n++) {
  const p=L.predict(model,Float32Array.from(reference.x[n]));
  p.logits.forEach((v,i)=>{maxError=Math.max(maxError,Math.abs(v-reference.logits[n][i]));});
  maxError=Math.max(maxError,Math.abs(p.value-reference.value[n]));
}
assert.ok(maxError<1e-4,'Inference parity error '+maxError);console.log('PASS: PyTorch / JS inference parity, max error '+maxError);
