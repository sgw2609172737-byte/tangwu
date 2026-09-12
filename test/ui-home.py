import pathlib,subprocess,os,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(tempfile.gettempdir())/'tangwu-home-qa'
out.mkdir(exist_ok=True)
server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
 base='http://127.0.0.1:'+server.stdout.readline().strip()
 with sync_playwright() as p:
  browser_path=os.environ.get('BROWSER_PATH')
  if not browser_path and pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe').exists(): browser_path='C:/Program Files/Google/Chrome/Application/chrome.exe'
  browser=p.chromium.launch(headless=True,executable_path=browser_path)
  page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.wait_for_load_state('networkidle');page.wait_for_timeout(750)
  page.screenshot(path=str(out/'home-premium.png'),full_page=True)
  assert page.locator('.showcase-card').count()==3
  assert page.locator('.hero-hands').count()==0
  page.locator('[data-entry=host]').click();assert page.locator('#btn-create').is_visible();assert page.locator('#btn-create-ai').is_hidden()
  page.keyboard.press('ArrowRight');assert page.locator('#code-input').is_visible()
  page.locator('#name-input').fill('保留名字');page.locator('[data-entry=ai]').click();assert page.locator('#name-input').input_value()=='保留名字'
  box=page.locator('.home-showcase').bounding_box();page.mouse.move(box['x']+box['width']*.8,box['y']+box['height']*.4);page.wait_for_timeout(80)
  assert page.locator('[data-showcase]').evaluate('(e)=>e.style.getPropertyValue("--yaw")')
  page.locator('#btn-motion').click();assert not page.locator('body').evaluate('(e)=>e.classList.contains("home-motion")')
  assert page.locator('[data-showcase]').evaluate('(e)=>e.style.getPropertyValue("--yaw")')==''
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'home-premium-mobile.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.set_viewport_size({'width':320,'height':760});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.goto(base+'/local.html');page.wait_for_load_state('networkidle');assert page.locator('.showcase-card').count()==3
  page.locator('[data-mode=pvp]').click();page.locator('#btn-start').click();assert not page.locator('body').evaluate('(e)=>e.classList.contains("home-visible")')
  assert not errors,errors;print('PASS: new hero, tabs, keyboard switching, retained nickname, pointer tilt, motion reduction, 390/320px layout, local menu and game transition; no JS errors')
  browser.close()
finally:
 server.terminate();server.wait(timeout=10)
