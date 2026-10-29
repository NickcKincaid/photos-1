# V39 — Comprehensive Quality, Safety & Performance Review

**Baseline:** the user's content-preserving V38 repository ZIP, not an earlier source snapshot.  
**Scope:** public build, admin/editor, Notes, GitHub OAuth, GitHub API, photo migration, R2, metadata backups, SEO, security headers, performance, mobile/accessibility, test automation, and content preservation.  
**Release type:** targeted maintenance; no intentional design changes and no changes to `content/` files.

## Fixed in V39

### 1. Legacy image migration could fail when writing to R2
- **Severity:** Medium; affects the optional legacy media migration endpoint, not normal photo viewing.
- **Cause:** `/api/admin/migrate` passed an unknown-length `TransformStream` to the R2 binding. The site's normal upload code already avoids this for R2 compatibility.
- **Change:** Downloads an asset from the deployed static asset service with strict 25 MB header and streamed-byte limits, then sends a known-length `Uint8Array` to R2. Rejects empty images and missing bodies; leaves the original file untouched on failure.
- **Tests:** 3 new JavaScript tests, including actual endpoint mocking, empty streams, and declared/actual oversize responses.

### 2. Content loss checker missed deletions *after a commit*
- **Severity:** High for preservation of Notes and projects.
- **Cause:** The content checker ran `git diff HEAD`; once a deletion was committed, that check returned no deletion even though content had disappeared.
- **Change:** Adds `--base-ref` support to compare a known Git baseline with current HEAD. Disables rename detection for this safety check so moved/deleted content paths are reviewed. Adds a content-deletion step to the GitHub Actions test workflow, fetching history for comparison. The local working-tree guard and previous-ZIP comparison remain available.
- **Tests:** New Python tests simulate deleting and committing a Note and verify the new check detects it, plus invalid reference coverage.
- **Limit:** A GitHub Actions check happens **after push** and does not automatically stop Cloudflare from deploying. Review the GitHub Desktop diff and consider requiring successful checks before merging if using pull requests.

### 3. Expanded release regression coverage
- Added end-to-end static-output tests for canonical URLs, image alt attributes, valid JSON-LD, sitemap paths, unpublished Notes not being generated, existing contact address, and static security headers.
- The tests run without network access or modification of your actual content.

## Verified in the source snapshot

| Area | Review and outcome |
| --- | --- |
| Project and Notes preservation | 8 project JSON files, 3 Notes (2 published, `tbc` unpublished), plus site settings; all content file bytes preserved from V38. |
| Public site generation | 15 HTML files built. 13 sitemap page URLs exist as generated pages; no broken internal page links detected. |
| SEO and discoverability | Canonicals, sitemap, robots.txt, JSON-LD syntax, gallery alt attributes checked locally. Google indexing and Safe Browsing statuses **not** verified. |
| Admin authentication | Signed HttpOnly/Secure/SameSite session cookies, OAuth state, owner-login check, same-origin writes, private cache controls reviewed. No credential patterns found in current source. Not a live penetration test. |
| Data integrity | Existing GitHub revision conflict checks, single-revision metadata export, R2 object ownership checks, post-commit cleanup behavior reviewed. New historical deletion guard added. |
| Photo handling | JPEG/WebP upload caps and MIME checks, R2 serving, legacy fallback, sharing JPEG crop behavior reviewed; legacy R2 migration corrected. |
| Notes | Optional titles, public vs draft filtering, date selection, local-time admin preview, and historical note slugs reviewed. |
| Design and accessibility | Fit All, loading placeholders, viewer keyboard/mobile behavior, collapsible admin sections tested in Chromium. No design or behavior changes required. |
| Performance | No added frontend dependencies or runtime requests. Generated homepage HTML 9.1 KB (2.6 KB gzip), public CSS 15.3 KB (4.5 KB gzip), site JS 14.9 KB (4.9 KB gzip). |
| Backups | Metadata backup uses one immutable Git commit. Weekly workflow checks JSON and retains artifacts for 30 days; **R2 photo bytes are not included**. |
| Email | Public inquiry address remains `contact@nickckincaid.com`. Routing/delivery at Cloudflare cannot be verified locally. |
| Cloudflare integration | Source configuration inspected; OAuth, R2, Workers AI, deployment DNS/rules and billing require real account verification. |

## Known limitations and next verification steps

1. **Unrecorded photograph dimensions:** All **62** current `photo_details` entries lack saved `width` and `height`, despite having alt text. This means a few skeletons can still shift as original photos load. Safest remedy: load each existing project in the admin and save after the images' natural dimensions are available, or populate dimensions from verified R2 originals. Do **not** insert guessed ratios.
2. **Off-site indexing/security:** Google's previous “Deceptive pages,” 404, and image metadata reports require checking in Search Console. The audit couldn't access your live site or the linked PageSpeed Insights metrics, so no claim is made that warnings are cleared or Core Web Vitals improved.
3. **Backup completeness:** A GitHub JSON snapshot or weekly artifact is **not** a full R2 image backup. Set up a separate R2 disaster-recovery/export plan if loss of cloud-stored photographs would be unacceptable.
4. **Unused R2 images:** Interrupted uploads or failed admin saves may leave unattached R2 objects. Do not automatically delete them; any cleanup must first check all published and draft project references.
5. **Authentication binding:** The GitHub OAuth check uses the configured owner's account login. Binding login to a stable numeric GitHub user ID would provide additional resilience against future account renames, but it requires deliberate one-time configuration and was not introduced silently.
6. **Cloudflare-specific testing:** Actual Pages and R2 bindings, GitHub OAuth, Workers AI output quality, and email forwarding need a post-deployment smoke test. No live remote writes were performed.

## Test and release results

- **JavaScript:** 115/115 passing (Node test runner).
- **Python:** 63/63 passing (unittest).
- **Source audit:** 0 errors, 0 warnings.
- **Content guard:** 8 project files, 3 Note files, 0 missing/deleted content files in the release tree.
- **Production build:** 8 projects, 2 published Notes; unpublished `tbc` remains in source only.
- **Browser smoke tests:** Chromium checks passed for the public viewer, Notes date controls in California and London, Fit All, loading skeletons, admin expansion/collapsing, and responsive widths. Some historical browser scripts are manual and are not part of the automated unit-test totals.
- **Archive verification:** Final ZIP is re-extracted and its content JSON digests compared against V38 before release.

## Deploy and rollback

The V39 release is a **complete push-ready repository**, including the original `.git` folder and uncommitted source changes from V38. It isn't an installer and does not execute scripts on Windows.

1. Keep a copy of your current working repository, including `.git` and `content/`.
2. Extract V39's `photos-1/` folder to a separate location; open it in GitHub Desktop.
3. Review all changes and specifically verify `content/projects/` and `content/notes/` have no deletions.
4. Commit `V39 - Comprehensive reliability and content safeguards`, then **Push origin**. Never force-push.
5. Verify the Cloudflare Pages build and smoke-test the homepage, one project, Notes editor, uploads, and contact address.
6. Roll back by reverting the V39 commit through Git. Do not replace `content/` with an older ZIP when rolling back code.

Nothing in this report should be interpreted as a live security certification, a guarantee of Google indexing, or a claim that a manual Windows deployment has succeeded.
