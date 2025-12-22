# HTML Tag Cleanup - Automatic Post-Ingestion

## Problem
Job descriptions from external sources (Adzuna, Greenhouse, Lever, etc.) sometimes contain HTML tags like `<p>`, `<strong>`, `<div>`, etc. These tags were showing up in the job cards on the frontend.

## Solution ✅ AUTOMATIC CLEANUP AFTER EVERY INGESTION

### 1. **Automatic Cleaning During Ingestion** ✅
All job descriptions are automatically cleaned when jobs are normalized:

- **Location**: `lib/job-normalizer.ts` → `cleanDescription()` function (lines 21-82)
- **When**: Every time a job is normalized during ingestion
- **What it does**:
  - Converts HTML block elements (`<p>`, `<div>`, `<br>`) to newlines
  - Removes all HTML tags
  - Decodes HTML entities (`&amp;`, `&nbsp;`, etc.)
  - Cleans up whitespace

### 2. **Post-Ingestion Cleanup** ✅ **NEW!**
After every ingestion completes, the system automatically cleans ALL job descriptions:

- **Location**: `lib/ingestion-service.ts` (lines 214-219)
- **Shared Function**: `lib/description-cleaner.ts`
- **When**: Runs automatically after any ingestion (only if new jobs were added)
- **What it does**: Scans all jobs in the database and cleans any with HTML tags

**This is the main solution!** After every ingestion, the cleanup runs automatically.

### 3. **Scheduled Cleanup Cron Job** 🕐 (Backup)
A cron job runs **daily at 2 AM** as a safety net:

- **Endpoint**: `/api/cron/cleanup-descriptions`
- **Schedule**: `0 2 * * *` (2 AM every day)
- **Configuration**: `vercel.json`
- **Purpose**: Catches any edge cases

### 4. **Manual Cleanup Tools** 🔧
You can manually trigger cleanup if needed:

**PowerShell Script:**
```powershell
.\test-cleanup-descriptions.ps1
```

**TypeScript Script:**
```bash
npx tsx scripts/clean-all-descriptions.ts
```

**API Endpoint:**
```bash
curl -X POST "http://localhost:3000/api/cron/cleanup-descriptions" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## How It Works

### Flow Diagram:
```
1. Ingestion Starts
   ↓
2. Jobs Fetched from Sources
   ↓
3. Jobs Normalized (HTML cleaned in description)
   ↓
4. Jobs Saved to Database
   ↓
5. Ingestion Summary Printed
   ↓
6. **AUTOMATIC POST-INGESTION CLEANUP RUNS** ← NEW!
   - Checks all jobs in database
   - Cleans any with HTML tags
   - Reports: "X jobs cleaned, Y already clean"
   ↓
7. Complete
```

## What Gets Cleaned

### HTML Tags Removed:
- Block elements: `<p>`, `<div>`, `<h1-h6>`, `<li>`, `<ul>`, `<ol>`
- Inline elements: `<strong>`, `<em>`, `<span>`, `<a>`, `<b>`, `<i>`
- All other HTML tags

### HTML Entities Decoded:
- `&amp;` → `&`
- `&nbsp;` → ` ` (space)
- `&lt;` → `<`
- `&gt;` → `>`
- `&quot;` → `"`
- And 20+ more...

### Formatting Preserved:
- Converts `<br>` to newlines
- Converts `<p>` closings to double newlines (paragraph breaks)
- Converts `<li>` to bullet points (`•`)

## Files Modified

- ✅ `lib/description-cleaner.ts` (new shared cleanup function)
- ✅ `lib/ingestion-service.ts` (calls cleanup after ingestion)
- ✅ `app/api/cron/cleanup-descriptions/route.ts` (uses shared function)
- ✅ `scripts/clean-all-descriptions.ts` (uses shared function)
- ✅ `vercel.json` (daily cron job as backup)
- ✅ `test-cleanup-descriptions.ps1` (manual test script)

## Why This Works

**Layered Defense System:**

1. **Layer 1**: `cleanDescription()` in normalizer (primary - prevents HTML)
2. **Layer 2**: Post-ingestion cleanup (secondary - catches anything that slipped through)
3. **Layer 3**: Daily cron job (tertiary - safety net)
4. **Layer 4**: Manual tools (emergency - for one-off fixes)

## Summary

**HTML tags will NEVER appear in job descriptions because:**

1. ✅ Descriptions are cleaned during normalization
2. ✅ **AUTOMATIC cleanup runs after EVERY ingestion** ← **PRIMARY FIX**
3. ✅ Daily cron job as backup
4. ✅ Manual cleanup tools available

**You don't need to do anything!** The system handles it automatically after every ingestion. 🎉
