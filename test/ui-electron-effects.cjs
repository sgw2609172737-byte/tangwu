'use strict';
// Packaged app: recover a legacy game without mutating records and preview the new card.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const driver=execFileSync('python',['-c',"import pathlib,playwright;print(pathlib.Path(playwright.__file__).parent/'driver'/'package')"],{encoding:'utf8'}).trim(),{_electron}=require(driver);
const appDir=process.env.TANGWU_ELECTRON_DIR||'E:/ds/tangwu-electron/app',temp=fs.mkdtempSync(path.join(os.tmpdir(),'tw-effects-')),out=path.resolve(__dirname,'../output/qa');
const supplied=process.env.TANGWU_QA_RECORD_FILE,recordFile=path.join(temp,'TangWu-data/human-records.json');
fs.mkdirSync(path.dirname(recordFile),{recursive:true});
if(supplied)fs.copyFileSync(supplied,recordFile);
else {
  const E=require('../engine'),R=require('../replay'),g=E.createGame(['Human','AI']);g.rulesVersion=1;g.phase='banning';E.submitBan(g,0,'jiubaK');E.submitBan(g,1,'youli');const record=R.create(g,'easy');
  while(!g.over)R.perform(g,g.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'},record);
  fs.writeFileSync(recordFile,JSON.stringify({version:1,enabled:true,records:[R.finish(record,g)],seen:[record.id],total:1}));
}
const original=supplied?fs.readFileSync(supplied):null,count=JSON.parse(fs.readFileSync(recordFile)).records.length;
(async()=>{
 const app=await _electron.launch({executablePath:path.join(appDir,'node_modules/electron/dist/electron.exe'),args:[path.join(appDir,'dist/win-unpacked/resources/app.asar')],env:{...process.env,TANGWU_HEADLESS_TEST:'1',TANGWU_TEST_USER_DATA:path.join(temp,'profile'),PORTABLE_EXECUTABLE_DIR:temp}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('load');await page.locator('#btn-last-match').waitFor({state:'visible'});await page.locator('#btn-last-match').click();
  assert.equal(await page.evaluate('reviewingMatch && G.over && !aiWorker'),true);
  if(supplied){const last=JSON.parse(fs.readFileSync(recordFile)).records.at(-1),expected=require('../replay').reconstruct(last);assert.deepEqual(await page.evaluate('G.players.map(p=>p.hp)'),expected.players.map(p=>p.hp));assert.equal(await page.evaluate('G.endReason.code'),expected.endReason.code);}
  else {assert.equal(await page.evaluate('G.endReason.code'),'legacy-stalemate');assert.match(await page.locator('#log').innerText(),/按血量判定胜负/);}
  await page.screenshot({path:path.join(out,'desktop-recovered-last-game.png')});await page.locator('#btn-back').click();await page.locator('[data-mode=pvp]').click();await page.locator('#btn-start').click();await page.locator('[data-ban=jiubaK]').click();await page.locator('[data-ban=youli]').click();
  await page.evaluate("cancelAI();TW_FX.reset();G=TW.createGame(['你','对手']);G.turn=0;G.phase='playing';G.step='awaitAction';G.players[0].skill=1;G.players[0].energy=11;cfg.mode='pvp';trainingReplay=null;render();");
  await page.locator('[data-skill-id=quan]').click();assert.equal(await page.evaluate('TW_FX.busy()'),true);assert.deepEqual(await page.locator('.cast-scene').evaluate(e=>e.getAnimations().map(a=>a.effect.getTiming().duration)),[1200]);await page.waitForTimeout(390);await page.screenshot({path:path.join(out,'desktop-packaged-cast.png')});await page.waitForFunction('!TW_FX.busy()');
  async function position(script){await page.evaluate(script=>{cancelAI();TW_FX.reset();G=TW.createGame(['你','对手']);G.turn=0;G.phase='playing';G.step='awaitAction';G.players.forEach(p=>{p.hp=30;p.energy=11;});cfg.mode='pvp';trainingReplay=null;reviewingMatch=false;resultDismissed=false;archivedGame=null;eval(script);render();},script);}
  async function cast(id){await page.locator(`[data-skill-id=${id}]`).click();if(id==='gongping')await page.locator('#buffform button[type=submit]').click();await page.waitForFunction('!TW_FX.busy()');}
  assert.equal(await page.evaluate('TW.RULES_VERSION'),3);
  await position("G.players[0].skill=5;G.players[0].hp=1;G.players[0].delayed=[{owner:1,dmg:2,desc:'小烈焰'}];");await cast('wudi');assert.equal(await page.evaluate('G.players[0].hp===3&&!G.over'),true);
  await position('G.players[0].skill=1;G.players[1].skill=6;G.players[1].shuangbei=3;');await cast('yi');await page.locator('[data-add="1"]').click();await cast('gongping');assert.equal(await page.evaluate('G.players[1].shuangbei'),1);
  await position("G.players[0].skill=1;G.players[1].skill=6;G.players[1].shuangbei=3;G.step='awaitAdd';");await page.locator('[data-add="1"]').click();await cast('gongping');assert.equal(await page.evaluate('G.players[1].shuangbei'),2);
  await position('G.players[0].skill=9;G.players[0].hp=4;G.players[1].jingji=true;');await cast('yuandu');assert.equal(await page.evaluate('G.players[0].hp===2&&!G.over'),true);
  await page.screenshot({path:path.join(out,'desktop-packaged-mechanics-v3.png')});
  assert.equal(JSON.parse(fs.readFileSync(recordFile)).records.length,count);if(original)assert.deepEqual(fs.readFileSync(supplied),original);assert.deepEqual(errors,[]);
  console.log('PASS: actual packaged EXE, historical log recovery, 1200ms cast, v3 burn immunity, numeric-chain vs ordinary dispel, healing before verdict and unchanged original/training records');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
