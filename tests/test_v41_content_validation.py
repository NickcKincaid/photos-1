"""V41: content changes must be safe without fixed counts, titles or statuses."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from scripts.validate_content import validate_content
from scripts.check_content_integrity import inspect


class V41ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'content/projects').mkdir(parents=True)
        (self.root / 'content/notes').mkdir(parents=True)
        self.put('content/site.json', {'name': 'Example Photographer', 'intro': ''})

    def put(self, name, obj):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(obj), encoding='utf-8')

    def project(self, n, **kwargs):
        obj = dict(title=f'Project {n}', published=True, cover='', gallery=[], photo_details=[])
        obj.update(kwargs)
        self.put(f'content/projects/p{n}.json', obj)

    def note(self, n, **kwargs):
        obj = dict(title=f'Note {n}', body='Text', published=False)
        obj.update(kwargs)
        self.put(f'content/notes/n{n}.json', obj)

    def issues(self):
        return validate_content(self.root)[0]

    def test_zero_notes_and_zero_projects_are_valid_for_empty_portfolio(self):
        self.assertEqual(validate_content(self.root), ([], 0, 0))

    def test_nine_projects_four_notes_and_published_tbc_are_valid(self):
        for n in range(9):
            self.project(n)
        for n in range(4):
            self.note(n, title='' if n == 0 else 'tbc', published=True,
                      published_at='2026-10-30T08:21:00Z', date_mode='created')
        self.assertEqual(validate_content(self.root), ([], 9, 4))

    def test_empty_note_title_is_supported_even_when_unpublished(self):
        self.note(1, title='', published=False)
        self.assertEqual(self.issues(), [])

    def test_rejects_published_note_without_publication_timestamp(self):
        self.note(1, published=True)
        self.assertTrue(any('published_at' in issue for issue in self.issues()))

    def test_detects_invalid_note_types_and_timestamp(self):
        self.note(1, published='false', body=['not text'], created_at='not a date',
                  date_mode='later')
        msg = ' '.join(self.issues())
        for fragment in ['published must', 'body must', 'created_at', 'date_mode']:
            self.assertIn(fragment, msg)

    def test_detects_malformed_json_and_missing_site_settings(self):
        p = self.root / 'content/notes/bad.json'
        p.write_text('{bad')
        (self.root / 'content/site.json').unlink()
        msg = ' '.join(self.issues())
        self.assertIn('invalid or unreadable JSON', msg)
        self.assertIn('site settings file is missing', msg)

    def test_detects_invalid_project_gallery_and_image_dimensions(self):
        self.project(1, gallery='not a list', photo_details=[{'image':'/media/a.jpg','width':200},
                          {'image':'/media/b.jpg','width':True,'height':20}])
        msg = ' '.join(self.issues())
        self.assertIn('gallery', msg)
        self.assertIn('width and height together', msg)
        self.assertIn('positive integer', msg)

    def test_valid_dimensions_are_accepted(self):
        self.project(1, photo_details=[{'image':'/media/a.jpg','width':3024,'height':4032,'alt':''}])
        self.assertEqual(self.issues(), [])

    def test_git_history_guard_still_flags_committed_deletion_not_title_changes(self):
        self.project(1)
        self.note(1)
        def git(*a):
            return subprocess.run(['git','-C',str(self.root),*a],capture_output=True,
                                  text=True,check=True).stdout.strip()
        git('init','-b','main')
        git('config','user.email','test@example.com')
        git('config','user.name','Test')
        git('add','content')
        git('commit','-m','Initial')
        # Changing a title and publishing a Note should not count as deletion.
        self.note(1,title='Renamed',published=True,published_at='2026-10-30T08:21:00Z')
        git('add','content')
        git('commit','-m','Update Note')
        issues, count_projects, count_notes = inspect(self.root,base_ref='HEAD^')
        self.assertEqual((issues, count_projects, count_notes), ([],1,1))
        (self.root/'content/projects/p1.json').unlink()
        git('add','-u')
        git('commit','-m','Delete project')
        errors, *_ = inspect(self.root,base_ref='HEAD^')
        self.assertTrue(any('content/projects/p1.json' in x for x in errors))


if __name__ == '__main__':
    unittest.main()
