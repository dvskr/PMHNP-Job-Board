# Test CareerJet API Integration
# Set your secrets here or load from .env.local

# Read CRON_SECRET from .env.local if it exists
if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match "^CRON_SECRET=(.+)$") {
            $env:CRON_SECRET = $matches[1]
        }
        if ($_ -match "^CAREERJET_AFFILIATE_ID=(.+)$") {
            $env:CAREERJET_AFFILIATE_ID = $matches[1]
        }
    }
}

Write-Host "Testing CareerJet API Integration..." -ForegroundColor Cyan
Write-Host ""

# Check if CRON_SECRET is set
if (-not $env:CRON_SECRET) {
    Write-Host "ERROR: CRON_SECRET not set. Please add it to .env.local" -ForegroundColor Red
    exit 1
}

if (-not $env:CAREERJET_AFFILIATE_ID) {
    Write-Host "WARNING: CAREERJET_AFFILIATE_ID not set in .env.local" -ForegroundColor Yellow
}

# Make the API request
$headers = @{
    "Authorization" = "Bearer $env:CRON_SECRET"
    "Content-Type" = "application/json"
}

$body = @{
    sources = @("careerjet")
} | ConvertTo-Json

Write-Host "Making request to http://localhost:3000/api/ingest..." -ForegroundColor Cyan
Write-Host "NOTE: This may take 1-2 minutes (fetching up to 9 pages with rate limiting)" -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/ingest" -Method POST -Headers $headers -Body $body
    
    Write-Host ""
    Write-Host "✅ Success! Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
    
} catch {
    Write-Host ""
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Yellow
    }
}

