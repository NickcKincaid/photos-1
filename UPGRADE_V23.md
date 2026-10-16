# V23 — Admin filename labels and cleanup

## Improvements

- Photo names shown in the private editor now match the published Download action, e.g. `handmade-watusi-horn-table-01.jpg`, and update immediately when you rearrange images or edit the project title. R2 keys and photo IDs remain stable.
- Existing project title in the sidebar previews unsaved edits; it is permanently updated only after **Save project**.
- Project preview now displays only focal length, shutter speed, and ISO, matching the public gallery.
- Removed the completed “Standardize old filenames” button, JavaScript migration handler and its authenticated API endpoint.
- Retired unused GitHub-to-R2 migration/purge endpoints and the old GitHub image rename/copyright/thumbnail Actions workflow. These are unnecessary now that photographs are in R2.
- Updated the standalone photo preparation page to link to your private uploader instead of the discontinued Pages CMS flow.

## Install over V22

1. Back up or commit/push your current repository changes first.
2. Extract `nickckincaid_v23_safe_update.zip` into the root of your local `photos-1` repository. Overwrite matching files, **without** deleting `content/` or `media/`.
3. Run `REMOVE_RETIRED_FILES_V23.cmd` from inside the repository folder (Windows). The script checks for `build.py`, asks for permission and removes only the nine obsolete source/test files listed below. If you prefer, delete them manually in File Explorer.
4. In GitHub Desktop review Changes (including removals), commit with `Update editor filenames and remove legacy migrations`, then **Push origin**.
5. Wait for the Cloudflare Pages deployment to succeed. Open the admin and reorder a test project: the name labels should immediately adjust, and the Download filename should agree after saving.

**Retired paths**:

- `.github/workflows/rename-project-photos.yml`
- `functions/api/admin/standardize.js`
- `functions/api/admin/migrate.js`
- `functions/api/admin/purge.js`
- `scripts/rename_project_photos.py`
- `scripts/credit_project_photos.py`
- `scripts/optimize_project_photos.py`
- `tests/standardize.test.mjs`
- `tests/browser_v21.py`

No project JSON, R2 object, Cloudflare secret, or Github history is deleted. The old source files may still exist in history, as usual. If there is an unfinished GitHub photo migration in your repository, do not remove its workflow until it completes.

## Caveats

Display names are calculated on the client; the R2 key itself retains its original name. The public Download action gets the clean filename once the updated project deploys. Old bookmarks to R2 keys continue to work. No live R2 credentials were used in these local tests.
