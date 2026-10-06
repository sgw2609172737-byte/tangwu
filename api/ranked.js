'use strict';
const {createService,redisStore}=require('../lib/ranked-service');
const {redisCommand}=require('../lib/vercel-store');
const service=createService(redisStore(redisCommand));
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,err:'方法不允许'});
  try {res.json(await service.request(req.body || {}));}
  catch(e) {res.status(e.code || 500).json({ok:false,err:e.message});}
};
