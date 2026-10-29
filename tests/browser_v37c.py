"""Smoke test for date details shown in the private Notes editor (offline mocked API)."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', (root/'static/admin.html').read_text())
css=(root/'static/admin.css').read_text()
notes_js=(root/'static/admin-notes.js').read_text()
mock_notes={"notes":[{"slug":"note-abc","revision":"rev-1","title":"Travel","body":"Content","published":True,
   "created_at":"2026-10-20T17:30:00.000Z","published_at":"2026-10-28T23:15:00.000Z","date_mode":"published"},
   {"slug":"note-old","revision":"rev-2","title":"Older","body":"Text","published":False,"created_at":None,"published_at":None,"date_mode":"created"}]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for tz in ('America/Los_Angeles','Europe/London'):
        ctx=browser.new_context(timezone_id=tz,viewport={'width':375,'height':820})
        page=ctx.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html)
        page.add_style_tag(content=css)
        page.evaluate('''(notes) => {
          window.fetch = async ()=>({ok:true,status:200,json:async()=>notes});
        }''',mock_notes)
        page.add_script_tag(content=notes_js)
        page.locator('#show-notes').click()
        page.locator('#notes-list .note-item').first.wait_for()
        expected_created=page.evaluate('''() => new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date('2026-10-20T17:30:00.000Z'))''')
        expected_published=page.evaluate('''() => new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date('2026-10-28T23:15:00.000Z'))''')
        assert page.locator('#note-started-date').inner_text()==expected_created
        assert page.locator('#note-first-published-date').inner_text()==expected_published
        assert page.locator('#note-displayed-date').inner_text()==expected_published
        assert page.locator('#note-started-date').get_attribute('datetime')=='2026-10-20T17:30:00.000Z'
        page.locator('#note-date-mode').select_option('created')
        assert page.locator('#note-displayed-date').inner_text()==expected_created
        assert page.locator('#note-first-published-date').inner_text()==expected_published
        page.locator('#note-date-mode').select_option('published')
        assert page.locator('#note-displayed-date').inner_text()==expected_published
        page.on('dialog',lambda d:d.accept())
        page.locator('#notes-list .note-item').nth(1).click()
        assert page.locator('#note-started-date').inner_text()=='Not recorded'
        assert page.locator('#note-first-published-date').inner_text()=='Not published yet'
        page.locator('#add-note').click()
        assert page.locator('#note-started-date').get_attribute('datetime')
        assert page.locator('#note-first-published-date').inner_text()=='Not published yet'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors,errors
        ctx.close()
    browser.close()
print('V37c date controls passed browser tests in California and London timezones.')
