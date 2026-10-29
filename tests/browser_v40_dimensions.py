"""Optional Chromium smoke test: automatic dimensions never require Save Project."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',(root/'static/admin.html').read_text())
css=(root/'static/admin.css').read_text()
image='/media/a/'+'a'*24+'/a-01.jpg'
project={'slug':'a','title':'A','published':True,'order':1,'revision':'a'*40,
 'cover':image,'gallery':[], 'photo_details':[{'image':image,'storage':'r2',
 'id':'1'*24,'focal_length':'40mm','aperture':'f/5','shutter_speed':'1/250s','iso':'ISO 400'}]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in (375,1280):
        page=browser.new_page(viewport={'width':width,'height':850})
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(html)
        page.add_style_tag(content=css)
        page.evaluate('''project => {
          window.dimensionCalls = 0;
          window.saveCalls = 0;
          window.fetch = async (url, opts={}) => {
            if(String(url).endsWith('/api/admin/projects')) return {ok:true,status:200,json:async()=>({projects:[project]})};
            if(String(url).endsWith('/api/admin/dimensions')) {
              window.dimensionCalls++;
              return {ok:true,status:200,json:async()=>({ok:true,revision:'b'.repeat(40),updated:1,
                dimensions:[{image:project.cover,width:2400,height:1600}]})};
            }
            if(String(url).endsWith('/api/admin/save')) window.saveCalls++;
            throw Error('Unexpected fetch '+url);
          };
        }''',project)
        for name in ['admin-processing.js','admin-drafts.js','admin-tools.js','admin-exposure.js','admin.js']:
            page.add_script_tag(content=(root/'static'/name).read_text())
        page.wait_for_function('window.dimensionCalls === 1',timeout=5000)
        assert page.locator('#capture-dimensions').count()==0
        assert page.evaluate('window.saveCalls')==0
        assert page.locator('#publish').is_enabled()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors,errors
        page.close()
    browser.close()
print('V40: automatic dimension backfill called once without Save; mobile and desktop passed.')
