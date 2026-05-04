# GSC URL Removal Tool — Upload Guide

## TL;DR — Path A (manual, fast removal)

The 3,724 verified-dead URLs are split into 4 daily batches. Process one per day:

| Day | File | URLs | Category |
|---:|---|---:|---|
| 1 | `gsc-removal-day1.txt` | 931 | Not found (404) |
| 2 | `gsc-removal-day2.txt` | 931 | Not found (404) |
| 3 | `gsc-removal-day3.txt` | 931 | Not found (404) + Server error (5xx) |
| 4 | `gsc-removal-day4.txt` | 928 | Server error (5xx) + Soft 404 + Indexed-blocked |

GSC quota is 1,000 URLs/property/day — each daily file is sized to fit safely under that ceiling.

**Realistic time per day: ~2.5–3 hours of clicking** (about 10 seconds per URL).
**Total over 4 days: ~10–12 hours of manual work.**

If that's too much, switch to Path B (cron — see bottom of this doc) for zero manual labor at the cost of slower drainage (~25 days instead of 4).



This is the safe alternative to prefix removal: per-URL submissions to GSC's
Removal Tool, where every URL has been HEAD-checked and confirmed to currently
return 4xx/5xx. No risk of accidentally hiding healthy ranking pages.

## Generated artifacts

After running `npx tsx scripts/verify-and-prepare-removal.ts`, you'll have:

| File | Purpose |
|---|---|
| `gsc-removal-candidates.csv` | URL + status + GSC source label, sorted by status |
| `gsc-removal-candidates.txt` | URLs only, one per line — easier to copy/paste |
| `gsc-still-alive-sample.txt` | Sample of URLs GSC reported broken but are actually alive — these we DO NOT remove |

## Uploading to GSC

GSC's Removal Tool UI does not accept bulk CSV upload — every URL must be
submitted individually. But the daily limit is 1,000 URLs, so for our 7,000+
candidates we'll need to spread submissions over ~7 days.

### Per-URL submission flow

1. Open https://search.google.com/search-console/removals
2. Verify the property selector at top reads `pmhnphiring.com`
3. Click **NEW REQUEST** (red button, top right)
4. Stay on the **TEMPORARILY REMOVE URL** tab
5. Paste a single URL into the text field
6. Select the radio: **Remove this URL only** (NOT prefix — we're being surgical)
7. Click **NEXT** → **SUBMIT**
8. Repeat with the next URL from `gsc-removal-candidates.txt`

Each submission appears in the table with status `Processing`, flips to
`Approved` within ~24h, and that URL drops from search results within hours
of approval.

### Recommended submission order

The script sorts the output by HTTP status — 404s first, then 410s, 5xx, etc.
Submit in that order so you clear the highest-volume category first.

### Pacing

- 1,000 URLs/day per property — that's the GSC quota
- Realistically: submitting one URL takes ~10 seconds of clicks
- 1,000 URLs/day × 10 sec = ~3 hours of click-work to max out the daily quota
- Total for 7,000 URLs: ~7 days × 3 hours = 21 hours of manual work

### If 21 hours of clicking sounds like too much

Two parallel paths reduce this:

#### Path A — Let the historical-deindex cron do most of the work

Re-run the verifier with `--enqueue`:

```bash
npx tsx scripts/verify-and-prepare-removal.ts --enqueue
```

This pushes every verified-dead URL into `deindex_queue`. The cron drains
~150/day automatically via Google Indexing API + IndexNow. **No clicking
required.** Slower (~50 days for 7,000 URLs), but zero manual labor.

#### Path B — Hybrid: top 1,000 by importance via GSC, rest via cron

1. Run `--enqueue` so the cron starts draining everything
2. Manually submit the top 1,000 URLs to GSC (the ones with most impressions)
3. Cron handles the long tail in the background

The fastest URLs (top impressions) come from `scripts/gsc-coverage-dump.ts`
— that script uses the GSC Search Console API to find which dead URLs are
actually losing traffic. Requires GSC service account setup (see script header).

### Daily quota tracking

GSC doesn't show a "quota remaining" counter, but you can tell you've hit it
when the SUBMIT button starts returning errors. The quota resets at midnight
Pacific Time.

### Submission status meanings

| Status | Meaning |
|---|---|
| **Processing** | Just submitted; GSC reviewing |
| **Approved** | Removed from search results (~6 months) |
| **Denied** | Google decided not to honor — usually because URL didn't actually exist or removal would harm a real query |
| **Expired** | The 6-month window ended; URL re-appears in search if still indexable |

For our use case, **Denied is fine** — it means the URL was already de-indexed
by other means (our 410 middleware, IndexNow ping, etc.) and Google didn't
need to formally process the removal.

## Verifying outcomes

Re-fetch GSC's Coverage report 7 days after starting submissions. The
"Not found (404)" count should drop by approximately the number of
verified-dead URLs you've submitted. If the count isn't dropping, check:

1. The submitted URLs — were they actually returning 4xx when GSC checked?
2. The 410 middleware — is it firing for those paths?
3. The historical-deindex cron — is it running and submitting URL_DELETED?

## Resubmitting after the 6-month window

When the 6-month removal expires, URLs re-appear in search if they're still
indexable. By that point, our 410 middleware + sitemap exclusion + cron should
have permanently de-indexed them. If a URL re-appears in search:

1. HEAD-check it again — it should still return 410
2. If still 410, just resubmit via the Removal Tool (or wait for the cron)
3. If now 200, that's a regression — the URL came back; investigate why
