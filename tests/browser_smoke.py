"""Optional interaction smoke test (requires local Chromium + Playwright + Pillow).

Uses page.set_content so it doesn't depend on localhost navigation privileges.
"""
import base64
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as td:
    base=Path(td)
    for p in ['build.py','photo_exif.py']:
        shutil.copy2(ROOT/p,base/p)
    shutil.copytree(ROOT/'static',base/'static')
    (base/'content'/'projects').mkdir(parents=True)
    (base/'content'/'site.json').write_text(json.dumps({'name':'Nicholas Kincaid'}))
    (base/'media'/'test').mkdir(parents=True)
    photo=base/'media'/'test'/'test-01.jpg'
    Image.new('RGB',(1200,900),(73,95,110)).save(photo,quality=88)
    (base/'content'/'projects'/'test.json').write_text(json.dumps({
        'title':'Test project','published':True,'cover':'/media/test/test-01.jpg',
        'gallery':[],'photo_details':[{'image':'/media/test/test-01.jpg','id':'1'*24,'iso':'200'}],
    }))
    subprocess.run(['python3','build.py'],cwd=base,check=True,capture_output=True)
    html=(base/'dist'/'projects'/'test'/'index.html').read_text()
    data='data:image/jpeg;base64,'+base64.b64encode(photo.read_bytes()).decode()
    html=re.sub(r'/media/test/test-01.jpg(?:\?v=[a-f0-9]+)?', data,html)
    # Inject source locally; no network navigation is required for interaction tests.
    html=re.sub(r'<script src="/site.js\?v=[a-f0-9]+" defer></script>','',html)
    html=re.sub(r'<link rel="stylesheet" href="/style.css\?v=[a-f0-9]+">','',html)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1280,'height':800})
        page.set_content(html)
        page.add_style_tag(content=(base/'dist'/'style.css').read_text())
        page.add_script_tag(content=(base/'dist'/'site.js').read_text())
        assert page.locator('.project-title').inner_text()=='Test project'
        assert 'ISO 200' in page.locator('.photo-caption').inner_text()
        page.locator('[data-lightbox]').click()
        assert page.locator('#lightbox').evaluate('(e) => e.open')
        page.locator('.lightbox-close').click()
        assert not page.locator('#lightbox').evaluate('(e) => e.open')
        mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        mobile.set_content(html)
        mobile.add_style_tag(content=(base/'dist'/'style.css').read_text())
        mobile.add_script_tag(content=(base/'dist'/'site.js').read_text())
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        browser.close()
print('Browser smoke passed: project page, captions, viewer open/close, mobile layout')
