import pathlib,subprocess,os,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
 base='http://127.0.0.1:'+server.stdout.readline().strip()
 with sync_playwright() as p:
  executable=os.environ.get('BROWSER_PATH')
  if not executable and pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe').exists():executable='C:/Program Files/Google/Chrome/Application/chrome.exe'
  browser=p.chromium.launch(headless=True,executable_path=executable)
  page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.wait_for_load_state('networkidle')
  assert page.locator('.showcase-card').count()==40
  timing=page.locator('.skill-wheel').evaluate('(e)=>e.getAnimations()[0].effect.getTiming()')
  assert timing['easing']=='linear' and timing['duration']==180000
  page.evaluate('window.originalCards=[...document.querySelectorAll(".showcase-card")]')
  transforms=[];times=[]
  for _ in range(5):
   transforms.append(page.locator('.skill-wheel').evaluate('(e)=>getComputedStyle(e).transform'))
   times.append(page.locator('.skill-wheel').evaluate('(e)=>e.getAnimations()[0].currentTime'))
   page.wait_for_timeout(200)
  assert len(set(transforms))==5, 'Wheel stopped between frames'
  assert all(b>a for a,b in zip(times,times[1:]))
  page.locator('[data-deck-pause]').click()
  stopped=page.locator('.skill-wheel').evaluate('(e)=>e.getAnimations()[0].currentTime')
  page.wait_for_timeout(650)
  assert page.locator('.skill-wheel').evaluate('(e)=>e.getAnimations()[0].currentTime')==stopped
  page.locator('[data-deck-pause]').click();page.wait_for_timeout(200)
  resumed=page.locator('.skill-wheel').evaluate('(e)=>e.getAnimations()[0].currentTime')
  assert stopped<resumed<stopped+600, 'Resume jumped to a card boundary'
  page.locator('#btn-motion').click()
  assert page.locator('.skill-wheel').evaluate('(e)=>e.getAnimations()[0].playState')=='paused'
  current=page.locator('[data-showcase]').get_attribute('data-current-id')
  expected=page.evaluate('Object.values(__TW_skills.SKILLS).flat().map(s=>s.id)');start=expected.index(current)
  seen=[]
  for i in range(40):
   seen.append(page.locator('[data-showcase]').get_attribute('data-current-id'))
   assert seen[-1]==expected[(start+i)%40]
   page.locator('[data-deck-next]').click()
  assert len(set(seen))==40
  assert page.locator('[data-showcase]').get_attribute('data-current-id')==current
  assert page.evaluate('originalCards.every((e,i)=>e===document.querySelectorAll(".showcase-card")[i])'), 'Cards were rebuilt'
  assert page.locator('.wheel-depth').evaluate('(e)=>getComputedStyle(e).backdropFilter')!='none'
  page.set_viewport_size({'width':320,'height':760});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.emulate_media(reduced_motion='reduce');page.wait_for_function('document.querySelector("#btn-motion").disabled')
  assert page.locator('.skill-wheel').evaluate('(e)=>e.getAnimations()[0].playState')=='paused'
  assert not errors,errors
  print('PASS: continuous linear wheel, no card reconstruction, pause/resume same phase, all 40 positions, depth blur, reduced motion and 320px layout')
  browser.close()
finally:
 server.terminate();server.wait(timeout=10)
