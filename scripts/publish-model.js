'use strict';
// Publish an inspectable candidate. Promotion requires fresh paired matches at two budgets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),args={};for(let i=2;i<process.argv.length;i+=2) args[process.argv[i].slice(2)]=process.argv[i+1];
if(!args.model) throw new Error('--model is required');
const model=JSON.parse(fs.readFileSync(args.model,'utf8'));
const modelHash=crypto.createHash('sha256').update(fs.readFileSync(args.model)).digest('hex');
const rulesHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'engine.js'))).update(fs.readFileSync(path.join(root,'skills.js'))).digest('hex');
if(model.rulesSha256!==rulesHash) throw new Error('Model was trained under different rules');
model.approved=false;model.inference={heuristicBlend:Number(args.blend || 0)};
if(args.promotion && args.long) {
  const report=JSON.parse(fs.readFileSync(args.promotion,'utf8')),long=JSON.parse(fs.readFileSync(args.long,'utf8'));
  if(report.modelSha256!==modelHash || long.modelSha256!==modelHash || report.baseline!=='search-expert' || long.baseline!=='search-expert' || report.blend!==model.inference.heuristicBlend || long.blend!==model.inference.heuristicBlend) throw new Error('Promotion results do not belong to this model/baseline');
  const trainSeed=model.seed;
  const ranges=model.training.seedRanges || [[trainSeed,trainSeed+30000+128]];
  for(const r of [report,long]) if(ranges.some(([start,end])=>r.seed<=end && r.seed+r.pairs-1>=start) || r.budgetMs<=0) throw new Error('Promotion seed overlaps training or invalid budget');
  if(long.budgetMs<250 || report.seed===long.seed) throw new Error('Need independent long-budget evaluation');
  const n=report.wins+report.losses,p=n?report.wins/n:0,z=1.96;
  const lower=n?(p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n):0;
  if(report.games.length<64 || report.score<.6 || lower<=.5 || report.unfinished>0 || long.games.length<16 || long.score<=.5 || long.unfinished>0) throw new Error('Candidate did not pass promotion criteria');
  model.approved=true;model.promotion={blitz:report,long,decisiveWinRateLower95:lower};
}
fs.mkdirSync(path.join(root,'models'),{recursive:true});
const formal=path.join(root,'models','tangwu-pv.json');
if(!model.approved && fs.existsSync(formal) && JSON.parse(fs.readFileSync(formal,'utf8')).approved) {
  const candidate=path.join(root,'models','tangwu-pv-candidate.json');fs.writeFileSync(candidate,JSON.stringify(model));
  console.log(JSON.stringify({candidate,approved:false,retainedIncumbent:true}));process.exit(0);
}
fs.writeFileSync(formal,JSON.stringify(model));
const script="'use strict';\n(function(){const model="+JSON.stringify(model)+";if(typeof module!=='undefined'&&module.exports)module.exports=model;if(typeof window!=='undefined')window.__TWModel=model;})();\n";
fs.writeFileSync(path.join(root,'neural-model.js'),script);
console.log(JSON.stringify({model:path.join(root,'models','tangwu-pv.json'),generation:model.generation,approved:model.approved}));
