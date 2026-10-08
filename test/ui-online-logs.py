"""Real HTTP room, idle draw and finished online log recovery."""
import json, os, pathlib, subprocess, tempfile, urllib.request
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='tangwu-log-ui-') as temp:
 env=dict(os.environ,TANGWU_RANK_FILE=str(pathlib.Path(temp)/'rank.json'))
 server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,env=env,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 try:
  base='http://127.0.0.1:'+server.stdout.readline().strip()
  def post(path,body):
   req=urllib.request.Request(base+path,json.dumps(body).encode(),{'Content-Type':'application/json'})
   data=json.load(urllib.request.urlopen(req));assert data.get('ok'),data;return data
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
   page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base);page.locator('#entry-host').click();page.locator('#name-input').fill('日志测试');page.locator('#btn-create').click()
   page.wait_for_function('!!me.token');a=page.evaluate('({...me})')
   b=post('/api/hello',{'name':'对手','roomCode':a['roomCode']})
   page.locator('[data-ban=jiubaK]').click()
   post('/api/action',{'room':a['roomCode'],'token':b['token'],'type':'ban','skillId':'youli'})
   for _ in range(120):
    state=json.load(urllib.request.urlopen(base+'/api/state?room='+a['roomCode']+'&token='+a['token']))
    if state['over']:break
    token=a['token'] if state['turn']==a['idx'] else b['token']
    body={'type':'add','choice':0} if state['step']=='awaitAdd' else {'type':'pass'}
    post('/api/action',{'room':a['roomCode'],'token':token,**body})
   assert state['over'] and state['result']=='draw',state
   page.locator('#result-modal').wait_for(state='visible')
   assert '连续 24 回合' in page.locator('#result-reason').inner_text()
   page.locator('#btn-view-log').click();page.evaluate('render();render()')
   assert page.locator('#result-modal').is_hidden()
   count=len(state['log']);assert page.locator('#log .log-line').count()==count
   page.locator('#btn-leave').click();page.locator('#entry-ai').click();page.locator('#btn-last-online').click()
   assert page.locator('#last-online-modal .log-line').count()==count
   assert '平局' in page.locator('#last-online-modal').inner_text()
   page.reload();page.locator('#entry-ai').click();page.locator('#btn-last-online').click()
   assert page.locator('#last-online-modal .log-line').count()==count
   page.screenshot(path=str(root/'output/qa/online-last-log.png'))
   assert not errors,errors
   browser.close();print('PASS: real online idle draw, explicit reason, dismiss across polls, complete saved logs and recovery after leaving/reload')
 finally:server.terminate();server.wait(timeout=15)
