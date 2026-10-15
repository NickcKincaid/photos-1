# Nicholas Kincaid — Photography Portfolio

A small, project-based photography website hosted on **Cloudflare Pages**, with a private browser editor at `https://nickckincaid.com/admin/`.

The public pages are prebuilt HTML/CSS/JavaScript. GitHub stores site code and project JSON; Cloudflare R2 stores newly uploaded photographs and responsive WebP images. Old GitHub-stored photos continue working during migration. No public database or frontend framework is required.

**Public design:** Leelawadee UI (with system fallbacks), maximum 12px text, tightly spaced image grids, project titles, small gray camera settings and a subtle inquiry email link. Keyboard and touch photo viewer, shareable photo links, sitemap and social metadata are included.

## Repository layout

```text
.github/workflows/     Legacy-image renaming, photo credit, WebP generation
admin-lib/             Cloudflare server helpers for GitHub and login sessions
content/site.json      Site name and metadata (your live copy is authoritative)
content/projects/      Project records (keep your live content)
functions/             Pages Functions: OAuth, editor API and R2 image delivery
media/                 Older GitHub-hosted photographs (keep your live files)
scripts/               Python image and EXIF processing tools
static/                Public CSS/JS, editor, and optional image-preparation page
tests/                 Build and mocked API tests
build.py               Static site generator
photo_exif.py           JPEG/WebP/PNG camera metadata reader
.pages.yml             Optional Pages CMS editor for the site title only
```

## Deployment

- Cloudflare Pages Git repository: `NickcKincaid/photos-1`, production branch `main`
- Framework preset: **None**
- Build command: `python3 build.py`
- Output directory: `dist`
- Root directory: blank
- Production R2 binding: **`PHOTO_BUCKET`**, pointing to your private photo bucket
- Cloudflare production secrets: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_TOKEN`, `ADMIN_SESSION_SECRET` (32+ random characters)

Set the GitHub OAuth callback URL to `https://nickckincaid.com/api/auth/callback`. Do **not** store credentials in this repository. Detailed instructions: [ADMIN_SETUP.md](ADMIN_SETUP.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Normal publishing

1. Open `/admin/` on your phone or computer and sign in with the authorized GitHub account.
2. Create or edit a project; add photos. The editor resizes a JPEG copy (up to 2800px) and prepares responsive WebP variants locally before uploading to R2. Camera EXIF is preserved when supported and standard GPS tags are scrubbed.
3. Save the project. The project JSON is committed to GitHub; Cloudflare rebuilds. Image blobs are not committed to GitHub.
4. Verify the public project page after deployment. Your original camera files remain on your device; **back them up separately**.

Use the dashboard for managing projects. Pages CMS's `.pages.yml` only exposes the website title. Delete a project in the dashboard only after you have independent copies of the photographs you want to keep.

## Tests

```sh
python3 build.py
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

No install step is necessary for the production website. The tests use Node's built-in test runner and Python's standard `unittest`.

## Notes and limitations

- **Unpublished does not mean confidential.** Anyone with the exact media URL may load an unlisted R2 image, and GitHub history can retain old files.
- Uploaded image files are processed JPEG copies; copyright and other XMP information identify the author but are not a DRM mechanism.
- The public site uses Cloudflare Functions to serve R2 images at `/media/...`. High request volumes consume Functions/R2 allowances; the setup is aimed at a personal portfolio, not large-scale image hosting.
- Uploading but abandoning a project can leave unused R2 files. Inspect the bucket occasionally; do not bulk-delete by filename without checking project references.
- The generator uses the custom domain `nickckincaid.com` for canonical URLs. The session helper also supports an optional `PUBLIC_SITE_ORIGIN` environment variable for future domain changes. Update `build.py`'s `SITE_URL` and GitHub OAuth settings together if migrating domains.
- The ZIP is a **source-code snapshot**, not an export of your live photos, R2 objects, GitHub commit history, or production secrets.
