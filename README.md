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
- Storage & backups: inspect R2 storage, manually download metadata, check Pages
  deployment status, open Cloudflare Web Analytics, and see browser-local AI
  usage counters. Browser-local counts are **not** Cloudflare billing or neurons.
- Notes: write and publish notes. Draft project/note metadata committed to a
  public GitHub repo is not confidential.

## Required Cloudflare configuration

Cloudflare Pages build command: `python3 build.py`. Output directory: `dist`.
GitHub OAuth and an R2 binding named `PHOTO_BUCKET` are documented in
[ADMIN_SETUP.md](ADMIN_SETUP.md).

The optional Workers AI integration needs a **Workers AI binding named `AI`**.
Deployment status needs server-only `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT`, and
`CF_PAGES_READ_TOKEN` (Cloudflare Pages Read permission). Redeploy after changing
Pages bindings or environment variables. Never commit secrets.

## Test locally

```sh
npm test
npm run audit
python3 build.py
```

Browser smoke scripts in `tests/` are historical regression tools and may need
Playwright/Chromium. CI runs Node/Python tests and builds the site.

## Merge and install

The **cleaned source archive** does not contain `.git`, secrets, caches, or
compiled output. Merge/install instructions are in `MERGE_AND_INSTALL.md`.
For rollout and rollback guidance, see [DEPLOYMENT.md](DEPLOYMENT.md).

**Data safety:** project JSON is not R2 image storage. Uploaded photographs
already in R2 are not included in this repository ZIP. Keep separate original
photo backups. This code cannot verify your live OAuth, R2 or Cloudflare AI
bindings offline.
