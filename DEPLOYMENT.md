# Deploy and roll back the photography website

1. Back up your full local repository (including `.git`) and your original camera
   photographs. Download an admin metadata backup if desired; this does not
   export R2 image bytes.
2. Follow `MERGE_AND_INSTALL.md` if GitHub Desktop currently shows an
   unresolved merge. Do not copy the ZIP's root folder into the repo as a nested
   `photos-1/photos-1` directory.
3. Review staged changes, particularly `content/` and `media/`, in GitHub
   Desktop before committing. The replacement archive keeps your existing
   project and note metadata; do not replace them with old sample data.
4. Run `npm test`, `npm run audit`, and `python3 build.py` if Node/Python are
   installed. GitHub Actions also tests code pushes.
5. Push `main`. Cloudflare Pages builds with `python3 build.py` and deploys
   `dist`. Check the build log for success before testing live pages.
6. Verify homepage, one multi-photo gallery's Fit All button, the photo viewer,
   admin OAuth, project editing/save, Cancel changes, AI regenerate-one, and
   Storage/deployment status.

## Cloudflare settings

- Production R2 binding: `PHOTO_BUCKET`.
- Production Workers AI binding: `AI` (optional, for generated alt text).
- Deployment status: `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT`, and secret
  `CF_PAGES_READ_TOKEN` with Pages Read permission.
- Required OAuth credentials and publishing token: see `ADMIN_SETUP.md`.

## Rollback

Revert the relevant code commit, push, and allow Cloudflare to redeploy.
**Do not** delete the R2 bucket or reset secrets to roll back UI/code changes.
Git history is not a substitute for backups of R2 image originals. Old public
pages may temporarily refer to deleted R2 objects while a new site deploys.
