"""Intentionally small, safe markup renderer for Notes.

Supports paragraphs, headings, lists, quotes, links, emphasis and standalone
Spotify/YouTube URLs. No arbitrary HTML is ever emitted from note content.
"""
from __future__ import annotations

from html import escape
import re
from urllib.parse import urlsplit, parse_qs

TOKEN = re.compile(r'\[([^\]\n]{1,150})\]\((https?://[^\s)]+|mailto:[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`')
VIDEO_ID = re.compile(r'[a-zA-Z0-9_-]{11}\Z')
SPOTIFY_ID = re.compile(r'[a-zA-Z0-9]{22}\Z')
SPOTIFY_KINDS = {'track', 'album', 'playlist', 'episode', 'show'}


def embed_for_url(text: str):
    """Return allowlisted embed data for a URL on its own line, or None."""
    if not text or re.search(r'\s', text.strip()):
        return None
    try:
        url = urlsplit(text.strip())
    except ValueError:
        return None
    try:
        if url.scheme != 'https' or url.username or url.password or url.port not in (None, 443):
            return None
    except ValueError:
        return None
    host = (url.hostname or '').lower()
    parts = [p for p in url.path.split('/') if p]
    if host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'www.youtube-nocookie.com'):
        candidate = None
        if host.endswith('youtu.be'):
            candidate = parts[0] if len(parts) == 1 else None
        elif parts[:1] == ['watch']:
            candidate = parse_qs(url.query).get('v', [''])[0]
        elif len(parts) == 2 and parts[0] in ('shorts', 'live', 'embed'):
            candidate = parts[1]
        if candidate and VIDEO_ID.fullmatch(candidate):
            return ('youtube', f'https://www.youtube-nocookie.com/embed/{candidate}', 'YouTube video')
    if host == 'open.spotify.com':
        # Spotify share links may include a locale prefix or an existing embed segment.
        if parts and re.fullmatch(r'intl-[a-z]{2}', parts[0]):
            parts.pop(0)
        if parts[:1] == ['embed']:
            parts.pop(0)
        if len(parts) == 2 and parts[0] in SPOTIFY_KINDS and SPOTIFY_ID.fullmatch(parts[1]):
            kind, ident = parts
            return ('spotify', f'https://open.spotify.com/embed/{kind}/{ident}', f'Spotify {kind}')
    return None


def inline_markup(text: str) -> str:
    chunks = []
    start = 0
    for match in TOKEN.finditer(text):
        chunks.append(escape(text[start:match.start()]))
        if match.group(1) is not None:
            label, url = match.group(1), match.group(2)
            # Explicit URL scheme allowlist; no javascript:, data:, or HTML injection.
            chunks.append(f'<a href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{escape(label)}</a>')
        elif match.group(3) is not None:
            chunks.append(f'<strong>{escape(match.group(3))}</strong>')
        elif match.group(4) is not None:
            chunks.append(f'<em>{escape(match.group(4))}</em>')
        else:
            chunks.append(f'<code>{escape(match.group(5))}</code>')
        start = match.end()
    chunks.append(escape(text[start:]))
    return ''.join(chunks)


def embed_html(data: tuple[str, str, str]) -> str:
    kind, src, title = data
    if kind == 'youtube':
        ratio = 'note-embed-video'
        size = ''
    else:
        ratio = 'note-embed-spotify'
        size = ' height="352"' if '/track/' not in src and '/episode/' not in src else ' height="152"'
    return (f'<div class="note-embed {ratio}">'
            f'<iframe src="{escape(src, quote=True)}" title="{escape(title, quote=True)}" '
            f'loading="lazy" referrerpolicy="strict-origin-when-cross-origin" '
            f'allow="autoplay; encrypted-media; picture-in-picture; fullscreen"{size} allowfullscreen></iframe></div>')


def render_note(body: str) -> str:
    """Escape raw HTML; keep minimal Markdown-like formatting and embeds."""
    lines = str(body or '').replace('\r\n', '\n').replace('\r', '\n').split('\n')
    output = []
    paragraph: list[str] = []
    list_kind: str | None = None

    def flush_paragraph():
        if paragraph:
            output.append('<p>' + '<br>'.join(inline_markup(line) for line in paragraph) + '</p>')
            paragraph.clear()

    def close_list():
        nonlocal list_kind
        if list_kind:
            output.append(f'</{list_kind}>')
            list_kind = None

    for raw in lines:
        line = raw.strip()
        if not line:
            flush_paragraph()
            close_list()
            continue
        embed = embed_for_url(line)
        heading = re.match(r'^(#{1,2})\s+(.+)$', line)
        bullet = re.match(r'^[-*]\s+(.+)$', line)
        number = re.match(r'^\d{1,3}\.\s+(.+)$', line)
        quote = re.match(r'^>\s?(.+)$', line)
        if embed:
            flush_paragraph(); close_list(); output.append(embed_html(embed))
        elif heading:
            flush_paragraph(); close_list()
            tag = 'h2' if len(heading.group(1)) == 1 else 'h3'
            output.append(f'<{tag}>{inline_markup(heading.group(2))}</{tag}>')
        elif bullet or number:
            flush_paragraph()
            kind = 'ul' if bullet else 'ol'
            if kind != list_kind:
                close_list(); output.append(f'<{kind}>'); list_kind = kind
            output.append(f'<li>{inline_markup((bullet or number).group(1))}</li>')
        elif quote:
            flush_paragraph(); close_list(); output.append(f'<blockquote>{inline_markup(quote.group(1))}</blockquote>')
        else:
            close_list(); paragraph.append(line)
    flush_paragraph(); close_list()
    return '<div class="note-body">' + ''.join(output) + '</div>'
