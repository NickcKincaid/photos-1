# Install V13 into your existing `photos-1` repository

This is a **code-only update** that includes V12 features and V13 fixes. It is not a fresh new repository. **It contains no `content/`, `media/`, originals, or credentials.** Your existing project data, photographs, tokens, and Cloudflare settings remain where they are.

1. **Optional safety step:** In GitHub Desktop, ensure existing changes are committed and pushed before beginning, so you have a known-good revision you can revert to if necessary.
2. Download and extract `photography_portfolio_v13_reviewed.zip`.
3. In GitHub Desktop, open **Repository → Show in Explorer**. Open the extracted update in a second Explorer window.
4. Copy **everything INSIDE** the extracted update folder into the root of the local `photos-1` folder. Accept **Replace files**. Do not put the update inside a subfolder.
5. Check that `build.py`, `admin-lib/`, `functions/`, `scripts/`, `static/` and `.github/` appear at the root. Make sure your `content/` and `media/` remain intact.
6. In GitHub Desktop, commit with summary `Fix photo uploader, links, and website stability` and click **Push origin**.
7. Check **Cloudflare → Workers & Pages → photos-1 → Deployments** and wait for the newest commit to show Success.
8. Check GitHub **Actions → Rename and credit project photos**. Because `scripts/rename_project_photos.py` changed, the workflow should run automatically. If needed, open the workflow and click **Run workflow** on `main`. Wait for completion. This first run assigns permanent photo IDs to older projects and may commit renamed photos and metadata.
9. Check a published project, view an image, use **Copy link**, open the link in a private window, and test `/admin/` login, save, reopen, mobile preview, and homepage order.

### No Cloudflare variable changes are normally necessary

The default OAuth domain is already `https://nickckincaid.com`. If your GitHub OAuth callback is still configured for a different hostname, update it before testing. The same four Cloudflare secrets from V11 are required. See `ADMIN_SETUP.md`.

### Rollback

If the new deployment fails, GitHub Desktop → **History** → right-click the V13 commit → **Revert Changes in Commit**, then **Push origin**. This reverts code but **does not automatically undo changes from the photo-renaming GitHub Action**. For photo data rollback, review Action-produced commits before reverting; keep your original photographs separately.

### Unverified production behavior

The code has passed local build and browser/API simulations. We cannot authenticate into your accounts or validate the real Cloudflare/GitHub webhook end-to-end from here. Production deploy, OAuth, workflow completion, and publishing must be checked after installation.
