'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
const link=JSON.parse(fs.readFileSync(args.link || 'data/training-link.json','utf8')),site=new URL(link.site);
if(link.version!==1 || !/^[a-f0-9]{64}$/.test(link.identity || '') || !(site.origin==='https://tang5.vercel.app' || site.protocol==='http:'&&['localhost','127.0.0.1'].includes(site.hostname)))throw Error('Unrecognized training connection');
(async()=>{
  const response=await fetch(site.origin+'/api/training',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'export',identity:link.identity}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok||!data.ok)throw Error(data.err||'Training sync failed');
  const out=args.out || 'data/human-training';fs.mkdirSync(out,{recursive:true});const raw=path.join(out,'human-records.json');let previous=[];
  try{previous=JSON.parse(fs.readFileSync(raw,'utf8')).records;}catch(_){}
  const records=[...new Map([...previous,...data.records].map(r=>[r.id,r])).values()].slice(-500);
  fs.writeFileSync(raw,JSON.stringify({version:1,records}));
  if(!records.length){console.log('No completed human games yet; sync connected.');return;}
  execFileSync(process.execPath,[path.join(__dirname,'import-human.js'),'--input',raw,'--out',out,...(args.simulations?['--simulations',args.simulations]:[])],{stdio:'inherit'});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
