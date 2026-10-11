param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($workspaceRoot -ne 'D:\PYTHON\SPORTSPACE') { throw 'Unexpected workspace; cleanup scope must be reviewed.' }
$receiptPath = Join-Path $workspaceRoot 'docs\local-data-sync-manifest.json'
$syncManifest = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if ($syncManifest.localDeletedAt) { throw 'Cleanup already completed; do not rerun it.' }
if ($syncManifest.project -ne 'dzpbnvpqkwsjlvdxwwub' -or !$syncManifest.verified -or !$syncManifest.verifiedAt) { throw 'Remote archive has not been verified.' }
$allowedRoots = @('src\data', 'docs\data', 'data_export') | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $workspaceRoot $_)) + '\' }
$extraTarget = Join-Path $workspaceRoot 'functions\courts_prices.csv'
$validatedTargets = New-Object 'System.Collections.Generic.List[string]'
$seenTargets = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$checkedParents = @{}
$checkedCount = 0
$removedBytes = [long]0
foreach ($entry in $syncManifest.files) {
  $target = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $entry.path))
  $inside = $target -eq $extraTarget
  foreach ($allowedRoot in $allowedRoots) { if ($target.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { $inside = $true } }
  if (!$inside -or !$seenTargets.Add($target)) { throw "Unsafe or duplicate cleanup target: $($entry.path)" }
  if (!(Test-Path -LiteralPath $target -PathType Leaf)) { throw "Archived file missing locally: $($entry.path)" }
  $item = Get-Item -LiteralPath $target -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -ne $entry.bytes) { throw "File type or size changed: $($entry.path)" }
  $parent = $item.Directory
  while ($parent.FullName -ne $workspaceRoot) {
    if (!$parent.FullName.StartsWith($workspaceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Parent outside workspace' }
    if (!$checkedParents.ContainsKey($parent.FullName)) {
      if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing reparse-point parent' }
      $checkedParents[$parent.FullName] = $true
    }
    $parent = $parent.Parent
  }
  $actualHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($actualHash -ne $entry.sha256) { throw "Local contents changed; keep the file: $($entry.path)" }
  $validatedTargets.Add($target)
  $removedBytes += $item.Length
  $checkedCount++
  if ($checkedCount % 250 -eq 0) { Write-Output "Checked $checkedCount / $($syncManifest.files.Count) local files" }
}
if (!$Remove) { Write-Output "Dry run: $checkedCount verified files, $removedBytes bytes. Nothing deleted."; exit }
# Exact validated file paths only; no recursive delete and no shell handoff.
Remove-Item -LiteralPath $validatedTargets.ToArray() -Force
# Keep only a compact recovery receipt locally. The full manifest stays private
# on Supabase, so no copy of the dataset or its full inventory remains here.
$compactReceipt = [ordered]@{
  id = $syncManifest.id
  project = $syncManifest.project
  verified = $true
  verifiedAt = $syncManifest.verifiedAt
  localDeletedAt = [DateTime]::UtcNow.ToString('o')
  fileCount = $checkedCount
  originalBytes = $removedBytes
  catalogDigest = $syncManifest.catalogDigest
}
$compactReceipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding ASCII
Write-Output "Removed $checkedCount verified local data files ($removedBytes bytes). Recoverable from Supabase archive $($syncManifest.id)."
