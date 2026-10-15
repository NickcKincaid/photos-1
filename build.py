#!/usr/bin/env python3
"""Dependency-free static site generator for a minimal photography portfolio.

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
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse, quote

from photo_exif import read_exif

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / 'content'
OUT = ROOT / 'dist'
SITE_URL = 'https://nickckincaid.com'
IMAGE_SIZES_HOME = '(max-width: 600px) calc(100vw - 24px), (max-width: 900px) 50vw, 33vw'
IMAGE_SIZES_GALLERY = '(max-width: 600px) calc(100vw - 24px), 50vw'
_OPTIMIZED = None


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


@lru_cache(maxsize=2048)
def image_digest(path: str) -> str:
    photo_path = ROOT / path.lstrip('/')
    return hashlib.sha256(photo_path.read_bytes()).hexdigest() if photo_path.is_file() else hashlib.sha256(path.encode()).hexdigest()


def photo_id(value: str, project: dict) -> str:
    """Stable ID assigned when an image is uploaded, not tied to filename or EXIF bytes."""
    for item in project.get('photo_details') or []:
        if isinstance(item, dict) and item.get('image') == value:
            photo_key = item.get('id')
            if isinstance(photo_key, str) and re.fullmatch(r'[0-9a-f]{24}', photo_key):
                return photo_key
    # Read-only fallback for older projects before the photo workflow migrates them.
    return image_digest(value)[:16] if image_url(value) else ''


def photo_legacy_id(value: str, project: dict) -> str:
    for item in project.get('photo_details') or []:
        if isinstance(item, dict) and item.get('image') == value:
            alias = item.get('legacy_id')
            if isinstance(alias, str) and re.fullmatch(r'[0-9a-f]{16}', alias):
                return alias
    return '' 


def media_href(value: str) -> str:
    """Version image URLs so the browser doesn't keep a replaced file in cache."""
    url = image_url(value)
    if not url:
        return ''
    return f'{url}?v={image_digest(url)[:12]}'


def optimized_images() -> dict:
    global _OPTIMIZED
    if _OPTIMIZED is None:
        file = ROOT / 'media/_optimized/manifest.json'
        try:
            _OPTIMIZED = read_json(file) if file.is_file() else {}
        except (ValueError, OSError):
            _OPTIMIZED = {}
    return _OPTIMIZED


def is_r2_image(image: str, project: dict) -> bool:
    return any(isinstance(item, dict) and item.get('image') == image and
               item.get('storage') == 'r2' for item in (project.get('photo_details') or []))


def exists_image(image: str, project: dict) -> bool:
    # R2 object existence was checked by the authenticated publishing API;
    # Cloudflare's static build does not need R2 credentials or network access.
    return bool(image) and (is_r2_image(image, project) or (ROOT / image.lstrip('/')).is_file())


def image_attributes(value: str, sizes: str, eager: bool = False, project: dict | None = None) -> str:
    """Serve an optimized WebP when available, and the original if not."""
    original = media_href(value)
    details = next((d for d in (project or {}).get('photo_details', [])
                    if isinstance(d, dict) and d.get('image') == value), {})
    remote_variants = bool(is_r2_image(value, project or {}) and details.get('variants'))
    variants = details.get('variants') if remote_variants else optimized_images().get(value, [])
    variants = variants if isinstance(variants, list) else []
    valid = [v for v in variants if isinstance(v, dict)
             and isinstance(v.get('width'), int) and v['width'] > 0
             and image_url(v.get('url', ''))
             and (remote_variants or (ROOT / v['url'].lstrip('/')).is_file())]
    if valid:
        valid.sort(key=lambda v: v['width'])
        src = valid[0]['url']
        srcset = ', '.join(f'{esc(v["url"])} {v["width"]}w' for v in valid)
        return (f'src="{esc(src)}" srcset="{srcset}" sizes="{esc(sizes)}" '
                f'loading="{"eager" if eager else "lazy"}" decoding="async"')
    return f'src="{esc(original)}" loading="{"eager" if eager else "lazy"}" decoding="async"'


def image_alt(project: dict, url: str, default: str) -> str:
    for entry in project.get('photo_details') or []:
        if isinstance(entry, dict) and entry.get('image') == url:
            text = str(entry.get('alt') or '').strip()
            if text:
                return text[:250]
    return default


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
        gallery = [image for image in gallery if exists_image(image, project)]
        if cover and not exists_image(cover, project):
            print(f'WARNING: Missing cover image in {path.name}: {cover}')
            cover = ''
        if not cover:
            cover = gallery[0] if gallery else ''
        if not cover:
            print(f'WARNING: Skipping published project {path.name}: no valid photo files')
            continue
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

def document(title: str, description: str, site: dict, body: str, cover: str = '',
             path: str = '/', kind: str = 'website', structured: dict | None = None) -> str:
    css_version = hashlib.sha256((ROOT / 'static/style.css').read_bytes()).hexdigest()[:10]
    js_version = hashlib.sha256((ROOT / 'static/site.js').read_bytes()).hexdigest()[:10]
    site_url = SITE_URL
    canonical = site_url + path
    og_cover = image_url(cover)
    og_image = (f'<meta property="og:image" content="{esc(site_url + og_cover)}">\n'
                f'  <meta name="twitter:card" content="summary_large_image">') if og_cover else '<meta name="twitter:card" content="summary">'
    full_title = title if path == '/' else f'{title} — {site["name"]}'
    safe_desc = description.strip() or f'Photography by {site["name"]}.'
    schema_tag = ''
    if structured:
        schema = json.dumps(structured, ensure_ascii=False).replace('<', r'\u003c')
        schema_tag = f'<script type="application/ld+json">{schema}</script>'
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f7f7f3">
  <meta name="description" content="{esc(safe_desc)}">
  <meta name="author" content="Nicholas Kincaid">
  <link rel="canonical" href="{esc(canonical)}">
  <meta property="og:type" content="{esc(kind)}">
  <meta property="og:site_name" content="{esc(site['name'])}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:title" content="{esc(full_title)}">
  <meta property="og:description" content="{esc(safe_desc)}">
  <meta name="twitter:title" content="{esc(full_title)}">
  <meta name="twitter:description" content="{esc(safe_desc)}">
  {og_image}
  {schema_tag}
  <title>{esc(full_title)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css?v={css_version}">
  <script src="/site.js?v={js_version}" defer></script>
</head>
<body>{body}</body>
</html>'''


def cards(projects: list[dict]) -> str:
    blocks = []
    for i, p in enumerate(projects):
        cover = (f'<img {image_attributes(p["cover"], IMAGE_SIZES_HOME, i == 0, p)} '
                 f'alt="{esc(image_alt(p, p["cover"], p["title"]))}" '
                 f'fetchpriority="{"high" if i == 0 else "auto"}">') if p['cover'] else ''
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
    return document(str(site['name']), str(site.get('intro', 'Photography portfolio')), site, body,
                    projects[0]['cover'] if projects else '', '/', structured={
                    '@context': 'https://schema.org', '@type': 'CollectionPage',
                    'name': site['name'], 'url': SITE_URL + '/',
                    'creator': {'@type': 'Person', 'name': 'Nicholas Kincaid'},
                    'hasPart': [{'@type': 'CreativeWork', 'name': p['title'], 'url': SITE_URL + p['url']} for p in projects]})

def photo_info(image: str, project: dict) -> str:
    "EXIF when present, plus per-photo optional CMS overrides."
    info = read_exif(ROOT / image.lstrip('/')) if image and (ROOT / image.lstrip('/')).is_file() else {}
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
    <div class="lightbox-bottom"><span class="lightbox-counter" aria-live="polite"></span><span class="lightbox-metadata"></span><button class="lightbox-copy" type="button" aria-label="Copy link to this photograph">Copy link</button></div>
  </div>
</dialog>'''


def project_page(site: dict, p: dict, index: int, projects: list[dict]) -> str:
    images = [p['cover']] if p['cover'] else []
    images.extend(img for img in p['gallery'] if img and img != p['cover'])
    items = []
    for idx, image in enumerate(images, start=1):
        items.append(f'''<figure class="gallery-item">
  <a class="gallery-link" data-lightbox data-photo-id="{esc(photo_id(image, p))}" data-photo-legacy-id="{esc(photo_legacy_id(image, p))}" data-meta="{esc(photo_info(image, p))}" href="{esc(media_href(image))}" aria-label="Open photograph {idx} in viewer">
    <img {image_attributes(image, IMAGE_SIZES_GALLERY, idx == 1, p)} alt="{esc(image_alt(p, image, p['title'] + ', photograph ' + str(idx)))}">
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
    return document(p['title'], str(p.get('description') or f'Photographs from {p["title"]} by Nicholas Kincaid.'), site, body,
                    images[0] if images else '', p['url'], 'article',
                    {'@context': 'https://schema.org', '@type': 'CreativeWork', 'name': p['title'],
                     'url': SITE_URL + p['url'], 'creator': {'@type': 'Person', 'name': 'Nicholas Kincaid'},
                     'image': [SITE_URL + photo for photo in images]})

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
    # The publishing API never exposes unlisted/draft projects here.
    site_url = SITE_URL
    sitemap = ['<?xml version="1.0" encoding="utf-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for route in ['/', *(p['url'] for p in projects)]:
        sitemap.append(f'<url><loc>{esc(site_url + route)}</loc></url>')
    sitemap.append('</urlset>')
    (OUT / 'sitemap.xml').write_text('\n'.join(sitemap) + '\n', encoding='utf-8')
    (OUT / 'robots.txt').write_text(f'User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /prepare/\nSitemap: {site_url}/sitemap.xml\n', encoding='utf-8')
    print(f'Built site: {len(projects)} published projects -> {OUT}')

if __name__ == '__main__':
    run()
