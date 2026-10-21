"""V35b: distinguish last site build from the R2 check, and keep skeletons light."""
from pathlib import Path
from datetime import datetime
import re
import unittest
ROOT=Path(__file__).resolve().parents[1]

class V35bTests(unittest.TestCase):
    def test_source_has_build_time_placeholder(self):
        html=(ROOT/'static/admin.html').read_text(encoding='utf-8')
        self.assertIn('Website Last Updated:',html)
        self.assertIn('datetime="__SITE_BUILD_UTC__"',html)
        self.assertIn('__SITE_BUILD_LABEL__',html)
        self.assertIn('Last Checked:',html)
    def test_site_build_generates_real_timestamp(self):
        file=ROOT/'dist/admin/index.html'
        if not file.exists(): self.skipTest('Run python3 build.py first')
        html=file.read_text(encoding='utf-8')
        self.assertNotIn('__SITE_BUILD_UTC__',html)
        self.assertNotIn('__SITE_BUILD_LABEL__',html)
        match=re.search(r'id="website-last-updated" datetime="([^"]+)"',html)
        self.assertIsNotNone(match)
        self.assertIsNotNone(datetime.fromisoformat(match.group(1)).tzinfo)
    def test_skeletons_keep_native_lazy_loading(self):
        from build import image_attributes
        self.assertIn('loading="lazy"',image_attributes('/media/example.jpg','50vw'))
        js=(ROOT/'static/site.js').read_text(encoding='utf-8')
        self.assertIn("document.querySelectorAll('.project-card-media, .gallery-link')",js)
        self.assertIn("img.addEventListener('error',finish",js)
        self.assertIn("img.addEventListener('load',finish",js)
        self.assertNotIn('setInterval',js[:700])
        css=(ROOT/'static/style.css').read_text(encoding='utf-8')
        self.assertIn('.gallery-link.photo-loading',css)
        self.assertIn('.project-photos.is-contact-sheet .gallery-link.photo-loading',css)
        self.assertNotIn('animation:',css[css.index('/* V35b: low-overhead loading skeletons'):])
    def test_no_deployment_polling_reintroduced(self):
        js=(ROOT/'static/admin-storage.js').read_text(encoding='utf-8')
        self.assertIn("$('website-last-updated')",js)
        self.assertNotIn('/api/admin/deployment',js)

if __name__=='__main__':unittest.main()
