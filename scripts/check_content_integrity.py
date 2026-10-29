#!/usr/bin/env python3
"""Read-only pre-push guard against accidental Notes/project loss.

This is intentionally an opt-in check. It never edits files or performs network
requests. Provide a trusted previous source ZIP using --compare-zip to verify
that a replacement tree hasn't omitted content from that backup.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('content/notes/', 'content/projects/', 'content/site.json')


def content_paths(names):
    """Extract content file names from a project ZIP or plain repo paths."""
    result = set()
    for raw in names:
        p = raw.replace('\\', '/')
        for prefix in CATEGORIES:
            idx = p.find(prefix)
            if idx >= 0:
                normalized = p[idx:]
                if normalized.endswith('.json') and not normalized.endswith('/'):
                    result.add(normalized)
                break
    return result


def compare_zip(root: Path, archive: Path):
    with zipfile.ZipFile(archive) as z:
        original = content_paths(z.namelist())
    current = content_paths(str(p.relative_to(root)) for p in (root/'content').rglob('*.json'))
    missing = sorted(original - current)
    return missing, len(original), len(current)


def git_deletions(root: Path):
    proc = subprocess.run(['git','-C',str(root),'diff','HEAD','--name-status','-z','--','content/','media/'],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode: return [], 'Git working-tree comparison unavailable: '+proc.stderr.decode('utf-8','replace').strip()
    entries = proc.stdout.decode('utf-8','replace').split('\0')
    missing = []
    i=0
    while i+1<len(entries):
        status,path = entries[i],entries[i+1]
        if status.startswith('D'):
            missing.append(path)
        i+=3 if status.startswith(('R','C')) else 2
    return missing, ''


def inspect(root: Path, archive: Path | None = None):
    errors=[]
    projects=sorted((root/'content/projects').glob('*.json'))
    notes=sorted((root/'content/notes').glob('*.json'))
    for p in [*projects,*notes,root/'content/site.json']:
        try:
            data=json.loads(p.read_text(encoding='utf-8'))
            if not isinstance(data,dict): errors.append(f'Not a JSON object: {p.relative_to(root)}')
        except (ValueError,OSError) as err:
            errors.append(f'Unreadable JSON: {p.relative_to(root)} ({err})')
    if not projects: errors.append('No project JSON files found.')
    if not notes: errors.append('No Notes JSON files found.')
    removed,message=git_deletions(root)
    if message: errors.append(message)
    if removed: errors.append('Tracked content/media deletions (review individually): '+', '.join(removed))
    if archive:
        missing,previous,current=compare_zip(root,archive)
        if missing: errors.append(f'{len(missing)} files absent compared with {archive.name}: '+', '.join(missing))
    return errors, len(projects), len(notes)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compare-zip', type=Path, help='Optional trusted previous source ZIP')
    args=parser.parse_args()
    errors,projects,notes=inspect(ROOT,args.compare_zip)
    print(f'Content guard: {projects} projects, {notes} Notes; deletions/JSON problems: {len(errors)}')
    for err in errors: print('ERROR:',err)
    if errors:
        print('No files were changed. Confirm that deletions are intentional before pushing.')
    return bool(errors)

if __name__ == '__main__': sys.exit(main())
