'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
(async()=>{
  const cloud=[],local=[],linkFile=args.link || path.join(__dirname,'../data/training-link.json');let cloudError;
  if(args['local-only']!=='true'&&(args.link||fs.existsSync(linkFile))) {
    const link=JSON.parse(fs.readFileSync(linkFile,'utf8')),site=new URL(link.site);
    if(link.version!==1 || !/^[a-f0-9]{64}$/.test(link.identity || '') || !(site.origin==='https://tang5.vercel.app' || site.protocol==='http:'&&['localhost','127.0.0.1'].includes(site.hostname)))throw Error('Unrecognized training connection');
    try {const response=await fetch(site.origin+'/api/training',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'export',identity:link.identity}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();if(!response.ok||!data.ok)throw Error(data.err||'Training sync failed');cloud.push(...data.records);
    }catch(e){cloudError=e;console.error('Cloud sync unavailable; keeping existing and local records: '+e.message);}
  }
  const localFiles=args.local?[path.resolve(args.local)]:[path.resolve(__dirname,'../../TangWu-data/human-records.json'),
    ...(process.env.APPDATA?[path.join(process.env.APPDATA,'tangwu-local/training/human-records.json')]:[])];
  for(const file of new Set(localFiles))if(fs.existsSync(file)){
    const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||!Array.isArray(data.records))throw Error('Invalid local training records');local.push(...data.records);
  }
  const out=args.out || 'data/human-training';fs.mkdirSync(out,{recursive:true});const raw=path.join(out,'human-records.json');let previous=[];
  try{previous=JSON.parse(fs.readFileSync(raw,'utf8')).records;}catch(_){}
  const records=[...new Map([...previous,...cloud,...local].map(r=>[r.id,r])).values()].slice(-500);
  fs.writeFileSync(raw,JSON.stringify({version:1,records}));
  if(!records.length){if(cloudError)throw cloudError;console.log('No completed human games yet; web and local sources checked.');return;}
  console.log(`Human records: cloud ${cloud.length}, local ${local.length}, merged ${records.length}.`);
  execFileSync(process.execPath,[path.join(__dirname,'import-human.js'),'--input',raw,'--out',out,...(args.simulations?['--simulations',args.simulations]:[])],{stdio:'inherit'});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
