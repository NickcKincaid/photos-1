"""Regression checks for the no-new-backup V40 maintenance release."""
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class V40IntegrityTests(unittest.TestCase):
    def test_automated_dimensions_without_manual_admin_button(self):
        admin=(ROOT/'static/admin.js').read_text()
        html=(ROOT/'static/admin.html').read_text()
        self.assertIn("api('dimensions'",admin)
        self.assertIn('backfillDimensions(project)',admin)
        self.assertNotIn('capture-dimensions',html)
        self.assertNotIn('dimension-status',html)
    def test_local_path_scanner_removed(self):
        for name in ['scripts/local_photo_index.py','scripts/INDEX_LOCAL_PHOTOS.bat',
                     'docs/LOCAL_PHOTO_SOURCES.md']:
            self.assertFalse((ROOT/name).exists(),name)
    def test_existing_project_and_note_data_remain_valid(self):
        # Validate current content, including drafts and titleless notes.
        # Do not require historical filenames, counts, titles, or statuses.
        from scripts.validate_content import validate_content
        issues, projects, notes = validate_content(ROOT)
        self.assertEqual(issues, [], '\n'.join(issues))

    def test_security_middleware_and_git_revision_guards(self):
        self.assertIn('verifySession', (ROOT/'functions/api/admin/_middleware.js').read_text())
        dimensions=(ROOT/'functions/api/admin/dimensions.js').read_text()
        self.assertIn('file.sha !== revision',dimensions)
        self.assertIn('r2JpegDimensions',dimensions)
        self.assertNotIn('window.localStorage',dimensions)

if __name__=='__main__': unittest.main()
