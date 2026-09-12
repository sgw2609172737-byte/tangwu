import pathlib,subprocess,os,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(tempfile.gettempdir())/'tangwu-effects-qa'
out.mkdir(exist_ok=True)
server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
 with sync_playwright() as p:
  base='http://127.0.0.1:'+server.stdout.readline().strip()
  browser_path=os.environ.get('BROWSER_PATH')
  if not browser_path and pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe').exists(): browser_path='C:/Program Files/Google/Chrome/Application/chrome.exe'
  browser=p.chromium.launch(headless=True,executable_path=browser_path)
  page=browser.new_page(viewport={'width':1440,'height':1050})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base+'/artbook.html');page.wait_for_load_state('networkidle')
  assert page.locator('#art-grid [data-skill-id]').count()==40
  boxes=page.locator('#art-grid svg.card-svg > svg').evaluate_all('(els)=>els.map(e=>e.getAttribute("viewBox"))')
  assert len(set(boxes))==40
  page.screenshot(path=str(out/'skill-gallery.png'),full_page=True)
  page.locator('[data-skill-id=xiaolieyan]').click()
  page.locator('.effect-fire').wait_for(state='attached')
  page.screenshot(path=str(out/'skill-fire.png'))
  page.wait_for_timeout(650);assert page.locator('#battle-fx > *').count()==0
  page.evaluate('TW_FX.sync({visualSeq:demoSeq,visualEvents:[{seq:demoSeq,kind:"cast",source:0,skillId:"xiaolieyan"}]},demoCards,artCatalog)')
  assert page.locator('#battle-fx > *').count()==0
  page.locator('#demo-combo').click();page.locator('.ultimate-banner').wait_for(state='attached')
  page.screenshot(path=str(out/'skill-combo.png'))
  page.locator('#btn-motion').click();assert page.locator('#battle-fx > *').count()==0
  page.locator('#demo-combo').click();assert page.locator('.ultimate-banner').count()==0
  page.reload();assert page.locator('#btn-motion').inner_text()=='动画：少'
  page.locator('#btn-motion').click()
  page.evaluate('TW_FX.sync({visualSeq:++demoSeq,visualEvents:[{seq:demoSeq,kind:"shield-break",source:0,skillId:"wudi"}]},demoCards,artCatalog)')
  assert page.locator('.effect-shatter').count()==1
  page.evaluate('TW_FX.reset()');assert page.locator('#battle-fx > *').count()==0
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'skill-gallery-mobile.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.emulate_media(reduced_motion='reduce');page.wait_for_function("document.querySelector('#btn-motion').disabled")
  page.locator('#demo-combo').click();assert page.locator('#battle-fx > *').count()==0
  page.emulate_media(reduced_motion='no-preference')
  page.goto(base+'/local.html');page.locator('[data-mode=pvp]').click();page.locator('#btn-start').click()
  page.locator('[data-ban]').first.click();page.locator('[data-ban]').nth(1).click()
  page.locator('#controls [data-add]').first.click()
  page.locator('#controls [data-skill]').first.click()
  page.locator('#battle-fx .cast-label').wait_for(state='attached')
  assert page.evaluate('G.visualSeq > 0')
  page.locator('#btn-back').click();assert page.locator('#battle-fx > *').count()==0
  assert not errors,errors
  print('PASS: 40 unique art cells, fire, combo, shield shatter, dedupe, reset cleanup, reduced-motion persistence, OS preference, mobile width; no JS errors')
  browser.close()
finally:
 server.terminate();server.wait(timeout=10)
