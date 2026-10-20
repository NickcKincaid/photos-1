## V30 — Thorough maintenance and reliability review (2026-10-20)

This release can be applied over V27 or later. It **includes V28 dashboard improvements,
V28/SEO changes and V29A metadata normalization** in the same update package.

- Upload validation rejects obviously incomplete JPEGs and malformed/truncated WebP containers
  before saving them to R2. Large files still use the existing strict 3 MB request cap.
- Server-side project saves skip redundant R2 HEAD requests for R2 photos that already belong
  to the saved project; newly uploaded objects are checked before publication.
- Project cleanup only considers R2 photos that were actually in the previous project's cover
  or gallery, reducing the chance that obsolete metadata entries trigger unwanted deletion.
- R2 image requests can return a conditional HTTP 304 response when the ETag matches;
  attachment downloads still fetch the original bytes normally.
- The metadata completeness dashboard also flags syntactically invalid exposure values.
- Explicitly discarded local project/Notes drafts no longer prompt for recovery next time.
- After a successful GitHub save, temporary refresh failures are reported as **saved**, not
  as failed commits (for both Projects and Notes).
- Partial R2 storage inventories no longer show a misleading numeric cost estimate.
- Added regression tests for truncated uploads, ETag revalidation, R2 efficiency and
  invalid exposure metadata.

### Known limitations and deployment considerations

- Live Cloudflare Pages, R2, GitHub OAuth and Web Analytics settings cannot be checked by
  the offline test suite. Verify them on your deployment after installation.
- Removing R2 photographs from a project still cleans them up immediately after a successful
  GitHub commit. While Cloudflare rebuilds, the old public HTML could temporarily reference
  the deleted image. A deployment-aware cleanup queue is a future improvement.
- Incomplete or abandoned uploads can leave unused R2 files; V30 does not delete them
  automatically. Back up your original camera photographs separately from R2.
- The editor uses browser-local draft recovery, but binary upload jobs cannot be resumed
  after a browser reload. Google controls when SEO snippets are updated.

## Metadata Formatting & Minimal Homepage — October 2026

- Removed the visible introductory sentence above the homepage photographs; retained the page's SEO title, head description, structured data, and screen-reader heading.
- Camera settings are standardized on blur, during bulk edits, when saving, and in the server API: `35mm · f/8 · 1/250s · ISO 400`.
- Reject invalid values and focus the first problem in the editor. Existing project JSON is not rewritten automatically; older captions display consistently on the next build.
- Avoid keyword stuffing or hidden SEO text. Use meaningful project descriptions, per-photo alt text, titles, and structured data for search discovery.

# Consolidated release notes

## V28 + SEO — Combined editor tools and search visibility (2026-10-20)
- One cumulative install package contains all V28 private-dashboard features and optional Cloudflare Web Analytics CSP compatibility, plus the public search improvements below.
- The homepage now has a more descriptive document title, a focused meta description, and a discreet, visible one-line introduction so search engines have real descriptive content instead of only project titles and the footer.
- Project and Notes summaries are cleaned of Markdown markup and normalized to concise page-specific descriptions; images continue to use existing editor-supplied alt text.
- Structured data identifies the photographer, the website, image galleries, and individual Notes with publication/modification timestamps where known.
- The public sitemap now lists published project images and actual last-modified dates for Notes, never unpublished projects or drafts. The current canonical URLs and robots restrictions remain intact.
- Footer utility text is excluded from Google snippets with data-nosnippet while remaining visible on the website. Public pages allow large image previews.
- New SEO regression tests validate metadata, image sitemap structure, draft exclusion, and schema output. Google ultimately controls its own snippets and re-indexing time.

## V28 — Portfolio editor tools and optional visitor analytics (2026-10-19)
- Project sidebar reports how many photographs have missing focal length, aperture, shutter speed, or ISO, with a shortcut to the first incomplete project. Saved GitHub project JSON remains the source of truth.
- Photo editor adds checkboxes and reversible pre-save batch actions: overwrite one shared camera setting, move selected photos to the start/end, and remove selected photos after confirmation. Nothing is published until Save project.
- Per-project image integrity checker runs read-only HEAD requests for original and stored variant links with a four-request concurrency limit. Shows unavailable image URLs; does not list or delete R2 objects.
- Upload queue continues past individual failures and displays per-file progress, Retry and Dismiss controls. You must resolve failed uploads before saving so they cannot be forgotten. The retry is within the current browser session; it is not an across-restart resumable upload.
- Storage & backups links to Cloudflare Web Analytics; visitor analytics requires one-click activation in the Cloudflare dashboard. The site itself does not store visitor identities or install an analytics database.
- Updated public CSP allowlist for Cloudflare's optional analytics beacon (and reporting endpoint), retaining a restrictive separate admin CSP.
- Added focused unit and mobile/desktop browser regression tests.


## V27 — Required exposure metadata and reliability pass (2026-10-17)
- Focal length, aperture, shutter speed, and ISO are mandatory for **each photograph** whenever a project is saved, including unlisted drafts. The admin editor lists missing fields and focuses the first one; the authenticated save API enforces the same rule.
- Legacy published projects remain unchanged until edited. When an existing project is saved again, missing exposure settings must be completed.
- Avoided a duplicate R2 object-existence lookup during publishing.
- The gallery writes its unavailable-photo message only after an actual image load failure, so text-only readers do not misinterpret hidden initial HTML.
- Improved admin errors for non-JSON API responses and preserved thumbnail-optimization warnings after batch uploads.
- Added API and desktop/mobile editor regression coverage.


This full-source release consolidates the existing minimal portfolio, V13 editor fixes, V14 project deletion, and V15 Cloudflare R2 storage into a clean codebase.

## Improvements in this release

1. **Concurrent edit protection:** Saving an existing project now requires the current GitHub file SHA. Stale browser tabs receive HTTP 409 rather than quietly overwriting newer photographs, metadata, or titles.
2. **Safe project ordering:** Reordering checks all project revisions before creating a commit; the editor then refreshes revision values to prevent subsequent false conflicts.
3. **Uploaded file validation:** Streaming R2 uploads verify actual JPEG or WebP signatures rather than trusting the caller-provided `Content-Type` header alone. The 3 MB streaming cap remains enforced.
4. **Clearer API errors:** GitHub permission/rate-limit failures report an actionable temporary-unavailable response.
5. **Reduced duplicate auth checks:** One authoritative admin route middleware handles page access, while API-specific middleware protects write requests and validates same-origin requests.
6. **Cleaner repository:** Introduced `.gitignore` for build artifacts, editor caches, local secrets, and `_unused` archived image duplicates.
7. **Regression tests:** Included Python build tests and mock R2/GitHub API tests runnable with Node/Python standard libraries.
8. **Browser viewer robustness:** Restricted History API environments no longer prevent the full-screen viewer from closing.
9. **Continuous verification:** A lightweight GitHub Actions workflow runs unit tests and checks static site generation on code changes.
10. **Consolidated docs:** Replaced outdated incremental version guides with a clear deployment, R2, admin setup, and rollback procedure.

## Preserved functionality

- Simple project gallery and compact Leelawadee UI layout (public text no larger than 12px).
- Private browser editor, GitHub OAuth, project creation, reordering, draft preview and delete with confirmation.
- Browser-side resizing and WebP creation, EXIF/copyright metadata handling, R2 photo storage and legacy GitHub-photo migration.
- Full-screen adaptive-color viewer, keyboard and swipe navigation, permanent photo links, gray EXIF captions, inquiry email link, sitemap and Open Graph metadata.

## Known constraints

- This source package cannot include media stored in your private R2 bucket or project changes that occurred later in your live GitHub repository.
- The migration and deletion API depends on live GitHub/R2 permissions and should be verified with a disposable project after deployment.
- Deleting an R2 object immediately after a GitHub commit can produce a short gap before Cloudflare finishes redeploying the new project page.
- Unsaved uploads may leave R2 objects behind, and removing GitHub files does not shrink older Git history. Maintain independent backups.

## V23A
- Notes timestamps are localized in visitor browsers; semantic UTC fallback remains.
- Explicit single-column vertical Notes feed on all screen sizes.
- Combined V23 changes into one safe update.

## V31 — Deployment status, contact sheets and optional AI metadata (2026-10-20)
- Project pages with at least two photos offer an optional Contact sheet toggle: compact square thumbnails on mobile and desktop. It keeps the same photo links, lightbox, original gallery layout, and camera captions when toggled back.
- The private dashboard can check the latest production Cloudflare Pages deployment from a server-only Cloudflare API token with Pages Read permission. Configuration: CF_ACCOUNT_ID, CF_PAGES_PROJECT, CF_PAGES_READ_TOKEN. Unconfigured deployments show an actionable status rather than guessing that the site is live. After a successful project save, the dashboard briefly polls while a deployment is in progress.
- Optional batch generation of **missing** photo descriptions via a Cloudflare Workers AI binding named AI. Requires accepting the selected vision model's license in your Cloudflare account. Images are resized in the browser, then sent to Workers AI only with explicit confirmation. Model calls may be billed; the generated text remains unsaved until the project is saved. Existing descriptions are never overwritten. Results should be reviewed for accuracy.
- Generated descriptions are stored in the existing `photo_details.alt` field and used for HTML image alt attributes, not on-screen photo captions. When no project blurb/description is provided, the project meta description may use the first reviewed photo description as a private metadata fallback.
- New targeted JavaScript/Python regressions cover deployment state mapping, server-only credentials, JPEG request validation, caption sanitization, contact sheet markup, and nonvisible alt descriptions.
- Cloudflare deployment API and Workers AI calls cannot be fully validated without enabling user-specific bindings/secrets and executing a real request after deployment.
