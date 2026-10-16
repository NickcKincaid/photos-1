"""Build tests with temporary fixture copies, never touching live photos."""
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


class PortfolioBuildTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        (self.root / 'content' / 'projects').mkdir(parents=True)
        (self.root / 'media' / 'test').mkdir(parents=True)
        shutil.copytree(SOURCE / 'static', self.root / 'static')
        (self.root / 'content' / 'site.json').write_text(json.dumps({'name': 'Nicholas Kincaid'}))
        spec = importlib.util.spec_from_file_location('test_portfolio_build', SOURCE / 'build.py')
        self.site = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.site)
        self.site.ROOT = self.root
        self.site.CONTENT = self.root / 'content'
        self.site.OUT = self.root / 'dist'
        self.site._OPTIMIZED = None

    def test_empty_install_builds_and_contains_no_public_admin_data(self):
        self.site.run()
        html = (self.root / 'dist' / 'index.html').read_text()
        self.assertIn('Nicholas Kincaid', html)
        self.assertIn('No projects yet', html)
        self.assertIn('Disallow: /admin/', (self.root / 'dist' / 'robots.txt').read_text())
        self.assertTrue((self.root / 'dist' / 'admin' / 'index.html').is_file())
        self.assertFalse((self.root / 'dist' / 'content').exists())

    def test_project_pages_and_unlisted_draft(self):
        (self.root / 'media' / 'test' / 'pic.jpg').write_bytes(b'\xff\xd8\xff\xd9')
        projects = self.root / 'content' / 'projects'
        (projects / 'tokyo.json').write_text(json.dumps({
            'title': '<Tokyo & Beyond>', 'published': True, 'order': 0,
            'cover': '/media/test/pic.jpg', 'gallery': [],
            'photo_details': [{'image': '/media/test/pic.jpg',
                               'id': 'a' * 24, 'iso': '400', 'alt': 'Street <scene>'}],
        }))
        (projects / 'private.json').write_text(json.dumps({
            'title': 'Unpublished', 'published': False, 'cover': '/media/test/pic.jpg',
        }))
        self.site.run()
        index = (self.root / 'dist' / 'index.html').read_text()
        project = (self.root / 'dist' / 'projects' / 'tokyo' / 'index.html').read_text()
        sitemap = (self.root / 'dist' / 'sitemap.xml').read_text()
        self.assertIn('&lt;Tokyo &amp; Beyond&gt;', index)
        self.assertNotIn('Unpublished', index)
        self.assertIn('data-photo-id="' + 'a'*24 + '"', project)
        self.assertIn('ISO 400', project)
        self.assertIn('Street &lt;scene&gt;', project)
        self.assertIn('/projects/tokyo/', sitemap)
        self.assertNotIn('/projects/private/', sitemap)
        self.assertFalse((self.root / 'dist' / 'projects' / 'private').exists())

    def test_optional_project_blurb_is_escaped_and_only_rendered_when_set(self):
        (self.root / 'media' / 'test' / 'pic.jpg').write_bytes(b'\xff\xd8\xff\xd9')
        file = self.root / 'content' / 'projects' / 'test.json'
        data = {'title': 'Test', 'published': True, 'cover': '/media/test/pic.jpg',
                'gallery': [], 'photo_details': [], 'description': 'Legacy hidden description'}
        file.write_text(json.dumps(data))
        self.site.run()
        project = (self.root / 'dist' / 'projects' / 'test' / 'index.html').read_text()
        self.assertNotIn('class="project-blurb"', project)
        self.assertNotIn('Legacy hidden description</p>', project)
        data['blurb'] = 'Made by hand.\n\nA <careful> study of material.\nSecond line.'
        file.write_text(json.dumps(data))
        self.site.run()
        project = (self.root / 'dist' / 'projects' / 'test' / 'index.html').read_text()
        self.assertIn('class="project-blurb"', project)
        self.assertIn('Made by hand.', project)
        self.assertIn('A &lt;careful&gt; study', project)
        self.assertNotIn('A <careful> study', project)
        self.assertLess(project.index('class="project-blurb"'), project.index('project-bottom-inquiry'))

    def test_notes_are_published_in_order_with_safe_html_and_timestamps(self):
        notes = self.root / 'content' / 'notes'
        notes.mkdir(parents=True)
        (notes / 'latest.json').write_text(json.dumps({
            'title': '<Note One>', 'body': 'First <script>alert(1)</script>\n\nNext paragraph',
            'published': True, 'published_at': '2026-10-15T20:35:00Z'}))
        (notes / 'older.json').write_text(json.dumps({
            'title': 'Older note', 'body': 'Hello', 'published': True,
            'published_at': '2026-10-14T10:00:00Z'}))
        (notes / 'draft.json').write_text(json.dumps({
            'title': 'Secret draft', 'body': 'Should not appear',
            'published': False, 'published_at': None}))
        self.site.run()
        listing = (self.root / 'dist' / 'notes' / 'index.html').read_text()
        detail = (self.root / 'dist' / 'notes' / 'latest' / 'index.html').read_text()
        sitemap = (self.root / 'dist' / 'sitemap.xml').read_text()
        self.assertLess(listing.index('&lt;Note One&gt;'), listing.index('Older note'))
        self.assertIn('15 Oct 2026', listing)
        self.assertIn('20:35 UTC', listing)
        self.assertIn('&lt;script&gt;', detail)
        self.assertNotIn('<script>alert(1)</script>', detail)
        self.assertNotIn('Secret draft', listing)
        self.assertNotIn('/notes/draft/', sitemap)
        self.assertIn('/notes/latest/', sitemap)
        self.assertTrue((self.root / 'dist' / 'inquire' / 'index.html').exists())
        self.assertIn('Nicholas Kincaid', detail)
        self.assertIn('Notes', listing)

    def test_photo_links_open_viewer_not_raw_media(self):
        (self.root / 'media' / 'test' / 'pic.jpg').write_bytes(b'\xff\xd8\xff\xd9')
        (self.root / 'content' / 'projects' / 'test.json').write_text(json.dumps({
            'title': 'Test', 'published': True, 'cover': '/media/test/pic.jpg',
            'gallery': [], 'photo_details': [{'image': '/media/test/pic.jpg', 'id': 'c'*24}]}))
        self.site.run()
        page = (self.root / 'dist' / 'projects' / 'test' / 'index.html').read_text()
        self.assertIn('href="#photo=' + 'c'*24 + '"', page)
        self.assertIn('data-full-src="/media/test/pic.jpg', page)
        self.assertIn('project-bottom-inquiry', page)
        self.assertIn('mailto:nicholas.kincaid2@gmail.com', page)
        self.assertIn('Projects', page)

    def test_rejects_remote_or_traversal_photo_references(self):
        for unsafe in ('https://example.com/photo.jpg','/media/../secrets.jpg',
                       'javascript:alert(1)','/media/a\\b.jpg'):
            self.assertEqual(self.site.image_url(unsafe), '')


if __name__ == '__main__':
    unittest.main()
