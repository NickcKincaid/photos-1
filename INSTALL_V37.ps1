$ErrorActionPreference='Stop'
Write-Host 'V37 - Comprehensive reliability and security sweep' -ForegroundColor Cyan
Write-Host 'Includes V36d. Does not check changelog history or overwrite content/media.'
$repoPath=(Read-Host 'Full path to your photos-1 repository').Trim().Trim('"').Trim("'")
if (-not (Test-Path -LiteralPath (Join-Path $repoPath '.git'))) { throw 'This folder is not a Git repository. Clone photos-1 with GitHub Desktop first.' }
$repoPath=(Resolve-Path -LiteralPath $repoPath).Path
$payload=Join-Path $PSScriptRoot 'files'
function Hash-Text([string] $path) {
  $raw=[System.IO.File]::ReadAllText($path,[System.Text.Encoding]::UTF8)
  $normalized=$raw.TrimStart([char]0xFEFF).Replace("`r`n","`n").Replace("`r","`n")
  $bytes=[System.Text.Encoding]::UTF8.GetBytes($normalized)
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() } finally {$sha.Dispose()}
}
$entries=@(
  @{ Path='admin-lib/session.js'; Target='db4c3bb5b1b56269e15732aacff68148339338f90e3cc0595700e2acbb6eeaa3'; Allowed=@('78ad24c0073ca8af956d9307aba6e8770fdfe441b91bd206d7a8097db12c0a5f','db4c3bb5b1b56269e15732aacff68148339338f90e3cc0595700e2acbb6eeaa3') },
  @{ Path='functions/api/admin/backup.js'; Target='0ebccde5a97051e2e726b6fd6648b0ffd95db60d37d8e77df11132fe1aae3d55'; Allowed=@('198c13e8a0ca4b8e6bea211dee1135ef802aa09f4d182022a0c207872427f056') },
  @{ Path='functions/api/admin/save.js'; Target='b5d32b8f4fd5bd3edc496a7cc0e8e908cd0f5944fc110706fb6af8951c956081'; Allowed=@('4e24526b70611e9cf3aed21f92e7da3cd6926e3c3a3fd33f81e8a2144f7cd121','b5d32b8f4fd5bd3edc496a7cc0e8e908cd0f5944fc110706fb6af8951c956081') },
  @{ Path='functions/api/admin/storage.js'; Target='7d0421470f5870a2c39e0220ef7e6679ce15508f7ad5f30934d51d72a34829ae'; Allowed=@('d19005c59728937d3245796030550fe64f3e4c606a76718592633324b376bc84','7d0421470f5870a2c39e0220ef7e6679ce15508f7ad5f30934d51d72a34829ae') },
  @{ Path='functions/api/auth/callback.js'; Target='21fe22c798d634e225613dd180146f40a418e9958fa748f11636ed3ae00ff2c9'; Allowed=@('dac9e515dbf406c3f3f3fc05557ac9f9bee354530f5f24011b640302004e6265','21fe22c798d634e225613dd180146f40a418e9958fa748f11636ed3ae00ff2c9') },
  @{ Path='scripts/verify_metadata_backup.py'; Target='7bb6d2b825beca6835173982204390b05f0d24ba95b584bf519e2a1c3aeb607a'; Allowed=@('c32cd36d893befdb36b155ede0c9b8df059daf6a1f4517dbeaa7abb9e6ad6910') },
  @{ Path='static/admin.js'; Target='3b3bc346ca1aa50cf524a11fc75616790f00c5a99ca487b566849142978b5d65'; Allowed=@('3b48eea1edffdfe7b35c23414daaa9b68762b81e0940434a5f802f07a3e9a7b3') },
  @{ Path='static/admin-notes.js'; Target='b1915f048d9c45158dab76ff59a816618959382e243366dfee137b5aa8687b93'; Allowed=@('fea20fa18474ba2c27d78050210e74559ee1713da92adc43f14349bd27948ee2') },
  @{ Path='static/admin-storage.js'; Target='774b9a386b299d079937f851785aa8f3fcf9899a04d6fb2f31cb7852c1758b6c'; Allowed=@('42c3db7512582a6100fb41e82ec5defea62514bded8aa19b412f52a29e26dcdb') },
  @{ Path='tests/v24_api.test.mjs'; Target='9cb4cfe5df6faaae10955c1434277095c919c1e62ad9a4d61065c32982249593'; Allowed=@('102b49f7e2659b2b4890d3a1bc7b4b917a9acf61ddf690af447e176ccc703ca2') },
  @{ Path='tests/v36d_sweep.test.mjs'; Target='672247dcba4611f0db08d98b4234d0be846ea7621f37570c767d1d38aa1926ce'; Allowed=@() },
  @{ Path='tests/v37_quality.test.mjs'; Target='a75195556b6607dac019d87ce41e2d73f221e87a326569a743e8fb75603f7ee1'; Allowed=@() },
  @{ Path='tests/test_v37_quality.py'; Target='5539b068097aea3ac66423c75d63135b8ce9a095b84430f25595d71a53ae6054'; Allowed=@() }
)
$fail=@()
$pending=New-Object System.Collections.ArrayList
foreach($entry in $entries) {
  $source=Join-Path $payload $entry.Path
  $destination=Join-Path $repoPath $entry.Path
  if (-not (Test-Path -LiteralPath $source)) {throw "Update is incomplete: $($entry.Path)"}
  if ((Hash-Text $source) -ne $entry.Target) {throw "Update checksum mismatch: $($entry.Path)"}
  if (Test-Path -LiteralPath $destination) {
    $hash=Hash-Text $destination
    if ($hash -eq $entry.Target) {continue}
    if ($entry.Allowed -notcontains $hash) {$fail += $entry.Path;continue}
  } elseif($entry.Allowed.Count -gt 0) {
    $fail += $entry.Path
    continue
  }
  [void]$pending.Add($entry)
}
if($fail.Count -gt 0) {
  Write-Host 'STOPPED: Unexpected differences in these files:' -ForegroundColor Yellow
  $fail | ForEach-Object {Write-Host "  $_"}
  throw 'No files changed. Upload a fresh repository ZIP for a safe merge; do not replace these files blindly.'
}
Write-Host "Reviewed $($entries.Count) files; $($pending.Count) need updating."
if($pending.Count -eq 0) {Write-Host 'V37 source already installed.';exit 0}
$confirm=Read-Host 'Type INSTALL to back up and apply V37'
if($confirm -cne 'INSTALL') {Write-Host 'Cancelled; no changes made.';exit 0}
$parent=Split-Path -Parent $repoPath
$backup=Join-Path $parent ((Split-Path -Leaf $repoPath)+'-V37-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$completed=New-Object System.Collections.ArrayList
try {
  # Back up every replaced original *before* touching any source file.
  foreach($entry in $pending) {
    $from=Join-Path $repoPath $entry.Path
    if (Test-Path -LiteralPath $from) {
      $to=Join-Path $backup $entry.Path
      New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force | Out-Null
      Copy-Item -LiteralPath $from -Destination $to -Force
    }
  }
  foreach($entry in $pending) {
    $to=Join-Path $repoPath $entry.Path
    New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $payload $entry.Path) -Destination $to -Force
    [void]$completed.Add($entry)
  }
} catch {
  foreach($entry in $completed) {
    $to=Join-Path $repoPath $entry.Path
    $previous=Join-Path $backup $entry.Path
    if (Test-Path -LiteralPath $previous) {Copy-Item -LiteralPath $previous -Destination $to -Force}
    elseif (Test-Path -LiteralPath $to) {Remove-Item -LiteralPath $to -Force}
  }
  throw 'Install failed; completed copies have been rolled back. Inspect the backup folder. '+$_
}
Write-Host "V37 source installed. Backups: $backup" -ForegroundColor Green
Write-Host 'Review the changes in GitHub Desktop, commit, then Push origin.'
