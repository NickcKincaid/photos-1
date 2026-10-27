"""Public SEO regression tests for the combined V28 + SEO release."""
import importlib.util
import json
import re
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


class SearchMetadataTests(unittest.TestCase):
    def setUp(self):
        self.sandbox = tempfile.TemporaryDirectory()
        self.addCleanup(self.sandbox.cleanup)
        self.root = Path(self.sandbox.name)
        (self.root / 'content' / 'projects').mkdir(parents=True)
        (self.root / 'content' / 'notes').mkdir(parents=True)
        (self.root / 'media' / 'example').mkdir(parents=True)
        shutil.copytree(SOURCE / 'static', self.root / 'static')
        (self.root / 'content' / 'site.json').write_text(json.dumps({
            'name': 'Nicholas Kincaid', 'intro': 'Photography by Nicholas Kincaid'
        }))
        spec = importlib.util.spec_from_file_location('seo_build', SOURCE / 'build.py')
        self.site = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.site)
        self.site.ROOT = self.root
        self.site.CONTENT = self.root / 'content'
        self.site.OUT = self.root / 'dist'
        self.site._OPTIMIZED = None

    def add_project(self, title='CDMX', published=True):
        (self.root / 'media' / 'example' / 'photo.jpg').write_bytes(b'\xff\xd8\xff\xd9')
        (self.root / 'content' / 'projects' / 'cdmx.json').write_text(json.dumps({
            'title': title, 'published': published,
            'cover': '/media/example/photo.jpg', 'gallery': [],
            'blurb': 'An intimate study of light and everyday spaces.\n\nMexico City.',
            'photo_details': [{'image': '/media/example/photo.jpg'}]
        }))

    def test_homepage_has_clear_search_description_without_visible_intro(self):
        self.site.run()
        home = (self.root / 'dist' / 'index.html').read_text()
        self.assertIn('<title>Nicholas Kincaid — Photography</title>', home)
        self.assertIn('meta name="description" content="Photography by Nicholas Kincaid. Explore selected photographic projects', home)
        self.assertNotIn('class="home-intro"', home)
        self.assertIn('<h1 class="visually-hidden">Photography by Nicholas Kincaid</h1>', home)
        self.assertIn('max-image-preview:large', home)
        self.assertIn('data-nosnippet><a href="/inquire/">Contact</a>', home)
        self.assertIn('rel="canonical" href="https://nickckincaid.com/"', home)
        self.assertNotIn('class="brand-mark"', home)
        self.assertTrue((self.root / 'dist' / 'admin' / 'admin-tools.js').exists())  # V28 preserved.

    def test_home_structured_data_connects_photographer_and_website(self):
        self.add_project()
        self.site.run()
        home = (self.root / 'dist' / 'index.html').read_text()
        graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', home, re.S).group(1))['@graph']
        self.assertEqual({item['@type'] for item in graph}, {'Person', 'WebSite', 'CollectionPage'})
        self.assertEqual(next(item for item in graph if item['@type'] == 'Person')['name'], 'Nicholas Kincaid')
        self.assertEqual(next(item for item in graph if item['@type'] == 'CollectionPage')['hasPart'][0]['url'],
                         'https://nickckincaid.com/projects/cdmx/')

    def test_project_image_sitemap_and_drafts_not_exposed(self):
        self.add_project()
        (self.root / 'content' / 'projects' / 'unpublished.json').write_text(json.dumps({
            'title': 'Unpublished', 'published': False, 'cover': '/media/example/photo.jpg'
        }))
        self.site.run()
        doc = ET.fromstring((self.root / 'dist' / 'sitemap.xml').read_text())
        xml = (self.root / 'dist' / 'sitemap.xml').read_text()
        namespaces = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9',
                      'image': 'http://www.google.com/schemas/sitemap-image/1.1'}
        pages = doc.findall('s:url', namespaces)
        project = next(p for p in pages if p.findtext('s:loc', namespaces=namespaces).endswith('/cdmx/'))
        self.assertEqual(project.findtext('image:image/image:loc', namespaces=namespaces),
                         'https://nickckincaid.com/media/example/photo.jpg')
        self.assertNotIn('unpublished', xml)
        project_html = (self.root / 'dist' / 'projects' / 'cdmx' / 'index.html').read_text()
        self.assertIn('name="description" content="An intimate study of light and everyday spaces. Mexico City."',
                      project_html)
        structured = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', project_html, re.S).group(1))
        self.assertEqual(structured['@type'], 'ImageGallery')
        photo = structured['image'][0]
        self.assertEqual(photo['creator']['@type'], 'Person')
        self.assertEqual(photo['creator']['name'], 'Nicholas Kincaid')
        self.assertEqual(photo['creditText'], 'Nicholas Kincaid')
        self.assertIn('Nicholas Kincaid', photo['copyrightNotice'])
        self.assertEqual(photo['acquireLicensePage'], 'https://nickckincaid.com/inquire/')
        self.assertNotIn('license', photo)  # Never make up a reuse license.

    def test_optional_license_only_appears_when_explicitly_configured(self):
        self.add_project()
        settings = self.root / 'content' / 'site.json'
        contents = json.loads(settings.read_text())
        contents['image_license_url'] = 'https://nickckincaid.com/licensing/'
        settings.write_text(json.dumps(contents))
        self.site.run()
        html = (self.root / 'dist' / 'projects' / 'cdmx' / 'index.html').read_text()
        schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S).group(1))
        self.assertEqual(schema['image'][0]['license'], contents['image_license_url'])

    def test_sitemap_urls_all_point_to_generated_pages(self):
        self.add_project()
        self.site.run()
        root = ET.fromstring((self.root / 'dist' / 'sitemap.xml').read_text())
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        for loc in root.findall('s:url/s:loc', ns):
            url = loc.text
            self.assertTrue(url.startswith(self.site.SITE_URL + '/'))
            route = url[len(self.site.SITE_URL):]
            expected = self.root / 'dist' / route.lstrip('/') / 'index.html'
            self.assertTrue(expected.is_file(), f'Broken sitemap URL: {url}')

    def test_note_markup_is_clean_and_dates_are_real(self):
        (self.root / 'content' / 'notes' / 'travel.json').write_text(json.dumps({
            'title': 'Travel reflections', 'published': True,
            'body': '## Looking around\n\nA [photograph](https://example.com) and **a walk**.',
            'published_at': '2026-10-01T13:00:00Z',
            'updated_at': '2026-10-17T15:24:00Z'
        }))
        self.site.run()
        note = (self.root / 'dist' / 'notes' / 'travel' / 'index.html').read_text()
        self.assertIn('content="Looking around A photograph and a walk."', note)
        metadata = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', note, re.S).group(1))
        self.assertEqual(metadata['datePublished'], '2026-10-01T13:00:00+00:00')
        self.assertEqual(metadata['dateModified'], '2026-10-17T15:24:00+00:00')
        sitemap = (self.root / 'dist' / 'sitemap.xml').read_text()
        self.assertIn('<lastmod>2026-10-17</lastmod>', sitemap)

    def test_custom_description_is_escaped_and_limited(self):
        self.assertEqual(self.site.seo_summary('## Some **rich** [words](https://example.com)'), 'Some rich words')
        self.assertLessEqual(len(self.site.seo_summary('long ' * 200)), 158)
        self.assertEqual(self.site.seo_summary('text <script>bad</script> visible'), 'text bad visible')
        (self.root / 'content' / 'site.json').write_text(json.dumps({
            'name': 'Nicholas Kincaid', 'seo_description': 'A <look> at photography & images.'
        }))
        self.site.run()
        home = (self.root / 'dist' / 'index.html').read_text()
        self.assertIn('content="A at photography &amp; images."', home)


if __name__ == '__main__':
    unittest.main()
