# Test All Job Sources
# Set your secrets here or load from .env.local

# Read credentials from .env.local if it exists
if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match "^CRON_SECRET=(.+)$") {
            $env:CRON_SECRET = $matches[1]
        }
    }
}

Write-Host "Testing ALL Job Sources..." -ForegroundColor Cyan
Write-Host "Sources: Adzuna, USAJobs, Greenhouse, Lever, Jooble" -ForegroundColor Yellow
Write-Host ""

# Check if CRON_SECRET is set
if (-not $env:CRON_SECRET) {
    Write-Host "ERROR: CRON_SECRET not set. Please add it to .env.local" -ForegroundColor Red
    exit 1
}

# Make the API request
$headers = @{
    "Authorization" = "Bearer $env:CRON_SECRET"
    "Content-Type" = "application/json"
}

# Fetch from all sources
$body = @{
    sources = @("adzuna", "usajobs", "greenhouse", "lever", "jooble")
} | ConvertTo-Json

Write-Host "Making request to http://localhost:3000/api/ingest..." -ForegroundColor Cyan
Write-Host "NOTE: This may take several minutes to fetch from all sources" -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/ingest" -Method POST -Headers $headers -Body $body
    
    Write-Host ""
    Write-Host "SUCCESS! Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    $jsonResponse = $response.Content | ConvertFrom-Json
    
    # Display summary
    Write-Host ""
    Write-Host "SUMMARY BY SOURCE:" -ForegroundColor Cyan
    Write-Host ("=" * 60)
    foreach ($result in $jsonResponse.results) {
        $sourceName = $result.source.ToUpper()
        Write-Host ""
        Write-Host $sourceName -ForegroundColor Yellow
        Write-Host "  Added:   $($result.added)" -ForegroundColor Green
        Write-Host "  Skipped: $($result.skipped)" -ForegroundColor Blue
        Write-Host "  Errors:  $($result.errors)" -ForegroundColor Red
        Write-Host "  Total:   $($result.total)" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host ("=" * 60)
    Write-Host ""
    Write-Host "OVERALL TOTALS:" -ForegroundColor Cyan
    Write-Host "  Total Added:   $($jsonResponse.totals.added)" -ForegroundColor Green
    Write-Host "  Total Skipped: $($jsonResponse.totals.skipped)" -ForegroundColor Blue
    Write-Host "  Total Errors:  $($jsonResponse.totals.errors)" -ForegroundColor Red
    Write-Host "  Total Jobs:    $($jsonResponse.totals.total)" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Yellow
    }
}
