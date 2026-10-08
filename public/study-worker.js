'use strict';
self.window=self;
importScripts('../skills.js','../engine.js','../ai.js');
onmessage=({data})=>{try{const g=__TW_engine.deserializeGame(data.game);const analysis=__TWAI.analyze(g,data.actor,'expert',Math.min(1600,Math.max(100,Number(data.budget)||800)));postMessage({id:data.id,analysis});}catch(error){postMessage({id:data.id,error:error.message});}};
