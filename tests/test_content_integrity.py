"""Regression tests for the read-only release content guard."""
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from scripts.check_content_integrity import content_paths, compare_zip

class ContentGuardTests(unittest.TestCase):
    def test_normalizes_archive_prefixes_without_losing_paths(self):
        given=['photos-1/content/notes/untitled-8268656c.json', 'content/projects/a.json',
               'photos-1/static/site.js', 'photos-1/content/notes/.gitkeep']
        self.assertEqual(content_paths(given), {'content/notes/untitled-8268656c.json','content/projects/a.json'})

    def test_reports_a_missing_note_after_source_replacement(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            (root/'content/notes').mkdir(parents=True)
            (root/'content/projects').mkdir(parents=True)
            (root/'content/projects/a.json').write_text('{}')
            bundle=root/'previous.zip'
            with zipfile.ZipFile(bundle,'w') as f:
                f.writestr('photos-1/content/notes/missing.json','{}')
                f.writestr('photos-1/content/projects/a.json','{}')
            missing,prev,current=compare_zip(root,bundle)
            self.assertEqual(missing,['content/notes/missing.json'])
            self.assertEqual((prev,current),(2,1))

    def test_detects_deleted_project_without_flagging_other_files(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            (root/'content/notes').mkdir(parents=True)
            (root/'content/projects').mkdir(parents=True)
            (root/'content/notes/current.json').write_text('{}')
            bundle=root/'baseline.zip'
            with zipfile.ZipFile(bundle,'w') as f:
                f.writestr('photos-1/content/notes/current.json','{}')
                f.writestr('photos-1/content/projects/deleted.json','{}')
                f.writestr('photos-1/static/site.js','source')
            missing,prev,current=compare_zip(root,bundle)
            self.assertEqual(missing,['content/projects/deleted.json'])
            self.assertEqual((prev,current),(2,1))

if __name__=='__main__': unittest.main()
