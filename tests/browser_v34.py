from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
import re
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', (root/'static/admin.html').read_text())
css=(root/'static/admin.css').read_text()
script=(root/'static/admin-ui.js').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1180,'height':850})
    errors=[]
    page.on('pageerror',lambda exc: errors.append(str(exc)))
    page.set_content(html)
    page.add_style_tag(content=css)
    page.evaluate('''() => {document.getElementById('editor-form').hidden=false;document.getElementById('status').textContent='Editing project.';document.getElementById('project-title').value='CDMX';}''')
    page.add_script_tag(content=script)
    assert page.locator('details.admin-panel').count()==11, page.locator('details.admin-panel').count()
    assert page.locator('a:has-text("Cloudflare deployments")').count()==0
    assert page.locator('#deploy-indicator').count()==0
    assert page.locator('details[data-panel="project-details"]').get_attribute('open') is not None
    assert page.locator('details[data-panel="uploads"]').get_attribute('open') is None
    page.locator('details[data-panel="uploads"] > summary').click()
    assert page.locator('details[data-panel="uploads"]').get_attribute('open') is not None
    page.locator('details[data-panel="uploads"] > summary').click()
    assert page.locator('details[data-panel="uploads"]').get_attribute('open') is None
    # Ensure browser validation opens collapsed project details instead of trapping invalid required fields
    page.locator('details[data-panel="project-details"] > summary').click()
    page.locator('#project-title').evaluate('(el)=>{el.value="";}')
    assert not page.locator('#editor-form').evaluate('(e)=>e.checkValidity()')
    assert page.locator('details[data-panel="project-details"]').get_attribute('open') is not None
    page.locator('#project-title').evaluate('(el)=>el.value="CDMX"')
    page.screenshot(path=str(Path('/tmp')/'v34-admin-desktop.png'),full_page=True)
    page.locator('#projects-pane').evaluate('(el)=>el.hidden=true')
    page.locator('#storage-pane').evaluate('(el)=>el.hidden=false')
    page.screenshot(path=str(Path('/tmp')/'v34-storage-desktop.png'),full_page=True)
    assert page.locator('#v34-ai-usage').count()==0
    assert page.locator('a:has-text("View actual Workers AI usage")').count()==1
    assert not errors, errors
    phone=browser.new_page(viewport={'width':375,'height':812},is_mobile=True,has_touch=True)
    phone.set_content(html)
    phone.add_style_tag(content=css)
    phone.evaluate('''() => {document.getElementById('editor-form').hidden=false;}''')
    phone.add_script_tag(content=script)
    phone.screenshot(path=str(Path('/tmp')/'v34-admin-phone.png'),full_page=True)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth'),phone.evaluate('document.documentElement.scrollWidth')
    assert not errors, errors
    browser.close()
print('V34 admin desktop/phone: 11 collapsible panels, form validation, provider link, mobile overflow passed')
