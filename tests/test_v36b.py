"""V36b: presentation-only capitalization and local website build time."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class V36bTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/'static/admin.html').read_text(encoding='utf-8')
    def test_title_case_sections_and_project_description(self):
        s=self.html
        for title in ('Project Details','Identity &amp; Description','Visibility &amp; Homepage Order',
                      'Upload &amp; Cover Crop','Photographs &amp; Metadata','Batch Edit',
                      'Search &amp; Accessibility Descriptions','Sharing &amp; Search Preview',
                      'Check Image Links','Write &amp; Format Note','R2 Photo Storage',
                      'Visitor Statistics','Workers AI Usage','Metadata Backups',
                      'Project Name','Project Description'):
            self.assertIn(title,s,title)
        self.assertNotIn('Project blurb',s)
        self.assertIn('id="project-blurb"',s) # persisted JSON field unchanged
        self.assertIn('id="project-published"',s)
    def test_build_timestamp_keeps_utc_fallback_and_browser_localizer(self):
        s=self.html
        js=(ROOT/'static/admin-storage.js').read_text(encoding='utf-8')
        self.assertIn('Website Last Updated: <time id="website-last-updated" datetime="__SITE_BUILD_UTC__"',s)
        self.assertIn('id="website-timezone-note"',s)
        self.assertIn('UTC fallback',s)
        self.assertIn("built.getAttribute('datetime')",js)
        self.assertIn('new Intl.DateTimeFormat(undefined,',js)
        self.assertIn("timeZoneName:'short'",js)
        self.assertIn('your local time',js)
        self.assertNotIn('America/Los_Angeles',js)
        self.assertNotIn('/api/admin/deployment',js)

if __name__=='__main__': unittest.main()
