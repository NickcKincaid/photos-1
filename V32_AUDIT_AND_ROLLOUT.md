# V32: fit-all naming, AI alt-text repair and maintenance

## Code fixes and reasons

1. **V31 image encoding mismatch**: `functions/api/admin/describe.js` called `@cf/meta/llama-3.2-11b-vision-instruct` with a data-URI string. Cloudflare's current model documentation demonstrates pure base64 for that vision model and requires prior Meta license acceptance. V32 instead uses the Cloudflare `@cf/llava-hf/llava-1.5-7b-hf` image-to-text model with **an integer array of JPEG bytes**, the format in official Workers examples. V32 reads `description`, not only `response`.
2. **AI false-zero summary**: V31 overwrote the last individual error with a generic `0 generated, 7 failed` message. V32 preserves the specific error for each failed photograph in an expandable list. Authentication/binding/quota access failures halt the batch instead of generating seven identical billable errors.
3. **Preview and reliability**: 512px previews at 0.70 JPEG quality, 900 KB server-side cap, strict JPEG checks, 45-second client timeout, abort support and guard against empty model output.
4. **No silent overwrites**: Only empty alt-text fields are filled; existing manually entered alt descriptions remain untouched. Unsaved generated descriptions require an explicit Save project. No visible photo captions are added.
5. **Fit All**: Public human-readable label is renamed. The `.contact-sheet-toggle` and `.is-contact-sheet` internal hooks are deliberately unchanged for compatibility. Standard gallery still works as before.
6. **Deployment status**: API error handling includes account/project mismatch. Production results are sorted newest-first; the client polls again after transient failures and displays waiting state after a GitHub save.
7. **Safety/maintenance**: No changes to user-generated content, R2 bucket keys, existing OAuth, protected middleware, image download links, project sorting, mandatory exposure fields or public SEO data. Automated node regression tests added for invalid images, model outputs, configuration errors, seven-photo batches, quota and deployment parsing.

## Release validation matrix

| Area | Automated validation | Manual production check |
|---|---|---|
| Model image input/output | 7 mocked images accepted, output normalized | Generate 1 real photo |
| Image errors | Bad type, incomplete JPEG, oversized request, empty output | View Cloudflare logs on failure |
| Access protection | Existing admin middleware unchanged | Signed-out API POST must be rejected |
| Alt text publication | Frontend fills empty fields only | Save project, refresh public gallery alt attribute |
| Fit All | Source labels changed in build.py and site.js | Toggle fits multiple photos; viewer still opens |
| Metadata | Build and existing tests recommended | ISO, shutter, aperture, focal length remain required |
| R2 | No writes added to R2 code | Image previews load; upload a disposable image |
| Deployment status | Mock stage mapping | Add 3 secrets, redeploy, check indicator |
| SEO | Build code and alt-rendering unchanged | Inspect alt and meta tags after build |

## Known limitations / not independently verified

- The full private Cloudflare/GitHub/R2 production environment, Cloudflare account permissions, live billing, and real model inference cannot be run offline. If the AI binding is absent or AI quota exceeded, V32 shows specific errors; it cannot override account quotas.
- This is a **targeted source audit and regression patch**, not proof that the entire project is defect-free; whole-site browser/e2e tests still require running the checked-out complete repository.
- R2 deletions may remain visible in cached HTML until Pages deployment completes, a pre-existing architectural constraint. This patch does not change object deletion or commit timing.
- The image-to-text model may make semantic mistakes. Review alt text before publishing. It is not guaranteed that generated alt text improves SEO ranking.
- Replacing code files in an existing repository should always be followed by review of the Git diff. Metadata backup does not contain R2 image originals.

## Rollback

Revert the V32 commit using GitHub Desktop and redeploy. If necessary restore the source label files using the backup path printed by Apply-V32.bat. Keep R2 and existing bindings/secrets intact.

## Expanded read-only source sweep

Run `python3 scripts/v32_audit.py` from the complete repository to scan all Python and JavaScript source syntax, every JSON content file, photo metadata completeness and the expected V32 labels. It is read-only, does not connect to Cloudflare and does not modify images or live project metadata. Syntax and mock tests do **not** prove the live app is error-free.
