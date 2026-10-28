# V37 — Comprehensive Quality and Reliability Sweep

## Provenance
Assembled from the V36a complete source, V36b admin/time patch, V36c Google Image Metadata patch, and V36d bug-sweep patch supplied earlier in this conversation. The current deployed GitHub commit was not available for direct inspection; V37 must be reviewed against your local changes.

## Changes (cumulative)
- Includes all three V36d fixes: OAuth deadline; duplicate R2 paths prevented on save; R2 storage counts exclude generated Open Graph sharing cards.
- Exports metadata backups from one immutable GitHub commit, avoiding mixed-version snapshots when a project or note is edited during download. Adds `sourceCommit` to the export.
- Existing metadata backups remain supported by the read-only verification tool; new backups verify their source-commit SHA.
- Adds a 90-second deadline to admin project operations, and 45 seconds to Notes operations, with explicit messages asking users to check GitHub before retrying after a timeout.
- Adds a 120-second timeout to XHR photo uploads so a stalled connection does not freeze the queue indefinitely.
- Extends the metadata-download deadline to 90 seconds for a large project/notes collection; backups now make one additional GitHub reference lookup.
- Adds regression tests for version-pinned exports, invalid GitHub reference responses, and client network deadlines.

## Preserved
- Project and Notes content JSON, photo EXIF/exposure metadata, existing alt text, SEO and image JSON-LD, social-sharing 1200x630 crops, R2 object keys and legacy media routing.
- Fit All, skeleton loading, accessible gallery navigation, collage/fullsize photo viewer, admin design, and website-last-updated browser-local time.
- No new NPM or Python runtime dependencies; no new Cloudflare environment variables.

## Local verification
- Node JavaScript unit tests: 110 passed.
- Python unittest suite: 50 passed.
- Source syntax and metadata audit: 0 errors, 0 warnings.
- Built eight projects and two notes. 15 generated HTML pages: 80 images, 11 valid JSON-LD objects, 0 invalid image alt attributes, 0 broken internal links found by local check.
- Chromium/Playwright checks: V34 admin, V35b skeletons, V36 gallery, V36b three time zones and mobile layout all passed.

## Installation safeguards
- Run `INSTALL_V37.bat` inside the extracted patch; it asks for the existing local `photos-1` folder containing `.git`.
- Preflight compares code files using normalized LF/CRLF text and accepts known V36c or V36d code only. It does not require any changelog version text.
- If an unexpected local code edit is found, it stops before changing anything. Request a merge with your latest ZIP rather than overriding the edit.
- Backups of any replaced files go into a timestamped folder beside the repository before installation.
- The installer neither commits nor pushes. Review all changes in GitHub Desktop before publishing.
- The V37 update includes only source/tests. It does not write to `content/`, `media/`, credentials, or `.git`.

## Limitations
Not verified against live Cloudflare Pages, R2, Workers AI, actual Google index coverage, Chrome Safe Browsing, or Windows PowerShell runtime. Existing reports of historical 404 URLs or Search Console notices cannot be resolved by a code-only regression sweep without the specific affected URLs.
