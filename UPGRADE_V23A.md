# V23A — Combined V23 update and local Notes timestamps

This archive combines all changes from V23 with these V23A additions:

- Notes show publication dates and times in each visitor's browser time zone.
- Publication instants remain stored in UTC (`published_at`) and the rendered HTML uses semantic `<time datetime="...">` elements.
- When JavaScript is disabled, invalid, or unavailable, Notes retain a clearly labeled UTC time.
- The public Notes index and individual Notes pages use the same formatter.
- Notes are explicitly laid out in a single vertical column, newest post first, at every viewport size.
- No changes to GitHub sign-in, Cloudflare credentials, R2 photo objects, public project photos, or note JSON records.

## Installing on the live site

1. Back up or commit/push any pending local changes first.
2. Extract the V23A **safe update** ZIP.
3. Copy all contents into your local `photos-1` GitHub Desktop repository, preserving folder paths.
4. To actually remove V23-retired routes/workflows, review then run `REMOVE_RETIRED_FILES_V23.cmd` from the repository root (or delete the exact nine paths in `UPGRADE_V23.md`).
5. Review GitHub Desktop changes, commit with message `Clean up admin and localize Notes dates (V23A)`, and Push origin.
6. Wait for Cloudflare Pages production deploy to succeed and refresh `/notes/` and an individual note.

Only code is replaced. The archive does **not** contain `content/` or `media/` and does not alter R2.

## Timezone details

The browser's `Intl.DateTimeFormat` uses its default locale and time zone. The title/tooltip keeps the original UTC time. The date may change (including to the previous or following day) based on the visitor's location. Existing note order stays newest-first according to UTC publishing instants, so sorting is consistent worldwide.

## Tests

- `npm test`
- `python3 tests/browser_v23a.py` (requires Playwright Chromium)
- `python3 build.py`
