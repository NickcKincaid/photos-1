# V15 — Move the photography site to Cloudflare R2

**Public website**: https://nickckincaid.com/  
**Private editor**: https://nickckincaid.com/admin/  
**Repository**: NickcKincaid/photos-1

This is a safe, staged migration. GitHub remains responsible for the website code and project JSON. New photos (plus two WebP thumbnails where supported) go to R2. Old GitHub photos continue working until you copy them into R2 and explicitly remove their current GitHub copies.

## 1. Create a private R2 bucket

1. Cloudflare Dashboard > R2 Object Storage > Create bucket.
2. Suggested bucket name: `nickckincaid-photos`. The name is only for your account; it is not a public URL.
3. Choose **Standard storage**; complete the R2 billing enrollment if prompted.
4. **Leave public bucket access disabled**. You do not need an `r2.dev` URL or a custom image domain.

## 2. Bind it to your existing Pages project

1. Cloudflare Dashboard > Workers & Pages > your `photos-1` **Pages** project.
2. Settings > Bindings > Add > **R2 bucket** (some dashboard layouts say Functions > R2 bucket bindings).
3. Variable/binding name must be exactly `PHOTO_BUCKET` (uppercase).
4. Select the bucket you created in Step 1.
5. Add to the **Production** environment. Redeploy your project to activate it.

Keep the four EXISTING production credentials as-is: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_TOKEN`, and `ADMIN_SESSION_SECRET`. **Do not commit a token to GitHub.** With a Pages R2 binding, no additional R2 API token is needed.

## 3. Install V15 from GitHub Desktop

1. Commit and push any existing uncommitted changes first.
2. Download and extract the V15 update ZIP.
3. GitHub Desktop > Repository > Show in Explorer.
4. Copy the extracted ZIP **contents** into your `photos-1` repository folder, preserving `functions/`, `static/`, `scripts/`, `build.py`, and `.pages.yml`. Replace existing matching files.
5. In GitHub Desktop commit: `Move photography storage to Cloudflare R2`.
6. Click **Push origin**. Cloudflare Pages will rebuild with `python3 build.py` and deploy the `dist` folder as before.

The update ZIP deliberately contains **no `content/` and no `media/` folder**, so it will not overwrite your photographs or projects. You do not need to replace your OAuth settings or change the domain.

## 4. Verify the new uploader

1. Open `https://nickckincaid.com/admin/` and sign in with GitHub.
2. Create a **disposable project** with one small JPEG. Publish it and save.
3. Verify the photo displays on your public project page and enlarges correctly.
4. Cloudflare > R2 > your bucket > Objects should now show a key like `media/test-project/test-project-01-<random>.jpg`, and usually two `-640.webp` / `-1280.webp` thumbnails.
5. GitHub should contain the new `content/projects/<slug>.json`, **not a new image under `media/`**.
6. Delete your disposable project from the private dashboard and check the objects disappear from R2.

New filenames have a `PROJECT-01-<unique-id>.jpg` pattern. The unique ID makes image URLs stable and prevents a reorder or replacement from overwriting existing image files. The visible gallery order is independent of filenames.

## 5. Migrate existing photo projects (one at a time)

1. In the editor, open an existing project.
2. Click **Copy older photos to R2** and wait for it to finish. The original GitHub copies remain untouched.
3. Click **Save project** so `photo_details` records the R2 storage locations.
4. Wait for Cloudflare to deploy. Open the project page in a private window. Test its images, enlarged viewer, and EXIF captions.
5. **Optional final cleanup**: return to the editor, open that project, then click **Remove old GitHub copies**. Type the project name to confirm. The backend checks that every project photo is present in R2 and that no other project requires the old copy before removing current GitHub images.
6. GitHub Actions may make a follow-up commit to remove old generated thumbnails. The current HTML routes will continue to work either way.

**Do not do Step 5 cleanup before you have checked that every image is visible.** The last step reduces the repository's CURRENT file tree, but old copies remain in Git history. To recover historical repository space, you would need a separate, carefully planned history rewrite and repository backup; this update never rewrites history.

Important: the one-click migration of older photographs copies their originals, not newly generated R2 WebP thumbnails. Existing GitHub thumbnails are used while present. After their removal, those older photographs may be served at the larger original size. Newly uploaded R2 photos get responsive thumbnails automatically.

## Deleting photos and avoiding storage leaks

- **Delete project:** The dashboard removes project data and unshared current images from GitHub, then removes the project's exclusive R2 objects. If R2 cleanup fails, the dashboard reports a warning; manual bucket cleanup might be needed.
- **Remove a saved photo from a project and save:** the backend attempts to delete the image and WebP thumbnails if other projects don't reference them. A failure reports a warning, not a failed project save.
- **Upload a photo, then abandon the editor without saving:** the uploaded R2 object can remain orphaned. We don't delete unconfirmed uploads automatically; occasionally inspect the bucket for unused uploads. Keep your originals independently backed up.
- **Draft/private:** drafts are hidden from the public listing, but any person with an exact image URL could still view an uploaded photo through `/media/`. This is not a confidential photo vault.

## Storage, pricing, and usage

R2 Standard includes a monthly allowance of 10 GB-month of storage, 1 million Class A operations, and 10 million Class B operations. Usage beyond the allowances is billed according to Cloudflare's then-current rates. Every image served by the `/media/*` Pages Function is also a Workers/Pages Functions request; a high-traffic website could run into the relevant plan's usage limits. Storage is not backed up automatically by Cloudflare to your local machine. Keep master photographs elsewhere.

## Rollback

If V15 misbehaves: revert the V15 code commit in GitHub (do not delete bucket objects), push, and contact the developer. Old GitHub-backed photos will still work, but newly R2-only photos need the R2-serving Pages Function to display. Therefore do not remove any legacy GitHub image copies until the new system is working reliably.
