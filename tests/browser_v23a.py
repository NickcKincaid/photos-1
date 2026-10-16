"""Public Notes timezone and vertical-feed smoke tests (no web requests)."""
from pathlib import Path
import sys
import json
import tempfile
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import build

with tempfile.TemporaryDirectory(prefix='photo-notes-tz-') as tmp:
    base=Path(tmp)
    (base/'content'/'notes').mkdir(parents=True)
    (base/'content'/'projects').mkdir(parents=True)
    (base/'content'/'site.json').write_text('{"name":"Nicholas Kincaid"}')
    for slug,title,stamp in [('a','One','2026-10-15T20:35:00Z'),('b','Two','2026-10-14T17:00:00Z')]:
        (base/'content'/'notes'/f'{slug}.json').write_text(json.dumps({
            'title':title,'body':'A sample note.','published':True,'published_at':stamp
        }))
    original_content,original_out = build.CONTENT, build.OUT
    try:
        build.CONTENT,build.OUT=base/'content',base/'dist'
        build.run()
        markup=(base/'dist'/'notes'/'index.html').read_text()
        detail=(base/'dist'/'notes'/'a'/'index.html').read_text()
    finally:
        build.CONTENT,build.OUT=original_content,original_out

assert markup.count('data-local-published') == 2
assert detail.count('data-local-published') == 1
assert markup.index('One') < markup.index('Two')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for tz,expected in [('America/Los_Angeles','1:35 PM'),('Asia/Tokyo','5:35 AM')]:
        page=browser.new_page(viewport={'width':390,'height':844},locale='en-US',timezone_id=tz)
        # Inline the exact generated CSS/JS, avoiding network and browser cache.
        page.set_content(markup)
        page.add_style_tag(content=(ROOT/'static/style.css').read_text())
        page.add_script_tag(content=(ROOT/'static/site.js').read_text())
        stamps=page.locator('time[data-local-published]').all_inner_texts()
        assert expected in stamps[0],(tz,stamps)
        assert 'UTC' not in stamps[0],(tz,stamps)
        # The second note is placed below the first, never alongside it.
        first=page.locator('.note-entry').nth(0).bounding_box()
        second=page.locator('.note-entry').nth(1).bounding_box()
        assert second['y'] >= first['y']+first['height']-1,(tz,first,second)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.close()
    # No JavaScript must still leave the UTC fallback visible.
    page=browser.new_page()
    page.set_content(markup)
    assert '20:35 UTC' in page.locator('time').first.inner_text()
    page.close()
    browser.close()
print('V23A note timezone and vertical feed browser checks passed')
