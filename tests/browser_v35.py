"""Optional interactive smoke test; requires Playwright and Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'static/admin.html').read_text()
css=(root/'static/admin.css').read_text()
ui=(root/'static/admin-ui.js').read_text()
storage=(root/'static/admin-storage.js').read_text()
URL='https://dash.cloudflare.com/0f2e0380eafff7a2d0f444bfb5efab09/ai/workers-ai/usage'
# set_content is intentionally synthetic. Remove only the inline CSP (no live requests).
import re
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', html)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width in (1180,375):
        page=browser.new_page(viewport={'width':width,'height':850})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html)
        page.add_style_tag(content=css)
        page.evaluate("() => document.getElementById('editor-form').hidden=false")
        page.add_script_tag(content=ui)
        page.add_script_tag(content=storage)
        assert page.locator('details.admin-panel').count()==11
        titles=page.locator('#editor-form > details.admin-panel > summary').all_text_contents()
        assert [s.strip() for s in titles]==['Project details','Upload & cover crop','Photographs & metadata','Batch edit','Search & accessibility descriptions','Sharing & search preview','Check image links'],titles
        assert page.locator('#project-title').count()==1
        assert page.locator('#project-order').get_attribute('min')=='0'
        assert page.locator('details[data-panel="project-details"]').get_attribute('open') is not None
        # Verify both accordion control and validation while collapsed.
        page.locator('details[data-panel="project-details"] > summary').click()
        assert page.locator('details[data-panel="project-details"]').get_attribute('open') is None
        assert page.locator('#editor-form').evaluate('(e)=>e.checkValidity()') is False
        assert page.locator('details[data-panel="project-details"]').get_attribute('open') is not None
        page.locator('#projects-pane').evaluate('(node)=>node.hidden=true')
        page.locator('#storage-pane').evaluate('(node)=>node.hidden=false')
        link=page.locator('a:has-text("View actual Workers AI usage")')
        assert link.get_attribute('href')==URL
        assert link.get_attribute('target')=='_blank'
        assert 'noopener' in link.get_attribute('rel')
        assert page.locator('details[data-panel="ai-usage"]').count()==0
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),width
        page.evaluate('''() => {window.fetch=(url,options)=>{
          if (!options.signal) throw Error('Missing timeout signal');
          return Promise.resolve({ok:true,status:200,json:async()=>({objects:3,photographs:1,bytes:1024,incomplete:false})});
        };}''')
        page.locator('#storage-refresh').click()
        page.locator('#storage-status').get_by_text('Storage totals checked.').wait_for()
        page.evaluate('''() => {window.fetch=(url,options)=>Promise.resolve({ok:false,status:503,json:async()=>{throw Error('Invalid JSON')}});}''')
        page.locator('#storage-refresh').click()
        page.locator('#storage-status').get_by_text('Storage service returned HTTP 503, not JSON.').wait_for()
        assert not errors,errors
        page.close()
    browser.close()
print('V35 desktop/mobile interactive smoke checks passed')
