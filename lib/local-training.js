'use strict';
const fs=require('node:fs'),path=require('node:path'),Replay=require('../replay');
const MAX_RECORDS=500;
function createStore(file) {
  let tail=Promise.resolve();
  function transaction(fn) {
    const work=tail.then(()=>{
      let data={version:1,enabled:false,records:[],seen:[],total:0};
      try {data=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(data.version!==1||!Array.isArray(data.records)||!Array.isArray(data.seen))throw Error('本机训练记录无法读取');
      const result=fn(data);fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);return result;
    });tail=work.catch(()=>{});return work;
  }
  const status=data=>({ok:true,enabled:!!data.enabled,count:data.records.length,total:data.total,limit:MAX_RECORDS});
  function request(body={}) {
    if(!body||!['profile','record','export'].includes(body.op))return Promise.reject(Object.assign(Error('本机训练请求无效'),{code:400}));
    // Replay every action before writing; never trust a renderer's claimed winner.
    let record;try {if(body.op==='record')record=Replay.clean(body.record);}catch(e){return Promise.reject(Object.assign(e,{code:400}));}
    return transaction(data=>{
      if(body.op==='profile'&&typeof body.enabled==='boolean')data.enabled=body.enabled;
      if(record) {
        if(!data.enabled)return {...status(data),accepted:false};
        if(data.seen.includes(record.id))return {...status(data),accepted:true,duplicate:true};
        data.records.push({...record,source:'desktop',collectedAt:Date.now()});data.records=data.records.slice(-MAX_RECORDS);
        data.seen=[...data.seen,record.id].slice(-1000);data.total++;
      }
      return {...status(data),...(record?{accepted:true}:{}),...(body.op==='export'?{version:1,records:data.records}:{})};
    });
  }
  return {request};
}
module.exports={createStore,MAX_RECORDS};
