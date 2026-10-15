#!/usr/bin/env python3
"""Create small, content-addressed WebP variants for publicly displayed images.

Runs in GitHub Actions after filenames, credits, and GPS scrubbing. The public
build works without Pillow; it reads this manifest when available.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'media'
PROJECTS = ROOT / 'content/projects'
DERIVATIVES = MEDIA / '_optimized'
TARGET_WIDTHS = (640, 1280)


def main():
    DERIVATIVES.mkdir(parents=True, exist_ok=True)
    manifest = {}
    used = set()
    for project in sorted(PROJECTS.glob('*.json')):
        data = json.loads(project.read_text(encoding='utf-8'))
        if not data.get('published', False):
            continue
        raw = [data.get('cover'), *(data.get('gallery') or [])]
        for url in dict.fromkeys(raw):
            if not isinstance(url, str) or not url.startswith('/media/') or '..' in url or '\\' in url:
                continue
            source = (ROOT / url.lstrip('/')).resolve()
            if not source.is_relative_to(MEDIA.resolve()) or not source.is_file():
                continue
            if source.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}:
                continue
            try:
                with Image.open(source) as original:
                    # Protect against accidentally uploading huge decompression bombs.
                    original.verify()
                with Image.open(source) as original:
                    im = ImageOps.exif_transpose(original)
                    if im.mode not in {'RGB', 'RGBA'}:
                        im = im.convert('RGB')
                    if im.width < 1 or im.height < 1:
                        continue
                    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:16]
                    variants = []
                    for target in TARGET_WIDTHS:
                        actual_width = min(target, im.width)
                        # For tiny images avoid making variants larger than the original.
                        if variants and variants[-1]['width'] == actual_width:
                            continue
                        clone = im.copy()
                        if clone.width > target:
                            clone.thumbnail((target, max(1, round(clone.height * target / clone.width))), Image.Resampling.LANCZOS)
                        # The original still serves in the full-screen viewer and retains
                        # its ownership/EXIF metadata. Derivatives retain original EXIF/XMP
                        # where Pillow supports it and have no separate access controls.
                        safe_name = f'{digest}-{clone.width}w.webp'
                        relative = Path('media/_optimized') / safe_name
                        output = ROOT / relative
                        opts = {'format': 'WEBP', 'quality': 78, 'method': 5}
                        if im.getexif():
                            opts['exif'] = im.getexif().tobytes()
                        if original.info.get('xmp'):
                            opts['xmp'] = original.info['xmp']
                        if not output.exists():
                            clone.save(output, **opts)
                        used.add(output)
                        variants.append({'url': '/' + relative.as_posix(), 'width': clone.width})
                    if variants:
                        manifest[url] = variants
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
                print(f'Skipping unsupported or damaged image {source.name}: {e}')
    # Delete only self-managed derivatives no longer referenced. Never touch originals.
    for path in DERIVATIVES.glob('*.webp'):
        if path not in used:
            path.unlink()
    path = DERIVATIVES / 'manifest.json'
    text = json.dumps(manifest, indent=2, sort_keys=True) + '\n'
    if not path.exists() or path.read_text(encoding='utf-8') != text:
        path.write_text(text, encoding='utf-8')
    print(f'Prepared {len(manifest)} source images ({len(used)} optimized files).')


if __name__ == '__main__':
    main()
