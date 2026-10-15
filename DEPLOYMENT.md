# Deploy and upgrade safely

## Existing website (recommended)

Use the **`nickckincaid_portfolio_code_update.zip`** package. It deliberately excludes `content/` and `media/` so it does not replace your site title, photographs, or projects.

1. Make a backup of your GitHub repository and export original photographs from your devices before major changes.
2. Extract the code-update ZIP; open GitHub Desktop > **Repository > Show in Explorer**.
3. Copy the ZIP *contents* into the repository folder, preserving directories such as `functions/`, `static/`, `.github/`, and `admin-lib/`. Replace files when asked.
4. In GitHub Desktop, inspect **Changes** and make sure no `content/projects/*.json` or `media/*` images are being deleted or replaced.
5. Commit with summary `Consolidate and optimize photography portfolio`, then click **Push origin**.
6. Cloudflare Pages deploys automatically. Check its latest build log and confirm the public gallery and `/admin/` sign-in work.
7. Upload one disposable JPEG and test full-size viewing, responsive thumbnail, project saving, ordering, deletion, and R2 presence before migrating anything else.

If you already have a `dist/` directory tracked by Git, `.gitignore` won't untrack it. Remove it from **Git's index only** (not the source files) through a separate reviewed commit.

## Brand-new repository

Use **`nickckincaid_portfolio_full_source.zip`**. It contains a clean starter `content/site.json`, `content/projects/.gitkeep`, and `media/.gitkeep`, so `python3 build.py` works even with zero projects. These starter files are **not** a backup of your existing content.

Import the files directly at the repository root, then connect Cloudflare Pages with the build settings shown in README. Configure `PHOTO_BUCKET` and all four server-side credentials before attempting private uploads.

## R2 setup

1. In Cloudflare create a private **R2 Standard** bucket, for example `nickckincaid-photos`.
2. On the **Pages** project, create a **Production R2 binding** named exactly `PHOTO_BUCKET` pointing to the bucket.
3. Redeploy to activate the binding. No public bucket domain or R2 API token is required for this architecture.
4. Existing GitHub-backed images keep working. For older projects, use **Copy older photos to R2**, then **Save project**. Verify the site before using **Remove old GitHub copies**.
5. Old Git revisions retain image blobs even after current files are removed. Do not rewrite Git history without independent backups.

## Backout plan

Reverting this code version will restore previous software behavior, **not** move new R2-only photographs back to GitHub. Keep the R2 bucket, binding, project JSON, and access credentials intact while rolling back. Revert the code commit in GitHub and redeploy, and only remove R2 objects after validating no project references them.

## Verification checklist

- Homepage loads without broken image placeholders.
- Opening a project shows correct photos, optional EXIF captions, and inquiry email link.
- Lightbox closes with Close/Escape, navigates with keyboard/swipes, and direct photo links work.
- `/admin/` redirects unauthenticated visitors to GitHub sign-in; protected `/api/admin/*` requests reject unauthorized access.
- Disposable project creates R2 objects but only JSON is added to GitHub.
- Save/reorder from two simultaneously open editor tabs reports a conflict instead of silently overwriting changes.
- GitHub Actions runs without altering R2 object references or duplicating images.
