'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const driver=execFileSync('python',['-c',"import pathlib,playwright;print(pathlib.Path(playwright.__file__).parent/'driver'/'package')"],{encoding:'utf8'}).trim(),{_electron}=require(driver);
const appDir=process.env.TANGWU_ELECTRON_DIR||'E:/ds/tangwu-electron/app',temp=fs.mkdtempSync(path.join(os.tmpdir(),'tw-layout-')),out=path.resolve(__dirname,'../output/qa');
(async()=>{const app=await _electron.launch({executablePath:path.join(appDir,'node_modules/electron/dist/electron.exe'),args:[path.join(appDir,'dist/win-unpacked/resources/app.asar')],
  env:{...process.env,TANGWU_HEADLESS_TEST:'1',TANGWU_TEST_USER_DATA:temp,PORTABLE_EXECUTABLE_DIR:temp}});
  try{const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('load');await page.locator('.training-panel summary').click();
    const probe=()=>page.evaluate(()=>{const main=document.querySelector('main'),box=document.querySelector('#training-enabled'),r=main.getBoundingClientRect(),b=box.getBoundingClientRect();return {
      head:getComputedStyle(document.head).display,title:getComputedStyle(document.querySelector('title')).display,main:getComputedStyle(main).display,
      heading:getComputedStyle(document.querySelector('h1')).display,checkboxWidth:b.width,checkboxHeight:b.height,mainWidth:r.width,viewport:innerWidth,scroll:document.documentElement.scrollWidth,
      cards:document.querySelectorAll('.showcase-card').length,showcaseHeight:document.querySelector('.home-showcase').getBoundingClientRect().height};});
    for(const width of [960,1280,2559,390]){await page.setViewportSize({width,height:1100});const p=await probe();assert.equal(p.head,'none');assert.equal(p.title,'none');assert.equal(p.main,'block');assert.equal(p.heading,'block');assert.ok(Math.abs(p.checkboxHeight-16)<1);assert.ok(Math.abs(p.checkboxWidth-16)<1);assert.ok(p.scroll<=p.viewport+1);assert.equal(p.cards,40);assert.ok(p.showcaseHeight>200);}
    await page.setViewportSize({width:1600,height:1100});
    // Simulate UA defaults being overridden; app geometry and metadata must stay safe.
    const css=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.insertCSS('* { display: inline; }',{cssOrigin:'user'}));
    const p=await probe();assert.equal(p.head,'none');assert.equal(p.main,'block');assert.equal(p.heading,'block');assert.ok(p.scroll<=p.viewport+1);assert.ok(p.mainWidth<=1320);assert.equal(p.checkboxHeight,16);
    await page.screenshot({path:path.join(out,'ui-defaults-recovered.png'),fullPage:true});
    await app.evaluate(({BrowserWindow},key)=>BrowserWindow.getAllWindows()[0].webContents.removeInsertedCSS(key),css);
    await page.screenshot({path:path.join(out,'local-ui-fixed.png'),fullPage:true});
    await page.locator('[data-mode=pvp]').click();await page.locator('#btn-start').click();await page.locator('[data-ban=youli]').click();await page.locator('[data-ban=jiubaK]').click();
    assert.equal(await page.locator('#game svg.hand').count(),4);assert.deepEqual(errors,[]);
    console.log('PASS: packaged desktop geometry at 960/1280/2559/390px, 16px checkbox, hidden metadata, 40 cards, UA-default fault recovery and game transition');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
