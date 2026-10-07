import json, os, pathlib, subprocess, tempfile, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
exe=pathlib.Path(os.environ.get('TANGWU_PORTABLE_EXE', str(root.parent/'tangwu-electron/app/dist/TangWu.exe')))
out=root/'output/qa';out.mkdir(parents=True,exist_ok=True)
env=dict(os.environ,TANGWU_HEADLESS_TEST='1',TANGWU_TEST_USER_DATA=tempfile.mkdtemp(prefix='tw-portable-launch-'))

def launch(port):
    return subprocess.Popen([str(exe),'--remote-debugging-port='+str(port)],env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))

def wait_browser(p,proc,port):
    for attempt in range(70):
        try:urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version',timeout=.5).read();break
        except Exception:
            if proc.poll() is not None:raise RuntimeError('Portable launcher exited '+str(proc.returncode))
            time.sleep(.3)
    else:raise RuntimeError('Portable debug port unavailable')
    browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}')
    page=browser.contexts[0].pages[0];page.wait_for_load_state('networkidle')
    page.wait_for_function('!document.querySelector("#training-enabled").disabled')
    folder=pathlib.Path(urllib.parse.unquote(urllib.parse.urlparse(page.url.split('/resources/app.asar')[0]).path).lstrip('/'))
    assert (folder/'resources.pak').exists() and (folder/'resources/app.asar').exists()
    return browser,page,folder

def stop(proc):
    try:proc.wait(timeout=10)
    except subprocess.TimeoutExpired:proc.terminate();proc.wait(timeout=5)

with sync_playwright() as p:
    first=launch(9258);second=third=None
    try:
        browser,page,folder=wait_browser(p,first,9258)
        page.locator('[data-mode=ranked]').click();page.locator('#btn-start').click();page.locator('[data-ban=youli]').click();page.locator('#btn-local-resign').click()
        assert page.evaluate('readRank().games')==1
        page.locator('#btn-menu').click();pak=(folder/'resources.pak').read_bytes()
        second=launch(9259);second.wait(timeout=35)
        assert second.returncode==0 and first.poll() is None
        assert (folder/'resources.pak').read_bytes()==pak
        assert (folder/'resources/app.asar').exists()
        assert page.evaluate('readRank().games')==1
        page.close();browser.close();stop(first)
        third=launch(9260);browser,page,other=wait_browser(p,third,9260)
        assert other!=folder,'Portable launches still share an extraction folder'
        assert page.evaluate('readRank().games')==1,'Ranking lost when portable origin changed'
        page.set_viewport_size({'width':1600,'height':1100});page.locator('[data-mode=pve]').click()
        page.locator('.training-panel summary').click();page.locator('#training-enabled').check()
        page.wait_for_function('document.querySelector("#training-status").textContent.includes("本机已收录")')
        metadata=page.evaluate('''()=>{const box=document.querySelector('#training-enabled').getBoundingClientRect();return {head:getComputedStyle(document.head).display,main:getComputedStyle(document.querySelector('main')).display,width:box.width,height:box.height,scroll:document.documentElement.scrollWidth,viewport:innerWidth,cards:document.querySelectorAll('.showcase-card').length};}''')
        assert metadata['head']=='none' and metadata['main']=='block'
        assert abs(metadata['height']-16)<1 and metadata['scroll']<=metadata['viewport']+1 and metadata['cards']==40
        page.screenshot(path=str(out/'local-ui-portable-fixed.png'),full_page=True)
        (out/'portable-launch-verification.json').write_text(json.dumps({'firstFolder':str(folder),'nextFolder':str(other),'secondaryExit':second.returncode,'rankingPersisted':True,'layout':metadata},indent=2),encoding='utf8')
        page.close();browser.close();stop(third)
        print('PASS: portable repeated launch returns to one instance without deleting live assets; relaunch uses a new directory, rank persists, layout/checkbox/cards are correct.')
    finally:
        for proc in [first,second,third]:
            if proc and proc.poll() is None:stop(proc)
