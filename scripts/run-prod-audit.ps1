# Run the prod catalog quality audit.
#
# Reads PROD_DATABASE_URL from .env.prod, sets DATABASE_URL, runs
# scripts/audit-catalog-quality.ts. Writes full output to
# tmp/catalog-audit.log (read-only — no DB writes).
#
# Usage from repo root:
#   .\scripts\run-prod-audit.ps1

$ErrorActionPreference = 'Stop'

if (-not (Test-Path .env.prod)) {
    Write-Error '.env.prod not found in current directory. Run this from repo root.'
    exit 1
}

$line = Get-Content .env.prod | Where-Object { $_ -match '^PROD_DATABASE_URL=' } | Select-Object -First 1
if (-not $line) {
    Write-Error 'PROD_DATABASE_URL not found in .env.prod'
    exit 1
}
$prodUrl = $line -replace '^PROD_DATABASE_URL=', '' -replace '^"|"$', ''
$env:DATABASE_URL = $prodUrl

if (-not (Test-Path tmp)) { New-Item -ItemType Directory -Path tmp | Out-Null }
$logPath = 'tmp/catalog-audit.log'

Write-Host "Running catalog audit -> $logPath"
Write-Host "(read-only: scans published jobs, runs relevance + schema + SEO checks)"

npx tsx scripts/audit-catalog-quality.ts *> $logPath
$exit = $LASTEXITCODE

if ($exit -eq 0) {
    Write-Host ''
    Write-Host "Done. Tail of $logPath :"
    Get-Content $logPath -Tail 30
} else {
    Write-Host "Audit exited with code $exit. Last 50 lines:"
    Get-Content $logPath -Tail 50
}
