# Run from inside your existing photos-1 repository root after copying the V32 overlay.
# This ONLY changes the visible name of Contact Sheet to Fit All; internal CSS classes stay stable.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$must = @('build.py','static/site.js','static/style.css','static/admin-describe.js','functions/api/admin/describe.js','functions/api/admin/deployment.js','static/admin-deployment.js')
try {
  foreach($relative in $must) {
    if(-not (Test-Path -LiteralPath (Join-Path $root $relative) -PathType Leaf)) {
      throw "Missing $relative. Extract V32 into the root of your existing V31 photography repository, not inside another folder."
    }
  }
  $describe = [System.IO.File]::ReadAllText((Join-Path $root 'functions/api/admin/describe.js'))
  if(-not $describe.Contains('V32: authenticated')) {throw 'The V32 backend file was not copied. Follow the installation guide first.'}
  $build = [System.IO.File]::ReadAllText((Join-Path $root 'build.py'))
  $viewer = [System.IO.File]::ReadAllText((Join-Path $root 'static/site.js'))
  if(-not $build.Contains('contact-sheet-toggle') -or -not $viewer.Contains('is-contact-sheet')) {
    throw 'V31 Contact Sheet functionality was not detected. Install V31 first, then V32.'
  }
  $backup = Join-Path $env:TEMP ('portfolio-v32-backup-' + [guid]::NewGuid().ToString('N'))
  [System.IO.Directory]::CreateDirectory($backup) | Out-Null
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $regex = [System.Text.RegularExpressions.Regex]::new('(?<![A-Za-z0-9_-])contact\s+sheets?\b', ([System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::CultureInvariant))
  $total = 0
  foreach($relative in @('build.py','static/site.js','static/style.css')) {
    $path = Join-Path $root $relative
    $original = [System.IO.File]::ReadAllText($path)
    $matches = $regex.Matches($original).Count
    if($matches -gt 0) {
      $backupFile = Join-Path $backup $relative
      [System.IO.Directory]::CreateDirectory((Split-Path -Parent $backupFile)) | Out-Null
      [System.IO.File]::WriteAllText($backupFile,$original,$utf8)
      $updated = $regex.Replace($original,'Fit All')
      [System.IO.File]::WriteAllText($path,$updated,$utf8)
      $total += $matches
      Write-Host ("Renamed {0} visible labels in {1}" -f $matches,$relative)
    }
  }
  # Leave content/projects, media, live photos, secrets and other source files untouched.
  $changelog=Join-Path $root 'CHANGELOG.md'
  if(Test-Path -LiteralPath $changelog) {
    $old=[System.IO.File]::ReadAllText($changelog)
    if(-not $old.Contains('## V32 - Fit All and AI descriptions repair')) {
      $note=@'
## V32 - Fit All and AI descriptions repair (2026-10-20)

- Renamed the visible compact-gallery control to Fit All, preserving its internal selectors and layout.
- Repaired Cloudflare Workers AI photo descriptions using the documented LLaVA byte-array image input and description response.
- Detailed per-photo errors, bounded previews, cancellation and early exit for quota/configuration failures.
- Hardened private deployment-status polling and clarified Cloudflare API configuration errors.
- Added V32 regression tests, safety checks and rollout documentation.

'@
      [System.IO.File]::WriteAllText($changelog,($note+"`r`n"+$old),$utf8)
    }
  }
  $newBuild=[System.IO.File]::ReadAllText((Join-Path $root 'build.py'))
  $newViewer=[System.IO.File]::ReadAllText((Join-Path $root 'static/site.js'))
  if(-not $newBuild.Contains('Fit All') -or -not $newViewer.Contains('Fit All')) {
    throw 'Fit All label not found in both source files after patch. Inspect the changes before pushing.'
  }
  Write-Host ''
  Write-Host 'V32 application complete. Your published photographs and GitHub project JSON were not modified.' -ForegroundColor Green
  Write-Host ('Renamed {0} visible labels. Backup of originals: {1}' -f $total,$backup)
  Write-Host 'Review GitHub Desktop changes, run npm test and python3 build.py if installed, then commit and push.'
  exit 0
} catch {
  Write-Host ('V32 ERROR: '+$_.Exception.Message) -ForegroundColor Red
  exit 1
}
