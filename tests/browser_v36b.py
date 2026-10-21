"""Optional Chromium check for visitor-local build dates and admin headings."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re

root=Path(__file__).resolve().parents[1]
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',(root/'static/admin.html').read_text())
js=(root/'static/admin-storage.js').read_text()
css=(root/'static/admin.css').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    seen=[]
    for zone in ('America/Los_Angeles','Europe/London','Asia/Tokyo'):
        page=browser.new_page(timezone_id=zone,viewport={'width':375,'height':812})
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.set_content(html)
        page.add_style_tag(content=css)
        t=page.locator('#website-last-updated')
        t.evaluate("el=>{el.setAttribute('datetime','2026-10-21T12:00:00+00:00');el.textContent='Oct 21, 2026 12:00 UTC';}")
        page.add_script_tag(content=js)
        text=t.inner_text()
        expected=page.evaluate("""() => new Intl.DateTimeFormat(undefined,{
          year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'
        }).format(new Date('2026-10-21T12:00:00+00:00'))""")
        assert text==expected,(zone,text,expected)
        assert 'your local time' in page.locator('#website-timezone-note').inner_text()
        assert t.get_attribute('title').startswith('Build time (UTC):')
        assert page.get_by_text('Project Description',exact=False).count() >= 1
        assert 'Project Details' in page.locator('[data-panel="project-details"] > summary').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors,(zone,errors)
        seen.append(text)
        page.close()
    assert len(set(seen))==3,seen
    browser.close()
print('V36b browser checks passed: 3 viewer time zones, headings, mobile layout')
