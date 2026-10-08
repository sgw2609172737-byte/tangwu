"""Exercise the shared skin through real controls, across views and preferences."""
import os, pathlib, subprocess
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1]
out = root/'output/qa/liquid-glass'; out.mkdir(parents=True, exist_ok=True)
server = subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
 base = os.environ.get('TANGWU_GLASS_URL','http://127.0.0.1:'+server.stdout.readline().strip()).rstrip('/')
 with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
  page = browser.new_page(viewport={'width':1440,'height':1000}, accept_downloads=True); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def load(path):
   page.goto(base+path);page.wait_for_load_state('networkidle')
  def fits():
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.url
  load('/local.html')
  assert page.locator('.showcase-card').count()==40
  assert page.locator('.glass-select-menu:visible').count()==0
  page.wait_for_function('document.querySelector(".home-launcher").dataset.liquidGlass')
  assert page.locator('[data-liquid-glass]').count()<12
  assert page.locator('head').evaluate('e=>getComputedStyle(e).display')=='none'
  page.screenshot(path=str(out/'home-dark.png'),full_page=True)
  page.locator('#btn-theme').click();page.screenshot(path=str(out/'home-light.png'),full_page=True)
  assert page.locator('.home-launcher h2').evaluate('e=>getComputedStyle(e).color')=='rgb(48, 45, 59)'
  page.reload();assert page.locator('html').get_attribute('data-theme')=='light'
  page.locator('#btn-rules').click();page.locator('#rules-modal').wait_for(state='visible')
  assert page.frame_locator('#rules-modal iframe').locator('html').get_attribute('data-theme')=='light'
  assert '数字连携' in page.frame_locator('#rules-modal iframe').locator('body').inner_text()
  page.keyboard.press('Escape');assert page.locator('#rules-modal').is_hidden()
  for width,height in [(1000,920),(820,1000),(390,844),(320,740)]:
   page.set_viewport_size({'width':width,'height':height});fits()
   page.locator('[data-mode=ranked]').click();fits();assert page.locator('#local-rank').is_visible()
   page.locator('.training-panel summary').click();fits();assert page.locator('.training-choice input').bounding_box()['width']<24
   page.locator('.training-panel summary').click();page.locator('[data-mode=pve]').click()
  page.locator('#btn-theme').click();page.set_viewport_size({'width':1440,'height':1000})
  page.locator('[data-mode=pvp]').click();page.locator('#btn-start').click();page.screenshot(path=str(out/'ban-dark.png'),full_page=True)
  assert page.locator('.ban-art svg.card-svg').count()==40
  page.locator('[data-ban=jiubaK]').click();page.locator('[data-ban=youli]').click()
  page.keyboard.press('1');page.wait_for_timeout(450)
  page.screenshot(path=str(out/'battle-dark.png'),full_page=True)
  assert page.locator('#game svg.hand').count()==4
  for width in [1000,820,390,320]:
   page.set_viewport_size({'width':width,'height':844});fits()
   assert page.locator('#controls .card-desc').evaluate_all('(es)=>es.every(e=>e.scrollWidth<=e.clientWidth)')
   if width==390:page.screenshot(path=str(out/'battle-mobile.png'),full_page=True)
  page.locator('#btn-theme').click();page.screenshot(path=str(out/'battle-light-mobile.png'),full_page=True)
  with page.expect_download() as dl:page.locator('#btn-export-log').click()
  assert page.evaluate('G.log.at(-1)') in pathlib.Path(dl.value.path()).read_text(encoding='utf-8')
  # Read-only result recovery is still reachable through the new panels.
  page.evaluate("cancelAI();TW_FX.reset();G=TW.createGame(['你','对手']);G.turn=0;G.phase='playing';G.step='awaitAction';G.players[0].skill=1;G.players[0].energy=11;G.players[1].hp=1;cfg.mode='pvp';resultDismissed=false;reviewingMatch=false;archivedGame=null;render();")
  page.locator('[data-skill-id=quan]').click();page.wait_for_function('!TW_FX.busy()');page.locator('#result-modal').wait_for(state='visible');fits()
  page.screenshot(path=str(out/'result-mobile.png'),full_page=True)
  page.locator('#btn-view-log').click();assert '获胜' in page.locator('#log').inner_text()
  page.locator('#btn-back').click();page.wait_for_timeout(100)
  assert page.locator('.liquid-glass-filters filter').count()==1 # Hidden match surfaces are detached.
  # Dynamic spectator selects use the same keyboard-accessible top layer.
  page.locator('[data-mode=ai]').click();page.locator('#btn-start').click();page.locator('#btn-spectate-pause').click()
  saved=page.evaluate('TW.serializeGame(G)');page.locator('#spectate-speed-glass').click()
  page.keyboard.press('End');page.keyboard.press('Enter');assert page.locator('#spectate-speed').input_value()=='4'
  page.wait_for_timeout(250);assert page.evaluate('TW.serializeGame(G)')==saved
  page.locator('#btn-back').click()
  load('');page.locator('#name-input').fill('玻璃界面验证')
  page.locator('#ai-diff-glass').click();page.keyboard.press('End');page.keyboard.press('Enter');assert page.locator('#ai-diff').input_value()=='learned'
  page.locator('#ai-diff-glass').click();page.keyboard.press('Escape');assert page.locator('.glass-select-menu:visible').count()==0
  assert page.locator('#ai-diff-glass').evaluate('e=>document.activeElement===e')
  page.locator('#ai-diff-glass').click();page.keyboard.press('Home');page.keyboard.press('Enter');assert page.locator('#ai-diff').input_value()=='easy'
  for width in [1440,1000,390,320]:
   page.set_viewport_size({'width':width,'height':844});fits()
   page.locator('#ai-diff-glass').click();page.keyboard.press('ArrowDown');
   rect=page.locator('.glass-select-menu:visible').bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=width+1
   assert rect['y']>=0 and rect['y']+rect['height']<=844+1
   if width==390:page.screenshot(path=str(out/'select-mobile.png'),full_page=True)
   page.keyboard.press('Escape')
  page.locator('[data-entry=host]').click();assert page.locator('#btn-create').is_visible()
  page.keyboard.press('ArrowRight');assert page.locator('#code-input').is_visible()
  page.locator('[data-entry=rank]').click();assert page.locator('#online-rank-profile').is_visible();fits()
  load('/artbook.html');assert page.locator('#art-grid .skill-card').count()==40
  assert page.locator('#art-grid .card-svg image').evaluate_all('(es)=>es.every(e=>e.getAttribute("href").includes("individual-v3/"))')
  page.locator('#art-search').fill('无敌');assert page.locator('#art-grid .skill-card').count()>0
  page.locator('#art-search').fill('');page.set_viewport_size({'width':1440,'height':1000});page.screenshot(path=str(out/'artbook-dark.png'),full_page=True)
  for width in [390,320]:page.set_viewport_size({'width':width,'height':844});fits()
  load('/rules.html');fits();assert '数字连携' in page.locator('body').inner_text()
  # Accessibility preferences must suppress expensive refraction while retaining controls.
  page.emulate_media(reduced_motion='reduce',forced_colors='active');load('/local.html')
  assert page.locator('[data-liquid-glass]').count()==0
  assert not page.locator('body').evaluate('e=>e.classList.contains("home-motion")')
  fits();assert not errors,errors
  # Engine remains functional if the Popover API is absent (older WebViews).
  fallback=browser.new_context(viewport={'width':390,'height':844})
  fallback.add_init_script('delete HTMLElement.prototype.showPopover;delete HTMLElement.prototype.hidePopover;')
  old=fallback.new_page();old.goto(base);old.wait_for_load_state('networkidle');old.locator('#ai-diff-glass').click();old.keyboard.press('End');old.keyboard.press('Enter')
  assert old.locator('#ai-diff').input_value()=='learned';assert old.locator('.glass-select-menu:visible').count()==0
  fallback.close();browser.close()
 print('PASS: Liquid Glass across local/online/rank/ban/battle/result/log/rules/gallery, both themes, 320-1440px, native and fallback popovers, keyboard/focus/anchoring, private save/export, bounded filter cleanup and reduced-motion/high-contrast; no JS errors')
finally:server.terminate();server.wait(timeout=10)
