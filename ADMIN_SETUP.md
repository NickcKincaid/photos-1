# Private photography uploader — setup and checks (V13)

Live portfolio: https://nickckincaid.com/
Private editor: https://nickckincaid.com/admin/
Source repository: https://github.com/NickcKincaid/photos-1

## Prerequisites

Cloudflare Pages: build command `python3 build.py`, output directory `dist`, root directory blank, branch `main`. Keep `functions/` at repository root, not in `dist/`.

GitHub OAuth application in **Settings → Developer settings → OAuth Apps**:
- Homepage URL: `https://nickckincaid.com/`
- Callback URL: `https://nickckincaid.com/api/auth/callback`
- No wildcard redirect required.

Cloudflare Pages project → Settings → Variables and Secrets (Production):
- `GITHUB_OAUTH_CLIENT_ID`: OAuth Client ID (text)
- `GITHUB_OAUTH_CLIENT_SECRET`: OAuth Client Secret (encrypted)
- `GITHUB_TOKEN`: Fine-grained GitHub PAT with **Contents: Read and write**, restricted to `NickcKincaid/photos-1` (encrypted)
- `ADMIN_SESSION_SECRET`: randomly generated 48–64-character secret (encrypted)

**Never commit or send these secret values.** An OAuth client secret is not the same as the GitHub publishing token. A GitHub PAT with an expiration must be rotated before it expires; photos will still be publicly visible if publishing credentials expire.

`admin-lib/session.js` uses the configured domain above for OAuth. For a future domain migration, set `PUBLIC_SITE_ORIGIN` (plain-text Cloudflare environment variable) to the new full `https://` origin, update your GitHub OAuth callback, and change `SITE_URL` in `build.py`. Never change a domain without changing both callback and canonical URLs.

## Publishing flow

Visit `/admin/` and sign in with the `NickcKincaid` GitHub account. The private editor can create a project, add and reorder photographs, preview a draft, and save to GitHub. Uploads create web-optimized JPEG copies; keep your full-resolution masters separately. The `Rename and credit project photos` GitHub Action then normalizes filenames, embeds copyright metadata, assigns permanent photo IDs, and creates responsive WebP thumbnails. GitHub commits trigger Cloudflare redeployment.

The public repository and its media files are not confidential. **Unpublished/draft means omitted from the public gallery, not private storage.** There is no automatic backup of your originals. Save originals elsewhere.

## Troubleshooting

- **Admin setup incomplete:** check all four Cloudflare secrets/variables and redeploy production.
- **GitHub login redirects to the wrong address:** confirm OAuth callback and `PUBLIC_SITE_ORIGIN` (if set) use exactly the same hostname; clear site cookies and try again.
- **Unauthorized account:** sign in as `NickcKincaid`.
- **Photo upload fails:** check that `GITHUB_TOKEN` is current and has Contents: Read and write for `photos-1`. Export your source as JPEG if HEIC decoding is unsupported on the phone/browser.
- **Thumbnails not optimized:** run GitHub Actions → Rename and credit project photos → Run workflow, and ensure the workflow succeeds and commits `media/_optimized` assets.
- **Save order before publishing:** homepage project order is saved separately to prevent silent loss of staged ordering changes.
- **Errors after GitHub Action:** open the job log and inspect the failing script; don't repeatedly upload the same photos.
- **Cloudflare build fails missing `site.json`:** restore `content/site.json`. The update ZIP does not include user content.

## Security and operational limits

Only the authorized owner's signed login session can access `/admin/` and `/api/admin/*`; mutations also enforce same-origin requests. The GitHub publishing token stays in Cloudflare environment secrets and is not exposed to visitors. Change `ADMIN_SESSION_SECRET` to invalidate old sessions, and revoke `GITHUB_TOKEN` at GitHub if it is leaked.

Server-side GitHub upload, true Cloudflare deployment behavior and actual OAuth sign-in cannot be verified by local tests alone; confirm one small real project end to end after installing.
