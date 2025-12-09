# Testing Cron Endpoints

This guide explains how to test all 4 Vercel Cron endpoints locally before deploying.

## Prerequisites

1. **Dev server running:**
   ```bash
   npm run dev
   ```

2. **Set CRON_SECRET in `.env.local`:**
   ```env
   CRON_SECRET=your-secret-key-here
   ```
   
   Generate a secure secret:
   ```bash
   # Option 1: Use OpenSSL
   openssl rand -base64 32
   
   # Option 2: Use Node.js
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

## Automated Testing

### Linux/Mac (Bash):
```bash
chmod +x test-cron-endpoints.sh
./test-cron-endpoints.sh
```

### Windows (PowerShell):
```powershell
.\test-cron-endpoints.ps1
```

## Manual Testing with cURL

Replace `YOUR_CRON_SECRET` with your actual secret from `.env.local`:

### 1. Test Job Ingestion
**Endpoint:** `/api/cron/ingest-jobs`  
**Schedule:** Every 6 hours (0 */6 * * *)  
**Purpose:** Fetch jobs from Adzuna, USAJobs, Greenhouse, Lever

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/ingest-jobs
```

**Expected Response:**
```json
{
  "success": true,
  "summary": {
    "adzuna": { "added": 23, "updated": 5, "skipped": 2 },
    "usajobs": { "added": 45, "updated": 12, "skipped": 1 },
    "greenhouse": { "added": 15, "updated": 3, "skipped": 0 },
    "lever": { "added": 18, "updated": 7, "skipped": 1 },
    "timestamp": "2025-01-08T12:00:00.000Z"
  }
}
```

### 2. Test Job Alerts
**Endpoint:** `/api/cron/send-alerts`  
**Schedule:** Daily at 8:00 AM (0 8 * * *)  
**Purpose:** Send email alerts to subscribers with matching jobs

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/send-alerts
```

**Expected Response:**
```json
{
  "success": true,
  "alertsSent": 145,
  "alertsSkipped": 23,
  "errors": [],
  "timestamp": "2025-01-08T08:00:00.000Z"
}
```

### 3. Test Expiry Warnings
**Endpoint:** `/api/cron/expiry-warnings`  
**Schedule:** Daily at 9:00 AM (0 9 * * *)  
**Purpose:** Send warnings to employers about jobs expiring in 5 days

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/expiry-warnings
```

**Expected Response:**
```json
{
  "success": true,
  "warningsSent": 23,
  "errors": [],
  "timestamp": "2025-01-08T09:00:00.000Z"
}
```

### 4. Test Cleanup Expired
**Endpoint:** `/api/cron/cleanup-expired`  
**Schedule:** Daily at 2:00 AM (0 2 * * *)  
**Purpose:** Unpublish jobs past their expiration date

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/cleanup-expired
```

**Expected Response:**
```json
{
  "success": true,
  "expiredCount": 15,
  "timestamp": "2025-01-08T02:00:00.000Z"
}
```

## Verifying Authorization

### Test with Invalid Secret (Should Return 401):
```bash
curl -H "Authorization: Bearer wrong-secret" http://localhost:3000/api/cron/send-alerts
```

**Expected Response:**
```json
{
  "error": "Unauthorized"
}
```

### Test without Authorization Header (Should Return 401):
```bash
curl http://localhost:3000/api/cron/send-alerts
```

**Expected Response:**
```json
{
  "error": "Unauthorized"
}
```

## Deployment to Vercel

1. **Add CRON_SECRET to Vercel:**
   ```bash
   vercel env add CRON_SECRET production
   ```
   Or via Vercel Dashboard: Settings → Environment Variables

2. **Deploy:**
   ```bash
   git push origin main
   # or
   vercel --prod
   ```

3. **Verify Cron Jobs:**
   - Go to Vercel Dashboard → Your Project → Cron Jobs
   - You should see all 4 cron jobs listed
   - Check execution logs after scheduled times

## Troubleshooting

### "Unauthorized" Error
- Check `CRON_SECRET` in `.env.local` matches your request
- Ensure authorization header format: `Bearer YOUR_SECRET`
- No extra spaces or quotes in the secret

### "Failed to create checkout" or Payment Errors
- If testing with `ENABLE_PAID_POSTING=false`, checkout endpoints will be blocked
- This is expected behavior in free mode

### No Jobs Found
- `ingest-jobs`: Check API credentials for external sources
- `send-alerts`: Create test job alerts in database
- `expiry-warnings`: Set job `expiresAt` to 5 days from now for testing
- `cleanup-expired`: Set job `expiresAt` to past date for testing

### Email Not Sending
- Check `RESEND_API_KEY` in `.env.local`
- Verify `EMAIL_FROM` domain is verified in Resend
- Check Resend dashboard for delivery logs

## Monitoring in Production

### Vercel Dashboard
- **Cron Jobs Tab**: View execution history
- **Logs**: Check for errors in function logs
- **Analytics**: Monitor function duration and success rates

### Recommended Monitoring
- Set up Vercel notifications for cron failures
- Monitor email delivery rates in Resend
- Track job ingestion statistics
- Alert on high error rates

## Cron Schedule Summary

| Endpoint | Schedule | Time (UTC) | Purpose |
|----------|----------|------------|---------|
| `ingest-jobs` | `0 */6 * * *` | Every 6 hours | Aggregate new jobs |
| `send-alerts` | `0 8 * * *` | 8:00 AM daily | Email job alerts |
| `expiry-warnings` | `0 9 * * *` | 9:00 AM daily | Warn employers |
| `cleanup-expired` | `0 2 * * *` | 2:00 AM daily | Unpublish expired |

**Note:** Times are in UTC. Adjust for your timezone when planning around these schedules.

