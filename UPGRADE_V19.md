# V19 — Refined photo viewer + compact EXIF

This is a **code-only safe update** for the photography site after V18.

## Changes

- Replaces the full-frame photograph-color background with an understated charcoal viewer and a lightly desaturated, low-opacity ambient tint derived from each photo.
- Keeps image aspect ratio and fits the entire photo inside the desktop/mobile viewport.
- Adds a quiet project title to the viewer top bar, alongside Close, previous/next navigation, photo count and Copy link.
- Displays **only focal length, shutter speed, and ISO**, in that order, both beneath gallery images and in the viewer. The remaining EXIF data is not deleted from the photograph or project records.
- Preserves V18 optional project blurbs, Notes, the private admin, R2 storage, and stable photo links.

## Install

1. Back up your repository (or confirm that your existing changes are pushed).
2. Extract this ZIP.
3. Open **GitHub Desktop → Repository → Show in Explorer**.
4. Copy `build.py` and `static/` from the extracted folder into the root of your `photos-1` repository. Merge/replace the matching files.
5. In GitHub Desktop, commit with `Refine full-screen viewer and simplify photo metadata` and **Push origin**.
6. Wait for the new Cloudflare Pages deployment to complete, then hard-refresh a project page and click an image.

No environment variables, R2 bucket settings, OAuth credentials, or GitHub Actions configuration need to change.

## Files updated

- `build.py` — only the public metadata formatter and the viewer's project title.
- `static/style.css` — unified low-key viewer styling, responsive controls.
- `static/site.js` — restrained image-color sampling and photo-load fade-in.
- `tests/test_site.py` — regression test for the three-field metadata output.

## Verification

Local Python and Node test suites passed; desktop and mobile Chromium viewer interactions passed using locally rendered project fixtures. Production behavior should be verified after Cloudflare redeploys. No photographs or live project records are included in this archive.
