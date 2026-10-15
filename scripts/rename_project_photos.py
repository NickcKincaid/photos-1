#!/usr/bin/env python3
"""Normalize Pages CMS project image filenames, updating all JSON references.

Run from the repository root, or manually: python3 scripts/rename_project_photos.py

For project title "Tokyo", photos become:
  media/tokyo/tokyo-01.jpg, media/tokyo/tokyo-02.jpg, ...
The cover is first; gallery order determines the remaining numbers.
Other supported image formats keep their true extension (.png, .webp, ...).
The script is idempotent; displaced, formerly numbered files are archived instead of overwritten.
"""
from __future__ import annotations

import json
import hashlib
import re
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / 'content' / 'projects'
MEDIA = ROOT / 'media'
VALID_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tif', '.tiff'}


def slugify(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'untitled'


def media_path(value: object) -> Path | None:
    """Accept only existing local media URLs, never remote URLs or ../ traversal."""
    if not isinstance(value, str) or not value.startswith('/media/'):
        return None
    url = urlparse(value)
    if url.scheme or url.netloc or url.query or url.fragment or '\\' in value:
        return None
    relative = Path(value.removeprefix('/'))
    if '..' in relative.parts or relative.is_absolute():
        return None
    absolute = ROOT / relative
    if not absolute.resolve().is_relative_to(MEDIA.resolve()):
        return None
    if not absolute.is_file() or absolute.suffix.lower() not in VALID_SUFFIXES:
        return None
    return absolute


def normalize_suffix(suffix: str) -> str:
    return '.jpg' if suffix.lower() == '.jpeg' else suffix.lower()


def ordered_images(data: dict) -> list[tuple[str, Path]]:
    raw = [data.get('cover'), *(data.get('gallery') or [])]
    images: list[tuple[str, Path]] = []
    seen: set[Path] = set()
    for item in raw:
        source = media_path(item)
        if source and source not in seen:
            seen.add(source)
            images.append((item, source))
    return images


def replace_refs(value: object, replacements: dict[str, str]) -> object:
    """Rewrite exact image references recursively, including photo_details[].image."""
    if isinstance(value, str):
        return replacements.get(value, value)
    if isinstance(value, list):
        return [replace_refs(v, replacements) for v in value]
    if isinstance(value, dict):
        return {k: replace_refs(v, replacements) for k, v in value.items()}
    return value


def main() -> int:
    if not PROJECTS.is_dir():
        print(f'No content/projects directory at {PROJECTS}', file=sys.stderr)
        return 1
    docs: list[tuple[Path, dict, dict[str, str]]] = []
    transfers: dict[Path, Path] = {}  # destination -> source; support shared source images
    source_paths: set[Path] = set()
    prefix_owners: dict[str, Path] = {}

    for project_file in sorted(PROJECTS.glob('*.json')):
        with project_file.open(encoding='utf-8') as f:
            content = json.load(f)
        if not isinstance(content, dict):
            raise ValueError(f'{project_file.name}: project JSON must be an object')
        images = ordered_images(content)
        if not images:
            continue
        prefix = slugify(str(content.get('title') or project_file.stem))
        owner = prefix_owners.get(prefix)
        if owner and owner != project_file:
            raise ValueError(
                f'Duplicate project name for image folder "{prefix}": '
                f'{owner.name} and {project_file.name}. Give them distinct titles.'
            )
        prefix_owners[prefix] = project_file
        replacements: dict[str, str] = {}
        for number, (old_url, source) in enumerate(images, start=1):
            new_rel = Path('media') / prefix / f'{prefix}-{number:02d}{normalize_suffix(source.suffix)}'
            dest = ROOT / new_rel
            new_url = '/' + new_rel.as_posix()
            replacements[old_url] = new_url
            other = transfers.get(dest)
            if other and other != source:
                raise ValueError(f'Two different photographs would map to {dest}')
            transfers[dest] = source
            source_paths.add(source)
        docs.append((project_file, content, replacements))

    # Identify old numbered filenames displaced when a middle photo was removed.
    # Archive ONLY our own numbered filenames, never unrelated files in media/.
    # An archive lives in media/_unused and remains recoverable in GitHub.
    collisions: dict[Path, Path] = {}
    for dest, source in transfers.items():
        if dest.exists() and not dest.is_file():
            raise FileExistsError(f'Destination is not a regular file: {dest}')
        if not dest.is_file() or dest in source_paths:
            continue
        folder = dest.parent.name
        if (dest.parent != MEDIA / folder or
                not re.fullmatch(rf'{re.escape(folder)}-\d+\.(?:jpe?g|png|webp|gif|avif|tiff?)', dest.name, re.I)):
            raise FileExistsError(
                f'Unrelated existing file at {dest.relative_to(ROOT)}. '
                'Move it manually before renaming photos.'
            )
        digest = hashlib.sha256(dest.read_bytes()).hexdigest()[:16]
        archive = MEDIA / '_unused' / folder / f'{dest.stem}-{digest}{dest.suffix}'
        if archive.is_file() and archive.read_bytes() != dest.read_bytes():
            raise FileExistsError(f'Archive conflict for {archive.relative_to(ROOT)}')
        if archive.exists() and not archive.is_file():
            raise FileExistsError(f'Archive path is not a file: {archive}')
        collisions[dest] = archive

    changed_files = 0
    changed_refs = 0
    with tempfile.TemporaryDirectory(prefix='photo-rename-') as stage:
        # Stage all original images before replacing destinations. This prevents
        # data loss when users reorder photos and numbered names swap places.
        snapshots: dict[Path, Path] = {}
        for index, source in enumerate(sorted(source_paths)):
            if any(dest != source for dest, s in transfers.items() if s == source):
                temp = Path(stage) / str(index)
                shutil.copy2(source, temp)
                snapshots[source] = temp

        for displaced, archived in collisions.items():
            archived.parent.mkdir(parents=True, exist_ok=True)
            if not archived.exists():
                shutil.copy2(displaced, archived)
            displaced.unlink()

        for dest, source in transfers.items():
            if dest == source:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(snapshots[source], dest)
            changed_files += 1

        # Keep source only if it is still one of the desired filenames.
        required_destinations = set(transfers)
        for source in source_paths:
            if source not in required_destinations and source.exists():
                source.unlink()

        for project_file, content, replacements in docs:
            updated = replace_refs(content, replacements)
            if updated == content:
                continue
            project_file.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed_refs += 1

    if not changed_files and not changed_refs:
        print('All referenced project photographs already have the correct names.')
    else:
        print(f'Photo naming complete: {changed_files} files written, {changed_refs} project files updated.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, FileExistsError) as exc:
        print(f'Photo rename failed safely: {exc}', file=sys.stderr)
        raise SystemExit(1)
