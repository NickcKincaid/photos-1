# Version 13 — code review and regression audit

Audited the V12 source package from this conversation, including the V11 uploader/auth architecture. Not a remote audit of GitHub's latest `main` nor a production penetration test.

## Fixed

1. **Saved-project state bug:** After saving, the editor was still locked while refreshing and couldn't select the newly saved project. A second save could attempt to create the same project again. Rehydration now explicitly bypasses the temporary lock, then restores enabled buttons.
2. **Disabled controls:** Reordering arrows could stay disabled after a successful publish because they were rendered under the save lock. Re-rendered after unlocking.
3. **Project-order conflict:** A pending homepage reorder was silently discarded when saving a project. Saving a project now waits for the separate order save; order saves do not discard staged photo edits.
4. **Unstable individual photo links:** V12's photo IDs were a hash of image bytes. Copyright/EXIF updates changed the hash, invalidating previously shared links. Photos now carry persistent 24-character IDs in project JSON. The renaming workflow migrates existing photos, retains old content-hash aliases at migration time, and preserves IDs through renaming/reordering and metadata changes.
5. **Stale photo metadata:** Photo deletion plus numerical filename reuse could attach old image IDs/metadata to a different photo. The workflow prunes obsolete metadata entries before renumbering.
6. **OAuth custom domain:** The V12 source still had `https://photos-1.pages.dev` hardcoded in its authentication module. It now defaults to `https://nickckincaid.com`, checks the canonical host for sign-in/callback and supports a safe `PUBLIC_SITE_ORIGIN` override for future migrations.
7. **Missing media references:** A missing cover could produce a broken thumbnail. The static build now warns and chooses a valid gallery image when possible, or omits the unusable project rather than displaying a broken image.
8. **Mobile upload memory:** Prepared full-size JPEGs were retained as editor previews. Upload previews are now 360px WebP thumbnails (with fallback) so editing large batches uses less phone memory.
9. **Mobile sign-out:** The editor's responsive CSS hid the sign-out link on narrow screens. It is visible again.
10. **Stale share feedback:** The viewer's "Copied" label did not reset when changing photos. It now resets on navigation.
11. **Outdated documentation:** Updated GitHub username, custom domain, and credential setup instructions.

## Local tests completed

- Empty portfolio build and Python/Node syntax checks.
- Project migration with four sample JPEGs: cover ordering, photo IDs, legacy aliases, idempotence, removed-middle-photo reassignment, preserved metadata IDs, and fallback after a missing file.
- Pillow WebP variant generation and idempotent manifest creation; responsive `<img srcset>` markup.
- Browser simulation: editor create/save/reopen/edit, homepage reorder + save conflict, preview rendering, viewer open/close, Escape, arrows, simulated swipe and deep-link URL updates.
- Auth origin validation, same-origin checks, and simulated GitHub atomic project save including ID persistence.
- Browser-side 360px preview generation.

## Limitations / things to test on production

- No access to your live Cloudflare/GitHub settings, credentials, or actual deployment logs. Verify successful build, OAuth redirect, a small real upload, GitHub Action completion, EXIF, and the photo link after deployment.
- Existing `?photo=<hash>` links remain compatible **only** if the migration runs before that image is changed again. URLs already invalidated by previous recoding can't be reconstructed automatically.
- Public GitHub repository photos are publicly retrievable, including unlisted draft images.
- Resized website JPEGs are not a replacement for your full-resolution originals. Keep independent backups.
- The repository's `media/_unused` archive of displaced numbered photographs can grow over time; periodically review it rather than deleting it blindly.
- Original GitHub publishing credentials have an expiration date and must be rotated when due.
