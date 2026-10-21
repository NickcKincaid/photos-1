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
- Storage & backups: inspect R2 storage, manually download metadata, open Cloudflare Web Analytics, and see browser-local AI
  usage counters. Browser-local counts are **not** Cloudflare billing or neurons.
- Notes: write and publish notes. Draft project/note metadata committed to a
  public GitHub repo is not confidential.

## Required Cloudflare configuration

Cloudflare Pages build command: `python3 build.py`. Output directory: `dist`.
GitHub OAuth and an R2 binding named `PHOTO_BUCKET` are documented in
[ADMIN_SETUP.md](ADMIN_SETUP.md).

The optional Workers AI integration needs a **Workers AI binding named `AI`**.
The optional legacy deployment API (not shown in the admin interface) still supports
`CF_ACCOUNT_ID`, `CF_PAGES_PROJECT`, and `CF_PAGES_READ_TOKEN` with Pages Read permission.
It is not required for the V34 admin. Redeploy after changing bindings or variables.
Never commit secrets.

## Test locally

```sh
npm test
npm run audit
python3 build.py
```

Browser smoke scripts in `tests/` are historical regression tools and may need
Playwright/Chromium. CI runs Node/Python tests and builds the site.

## Install V34

Use `INSTALL_V34.bat` from the update ZIP to copy only V34 code into your
cloned `photos-1` repository. The installer does not overwrite `content/`, `media/` or `.git`.
For rollout and rollback guidance, see [DEPLOYMENT.md](DEPLOYMENT.md).

**Data safety:** project JSON is not R2 image storage. Uploaded photographs
already in R2 are not included in this repository ZIP. Keep separate original
photo backups. This code cannot verify your live OAuth, R2 or Cloudflare AI
bindings offline.


## V34 editor maintenance

The private editor has native, independently collapsible panels for project details, photo upload, batch edits, AI descriptions, link checks, photo metadata, sharing, notes, and Storage tools. The open/closed state is remembered in the browser tab. Click a panel's heading to toggle it; keyboard Enter/Space also work. Save, Preview, and Cancel are grouped together, while Delete stays separated. The deployment-status widget was removed from the admin UI; Cloudflare Pages continues to deploy automatically after GitHub commits.

The `admin-ui.js` module displays browser-local AI request counts under **Storage & backups → Photo description AI usage**. Official Cloudflare neuron usage remains available in the Cloudflare dashboard.
