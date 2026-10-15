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

- GitHub holds project and note JSON files, site code and legacy photo files.
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
