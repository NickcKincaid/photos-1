"""Offline browser regression for text-only header and viewer error recovery.
Run: python3 tests/browser_v26.py
"""
import base64
import io
import json
import re
import tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build


def offline(markup):
    return re.sub(r'<(?:script|link)\b[^>]+(?:src|href)="/(?:site\.js|style\.css)[^"]+"[^>]*(?:></script>|>)', '', markup)

with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    (root / 'content' / 'projects').mkdir(parents=True)
    (root / 'content' / 'notes').mkdir(parents=True)
    (root / 'content' / 'site.json').write_text(json.dumps({'name': 'Nicholas Kincaid'}))
    photo = '/media/test/' + 'a' * 24 + '/test-01.jpg'
    project = {
        'title': 'Sample Project', 'published': True, 'order': 1,
        'cover': photo, 'gallery': [],
        'photo_details': [{'image': photo, 'id': 'b' * 24, 'storage': 'r2', 'iso': '200'}],
    }
    (root / 'content' / 'projects' / 'test.json').write_text(json.dumps(project))
    old = build.CONTENT, build.OUT
    try:
        build.CONTENT, build.OUT = root / 'content', root / 'dist'
        build.run()
    finally:
        build.CONTENT, build.OUT = old
    home_html = offline((root / 'dist/index.html').read_text())
    project_html = offline((root / 'dist/projects/test/index.html').read_text())
    img = Image.new('RGB', (360, 240), (129, 150, 160))
    buf = io.BytesIO(); img.save(buf, 'JPEG')
    good = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    bad = 'data:image/jpeg;base64,invalid-image-data'

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for width in (390, 1280):
            page = browser.new_page(viewport={'width': width, 'height': 800})
            page.set_content(home_html)
            page.add_style_tag(content=(ROOT / 'static/style.css').read_text())
            brand = page.locator('.brand')
            header = page.locator('.site-header')
            assert brand.inner_text() == 'Nicholas Kincaid'
            assert brand.locator('img').count() == 0
            header_box = header.bounding_box()
            brand_box = brand.bounding_box()
            padding_left = page.locator('.site-header').evaluate("el=>parseFloat(getComputedStyle(el).paddingLeft)")
            assert abs(brand_box['x'] - (header_box['x'] + padding_left)) <= 2
            assert brand_box['width'] < 180 if width > 600 else brand_box['width'] > 150
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if width == 1280:
                page.screenshot(path='/mnt/data/v26_home_header_preview.png')
            page.close()

        page = browser.new_page(viewport={'width': 1100, 'height': 800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(project_html)
        page.add_style_tag(content=(ROOT / 'static/style.css').read_text())
        page.evaluate('''data => {
          const a=document.querySelector('[data-lightbox]');
          a.querySelector('img').src=data;
          a.dataset.fullSrc='data:image/jpeg;base64,not-an-image';
          const O=window.URL;
          window.URL=class extends O {constructor(url,base){super(url, base==='null' ? 'https://nickckincaid.com' : base)}};
        }''', good)
        page.add_script_tag(content=(ROOT / 'static/site.js').read_text())
        page.locator('[data-lightbox]').first.click()
        page.wait_for_function("document.querySelector('.lightbox-image').classList.contains('is-loaded')")
        assert page.locator('#lightbox').evaluate('el=>el.open')
        assert page.locator('.lightbox-unavailable').is_hidden()
        assert page.locator('.lightbox-download').is_hidden()  # Original failed; preview is displayed.
        page.locator('.lightbox-close').click()
        assert not page.locator('#lightbox').evaluate('el=>el.open')
        page.evaluate("location.hash='photo=%'")
        page.wait_for_timeout(100)
        assert not errors, errors
        page.close()

        # Both original and thumbnail broken: show a readable message, not a blank viewer.
        page = browser.new_page(viewport={'width': 390, 'height': 750})
        page.set_content(project_html)
        page.add_style_tag(content=(ROOT / 'static/style.css').read_text())
        page.evaluate("""() => {
          const a=document.querySelector('[data-lightbox]');
          a.querySelector('img').src='data:image/jpeg;base64,bad';
          a.dataset.fullSrc='data:image/jpeg;base64,also-bad';
          const O=window.URL;
          window.URL=class extends O{constructor(url,base){super(url,base==='null'?'https://nickckincaid.com':base)}};
        }""")
        page.add_script_tag(content=(ROOT / 'static/site.js').read_text())
        page.locator('[data-lightbox]').click()
        page.wait_for_function("document.querySelector('.lightbox-unavailable').hidden === false")
        assert page.locator('.lightbox-unavailable').is_visible()
        assert page.locator('.lightbox-download').is_hidden()
        page.locator('.lightbox-close').click()
        assert not page.locator('#lightbox').evaluate('el=>el.open')
        browser.close()
print('V26 browser checks: header desktop/mobile, failed images, invalid photo URL passed')
