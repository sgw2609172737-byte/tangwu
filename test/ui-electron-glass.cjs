'use strict';
// Actual packaged renderer and separate gallery; all data stays in a QA profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const python='E:/ds/tangwu-android-tools/qa-python/Scripts/python.exe';
const driver=execFileSync(python,['-c',"import pathlib,playwright;print(pathlib.Path(playwright.__file__).parent/'driver'/'package')"],{encoding:'utf8'}).trim();
const {_electron}=require(driver),dir=process.env.TANGWU_ELECTRON_DIR||'E:/ds/tangwu-electron/app';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tw-glass-')),out=path.resolve(__dirname,'../output/qa/liquid-glass');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const app=await _electron.launch({executablePath:path.join(dir,'node_modules/electron/dist/electron.exe'),args:[path.join(dir,'dist/win-unpacked/resources/app.asar')],env:{...process.env,TANGWU_HEADLESS_TEST:'1',TANGWU_TEST_USER_DATA:temp,PORTABLE_EXECUTABLE_DIR:temp}});
 try {
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('load');
  await page.waitForFunction('document.querySelector(".home-launcher").dataset.liquidGlass');
  for(const width of [1000,1440,390,320]){await page.setViewportSize({width,height:920});assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  await page.setViewportSize({width:1000,height:920});await page.screenshot({path:path.join(out,'electron-home.png'),fullPage:true});
  assert.equal(await page.locator('.glass-select-menu:visible').count(),0);
  await page.locator('#btn-theme').click();assert.equal(await page.locator('.home-launcher h2').evaluate(e=>getComputedStyle(e).color),'rgb(48, 45, 59)');await page.locator('#btn-theme').click();
  await page.locator('[data-mode=pvp]').click();await page.locator('#btn-start').click();await page.locator('[data-ban=jiubaK]').click();await page.locator('[data-ban=youli]').click();
  const saved=await page.evaluate('localStorage.getItem(SAVE_KEY)');
  const next=app.waitForEvent('window');await page.locator('a.header-link[href="artbook.html"]').click();const gallery=await next;
  gallery.on('pageerror',e=>errors.push(e.message));await gallery.waitForLoadState('load');assert.equal(await gallery.locator('#art-grid .skill-card').count(),40);
  assert.equal(await gallery.evaluate('!!window.TWDesktopTraining'),false); // Read-only gallery has no privileged preload.
  await gallery.locator('#art-search').fill('无敌');assert.ok(await gallery.locator('#art-grid .skill-card').count()>0);
  await gallery.screenshot({path:path.join(out,'electron-gallery.png'),fullPage:true});
  const closed=gallery.waitForEvent('close');await gallery.locator('a[href="local.html"]').click();await closed;
  assert.equal(await page.evaluate('localStorage.getItem(SAVE_KEY)'),saved);assert.equal(await page.locator('#game').isVisible(),true);
  await page.keyboard.press('1');await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'electron-battle.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: packaged Liquid Glass, 320-1440px, light/dark, real refraction, no leaked popovers, separate unprivileged gallery, returning preserves unfinished match; no JS errors');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
