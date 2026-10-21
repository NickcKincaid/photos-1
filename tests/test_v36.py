"""V36 markup and backup validation; no network calls or content changes."""
import json
import re
import tempfile
import unittest
from pathlib import Path
from build import image_attributes, image_dimensions, project_page
from scripts.verify_metadata_backup import verify

class V36Tests(unittest.TestCase):
    def setUp(self):
        self.image = '/media/test/0123456789abcdef01234567/test-01.jpg'
        self.project = {
            'title': 'CDMX', 'url': '/projects/cdmx/', 'slug': 'cdmx',
            'cover': self.image, 'gallery': [], 'blurb': '', 'photo_details': [
                {'image': self.image, 'storage': 'r2', 'width': 3000, 'height': 2000,
                 'alt': 'Two pedestrians outside storefronts'}]}

    def test_validated_dimensions_emitted_for_r2_image(self):
        self.assertEqual(image_dimensions(self.image,self.project),(3000,2000))
        tag = image_attributes(self.image, '50vw', project=self.project)
        self.assertIn('width="3000" height="2000"',tag)
        self.assertIn('loading="lazy"',tag)

    def test_untrusted_dimensions_ignored(self):
        for w,h in [(True,400),(0,400),(3000,'2000'),(-1,1),(40001,1)]:
            self.project['photo_details'][0].update(width=w,height=h)
            self.assertIsNone(image_dimensions(self.image,self.project))
            self.assertNotIn('width=',image_attributes(self.image,'50vw',project=self.project))

    def test_accessible_viewer_link_uses_alt_and_css_ratio(self):
        page = project_page({'name':'Nicholas Kincaid'},self.project,0,[self.project])
        self.assertIn('style="--photo-ratio:3000/2000"',page)
        self.assertIn('aria-label="Open Two pedestrians outside storefronts in viewer"',page)
        self.assertIn('width="3000" height="2000"',page)
        self.assertNotIn('alt="A man and a woman',page)
        structured = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>',page,re.S).group(1))
        self.assertEqual(structured['image'][0]['contentUrl'], 'https://nickckincaid.com'+self.image)
        self.assertEqual(structured['image'][0]['description'], 'Two pedestrians outside storefronts')

    def test_backup_verifier_is_read_only_and_rejects_unsafe_entries(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'metadata.json'
            backup = {'format':'nickckincaid-metadata-v1','site':{'name':'Nicholas Kincaid'},
                      'projects':{'cdmx.json':{'title':'CDMX'}},'notes':{}}
            path.write_text(json.dumps(backup),encoding='utf-8')
            self.assertEqual(verify(path),(1,0))
            backup['projects']={'../private.json':{'title':'Private'}}
            path.write_text(json.dumps(backup),encoding='utf-8')
            with self.assertRaises(ValueError):verify(path)

if __name__ == '__main__':unittest.main()
