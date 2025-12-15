# Test parse-locations API endpoint
# Load environment variables
$envFile = Get-Content .env.local
foreach ($line in $envFile) {
    if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1]
        $value = $matches[2]
        Set-Item -Path "env:$key" -Value $value
    }
}

$cronSecret = $env:CRON_SECRET

if (-not $cronSecret) {
    Write-Host "ERROR: CRON_SECRET not found in .env.local" -ForegroundColor Red
    exit 1
}

Write-Host "Testing Parse Locations API..." -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $cronSecret"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-WebRequest `
        -Uri "http://localhost:3000/api/jobs/parse-locations" `
        -Method POST `
        -Headers $headers `
        -UseBasicParsing

    Write-Host "✅ Success! Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

