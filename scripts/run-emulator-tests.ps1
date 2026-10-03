$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$portableJava = Join-Path $workspacePath '.tools/java'
if (Test-Path -LiteralPath $portableJava) {
  $javaExecutable = Get-ChildItem -LiteralPath $portableJava -Filter java.exe -Recurse | Select-Object -First 1
  if ($javaExecutable) { $env:PATH = $javaExecutable.DirectoryName + [IO.Path]::PathSeparator + $env:PATH }
}
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Java 21+ required on PATH or in .tools/java.' }
$env:DEBUG = ''
$env:CI = 'true'
$env:FIREBASE_CLI_DISABLE_USAGE_REPORTING = 'true'
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
Get-ChildItem Env: | Where-Object { $_.Name -match '(?i)(token|secret|password|credential|api_key)' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
Set-Location -LiteralPath $workspacePath
& npm.cmd exec -- firebase emulators:exec --project demo-sportspace --only firestore,storage,auth,functions 'node --test test/integration.test.mjs && node scripts/browser-smoke.mjs && node scripts/audit-data.mjs --input test-results/snapshot.json --output test-results/audit.json'
exit $LASTEXITCODE
