# Code review and validation report

Scope: consolidated minimal portfolio, private browser dashboard, GitHub OAuth, GitHub project commits, Cloudflare Pages Functions, R2 upload/delivery, gallery image processing, SEO, and legacy photo migration.

## Issues corrected in this release

| Area | Finding | Correction |
| --- | --- | --- |
| Project editor | A second open tab could overwrite a more recent project save. | Require the current GitHub blob SHA when saving; reject mismatches with HTTP 409. |
| Homepage ordering | Reordering could overwrite another tab's latest project edits, or leave stale revision IDs. | Compare all project revisions before commit and refresh those IDs afterward. |
| Image uploads | Declaring `image/jpeg` or `image/webp` was enough for an upload even when bytes were not that format. | Validate JPEG/WebP signatures while streaming before R2 persistence. |
| API errors | GitHub rate-limit and access failures appeared as generic errors. | Return clearer temporary-unavailable errors for 403/429. |
| Admin protection | The same `/admin/*` request was verified by two middleware layers. | Keep a single root access check and an API-specific same-origin check. |
| Photo viewer | Restricted History API contexts could interrupt close/navigation cleanup. | Gracefully degrade URL updates in embedded preview contexts. |
| Repository growth | Generated assets, local caches and displaced photo archive copies could be accidentally committed. | Add `.gitignore`; pre-existing tracked files require a separate reviewed cleanup. |
| Maintainability | Several older patch/setup guides contradicted the R2 architecture. | Replace them with current README, deployment, admin, and backup/migration instructions. |
| Regression prevention | No consolidated lightweight test suite accompanied the full source. | Add Python and Node API tests and an automated GitHub Actions check on code changes. |

## Tests run in this environment

- Static build from an empty repository: **passed**.
- Static build with a published project and unlisted draft, metadata/alt text escaping, canonical and sitemap content: **passed**.
- Rejecting unsafe photo URL references: **passed**.
- Mock R2 JPEG upload and invalid JPEG/WebP byte rejection: **passed**.
- Simulated GitHub project save with current/stale revisions and project order conflicts: **passed**.
- R2 image serving and invalid file paths: **passed**.
- Chromium browser smoke test using in-memory HTML: project rendering, EXIF caption, viewer open/close and mobile overflow: **passed**.
- ZIP integrity and completely fresh ZIP extraction/build: **passed**.

## Operational limitations that still apply

1. **Production integration not tested here.** The real GitHub token, OAuth callback, R2 bucket binding, GitHub Action execution, and Cloudflare deployment require verification in the owner's account.
2. **R2 orphan risk.** Uploading a photo and navigating away before saving may leave an object not referenced by any project; inspect the bucket and reconcile periodically.
3. **Old Git history.** Deleting images from the current branch doesn't erase their old versions in commit history, and may not immediately reclaim repository storage.
4. **Short deployment gap.** Removing a photo/project can delete a live R2 object before Cloudflare publishes the new static page, causing a temporary broken link during deployment.
5. **Drafts aren't confidential.** The media function exposes valid image URLs even for unlisted projects; never use the upload dashboard for secret material.
6. **Photo originals aren't in this package.** The ZIP contains project code and starter data, not live GitHub project JSON changed after this release, original full-resolution photographs, remote R2 objects, or encrypted credentials.
7. **Legacy migration variants.** Moving older GitHub photographs to R2 does not necessarily recreate new smaller R2 WebP variants. Existing static thumbnails can still be used when present.

**Safer production rollout:** install the code-only ZIP, verify homepage and authentication, create and delete one disposable project, and migrate a single existing project before changing a large collection.
