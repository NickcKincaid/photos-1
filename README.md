# Nicholas Kincaid — Photography Portfolio

Minimal static photo portfolio, built with Python and hosted on Cloudflare Pages.
Photos live in private Cloudflare R2; project and note metadata live in GitHub.
The admin editor at `/admin/` requires owner authentication through GitHub OAuth.

## Public site

- `/`: published projects and their cover photographs.
- `/projects/<slug>/`: project gallery, **Fit All** compact layout, full-screen viewer,
  metadata, and inquiry link. AI-generated alt text is not a visible caption.
- `/notes/`: published notes.
- `/inquire/`: inquiry information.

## Private editor

- Projects: upload to R2, require ISO/aperture/shutter/focal length, order photos,
  set cover and SEO data, save and delete projects.
- Generate missing alt text, regenerate individual/all alt text using Workers AI;
  review text and **Save project** to publish. The Cancel changes button discards
  unsaved editor changes and its local recovery draft; it does not delete R2 uploads.
- Storage & backups: inspect R2 storage, manually download metadata, open Cloudflare Web Analytics, and use a direct link to **actual Workers AI usage** in Cloudflare. No estimates are shown.
- Notes: write and publish notes. Draft project/note metadata committed to a
  public GitHub repo is not confidential.

## Required Cloudflare configuration

Cloudflare Pages build command: `python3 build.py`. Output directory: `dist`.
GitHub OAuth and an R2 binding named `PHOTO_BUCKET` are documented in
[ADMIN_SETUP.md](ADMIN_SETUP.md).

The optional Workers AI integration needs a **Workers AI binding named `AI`**.
The optional legacy deployment API (not shown in the admin interface) still supports
`CF_ACCOUNT_ID`, `CF_PAGES_PROJECT`, and `CF_PAGES_READ_TOKEN` with Pages Read permission.
It is not required for the V35 admin. Redeploy after changing bindings or variables.
Never commit secrets.

## Test locally

```sh
npm test
npm run audit
python3 build.py
```

Browser smoke scripts in `tests/` are historical regression tools and may need
Playwright/Chromium. CI runs Node/Python tests and builds the site.

## Install V35

Use `INSTALL_V35.bat` from the update ZIP to copy only V35 code into your
cloned `photos-1` repository. The installer does not overwrite `content/`, `media/` or `.git`.
For rollout and rollback guidance, see [DEPLOYMENT.md](DEPLOYMENT.md).

**Data safety:** project JSON is not R2 image storage. Uploaded photographs
already in R2 are not included in this repository ZIP. Keep separate original
photo backups. This code cannot verify your live OAuth, R2 or Cloudflare AI
bindings offline.


## V35 editor maintenance

The private editor has native, independently collapsible panels for project details, photo upload, batch edits, AI descriptions, link checks, photo metadata, sharing, notes, and Storage tools. The open/closed state is remembered in the browser tab. Click a panel's heading to toggle it; keyboard Enter/Space also work. Save, Preview, and Cancel are grouped together, while Delete stays separated. The deployment-status widget was removed from the admin UI; Cloudflare Pages continues to deploy automatically after GitHub commits.

Project Details now groups title/description before visibility and homepage position. The old browser-local AI usage counters have been removed, replaced by a direct official Cloudflare Workers AI usage link. No Cloudflare tokens or new API permissions are required.

## V36 quality release

- Newly uploaded R2 images save their pixel dimensions; the browser reserves the correct gallery space with native image width/height and a CSS ratio placeholder. The editor can also learn the dimensions of older R2 images when loaded; they persist the next time that project is explicitly saved.
- Gallery lightbox links use approved descriptions as accessible labels, without displaying them as captions. Touch targets for viewer controls are improved without additional JavaScript.
- The production builder retains stable canonical links, an image sitemap, real Notes modification dates, and `ImageGallery` / `ImageObject` structured data using reviewed photo descriptions. Verify real indexing through Google Search Console; generating a sitemap does not guarantee indexing.
- Download a metadata backup in Storage & backups, then verify it offline with `python3 scripts/verify_metadata_backup.py PATH_TO_BACKUP.json`. This only checks structure and cannot restore deleted images: keep a separate copy of your originals/R2 photos.
- Browser requests, R2 bindings and GitHub OAuth were reviewed locally; production permissions, quota and actual Lighthouse/Core Web Vitals must be checked on the deployed domain.
