"""Browser smoke tests for V23 admin dynamic filename labels; no live services contacted."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re

root=Path(__file__).resolve().parents[1]
html=(root/'static/admin.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',html)
html=re.sub(r'<script src="[^"]+" defer></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]+>','',html)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in (1280,390):
        page=browser.new_page(viewport={'width':width,'height':900})
        page.set_content(html)
        page.add_style_tag(content=(root/'static/admin.css').read_text())
        page.evaluate('''() => {
            const photo1='/media/handmade-watusi-horn-table/aaaaaaaaaaaaaaaaaaaaaaaa/handmade-watusi-horn-table-03.jpg';
            const photo2='/media/handmade-watusi-horn-table/bbbbbbbbbbbbbbbbbbbbbbbb/handmade-watusi-horn-table-01.jpg';
            window.fetch = async url => ({ok:true,json:async()=>({projects:[{
              slug:'handmade-watusi-horn-table',revision:'a'.repeat(40),title:'Handmade Watusi Horn Table',
              published:true,order:1,cover:photo1,gallery:[photo2],
              photo_details:[
                {image:photo1,storage:'r2',camera:'Nikon Z7',focal_length:'50',shutter_speed:'1/200',iso:'400'},
                {image:photo2,storage:'r2',lens:'Lens',aperture:'f/8',focal_length:'35 mm',shutter_speed:'1/60 s',iso:'800'}
              ]
            }]})});
        }''')
        page.add_script_tag(content=(root/'static/admin.js').read_text())
        page.wait_for_selector('.photo-name')
        assert page.locator('.photo-name').all_inner_texts()==[
            'Cover · handmade-watusi-horn-table-01.jpg','handmade-watusi-horn-table-02.jpg']
        assert page.locator('#standardize-photos').count()==0
        page.locator('.photo-row').first.locator('button').nth(1).click()
        assert page.locator('.photo-name').all_inner_texts()==[
            'Cover · handmade-watusi-horn-table-01.jpg','handmade-watusi-horn-table-02.jpg']
        # Ensure the first photo really is the one formerly numbered -01 in R2.
        assert 'bbbbbbbbbbbbbbbbbbbbbbbb' in page.evaluate('document.querySelectorAll(".photo-row img")[0].getAttribute("src")')
        page.locator('#project-title').fill('New Artwork Title')
        assert page.locator('.photo-name').all_inner_texts()==[
            'Cover · new-artwork-title-01.jpg','new-artwork-title-02.jpg']
        assert 'New Artwork Title' in page.locator('.project-btn').inner_text()
        assert 'Unsaved changes' in page.locator('.project-btn').inner_text()
        page.locator('#preview-project').click()
        first=page.locator('#draft-preview-photos figcaption').first.inner_text()
        assert '35 mm · f/8 · 1/60 s · ISO 800' in first, first
        assert 'Nikon' not in page.locator('#draft-preview-photos').inner_text()
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.close()
        print('V23 admin checks passed:',width)
    browser.close()
