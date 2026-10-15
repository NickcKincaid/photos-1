# V16 — Site navigation, full-screen photos, Notes

## For the existing website

Use `nickckincaid_v16_safe_update.zip`, not the full-source ZIP.

1. Commit/push any outstanding changes in GitHub Desktop first. If important, keep a separate copy of the local repository.
2. Extract the safe update ZIP and copy **its contents** into your cloned `photos-1` folder (Repository → Show in Explorer). Keep the folder paths: `static/`, `functions/api/admin/`, `content/notes/`, `tests/`.
3. Replace matching code files, but **do not delete or replace your existing `content/projects/`, `content/site.json`, or `media/` files**. The safe update ZIP deliberately does not contain them.
4. In GitHub Desktop, check changes and commit with summary `Add notes, navigation and improved photo viewer`, then click **Push origin**.
5. Wait for Cloudflare Pages to deploy the new commit. Your existing build settings remain `python3 build.py` and `dist`, and the existing `PHOTO_BUCKET` binding and secrets remain unchanged.
6. Hard refresh `https://nickckincaid.com/projects/test/` and click a photo. It should expand **inside** the full-screen viewer; the address bar's `?photo=...` part is expected and lets you share that image. The actual JPG is still served from `/media/...` behind the scenes.
7. Visit `https://nickckincaid.com/notes/`, `https://nickckincaid.com/inquire/`, then open `https://nickckincaid.com/admin/` and select **Notes**.
8. Create a note, choose Publish, and Save. Wait for the Cloudflare deployment to complete before checking its public page. Its publication date/time is recorded by the server in UTC.

## Important details

- The private Notes editor uses **the existing GitHub sign-in and `GITHUB_TOKEN`**. Do **not** create new OAuth credentials or change the R2 binding.
- Notes are plain text. Blank lines separate paragraphs. HTML and scripts in notes are rendered as text, never executed.
- GitHub stores note files under `content/notes/`; because your repository is public, **draft notes are not confidential** even though they are hidden from the website. Don't save sensitive private writing as drafts.
- Every note edit makes a GitHub commit; Cloudflare Pages deploys it automatically. Editing from an outdated tab is rejected instead of overwriting a later revision.
- Existing photo links, R2 media and published projects remain in place. Project inquiry link moves from beside title to the bottom of the project; the main navigation's Inquire item opens a simple contact page.
- If you still see old behavior after deploying, verify the newest Cloudflare deployment succeeded and use a hard reload (`Ctrl+Shift+R`) to clear the prior JavaScript and CSS.

## Build/test

```sh
python3 build.py
npm test
```

Optional browser tests, when Chromium, Playwright and Pillow are installed:

```sh
python3 tests/browser_v16.py
```
