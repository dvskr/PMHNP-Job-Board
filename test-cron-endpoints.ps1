# PowerShell test script for Vercel Cron endpoints
# Make sure your dev server is running: npm run dev
# Set your CRON_SECRET in .env.local

# Load CRON_SECRET from .env.local
$envFile = Get-Content .env.local -ErrorAction SilentlyContinue
$cronSecret = $envFile | Where-Object { $_ -match "^CRON_SECRET=" } | ForEach-Object { $_.Split('=')[1] }

if (-not $cronSecret) {
    Write-Host "ERROR: CRON_SECRET not found in .env.local" -ForegroundColor Red
    Write-Host "Please add: CRON_SECRET=your-secret-key-here"
    exit 1
}

$baseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:3000" }
$headers = @{ "Authorization" = "Bearer $cronSecret" }

Write-Host "`nTesting Cron Endpoints...`n" -ForegroundColor Yellow

# Test 1: Ingest Jobs
Write-Host "1. Testing /api/cron/ingest-jobs" -ForegroundColor Yellow
Write-Host '   Schedule: Every 6 hours (0 */6 * * *)'
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/cron/ingest-jobs" -Headers $headers -Method Get
    Write-Host "   ✓ Success ($($response.StatusCode))" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)"
} catch {
    Write-Host "   ✗ Failed ($($_.Exception.Response.StatusCode.value__))" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)"
}
Write-Host ""

# Test 2: Send Alerts
Write-Host "2. Testing /api/cron/send-alerts" -ForegroundColor Yellow
Write-Host '   Schedule: Daily at 8:00 AM (0 8 * * *)'
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/cron/send-alerts" -Headers $headers -Method Get
    Write-Host "   ✓ Success ($($response.StatusCode))" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)"
} catch {
    Write-Host "   ✗ Failed ($($_.Exception.Response.StatusCode.value__))" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)"
}
Write-Host ""

# Test 3: Expiry Warnings
Write-Host "3. Testing /api/cron/expiry-warnings" -ForegroundColor Yellow
Write-Host '   Schedule: Daily at 9:00 AM (0 9 * * *)'
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/cron/expiry-warnings" -Headers $headers -Method Get
    Write-Host "   ✓ Success ($($response.StatusCode))" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)"
} catch {
    Write-Host "   ✗ Failed ($($_.Exception.Response.StatusCode.value__))" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)"
}
Write-Host ""

# Test 4: Cleanup Expired
Write-Host "4. Testing /api/cron/cleanup-expired" -ForegroundColor Yellow
Write-Host '   Schedule: Daily at 2:00 AM (0 2 * * *)'
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/cron/cleanup-expired" -Headers $headers -Method Get
    Write-Host "   ✓ Success ($($response.StatusCode))" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)"
} catch {
    Write-Host "   ✗ Failed ($($_.Exception.Response.StatusCode.value__))" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)"
}
Write-Host ""

Write-Host "Testing complete!" -ForegroundColor Yellow

