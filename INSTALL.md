# Photography upload 502 fix

## What changed

- `functions/api/admin/upload.js`: validates each prepared photo into a bounded 3 MB `Uint8Array` and passes known-length binary data to Cloudflare R2. The previous use of a transformed stream could fail with an unknown-length-stream error.
- `static/admin.js`: displays a more precise troubleshooting message if Cloudflare itself returns an HTML/non-JSON 502.
- `tests/admin_api.test.mjs`: regression tests for size, file signatures, and a strict R2 test double that rejects unbounded streams.

This update does not change the OAuth login, GitHub project data, public design, or your image storage. It does not delete photos or alter existing projects.

## Install in GitHub Desktop

1. Extract this ZIP.
2. GitHub Desktop > Repository > Show in Explorer.
3. Copy the `functions`, `static`, and `tests` folders into your cloned `photos-1` repository. Choose to replace matching files.
4. Review the changes. Commit with summary `Fix R2 photo upload 502` and click Push origin.
5. Wait for Cloudflare Pages > photos-1 > Deployments to show Success.
6. Refresh `https://nickckincaid.com/admin/` and upload a small JPEG into a disposable project. Click Save project.

## If the error remains

1. Verify Cloudflare Pages > photos-1 > Settings > Bindings > Production lists an **R2 bucket** binding named `PHOTO_BUCKET` pointing to `nickckincaid-photos`. If added or modified, redeploy the production site.
2. Open Cloudflare Pages > photos-1 > Deployments > latest production deployment > View details > Functions and start live logs. Reproduce the failed upload. Look for `/api/admin/upload` and the error message/stack trace.
3. Send the HTTP status and error text, not session cookies, tokens, or uploaded image data.

Note: This is a locally tested correction. The actual root cause of a platform-generated non-JSON 502 cannot be confirmed without Cloudflare's live Function logs.
