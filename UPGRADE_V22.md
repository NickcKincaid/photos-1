# V22 — filenames based on current display order

- Added a **Download** action to the full-screen photo viewer.
- Files downloaded through that action are named after the **current published** project title and image position: `handmade-watusi-horn-table-01.jpg`, `-02.jpg`, etc.
- Reorder images or change the title in the admin editor and save. After Cloudflare redeploys, download names update automatically.
- The actual Cloudflare R2 object keys and stable photo IDs do not change; no migration, copying, or reuploading is required.
- Legacy `?photo` and new `#photo` deep links still work.
- The current images in your bucket remain untouched; old direct `/media/...` URLs or browser "Save Image As" may still show the stored filename. Use the new **Download** action for order-aware naming.

## Install

Extract this ZIP, copy `build.py`, `static/`, and `functions/` into your existing `photos-1` repository, then commit and push through GitHub Desktop. Keep your existing `content/` and `media/` folders. Wait for Cloudflare Pages to finish the new deployment.

## Test

Open any published project and click an image. Select Download, verify it uses the current title and numbered position, then reorder the photos in the dashboard and save. After deployment, download the same photo again; its proposed name should match the new order.
