"""Optional local V35b browser check: build date, skeleton states and Fit All."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parents[1]
admin=(root/'dist/admin/index.html').read_text(encoding='utf-8')
css=(root/'dist/style.css').read_text(encoding='utf-8')
js=(root/'dist/site.js').read_text(encoding='utf-8')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in [1180,375]:
        page=browser.new_page(viewport={'width':width,'height':800})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',admin))
        page.add_style_tag(content=(root/'static/admin.css').read_text())
        page.add_script_tag(content=(root/'static/admin-storage.js').read_text())
        t=page.locator('#website-last-updated')
        assert t.get_attribute('datetime') and 'Website Last Updated:' in page.locator('#storage-pane').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.set_content('''<div class="works-grid"><article class="project-card"><a class="project-card-media"><img src="/slow-home.jpg" alt="Cover"></a></article></div><div class="project-photos"><a class="gallery-link"><img src="/slow-gallery.jpg" alt="Photo"></a></div>''')
        page.add_style_tag(content=css)
        page.evaluate('''() => {for(const img of document.querySelectorAll('img'))Object.defineProperty(img,'complete',{configurable:true,get:()=>false});}''')
        page.add_script_tag(content=js)
        assert page.locator('.photo-loading').count()==2
        assert page.locator('.gallery-link').evaluate("e=>getComputedStyle(e).aspectRatio")=='3 / 2'
        page.locator('.project-photos').evaluate("el => el.classList.add('is-contact-sheet')")
        assert page.locator('.gallery-link').evaluate("e=>getComputedStyle(e).aspectRatio")=='1 / 1'
        page.evaluate("() => document.querySelector('.gallery-link img').dispatchEvent(new Event('load'))")
        assert page.locator('.gallery-link.photo-loading').count()==0
        page.evaluate("() => document.querySelector('.project-card-media img').dispatchEvent(new Event('error'))")
        assert page.locator('.photo-loading').count()==0
        assert not errors,errors
        page.close()
    browser.close()
print('V35b browser tests passed: website build timestamp, skeletons, Fit All, mobile')
