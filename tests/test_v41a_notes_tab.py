"""Navigation visibility is presentation only; published Note URLs remain valid."""
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]

class NotesNavigationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root/'content'/'projects').mkdir(parents=True)
        (root/'content'/'notes').mkdir(parents=True)
        shutil.copytree(SOURCE/'static',root/'static')
        (root/'content'/'notes'/'note-abc12345.json').write_text(json.dumps({
            'title':'Published note','body':'Something to read','published':True,
            'created_at':'2026-10-01T08:00:00Z','published_at':'2026-10-02T08:00:00Z',
            'date_mode':'published'
        }),encoding='utf8')
        spec=importlib.util.spec_from_file_location('v41a_build',SOURCE/'build.py')
        self.build=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.build)
        self.build.ROOT=root
        self.build.CONTENT=root/'content'
        self.build.OUT=root/'dist'
        self.build._OPTIMIZED=None
        self.root=root

    def build_site(self,value=None):
        site={'name':'Nicholas Kincaid','intro':'Photography'}
        if value is not None:site['show_notes_tab']=value
        (self.root/'content'/'site.json').write_text(json.dumps(site))
        self.build.run()
        return (self.root/'dist'/'index.html').read_text(),(self.root/'dist'/'sitemap.xml').read_text()

    def test_default_shows_notes_link(self):
        html,_=self.build_site()
        self.assertIn('href="/notes/"',html)

    def test_hidden_link_does_not_unpublish_or_deindex_notes(self):
        html,sitemap=self.build_site(False)
        self.assertNotIn('href="/notes/"',html)
        self.assertIn('href="/inquire/"',html)
        note=(self.root/'dist'/'notes'/'note-abc12345'/'index.html')
        self.assertTrue(note.is_file())
        self.assertIn('/notes/note-abc12345/',sitemap)
        self.assertIn('/notes/',sitemap)
        self.assertNotIn('href="/notes/"',note.read_text())

    def test_restore_setting_shows_link(self):
        html,_=self.build_site(False)
        self.assertNotIn('href="/notes/"',html)
        html,_=self.build_site(True)
        self.assertIn('href="/notes/"',html)

    def test_rejects_incorrect_setting_type(self):
        with self.assertRaisesRegex(ValueError,'show_notes_tab'):
            self.build_site('false')

    def test_admin_has_private_visibility_controls(self):
        self.build_site(False)
        admin=(self.root/'dist'/'admin'/'index.html').read_text()
        self.assertIn('id="site-show-notes-tab"',admin)
        self.assertTrue((self.root/'dist'/'admin'/'admin-site-settings.js').is_file())
