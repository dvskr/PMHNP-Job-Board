# Test the description cleanup endpoint
# Read CRON_SECRET from .env.local
if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match "^CRON_SECRET=(.+)$") {
            $env:CRON_SECRET = $matches[1]
        }
    }
}

if (-not $env:CRON_SECRET) {
    Write-Host "ERROR: CRON_SECRET not set. Please add it to .env.local" -ForegroundColor Red
    exit 1
}

Write-Host "Testing Description Cleanup Endpoint..." -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $env:CRON_SECRET"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/cron/cleanup-descriptions" -Method POST -Headers $headers
    
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Results:" -ForegroundColor Cyan
    Write-Host "  Total jobs:    $($response.total)" -ForegroundColor White
    Write-Host "  Cleaned:       $($response.cleaned)" -ForegroundColor Green
    Write-Host "  Skipped:       $($response.skipped)" -ForegroundColor Blue
    Write-Host "  Errors:        $($response.errors)" -ForegroundColor Red
    Write-Host "  Timestamp:     $($response.timestamp)" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

