# V23B — Aperture in photo information

Adds **aperture** to the small, muted photo-information line on project pages, in the full-screen viewer, and in the private admin project preview. The order is:

`120 mm · f/8 · 1/400 s · ISO 220`

Both `8` and `f/8` are accepted for aperture without duplicating the `f/` prefix. When a field is unavailable, it is omitted (no placeholder). Camera and lens remain hidden.

## Install

1. Start from V23A, then extract this patch.
2. Copy `build.py` and `static/admin.js` into your cloned `photos-1` repository, preserving the `static` folder.
3. Optionally copy the updated tests and this guide.
4. In GitHub Desktop commit `Show aperture in photo metadata`, then **Push origin**.
5. After Cloudflare finishes deploying, refresh a project page and the private project preview.

This patch contains no photographs, project JSON, or secrets. R2 storage and the Notes system are unchanged.

## Tests

Run `npm test` and `python3 build.py` in the project root. Browser smoke tests are `tests/browser_v19.py` and `tests/browser_v23.py` when Playwright Chromium is available.
