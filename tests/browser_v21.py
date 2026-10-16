"""Optional browser smoke test for the R2 legacy-file migration controls."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re

root=Path(__file__).resolve().parents[1]
markup=(root/'static/admin.html').read_text()
markup=re.sub(r'<script src="/admin/[^\"]+" defer></script>', '', markup)
markup=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', markup)
slug='handmade-watusi-horn-table'
legacy='/media/'+slug+'/'+slug+'-01-00232f36de234e2c905d50cb.jpg'
new='/media/'+slug+'/00232f36de234e2c905d50cb/'+slug+'-01.jpg'
project={'title':'Handmade Watusi Horn Table','slug':slug,'revision':'a'*40,'published':True,
         'cover':legacy,'gallery':[],'photo_details':[{'image':legacy,'storage':'r2','id':'d'*24}], 'order':1}

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in (1366,390):
        page=browser.new_page(viewport={'width':width,'height':800 if width>500 else 844})
        page.set_content(markup)
        page.evaluate('''(project) => {
          window.confirm = () => true;
          window.fetch = async (path,options={}) => {
            const output = path.endsWith('/projects') ? {projects:[project]} :
              path.endsWith('/standardize') ? (() => {
                const input = JSON.parse(options.body);
                if (input.action === 'prepare') return {oldPath:input.oldPath,newPath:'__NEW__',variants:[]};
                project.cover='__NEW__'; project.photo_details[0].image='__NEW__';
                project.revision='b'.repeat(40);
                return {ok:true,migrated:1,oldCopiesRetained:true};
              })() : {ok:true};
            return {ok:true,status:200,json:async()=>output};
          };
        }'''.replace('__NEW__',new),project)
        page.add_script_tag(content=(root/'static/admin.js').read_text())
        page.wait_for_selector('#standardize-photos:not([hidden])')
        btn=page.locator('#standardize-photos')
        assert '1 old photo filename' in btn.inner_text()
        btn.click()
        page.wait_for_function("document.querySelector('#status').textContent.includes('Standardized 1')")
        assert page.locator('#standardize-photos').is_hidden()
        assert not page.locator('html').evaluate('(el) => el.scrollWidth > innerWidth')
        print('Migration admin browser test passed at width',width)
        page.close()
    browser.close()
