"""Exercise the packaged offline studio in a disposable debug WebView."""
import pathlib, os
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.connect_over_cdp(os.environ.get('TANGWU_QA_CDP','http://127.0.0.1:9228'))
 page=browser.contexts[0].pages[0];page.set_default_timeout(45000);errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if not r.url.startswith('https://appassets.androidplatform.net/') else None)
 page.goto('https://appassets.androidplatform.net/assets/site/index.html');page.wait_for_load_state('networkidle')
 before=page.evaluate('TWDesktopTraining.request({op:"export"})');rank=page.evaluate('localStorage.getItem("tangwu_ai_rank_v1")');save=page.evaluate('localStorage.getItem("tangwu_match_v1")')
 page.locator('a.header-link[href="studio.html"]').click();page.wait_for_load_state('networkidle');assert page.evaluate('TWDesktopTraining.platform')=='android'
 page.locator('#import-records').click();page.wait_for_function('Number(document.querySelector("#saved-count").textContent)>0');assert page.locator('#study-players .study-player').count()==2
 page.locator('#step-next').click();page.locator('#branch-start').click();assert page.locator('#practice-tools').is_visible();page.locator('#branch-return').click()
 page.locator('#tab-practice').click();page.locator('[data-skill-id=wudi]').click();page.wait_for_function('!TW_FX.busy()');assert '挑战完成' in page.locator('#practice-outcome').inner_text()
 page.locator('[data-item=chain]').click();page.locator('[data-skill-id=yi]').click();page.wait_for_function('!TW_FX.busy()');page.locator('[data-add="1"]').click();page.locator('[data-skill-id=gongping]').click();page.wait_for_function('!TW_FX.busy()');assert '挑战完成' in page.locator('#practice-outcome').inner_text()
 page.locator('#practice-reset').click();page.locator('#analyze-position').click();page.wait_for_function('document.querySelector("#search-status").textContent==="分析完成"');assert page.locator('#apply-advice').is_visible()
 page.locator('.quick-find').click();page.locator('#tw-command-input').fill('七步蛇');assert '七步' in page.locator('#tw-command-results').inner_text();assert page.evaluate('TWMobile.back()');assert page.locator('dialog').is_hidden()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(root/'output/qa/studio/android-studio.png'),full_page=True)
 assert page.evaluate('TWDesktopTraining.request({op:"export"})')==before;assert page.evaluate('localStorage.getItem("tangwu_ai_rank_v1")')==rank;assert page.evaluate('localStorage.getItem("tangwu_match_v1")')==save
 assert not errors,errors;assert not requests,requests
 print('Android offline WebView: stored replay, read-only import, seek/branch, burn immunity, numeric chain, Worker advice, palette/native back and private data passed.')
