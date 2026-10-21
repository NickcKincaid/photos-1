"""Manual V36 mobile gallery verification (requires Chromium and Playwright)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
css = (root/'dist/style.css').read_text(encoding='utf-8')
js = (root/'dist/site.js').read_text(encoding='utf-8')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width in (375, 1200):
        page = browser.new_page(viewport={'width':width, 'height':800})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content('''<main class="page"><div class="project-heading"><h1 class="project-title">CDMX</h1><button class="contact-sheet-toggle" aria-pressed="false">Fit All</button></div><div class="project-photos"><figure class="gallery-item"><a href="#photo=1" class="gallery-link" style="--photo-ratio:3000/2000" aria-label="Open A pair of pedestrians by storefronts in viewer"><img src="/slow.jpg" width="3000" height="2000" alt="A pair of pedestrians by storefronts"></a></figure></div></main>''')
        page.add_style_tag(content=css)
        page.evaluate('''() => {Object.defineProperty(document.querySelector('.gallery-link img'), 'complete',{configurable:true,get:()=>false});}''')
        page.add_script_tag(content=js)
        assert page.locator('.gallery-link.photo-loading').count()==1
        assert page.locator('.gallery-link').evaluate('el=>getComputedStyle(el).aspectRatio')=='3000 / 2000'
        assert page.get_by_role('link',name='Open A pair of pedestrians by storefronts in viewer').count()==1
        page.locator('.contact-sheet-toggle').click()
        assert page.locator('.gallery-link').evaluate('el=>getComputedStyle(el).aspectRatio')=='1 / 1'
        page.locator('.gallery-link img').evaluate('el=>el.dispatchEvent(new Event("load"))')
        assert page.locator('.gallery-link.photo-loading').count()==0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        page.close()
    browser.close()
print('V36 gallery tests passed: dimensions, Fit All, accessible names and mobile')
