"""Browser checks without network or filesystem navigation privileges."""
import base64, json, re, shutil, tempfile, subprocess
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as td:
    base=Path(td)
    for item in ['build.py','photo_exif.py','note_format.py']: shutil.copy2(ROOT/item,base/item)
    shutil.copytree(ROOT/'static',base/'static')
    (base/'content'/'projects').mkdir(parents=True)
    (base/'content'/'notes').mkdir(parents=True)
    (base/'content'/'site.json').write_text(json.dumps({'name':'Nicholas Kincaid'}))
    (base/'media'/'test').mkdir(parents=True)
    pic=base/'media'/'test'/'test-01.jpg'
    Image.new('RGB',(800,1600),(80,120,130)).save(pic,quality=85)
    project={'title':'Test','published':True,'cover':'/media/test/test-01.jpg',
        'gallery':[], 'photo_details':[{'image':'/media/test/test-01.jpg','id':'c'*24}]}
    (base/'content'/'projects'/'test.json').write_text(json.dumps(project))
    (base/'content'/'notes'/'first.json').write_text(json.dumps({
        'title':'First note','body':'Hello from notes','published':True,'published_at':'2026-10-15T23:12:00Z'}))
    subprocess.run(['python3','build.py'],cwd=base,check=True,capture_output=True)
    dist=base/'dist'
    uri='data:image/jpeg;base64,'+base64.b64encode(pic.read_bytes()).decode()
    html=(dist/'projects'/'test'/'index.html').read_text()
    html=re.sub(r'<script src="/site.js\?v=[a-f0-9]+" defer></script>', '', html)
    html=re.sub(r'<link rel="stylesheet" href="/style.css\?v=[a-f0-9]+">','',html)
    html=re.sub(r'/media/test/test-01.jpg(?:\?v=[a-f0-9]+)?',uri,html)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        for size in [{'width':1280,'height':800},{'width':390,'height':844}]:
            page=browser.new_page(viewport=size)
            page.set_content(html)
            page.add_style_tag(content=(dist/'style.css').read_text())
            page.add_script_tag(content=(dist/'site.js').read_text())
            assert page.locator('.site-nav a').all_text_contents()==['Projects','Notes','Inquire']
            assert page.locator('.project-bottom-inquiry').count()==1
            page.locator('[data-lightbox]').click()
            assert page.locator('#lightbox').evaluate('(d)=>d.open'), 'Click opens viewer'
            assert page.locator('.lightbox-image').get_attribute('src').startswith('data:image/jpeg')
            stage=page.locator('.lightbox-stage').bounding_box()
            img=page.locator('.lightbox-image').bounding_box()
            assert img['width']<=stage['width']+2 and img['height']<=stage['height']+2, (img,stage)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('.lightbox-close').click()
            assert not page.locator('#lightbox').evaluate('(d)=>d.open'), 'Close works'
            # A fresh deep link opens the same viewer; simulated URL because test
            # environment blocks navigation to HTTP and file URLs.
            patched=(dist/'site.js').read_text().replace(
                'const deepLink = selectedFromUrl();', 'const deepLink = 0;')
            deep=browser.new_page(viewport=size)
            deep.set_content(html)
            deep.add_style_tag(content=(dist/'style.css').read_text())
            deep.add_script_tag(content=patched)
            assert deep.locator('#lightbox').evaluate('(d)=>d.open'), 'Direct deep link opens viewer'
            assert deep.locator('.lightbox-image').get_attribute('src').startswith('data:image/jpeg')
            assert deep.evaluate('document.documentElement.scrollWidth <= innerWidth')
            deep.close()
            # Test notes editor UI with mocked API response, without live credentials.
            admin=(dist/'admin'/'index.html').read_text()
            admin=re.sub(r'<script src="/admin/[^\"]+" defer></script>','',admin)
            admin=re.sub(r'<link rel="stylesheet" href="/admin/admin.css">','',admin)
            admin=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', admin)
            editor=browser.new_page(viewport=size)
            editor.set_content(admin)
            editor.add_style_tag(content=(dist/'admin'/'admin.css').read_text())
            editor.evaluate('''() => { window.fetch = async (url,opts={}) => {
                if (!url.endsWith('/notes')) return {ok:true,json:async()=>({projects:[]})};
                if (!opts.method || opts.method === 'GET') return {ok:true,json:async()=>({notes:[]})};
                if (opts.method === 'POST') return {ok:true,json:async()=>({ok:true,slug:'test-note'})};
                return {ok:true,json:async()=>({ok:true})};
            }; }''')
            editor.add_script_tag(content=(dist/'admin'/'admin-note-format.js').read_text())
            editor.add_script_tag(content=(dist/'admin'/'admin-notes.js').read_text())
            editor.locator('#show-notes').click()
            editor.locator('#add-note').click()
            editor.locator('#note-title').fill('Hello Notes')
            editor.locator('#note-body').fill('A short post.')
            editor.locator('#note-published').check()
            editor.locator('#save-note').click()
            editor.wait_for_timeout(150)
            assert 'saved' in editor.locator('#notes-status').inner_text().lower(), editor.locator('#notes-status').inner_text()
            assert editor.evaluate('document.documentElement.scrollWidth <= innerWidth')
            editor.close()
            page.close()
            print('Browser checks passed',size)
        browser.close()
