"""Offline Chromium regression checks for V28 admin controls; no live uploads."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'static/admin.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', html)
html=re.sub(r'<script src="[^"]+" defer></script>', '', html)
html=re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
mock=r'''() => {
 const base='/media/cdmx/'+'a'.repeat(24)+'/cdmx-';
 const image=n=>base+'0'+n+'.jpg';
 window.__photos=[image(1),image(2)];
 window.__uploads=0;
 window.fetch=async(path,opts={})=>{
   const name=String(path);
   if(name.endsWith('/api/admin/projects')) return new Response(JSON.stringify({projects:[
     {slug:'cdmx',revision:'a'.repeat(40),title:'CDMX',order:1,published:true,
       cover:image(1),gallery:[image(2)],
       photo_details:[{image:image(1),focal_length:'35 mm',aperture:'f/8',shutter_speed:'1/250 s',iso:'400',
         variants:[{url:image(1).replace('.jpg','-640.webp'),width:640}]},
         {image:image(2),focal_length:'50 mm',aperture:'',shutter_speed:'1/125 s',iso:'100'}]
     },{slug:'test',revision:'b'.repeat(40),title:'Test',order:2,published:false,cover:'',gallery:[],photo_details:[]}
   ]}),{status:200});
   if(opts.method==='HEAD') return new Response(null,{status:name.endsWith('cdmx-02.jpg')?404:200});
   throw Error('Unmocked request '+name);
 };
 window.PhotoPrep={prepare:async(file)=>({blob:new Blob(['jpeg mock'],{type:'image/jpeg'}),meta:{focal_length:'24 mm',aperture:'f/4',shutter_speed:'1/60 s',iso:'200'}}),
   preview:async(blob)=>blob,variants:async()=>[]};
 class MockXHR {
   constructor(){this.upload={};this.status=0;this.responseText='';this.headers={};}
   open(){}
   setRequestHeader(k,v){this.headers[k]=v;}
   send(){
     const n=++window.__uploads;
     queueMicrotask(()=>{
       if(this.upload.onprogress)this.upload.onprogress({lengthComputable:true,loaded:50,total:100});
       this.status=n===1?503:200;
       this.responseText=n===1?JSON.stringify({error:'Temporary upload failure'}):JSON.stringify({path:'/media/cdmx/'+('c'.repeat(24))+'/cdmx-0'+n+'.jpg'});
       this.onload();
     });
   }
 }
 window.XMLHttpRequest=MockXHR;
}'''

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width in (390,1280):
        page=browser.new_page(viewport={'width':width,'height':850})
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.on('dialog',lambda d:d.accept())
        page.set_content(html)
        page.add_style_tag(content=(ROOT/'static/admin.css').read_text())
        page.evaluate(mock)
        page.add_script_tag(content=(ROOT/'static/admin-tools.js').read_text())
        page.add_script_tag(content=(ROOT/'static/admin-exposure.js').read_text())
        page.add_script_tag(content=(ROOT/'static/admin.js').read_text())
        page.locator('.photo-row').first.wait_for()
        assert '1 missing settings' in page.locator('#metadata-overview').inner_text()
        assert page.locator('#review-missing').is_visible()
        assert '1/2 missing settings' in page.locator('.project-entry .project-btn small').first.inner_text()
        page.locator('#review-missing').click()
        assert page.evaluate('document.activeElement.dataset.metaField') == 'aperture'
        # V34+ keeps batch controls inside a collapsed section.
        page.locator('details[data-panel="batch-edit"] > summary').click()
        page.locator('#bulk-select-all').click()
        assert '2 selected' in page.locator('#bulk-count').inner_text()
        page.locator('#bulk-field').select_option('aperture')
        page.locator('#bulk-value').fill('f/11')
        page.locator('#bulk-apply').click()
        assert page.locator('input[data-meta-field="aperture"]').evaluate_all('els=>els.every(e=>e.value==="f/11")')
        page.locator('.photo-select input').first.uncheck()
        page.locator('#bulk-first').click()
        assert 'cdmx-01.jpg' in page.locator('.photo-row').first.locator('.photo-name').inner_text()
        assert page.locator('.photo-row').first.locator('img').get_attribute('src').endswith('cdmx-02.jpg')
        # The link checker is also independently collapsible.
        page.locator('details[data-panel="integrity"] > summary').click()
        page.locator('#check-images').click()
        page.wait_for_function("document.querySelector('#image-check-status').textContent.includes('failed')")
        assert '1 failed' in page.locator('#image-check-status').inner_text()
        assert 'HTTP 404' in page.locator('#image-check-results').inner_text()
        # File upload queue lives in the Upload & cover crop section.
        page.locator('details[data-panel="uploads"] > summary').click()
        page.locator('#photo-files').set_input_files([
            {'name':'failure.jpg','mimeType':'image/jpeg','buffer':b'JPEG1'},
            {'name':'success.jpg','mimeType':'image/jpeg','buffer':b'JPEG2'}
        ])
        page.wait_for_function("document.querySelector('#upload-queue').textContent.includes('failed') && !document.querySelector('#photo-files').disabled")
        assert page.locator('.upload-job').count()==2
        assert page.locator('.upload-job button:visible').count()==2
        page.locator('.upload-job button:visible').first.click()
        page.wait_for_function("document.querySelectorAll('.upload-done').length === 2")
        assert page.evaluate('window.__uploads')==3
        assert page.locator('.photo-row').count()==4
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        assert not errors, errors
        page.close()
        print(f'V28 editor interaction passed at {width}px')
    browser.close()
