#!/usr/bin/env python3
"""Read-only verifier for the downloaded admin metadata JSON backup.

Usage: python3 scripts/verify_metadata_backup.py path/to/backup.json
Never connects to GitHub, Cloudflare or R2; never writes to the repository.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

MAX_BYTES = 8_000_000
FILENAME = re.compile(r'^[a-z0-9-]{1,80}\.json$')

def verify(path: Path) -> tuple[int,int]:
    if not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise ValueError('Backup missing or too large (maximum 8 MB)')
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or data.get('format') != 'nickckincaid-metadata-v1':
        raise ValueError('Unknown metadata backup format')
    if not isinstance(data.get('site'), dict):
        raise ValueError('Missing site metadata')
    counts = []
    for category in ('projects','notes'):
        group = data.get(category)
        if not isinstance(group, dict) or len(group) > 120:
            raise ValueError(f'Invalid {category} collection')
        for filename, document in group.items():
            if not isinstance(filename,str) or not FILENAME.fullmatch(filename) or not isinstance(document,dict):
                raise ValueError(f'Invalid {category} entry')
        counts.append(len(group))
    return tuple(counts)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 scripts/verify_metadata_backup.py downloaded-backup.json')
    try:
        projects, notes = verify(Path(sys.argv[1]))
    except (ValueError, OSError, UnicodeError) as error:
        sys.exit(f'Backup verification FAILED: {error}')
    print(f'Backup verified: {projects} projects, {notes} notes, site settings present.')
    print('Note: R2 image bytes are NOT included. Keep a separate R2 backup.')
