# V24 — Draft Recovery, Storage, Sharing Previews, Zoom & Backups

This release is designed to be installed on the existing `NickcKincaid/photos-1` GitHub repository, currently deployed at `https://nickckincaid.com` using Cloudflare Pages.

## New features

### Browser-local autosave

The Notes and Projects editors periodically save unsaved text, project settings, gallery references, and metadata to the current browser (about every 2 seconds). When reopening a document, the editor asks whether to recover its unsaved draft. The editor warns if the GitHub document has a different revision. Drafts are cleared after a successful Save or confirmed deletion.

**This is local recovery, not automatic publication.** You still need to click Save. Drafts aren't synchronized between devices and can be visible to another person using the same browser profile. Unsaved uploaded R2 images are represented by their object URLs/paths, not full local camera originals.

### Storage dashboard

Open `Admin → Storage & backups → Check R2 storage` for an on-demand inventory. It shows R2 objects, approximate original-photo count, bytes used, and an approximate Standard storage charge (excluding request charges and other buckets). The estimate uses the 10 GB-month account-wide free storage allowance, which may already be used elsewhere. If the bucket has more than 5,000 objects, the dashboard shows partial results. No storage credentials or object names are sent to the browser.

### Sharing-image selection

Projects now have an optional **Social sharing image** dropdown with an approximate card preview. You can pick any photo already in that project. When unset, the project cover is used. Project, homepage, Notes and Inquire Open Graph tags are generated from available photos. Social platforms may cache previous previews and crop differently from the admin mock-up.

### Optional photo zoom

The full-screen gallery remains fit-to-screen by default. Visitors can click **Zoom**, double-click/double-tap photographs, or pinch on touch devices. When zoomed, drag to inspect details; click **Fit** to return to the original viewer. Swipe navigation works when fitted. Zoom resets when changing photos or closing the viewer. Real pinch behavior may vary slightly across browsers.

### Lightweight backups

- A new GitHub Actions workflow, `.github/workflows/backup-metadata.yml`, runs weekly (and can be started manually) and stores an artifact containing `content/site.json`, project JSON files and Notes JSON files, retained for 30 days.
- `Admin → Storage & backups → Download a metadata backup now` exports these records as one JSON file that you can save outside GitHub.
- **Neither backup includes actual Cloudflare R2 photographs or full-resolution camera originals.** Keep your original images separately. Because GitHub workflows and Git history live in the same account, they are not a full independent disaster-recovery solution.

## Safe installation

1. Download and extract `nickckincaid_portfolio_v24_safe_update.zip`.
2. Open GitHub Desktop → `photos-1` → **Repository → Show in Explorer**.
3. Copy the ZIP's extracted **contents** into the repository root, preserving all folder paths. Replace matching code files if prompted.
4. Review GitHub Desktop's Changes; verify it contains **no deletion of `content/` or `media/`**.
5. Enter commit summary `V24 - Autosave, storage, previews, zoom and metadata backups`.
6. Click **Commit to main** and **Push origin**. If GitHub Desktop asks to Pull first, finish that safely before pushing.
7. Check the newest Cloudflare Pages deployment succeeded.

**No new Cloudflare secrets or bucket bindings are required.** Your existing `PHOTO_BUCKET`, GitHub token and OAuth configuration are reused. Your R2 photographs aren't modified.

## Live post-deployment checklist

- Open a project in `/admin/`; edit its title and close/reopen the tab *without saving*. Confirm the draft recovery prompt appears.
- In Notes, type an unpublished draft; refresh and recover it.
- Go to Storage & backups, click **Check R2 storage**, then download and inspect the metadata JSON.
- Open a project in the editor and choose a different **Social sharing image**, then save. Confirm the project's source HTML includes the chosen `og:image` URL.
- Open a photograph, test **Zoom → drag → Fit**, then test swiping on your phone.
- In GitHub → Actions, find **Weekly metadata backup**. Use **Run workflow** to test the first snapshot and download its artifact.

## Tests run locally

- `npm test`: JavaScript API tests and Python generator tests
- `python3 tests/browser_v24.py`: offline Chromium tests for photo zoom, editor recovery, R2 stats, export and sharing-image controls
- Fresh site build with sample R2-backed project data

The actual production GitHub OAuth and R2 bucket cannot be exercised without your account, so verify those after deployment. Back up R2 photographs separately before any bulk deletion or migration.
