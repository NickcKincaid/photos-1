# Consolidated release notes

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
