# V23 audit and changes

This review started from the assembled V22 source tree. No live access to Cloudflare, R2, or GitHub was available, so integration with those accounts is not certified.

## Confirmed issues fixed

1. Admin photo-row labels showed the original R2 filename while public downloads correctly used the current order. They now use the same title-and-order naming rule; stored R2 keys are unchanged.
2. Sidebar project title could appear stale while an edit was in progress; the active project now previews the new title with an Unsaved changes label.
3. An initial implementation rerendered all photo editor fields on every title keystroke. Updated to change only labels to avoid unnecessary DOM and image work on phones.
4. One-time filename migration controls and the associated backend were still present after migration was completed. Retired.
5. Old GitHub photo-processing workflow and legacy migration/purge endpoints were still included despite R2 being the active store. Retired.
6. The standalone photo-preparation instructions still told visitors to use Pages CMS. Corrected to reference the authenticated editor.
7. The admin preview still showed camera model, lens and aperture. It now shows only focal length, shutter speed, and ISO, matching the public pages.
8. A processing comment still referenced the obsolete CMS upload limit; corrected to the R2 3 MB upload limit.

## Tests

- 31 JavaScript API/unit tests passed.
- 15 Python site/unit tests passed.
- Chromium admin smoke checks passed on 1280px and 390px viewports, including reorder, new titles, viewer-preview EXIF, overflow, and retired control.
- `python3 build.py` succeeded with an empty project collection.

## Risks intentionally unchanged

- R2 upload precedes the GitHub project commit. If a save is abandoned or fails, unreferenced R2 objects may remain. Automatic garbage collection would require an inventory process and is outside this cleanup update.
- GitHub repository history retains previous project JSON revisions. R2 legacy duplicates from old migrations are not removed by this patch.
- Existing photo share URLs, stable IDs, unpublished project behavior, and OAuth credentials are unchanged.
- The standalone `/prepare/` tool still exists for offline use but is no longer needed for normal publishing.

## Deployment

The safe ZIP overwrites changed files only. To actually delete retired routes and workflow files from the existing repository, run the included Windows cleanup script (after inspecting it), or delete the exact nine paths listed in UPGRADE_V23.md. Verify GitHub Desktop shows the removals before committing.
