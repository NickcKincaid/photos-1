#!/usr/bin/env python3
"""Idempotently add image creator/copyright tags using ExifTool.

Only photographs referenced by project JSON are updated. Existing exposure EXIF
and ICC profiles are preserved. Designed to run after rename_project_photos.py.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / 'content' / 'projects'
MEDIA = ROOT / 'media'
NAME = 'Nicholas Kincaid'
RIGHTS = '© Nicholas Kincaid. All rights reserved.'
WRITABLE = {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}
# Never attribute the original template's demonstration images to the photographer.
DEMO_HASHES = {
    '037492e27f8caa7655810adc79675c510b06c3c625fce3cc19746471646b3be4',
    '0eb4dbe05b4b6e6c07c57b811d964fe55dabe5b951b9bbf11b7a83dd61d8254d',
    '24632306ec68c9ec2a90ff872301a7313c18cfdc724f06cf2be40661d3af4597',
    '834956c3096cc3d71c9129f111bb8c164c3c703c9b691ddd4228964c66057247',
    '96117fa3f0a02a17326ae56bd5ffca7ca2e1736ca57c945b7ee349d4583a7e85',
    'a1722d2b85dfb6c951ee45d49a1339b8b66ed78b46815145b80b7d47ecbfe81a',
    'd173c9611bfd6e85f65bbcf4a32d18d86897b75b73a25cbeb0f95d88c9a8bbfb',
    'd5d818197c97a79ac6d8a452ab343ab375b5bf999557b8bae1260acd9ce5ce49',
    'e0a1e9759a8f4bd0def93eda960127b559ad5c867a0a60eb321a2451f5b4a0ec',
    'e8b7ba97dfd0babf10594df04bb819eea45c89f89f37cd5293caace57d1a4a9c',
    'eda158e19e5e3845d3337d79321e2d52ea15e777e42506d30ec7ce3d5772fb61',
    'f518f4f31458306a62305018072377526ec74c383d2ca98b8df45a6e80342f8f',
}

def is_template_image(path: Path) -> bool:
    return hashlib.sha256(path.read_bytes()).hexdigest() in DEMO_HASHES


def image_files() -> list[Path]:
    files = set()
    for project_file in PROJECTS.glob('*.json'):
        project = json.loads(project_file.read_text(encoding='utf-8'))
        urls = [project.get('cover'), *(project.get('gallery') or [])]
        for url in urls:
            if not isinstance(url, str) or not url.startswith('/media/'):
                continue
            relative = Path(url.lstrip('/'))
            if '..' in relative.parts or '\\' in url:
                continue
            target = (ROOT / relative).resolve()
            if target.is_relative_to(MEDIA.resolve()) and target.is_file() and target.suffix.lower() in WRITABLE:
                files.add(target)
    return sorted(files)


def tool(*args: str) -> str:
    return subprocess.run(['exiftool', *args], text=True, check=True, capture_output=True).stdout


def main() -> None:
    images = [file for file in image_files() if not is_template_image(file)]
    if not images:
        print('No referenced JPEG/PNG/WebP/TIFF images to credit.')
        return
    # ExifTool can return a single JSON document for all images, minimizing work.
    metadata = json.loads(tool('-j', '-XMP-dc:Creator', '-XMP-dc:Rights', '-XMP-photoshop:Credit', '-GPS:all',
                               *map(str, images)))
    needs_credit = []
    for image, tags in zip(images, metadata):
        creator = tags.get('Creator')
        if isinstance(creator, list):
            creator = creator[0] if creator else ''
        # Don't publish precise embedded camera GPS coordinates.
        has_gps = any(key.startswith('GPS') for key in tags)
        if creator != NAME or tags.get('Rights') != RIGHTS or tags.get('Credit') != NAME or has_gps:
            needs_credit.append(image)
    for image in needs_credit:
        # Written into the image itself, not just the HTML.
        # Modify only our copyright fields, leaving camera EXIF intact.
        args = ['-overwrite_original', '-P', '-XMP-dc:Creator=' + NAME,
                '-XMP-dc:Rights=' + RIGHTS,
                '-XMP-photoshop:Credit=' + NAME,
                '-XMP-xmpRights:Marked=True', '-GPS:all=']
        if image.suffix.lower() in {'.jpg', '.jpeg', '.tif', '.tiff'}:
            args.extend(['-EXIF:Artist=' + NAME, '-EXIF:Copyright=' + RIGHTS])
        tool(*args, str(image))
        print('Credited:', image.relative_to(ROOT))
    print(f'Credited {len(needs_credit)} of {len(images)} referenced files.')


if __name__ == '__main__':
    main()
