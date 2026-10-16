"""Regression check: every admin script referenced by the HTML must be deployed."""
import re
import unittest
from pathlib import Path


class AdminAssetRegressionTests(unittest.TestCase):
    def test_declared_admin_scripts_are_in_site_generator_copy_rules(self):
        root = Path(__file__).resolve().parents[1]
        html = (root / 'static' / 'admin.html').read_text(encoding='utf-8')
        script_names = [s.rsplit('/', 1)[-1] for s in re.findall(
            r'<script\b[^>]*\bsrc=["\'](/admin/[A-Za-z0-9._-]+\.js)["\']', html)]
        self.assertIn('admin-storage.js', script_names)
        self.assertIn('admin-drafts.js', script_names)
        source = (root / 'build.py').read_text(encoding='utf-8')
        self.assertIn("glob('admin-*.js')", source)
        self.assertIn("'admin.js'", source)
        for script in script_names:
            self.assertTrue((root / 'static' / script).is_file(), script)
