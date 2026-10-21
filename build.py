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
from datetime import date, datetime, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse, quote

from photo_exif import read_exif
from note_format import render_note

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


def seo_summary(value: object, limit: int = 158) -> str:
    """Make a short, readable SERP description from editor text or Markdown."""
    text = str(value or '')
    text = re.sub(r'!\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'(?m)^\s{0,3}#{1,6}\s+', '', text)
    text = re.sub(r'<[^>]*>', ' ', text)
    text = re.sub(r'[*_`~>#]+', ' ', text)
    text = re.sub(r'\s+', ' ', html.unescape(text)).strip()
    text = re.sub(r'\s+([,.!?;:])', r'\1', text)
    if len(text) > limit:
        text = text[:limit - 1].rsplit(' ', 1)[0].rstrip(' ,.;:') + '…'
    return text


def homepage_description(site: dict) -> str:
    """Allow a deliberate SEO override without relying on the old 28-char intro."""
    custom = seo_summary(site.get('seo_description'))
    if custom:
        return custom
    existing = seo_summary(site.get('intro'))
    if len(existing) >= 70:
        return existing
    return (f'Photography by {site["name"]}. Explore selected photographic '
            'projects, original images, and notes.')


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


def image_dimensions(value: str, project: dict | None = None) -> tuple[int, int] | None:
    """Return persisted, validated source dimensions when known; never guess ratios."""
    for entry in (project or {}).get('photo_details', []):
        if not isinstance(entry, dict) or entry.get('image') != value:
            continue
        w, h = entry.get('width'), entry.get('height')
        if type(w) is int and type(h) is int and 0 < w <= 40000 and 0 < h <= 40000:
            return w, h
    return None


def image_attributes(value: str, sizes: str, eager: bool = False, project: dict | None = None) -> str:
    """Serve an optimized WebP when available, and the original if not."""
    original = media_href(value)
    details = next((d for d in (project or {}).get('photo_details', [])
                    if isinstance(d, dict) and d.get('image') == value), {})
    remote_variants = bool(is_r2_image(value, project or {}) and details.get('variants'))
    variants = details.get('variants') if remote_variants else optimized_images().get(value, [])
    variants = variants if isinstance(variants, list) else []
    dimensions = image_dimensions(value, project)
    dimension_attrs = f'width="{dimensions[0]}" height="{dimensions[1]}" ' if dimensions else ''
    valid = [v for v in variants if isinstance(v, dict)
             and isinstance(v.get('width'), int) and v['width'] > 0
             and image_url(v.get('url', ''))
             and (remote_variants or (ROOT / v['url'].lstrip('/')).is_file())]
    if valid:
        valid.sort(key=lambda v: v['width'])
        src = valid[0]['url']
        srcset = ', '.join(f'{esc(v["url"])} {v["width"]}w' for v in valid)
        return (f'{dimension_attrs}src="{esc(src)}" srcset="{srcset}" sizes="{esc(sizes)}" '
                f'loading="{"eager" if eager else "lazy"}" decoding="async"')
    return f'{dimension_attrs}src="{esc(original)}" loading="{"eager" if eager else "lazy"}" decoding="async"'


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


def nav(site: dict, active: str = '') -> str:
    menu = [('Projects', '/', 'projects'), ('Notes', '/notes/', 'notes'), ('Inquire', '/inquire/', 'inquire')]
    links = ''.join(f'<a href="{href}"{" aria-current=\"page\"" if active == key else ""}>{label}</a>'
                    for label, href, key in menu)
    return f'''<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header page">
  <a class="brand" href="/" aria-label="{esc(site['name'])} — home"><strong>{esc(site['name'])}</strong></a>
  <nav class="site-nav" aria-label="Main navigation">{links}</nav>
</header>'''


def footer(site: dict) -> str:
    return f'''<footer class="site-footer page">
  <span data-nosnippet><a href="/inquire/">Contact</a></span>
  <span data-nosnippet>© {date.today().year} {esc(site['name'])}</span>
</footer>'''
 

def document(title: str, description: str, site: dict, body: str, cover: str = '',
             path: str = '/', kind: str = 'website', structured: dict | None = None) -> str:
    css_version = hashlib.sha256((ROOT / 'static/style.css').read_bytes()).hexdigest()[:10]
    js_version = hashlib.sha256((ROOT / 'static/site.js').read_bytes()).hexdigest()[:10]
    site_url = SITE_URL
    canonical = site_url + path
    og_cover = image_url(cover)
    og_image = (f'<meta property="og:image" content="{esc(site_url + og_cover)}">\n'
                f'  <meta property="og:image:alt" content="{esc(title + " — photograph by Nicholas Kincaid")}">\n'
                f'  <meta name="twitter:image" content="{esc(site_url + og_cover)}">\n'
                f'  <meta name="twitter:card" content="summary_large_image">') if og_cover else '<meta name="twitter:card" content="summary">'
    full_title = f'{site["name"]} — Photography' if path == '/' else f'{title} — {site["name"]}'
    safe_desc = seo_summary(description) or f'Photography by {site["name"]}.'
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
  <meta name="robots" content="index, follow, max-image-preview:large">
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
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=962b3e77bf">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=962b3e77bf">
  <link rel="shortcut icon" href="/favicon.ico?v=962b3e77bf">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=962b3e77bf">
  <link rel="stylesheet" href="/style.css?v={css_version}">
  <script src="/site.js?v={js_version}" defer></script>
</head>
<body>{body}</body>
</html>'''


def cover_position(project: dict) -> tuple[int, int]:
    pos = project.get('cover_position')
    if not isinstance(pos, dict):
        return 50, 50
    values = (pos.get('x'), pos.get('y'))
    if any(type(v) is not int or not 0 <= v <= 100 for v in values):
        return 50, 50
    return values


def sharing_card(project: dict, images: list[str]) -> str:
    """Use a saved 1200×630 JPEG only when it matches the selected photo/crop.

    Older projects without a generated card continue sharing the original image.
    """
    chosen = project.get('social_image') if project.get('social_image') in images else (images[0] if images else '')
    card = project.get('social_card')
    if isinstance(card, dict) and card.get('source') == chosen and card.get('position') == project.get('social_position', {'x':50,'y':50}):
        path = card.get('path')
        slug = project.get('slug')
        if isinstance(path, str) and re.fullmatch(r'/media/[a-z0-9-]{1,65}/[0-9a-f]{24}/sharing-1200x630\.jpg', path):
            if not slug or path.startswith(f'/media/{slug}/'):
                return path
    return chosen


def cards(projects: list[dict]) -> str:
    blocks = []
    for i, p in enumerate(projects):
        crop_x, crop_y = cover_position(p)
        cover = (f'<img {image_attributes(p["cover"], IMAGE_SIZES_HOME, i == 0, p)} '
                 f'style="object-position: {crop_x}% {crop_y}%" '
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
    description = homepage_description(site)
    # Keep the photographic homepage minimal; SEO descriptions stay in the head.
    body = f'''{nav(site, 'projects')}<main id="main" class="page home-main">
  <h1 class="visually-hidden">Photography by {esc(site['name'])}</h1>
  <section aria-label="Projects" id="work">{work}</section>
</main>{footer(site)}'''
    person_id = SITE_URL + '/#person'
    schema = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'WebSite', '@id': SITE_URL + '/#website', 'url': SITE_URL + '/',
         'name': site['name'], 'inLanguage': 'en'},
        {'@type': 'Person', '@id': person_id, 'name': site['name'],
         'url': SITE_URL + '/', 'description': 'Photographer'},
        {'@type': 'CollectionPage', '@id': SITE_URL + '/#projects',
         'name': 'Photography by ' + site['name'], 'url': SITE_URL + '/',
         'description': description, 'isPartOf': {'@id': SITE_URL + '/#website'},
         'about': {'@id': person_id},
         'hasPart': [{'@type': 'ImageGallery', 'name': p['title'],
                      'url': SITE_URL + p['url']} for p in projects]}
    ]}
    hero = ((projects[0].get('social_image') if projects[0].get('social_image') in
             [projects[0]['cover'], *projects[0]['gallery']] else projects[0]['cover'])
            if projects else '')
    return document(str(site['name']), description, site, body, hero, '/', structured=schema)

def format_exposure_public(key: str, value: str) -> str:
    """Presentation-only normalization of legacy camera data."""
    value = str(value or '').strip().replace(',', '.')
    if not value:
        return ''
    if key == 'focal_length':
        match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(?:mm)?', value, flags=re.I)
        if match and 0 < float(match.group(1)) <= 2000:
            return f'{float(match.group(1)):g}mm'
    elif key == 'aperture':
        match = re.fullmatch(r'(?:f\s*/?\s*)?(\d+(?:\.\d+)?)', value, flags=re.I)
        if match and 0 < float(match.group(1)) <= 128:
            return f'f/{float(match.group(1)):g}'
    elif key == 'shutter_speed':
        match = re.fullmatch(r'(\d+)\s*/\s*(\d+)\s*(?:s|sec|secs|second|seconds)?', value, flags=re.I)
        if match and int(match.group(2)) and int(match.group(1)) and int(match.group(1))/int(match.group(2)) <= 36000:
            return f'{int(match.group(1))}/{int(match.group(2))}s'
        match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)?', value, flags=re.I)
        if match and 0 < float(match.group(1)) <= 36000:
            seconds = float(match.group(1))
            if seconds < 1:
                denominator = round(1/seconds)
                if 2 <= denominator <= 8000 and abs(1/denominator-seconds)/seconds < 0.01:
                    return f'1/{denominator}s'
            return f'{seconds:g}s'
    elif key == 'iso':
        match = re.fullmatch(r'(?:ISO\s*[-:]?\s*)?(\d+)', value, flags=re.I)
        if match and 1 <= int(match.group(1)) <= 4096000:
            return f'ISO {int(match.group(1))}'
    # Existing unconventional values remain visible for later manual review.
    return value


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
    # Display only the four requested exposure fields. Camera and lens
    # remain in the metadata, but are not shown in public captions.
    for key in ('focal_length', 'aperture', 'shutter_speed', 'iso'):
        value = str(info.get(key) or '').strip()
        if not value:
            continue
        # Normalize display of older stored values too; never rewrite existing project JSON.
        value = format_exposure_public(key, value)
        fragments.append(value)
    return ' · '.join(fragments)


def photo_caption(index: int, count: int, image: str, project: dict, css_class: str = 'photo-caption') -> str:
    # Show only photographic metadata, no image counters or extra labels.
    details = photo_info(image, project)
    return (f'<figcaption class="{css_class}">{esc(details)}</figcaption>'
            if details else '')

def download_filename(project_title: str, position: int, count: int, image: str) -> str:
    """Public download names reflect display order; R2 keys never change."""
    extension = Path(image_url(image)).suffix.lower().lstrip('.')
    if extension in ('jpeg', 'jpg'):
        extension = 'jpg'
    elif extension not in ('webp', 'png', 'tif', 'tiff'):
        extension = 'jpg'
    width = max(2, len(str(count)))
    return f'{slugify(project_title)[:80]}-{position:0{width}d}.{extension}'


def lightbox(project_title: str = '') -> str:
    return f'''<dialog id="lightbox" class="lightbox" aria-label="Photo viewer">
  <div class="lightbox-inner">
    <div class="lightbox-top"><span class="lightbox-project">{esc(project_title)}</span><button class="lightbox-close" type="button" aria-label="Close photo viewer"><span class="lightbox-close-label">Close</span><span class="lightbox-close-symbol" aria-hidden="true">&times;</span></button></div>
    <div class="lightbox-stage"><button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous photo">&#8592;</button>
      <img class="lightbox-image" alt="" decoding="async">
      <p class="lightbox-unavailable" role="status" hidden></p>
      <button class="lightbox-nav lightbox-next" type="button" aria-label="Next photo">&#8594;</button>
    </div>
    <div class="lightbox-bottom"><span class="lightbox-counter" aria-live="polite"></span><span class="lightbox-metadata"></span><div class="lightbox-actions"><button class="lightbox-zoom" type="button" aria-label="Zoom photograph" aria-pressed="false">Zoom</button><a class="lightbox-download" href="#" download aria-label="Download this photograph">Download</a><button class="lightbox-copy" type="button" aria-label="Copy link to this photograph">Copy link</button></div></div>
  </div>
</dialog>'''


def project_blurb(value: object) -> str:
    """A little text, placed in the gallery's remaining space (no title or decoration)."""
    if not isinstance(value, str) or not value.strip():
        return ''
    text = value.strip()[:1000].replace('\r\n', '\n').replace('\r', '\n')
    paragraphs = [f'<p>{esc(segment.strip())}</p>' for segment in re.split(r'\n\s*\n', text) if segment.strip()]
    return f'<aside class="project-blurb" aria-label="About this project">{"".join(paragraphs)}</aside>' if paragraphs else ''


def project_page(site: dict, p: dict, index: int, projects: list[dict]) -> str:
    images = [p['cover']] if p['cover'] else []
    images.extend(img for img in p['gallery'] if img and img != p['cover'])
    items = []
    for idx, image in enumerate(images, start=1):
        alt_text = image_alt(p, image, f'{p["title"]}, photograph {idx}')
        dimensions = image_dimensions(image, p)
        ratio_style = (f' style="--photo-ratio:{dimensions[0]}/{dimensions[1]}"' if dimensions else '')
        items.append(f'''<figure class="gallery-item">
  <a class="gallery-link"{ratio_style} data-lightbox data-photo-id="{esc(photo_id(image, p))}" data-photo-legacy-id="{esc(photo_legacy_id(image, p))}" data-meta="{esc(photo_info(image, p))}" href="#photo={esc(photo_id(image, p))}" data-full-src="{esc(media_href(image))}" data-download-name="{esc(download_filename(p['title'], idx, len(images), image))}" aria-label="Open {esc(alt_text)} in viewer">
    <img {image_attributes(image, IMAGE_SIZES_GALLERY, idx == 1, p)} alt="{esc(alt_text)}">
  </a>
  {photo_caption(idx, len(images), image, p)}
</figure>''')
    # The blurb participates in the same masonry flow as the photographs, naturally
    # sitting in open column space after the final image on wide screens. It stacks
    # below the photographs on narrow screens. An empty blurb adds zero markup.
    blurb = project_blurb(p.get('blurb'))
    gallery = (f'<div class="project-photos{ " project-photos-single" if len(items) == 1 else ""}">'
               f'{"".join(items)}{blurb}</div>') if items else ''
    body = f'''{nav(site, 'projects')}<main id="main" class="page project-main">
  <div class="project-heading">
    <h1 class="project-title">{esc(p['title'])}</h1>
    {('<button class="contact-sheet-toggle" type="button" aria-pressed="false" hidden>Fit All</button>') if len(images) > 1 else ''}
  </div>
  {gallery}
  <div class="project-bottom-inquiry"><a href="mailto:nicholas.kincaid2@gmail.com?subject={quote('Photo inquiry: ' + p['title'])}">Inquire about this project ↗</a></div>
</main>{footer(site)}{lightbox(p['title'])}'''
    description = seo_summary(p.get('blurb') or p.get('description'))
    if not description:
        # A reviewed AI description can inform the search summary without adding
        # visible copy to the gallery. Never invent subjects from camera EXIF.
        reviewed = [str(item.get('alt') or '').strip() for item in p.get('photo_details', [])
                    if isinstance(item, dict) and item.get('image') in images and item.get('alt')]
        summary = seo_summary(reviewed[0], 100) if reviewed else ''
        description = seo_summary(f'{p["title"]} — photography by {site["name"]}. {summary}'
                                  if summary else
                                  f'{p["title"]} — a photography project by {site["name"]}. View the complete photo series.')
    # Describe the actual linked photographs in machine-readable metadata. Only
    # saved, reviewed alt text is included; don't invent AI descriptions here.
    image_schema = []
    for position, photo in enumerate(images, 1):
        obj = {'@type': 'ImageObject', 'contentUrl': SITE_URL + photo,
               'creator': {'@id': SITE_URL + '/#person'}}
        reviewed_alt = image_alt(p, photo, '')
        if reviewed_alt:
            obj['description'] = reviewed_alt
        image_schema.append(obj)
    return document(p['title'], description, site, body,
                    sharing_card(p, images), p['url'], 'article',
                    {'@context': 'https://schema.org', '@type': 'ImageGallery', 'name': p['title'],
                     'url': SITE_URL + p['url'], 'description': description,
                     'creator': {'@id': SITE_URL + '/#person'},
                     'image': image_schema})


def clean_time(raw: str) -> datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except (ValueError, OverflowError):
        return None


def load_notes() -> list[dict]:
    entries = []
    for path in sorted((CONTENT / 'notes').glob('*.json')):
        note = read_json(path)
        when = clean_time(note.get('published_at'))
        if not note.get('published') or not when:
            continue
        title = str(note.get('title') or '').strip()
        text = str(note.get('body') or '').strip()
        if not title or not text:
            continue
        entries.append({'slug': slugify(path.stem), 'title': title,
                        'body': text, 'published_at': when,
                        'updated_at': clean_time(note.get('updated_at')),
                        'url': '/notes/' + slugify(path.stem) + '/'})
    return sorted(entries, key=lambda n: (n['published_at'], n['slug']), reverse=True)


def note_content(note: dict) -> str:
    return render_note(note['body'])


def timestamp(note: dict) -> str:
    published = note['published_at']
    iso = published.strftime('%Y-%m-%dT%H:%M:%SZ')
    shown = published.strftime('%d %b %Y · %H:%M UTC')
    return f'<time datetime="{iso}" data-local-published title="Published {shown}">{shown}</time>'


def notes_page(site: dict, notes: list[dict], share_cover: str = '') -> str:
    pieces = []
    for n in notes:
        pieces.append(f'''<article class="note-entry" id="{esc(n['slug'])}">
  <div class="note-heading"><h2><a href="{esc(n['url'])}">{esc(n['title'])}</a></h2>{timestamp(n)}</div>
  {note_content(n)}
</article>''')
    body = f'''{nav(site, 'notes')}<main id="main" class="page notes-main">
  <h1 class="visually-hidden">Notes</h1>
  {''.join(pieces) if pieces else '<p class="empty-state">No notes yet.</p>'}
</main>{footer(site)}'''
    return document('Notes', 'Notes by Nicholas Kincaid.', site, body, cover=share_cover, path='/notes/')


def note_page(site: dict, note: dict, share_cover: str = '') -> str:
    body = f'''{nav(site, 'notes')}<main id="main" class="page notes-main">
  <article class="note-entry"><div class="note-heading"><h1>{esc(note['title'])}</h1>{timestamp(note)}</div>
  {note_content(note)}</article>
</main>{footer(site)}'''
    description = seo_summary(note['body']) or f'A note by {site["name"]}.'
    published = note['published_at'].isoformat()
    modified = (note.get('updated_at') or note['published_at']).isoformat()
    schema = {'@context': 'https://schema.org', '@type': 'BlogPosting',
              'headline': note['title'], 'url': SITE_URL + note['url'],
              'description': description, 'datePublished': published, 'dateModified': modified,
              'author': {'@id': SITE_URL + '/#person'},
              'mainEntityOfPage': SITE_URL + note['url']}
    return document(note['title'], description, site, body, cover=share_cover,
                    path=note['url'], kind='article', structured=schema)


def inquire_page(site: dict, share_cover: str = '') -> str:
    body = f'''{nav(site, 'inquire')}<main id="main" class="page inquire-main">
  <h1>Inquire</h1>
  <a href="mailto:nicholas.kincaid2@gmail.com">nicholas.kincaid2@gmail.com ↗</a>
</main>{footer(site)}'''
    return document('Inquire', 'Photography inquiries and contact for Nicholas Kincaid.', site, body, cover=share_cover, path='/inquire/')

def run() -> None:
    site = read_json(CONTENT / 'site.json')
    if not site.get('name'):
        raise ValueError('Set name in content/site.json')
    projects = load_projects()
    notes = load_notes()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for name in ('style.css', 'site.js', 'favicon.svg', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-192x192.png', 'favicon-512x512.png', 'apple-touch-icon.png', '_headers', '_routes.json'):
        shutil.copy2(ROOT / 'static' / name, OUT / name)
    prep_dir = OUT / 'prepare'
    prep_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'static' / 'prepare.html', prep_dir / 'index.html')
    shutil.copy2(ROOT / 'static' / 'prepare.js', prep_dir / 'prepare.js')
    admin_dir = OUT / 'admin'
    admin_dir.mkdir(parents=True, exist_ok=True)
    # Keep the deployed editor's assets in sync with the HTML. Previously,
    # admin-storage.js and admin-drafts.js were referenced but never copied,
    # leaving Storage & Backups and browser-local draft recovery inoperative.
    for src, dest in [('admin.html', 'index.html'), ('admin.css', 'admin.css')]:
        shutil.copy2(ROOT / 'static' / src, admin_dir / dest)
    admin_scripts = [ROOT / 'static' / 'admin.js', *sorted((ROOT / 'static').glob('admin-*.js'))]
    for script in admin_scripts:
        shutil.copy2(script, admin_dir / script.name)
    # This is the build's actual UTC time, not an R2 inventory timestamp or
    # the last date someone opened the admin dashboard. The Cloudflare Pages
    # production build regenerates it with every successful website publish.
    built_at = datetime.now(timezone.utc).replace(microsecond=0)
    admin_html = (admin_dir / 'index.html').read_text(encoding='utf-8')
    if admin_html.count('__SITE_BUILD_UTC__') != 1 or admin_html.count('__SITE_BUILD_LABEL__') != 1:
        raise ValueError('Missing website update timestamp placeholders in admin.html')
    admin_html = admin_html.replace('__SITE_BUILD_UTC__', esc(built_at.isoformat()))
    admin_html = admin_html.replace('__SITE_BUILD_LABEL__', esc(built_at.strftime('%b %d, %Y %H:%M UTC')))
    (admin_dir / 'index.html').write_text(admin_html, encoding='utf-8')
    for required in re.findall(r'<script\b[^>]*\bsrc=[\"\'](/admin/[A-Za-z0-9._-]+\.js)[\"\']', admin_html):
        if not (admin_dir / required.rsplit('/', 1)[-1]).is_file():
            raise FileNotFoundError(f'Admin page references missing script: {required}')
    if (ROOT / 'media').exists():
        shutil.copytree(ROOT / 'media', OUT / 'media', ignore=shutil.ignore_patterns('_unused'), dirs_exist_ok=True)
    (OUT / 'index.html').write_text(homepage(site, projects), encoding='utf-8')
    for idx, p in enumerate(projects):
        outdir = OUT / 'projects' / p['slug']
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / 'index.html').write_text(project_page(site, p, idx, projects), encoding='utf-8')
    notes_out = OUT / 'notes'
    notes_out.mkdir(parents=True, exist_ok=True)
    (notes_out / 'index.html').write_text(notes_page(site, notes, projects[0]['cover'] if projects else ''), encoding='utf-8')
    for note in notes:
        outdir = notes_out / note['slug']
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / 'index.html').write_text(note_page(site, note, projects[0]['cover'] if projects else ''), encoding='utf-8')
    inquire_out = OUT / 'inquire'
    inquire_out.mkdir(parents=True, exist_ok=True)
    (inquire_out / 'index.html').write_text(inquire_page(site, projects[0]['cover'] if projects else ''), encoding='utf-8')
    # The publishing API never exposes unlisted/draft projects or notes here.
    site_url = SITE_URL
    sitemap = ['<?xml version="1.0" encoding="utf-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
               'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for route in ['/', '/notes/', '/inquire/']:
        sitemap.append(f'<url><loc>{esc(site_url + route)}</loc></url>')
    for project in projects:
        # Only published, known photo references appear in the public sitemap.
        photos = list(dict.fromkeys([project['cover'], *(project.get('gallery') or [])]))
        image_tags = ''.join(f'<image:image><image:loc>{esc(site_url + photo)}</image:loc></image:image>'
                             for photo in photos[:1000] if image_url(photo))
        sitemap.append(f'<url><loc>{esc(site_url + project["url"])}</loc>{image_tags}</url>')
    for note in notes:
        # Do not invent a modification date. Use the editor's real timestamp.
        modified = note.get('updated_at') or note['published_at']
        lastmod = f'<lastmod>{modified.date().isoformat()}</lastmod>' if modified else ''
        sitemap.append(f'<url><loc>{esc(site_url + note["url"])}</loc>{lastmod}</url>')
    sitemap.append('</urlset>')
    (OUT / 'sitemap.xml').write_text('\n'.join(sitemap) + '\n', encoding='utf-8')
    (OUT / 'robots.txt').write_text(f'User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /prepare/\nSitemap: {site_url}/sitemap.xml\n', encoding='utf-8')
    print(f'Built site: {len(projects)} projects, {len(notes)} published notes -> {OUT}')

if __name__ == '__main__':
    run()
