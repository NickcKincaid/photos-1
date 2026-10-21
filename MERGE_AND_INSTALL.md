# Install the repaired project and finish the GitHub Desktop merge

**This is the complete cleaned source tree from the ZIP you uploaded on
2026-10-21. It has no `.git` directory and does not contain R2 image objects.**

## Recommended Windows installation (existing repo, merge still open)

1. Keep GitHub Desktop open and **do not abort the merge**. In GitHub Desktop,
   choose **Repository -> Show in Explorer** and note the full `photos-1`
   directory path (it contains `build.py` and `.git`). Back up this entire
   existing directory to another safe location first.
2. Extract `nickckincaid_photos_clean_merged.zip` to a NEW folder. Do not
   extract it over your GitHub working directory.
3. Double-click `INSTALL_FIXED_PROJECT.bat` in the extracted ZIP's top folder.
   Paste the path to the existing `photos-1` folder from step 1. The installer
   checks the folder and asks for confirmation before changing anything.
4. The installer copies the fixed **source** files and deletes only the named,
   obsolete installers/release notes from the existing repository. It never
   deletes `.git` or `content/`, never touches R2, and does not commit or push.
   It preserves actual `content/` project/notes JSON and `media/`
   content; it only normalizes line endings on metadata files whose text is
   otherwise **identical** to the uploaded snapshot.
5. Return to GitHub Desktop. Its merge dialog may still list four conflicts
   until their *index state* is explicitly resolved. **Do not choose** an
   outdated single-side conflict option after installing the repaired files.
   If **Mark as resolved** is offered on each conflicted file, use it, then
   **Continue merge**. The obsolete `README-FIRST.txt` was intentionally
   removed; mark it resolved as deleted.
6. If GitHub Desktop will not allow resolution, choose **Repository -> Open in
   Terminal** (or your installed Git Bash) and run:

   ```sh
   git add -A
   git status
   git commit --no-edit
   ```

   `git add -A` resolves index conflicts using the repaired working files and
   stages the deliberate deletions. Only run these commands after installing
   the archive and reviewing `git status`. `git commit --no-edit` completes
   your currently pending merge; it does **not** push.
7. Use GitHub Desktop to inspect the resulting diff/merge commit, then click
   **Push origin**. Cloudflare Pages will deploy `main` as normal.

**Important:** The ZIP's `photos-1/content/` folder is a snapshot of the JSON
that was present when you uploaded the project. It is provided for backup and
fresh installs. The recommended installer intentionally doesn't replace live
metadata or media in your existing checkout. If there have been additional
web-admin saves or uploads, do **not** manually overwrite those folders with
an older snapshot.

## Files intentionally removed from the repository

- `Apply-V32.bat`, `Apply-V32.ps1`, `Apply-V33.bat`, `Apply-V33.ps1`:
  one-time overlay patch installers (changes are now integrated in source).
- `Audit-V32.bat`, `scripts/v32_audit.py`: obsolete V32 audit entry point,
  replaced with `npm run audit` / `scripts/audit_project.py`.
- `README-FIRST.txt`, `V32_AUDIT_AND_ROLLOUT.md`, `V33_CHANGELOG.md`,
  `AUDIT_REPORT.md`: redundant or outdated release guides, consolidated in
  `README.md`, `CHANGELOG.md`, `DEPLOYMENT.md`, and this file.
- `SETUP_R2_V15.md`: stale legacy R2 setup guide. Current setup is in
  `ADMIN_SETUP.md` and `DEPLOYMENT.md`.

No currently referenced website, API, project, note, image, or regression-test
files were removed. `.git`, caches, `node_modules` and generated `dist/` output
are excluded from the downloadable ZIP but **are not deleted from your PC**.

## Tests run on the provided source

- `npm test`: 95 Node and 28 Python tests passed.
- `npm run audit`: zero errors and zero warnings.
- `python3 build.py`: built all eight projects and two published notes.
- `python3 tests/browser_smoke.py`: project viewer, desktop and mobile checks
  passed in local headless Chromium.

Live GitHub OAuth, Cloudflare Pages settings, AI model inference, private R2,
Web Analytics and deployment-status credentials were **not** available to test.
After deploying, hard-refresh `/admin/`, check Storage/deployment status, then
try a single photograph's AI regeneration and Save project. Remember AI
usage counters on the Storage tab are browser-local, not billable neurons.
