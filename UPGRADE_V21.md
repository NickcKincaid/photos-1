# Version 21 — Standardize existing R2 photo filenames

This is a **safe update for an existing V20 photography site**. It does not replace your GitHub project JSON, Notes, or R2 photographs.

## What this does

The V20 uploader already gives new JPEGs a clean filename. V21 lets you move existing R2 photos to the same naming convention from the private editor.

Example:

- Existing image: `media/handmade-watusi-horn-table/handmade-watusi-horn-table-01-00232f36de234e2c905d50cb.jpg`
- New image: `media/handmade-watusi-horn-table/00232f36de234e2c905d50cb/handmade-watusi-horn-table-01.jpg`
- Matching WebP: `.../handmade-watusi-horn-table-01-640.webp`, etc.

The final **filename** is the requested readable name. A unique R2 parent folder is still necessary to avoid collisions when replacing or reordering photos.

The new filenames are assigned from the photo order **at the time you run the migration**. The migration preserves existing `photo_details` (including camera settings), permanent photo IDs, homepage cover position, project blurb, project title, and publication status.

## Install through GitHub Desktop

1. Before updating, confirm your latest GitHub changes are committed and pushed, and keep a backup of the current repository.
2. Extract `nickckincaid_rename_existing_r2_v21.zip`.
3. In GitHub Desktop, choose **Repository → Show in Explorer**.
4. Copy the extracted `functions/`, `static/`, and `tests/` folders into the `photos-1` repository, preserving paths and merging/replacing matching files. You may also copy this instruction file.
5. Check **Changes** to ensure no existing `content/` or `media/` files are being deleted.
6. Enter **Standardize existing R2 photo filenames** in the commit Summary.
7. Click **Commit to main**, then **Push origin**.
8. Wait for the latest Cloudflare Pages production deployment to succeed.

No new secrets, Cloudflare bindings, or R2 buckets are required. Your existing `PHOTO_BUCKET` binding must still be configured.

## Migrate each existing project

1. Sign in to `https://nickckincaid.com/admin/`.
2. Open an existing project that still has old hash-suffixed R2 names.
3. Save or discard any unfinished edits. Reordering must also be saved first.
4. Click **Standardize N old photo filenames** and confirm.
5. The editor copies each photograph (and existing WebP thumbnails) to its clean R2 filename and verifies the new object. **It does not alter GitHub project data during this copying phase.**
6. When all copies are verified, it updates the project JSON with **one GitHub commit**, which triggers a Cloudflare deployment.
7. After the deployment succeeds, visit the public project and check the full-screen viewer, thumbnails, and one direct photo link.
8. Repeat for your other projects. The button disappears once no eligible legacy JPEGs remain in that project.

**Please test with one small project first** before converting an entire collection.

## Safety and limitations

- **Not destructive:** The old R2 objects are intentionally preserved as a rollback and to keep previously shared direct image URLs working. This temporarily uses extra bucket storage. The operation does **not** reclaim storage immediately.
- **Retries are safe:** If copying fails or the project changes while copying, project references remain unchanged. Repeated attempts reuse previously verified copies.
- **No arbitrary file moves:** Only image paths actually referenced by the selected project and marked `storage: r2` are eligible.
- **Supported older key format:** `/media/<slug>/<slug>-01-<24 hex digits>.jpg`. Other filenames are not automatically modified.
- **The numbering is not dynamic:** Reordering photographs later will not rename their files; doing so on every edit would destabilize direct links.
- **Legacy URL compatibility:** Previously shared direct `/media/...` URLs remain accessible from old R2 objects; stable `#photo=` gallery links continue to work because per-photo IDs are preserved.
- **Cleanup later:** After verifying your public site and making a backup, legacy R2 objects may be cleaned up separately. Do not delete them before confirming Cloudflare deployed and your images work. Removing legacy objects will break direct links to those *old image URLs*.
- **Production unverified:** The backend and browser behavior have passed local tests, but this package has not been executed against your real R2 bucket or GitHub OAuth session.

## Tests

Run `npm test` in the full source repository. For the optional Chromium interaction check, run `python3 tests/browser_v21.py` where Playwright and Chromium are installed.

No modifications to your public layout, Notes, OAuth settings, or new-photo upload conventions are needed.
