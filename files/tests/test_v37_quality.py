"""V37 maintenance regressions: backup provenance and failure recovery."""
import json
from pathlib import Path
import tempfile
import unittest
from scripts.verify_metadata_backup import verify

ROOT=Path(__file__).resolve().parents[1]

class V37QualityTests(unittest.TestCase):
    def test_new_backup_source_sha_is_validated_and_old_backups_remain_supported(self):
        payload={'format':'nickckincaid-metadata-v1','site':{'name':'Nicholas Kincaid'},
                 'projects':{},'notes':{}}
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'backup.json'
            for sha in (None, 'a'*40):
                if sha is None:payload.pop('sourceCommit',None)
                else:payload['sourceCommit']=sha
                path.write_text(json.dumps(payload),encoding='utf-8')
                self.assertEqual(verify(path),(0,0))
            for sha in ('a'*39, 'not-a-sha',123):
                payload['sourceCommit']=sha
                path.write_text(json.dumps(payload),encoding='utf-8')
                with self.assertRaisesRegex(ValueError,'source revision'):
                    verify(path)

    def test_admin_network_requests_cannot_wait_indefinitely(self):
        project=(ROOT/'static/admin.js').read_text(encoding='utf-8')
        notes=(ROOT/'static/admin-notes.js').read_text(encoding='utf-8')
        storage=(ROOT/'static/admin-storage.js').read_text(encoding='utf-8')
        self.assertIn('xhr.timeout=120000',project)
        self.assertIn('xhr.ontimeout=',project)
        self.assertIn('controller.abort(),90000',project)
        self.assertIn('controller.abort(),45000',notes)
        self.assertIn("requestWithDeadline('/api/admin/backup',90",storage)
        for text in (project,notes):
            self.assertIn('finally {clearTimeout(timeout);}',text)

if __name__=='__main__':unittest.main()
