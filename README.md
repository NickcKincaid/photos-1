# Nicholas Kincaid — Photography Portfolio

A lightweight, static photography portfolio with a private GitHub-authenticated editor, Cloudflare R2 photo storage, and a Notes publishing section.

## Public pages

- `/` — projects and cover photographs.
- `/projects/<slug>/` — photo gallery with a full-screen, fit-to-viewport viewer, EXIF information and a bottom-of-project inquiry link.
- `/notes/` — notes, newest published first, with date and time (UTC). Each note also has a permanent `/notes/<slug>/` URL.
- `/inquire/` — direct contact by email.
- A compact site header and copyright/contact footer are shared across public pages.

The public design retains Leelawadee UI (system font, with fallbacks) and text sizes at or below 12px. No website analytics or tracking frameworks are required.

## Private publishing

`/admin/` is accessible only to the configured GitHub owner via signed sessions. **Projects** manages R2 photo uploads, metadata, ordering and deletion. **Notes** creates, edits, drafts, publishes and deletes plain-text notes. Existing OAuth configuration, GitHub publishing token and `PHOTO_BUCKET` R2 binding are reused.

Note drafts are hidden from the public site but saved to GitHub. **If the repository is public, note drafts are not confidential.**

## Hosting

- GitHub holds project and note JSON files and website code. Cloudflare R2 holds published photographs.
- Cloudflare Pages runs `python3 build.py`, output directory `dist`.
- Cloudflare R2 stores new photographs behind the `PHOTO_BUCKET` Pages binding.
- Cloudflare Pages Functions serve images and authenticated editor APIs.

No new accounts or Cloudflare secrets are required by V16. See `ADMIN_SETUP.md` for the existing OAuth setup and `UPGRADE_V16.md` for the safe deployment procedure.

## Development

```sh
python3 build.py
npm test
```

Browser smoke testing requires Chromium/Playwright/Pillow:

```sh
python3 tests/browser_v16.py
```

This repository contains sample-empty `content/` and `media/` directories for clean installs. The distributed code **does not include your live GitHub project records or R2 photographs**; keep independent backups.

## V23 maintenance

Admin photo labels now reflect the current project title and display order. These labels
are suggested **download filenames**, not physical R2 object keys. Changing a title or
reordering photos never moves the stored images. The retired one-time R2 filename
migration interface and old GitHub-image-processing workflow have been removed.

For upgrades, see `UPGRADE_V23.md`.


## V24 — Reliability and publishing tools

- Browser-local autosave and recovery in the Projects and Notes editors (not automatic publication).
- Authenticated, on-demand R2 storage inventory and lightweight metadata export.
- Optional project image selection for social sharing cards.
- Fit-to-screen photograph viewer with optional zoom, pinch, and pan.
- Weekly GitHub Actions backup artifacts (JSON only; photographs are excluded).

See `UPGRADE_V24.md` for installation, privacy considerations and post-deployment checks.
