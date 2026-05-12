# Run ATS tenant discovery against the production DB.
#
# Reads PROD_DATABASE_URL from .env.prod, assigns it to DATABASE_URL,
# and runs scripts/discover-ats-tenants-from-db.ts. Writes the full
# output (stdout+stderr) to tmp/ats-disco-2.log.
#
# Read-only — the discovery script only does SELECT queries.
#
# Usage from repo root:
#   .\scripts\run-prod-discovery.ps1

$ErrorActionPreference = 'Stop'

if (-not (Test-Path .env.prod)) {
    Write-Error '.env.prod not found in current directory. Run this from repo root.'
    exit 1
}

# Extract the URL value robustly (works regardless of quoting around it).
$line = Get-Content .env.prod | Where-Object { $_ -match '^PROD_DATABASE_URL=' } | Select-Object -First 1
if (-not $line) {
    Write-Error 'PROD_DATABASE_URL not found in .env.prod'
    exit 1
}
$prodUrl = $line -replace '^PROD_DATABASE_URL=', '' -replace '^"|"$', ''
$env:DATABASE_URL = $prodUrl

if (-not (Test-Path tmp)) { New-Item -ItemType Directory -Path tmp | Out-Null }
$logPath = 'tmp/ats-disco-2.log'

Write-Host "Running discovery -> $logPath"
Write-Host "(this scans 34k jobs + ~2.85M rejected_jobs URLs, ~1-2 min)"

npx tsx scripts/discover-ats-tenants-from-db.ts *> $logPath
$exit = $LASTEXITCODE

if ($exit -eq 0) {
    Write-Host ''
    Write-Host "Done. Tail of $logPath :"
    Get-Content $logPath -Tail 10
} else {
    Write-Host "npx tsx exited with code $exit. Last 30 lines:"
    Get-Content $logPath -Tail 30
}
