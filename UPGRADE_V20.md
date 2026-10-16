# Version 20 — Clean filenames + homepage cover crop

A small, backward-compatible upgrade for the existing photography website. The live portfolio's layout, authentication, notes, and photographs are left unchanged.

## What changes

**New photo filenames:** Previously a new JPEG was stored at a key such as `media/handmade-watusi-horn-table/handmade-watusi-horn-table-01-00232f36de234e2c905d50cb.jpg`. New JPEGs now use `media/handmade-watusi-horn-table/<unique-storage-folder>/handmade-watusi-horn-table-01.jpg`. The image file itself has the clean name; the unique folder keeps an unsaved upload from overwriting a live or previously uploaded photo. WebP versions retain the matching basename, e.g., `handmade-watusi-horn-table-01-640.webp`.

Existing files are **not automatically renamed or moved** in R2, to avoid changing existing links or causing temporarily broken project galleries. Legacy R2 photos are still accepted by the upload and publishing APIs, and downloading a legacy JPEG through the website now offers a clean filename via the `Content-Disposition` header. If you need to reorganize existing R2 object keys, that is a separate migration requiring copy, verification, and reference updates. Do not manually rename objects in the R2 dashboard: the website would lose track of them.

**Cover crop:** Open a project in `/admin/`. The first image is its homepage cover. Beneath the upload area, **Homepage cover crop** displays a live 4:5 preview. Adjust horizontal/vertical sliders, or click the image to shift the focal point. Save the project. Cropping uses CSS `object-position` and never alters the original image or full-screen view.

Reordering photos changes which image is the cover and resets the crop to center when the first image changes, so you can choose the new framing. The JPEG filename is assigned at upload time and **does not change when you reorder existing photos**; this preserves stable storage references and photo links.

## Install safely with GitHub Desktop

1. Confirm the latest changes in GitHub Desktop are committed and pushed.
2. Make a backup of the current repository before installing updates.
3. Download and extract the V20 Safe Update ZIP.
4. Open **GitHub Desktop → Repository → Show in Explorer**.
5. Copy **the contents** of the extracted ZIP into the `photos-1` repository folder, preserving subfolders and replacing matching files.
6. Confirm that the **Changes** tab shows only code files (not deletions of `content/` or `media/`).
7. Commit with `Add clean photo filenames and cover crop controls`, then click **Push origin**.
8. Wait for Cloudflare Pages production deployment to succeed.
9. Open `https://nickckincaid.com/admin/`, select your project, change the cover position, and save. Check your public homepage.
10. Upload one disposable photo to a test project and inspect the R2 key to confirm the clean image basename.

No new Cloudflare variables or bucket permissions are required.

## Files changed

- `functions/api/admin/upload.js` — clean JPEG basename with collision-safe folder; support both key formats.
- `functions/api/admin/save.js` — validate and persist cover position, validate both R2 key formats.
- `functions/api/admin/delete.js` — recognize thumbnail keys in both formats.
- `functions/media/[[all]].js` — clean download filename on older hashed JPEGs.
- `build.py` — add sanitized `object-position` to homepage covers.
- `static/admin.html`, `static/admin.js`, `static/admin.css` — cover preview and position controls.
- Tests in `tests/`.

## Tests and limitations

Local Python and Node tests verify build output, crop validation, collision-safe filenames, variant uploading, project save, legacy downloads, and compatibility with existing photos. The admin editor was also checked in a desktop and mobile Chromium simulation.

Production R2, GitHub, and Cloudflare integration still need real-world verification after deployment. A live object cannot be safely renamed simply by changing the filename, because its URL appears in project data and may be cached or shared. This upgrade intentionally does not perform any destructive migration of existing objects.
