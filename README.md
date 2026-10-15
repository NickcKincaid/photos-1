# Photography portfolio — consolidated V11 update

Preserves the minimal 12px Leelawadee UI layout, project galleries, gray photo EXIF,
photo viewer, and email inquiry links. Adds an authenticated mobile publishing dashboard.

**Read `ADMIN_SETUP.md` before enabling the private dashboard.**

This ZIP is designed to upload directly into your existing
`NickKincaid/photos-1` GitHub repository, on `main`. Extract and upload the
CONTENTS of the package (not the ZIP itself). Preserve all nested folder paths.
The ZIP contains no project content or photo media, so it will not overwrite them.
It can replace earlier V7/V8/V9/V10 website code in one upload.

Cloudflare Pages build: `python3 build.py` → `dist`.

## Changes from V10

- Root Cloudflare Pages authorization middleware + explicit Function routes.
- CSS security policy fixed for local blob previews.
- Browser-side Base64 encoding, stream relay to GitHub, avoiding expensive server conversion.
- Bounded size for JSON saves and streamed uploads.
- Unsaved-edits warnings and mobile HEIC browser decoding fallback.
- Project order 0 now correctly sorts first in the editor.
- Project renaming safely archives removed middle photographs without collision.
- Archive folders excluded from static site output.
- Content-hashed photo URLs to avoid showing cached photos after reordering.
- Legacy prepare page now removes common GPS EXIF tags.
- CMS compatibility, credit metadata, and existing design retained.

The web UI marks drafts as *not listed* rather than suggesting they are private.
A public GitHub repository's history is public even for unlisted projects.
