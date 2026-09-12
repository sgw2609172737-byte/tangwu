import pathlib,subprocess,os,tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(tempfile.gettempdir())/'tangwu-carousel-qa';out.mkdir(exist_ok=True)
server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
 base='http://127.0.0.1:'+server.stdout.readline().strip()
 with sync_playwright() as p:
  executable=os.environ.get('BROWSER_PATH')
  if not executable and pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe').exists():executable='C:/Program Files/Google/Chrome/Application/chrome.exe'
  browser=p.chromium.launch(headless=True,executable_path=executable)
  page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.wait_for_load_state('networkidle')
  start=page.locator('[data-showcase]').get_attribute('data-current-id')
  page.wait_for_function('(id)=>document.querySelector("[data-showcase]").dataset.currentId!==id',arg=start,timeout=7000)
  page.locator('[data-deck-pause]').click();paused=page.locator('[data-showcase]').get_attribute('data-current-id')
  page.wait_for_timeout(2800);assert page.locator('[data-showcase]').get_attribute('data-current-id')==paused
  page.locator('[data-deck-next]').click();assert page.locator('[data-showcase]').get_attribute('data-current-id')!=paused
  page.locator('#btn-motion').click();page.locator('[data-deck-prev]').click();assert page.locator('[data-showcase]').get_attribute('data-current-id')==paused
  page.set_viewport_size({'width':320,'height':760});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  # 加速计时与过渡，仅用于穷举一整轮卡组，生产代码不暴露测试接口。
  fast=browser.new_page(viewport={'width':1280,'height':900})
  fast.on('pageerror',lambda e:errors.append(str(e)))
  fast.add_init_script('''(()=>{const timers=new Map();let seq=100000;const set=window.setTimeout,clear=window.clearTimeout;
    window.setTimeout=(fn,ms,...args)=>{if(ms===2600){const id=++seq;timers.set(id,()=>fn(...args));return id;}return set(fn,ms,...args);};
    window.clearTimeout=(id)=>{if(timers.has(id))timers.delete(id);else clear(id);};
    window.nextTestCard=()=>{const entry=timers.entries().next();if(entry.done)throw Error('No carousel timer');timers.delete(entry.value[0]);entry.value[1]();};
    const animate=Element.prototype.animate;Element.prototype.animate=function(frames,opts){return animate.call(this,frames,{...opts,duration:1});};})();''')
  fast.goto(base);fast.wait_for_load_state('networkidle')
  expected=fast.evaluate('Object.values(__TW_skills.SKILLS).flat().map(s=>s.id)')
  seen=[]
  for i in range(40):
   current=fast.locator('[data-showcase]').get_attribute('data-current-id');seen.append(current);assert current==expected[i]
   assert fast.locator('.showcase-card--center').get_attribute('data-home-skill')==current
   fast.evaluate('nextTestCard()')
   fast.wait_for_function('(id)=>document.querySelector("[data-showcase]").dataset.currentId!==id',arg=current)
  assert len(set(seen))==40
  assert fast.locator('[data-showcase]').get_attribute('data-current-id')==expected[0]
  assert fast.locator('.showcase-card').count()==3
  assert not errors,errors
  print('PASS: real automatic rotation, pause, manual navigation under reduced motion, 320px layout, all 40 cards in order and clean wrap-around; no JS errors')
  browser.close()
finally:
 server.terminate();server.wait(timeout=10)
