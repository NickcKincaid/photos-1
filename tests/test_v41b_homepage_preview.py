"""Regression tests for the dedicated homepage link-preview image and description."""
import html
import importlib.util
import re
import shutil
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


class HomepageSocialPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('homepage_v41b_build', SOURCE / 'build.py')
        cls.build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.build)

    def test_preview_image_is_shipped(self):
        image = SOURCE / 'static/homepage-share.jpg'
        self.assertTrue(image.is_file())
        self.assertTrue(image.read_bytes().startswith(b'\xff\xd8'))

    def test_homepage_uses_custom_social_card_but_keeps_search_description(self):
        site = {'name': 'Nicholas Kincaid', 'intro': 'Photography by Nicholas Kincaid'}
        result = self.build.homepage(site, [])
        self.assertIn('property="og:image" content="https://nickckincaid.com/homepage-share.jpg"', result)
        self.assertIn('name="twitter:image" content="https://nickckincaid.com/homepage-share.jpg"', result)
        self.assertIn('property="og:image:width" content="1200"', result)
        self.assertIn('property="og:image:height" content="630"', result)
        self.assertIn('property="og:title" content="Nick Kincaid"', result)
        self.assertIn('name="twitter:title" content="Nick Kincaid"', result)
        self.assertNotIn('property="og:description"', result)
        self.assertNotIn('name="twitter:description"', result)
        self.assertNotIn('property="og:site_name"', result)
        self.assertIn('meta name="description" content="Photography by Nicholas Kincaid.', result)
        self.assertNotIn('class="home-intro"', result)
        self.assertEqual(self.build.HOMEPAGE_SOCIAL_TITLE, 'Nick Kincaid')

    def test_other_pages_keep_existing_photo_and_description(self):
        html_page = self.build.document('CDMX', 'Mexico City photography',
                                        {'name': 'Nicholas Kincaid'}, '<main></main>',
                                        cover='/media/example.jpg', path='/projects/cdmx/')
        self.assertIn('property="og:image" content="https://nickckincaid.com/media/example.jpg"', html_page)
        self.assertIn('property="og:description" content="Mexico City photography"', html_page)
        self.assertNotIn('homepage-share.jpg', html_page)

    def test_production_build_copies_preview_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(SOURCE / 'static', root / 'static')
            (root / 'content/projects').mkdir(parents=True)
            (root / 'content/notes').mkdir(parents=True)
            (root / 'content/site.json').write_text('{"name": "Nicholas Kincaid"}', encoding='utf-8')
            # Avoid mutating the imported build module outside of this test.
            orig = (self.build.ROOT, self.build.CONTENT, self.build.OUT)
            try:
                self.build.ROOT = root
                self.build.CONTENT = root / 'content'
                self.build.OUT = root / 'dist'
                self.build.run()
                self.assertEqual((root / 'dist/homepage-share.jpg').read_bytes(),
                                 (root / 'static/homepage-share.jpg').read_bytes())
            finally:
                self.build.ROOT, self.build.CONTENT, self.build.OUT = orig


if __name__ == '__main__':
    unittest.main()
