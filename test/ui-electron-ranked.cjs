'use strict';
// Hidden Electron window, actual packaged assets and real file:// Worker.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const driver=execFileSync('python',['-c',"import pathlib,playwright;print(pathlib.Path(playwright.__file__).parent/'driver'/'package')"],{encoding:'utf8'}).trim();
const {_electron}=require(driver);
const appDir=process.env.TANGWU_ELECTRON_DIR || 'E:/ds/tangwu-electron/app';
const out=path.resolve(__dirname,'../output/qa');fs.mkdirSync(out,{recursive:true});
const harness=path.join(out,'electron-rank-harness.cjs'),userData=fs.mkdtempSync(path.join(os.tmpdir(),'tangwu-electron-qa-'));
const entry=path.join(appDir,'dist/win-unpacked/resources/app.asar/public/local.html');
fs.writeFileSync(harness,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(userData)});app.whenReady().then(()=>{const win=new BrowserWindow({show:false,width:1200,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});win.loadFile(${JSON.stringify(entry)});});app.on('window-all-closed',()=>app.quit());`);
(async()=>{
  const app=await _electron.launch({executablePath:path.join(appDir,'node_modules/electron/dist/electron.exe'),args:[harness]});
  try {
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForLoadState('load');await page.locator('[data-mode=ranked]').click();
    assert.match(await page.locator('#local-rank').innerText(),/定级赛 0\/5/);
    await page.locator('#btn-start').click();await page.locator('[data-ban=youli]').click();
    await page.locator('#btn-local-resign').click();assert.match(await page.locator('#result-sub').innerText(),/人机排位/);
    assert.equal(await page.evaluate('readRank().games'),1);await page.reload();
    assert.equal(await page.evaluate('readRank().losses'),1);
    assert.ok(await page.evaluate('window.__TWModel.training.games')>=192);
    await page.locator('[data-mode=pve]').click();await page.locator('[data-diff=expert]').click();
    await page.locator('#btn-start').click();await page.locator('[data-ban=youli]').click();
    await page.evaluate(`cancelAI(); const NativeWorker=window.Worker;
      window.__workerReplies=0;window.Worker=class extends NativeWorker {constructor(...args){super(...args);this.addEventListener('message',()=>window.__workerReplies++);}};
      G.turn=1;G.controller=-1;G.step='awaitAction';G.chainCount=0;G.chainDigits.clear();G.actionsUsed=0;G.banned=['youli'];
      Object.assign(G.players[1],{skill:1,energy:11,hp:20});Object.assign(G.players[0],{skill:2,energy:1,hp:80,wudi:true,jingji:true});
      G.players[0].dummy={alive:true,hp:100,castBefore:true,reserve:[100]};render();scheduleAI();`);
    await page.waitForFunction('G.over',undefined,{timeout:15000});
    assert.equal(await page.evaluate('G.winner'),1);assert.ok(await page.evaluate('window.__workerReplies')>=7);
    await page.locator('#btn-menu').click();await page.locator('[data-diff=learned]').click();
    assert.match(await page.locator('#difficulty-note').innerText(),/局训练/);
    const reply=await page.evaluate(async()=>{const g=__TWLearning.opening(779);const worker=new Worker('ai-worker.js');try{return await new Promise((resolve,reject)=>{
      worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));worker.postMessage({id:17,game:TW.serializeGame(g),actor:__TWLearning.actor(g),difficulty:'learned',budget:80});
    });}finally{worker.terminate();}});
    assert.equal(reply.id,17);assert.ok(reply.action);assert.ok(!reply.error);
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'ranked-electron.png'),fullPage:true});
    console.log('PASS: packaged Electron local ranking, persisted settlement, real file Worker forced 98K win and neural model inference');
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
