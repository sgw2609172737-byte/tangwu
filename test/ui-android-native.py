"""Run against a disposable Android QA device with a debug APK and ADB/CDP forwarding."""
import json, os, pathlib, subprocess
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
adb=os.environ.get('TANGWU_QA_ADB','D:/APP/LDPlayer14/adb.exe')
device=os.environ.get('TANGWU_QA_DEVICE','emulator-5556')
def command(*args):return subprocess.check_output([adb,'-s',device,*args],text=True,encoding='utf8').strip()
with sync_playwright() as p:
 browser=p.chromium.connect_over_cdp(os.environ.get('TANGWU_QA_CDP','http://127.0.0.1:9228'))
 page=browser.contexts[0].pages[0];page.set_default_timeout(90000);errors=[];remote=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:remote.append(r.url) if not r.url.startswith('https://appassets.androidplatform.net/') else None)
 page.reload();page.wait_for_load_state('networkidle')
 assert page.url=='https://appassets.androidplatform.net/assets/site/index.html'
 assert page.evaluate('TWDesktopTraining.platform')=='android'
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('.showcase-card').count()==40
 page.screenshot(path=str(root/'output/qa/android-native-home.png'))
 page.locator('#btn-card-fx').click()
 page.locator('.training-panel summary').click();page.wait_for_function('!document.querySelector("#training-enabled").disabled')
 assert not page.locator('#training-enabled').is_checked()
 page.locator('#training-enabled').check();page.locator('[data-diff=easy]').click()
 page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
 page.evaluate('''async()=>{const deadline=Date.now()+75000;while(!G.over&&Date.now()<deadline){
   if(actorOf(G)===0)doAction(G.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'});
   await new Promise(resolve=>setTimeout(resolve,25));}if(!G.over)throw Error('Native Worker game timed out');}''')
 page.wait_for_function('document.querySelector("#training-status").textContent.includes("本机已收录 1 局")')
 page.locator('#btn-view-log').click();assert page.locator('#log .log-line').count()>10
 page.locator('#btn-back').click();page.locator('#btn-last-match').click()
 assert page.evaluate('reviewingMatch && G.over')
 command('shell','input','keyevent','4');page.wait_for_function('!document.querySelector("#menu").classList.contains("hidden")')
 page.reload();page.wait_for_load_state('networkidle');page.locator('.training-panel summary').click()
 page.wait_for_function('!document.querySelector("#training-enabled").disabled')
 assert page.locator('#training-enabled').is_checked()
 data=page.evaluate('TWDesktopTraining.request({op:"export"})');assert data['count']==1
 assert data['records'][0]['rulesVersion']==3 and data['records'][0]['source']=='android'
 page.locator('[data-mode=pvp]').click();page.locator('#btn-start').click();page.locator('[data-ban=jiubaK]').click();page.locator('[data-ban=youli]').click()
 page.locator('#btn-card-fx').click()
 # An isolated legal attack fixture checks the native compositor without altering collected samples.
 page.evaluate("cancelAI();TW_FX.reset();G=TW.createGame(['你','对手']);G.turn=0;G.phase='playing';G.step='awaitAction';G.players[0].skill=1;G.players[0].energy=11;cfg.mode='pvp';trainingReplay=null;render();")
 page.locator('[data-skill-id=quan]').click();page.wait_for_timeout(390)
 assert page.evaluate('TW_FX.busy()');assert page.locator('.cast-scene').evaluate('(e)=>e.getBoundingClientRect().width===innerWidth')
 page.screenshot(path=str(root/'output/qa/android-native-cast.png'))
 page.wait_for_function('!TW_FX.busy()')
 # Android resource loading must support real trained inference in a dedicated Worker.
 response=page.evaluate('''()=>new Promise((resolve,reject)=>{const worker=new Worker('ai-worker.js');
   const timer=setTimeout(()=>{worker.terminate();reject(Error('Native neural Worker timeout'));},10000);
   worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data);};
   worker.onerror=e=>reject(Error(e.message));worker.postMessage({id:9,game:TW.serializeGame(G),actor:actorOf(G),difficulty:'learned',budget:100});})''')
 assert response.get('action') and not response.get('error'),response
 page.locator('#btn-back').click()
 assert not errors,errors;assert not remote,remote
 page.locator('#training-export').click()
 print('PASS: native HTTPS asset loader, real offline Worker game, trained inference, 1.2s compositor, native back, IndexedDB persistence, opt-in validated recording and finished-game review; native document export requested')
