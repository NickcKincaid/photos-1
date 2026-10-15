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

    def test_rejects_remote_or_traversal_photo_references(self):
        for unsafe in ('https://example.com/photo.jpg','/media/../secrets.jpg',
                       'javascript:alert(1)','/media/a\\b.jpg'):
            self.assertEqual(self.site.image_url(unsafe), '')


if __name__ == '__main__':
    unittest.main()
