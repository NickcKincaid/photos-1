"""V31 public contact sheet and private description integration tests."""
import importlib.util
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

SOURCE=Path(__file__).resolve().parents[1]

class ContactSheetTests(unittest.TestCase):
    def setUp(self):
        self.sandbox=tempfile.TemporaryDirectory();self.addCleanup(self.sandbox.cleanup)
        self.root=Path(self.sandbox.name)
        (self.root/'content/projects').mkdir(parents=True)
        (self.root/'content/notes').mkdir(parents=True)
        shutil.copytree(SOURCE/'static',self.root/'static')
        (self.root/'content/site.json').write_text(json.dumps({'name':'Nicholas Kincaid'}))
        (self.root/'media/test').mkdir(parents=True)
        for i in (1,2):
            (self.root/f'media/test/{i}.jpg').write_bytes(b'\xff\xd8\xff\xd9')
        self.project={'title':'Sample','published':True,'cover':'/media/test/1.jpg','gallery':['/media/test/2.jpg'],
          'photo_details':[{'image':'/media/test/1.jpg','alt':'A geometric concrete facade in afternoon light.'},
                           {'image':'/media/test/2.jpg','alt':'A rectangular window with vertical dark lines.'}]}
        (self.root/'content/projects/sample.json').write_text(json.dumps(self.project))
        spec=importlib.util.spec_from_file_location('site_build_v31',SOURCE/'build.py')
        self.site=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.site)
        self.site.ROOT=self.root;self.site.CONTENT=self.root/'content';self.site.OUT=self.root/'dist'
        self.site._OPTIMIZED=None

    def test_contact_sheet_toggles_only_multiple_photo_galleries(self):
        self.site.run()
        html=(self.root/'dist/projects/sample/index.html').read_text()
        self.assertIn('class="contact-sheet-toggle"',html)
        self.assertIn('class="project-photos',html)
        self.assertEqual(html.count('data-lightbox'),2)
        self.assertIn('alt="A geometric concrete facade in afternoon light."',html)
        self.assertIn('content="Sample — photography by Nicholas Kincaid. A geometric concrete facade in afternoon light."',html)
        self.assertNotIn('>A geometric concrete facade in afternoon light.<',html)
        self.assertTrue((self.root/'dist/admin/admin-describe.js').is_file())
        self.assertTrue((self.root/'dist/admin/admin-deployment.js').is_file())
        self.assertIn('is-contact-sheet', (self.root/'dist/site.js').read_text())

    def test_contact_sheet_is_absent_for_one_photo(self):
        self.project['gallery']=[]
        (self.root/'content/projects/sample.json').write_text(json.dumps(self.project))
        self.site.run()
        html=(self.root/'dist/projects/sample/index.html').read_text()
        self.assertNotIn('contact-sheet-toggle',html)

if __name__=='__main__':unittest.main()
