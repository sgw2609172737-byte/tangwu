"""Verify the actual generated APK assets with a touch viewport and offline Worker AI."""
import functools, http.server, json, os, pathlib, threading
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1]
assets = root / 'android/app/src/main/assets'
output = root / 'output/qa'
output.mkdir(parents=True, exist_ok=True)

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(assets)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/site/index.html'
try:
    with sync_playwright() as playwright:
        chrome = os.environ.get('BROWSER_PATH') or 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        browser = playwright.chromium.launch(headless=True, executable_path=chrome)
        context = browser.new_context(viewport={'width':390, 'height':844}, is_mobile=True, has_touch=True)
        context.add_init_script('window.TWAndroid={postMessage:message=>window.__exported=JSON.parse(message)}')
        remote = []
        def network(route):
            if route.request.url.startswith(f'http://127.0.0.1:{server.server_port}/'):
                route.continue_()
            else:
                remote.append(route.request.url); route.abort()
        context.route('**/*', network)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url); page.wait_for_load_state('networkidle')
        # Separate two-second cinematic tests cover motion; do not slow this game collection test.
        page.locator('#btn-card-fx').click()
        assert page.locator('.showcase-card').count() == 40
        assert page.evaluate('window.__TWModel.approved')
        assert page.evaluate('window.TWDesktopTraining.platform') == 'android'
        for width, height in [(320,760),(390,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), f'Home overflow at {width}'
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=str(output/'android-home.png'), full_page=True)
        page.locator('.training-panel summary').click()
        page.wait_for_function('!document.querySelector("#training-enabled").disabled')
        assert not page.locator('#training-enabled').is_checked()
        assert page.locator('#training-connect').is_hidden()
        assert '手机保留最近 500 局' in page.locator('.training-help').last.inner_text()
        await_error = page.evaluate('''async()=>{try{await TWDesktopTraining.request({op:'record',record:{version:1,winner:0}});return null;}catch(e){return e.code;}}''')
        assert await_error == 400
        page.locator('#training-enabled').check()
        page.wait_for_function('document.querySelector("#training-status").textContent.includes("本机已收录 0 局")')
        page.locator('[data-diff=easy]').click();page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
        assert page.evaluate('!!trainingReplay')
        page.wait_for_function('!!aiWorker')
        assert page.evaluate('typeof aiWorker.postMessage') == 'function'
        page.screenshot(path=str(output/'android-game.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.evaluate('''async()=>{const deadline=Date.now()+45000;while(!G.over&&Date.now()<deadline){
          if(actorOf(G)===0)doAction(G.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'});
          await new Promise(resolve=>setTimeout(resolve,25));}if(!G.over)throw Error('Worker game did not finish');}''')
        page.wait_for_function('document.querySelector("#training-status").textContent.includes("本机已收录 1 局")')
        page.locator('#btn-menu').click();page.locator('#training-export').click()
        page.wait_for_function('!!window.__exported')
        record = json.loads(page.evaluate('window.__exported.contents'))
        assert len(record['records']) == 1 and record['records'][0]['source'] == 'android'
        (output/'android-human-games.json').write_text(json.dumps(record), encoding='utf8')
        page.reload();page.wait_for_load_state('networkidle')
        page.locator('.training-panel summary').click()
        page.wait_for_function('!document.querySelector("#training-enabled").disabled')
        assert page.locator('#training-enabled').is_checked()
        assert '本机已收录 1 局' in page.locator('#training-status').inner_text()
        page.locator('[data-mode=ranked]').click();page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
        page.locator('#btn-local-resign').click()
        assert page.evaluate('readRank().games') == 1
        assert page.evaluate('TWDesktopTraining.request({op:"export"}).then(data=>data.count)') == 1
        assert page.evaluate('TWMobile.back()')
        page.reload();page.wait_for_load_state('networkidle')
        assert page.evaluate('readRank().games') == 1
        page.locator('[data-mode=pve]').click();page.locator('[data-diff=learned]').click()
        page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
        page.wait_for_function('G.phase==="playing"')
        # Ask the real Worker for the current state, regardless of which seat is human.
        result = page.evaluate('''()=>new Promise((resolve,reject)=>{const worker=new Worker('ai-worker.js');
          const timer=setTimeout(()=>{worker.terminate();reject(Error('Neural Worker timeout'));},10000);
          worker.onmessage=event=>{clearTimeout(timer);worker.terminate();resolve(event.data);};
          worker.postMessage({id:7,game:TW.serializeGame(G),actor:actorOf(G),difficulty:'learned',budget:120});})''')
        assert result.get('action') and not result.get('error'), result
        assert page.evaluate('TWMobile.back()')
        page.locator('#btn-rules').click();assert page.evaluate('TWMobile.back()')
        page.locator('.header-link').click();page.wait_for_url('**/artbook.html')
        assert page.locator('.skill-card').count() == 40
        assert not errors, errors
        assert not remote, remote
        browser.close()
        print('PASS: offline APK assets, 320/390/landscape touch layout, real Worker and trained-model inference, validated opt-in records, native export payload, restart persistence, ranking, resignation exclusion, back handling and artbook')
finally:
    server.shutdown();server.server_close()
