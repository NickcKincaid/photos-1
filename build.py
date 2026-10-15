#!/usr/bin/env python3
"""Dependency-free static site generator for a Pages CMS photo portfolio.

Run: python3 build.py
Output: dist/
"""
from __future__ import annotations

import html
import hashlib
import json
import re
import shutil
from datetime import date
from pathlib import Path
from urllib.parse import urlparse, quote

from photo_exif import read_exif

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / 'content'
OUT = ROOT / 'dist'


def esc(value: object) -> str:
    return html.escape(str(value or ''), quote=True)


def read_json(path: Path) -> dict:
    with path.open(encoding='utf-8') as f:
        return json.load(f)


def slugify(raw: str) -> str:
    value = re.sub(r'[^a-z0-9]+', '-', raw.lower()).strip('-')
    return value or 'untitled'


def image_url(value: str) -> str:
    """Only local uploaded images are accepted; avoid injecting unsafe URL schemes."""
    if not isinstance(value, str):
        return ''
    parsed = urlparse(value.strip())
    if parsed.scheme or parsed.netloc or '\\' in value or '..' in parsed.path:
        return ''
    path = parsed.path
    if not path.startswith('/media/'):
        return ''
    return path


def media_href(value: str) -> str:
    """Version photo URLs so reordered/edited JPEGs don't use cached old content."""
    url = image_url(value)
    if not url:
        return ''
    photo_path = ROOT / url.lstrip('/')
    if not photo_path.is_file():
        return url
    digest = hashlib.sha256(photo_path.read_bytes()).hexdigest()[:12]
    return f'{url}?v={digest}'


def safe_href(value: str) -> str:
    if not isinstance(value, str):
        return ''
    p = urlparse(value.strip())
    return value.strip() if p.scheme == 'https' and p.netloc else ''


def load_projects() -> list[dict]:
    projects = []
    seen = set()
    for path in sorted((CONTENT / 'projects').glob('*.json')):
        project = read_json(path)
        if not project.get('published', False):
            continue
        title = str(project.get('title') or path.stem)
        slug = slugify(path.stem)
        if slug in seen:
            raise ValueError(f'Duplicate project URL: {slug}')
        seen.add(slug)
        cover = image_url(project.get('cover') or '')
        gallery = [image_url(item) for item in (project.get('gallery') or []) if image_url(item)]
        if not cover:
            cover = gallery[0] if gallery else ''
        projects.append({
            **project,
            'title': title,
            'slug': slug,
            'url': f'/projects/{slug}/',
            'cover': cover,
            'gallery': gallery,
            'order': project.get('order', 999) if isinstance(project.get('order'), (float, int)) else 999,
        })
    return sorted(projects, key=lambda item: (item['order'], item['title'].lower()))


def nav(site: dict, home: bool) -> str:
    # The brand is the only visible navigation; it also returns to the homepage.
    return f'''<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header page">
  <a class="brand" href="/" aria-label="{esc(site['name'])} — home">{esc(site['name'])}</a>
</header>''' 

def document(title: str, description: str, site: dict, body: str, cover: str = '') -> str:
    # Fingerprints bypass old CSS/JS caching after future GitHub updates.
    css_version = hashlib.sha256((ROOT / 'static/style.css').read_bytes()).hexdigest()[:10]
    js_version = hashlib.sha256((ROOT / 'static/site.js').read_bytes()).hexdigest()[:10]
    og_image = f'<meta property="og:image" content="{esc(cover)}">' if cover else ''
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f7f7f3">
  <meta name="description" content="{esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  {og_image}
  <title>{esc(title)} — {esc(site['name'])}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css?v={css_version}">
  <script src="/site.js?v={js_version}" defer></script>
</head>
<body>{body}</body>
</html>'''


def cards(projects: list[dict]) -> str:
    blocks = []
    for i, p in enumerate(projects):
        cover = (f'<img src="{esc(media_href(p["cover"]))}" alt="{esc(p["title"])}" '
                 f'loading="{"eager" if i == 0 else "lazy"}" decoding="async">') if p['cover'] else ''
        blocks.append(f'''<article class="project-card">
  <a class="project-card-media" href="{esc(p['url'])}" aria-label="View {esc(p['title'])}">{cover}</a>
  <h2 class="project-name"><a href="{esc(p['url'])}">{esc(p['title'])}</a></h2>
</article>''')
    return '\n'.join(blocks)


def homepage(site: dict, projects: list[dict]) -> str:
    work = (f'<div class="works-grid">{cards(projects)}</div>' if projects
            else '<p class="empty-state">No projects yet.</p>')
    body = f'''{nav(site, True)}<main id="main" class="page home-main">
  <h1 class="visually-hidden">Projects</h1>
  <section aria-label="Projects" id="work">{work}</section>
</main>'''
    return document('Projects', str(site.get('intro', 'Photography portfolio')), site, body,
                    projects[0]['cover'] if projects else '')

def photo_info(image: str, project: dict) -> str:
    "EXIF when present, plus per-photo optional CMS overrides."
    info = read_exif(ROOT / image.lstrip('/')) if image else {}
    for override in project.get('photo_details') or []:
        if not isinstance(override, dict) or image_url(override.get('image') or '') != image:
            continue
        for key in ('camera', 'lens', 'focal_length', 'aperture', 'shutter_speed', 'iso'):
            value = override.get(key)
            if value is not None and str(value).strip():
                info[key] = str(value).strip()
        break
    fragments = []
    for key in ('camera', 'lens', 'focal_length', 'aperture', 'shutter_speed', 'iso'):
        value = str(info.get(key) or '').strip()
        if not value:
            continue
        # Avoid duplicating units when entered manually in the CMS.
        if key == 'focal_length' and value.replace('.', '', 1).isdigit():
            value += ' mm'
        if key == 'aperture' and not value.lower().startswith('f/'):
            value = 'f/' + value
        if key == 'shutter_speed' and not value.lower().endswith(('s', 'sec', 'seconds')):
            value += ' s'
        if key == 'iso' and not value.upper().startswith('ISO'):
            value = 'ISO ' + value
        fragments.append(value)
    return ' · '.join(fragments)


def photo_caption(index: int, count: int, image: str, project: dict, css_class: str = 'photo-caption') -> str:
    # Show only photographic metadata, no image counters or extra labels.
    details = photo_info(image, project)
    return (f'<figcaption class="{css_class}">{esc(details)}</figcaption>'
            if details else '')

def lightbox() -> str:
    return '''<dialog id="lightbox" class="lightbox" aria-label="Photo viewer">
  <div class="lightbox-inner">
    <div class="lightbox-top"><span></span><button class="lightbox-close" type="button" aria-label="Close photo viewer">CLOSE &times;</button></div>
    <div class="lightbox-stage"><button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous photo">&#8592;</button>
      <img class="lightbox-image" alt="" decoding="async">
      <button class="lightbox-nav lightbox-next" type="button" aria-label="Next photo">&#8594;</button>
    </div>
    <div class="lightbox-bottom"><span class="lightbox-counter" aria-live="polite"></span><span class="lightbox-metadata"></span></div>
  </div>
</dialog>'''


def project_page(site: dict, p: dict, index: int, projects: list[dict]) -> str:
    images = [p['cover']] if p['cover'] else []
    images.extend(img for img in p['gallery'] if img and img != p['cover'])
    items = []
    for idx, image in enumerate(images, start=1):
        items.append(f'''<figure class="gallery-item">
  <a class="gallery-link" data-lightbox data-meta="{esc(photo_info(image, p))}" href="{esc(media_href(image))}" aria-label="Open photograph {idx} in viewer">
    <img src="{esc(media_href(image))}" alt="{esc(p['title'])}, photograph {idx}" loading="{'eager' if idx == 1 else 'lazy'}" decoding="async">
  </a>
  {photo_caption(idx, len(images), image, p)}
</figure>''')
    gallery = f'<div class="project-photos{ " project-photos-single" if len(items) == 1 else ""}">{"".join(items)}</div>' if items else ''
    body = f'''{nav(site, False)}<main id="main" class="page project-main">
  <div class="project-heading">
    <h1 class="project-title">{esc(p['title'])}</h1>
    <a class="project-inquiry" href="mailto:nicholas.kincaid2@gmail.com?subject={quote('Photo inquiry: ' + p['title'])}" aria-label="Email inquiry about {esc(p['title'])}">inquiry ↗</a>
  </div>
  {gallery}
</main>{lightbox()}'''
    return document(p['title'], str(p.get('description', '')), site, body,
                    images[0] if images else '')

def run() -> None:
    site = read_json(CONTENT / 'site.json')
    if not site.get('name'):
        raise ValueError('Set name in content/site.json')
    projects = load_projects()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for name in ('style.css', 'site.js', 'favicon.svg', '_headers', '_routes.json'):
        shutil.copy2(ROOT / 'static' / name, OUT / name)
    prep_dir = OUT / 'prepare'
    prep_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'static' / 'prepare.html', prep_dir / 'index.html')
    shutil.copy2(ROOT / 'static' / 'prepare.js', prep_dir / 'prepare.js')
    admin_dir = OUT / 'admin'
    admin_dir.mkdir(parents=True, exist_ok=True)
    for src, dest in [('admin.html', 'index.html'), ('admin.css', 'admin.css'), ('admin.js', 'admin.js'), ('admin-processing.js', 'admin-processing.js')]:
        shutil.copy2(ROOT / 'static' / src, admin_dir / dest)
    if (ROOT / 'media').exists():
        shutil.copytree(ROOT / 'media', OUT / 'media', ignore=shutil.ignore_patterns('_unused'), dirs_exist_ok=True)
    (OUT / 'index.html').write_text(homepage(site, projects), encoding='utf-8')
    for idx, p in enumerate(projects):
        outdir = OUT / 'projects' / p['slug']
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / 'index.html').write_text(project_page(site, p, idx, projects), encoding='utf-8')
    print(f'Built site: {len(projects)} published projects -> {OUT}')

if __name__ == '__main__':
    run()
