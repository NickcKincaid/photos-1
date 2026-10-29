"""V39 deployment smoke checks for all generated public pages (offline)."""
import html.parser
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import build

class PageParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.links=[]; self.images=[]; self.jsonld=[]; self.meta=[]; self._capturing=False; self._buffer=[]
    def handle_starttag(self,tag,attributes):
        attrs=dict(attributes)
        if tag=='a': self.links.append(attrs)
        if tag=='img': self.images.append(attrs)
        if tag=='meta': self.meta.append(attrs)
        if tag=='link': self.links.append(attrs)
        if tag=='script' and attrs.get('type')=='application/ld+json':
            self._capturing=True; self._buffer=[]
    def handle_data(self,data):
        if self._capturing: self._buffer.append(data)
    def handle_endtag(self,tag):
        if tag=='script' and self._capturing:
            self.jsonld.append(json.loads(''.join(self._buffer)))
            self._capturing=False

class PublishedOutputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.root=Path(cls.temp.name)/'dist'
        with patch.object(build,'OUT',cls.root):
            build.run()
    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_every_public_page_has_unique_canonical_and_valid_jsonld(self):
        seen=set()
        for file in self.root.rglob('*.html'):
            if '/admin/' in str(file) or '/prepare/' in str(file): continue
            parsed=PageParser();parsed.feed(file.read_text())
            canon=[x.get('href') for x in parsed.links if x.get('rel')=='canonical']
            self.assertEqual(len(canon),1,str(file))
            self.assertTrue(canon[0].startswith(build.SITE_URL+'/'))
            self.assertNotIn(canon[0],seen)
            seen.add(canon[0])
            for image in parsed.images:
                self.assertIn('alt',image,str(file))
            for data in parsed.jsonld: self.assertEqual(data.get('@context'),'https://schema.org')
        self.assertGreaterEqual(len(seen),10)

    def test_unpublished_notes_never_get_static_pages_or_sitemap_entries(self):
        sitemap=(self.root/'sitemap.xml').read_text()
        for file in (build.CONTENT/'notes').glob('*.json'):
            note=json.loads(file.read_text())
            if not note.get('published'):
                self.assertNotIn(file.stem,sitemap)
                self.assertFalse((self.root/'notes'/file.stem).exists())

    def test_public_inquiries_use_only_the_configured_address(self):
        inquire=(self.root/'inquire/index.html').read_text()
        self.assertIn('mailto:'+build.CONTACT_EMAIL,inquire)
        self.assertNotIn('nicholas.kincaid2@gmail.com',inquire)
        for file in (self.root/'projects').rglob('index.html'):
            self.assertNotIn('nicholas.kincaid2@gmail.com',file.read_text())

    def test_all_current_sitemap_routes_are_real_files(self):
        import xml.etree.ElementTree as ET
        from urllib.parse import urlsplit
        tree=ET.fromstring((self.root/'sitemap.xml').read_text())
        ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
        for url in tree.findall('s:url/s:loc',ns):
            path=urlsplit(url.text).path.lstrip('/')
            target=self.root/path
            self.assertTrue(target.is_file() or (target/'index.html').is_file(),url.text)

    def test_admin_security_headers_are_present(self):
        headers=(self.root/'_headers').read_text()
        self.assertIn('Content-Security-Policy:',headers)
        self.assertIn('X-Content-Type-Options: nosniff',headers)
        self.assertIn('X-Robots-Tag: noindex, nofollow',headers)

if __name__=='__main__':unittest.main()
