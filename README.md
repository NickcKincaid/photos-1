# Nicholas Kincaid — Photography Portfolio

A lightweight, static photography portfolio built with Python and hosted on Cloudflare Pages. The public website is [nickckincaid.com](https://nickckincaid.com). Project/Notes metadata is stored in GitHub; uploaded photographs are stored separately in Cloudflare R2.

## Site features

- Public gallery, **Fit All** grid, viewer, photo metadata, skeleton placeholders and separate social-sharing crop.
- New photographs store their dimensions automatically. Previously uploaded R2 JPEGs are measured quietly, one project at a time, when opened in Admin; the resulting metadata is saved to GitHub without a manual Save Project action.
- Notes, including optional titles, date-display choices and legacy-URL redirects.
- Private `/admin/` dashboard, protected by GitHub OAuth, for projects, Notes, R2 uploads, accessibility descriptions and metadata backups.
- Public `/inquire/` contact page using `contact@nickckincaid.com` (configure email forwarding separately).

## Repository structure

| Directory / file | Purpose |
| --- | --- |
| `build.py`, `note_format.py`, `photo_exif.py` | Static-site generation and content processing |
| `content/` | Project, Notes and site-settings JSON — **keep** |
| `functions/` | Cloudflare Pages Functions: admin, OAuth, media and project routes |
| `admin-lib/` | Shared admin/API helpers |
| `static/` | Lightweight CSS, browser JavaScript, admin UI and icons |
| `media/` | Legacy tracked images/optimized manifest (current R2 photos are external) |
| `scripts/` | Image processing, source audit and backup validation tools |
| `tests/` | Node, Python and historical browser regression tests |
| `.github/workflows/` | Tests, metadata backups and media-processing automation |
| `docs/` | [Admin setup](docs/ADMIN_SETUP.md) and [deployment/rollback](docs/DEPLOYMENT.md) |
| `CHANGELOG.md` | Historical changes and release notes |

## Run locally

Requires Python 3 and Node.js for tests. The static build uses the Python standard library; `npm test` uses Node's built-in test runner.

```sh
npm test
npm run audit
npm run build
npm run content-check
```

The build generates **`dist/`**. This output is disposable and ignored by Git; Cloudflare recreates it on deployment. Historical browser tests may require Chromium/Playwright and are not part of the default test command.

## Publish with GitHub Desktop

1. Open the `photos-1` directory (containing `.git`) in GitHub Desktop, select `main`, and review the changes. **Verify that no `content/` or `media/` files were deleted unexpectedly.**
2. Run `npm run content-check` to catch uncommitted content/media deletion. For changes **already committed**, run `python3 scripts/check_content_integrity.py --base-ref HEAD^` (or compare against a trusted previous ZIP with `--compare-zip`). The CI workflow also checks deletions across the pushed commits; because it runs after pushing, inspect GitHub Desktop before publishing to Cloudflare.
3. Confirm the Cloudflare deployment succeeded, then spot-check the gallery, Notes and `/admin/`.

**Do not delete** `.git`, `content/` or `media/`. This release uses the provided `photos-1(2).zip` as the authoritative content source and does not recreate deleted Notes or projects from older Git history. Do not commit local secrets or image backups into this repository. GitHub repository copies do **not** back up photographs stored in Cloudflare R2. For setup and rollback, see [deployment guide](docs/DEPLOYMENT.md).

## Photo dimensions and backups

- A one-time, authenticated Admin request reads only a small prefix of each older R2 JPEG to determine its actual dimensions. It writes **only missing `width`/`height` fields** to the same project JSON file, with a GitHub revision check. After Cloudflare rebuilds, the correct aspect ratios are available before the photos finish loading. Open each older project in Admin once to start its backfill.
- No additional photograph copies are created. The V39a experimental local-original-path scanner and its CSV inventory have been removed; browsers cannot recover an original Windows path from R2.
- The existing optional metadata export remains for recovery of **project/Notes/settings JSON**. It does **not** duplicate R2 photographs, and is distinct from the discontinued local file-path index.

## Configuration and limits

Cloudflare Pages: build command `python3 build.py`, output folder `dist`. Existing R2 binding `PHOTO_BUCKET`; optional Workers AI binding `AI`. See [admin setup](docs/ADMIN_SETUP.md) for OAuth/secrets. Keep all API tokens out of Git. Production OAuth, R2, Workers AI and Google indexing require live verification; tests alone cannot confirm those services.
