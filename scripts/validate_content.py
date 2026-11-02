#!/usr/bin/env python3
"""Validate the current portfolio content without freezing titles or counts.

The validator reads files only.  Every committed project and Note is validated,
including drafts.  Creation, renaming, publishing, and additional content are
normal; a separate Git history guard detects accidental file deletions.
"""
from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import sys


def _valid_iso(value):
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        return datetime.fromisoformat(value.strip().replace('Z', '+00:00')).tzinfo is not None
    except ValueError:
        return False


def validate_content(root: Path):
    """Return (issues, project_count, note_count) for the current repository."""
    issues = []
    root = Path(root)
    projects = sorted((root / 'content/projects').glob('*.json'))
    notes = sorted((root / 'content/notes').glob('*.json'))
    site = root / 'content/site.json'

    def add(path, message):
        issues.append(f'{path.relative_to(root)}: {message}')

    def read(path):
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError, UnicodeError) as exc:
            add(path, f'invalid or unreadable JSON ({exc})')
            return None
        if not isinstance(data, dict):
            add(path, 'expected a JSON object')
            return None
        return data

    if not site.is_file():
        issues.append('content/site.json: required site settings file is missing')
    else:
        data = read(site)
        if data is not None:
            if not isinstance(data.get('name'), str) or not data['name'].strip():
                add(site, 'name must be a nonempty string')
            if 'intro' in data and not isinstance(data['intro'], str):
                add(site, 'intro must be a string')

    for path in projects:
        data = read(path)
        if data is None:
            continue
        if not isinstance(data.get('title'), str):
            add(path, 'title must be a string')
        if type(data.get('published')) is not bool:
            add(path, 'published must be true or false')
        if 'blurb' in data and not isinstance(data['blurb'], str):
            add(path, 'blurb must be a string')
        if 'cover' in data and not isinstance(data['cover'], str):
            add(path, 'cover must be a string')
        if 'gallery' in data and (not isinstance(data['gallery'], list) or
                                   not all(isinstance(x, str) for x in data['gallery'])):
            add(path, 'gallery must be an array of image paths')
        if 'photo_details' in data:
            if not isinstance(data['photo_details'], list):
                add(path, 'photo_details must be an array')
            else:
                for i, item in enumerate(data['photo_details']):
                    if not isinstance(item, dict):
                        add(path, f'photo_details[{i}] must be an object')
                        continue
                    if not isinstance(item.get('image'), str):
                        add(path, f'photo_details[{i}].image must be a string')
                    for field in ('width', 'height'):
                        if field in item and (type(item[field]) is not int or item[field] <= 0):
                            add(path, f'photo_details[{i}].{field} must be a positive integer')
                    if ('width' in item) != ('height' in item):
                        add(path, f'photo_details[{i}] must store width and height together')
                    if 'alt' in item and not isinstance(item['alt'], str):
                        add(path, f'photo_details[{i}].alt must be a string')

    for path in notes:
        data = read(path)
        if data is None:
            continue
        if not isinstance(data.get('title'), str):
            add(path, 'title must be a string (empty is allowed)')
        if not isinstance(data.get('body'), str):
            add(path, 'body must be a string')
        if type(data.get('published')) is not bool:
            add(path, 'published must be true or false')
        if 'date_mode' in data and data['date_mode'] not in ('created', 'published'):
            add(path, 'date_mode must be created or published')
        for field in ('created_at', 'published_at', 'updated_at'):
            value = data.get(field)
            if value not in (None, '') and not _valid_iso(value):
                add(path, f'{field} must be an ISO-8601 timestamp with time zone')
        if data.get('published') is True and not _valid_iso(data.get('published_at')):
            add(path, 'published Notes require a valid published_at timestamp')

    return issues, len(projects), len(notes)


def main():
    root = Path(__file__).resolve().parents[1]
    issues, p, n = validate_content(root)
    print(f'Content schema: {p} projects, {n} Notes; {len(issues)} issue(s)')
    for issue in issues:
        print('ERROR:', issue)
    return 1 if issues else 0


if __name__ == '__main__':
    sys.exit(main())
