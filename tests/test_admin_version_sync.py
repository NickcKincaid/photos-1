"""The admin release label must match the version used by the site builder."""
from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build


class AdminVersionSyncTests(unittest.TestCase):
    def test_admin_version_is_derived_from_build_setting(self):
        template = (build.ROOT / 'static' / 'admin.html').read_text(encoding='utf-8')
        self.assertEqual(template.count('__SITE_VERSION__'), 1)
        self.assertRegex(build.SITE_VERSION, r'^V\d+[a-z]?$')
        self.assertRegex(template, r'<span class="website-version">[^<]*__SITE_VERSION__</span>')

    def test_generated_admin_page_contains_actual_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(build, 'OUT', Path(temporary) / 'dist'):
                build.run()
                output = (build.OUT / 'admin' / 'index.html').read_text(encoding='utf-8')
        self.assertIn('Version ' + build.SITE_VERSION + '</span>', output)
        self.assertNotIn('__SITE_VERSION__', output)
        self.assertNotIn('__SITE_BUILD_UTC__', output)
        self.assertNotIn('__SITE_BUILD_LABEL__', output)


if __name__ == '__main__':
    unittest.main()
