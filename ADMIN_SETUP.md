# Private editor setup (Cloudflare Pages + GitHub OAuth)

**Website:** `https://nickckincaid.com/`  
**Editor:** `https://nickckincaid.com/admin/`  
**Repository:** `NickcKincaid/photos-1` (production branch `main`)

## A. GitHub OAuth

In GitHub Developer Settings > OAuth Apps, create an OAuth application:

- Name: `Nicholas Kincaid Photography`
- Homepage: `https://nickckincaid.com/`
- Authorization callback / Redirect URI: `https://nickckincaid.com/api/auth/callback`
- Do not enable wildcard matching or Device Flow.

Copy the Client ID and generate a Client Secret. Do not put either secret in GitHub source files. GitHub will redirect only to the configured domain.

## B. Publishing token

Create a **fine-grained GitHub personal access token** restricted to **only** the `NickcKincaid/photos-1` repository with **Contents: Read and write** permission. Set a reasonable expiration (for example, 90 days) and record the renewal date. The site can continue to be read after token expiry, but publishing through the dashboard stops until the secret is rotated.

## C. Cloudflare Pages settings

In **Workers & Pages > photos-1 > Settings > Variables and Secrets** add to **Production**:

| Binding/variable | Type | Purpose |
| --- | --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | Text | GitHub OAuth client identifier |
| `GITHUB_OAUTH_CLIENT_SECRET` | Encrypted secret | OAuth client secret |
| `GITHUB_TOKEN` | Encrypted secret | Restricted GitHub publishing token |
| `ADMIN_SESSION_SECRET` | Encrypted secret | Random secret, at least 32 characters |
| `PHOTO_BUCKET` | R2 bucket binding | Existing private bucket e.g. `nickckincaid-photos` |

`PHOTO_BUCKET` is a **binding**, not a string secret. A public bucket URL is not required. Keep all secrets out of screenshots. Save and redeploy the **production** environment.

Optional: `PUBLIC_SITE_ORIGIN=https://nickckincaid.com` as a plain-text environment variable. The default is already that URL. For any domain change, update this origin, the Github OAuth callback, and `build.py`'s canonical `SITE_URL` together.

## D. Test

Visit `https://nickckincaid.com/admin/`, sign in with the GitHub account that owns the repository, and create a disposable project with one JPEG. Save, check the new project JSON in GitHub, verify the photo and its small WebP variants in R2, and confirm that Cloudflare deploys automatically.

The dashboard restricts publishing to the account login `nickckincaid` (case-insensitive). The public homepage remains open to visitors. Draft projects are unlisted, not a private photo vault; direct media URLs remain accessible.

## Common problems

- **Admin setup incomplete:** At least one of the four credential variables is missing or `ADMIN_SESSION_SECRET` is too short.
- **Cannot sign in:** Check GitHub OAuth callback URL, configured origin, production deployment, and the GitHub account used for authorization.
- **403 or 503 from GitHub:** Check token expiration, repository selection, and Contents read/write permissions.
- **R2 is not connected:** Bind `PHOTO_BUCKET` in Production and redeploy. Do not substitute a plain environment string.
- **Project changed in GitHub:** Another tab or automation saved newer data; refresh the editor before attempting to save again.
- **Cloudflare build fails:** Verify the repository root contains `build.py` and `content/site.json`; use build command `python3 build.py` and output folder `dist`.

If you suspect credentials were exposed, revoke the affected GitHub token/secret and rotate the Cloudflare encrypted secret immediately.
