V36c - Google Image Metadata Repair (metadata-only patch)

Source: the V36a complete source + V36b admin-label patch provided in this chat.
This update changes ONLY build.py and tests/test_seo.py.
No photo content, R2 configuration, admin controls, or page URLs are changed.

INSTALL (Windows / GitHub Desktop)
1. Open GitHub Desktop > Repository > Show in Explorer.
2. Back up the existing build.py and tests/test_seo.py first.
3. Copy build.py and the tests folder from this ZIP into your repository,
   choosing to replace those two files only.
4. Review the diff in GitHub Desktop BEFORE committing. In particular,
   stop if you added custom changes to build.py after V36b, and ask for a merge.
5. Commit as 'V36c - Correct Google image structured metadata' and Push origin.
6. Once Cloudflare deploys, validate a published project URL using
   Google's Rich Results Test and Search Console > Image Metadata > Validate Fix.
   Existing Search Console reports may take days to refresh.

WHAT CHANGED
- ImageObject.creator is an explicit Person object with name, URL, and @id.
- Adds creditText with the site photographer name.
- Adds copyrightNotice matching the site's current copyright footer.
- Adds acquireLicensePage linking to the existing /inquire/ contact page.
- Does NOT invent a reuse license, give away photo rights, or claim CC licensing.
- Optional: set image_license_url in content/site.json ONLY if you have an
  actual HTTPS page publishing valid license terms for your photographs.
  Otherwise Google may continue to suggest the non-critical license property.

CAVEAT: Credit/copyright metadata assumes all the photographs belong to the
photographer identified in content/site.json. If you publish photographs owned
by other rights holders, review these defaults BEFORE installing.

GOOGLE 404 ALERT (a separate issue, not fixed by this patch)
In Search Console > Indexing > Pages > Not found (404), open Examples,
copy the URLs (or export CSV). Determine whether each is:
(a) current page missing (restore it),
(b) moved URL with a close replacement (301 redirect), or
(c) intentionally removed, invalid or spam URL (leave 404).
Do not redirect all 404s to the homepage.

LOCAL VERIFICATION
- Node: 105 tests passed.
- Python: 46 tests, 1 skipped, all others passed.
- Production build: 8 projects, 2 published notes.
- Local HTML link audit: 15 HTML pages, zero missing internal page links.
- Source audit: 0 errors, 0 warnings.
Live Cloudflare and Search Console status have not been verified.
