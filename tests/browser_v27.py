"""Offline browser verification for mandatory exposure metadata in the V27 editor."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'static/admin.html').read_text()
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', html)
html = re.sub(r'<script src="[^"]+" defer></script>', '', html)
html = re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
url = '/media/test/' + '7'*24 + '/test-01.jpg'

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width in (390, 1280):
        page = browser.new_page(viewport={'width': width, 'height': 860})
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(html)
        page.add_style_tag(content=(ROOT / 'static/admin.css').read_text())
        page.evaluate('''photo => {
          window.__saves = 0;
          window.fetch = async (request, opts={}) => {
            if(String(request).endsWith('/api/admin/projects') && !opts.method) return new Response(JSON.stringify({projects:[{
              slug:'test', revision:'a'.repeat(40), title:'Test', published:false, order:1, cover:photo, gallery:[],
              photo_details:[{image:photo, focal_length:'35 mm', aperture:'', shutter_speed:'1/250 s',iso:''}]
            }]}),{status:200});
            if(String(request).endsWith('/api/admin/save')) { window.__saves++; return new Response(JSON.stringify({ok:true,slug:'test'}),{status:200}); }
            throw new Error('Unexpected fetch '+String(request));
          };
        }''', url)
        page.add_script_tag(content=(ROOT / 'static/admin.js').read_text())
        page.locator('.photo-row').wait_for(state='visible')
        assert 'missing Aperture, ISO' in page.locator('.photo-row summary').inner_text()
        assert page.locator('.photo-row details').evaluate('(e)=>!e.open')
        page.locator('#publish').click()
        assert page.locator('.photo-row details').evaluate('(e)=>e.open')
        assert page.evaluate('document.activeElement.dataset.metaField') == 'aperture'
        assert 'Photo 1' in page.locator('#status').inner_text()
        assert page.evaluate('window.__saves') == 0
        page.locator('input[data-meta-field="aperture"]').fill('f/8')
        assert 'missing ISO' in page.locator('.photo-row summary').inner_text()
        page.locator('#publish').click()
        assert page.evaluate('document.activeElement.dataset.metaField') == 'iso'
        assert page.evaluate('window.__saves') == 0
        page.locator('input[data-meta-field="iso"]').fill('400')
        assert 'Exposure settings complete' in page.locator('.photo-row summary').inner_text()
        page.locator('#publish').click()
        page.wait_for_function('window.__saves === 1')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors,errors
        page.close()
        print('V27 metadata editor passed at', width)
    browser.close()
