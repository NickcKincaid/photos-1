# V18 - optional project blurb

This is a small, backward-compatible update based on the V17 photography portfolio.

## What changes

- Adds **Project blurb (optional)** beneath the title/order fields in `/admin/`.
- Displays the text inside the project gallery's open column area when provided.
- Keeps the text small (11px), gray, and unadorned. Supports paragraph breaks.
- On mobile, puts the text after the photographs.
- Keeps all existing photos, Notes, Cloudflare R2 settings, GitHub OAuth, and footer unchanged.
- Older `description` values are not silently displayed. Only the new `blurb` field appears.
- An empty blurb does not add any HTML or spacing to the public page.

## How to update your existing site

1. Download the V18 Safe Update ZIP and extract it.
2. In GitHub Desktop, open `photos-1` via **Repository > Show in Explorer**.
3. Copy the **contents** of the extracted folder into your repository. Preserve the `static/`, `functions/`, and `tests/` paths and replace matching files.
4. In GitHub Desktop, commit with `Add optional project blurbs` and **Push origin**. If prompted to pull first, pull and resolve any conflicts before pushing.
5. Wait for Cloudflare Pages deployment to succeed.
6. Visit `https://nickckincaid.com/admin/`, choose a project, enter a blurb, click **Preview** if desired, then **Save project**.
7. The blurb appears after Cloudflare publishes the new commit.

Only existing code/test files are included. The ZIP does NOT contain `content/`, `media/`, Git credentials, or R2 photographs.

## Details and limitations

- Project blurbs are plain text, up to 1,000 characters. Newlines and separate paragraphs display naturally; HTML is escaped.
- It is a flexible masonry-column layout: on a two-column project with uneven photo heights, the blurb normally occupies remaining space after the final photo, as in the example screenshot. Exact placement depends on image sizes and viewport width.
- The blurb is public content and is stored in the project's JSON in GitHub, not in R2.
- If Cloudflare reports a build error, check the latest deployment log; this patch requires the V17 site architecture.

## Local validation

- 10 Python tests, 21 Node tests, and desktop/mobile offline Chromium checks completed for this patch.
- The updated dashboard's save, reopen, and preview behaviors were checked with simulated API responses. Live GitHub/R2 changes were not made.
