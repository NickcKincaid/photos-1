# V40 — Automatic Photograph Dimensions & In-Depth Maintenance Audit

Release date: 2026-10-29. Baseline: the user-approved, content-preserving **V39a** repository.

## Summary

V40 is intentionally a small code release following a broad audit. It removes the unneeded local-file-path backup/index feature and replaces the manual photo-dimension workflow with an automatic, guarded metadata backfill. The public gallery design and content files are unchanged.

## Changes shipped

### 1. Automatic intrinsic image dimensions

- New private endpoint: `functions/api/admin/dimensions.js`, accessible only with the existing authenticated admin session and same-origin protections.
- When an older project with missing dimensions is opened in `/admin/`, the editor quietly asks the endpoint to backfill metadata; no **Get Missing Photo Dimensions** button or **Save Project** click is needed.
- The endpoint reads **only bounded prefixes** of original JPEGs already stored in R2 (128 KiB, or up to 512 KiB if needed). It parses JPEG frame headers to get actual pixel dimensions; no pixel decoding, AI, duplicated R2 images, or invented ratios.
- A project is written only if at least one missing dimension is found. The new metadata is committed to the same GitHub project JSON through a file-SHA revision check. An intervening edit produces a conflict rather than overwriting newer content.
- Only `width` and `height` are added to existing `photo_details`. New uploads already include dimensions and continue to work without any change.
- A successful commit triggers the existing Cloudflare Pages build, after which the public site can output correct intrinsic dimensions and reserve space for its loading skeletons.
- The work is **on demand when each project is opened in Admin**, not a blanket site-wide batch job. For existing projects, open each one once after deployment. The admin will attempt each project once per tab session. If R2/GitHub is unavailable, retry on a later visit; normal editing remains usable. Rare JPEGs whose frame marker is beyond the bounded read will remain unchanged.
- Reads and GitHub commits use the existing R2/GitHub infrastructure. There is **no additional permanent R2 storage**, but one-time R2 read operations, GitHub writes and Cloudflare deployments can occur.

### 2. Remove unnecessary original-file-location index

- Removed `scripts/local_photo_index.py`, `scripts/INDEX_LOCAL_PHOTOS.bat`, and their tests/documentation.
- No private path list or CSV is created by this release. The browser and R2 cannot recover an original Windows upload path that was never recorded.
- Existing optional **metadata** JSON export is retained: it protects projects, Notes and site settings; it is not a second photograph copy and stores no originals.

### 3. Faster, bounded repository source audit

- `scripts/audit_project.py` runs JavaScript syntax checks in a limited pool of 4 rather than launching them one by one.
- Each `node --check` has a 12-second deadline and reports a syntax-check error instead of hanging the audit.
- Same reporting semantics as the earlier audit: syntax validation, project data validation, and source feature checks.

### 4. Regression tests

- Added `tests/v40_dimensions.test.mjs` with 6 tests for JPEG parsing, bounded R2 requests, safe metadata persistence, stale revision conflicts, no-op behavior and invalid path rejection.
- Added `tests/test_v40_integrity.py` with 4 checks for automatic UI wiring, removal of local-index tools, authenticated endpoint guards, and preservation of protected Notes and projects.
- Included an optional browser regression script (`tests/browser_v40_dimensions.py`) for environments with working Playwright/Chromium; it was **not validated in this execution environment**, as Chromium hung while creating a page.

## Audit coverage and results

| Area | Result |
|---|---|
| Project and Note data | 12/12 JSON files byte-for-byte identical to V39a; 8 projects and 3 Notes, including unpublished `tbc` |
| Photograph references | 62 existing photo details preserved; dimensions will be captured on live Admin visits, not prefilled by guessing |
| JavaScript tests | 121 passed |
| Python tests | 67 passed |
| Source audit | 0 errors, 0 warnings |
| Production build | Passed; 8 projects and 2 published Notes, 15 generated HTML pages |
| Sitemap and internal URL checks | Existing generated-page tests passed (13 sitemap URLs) |
| SEO structured data | Existing validation suite passed for JSON-LD syntax, canonical URLs and image metadata output |
| Access controls and sessions | Source and unit-test review; live penetration testing not performed |
| Admin image upload/migration | Existing API regression tests pass; live R2 not tested |
| Notes, date display, inquiry address | Existing tests pass; contact remains `contact@nickckincaid.com` |
| Public gallery, Fit All, skeletons | Code and existing regression tests reviewed; full live browser smoke not completed |
| Chromium browser smoke | **Inconclusive**: Chromium process starts but stalls before a page opens in this container |

## Measured local footprint (excluding images)

- Homepage HTML: ~2.6 KB gzip
- Main CSS: ~4.5 KB gzip
- Main browser JS: ~4.9 KB gzip

These are static transfer-size approximations, **not PageSpeed scores**. Do not interpret them as a measured improvement in Core Web Vitals or live network latency.

## Production limitations and watch items

- The code has **not** been tested using the user's live R2 bucket or GitHub API token. After deploying V40, open one project with older photos, then confirm a new GitHub commit named `Record photograph dimensions: <slug>` and a successful Cloudflare build. Repeat on the remaining older projects.
- Google Search Console's historic 404, security warning, and Image Metadata review statuses require verification in Search Console; a local source audit cannot prove their live resolution.
- The site retains its original R2 photo objects. The optional GitHub metadata backup does not back up image bytes; original photos stored on the user's computer remain their independent originals.
- Admin visits trigger at most one dimension backfill attempt per project per tab session; a failed attempt may need a new Admin session or reload.
- No new Cloudflare bindings, tokens, frontend libraries, dependencies, extra public scripts or paid AI calls are required.

## How to publish

1. Back up the existing local `photos-1` directory before replacing it.
2. Extract the push-ready ZIP so the `photos-1/` folder retains its original `.git/` directory.
3. Open it in GitHub Desktop and examine all changes, especially `content/` and `media/` deletions (there should be none).
4. Run `npm test`, `npm run audit`, `npm run build`, and `npm run content-check` where Node.js and Python are available.
5. Commit as `V40 - Automatic photo dimensions and full reliability sweep` and **Push origin**. Don't force-push if the remote has newer commits.
6. After Cloudflare deploys, open each legacy project in the private admin once. Check GitHub and Cloudflare for the dimension metadata commits and resulting deployments; the site will then have accurate skeleton ratios.

## Rollback

Revert the V40 code changes with GitHub Desktop or Git; do not overwrite `content/` with an old snapshot. The additional `width`/`height` fields are backward-compatible and can be left in place if reverting the code.
