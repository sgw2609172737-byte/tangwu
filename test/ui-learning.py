import os,pathlib,subprocess,tempfile
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=root/'output'/'qa';out.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    base='http://127.0.0.1:'+server.stdout.readline().strip()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_PATH','C:/Program Files/Google/Chrome/Application/chrome.exe'))
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/local.html');page.wait_for_load_state('networkidle')
        page.locator('[data-diff=learned]').click();assert '训练' in page.locator('#difficulty-note').inner_text()
        assert page.evaluate('window.__TWModel.training.games')>=192
        page.screenshot(path=str(out/'learning-menu.png'),full_page=True)
        page.set_viewport_size({'width':320,'height':740})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(out/'learning-menu-mobile.png'),full_page=True)
        page.set_viewport_size({'width':1440,'height':1000})
        page.locator('#btn-start').click();page.locator('[data-ban=youli]').click();page.locator('#game').wait_for(state='visible')
        # A real Worker loads the exported model, executes a forced combination, and survives multiple requests.
        page.evaluate("""cancelAI();const NativeWorker=window.Worker;window.workerCreated=0;window.workerReplies=0;
          window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.workerCreated++;this.addEventListener('message',()=>window.workerReplies++);}};
          G.turn=1;G.controller=-1;G.step='awaitAction';G.actionsUsed=0;G.chainCount=0;G.chainDigits.clear();G.banned=['youli'];
          Object.assign(G.players[1],{skill:1,energy:11,hp:20});Object.assign(G.players[0],{skill:2,energy:1,hp:80,wudi:true,jingji:true});
          G.players[0].dummy={alive:true,hp:100,castBefore:true,reserve:[100]};render();scheduleAI();""")
        try:page.wait_for_function('G.over',timeout=20000)
        except Exception:
            print(page.evaluate('({workerReplies:window.workerReplies,workerCreated:window.workerCreated,g:TW.serializeGame(G)})'))
            raise
        assert page.evaluate('G.winner')==1;assert page.evaluate('window.workerReplies')>=7
        assert page.evaluate('window.workerCreated')==1
        page.locator('#btn-menu').click();assert page.evaluate('aiWorker') is None
        # Reuse the worker protocol on an arbitrary position that needs network search.
        data=page.evaluate('TW.serializeGame(__TWLearning.opening(777))')
        response=page.evaluate("""async data=>{const worker=new Worker('ai-worker.js');try{return await new Promise((resolve,reject)=>{
          worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));worker.postMessage({id:42,game:data,actor:__TWLearning.actor(TW.deserializeGame(data)),difficulty:'learned',budget:80});
          });}finally{worker.terminate();}}""",data)
        assert response['id']==42 and response.get('action') and not response.get('error')
        page.goto((root/'dist'/'index.html').as_uri());page.wait_for_load_state('networkidle')
        page.locator('[data-diff=learned]').click();assert '局训练' in page.locator('#difficulty-note').inner_text()
        assert page.evaluate('window.__TWModel.generation')>=0
        assert not errors,errors
        browser.close()
    print('PASS: trained model/menu, 320px, real Worker model load, neural search, forced combination, worker reuse and cancellation, offline model')
finally:
    server.terminate();server.wait(timeout=10)
