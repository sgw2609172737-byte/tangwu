'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const python='E:/ds/tangwu-android-tools/qa-python/Scripts/python.exe';
const driver=execFileSync(python,['-c',"import pathlib,playwright;print(pathlib.Path(playwright.__file__).parent/'driver'/'package')"],{encoding:'utf8'}).trim();
const {_electron}=require(driver),dir='E:/ds/tangwu-electron/app',temp=fs.mkdtempSync(path.join(os.tmpdir(),'tw-studio-')),out=path.resolve(__dirname,'../output/qa/studio');fs.mkdirSync(out,{recursive:true});
const supplied=process.env.TANGWU_QA_RECORD_FILE,original=supplied?fs.readFileSync(supplied):null;
const recordFile=path.join(temp,'TangWu-data/human-records.json');fs.mkdirSync(path.dirname(recordFile),{recursive:true});
if(original)fs.writeFileSync(recordFile,original);else{
 const E=require('../engine'),R=require('../replay'),g=E.createGame(['A','B']);g.turn=0;g.players[0].hp=20;g.players[1].hp=21;g.phase='banning';E.submitBan(g,0,'jiubaK');E.submitBan(g,1,'qibu');const r=R.create(g);while(!g.over)R.perform(g,g.step==='awaitAdd'?{type:'add',choice:1}:{type:'pass'},r);fs.writeFileSync(recordFile,JSON.stringify({version:1,enabled:false,records:[R.clean(R.finish(r,g))],seen:[],total:1}));
}
const before=fs.readFileSync(recordFile);
(async()=>{
 const app=await _electron.launch({executablePath:path.join(dir,'node_modules/electron/dist/electron.exe'),args:[path.join(dir,'dist/win-unpacked/resources/app.asar')],env:{...process.env,TANGWU_HEADLESS_TEST:'1',TANGWU_TEST_USER_DATA:path.join(temp,'profile'),PORTABLE_EXECUTABLE_DIR:temp}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('load');
  await page.evaluate("localStorage.setItem('tangwu_ai_rank_v1',JSON.stringify({rating:3000,games:67,wins:67,losses:0,draws:0,best:3000,history:[]}))");
  await page.locator('[data-mode=pvp]').click();await page.locator('#btn-start').click();await page.locator('[data-ban=jiubaK]').click();await page.locator('[data-ban=qibu]').click();const saved=await page.evaluate('localStorage.getItem(SAVE_KEY)'),rank=await page.evaluate('localStorage.getItem(RANK_KEY)');
  const next=app.waitForEvent('window');await page.locator('a.header-link[href="studio.html"]').click();const studio=await next;studio.on('pageerror',e=>errors.push(e.message));await studio.waitForLoadState('load');
  assert.equal(await studio.evaluate('!!window.TWDesktopTraining'),false);assert.equal(await studio.evaluate('typeof window.TWStudioImport.readRecords'), 'function');
  await studio.locator('#import-records').click();await studio.waitForFunction('Number(document.querySelector("#saved-count").textContent)>0');assert.equal(Number(await studio.locator('#saved-count').innerText()),JSON.parse(before).records.length);
  await studio.locator('#step-next').click();await studio.locator('#branch-start').click();assert.equal(await studio.locator('#practice-tools').isVisible(),true);await studio.locator('#branch-return').click();
  await studio.locator('#tab-practice').click();await studio.locator('[data-skill-id=wudi]').click();await studio.waitForFunction('!TW_FX.busy()');assert.match(await studio.locator('#practice-outcome').innerText(),/挑战完成/);
  await studio.locator('#practice-reset').click();await studio.locator('#analyze-position').click();await studio.waitForFunction('document.querySelector("#search-status").textContent==="分析完成"');await studio.screenshot({path:path.join(out,'electron-studio.png'),fullPage:true});
  assert.deepEqual(fs.readFileSync(recordFile),before);assert.equal(await page.evaluate('localStorage.getItem(SAVE_KEY)'),saved);assert.equal(await page.evaluate('localStorage.getItem(RANK_KEY)'),rank);
  // Only the studio document may use its read-only bridge.
  await studio.locator('a[href="artbook.html"]').click();await studio.waitForLoadState('load');assert.equal(await studio.locator('#art-grid .skill-card').count(),40);assert.equal(await studio.evaluate('TWStudioImport.readRecords().then(()=>false,()=>true)'),true);
  const closed=studio.waitForEvent('close');await studio.locator('a[href="local.html"]').click();await closed;assert.equal(await page.locator('#game').isVisible(),true);
  assert.deepEqual(errors,[]);if(original)assert.deepEqual(fs.readFileSync(supplied),original);
  console.log('Packaged studio: read-only old records, frame seek/branch, challenge, offline AI Worker, strict document IPC, unfinished match/rank/records preserved.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
