#!/usr/bin/env python3
"""Read-only portfolio source safety sweep for an existing photography portfolio repo.

No network requests, no R2 writes, and no modifications to project JSON.
"""
from __future__ import annotations
import ast
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {'.git', 'dist', 'node_modules', '.v32-backups', '__pycache__'}
errors: list[str] = []
warnings: list[str] = []
counters = {'python': 0, 'javascript': 0, 'json': 0, 'projects': 0}


def files(suffixes: set[str]):
    for file in ROOT.rglob('*'):
        if file.is_file() and file.suffix.lower() in suffixes and not EXCLUDE.intersection(file.relative_to(ROOT).parts):
            yield file


def read(file: str) -> str:
    try:
        return (ROOT / file).read_text(encoding='utf-8')
    except OSError as error:
        errors.append(f'Missing/read error: {file}: {error}')
        return ''


for required in ('build.py','static/site.js','static/admin-describe.js',
                 'functions/api/admin/describe.js','functions/api/admin/_middleware.js',
                 'functions/api/admin/deployment.js','admin-lib/session.js'):
    if not (ROOT/required).is_file():
        errors.append(f'Missing required site source: {required}')

for file in files({'.py'}):
    try:
        ast.parse(file.read_text(encoding='utf-8'), filename=str(file))
        counters['python'] += 1
    except (SyntaxError, UnicodeError, OSError) as error:
        errors.append(f'Python syntax/read: {file.relative_to(ROOT)}: {error}')

node = shutil.which('node')
if not node:
    warnings.append('Node.js not found; skipped JavaScript syntax scan.')
else:
    for file in files({'.js', '.mjs'}):
        result = subprocess.run([node, '--check', str(file)], capture_output=True, text=True)
        if result.returncode:
            errors.append(f'JavaScript syntax: {file.relative_to(ROOT)}: {result.stderr[:240]}')
        else:
            counters['javascript'] += 1

for file in files({'.json'}):
    try:
        obj=json.loads(file.read_text(encoding='utf-8'))
        counters['json'] += 1
        if file.parent == ROOT / 'content' / 'projects':
            counters['projects'] += 1
            if not isinstance(obj,dict):
                errors.append(f'Project JSON is not an object: {file.name}')
                continue
            photos=obj.get('photo_details',[])
            if not isinstance(photos,list):
                errors.append(f'photo_details must be an array: {file.name}')
            else:
                seen=set()
                for item in photos:
                    if not isinstance(item,dict):
                        warnings.append(f'{file.name}: malformed photo_details entry')
                        continue
                    url=item.get('image','')
                    if url and url in seen:warnings.append(f'{file.name}: duplicate photo_details entry: {url}')
                    seen.add(url)
                    for field in ('focal_length','aperture','shutter_speed','iso'):
                        if not str(item.get(field,'') or '').strip():
                            warnings.append(f'{file.name}: missing {field} for {url}; required at next save')
                    alt=item.get('alt')
                    if alt is not None and not isinstance(alt,str):
                        warnings.append(f'{file.name}: alt text is not a string for {url}')
    except (ValueError, UnicodeError, OSError) as error:
        errors.append(f'Invalid JSON: {file.relative_to(ROOT)}: {error}')

build=read('build.py')
viewer=read('static/site.js')
describe=read('functions/api/admin/describe.js')
if 'contact-sheet-toggle' in build and 'Fit All' not in build:
    warnings.append('Visible gallery toggle in build.py must use Fit All.')
if 'is-contact-sheet' in viewer and 'Fit All' not in viewer:
    warnings.append('Visible gallery control in static/site.js must use Fit All.')
if '@cf/moondream/moondream3.1-9B-A2B' not in describe:
    warnings.append('Expected V33 Moondream image-description implementation is not installed.')

print('PORTFOLIO READ-ONLY SOURCE AUDIT')
print(f"Parsed: {counters['python']} Python, {counters['javascript']} JavaScript, {counters['json']} JSON files; {counters['projects']} project records")
print(f'Errors: {len(errors)}; warnings: {len(warnings)}')
for problem in errors:
    print('ERROR:', problem)
for problem in warnings[:50]:
    print('WARNING:', problem)
if len(warnings)>50:
    print(f'... and {len(warnings)-50} more warnings. Review metadata in your admin editor.')
print('Remote GitHub OAuth, R2 and live Cloudflare AI require production verification.')
sys.exit(1 if errors else 0)
