# V25A — Horn favicon + header icon (combined)

This update INCLUDES all of V25 and adds the same horn image to the left of the site title on all public pages. You do not need to install V25 separately.

## Installation

1. Extract this ZIP.
2. In GitHub Desktop, select `photos-1`, then Repository > Show in Explorer.
3. Copy `build.py` and the `static` folder from this extracted ZIP into the repository root. Merge folders and replace matching files.
4. Review changes. In the Summary box enter `V25A - Add horn favicon and header mark`.
5. Click Commit to main and Push origin (pull first if GitHub Desktop asks).
6. Wait for Cloudflare Pages to deploy successfully, then refresh nickckincaid.com and check the homepage, Notes, and a project page.

## What's included

- Browser favicon and Apple home-screen icon based on your supplied artwork.
- An 18px horn mark to the left of the bold site name, with an 8px gap.
- The existing navigation, photographs, Notes, admin login, and Cloudflare R2 remain as they are.

This patch does not include or overwrite `content/`, `media/`, project records, Notes, or Cloudflare secrets.

If the favicon does not update immediately, browsers sometimes cache it; try a private tab.
