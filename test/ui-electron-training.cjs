'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const driver=execFileSync('python',['-c',"import pathlib,playwright;print(pathlib.Path(playwright.__file__).parent/'driver'/'package')"],{encoding:'utf8'}).trim(),{_electron}=require(driver);
const appDir=process.env.TANGWU_ELECTRON_DIR||'E:/ds/tangwu-electron/app',temp=fs.mkdtempSync(path.join(os.tmpdir(),'tw-desktop-ui-'));
const recordFile=path.join(temp,'TangWu-data/human-records.json'),out=path.resolve(__dirname,'../output/qa');fs.mkdirSync(out,{recursive:true});
const options={executablePath:path.join(appDir,'node_modules/electron/dist/electron.exe'),args:[path.join(appDir,'dist/win-unpacked/resources/app.asar')],
  env:{...process.env,PORTABLE_EXECUTABLE_DIR:temp,TANGWU_HEADLESS_TEST:'1',TANGWU_TEST_USER_DATA:path.join(temp,'profile')}};
(async()=>{
  let app=await _electron.launch(options);
  try {
    let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('load');
    await page.locator('.training-panel summary').click();await page.waitForFunction('!document.querySelector("#training-enabled").disabled');
    assert.equal(await page.locator('#training-enabled').isChecked(),false);assert.equal(await page.locator('#training-connect').isVisible(),false);
    await page.locator('#training-enabled').check();await page.waitForFunction('document.querySelector("#training-status").textContent.includes("本机已收录 0 局")');
    await page.evaluate(()=>{const clean=window.__TWReplay.clean;window.__TWReplay.clean=record=>{window.__trainingDiagnosticRecord=structuredClone(record);try{return clean(record);}catch(e){window.__trainingDiagnosticError=e.message;throw e;}};});
    await page.locator('[data-diff=easy]').click();await page.locator('#btn-start').click();await page.locator('[data-ban=youli]').click();
    assert.equal(await page.evaluate('!!trainingReplay'),true);
    // Only drive the human's decisions; the packaged file:// Worker plays the AI.
    await page.evaluate(async()=>{const deadline=Date.now()+40000;while(!G.over&&Date.now()<deadline){
      if(actorOf(G)===0)doAction(G.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'});
      await new Promise(resolve=>setTimeout(resolve,25));}if(!G.over)throw Error('Natural AI game did not finish');});
    const diagnosis={...await page.evaluate(()=>({error:window.__trainingDiagnosticError,status:document.querySelector('#training-status').textContent,live:document.querySelector('#training-live').textContent,record:window.__trainingDiagnosticRecord,replay:trainingReplay,game:TW.serializeGame(G),pending:localStorage.getItem('tangwu_training_pending_v1')})),errors};
    fs.writeFileSync(path.join(out,'desktop-training-diagnostic.json'),JSON.stringify(diagnosis));
    if(diagnosis.error||errors.length)throw Error(diagnosis.error||errors.join(';'));
    await page.waitForFunction('document.querySelector("#training-status").textContent.includes("本机已收录 1 局")');
    const records=JSON.parse(fs.readFileSync(recordFile));assert.equal(records.records.length,1);assert.equal(records.records[0].source,'desktop');
    assert.ok(records.records[0].actions.some(a=>a[0]===1&&a[1]===1));assert.ok(records.records[0].actions.some(a=>a[0]===0));
    assert.equal(await page.evaluate('typeof require'), 'undefined');assert.equal(await page.evaluate('typeof window.TWDesktopTraining.request'),'function');
    await page.locator('#btn-menu').click();await page.screenshot({path:path.join(out,'human-training-electron.png'),fullPage:true});assert.deepEqual(errors,[]);
    await app.close();app=await _electron.launch(options);page=await app.firstWindow();await page.waitForLoadState('load');
    await page.locator('.training-panel summary').click();await page.waitForFunction('!document.querySelector("#training-enabled").disabled');
    assert.equal(await page.locator('#training-enabled').isChecked(),true);assert.match(await page.locator('#training-status').innerText(),/本机已收录 1 局/);
    await page.locator('[data-mode=ranked]').click();await page.locator('#btn-start').click();await page.locator('[data-ban=youli]').click();await page.locator('#btn-local-resign').click();
    assert.equal(JSON.parse(fs.readFileSync(recordFile)).records.length,1);assert.equal(await page.evaluate('readRank().games'),1);
    await page.locator('#btn-menu').click();await page.locator('#training-enabled').uncheck();await page.waitForFunction('document.querySelector("#training-status").textContent.includes("未开启")');
    const imported=path.join(temp,'imported');execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/sync-human.js'),'--local',recordFile,'--local-only','true','--out',imported,'--simulations','4'],{stdio:'pipe'});
    assert.equal(JSON.parse(fs.readFileSync(path.join(imported,'summary.json'))).games,1);
    fs.cpSync(imported,path.join(out,'desktop-human-fixture'),{recursive:true,force:true});
    console.log('PASS: actual packaged main/preload, natural human vs Worker AI, validated native save, restart, opt-out, ranked resignation exclusion and offline automatic training import');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
