"""Exercise v3 rules through the actual local controls on desktop and mobile."""
import functools, http.server, os, pathlib, threading
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'output/qa'; out.mkdir(parents=True, exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root/'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = os.environ.get('TANGWU_QA_URL', f'http://127.0.0.1:{server.server_port}/local.html')
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
  for width, height in [(1440, 1000), (390, 844)]:
   page = browser.new_page(viewport={'width':width, 'height':height}); errors=[]
   page.on('pageerror', lambda e: errors.append(str(e)))
   page.goto(url); page.wait_for_load_state('networkidle')
   page.locator('[data-mode=pvp]').click(); page.locator('#btn-start').click()
   page.locator('[data-ban=jiubaK]').click(); page.locator('[data-ban=youli]').click()
   assert page.evaluate('G.rulesVersion') == 3
   def setup(script):
    page.evaluate("""script=>{cancelAI();TW_FX.reset();G=TW.createGame(['你','对手']);G.turn=0;G.phase='playing';G.step='awaitAction';G.players.forEach(p=>{p.hp=30;p.energy=11;});cfg.mode='pvp';trainingReplay=null;reviewingMatch=false;resultDismissed=false;archivedGame=null;eval(script);render();}""", script)
   def cast(skill):
    page.locator(f'[data-skill-id={skill}]').click()
    if skill == 'gongping': page.locator('#buffform button[type=submit]').click()
    page.wait_for_function('!TW_FX.busy()')
   setup("G.players[0].skill=5;G.players[0].hp=1;G.players[0].delayed=[{owner:1,dmg:2,desc:'小烈焰'}];")
   cast('wudi')
   assert page.evaluate('G.players[0].hp===3 && !G.players[0].wudi && !G.over')
   assert '无敌抵挡了小烈焰' in page.locator('#log').inner_text()
   setup("G.players[0].skill=1;G.players[1].skill=6;G.players[1].shuangbei=3;")
   cast('yi'); page.locator('[data-add="1"]').click(); cast('gongping')
   assert page.evaluate('G.players[1].shuangbei') == 1
   assert '双倍圣水】×2' in page.locator('#log').inner_text()
   setup("G.players[0].skill=1;G.players[1].skill=6;G.players[1].shuangbei=3;G.step='awaitAdd';")
   page.locator('[data-add="1"]').click(); cast('gongping')
   assert page.evaluate('G.players[1].shuangbei') == 2
   setup("G.players[0].skill=9;G.players[0].hp=4;G.players[1].jingji=true;")
   cast('yuandu')
   assert page.evaluate('G.players[0].hp===2 && G.players[1].hp===20 && !G.over')
   assert page.locator('#result-modal').is_hidden()
   page.screenshot(path=str(out/f'mechanics-v3-{width}.png'))
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   setup("G.rulesVersion=2;G.players[0].skill=5;")
   assert '旧规则对局' in page.locator('#turn-banner').inner_text()
   assert not errors, errors
   page.close()
  browser.close()
  print('PASS: actual desktop/mobile controls, v3 new matches, Wudi blocks burn, numeric-chain Fairness removes two vs ordinary one, Yuandu healing precedes verdict, legacy marker, no overflow or JS errors')
finally: server.shutdown(); server.server_close()
