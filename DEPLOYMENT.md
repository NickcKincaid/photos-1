# Deploy and roll back the photography website

1. Back up your full local repository (including `.git`) and your original camera
   photographs. Download an admin metadata backup if desired; this does not
   export R2 image bytes.
2. Extract the V34 **update** ZIP outside your repository, then run
   `INSTALL_V34.bat` to copy the changed source files. If GitHub Desktop is
   still showing a merge conflict, resolve it before installing.
3. Review staged changes, particularly `content/` and `media/`, in GitHub
   Desktop before committing. The replacement archive keeps your existing
   project and note metadata; do not replace them with old sample data.
4. Run `npm test`, `npm run audit`, and `python3 build.py` if Node/Python are
   installed. GitHub Actions also tests code pushes.
5. Push `main`. Cloudflare Pages builds with `python3 build.py` and deploys
   `dist`. Check the build log for success before testing live pages.
6. Verify homepage, one multi-photo gallery's Fit All button, the photo viewer,
   admin OAuth, project editing/save, Cancel changes, AI regenerate-one, and
   Storage usage and backups.

## Cloudflare settings

- Production R2 binding: `PHOTO_BUCKET`.
- Production Workers AI binding: `AI` (optional, for generated alt text).
- The legacy deployment API is retained for compatibility but is not called by
  the V34 admin; its token settings are not required for the editor.
- Required OAuth credentials and publishing token: see `ADMIN_SETUP.md`.

## Rollback

Revert the relevant code commit, push, and allow Cloudflare to redeploy.
**Do not** delete the R2 bucket or reset secrets to roll back UI/code changes.
Git history is not a substitute for backups of R2 image originals. Old public
pages may temporarily refer to deleted R2 objects while a new site deploys.
