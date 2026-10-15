"""V17 UI smoke tests using offline Chromium (no network required)."""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
STYLE = (DIST / 'style.css').read_text()
ADMIN_STYLE = (DIST / 'admin' / 'admin.css').read_text()


def local_html(raw):
    raw = re.sub(r'<script src="/[^"]+" defer></script>', '', raw)
    raw = re.sub(r'<link rel="stylesheet" href="/[^"]+">', '', raw)
    raw = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', raw)
    return raw

with sync_playwright() as browser_tool:
    browser = browser_tool.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for size in [{'width': 1320, 'height': 900}, {'width': 390, 'height': 844}]:
        page=browser.new_page(viewport=size)
        page.set_content(local_html((DIST/'notes'/'index.html').read_text()))
        page.add_style_tag(content=STYLE)
        footer=page.locator('.site-footer').bounding_box()
        assert footer['y']+footer['height']>=size['height']-2, (footer,size)
        links=page.locator('.site-nav a').all()
        boxes=[item.bounding_box() for item in links]
        assert boxes[1]['x']-boxes[0]['x']-boxes[0]['width']>=17, boxes
        assert boxes[2]['x']-boxes[1]['x']-boxes[1]['width']>=17, boxes
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Header overflows'
        page.close()

        admin=browser.new_page(viewport=size)
        admin.set_content(local_html((DIST/'admin'/'index.html').read_text()))
        admin.add_style_tag(content=ADMIN_STYLE)
        assert admin.locator('#purge-github').count()==0
        assert admin.locator('#migrate-r2').count()==0
        admin.evaluate('''() => {
          window.fetch = async (url, options = {}) => {
            if (!url.endsWith('/notes')) return {ok:true,json:async()=>({projects:[]})};
            if (!options.method || options.method === 'GET') return {ok:true,json:async()=>({notes:[]})};
            return {ok:true,json:async()=>({ok:true,slug:'test-note'})};
          };
        }''')
        admin.add_script_tag(content=(DIST/'admin'/'admin-note-format.js').read_text())
        admin.add_script_tag(content=(DIST/'admin'/'admin-notes.js').read_text())
        admin.locator('#show-notes').click()
        admin.locator('#add-note').click()
        admin.locator('#note-title').fill('Test note')
        admin.locator('#note-body').fill('Hello')
        admin.locator('#note-body').evaluate('(el) => {el.focus(); el.setSelectionRange(0,5)}')
        admin.locator('[data-note-format="bold"]').click()
        assert admin.locator('#note-body').input_value()=='**Hello**'
        admin.locator('#note-body').fill('**bold** <script>alert(1)</script>\n\nhttps://youtu.be/dQw4w9WgXcQ\n\nhttps://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')
        admin.locator('#note-preview-toggle').click()
        preview=admin.locator('#note-preview')
        assert preview.locator('strong').inner_text()=='bold'
        assert preview.locator('script').count()==0
        assert '<script>' in preview.inner_text()
        frames=preview.locator('iframe')
        assert frames.count()==2
        assert frames.nth(0).get_attribute('src')=='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
        assert frames.nth(1).get_attribute('src')=='https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'
        assert admin.evaluate('document.documentElement.scrollWidth <= innerWidth')
        admin.close()
        print('V17 UI checks passed',size)
    browser.close()
