"""Offline V24 browser smoke checks. Pages load directly to avoid blocked local HTTP navigation."""
import sys, tempfile, json, io, base64, re
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import build

def offline_html(markup):
    markup=re.sub(r'<meta\s+http-equiv="Content-Security-Policy"[^>]*>','',markup)
    return re.sub(r'<(?:script|link)\b[^>]+(?:src|href)="/(?:site\.js|style\.css|admin/)[^"]+"[^>]*(?:></script>|>)','',markup)

with tempfile.TemporaryDirectory(prefix='photo-v24-') as directory:
    tmp=Path(directory);content=tmp/'content';(content/'notes').mkdir(parents=True);(content/'projects').mkdir()
    (content/'site.json').write_text(json.dumps({'name':'Nicholas Kincaid'}))
    photo1='/media/sample/'+'a'*24+'/sample-01.jpg'
    photo2='/media/sample/'+'b'*24+'/sample-02.jpg'
    record={'title':'Sample Project','published':True,'order':1,'cover':photo1,'gallery':[photo2],
      'photo_details':[{'image':p,'id':i*24,'storage':'r2'} for p,i in [(photo1,'a'),(photo2,'b')]]}
    (content/'projects'/'sample.json').write_text(json.dumps(record))
    old_content,old_out=build.CONTENT,build.OUT
    try:
        build.CONTENT=content;build.OUT=tmp/'dist';build.run()
    finally: build.CONTENT,build.OUT=old_content,old_out
    project_markup=(tmp/'dist/projects/sample/index.html').read_text()
    home_markup=(tmp/'dist/index.html').read_text()
    assert 'twitter:image' in home_markup and 'og:image:alt' in project_markup
    sample=Image.new('RGB',(1200,800),(99,131,155));buffer=io.BytesIO();sample.save(buffer,format='JPEG')
    data_image='data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1200,'height':850})
        
        page.set_content(offline_html(project_markup),wait_until='domcontentloaded')
        page.evaluate('''data => {
          document.querySelectorAll('[data-lightbox]').forEach(a => {
            a.dataset.fullSrc=data;
            a.querySelector('img').src=data;
          });
        }''',data_image)
        page.add_style_tag(content=(ROOT/'static/style.css').read_text())
        page.evaluate("() => {const U=window.URL;window.URL=class extends U{constructor(url,base){super(url,base==='null'?'https://nickckincaid.com':base)}};}")
        page.add_script_tag(content=(ROOT/'static/site.js').read_text())
        page.locator('[data-lightbox]').first.click()
        assert page.locator('#lightbox').evaluate('(el)=>el.open')
        page.locator('.lightbox-zoom').click()
        assert page.locator('#lightbox').evaluate("el=>el.classList.contains('is-zoomed')")
        page.locator('.lightbox-zoom').click()
        assert not page.locator('#lightbox').evaluate("el=>el.classList.contains('is-zoomed')")
        page.locator('.lightbox-next').click()
        assert '02 / 02' in page.locator('.lightbox-counter').inner_text()
        page.locator('.lightbox-close').click()
        assert not page.locator('#lightbox').evaluate('(el)=>el.open')
        page.close()

        admin_markup=offline_html((ROOT/'static/admin.html').read_text())
        project_response={'projects':[dict(record,slug='sample',revision='a'*40)]}
        fake_fetch='''window.fetch=async function(url) {
          let response;
          if(String(url).includes('/api/admin/projects')) response=PROJECT_RESPONSE;
          else if(String(url).includes('/api/admin/notes')) response={notes:[]};
          else if(String(url).includes('/api/admin/storage')) response={objects:9,photographs:3,bytes:2500000,incomplete:false};
          else if(String(url).includes('/api/admin/backup')) return new Response('{"format":"backup"}',{status:200,headers:{'Content-Type':'application/json'}});
          else throw new Error('Unexpected API '+url);
          return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
        };
        window.confirm=()=>true;
        window.PhotoPrep={};'''.replace('PROJECT_RESPONSE',json.dumps(project_response))
        def load_editor(page,storage=None):
            page.set_content(admin_markup,wait_until='domcontentloaded')
            storage=storage or {}
            page.evaluate('''data => {
              window.__draftData=data;
              Object.defineProperty(window,'localStorage',{configurable:true,value:{
                setItem(k,v){window.__draftData[k]=v;},getItem(k){return window.__draftData[k]??null;},
                removeItem(k){delete window.__draftData[k];}
              }});
            }''',storage)
            page.evaluate(fake_fetch)
            page.add_style_tag(content=(ROOT/'static/admin.css').read_text())
            for script in ['admin-drafts.js','admin-tools.js','admin-exposure.js','admin.js','admin-note-format.js','admin-notes.js','admin-storage.js']:
                page.add_script_tag(content=(ROOT/'static'/script).read_text())
            page.locator('#project-title').wait_for(state='visible')
        page=browser.new_page(viewport={'width':1150,'height':850},accept_downloads=True)
        load_editor(page)
        page.locator('#project-title').fill('My edited project')
        page.locator('#social-image').select_option(photo2)
        page.wait_for_timeout(2100)
        local_drafts=page.evaluate('window.__draftData')
        assert json.loads(local_drafts['nickckincaid:draft:v24:project:sample'])['value']['title']=='My edited project'
        page.close()
        page=browser.new_page(viewport={'width':1150,'height':850},accept_downloads=True)
        load_editor(page,local_drafts)
        assert page.locator('#project-title').input_value()=='My edited project'
        assert page.locator('#social-image').input_value()==photo2
        page.locator('#show-storage').click()
        page.locator('#storage-refresh').click()
        page.wait_for_function("document.getElementById('storage-photos').textContent==='3'")
        with page.expect_download() as download: page.locator('#download-metadata').click()
        assert download.value.suggested_filename.endswith('.json')
        page.locator('#show-notes').click()
        page.locator('#note-title').wait_for(state='visible')
        page.locator('#note-title').fill('An unsaved note')
        page.locator('#note-body').fill('Unpublished text about photography.')
        page.wait_for_timeout(2100)
        local_drafts=page.evaluate('window.__draftData')
        assert 'nickckincaid:draft:v24:note:new' in local_drafts
        page.close()
        page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
        load_editor(page,local_drafts)
        page.locator('#show-notes').click()
        page.wait_for_function("document.getElementById('note-title').value==='An unsaved note'")
        assert page.locator('#note-body').input_value()=='Unpublished text about photography.'
        page.close()
        phone=browser.new_page(viewport={'width':390,'height':844})
        phone.set_content(offline_html(project_markup),wait_until='domcontentloaded')
        phone.evaluate('''data => document.querySelectorAll('[data-lightbox]').forEach(a=>{
            a.dataset.fullSrc=data;a.querySelector('img').src=data;
          })''',data_image)
        phone.add_style_tag(content=(ROOT/'static/style.css').read_text())
        phone.evaluate("() => {const U=window.URL;window.URL=class extends U{constructor(url,base){super(url,base==='null'?'https://nickckincaid.com':base)}};}")
        phone.add_script_tag(content=(ROOT/'static/site.js').read_text())
        phone.locator('[data-lightbox]').first.click()
        phone.locator('.lightbox-zoom').click()
        assert phone.locator('#lightbox').evaluate("d=>d.classList.contains('is-zoomed')")
        assert not phone.evaluate('document.documentElement.scrollWidth>innerWidth')
        browser.close()
print('V24 browser checks passed: desktop/mobile zoom, draft recovery, storage, export and sharing image')
