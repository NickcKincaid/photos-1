# Deployment and rollback

This repository is a GitHub-connected Cloudflare Pages photography site. The production branch is `main`.

## Publish a change

1. Back up the local repository and preserve the original camera files separately from Cloudflare R2. The `content/` folder contains metadata only, **not** the original R2 photograph bytes.
2. Open the `photos-1` folder in GitHub Desktop. Verify that the current branch is `main` and the changes are what you intended. Do not delete or replace `.git`.
3. Run `npm test`, `npm run audit`, and `npm run build` locally if Node and Python are installed. GitHub Actions validates pushed changes as well.
4. Review changes to `content/`, `media/` and `.github/` with particular care. Commit the verified changes and click **Push origin**.
5. Cloudflare Pages builds `python3 build.py` and publishes `dist/`. Wait for the actual Cloudflare deployment to succeed, then check the public home, one multi-photo project, Fit All, note URLs and the private admin dashboard.
6. Check GitHub OAuth, editing and saving, image uploads, Workers AI regeneration and metadata backups on the live site if you changed related code. Offline tests cannot exercise production bindings.

## Existing Cloudflare configuration

- R2 binding: `PHOTO_BUCKET` (photo bytes are stored outside Git).
- Optional Workers AI binding: `AI`.
- Required GitHub OAuth and publishing secrets: [Admin setup](ADMIN_SETUP.md).
- Older deployment-status API endpoints remain for compatibility but aren't used in the current admin UI.

## Roll back code

Revert the relevant Git commit in GitHub Desktop/Git, push the revert, and let Cloudflare redeploy. Do **not** delete R2 photos, change DNS, or rotate secrets as part of a routine code rollback. Files already removed from R2 by admin actions are not restored by reverting Git.

## Backups

The weekly GitHub Actions workflow saves a short-lived metadata artifact. The admin Metadata Backup export also covers JSON data, not R2 bytes. Keep your own original photo backups. A local metadata export can be checked with `python3 scripts/verify_metadata_backup.py BACKUP.json`.
