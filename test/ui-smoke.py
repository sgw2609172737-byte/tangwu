import subprocess, pathlib, os, tempfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(tempfile.gettempdir())/'tangwu-ui-qa'
out.mkdir(exist_ok=True)
server=subprocess.Popen(['node','-e',"const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"],cwd=root,stdout=subprocess.PIPE,text=True,creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
try:
    base='http://127.0.0.1:'+server.stdout.readline().strip()
    with sync_playwright() as p:
        browser_path=os.environ.get('BROWSER_PATH')
        if not browser_path and pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe').exists():
            browser_path='C:/Program Files/Google/Chrome/Application/chrome.exe'
        browser=p.chromium.launch(headless=True,executable_path=browser_path)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/local.html');page.wait_for_load_state('networkidle')
        page.screenshot(path=str(out/'ui-lobby.png'),full_page=True)
        page.locator('#btn-sound').click(); assert page.locator('#btn-sound').inner_text()=='音效：关'
        page.locator('#btn-rules').click(); page.locator('#rules-modal').wait_for(state='visible')
        page.keyboard.press('Escape');page.locator('#rules-modal').wait_for(state='hidden')
        page.locator('[data-mode=pvp]').click();page.locator('#btn-start').click()
        page.locator('#ban-search').fill('不存在的技能');assert page.locator('.empty-state').count()==1
        page.locator('#ban-search').fill('');page.locator('[data-ban]').first.click();page.locator('[data-ban]').nth(1).click()
        page.locator('#game').wait_for(state='visible'); assert page.locator('#game svg.hand').count()==4
        assert page.locator('#ban-summary .banned-detail').count()==2
        assert '双方均不可使用' in page.locator('#ban-summary').inner_text()
        assert page.locator('.add-choice').count()==2
        page.keyboard.press('1')
        page.screenshot(path=str(out/'ui-battle.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'ui-mobile.png'),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.evaluate("""() => {
          G.banned=['jiubaK','jiubaK'];
          const p=G.players[0];p.dummy={alive:true,hp:3,castBefore:true,reserve:[1,1]};
          p.yingneng={active:true,charge:5};p.huxi=2;p.qianghua=true;
          p.delayed=[{owner:1,dmg:2,desc:'小烈焰',noBonus:true}];render();
        }""")
        assert page.locator('#ban-summary .banned-detail').count()==1
        assert '98K' in page.locator('#ban-summary').inner_text()
        assert '3个' in page.locator('#p0-card [data-key=dummy]').inner_text()
        assert '5/6' in page.locator('#p0-card [data-key=yingneng]').inner_text()
        assert '+4血' in page.locator('#p0-card [data-key=huxi]').inner_text()
        assert '回合结束-2血' in page.locator('#p0-card [data-key=delayed]').inner_text()
        page.locator('#btn-back').click();page.locator('[data-mode=ai]').click();page.locator('[data-diff=hard]').click()
        workers=[];page.on('worker',lambda w:workers.append(w))
        page.evaluate('window.uiTicks=0; window.tickTimer=setInterval(()=>window.uiTicks++,20)')
        page.locator('#btn-start').click();page.wait_for_function('window.uiTicks > 25')
        assert workers, 'AI worker did not start'
        assert page.locator('#controls [data-add]').count()==0, 'Spectator must not get human controls'
        page.locator('#btn-back').click(); page.wait_for_timeout(900)
        assert page.evaluate('G === null')
        page.locator('#menu').wait_for(state='visible')
        assert page.locator('#ai-thinking').is_hidden()
        page.goto(base+'/');page.locator('#lobby').wait_for(state='visible');page.locator('#name-input').fill('测试甲');page.locator('#btn-create').click();page.locator('#waiting').wait_for(state='visible')
        code=page.locator('#bigcode').inner_text()
        other=browser.new_page();other.on('pageerror',lambda e:errors.append(str(e)))
        other.goto(base+'/');other.locator('#name-input').fill('测试乙');other.locator('#code-input').fill(code);other.locator('#btn-join').click()
        page.locator('[data-ban]').first.click();other.locator('[data-ban]').nth(1).click()
        page.locator('#game').wait_for(state='visible');other.locator('#game').wait_for(state='visible')
        assert page.locator('#game svg.hand').count()==4
        assert page.locator('#ban-summary .banned-detail').count()==2
        assert other.locator('#ban-summary').inner_text()==page.locator('#ban-summary').inner_text()
        active=page if page.locator('[data-add]').count() else other
        active.locator('[data-add]').first.click()
        page.locator('#btn-leave').click();page.locator('#lobby').wait_for(state='visible');assert page.locator('#ban').is_hidden()
        assert not errors,errors
        print('PASS: local menu, sound, rules keyboard, ban search, PvP keyboard, mobile overflow, AI Worker + responsive timer, spectator controls, AI cancellation, two-client online room/ban/action/leave')
        browser.close()
finally:
    server.terminate();server.wait(timeout=10)
