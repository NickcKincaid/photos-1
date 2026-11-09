"""New homepage social card stays uncluttered and preserves separate search SEO."""
import hashlib
import re
import unittest
from pathlib import Path
import build

ROOT=Path(__file__).resolve().parents[1]

class V42SocialTests(unittest.TestCase):
    def test_editorial_social_card_and_version(self):
        self.assertEqual(build.SITE_VERSION,'V42')
        path=ROOT/'static/homepage-share.jpg'
        asset=path.read_bytes()
        self.assertTrue(asset.startswith(b'\xff\xd8\xff'))
        html=build.homepage({'name':'Nicholas Kincaid','intro':'Photography by Nicholas Kincaid'},[])
        fingerprint=hashlib.sha256(asset).hexdigest()[:12]
        url=f'https://nickckincaid.com/homepage-share.jpg?v={fingerprint}'
        self.assertIn(f'property="og:image" content="{url}"',html)
        self.assertIn(f'name="twitter:image" content="{url}"',html)
        self.assertIn('<title>Nick Kincaid</title>',html)
        self.assertIn('property="og:title" content="Nick Kincaid"',html)
        self.assertIn('twitter:image:alt',html)
        self.assertNotIn('property="og:description"',html)
        self.assertIn('name="description" content="Photography by Nicholas Kincaid.',html)
        self.assertNotIn('class="home-intro"',html)
        self.assertRegex(html,r'property="og:image:width" content="1200"')
    def test_project_card_still_uses_own_metadata(self):
        html=build.document('Tokyo','Tokyo images',{'name':'Nicholas Kincaid'},'<main/>',
                            cover='/media/tokyo/cover.jpg',path='/projects/tokyo/')
        self.assertIn('og:title" content="Tokyo — Nicholas Kincaid"',html)
        self.assertIn('og:description" content="Tokyo images"',html)
        self.assertNotIn('homepage-share.jpg',html)

if __name__=='__main__':unittest.main()
