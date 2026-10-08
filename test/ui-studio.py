"""Real UI checks for replay/branch/practice/search and private state boundaries."""
import json, pathlib, os, subprocess
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=root/'output/qa/studio';out.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
 base=os.environ.get('TANGWU_STUDIO_URL','http://127.0.0.1:'+server.stdout.readline().strip()).rstrip('/')
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
  page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base+'/studio.html');page.wait_for_load_state('networkidle');assert page.locator('#study-empty').is_visible()
  private={'tangwu_ai_rank_v1':'{"rating":3000,"wins":67}', 'tangwu_match_v1':'private-save', 'tangwu_training_enabled_v1':'0'}
  page.evaluate('(data)=>Object.entries(data).forEach(([k,v])=>localStorage.setItem(k,v))',private)
  page.locator('#tab-practice').click();assert page.locator('.study-item').count()==6
  page.locator('[data-skill-id=wudi]').click();page.wait_for_function('!TW_FX.busy()');assert '挑战完成' in page.locator('#practice-outcome').inner_text();assert page.locator('#study-p0 .study-meters b').first.inner_text()=='3'
  page.locator('#practice-undo').click();assert page.locator('#study-p0 .study-meters b').first.inner_text()=='1'
  page.locator('[data-item=chain]').click();page.locator('[data-skill-id=yi]').click();page.wait_for_function('!TW_FX.busy()');page.locator('[data-add="1"]').click();page.locator('[data-skill-id=gongping]').click();page.wait_for_function('!TW_FX.busy()');assert '挑战完成' in page.locator('#practice-outcome').inner_text()
  page.locator('[data-item=ordinary]').click();page.locator('[data-add="1"]').click();page.locator('[data-skill-id=gongping]').click();page.wait_for_function('!TW_FX.busy()');assert '挑战完成' in page.locator('#practice-outcome').inner_text()
  for puzzle,skill in [('cleanse','jinghua'),('reflect','yuandu'),('dummy','shipo')]:
   page.locator('[data-item='+puzzle+']').click();page.locator('[data-skill-id='+skill+']').click();page.wait_for_function('!TW_FX.busy()');assert '挑战完成' in page.locator('#practice-outcome').inner_text()
  page.locator('[data-item=reflect]').click();page.locator('#analyze-position').click();page.wait_for_function('document.querySelector("#search-status").textContent==="分析完成"');assert page.locator('#apply-advice').is_visible()
  page.screenshot(path=str(out/'practice-desktop.png'),full_page=True)
  page.keyboard.press('Control+k');assert page.locator('dialog.command-dialog').is_visible();page.locator('#tw-command-input').fill('灼烧');assert '小烈焰' in page.locator('#tw-command-results').inner_text();page.keyboard.press('Escape');assert page.locator('dialog').is_hidden()
  # Generate a valid standard replay with the same engine, then import through the file picker.
  record=page.evaluate('''()=>{const E=__TW_engine,R=__TWReplay,g=E.createGame(['A','B']);g.turn=0;g.players[0].hp=20;g.players[1].hp=21;g.phase='banning';E.submitBan(g,0,'jiubaK');E.submitBan(g,1,'qibu');const r=R.create(g);while(!g.over){const a=g.step==='awaitAdd'?{type:'add',choice:1}:{type:'pass'};R.perform(g,a,r);}return R.clean(R.finish(r,g));}''')
  page.locator('#tab-replay').click();page.locator('#record-file').set_input_files({'name':'replay.json','mimeType':'application/json','buffer':json.dumps({'records':[record]}).encode()});assert page.locator('#saved-count').inner_text()=='1'
  assert page.locator('.track-dot').count()==len(record['actions'])+1
  page.locator('#step-next').click();assert page.locator('#step-position').inner_text().startswith('1 /')
  page.locator('#replay-play').click();page.wait_for_timeout(1000);assert not page.locator('#step-position').inner_text().startswith('1 /');page.locator('#replay-play').click()
  page.keyboard.press('Home');assert page.locator('#step-position').inner_text().startswith('0 /')
  before=page.evaluate('localStorage.getItem(__TWStudy.KEY)');page.locator('#branch-start').click();page.locator('[data-add="1"]').click();page.locator('#practice-undo').click();page.locator('#branch-return').click();assert before==page.evaluate('localStorage.getItem(__TWStudy.KEY)')
  page.keyboard.press('End');assert page.locator('#branch-start').is_disabled();assert '平局' in page.locator('#step-logs').inner_text()
  with page.expect_download() as dl:page.locator('#export-record').click()
  assert json.loads(pathlib.Path(dl.value.path()).read_text(encoding='utf-8'))['records'][0]['id']==record['id']
  page.screenshot(path=str(out/'replay-desktop.png'),full_page=True)
  for theme in ['dark','light']:
   if page.locator('html').get_attribute('data-theme')!=theme:page.locator('#btn-theme').click()
   for width in [1440,1000,760,390,320]:
    page.set_viewport_size({'width':width,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{theme}:{width}'
    page.locator('#tab-practice').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'practice {theme}:{width}'
    if width in [1440,390]:page.screenshot(path=str(out/f'practice-{theme}-{width}.png'),full_page=True)
    page.locator('#tab-replay').click()
  assert page.evaluate('(keys)=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))',list(private))==private
  page.emulate_media(reduced_motion='reduce');assert page.evaluate('TWMotionSystem.reduced()')
  assert not errors,errors
  # Capture from real local actions even with AI training turned off.
  local=browser.new_page(viewport={'width':1440,'height':1000});local.on('pageerror',lambda e:errors.append(str(e)));local.goto(base+'/local.html');local.wait_for_load_state('networkidle')
  local.locator('[data-mode=pvp]').click();local.locator('#btn-start').click();local.locator('[data-ban=jiubaK]').click();local.locator('[data-ban=qibu]').click()
  local.evaluate("()=>{cancelAI();while(!G.over)doAction(G.step==='awaitAdd'?{type:'add',choice:1}:{type:'pass'});}")
  assert local.evaluate('__TWStudy.read(localStorage).length')==1
  assert local.locator('#btn-study-result').is_enabled()
  with local.expect_popup() as popup:local.locator('#btn-study-result').click()
  replay=popup.value;replay.wait_for_load_state('networkidle');assert replay.locator('#saved-count').inner_text()=='1';replay.close()
  assert not errors,errors
  browser.close()
 print('Studio UI: 6 challenges, AI Worker, palette keyboard, replay import/export/seek/play, branch isolation, private state and 320–1440 dark/light passed.')
finally:
 server.terminate();server.wait(timeout=10)
