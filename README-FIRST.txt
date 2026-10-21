V32 - Photography Portfolio | Fit All + Workers AI Repair
======================================================

WHAT THIS ZIP IS
A code-only update overlay for your existing V31 photo website. This package
INCLUDES V31a's visible 'Contact Sheet' -> 'Fit All' name change. You do not
need to install the separate V31a updater.

INSTALL (WINDOWS / GITHUB DESKTOP)
1) Create a backup or commit your current changes in GitHub Desktop.
2) Open GitHub Desktop > Repository > Show in Explorer.
3) Extract this ZIP. COPY THE CONTENTS (not the outer folder) into the top
   level of the photos-1 repo, alongside build.py and static/.
4) Replace matching code files when Windows asks.
5) Double-click Apply-V32.bat from the root of your repo. This renames the
   public control to Fit All without breaking its internal CSS/JS selectors.
6) Review all changed files in GitHub Desktop. Ensure content/projects/*.json,
   media/, existing photos, OAuth and secrets are NOT changed.
7) If Python/Node are installed: run `npm test` and `python3 build.py`.
8) Commit 'V32 - Fit All, AI descriptions repair and reliability cleanup'.
9) Push origin; Cloudflare Pages deploys as before.

AFTER DEPLOY
- Cloudflare Pages > Production > Settings > Bindings: Workers AI named AI.
- Redeploy after adding/modifying the AI binding.
- /admin/: Open a project, click Generate missing descriptions, try one image.
- Check individual error details. AI model now uses @cf/llava-hf/... with no
  Meta model agreement required. Text remains unsaved until Save project.
- Cloudflare deployment status still needs CF_ACCOUNT_ID, CF_PAGES_PROJECT,
  and encrypted CF_PAGES_READ_TOKEN with Pages Read permission.

SCOPE / HONEST LIMITS
The source paths and original V31 code were checked against your public GitHub
repository. This package does not include private R2 objects, content JSON,
OAuth credentials, or the complete repository. Tests use mocked Cloudflare AI;
LIVE inference and Pages authentication must be verified after deployment.
No server AI requests run just by installing this ZIP.

OPTIONAL DEEPER LOCAL SWEEP
After Apply-V32.bat, double-click Audit-V32.bat if you have Python 3.
It checks all your current repository's Python/JS syntax, JSON structure,
metadata completeness and V32 labels without changing any content.
The V32 repair includes mock regression tests; full tests need `npm test`.
