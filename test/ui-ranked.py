import os, pathlib, subprocess, tempfile
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
out=root/'output'/'qa';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='tangwu-rank-ui-') as temp:
    env=dict(os.environ,TANGWU_RANK_FILE=str(pathlib.Path(temp)/'rank.json'))
    server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,env=env,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        base='http://127.0.0.1:'+server.stdout.readline().strip()
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_PATH','C:/Program Files/Google/Chrome/Application/chrome.exe'))
            context=browser.new_context(viewport={'width':1440,'height':1000})
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'/local.html');page.wait_for_load_state('networkidle')
            page.locator('[data-mode=ranked]').click()
            assert page.locator('#diff-row').is_hidden()
            assert '定级赛 0/5' in page.locator('#local-rank').inner_text()
            page.screenshot(path=str(out/'ranked-local.png'),full_page=True)
            page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
            page.locator('#local-rank-match').wait_for(state='visible')
            page.locator('#btn-back').click();page.reload();page.locator('#btn-resume').click()
            assert page.evaluate('cfg.mode')=='ranked'
            page.locator('#btn-local-resign').click()
            assert '人机排位' in page.locator('#result-sub').inner_text()
            assert page.evaluate('readRank().games')==1
            page.evaluate('render();render()');assert page.evaluate('readRank().games')==1
            page.locator('#btn-menu').click();page.reload()
            assert page.evaluate('readRank().losses')==1
            # Starting a new game forfeits a saved ranked match, even after switching to casual.
            page.locator('[data-mode=ranked]').click();page.locator('#btn-start').click();page.locator('[data-ban=youli]').click()
            page.locator('#btn-back').click();page.locator('[data-mode=pvp]').click();page.locator('#btn-start').click()
            assert page.evaluate('readRank().games')==2
            page.locator('#btn-back').click();assert page.locator('#btn-resume').is_hidden()
            page.locator('[data-mode=pve]').click();page.locator('[data-diff=expert]').click()
            assert '完整回合' in page.locator('#difficulty-note').inner_text()
            page.set_viewport_size({'width':320,'height':740});page.locator('[data-mode=ranked]').click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=str(out/'ranked-local-mobile.png'),full_page=True)
            # Independent identities are needed for genuine matchmaking.
            ctx_a=browser.new_context(viewport={'width':1440,'height':1000});ctx_b=browser.new_context()
            a=ctx_a.new_page();b=ctx_b.new_page()
            for pg,name in [(a,'排位甲'),(b,'排位乙')]:
                pg.on('pageerror',lambda e:errors.append(str(e)))
                pg.goto(base);pg.wait_for_load_state('networkidle');pg.locator('#name-input').fill(name)
                pg.locator('#entry-rank').click();pg.wait_for_function("document.querySelector('#online-rank-profile .rank-rating')")
            a.screenshot(path=str(out/'ranked-online.png'),full_page=True)
            a.locator('#btn-rank-queue').click();a.locator('#btn-rank-cancel').wait_for(state='visible')
            a.locator('#btn-rank-cancel').click();a.locator('#btn-rank-cancel').wait_for(state='hidden')
            a.locator('#btn-rank-queue').click();a.locator('#btn-rank-cancel').wait_for(state='visible');b.locator('#btn-rank-queue').click()
            a.locator('#ban').wait_for(state='visible');b.locator('#ban').wait_for(state='visible')
            assert a.evaluate('me.roomCode')==b.evaluate('me.roomCode')
            a.locator('[data-ban=youli]').click();b.locator('[data-ban=jiubaK]').click()
            a.locator('#game').wait_for(state='visible');b.locator('#game').wait_for(state='visible')
            a.reload();a.locator('#game').wait_for(state='visible');assert a.evaluate('me.ranked')
            a.screenshot(path=str(out/'ranked-online-battle.png'),full_page=True)
            a.locator('#btn-leave').click();b.locator('#result-modal').wait_for(state='visible')
            assert '+32' in b.locator('#result-sub').inner_text()
            b.locator('#btn-rematch').click();b.locator('#btn-rank-cancel').wait_for(state='visible');b.locator('#btn-rank-cancel').click()
            b.locator('#rank-queue-status').wait_for(state='visible');b.wait_for_function("!document.querySelector('#btn-rank-queue').disabled")
            assert '1 胜' in b.locator('#online-rank-profile').inner_text()
            b.set_viewport_size({'width':320,'height':740});assert b.evaluate('document.documentElement.scrollWidth<=innerWidth')
            # Dist worker imports must resolve inside dist, with no dependency on the repository root.
            offline=browser.new_page();offline.on('pageerror',lambda e:errors.append(str(e)))
            offline.goto((root/'dist'/'index.html').as_uri());offline.wait_for_load_state('networkidle')
            offline.locator('[data-mode=ranked]').click();assert '定级赛' in offline.locator('#local-rank').inner_text()
            assert not errors,errors
            browser.close()
        print('PASS: local ranking, resume, resignation, idempotence, replacement forfeit, expert selection, 320px, two-client online matchmaking, cancellation, reconnection, authoritative Elo, requeue and offline build')
    finally:
        server.terminate();server.wait(timeout=10)
