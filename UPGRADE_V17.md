# Version 17 — Viewer, spacing, Notes, and cleanup

## Safe upgrade for nickckincaid.com

1. In GitHub Desktop, **Fetch origin** and **Pull origin** if prompted, before copying files. Make sure existing changes are committed and pushed.
2. Download and extract `nickckincaid_portfolio_v17_safe_update.zip`.
3. In GitHub Desktop choose **Repository → Show in Explorer**. Copy the *contents* of the extracted update into that repository folder; merge `static/`, `functions/`, and `tests/` while keeping their paths. Let Windows replace the matching code files.
4. Review Changes. There should be **no modifications to your existing `content/` or `media/` folders**. Your R2 photos never appear in this ZIP.
5. Commit with a summary like `Fix photo viewer, footer, navigation and add Notes embeds` and then **Push origin**.
6. Wait for a successful Cloudflare Pages deployment. The existing build command `python3 build.py` and output folder `dist` remain unchanged. No new secrets or bindings are needed.
7. Hard refresh your browser and check `/notes/`, `/admin/` → Notes, and an existing `/projects/.../` page. Confirm the old photo link now redirects to a `#photo=` link.

## Changes

- On short Notes and Inquire pages, the footer sits at the bottom of the window.
- Desktop navigation is aligned to the right with wider gaps; the mobile header becomes a deliberate two-row title/navigation layout.
- New gallery links use `/projects/name/#photo=ID`. Existing `/projects/name/?photo=ID` links redirect to the fragment through a tiny Pages Function; all normal project requests pass through to static HTML.
- Viewer retains fit-to-screen, adaptive background, swipe and keyboard controls, and the copy-link function.
- The admin UI no longer displays the retired **Copy older photos to R2** or **Remove old GitHub copies** actions. The backend migration endpoints are retained for compatibility, but the buttons are gone. Your R2 storage and project delete action are unchanged.
- Notes now have a compact formatting toolbar and live preview. Formatting uses limited Markdown-style syntax, not arbitrary HTML. External players embed **only** known YouTube and Spotify URL types.

## Notes syntax

Write notes normally. Plain-text notes continue to work. Optional formatting:

```text
# Small heading

This is **bold**, *italic*, or `inline code`.

- First bullet
- Second bullet

> A quotation

[An external link](https://example.com)

https://www.youtube.com/watch?v=dQw4w9WgXcQ

https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC
```

Put each Spotify or YouTube share URL on its **own line**. Supported sources: YouTube videos, Shorts and `youtu.be`, plus Spotify tracks, albums, playlists, shows, and episodes. Arbitrary embed HTML and third-party iframe URLs are deliberately unsupported for security. Embedded players come from Spotify/YouTube, may use their own font sizes, and may make third-party requests when loaded.

## Verification and limitations

- Local Python build + markup tests: passed.
- Local JavaScript API tests: passed.
- Chromium desktop/mobile layout tests: passed.
- Cloudflare real-world legacy link redirect: **must be verified after deployment**.
- Real GitHub auth, project publishing and R2 delivery: **not exercised in your account**.

If a photo continues to return a 5xx *after* this update, check **Cloudflare Pages → Deployments → Functions logs** for the exact `/projects/...` or `/media/...` path; the remaining problem may be R2 delivery rather than viewer navigation.
