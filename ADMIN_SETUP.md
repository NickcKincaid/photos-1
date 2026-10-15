# V11 — Audited private photography dashboard

Public site: https://photos-1.pages.dev/
Editor, after setup: https://photos-1.pages.dev/admin/

The update contains working dashboard and backend code, but it is **not yet deployed**. You need to upload the patch to GitHub and configure one GitHub OAuth application and four Cloudflare variables/secrets. Until configured, the admin routes return `503` instead of accepting uploads.

## Step 1. Upload the update

Open https://github.com/NickKincaid/photos-1 on `main`. Extract the ZIP and upload ALL its extracted folders/files through **Add file > Upload files**. Preserve the directory structure.

The package contains these files:

- `build.py` — updated site build script, copies the editor and creates `dist/_routes.json` to protect admin assets.
- `static/admin.html`, `static/admin.css`, `static/admin.js`, `static/admin-processing.js` — new mobile-friendly editor and local JPEG preparation.
- `functions/_middleware.js` — root auth guard covering static `/admin/*` files; paired with `static/_routes.json`.
- `functions/admin/_middleware.js` — secondary admin guard.
- `functions/api/admin/*.js` — protected gallery listing, JPEG upload, and atomic GitHub publishing functions.
- `functions/api/auth/*.js` — GitHub sign-in, callback, and sign-out.
- `admin-lib/*.js` — private server-side GitHub API and signed-session handling.
- `.github/workflows/rename-project-photos.yml` and `scripts/` — includes V9 automatic filename and owner-credit workflow; with a safeguard to skip the template's demo photographs.
- `ADMIN_SETUP.md` — these instructions.
- `static/_headers` — browser security policy updated so admin photo previews render correctly.

**Do not replace `media/` or `content/`**. The ZIP does not contain those folders. It DOES contain the updated `.pages.yml` form configuration. This consolidated package includes the current minimal public layout, email inquiry, Pages CMS configuration and admin dashboard; CMS can remain available as a fallback. Cloudflare build settings remain **`python3 build.py`** and output **`dist`**. Pages Functions must be in `/functions` at repository root, NOT inside `dist/`.

## Step 2. Register a GitHub OAuth app for private login

On GitHub, go to **Settings > Developer settings > OAuth Apps > New OAuth App**.

| GitHub OAuth App field | Enter |
|---|---|
| Application name | `My Photography Editor` |
| Homepage URL | `https://photos-1.pages.dev/` |
| Authorization callback URL | `https://photos-1.pages.dev/api/auth/callback` |

Save it. Copy the **Client ID**. Click **Generate a new client secret** and copy the **Client Secret**. Never add the secret to GitHub files or share it in chat. Only the actual authenticated GitHub account **NickKincaid** can enter the dashboard, even if somebody else authorizes the OAuth app.

This login integration requests only GitHub's `read:user` OAuth permission to identify you. The private publishing token in step 3 is separate and is never sent to your browser.

## Step 3. Make a GitHub publishing token

Go to GitHub **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.

Choose:

- Resource owner: **NickKincaid**.
- Repository access: **Only select repositories > photos-1**.
- Repository permissions: **Contents > Read and write**.
- Expiration: Choose a reasonable expiration (for example 90 days). You'll need to replace this secret when it expires.

Copy the generated token into your password manager temporarily. Do **not** put it in a repo file, URL, or chat message.

## Step 4. Add four Cloudflare variables

In Cloudflare dashboard, open **Workers & Pages > photos-1 > Settings > Variables and Secrets** (Production environment) and add:

| Name | Type | Value |
|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Plain text | Your GitHub OAuth App Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | **Encrypted secret** | OAuth App Client Secret |
| `GITHUB_TOKEN` | **Encrypted secret** | Fine-grained personal access token from step 3 |
| `ADMIN_SESSION_SECRET` | **Encrypted secret** | Your own unpredictable random string, at least 32 characters |

Generate `ADMIN_SESSION_SECRET` using a password manager's secure random generator (ideally 48–64 characters). It is used only to sign short-lived editor sessions. It should not be your GitHub password. Never include it in source code.

Click Save for each. **Redeploy** the production website (for example, Retry deployment / Redeploy under Deployments) so Pages Functions receive the new secrets. If they don't appear immediately, create a small harmless GitHub commit to start a fresh build.

## Step 5. Test sign-in and privacy

Open an incognito/private browser window:

1. `https://photos-1.pages.dev/` should display your public photography site normally.
2. `https://photos-1.pages.dev/admin/` should **redirect to GitHub sign-in/authorization**, not let you upload as a guest.
3. After authorizing with your personal NickKincaid GitHub account, you should return to `/admin/` and see your projects.
4. Sign out; while logged out, `https://photos-1.pages.dev/api/admin/projects` must return a `401` JSON response (or another access-denied response), NOT your project data.
5. Login sessions expire after 24 hours. Click Sign out in the editor to end a session earlier.

Troubleshooting: `503` means one or more Cloudflare variables are missing or `ADMIN_SESSION_SECRET` is shorter than 32 characters. A GitHub callback failure generally means the OAuth app's exact callback URL or client secret is wrong. A GitHub API failure after login usually means `GITHUB_TOKEN` is expired or lacks Contents write permissions.

## Publish your first project

Open `https://photos-1.pages.dev/admin/` on mobile or desktop.

- Choose a project from the left, or **+ New project**.
- Enter its title and homepage display position, then optionally check **Publicly visible**.
- Tap **+ Add photos** and select one or more photos. Each is compressed **locally on your device** into a web-sized JPEG below ~2.6 MB. The browser sends pre-encoded Base64 to GitHub through a lightweight authenticated API, avoiding excessive Cloudflare CPU usage. Your master files are never sent to the server. New JPEGs receive Nicholas Kincaid XMP copyright/creator metadata.
- Use the up/down controls to order the gallery. The first photo is the homepage cover.
- Open camera metadata corrections only when automatic EXIF metadata is missing or inaccurate.
- Click **Save project**. New photos and project JSON are committed to GitHub together. Cloudflare rebuilds the live site; GitHub Actions also renames them to `project-name-01.jpg`, etc. and writes final copyright tags.

Photos over Pages CMS's former 4.5 MB limit work automatically, because the dashboard resizes them in your browser BEFORE upload. Original photo files are not copied into GitHub. JPEG source EXIF is generally retained; HEIC/PNG/WebP camera EXIF may not survive conversion. Standard EXIF GPS pointers are cleared by the browser utility; the GitHub credit workflow removes GPS tags in the final committed image. Always retain masters privately.

Removing a photo from a gallery does NOT permanently erase its bytes from Git history. If a removed middle image blocks a numbered filename, the renamer archives that older image in `media/_unused/`. The builder excludes this archive from the deployed site, but archives in a public GitHub repository remain publicly visible on GitHub. Clean up old files only once backed up.

## Security model and limitations

- OAuth authorizes only the GitHub user `NickKincaid`. The OAuth callback verifies the identity with GitHub's own API.
- The backend creates a signed `HttpOnly`, `Secure`, `SameSite=Lax` session cookie for 24 hours. It verifies the signature and session expiry on **both** admin HTML/assets and ALL admin API requests, including uploads. It checks same-origin on upload/save requests to prevent cross-site writes. Hiding `/admin/` by itself would not be secure; this implementation does not rely on hiding it.
- Publishing tokens and OAuth client secrets are stored only as Cloudflare encrypted secrets. Even if somebody views the site source, they cannot read the token.
- The browser warns before discarding unsaved project changes.
- Existing Projects and Pages CMS records stay compatible. Avoid saving the SAME project simultaneously in Pages CMS and the new editor.
- GitHub remains the image host. A large collection may eventually warrant moving images to Cloudflare R2, but this version keeps costs and complexity low.
- Keep original photos and backups. Website copies are downscaled and re-encoded.
- **Do not attribute template/demo/other people's photos to yourself.** The included metadata workflow now skips recognized original template images; replace them with your own photographs.
- The browser editor has been tested locally using simulated GitHub responses. Real OAuth login, Cloudflare deployment, and publishing require you to complete the above account setup; they cannot be activated from this chat.

## Important: draft photo privacy

The **Show project on website** toggle controls whether a project appears in your
portfolio. It does **not** make photos confidential if the underlying GitHub
repository is public. Even unused images and archives can be viewed in a public
GitHub repository and its history. Keep sensitive or unpublished originals in
private storage; consider making the repository private after confirming it
works with Cloudflare Pages and any other editors you still use.

## V11 regression checklist

After deploying with the correct OAuth secrets in Cloudflare:

1. Visit `/admin/` in a private browser window. It must redirect to GitHub sign-in.
2. Try `/admin/index.html` and `/admin/admin.js` signed out; both must be protected.
3. Sign in as your allowed GitHub account and upload one real JPEG over 4.5 MB.
4. Verify the browser creates a smaller JPEG, shows a thumbnail, and saves.
5. Confirm Cloudflare deploys the project, and GitHub Actions subsequently renames and credits its images.
6. Reorder two photos, then remove a middle photo; verify the renaming workflow completes.
7. Check your photo's EXIF, project inquiry email link, and the viewer's close button.

Only local and mocked tests were possible when this update was prepared. The
real GitHub OAuth callback, Cloudflare deployment, GitHub token permissions and
production GitHub Actions remain to be confirmed in your connected accounts.
