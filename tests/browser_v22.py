"""Interactive viewer download-name smoke test (run when Playwright/Chromium installed)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import importlib.util
import sys
import re

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('build_v22',ROOT/'build.py')
build=importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
photo1='/media/test/id-aaa/old-name-01.jpg'
photo2='/media/test/id-bbb/old-name-02.jpg'
project={'title':'Handmade Watusi Horn Table','slug':'test','url':'/projects/test/',
         'cover':photo1,'gallery':[photo2],
         'photo_details':[{'image':photo1,'id':'a'*24},{'image':photo2,'id':'b'*24}]}
page_markup=build.project_page({'name':'Nicholas Kincaid'},project,0,[project])
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in (1280,390,320):
        page=browser.new_page(viewport={'width':width,'height':780})
        markup=re.sub(r'<script src="/site.js[^>]+></script>', '', page_markup)
        markup=re.sub(r'<link rel="stylesheet"[^>]+>', '', markup)
        page.set_content(markup)
        page.add_style_tag(content=(ROOT/'static/style.css').read_text())
        # about:blank test origin has no host; substitute a valid base for the local smoke test only.
        script=(ROOT/'static/site.js').read_text().replace('new URL(item.dataset.fullSrc, location.origin)',
                            "new URL(item.dataset.fullSrc, 'https://nickckincaid.com')")
        page.add_script_tag(content=script)
        page.locator('[data-lightbox]').first.click()
        link=page.locator('.lightbox-download')
        assert link.get_attribute('download')=='handmade-watusi-horn-table-01.jpg'
        assert 'download=handmade-watusi-horn-table-01.jpg' in link.get_attribute('href')
        page.locator('.lightbox-next').click()
        assert link.get_attribute('download')=='handmade-watusi-horn-table-02.jpg'
        assert 'download=handmade-watusi-horn-table-02.jpg' in link.get_attribute('href')
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'Horizontal overflow at {width}'
        page.locator('.lightbox-close').click()
        assert not page.locator('#lightbox').evaluate('(el)=>el.open')
        print('PASS viewer download filename',width)
        page.close()
    browser.close()
