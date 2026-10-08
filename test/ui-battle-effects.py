"""1.2-second card choreography, cancellation and read-only finished-game recovery."""
import functools, http.server, json, pathlib, threading
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=root/'output/qa';out.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
  page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/local.html');page.wait_for_load_state('networkidle')
  page.locator('[data-mode=pvp]').click();page.locator('#btn-start').click()
  page.locator('[data-ban=jiubaK]').click();page.locator('[data-ban=youli]').click()
  def position(digit=1,hp=20):
   page.evaluate('''({digit,hp})=>{cancelAI();TW_FX.reset();G=TW.createGame(['你','AI']);G.turn=0;G.phase='playing';G.step='awaitAction';G.players[0].skill=digit;G.players[0].energy=11;G.players[1].hp=hp;cfg.mode='pvp';reviewingMatch=false;resultDismissed=false;archivedGame=null;render();}''',{'digit':digit,'hp':hp})
  position()
  page.locator('[data-skill-id=quan]').click()
  assert page.evaluate('TW_FX.busy()')
  assert page.locator('.cast-scene[data-skill-id=quan]').count()==1
  duration=page.locator('.cast-scene').evaluate('(e)=>e.getAnimations().map(a=>a.effect.getTiming().duration)')
  assert duration==[1200],duration
  page.wait_for_timeout(240)
  diagnostic=page.locator('.cast-face').evaluate('(e)=>({style:getComputedStyle(e).cssText,left:getComputedStyle(e).left,top:getComputedStyle(e).top,opacity:getComputedStyle(e).opacity,transform:getComputedStyle(e).transform,rect:e.getBoundingClientRect().toJSON(),animations:e.getAnimations().map(a=>({time:a.currentTime,frames:a.effect.getKeyframes()}))})')
  (out/'cast-diagnostic.json').write_text(json.dumps(diagnostic,indent=2),encoding='utf8')
  page.locator('.cast-scene').evaluate('(e)=>e.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=390;})')
  assert page.locator('.cast-face').evaluate('(e)=>Number(getComputedStyle(e).opacity)>.95')
  assert page.locator('.cast-scene').evaluate('(e)=>e.getBoundingClientRect().width===innerWidth')
  assert page.locator('.cast-face').evaluate('(e)=>{const r=e.getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)<30;}')
  page.screenshot(path=str(out/'card-cast-desktop.png'))
  page.locator('.cast-scene').evaluate('(e)=>e.getAnimations({subtree:true}).forEach(a=>a.play())')
  page.wait_for_timeout(300);assert page.evaluate('TW_FX.busy()')
  page.wait_for_function('!TW_FX.busy()');assert page.locator('.cast-scene').count()==0
  for digit,skill in [(0,'jiaren'),(3,'hanfeng')]:
   position(digit);page.locator(f'[data-skill-id={skill}]').click()
   page.wait_for_timeout(420);page.screenshot(path=str(out/f'card-cast-{skill}.png'))
   page.locator('#btn-card-fx').click();assert not page.evaluate('TW_FX.busy()')
   assert page.locator('.cast-scene').count()==0
   page.locator('#btn-card-fx').click()
  page.set_viewport_size({'width':390,'height':844});position()
  page.locator('[data-skill-id=quan]').click();page.wait_for_timeout(390)
  page.screenshot(path=str(out/'card-cast-mobile.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.wait_for_function('!TW_FX.busy()')
  # Lethal card: result waits for the final card, then logs remain accessible.
  position(1,1);page.locator('[data-skill-id=quan]').click()
  assert page.evaluate('G.over')
  assert page.locator('#result-modal').is_hidden()
  page.wait_for_function('!TW_FX.busy()');page.locator('#result-modal').wait_for(state='visible')
  assert '生命归零' in page.locator('#result-reason').inner_text()
  page.locator('#btn-view-log').click();assert page.locator('#result-modal').is_hidden()
  assert '获胜' in page.locator('#log').inner_text()
  archived=page.evaluate('localStorage.getItem(LAST_KEY)')
  page.locator('#btn-back').click();page.locator('#btn-last-match').click()
  assert page.evaluate('reviewingMatch && G.over && trainingReplay===null')
  assert page.locator('#result-modal').is_hidden()
  assert page.evaluate('localStorage.getItem(LAST_KEY)')==archived
  assert not page.evaluate('!!aiWorker')
  page.reload();page.wait_for_load_state('networkidle');page.locator('#btn-last-match').click()
  assert '获胜' in page.locator('#log').inner_text()
  assert page.locator('#controls [data-skill]').count()==0
  # Read-only review cannot overwrite an unfinished ranked save or settle again.
  page.locator('#btn-back').click();page.locator('[data-mode=ranked]').click();page.locator('#btn-start').click();page.locator('[data-ban=jiubaK]').click()
  page.evaluate('cancelAI()');unfinished=page.evaluate('localStorage.getItem(SAVE_KEY)');rank=page.evaluate('localStorage.getItem(RANK_KEY)')
  page.locator('#btn-back').click();page.locator('#btn-last-match').click()
  assert page.evaluate('localStorage.getItem(SAVE_KEY)')==unfinished
  assert page.evaluate('localStorage.getItem(RANK_KEY)')==rank
  assert not errors,errors
  browser.close()
  print('PASS: 1200ms card timeline, attack/frost/summon choreography, desktop/mobile rendering, mid-animation cancellation, delayed result, reason, complete logs, reload recovery and read-only review without rank/sample duplication')
finally:server.shutdown();server.server_close()
