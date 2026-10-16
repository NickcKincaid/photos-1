"""Offline browser smoke test for viewer and four-field captions."""
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
import tempfile, json, shutil, subprocess, time, socket, threading, http.server, functools

ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT = Path('/mnt/data/image(20261016-021423).png')
OUT = Path('/mnt/data')

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    for f in ['build.py','photo_exif.py','note_format.py']:
        shutil.copy2(ROOT/f, tmp/f)
    shutil.copytree(ROOT/'static', tmp/'static')
    (tmp/'content'/'projects').mkdir(parents=True)
    (tmp/'content'/'notes').mkdir(parents=True)
    (tmp/'content'/'site.json').write_text('{"name":"Nicholas Kincaid"}')
    (tmp/'media'/'test').mkdir(parents=True)
    sample = Image.open(SCREENSHOT).convert('RGB')
    sample.crop((445, 4, 1300, 404)).save(tmp/'media'/'test'/'closeup.jpg', quality=90)
    sample.crop((0, 140, 430, 721)).save(tmp/'media'/'test'/'portrait.jpg', quality=90)
    (tmp/'content'/'projects'/'test.json').write_text(json.dumps({
        'title':'Handmade Watusi Horn Table', 'published':True, 'cover':'/media/test/closeup.jpg',
        'gallery':['/media/test/portrait.jpg'], 'photo_details':[
            {'image':'/media/test/closeup.jpg','focal_length':'120','shutter_speed':'1/400','iso':'220','camera':'Nikon Z6','aperture':'8'},
            {'image':'/media/test/portrait.jpg','focal_length':'35','shutter_speed':'1/160','iso':'100','lens':'Nikkor'}
        ]
    }))
    subprocess.run(['python3','build.py'],cwd=tmp,check=True,capture_output=True)
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_): pass
    serv=http.server.ThreadingHTTPServer(('127.0.0.1',port),functools.partial(Handler,directory=str(tmp/'dist')))
    th=threading.Thread(target=serv.serve_forever,daemon=True);th.start()
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            for width,height,name in [(1365,800,'desktop'),(390,844,'mobile')]:
                page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
                page.goto(f'http://127.0.0.1:{port}/projects/test/')
                assert '120 mm · f/8 · 1/400 s · ISO 220' in page.locator('.photo-caption').first.inner_text()
                assert 'Nikon' not in page.locator('.photo-caption').first.inner_text()
                page.locator('.gallery-link').first.click()
                page.wait_for_selector('dialog[open] .lightbox-image.is-loaded')
                assert '#photo=' in page.url
                image=page.locator('.lightbox-image').bounding_box()
                viewport=page.evaluate('({w:innerWidth,h:innerHeight})')
                assert image['x']>=0 and image['y']>=0
                assert image['x']+image['width']<=viewport['w']+1
                assert image['y']+image['height']<=viewport['h']+1
                style=page.locator('#lightbox').evaluate('(el) => ({background:getComputedStyle(el).backgroundImage,accent:el.style.getPropertyValue("--viewer-glow")})')
                assert 'radial-gradient' in style['background']
                assert 'rgb(' not in page.locator('#lightbox').evaluate('(el)=>el.style.backgroundColor'), 'No full-frame image hue wash'
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=str(OUT / f'photo_viewer_v19_{name}.png'))
                page.locator('.lightbox-next').click()
                page.wait_for_timeout(150)
                assert page.locator('.lightbox-counter').inner_text()=='02 / 02'
                page.locator('.lightbox-close').click()
                assert not page.locator('#lightbox').evaluate('(el)=>el.open')
                page.close()
                print(name, 'passed',style)
            browser.close()
    finally:
        serv.shutdown()
