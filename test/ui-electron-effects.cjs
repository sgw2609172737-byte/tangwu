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
  assert.equal(await page.evaluate('G.endReason.code'),'legacy-stalemate');assert.match(await page.locator('#log').innerText(),/按血量判定胜负/);
  if(supplied){const last=JSON.parse(fs.readFileSync(recordFile)).records.at(-1),expected=require('../replay').reconstruct(last);assert.deepEqual(await page.evaluate('G.players.map(p=>p.hp)'),expected.players.map(p=>p.hp));}
  await page.screenshot({path:path.join(out,'desktop-recovered-last-game.png')});await page.locator('#btn-back').click();await page.locator('[data-mode=pvp]').click();await page.locator('#btn-start').click();await page.locator('[data-ban=jiubaK]').click();await page.locator('[data-ban=youli]').click();
  await page.evaluate("cancelAI();TW_FX.reset();G=TW.createGame(['你','对手']);G.turn=0;G.phase='playing';G.step='awaitAction';G.players[0].skill=1;G.players[0].energy=11;cfg.mode='pvp';trainingReplay=null;render();");
  await page.locator('[data-skill-id=quan]').click();assert.equal(await page.evaluate('TW_FX.busy()'),true);await page.waitForTimeout(650);await page.screenshot({path:path.join(out,'desktop-packaged-cast.png')});await page.waitForFunction('!TW_FX.busy()');
  assert.equal(JSON.parse(fs.readFileSync(recordFile)).records.length,count);if(original)assert.deepEqual(fs.readFileSync(supplied),original);assert.deepEqual(errors,[]);
  console.log('PASS: actual packaged EXE assets, legacy log recovery, read-only review, 2000ms cast and unchanged original/training records');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
