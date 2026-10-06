import json, os, pathlib, subprocess, tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'output/qa';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='tw-human-ui-') as temp:
    env=dict(os.environ,TANGWU_TRAINING_FILE=str(pathlib.Path(temp)/'human.json'),TANGWU_RANK_FILE=str(pathlib.Path(temp)/'rank.json'))
    server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,env=env,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        base='http://127.0.0.1:'+server.stdout.readline().strip()
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
            page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'/local.html',wait_until='networkidle')
            page.locator('.training-panel summary').click();assert not page.locator('#training-enabled').is_checked()
            page.locator('#training-enabled').check();page.wait_for_function("document.querySelector('#training-status').textContent.includes('云端已收录')")
            page.locator('[data-diff=easy]').click();page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
            assert page.evaluate('!!trainingReplay')
            page.evaluate("cancelAI();let n=0;while(!G.over&&n++<150){doAction(G.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'});cancelAI();}")
            assert page.evaluate('G.over');page.wait_for_function("document.querySelector('#training-status').textContent.includes('收录 1 局')")
            page.reload();assert page.locator('#training-enabled').is_checked()
            page.locator('[data-mode=ranked]').click();page.locator('#btn-start').click();page.locator('[data-ban=youli]').click();page.locator('#btn-local-resign').click()
            page.wait_for_timeout(150);assert '收录 1 局' in page.locator('#training-status').inner_text()
            page.goto(base,wait_until='networkidle');page.locator('#name-input').fill('私密验收名字');page.locator('#ai-diff').select_option('easy')
            page.locator('#btn-create-ai').click();page.locator('#ban').wait_for(state='visible');page.locator('[data-ban=youli]').click();page.locator('#game').wait_for(state='visible')
            result=page.evaluate('''async()=>{for(let i=0;i<180&&!state.over;i++){
              await api('/api/action',{room:me.roomCode,token:me.token,...(state.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'})});await poll();
            }return {over:state.over,status:state.training.status};}''')
            assert result['over'] and result['status']=='collected'
            page.locator('#btn-result-menu').click();page.locator('.training-panel summary').click()
            page.wait_for_function("document.querySelector('#training-status').textContent.includes('收录 2 局')")
            with page.expect_download() as d:page.locator('#training-export').click()
            data=json.loads(pathlib.Path(d.value.path()).read_text(encoding='utf-8'))
            assert len(data['records'])==2 and {r['source'] for r in data['records']}=={'browser','server'}
            assert '私密验收名字' not in json.dumps(data,ensure_ascii=False)
            with page.expect_download() as d:page.locator('#training-connect').click()
            connection=out/'human-ui-link.json';d.value.save_as(str(connection))
            imported=pathlib.Path(temp)/'imported'
            subprocess.run(['node','scripts/sync-human.js','--link',str(connection),'--out',str(imported),'--simulations','4'],cwd=root,check=True,stdout=subprocess.PIPE)
            assert json.loads((imported/'summary.json').read_text())['games']==2
            page.set_viewport_size({'width':320,'height':740});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=str(out/'human-training-mobile.png'),full_page=True)
            page.locator('#training-enabled').uncheck();page.wait_for_function("document.querySelector('#training-status').textContent.includes('未开启')")
            page.goto((root/'dist/index.html').as_uri(),wait_until='networkidle')
            page.locator('.training-panel summary').click();page.locator('#training-enabled').check();page.locator('[data-diff=easy]').click()
            page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
            page.evaluate("cancelAI();let n=0;while(!G.over&&n++<150){doAction(G.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'});cancelAI();}")
            page.locator('#btn-menu').click()
            with page.expect_download() as d:page.locator('#training-export').click()
            offline=json.loads(pathlib.Path(d.value.path()).read_text(encoding='utf-8'));assert len(offline['records'])==1
            assert not errors,errors
            browser.close()
        print('PASS: opt-in, natural local/AI room collection, reload, resignation exclusion, private export, connection download, automatic CLI sync/import, disable, offline recording/export and 320px')
    finally:server.terminate();server.wait(timeout=10)
