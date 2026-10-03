import json, os, pathlib, subprocess
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'output' / 'qa'
out.mkdir(parents=True, exist_ok=True)
server = subprocess.Popen(['node', '-e', "const {server}=require('./server');server.listen(0,'127.0.0.1',()=>console.log(server.address().port))"], cwd=root, stdout=subprocess.PIPE, text=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
try:
    base = 'http://127.0.0.1:' + server.stdout.readline().strip()
    with sync_playwright() as p:
        chrome = os.environ.get('BROWSER_PATH', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
        browser = p.chromium.launch(headless=True, executable_path=chrome)
        page = browser.new_page(viewport={'width':1440,'height':1000}, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + '/local.html'); page.wait_for_load_state('networkidle')
        page.screenshot(path=str(out / 'home-v2.png'), full_page=True)
        page.locator('[data-mode=pvp]').click(); page.locator('#btn-start').click()
        assert page.locator('.ban-art svg.card-svg').count() == 40
        page.locator('[data-ban]').first.click(); page.locator('[data-ban]').nth(1).click()
        page.keyboard.press('1')
        snapshot = page.evaluate('TW.serializeGame(G)')
        assert page.locator('.save-status').inner_text() == '进度已保存'
        page.wait_for_timeout(450)
        page.screenshot(path=str(out / 'battle-v2.png'), full_page=True)
        page.reload(); page.locator('#btn-resume').click()
        assert page.evaluate('TW.serializeGame(G)') == snapshot
        assert page.evaluate('G.chainDigits instanceof Set')
        with page.expect_download() as download:
            page.locator('#btn-export-log').click()
        downloaded = pathlib.Path(download.value.path()).read_text(encoding='utf-8')
        assert page.evaluate('G.log.at(-1)') in downloaded
        # 卡牌入场结束后仍应有悬停位移；不可用效果仍可阅读。
        page.wait_for_timeout(500)
        card = page.locator('#controls .skill-card:not(:disabled)').first
        card.hover(); page.wait_for_timeout(300)
        assert card.evaluate('e => new DOMMatrix(getComputedStyle(e).transform).m42') < -4
        page.evaluate("G.players[G.turn].energy=0; render()")
        assert '还需' in page.locator('#controls .card-state').first.inner_text()
        page.wait_for_timeout(450)
        assert page.locator('#controls .skill-card').first.evaluate('e => getComputedStyle(e).opacity') == '1'
        page.evaluate("G.players[G.turn].energy=11; G.players[G.turn].skill=8; G.players[G.turn].dumingUsed=true; G.step='awaitAction'; render()")
        assert page.locator('[data-skill-id=duming]').is_disabled()
        assert page.locator('[data-skill-id=duming] .card-state').inner_text() == '本局已使用'
        page.locator('#btn-back').click(); page.locator('[data-mode=ai]').click(); page.locator('#btn-start').click()
        page.locator('#btn-spectate-pause').click()
        snapshot = page.evaluate('TW.serializeGame(G)')
        page.wait_for_timeout(900)
        assert page.evaluate('TW.serializeGame(G)') == snapshot
        page.locator('#spectate-speed').select_option('4')
        page.wait_for_timeout(300)
        assert page.evaluate('TW.serializeGame(G)') == snapshot
        page.locator('#btn-spectate-pause').click()
        page.wait_for_function('(saved) => TW.serializeGame(G) !== saved', arg=snapshot)
        page.locator('#btn-spectate-pause').click(); page.reload(); page.locator('#btn-resume').click()
        assert page.locator('#btn-spectate-pause').get_attribute('aria-pressed') == 'true'
        snapshot = page.evaluate('TW.serializeGame(G)'); page.wait_for_timeout(600)
        assert page.evaluate('TW.serializeGame(G)') == snapshot
        page.locator('#btn-back').click()
        page.evaluate("localStorage.setItem('tangwu_match_v1','broken')")
        page.reload(); assert page.locator('#btn-resume').is_hidden()
        page.goto(base + '/artbook.html'); page.wait_for_load_state('networkidle')
        assert page.locator('.card-category').count() == 40
        assert page.locator('svg.card-svg image').first.get_attribute('href').endswith('skill-atlas-v2.png')
        assert page.locator('#art-grid .card-desc').evaluate_all('(els) => els.every(e => getComputedStyle(e).display !== "none")')
        assert page.evaluate('artItems.every(sk => document.querySelector(`[data-skill-id="${sk.id}"] .card-desc`).textContent === sk.desc)')
        page.locator('#art-filters [data-cost="3"]').click()
        page.locator('#art-grid').screenshot(path=str(out / 'cards-v3.png'))
        first_card = page.locator('#art-grid .skill-card').first.bounding_box()
        last_card = page.locator('#art-grid .skill-card').last.bounding_box()
        page.screenshot(path=str(out / 'cards-v3.png'), clip={'x':first_card['x'], 'y':first_card['y'], 'width':last_card['x']+last_card['width']-first_card['x'], 'height':max(first_card['height'], last_card['height'])})
        page.locator('#art-filters [data-cost="-1"]').click()
        page.screenshot(path=str(out / 'artbook-v2.png'), full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=str(out / 'artbook-mobile-v2.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('#art-grid .card-desc').evaluate_all('(els) => els.every(e => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight)')
        page.set_viewport_size({'width':320,'height':740})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.goto((root / 'dist' / 'index.html').as_uri()); page.wait_for_load_state('networkidle')
        page.locator('[data-mode=pvp]').click(); page.locator('#btn-start').click()
        page.locator('[data-ban]').first.click(); page.locator('[data-ban]').nth(1).click()
        page.locator('#game').wait_for(state='visible')
        assert page.locator('#game svg.hand').count() == 4
        assert not errors, errors
        browser.close()
    print('PASS: save/resume, export, AI pause/speed, corrupt save, card hover after entrance, readable disabled reasons, exact effect text, full gallery descriptions, 390/320px layout, offline build; no JS errors')
finally:
    server.terminate(); server.wait(timeout=5)
