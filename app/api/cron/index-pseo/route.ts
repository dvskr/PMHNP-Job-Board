/**
 * pSEO URL Indexing Cron
 *
 * Submits high-quality pSEO city pages to Bing and IndexNow.
 *
 * Strategy:
 * - Uses the same quality gate as sitemap pruning: per-(category, city)
 *   pseoStats rows with ≥3 jobs, city population ≥10K, fresh aggregator data
 * - Tracks which URLs have been submitted via pseoStats to avoid re-submission
 * - Submits up to 100 NEW URLs per run, highest-score pages first
 * - Deliberately does NOT use the Google Indexing API: that API is restricted
 *   to JobPosting/BroadcastEvent pages, and these ItemList pSEO pages carry no
 *   JobPosting markup. Ineligible submissions risk throttling/revocation of
 *   the service account that powers expired-job URL_DELETED de-indexing
 *   (deindex-expired / historical-deindex). Google discovers these pages via
 *   the city sitemaps instead.
 *
 * Route: GET /api/cron/index-pseo
 * Auth: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CITIES } from '@/lib/pseo/city-data/cities';
import { MIN_JOBS_FOR_CATEGORY_CITY } from '@/lib/pseo/render-gate';
import { PSEO_INDEXING_CATEGORIES } from '@/lib/pseo/jobs-segments-edge';
import { pingBingBatch, pingIndexNow } from '@/lib/search-indexing';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// PSEO_INDEXING_CATEGORIES (imported above) is derived from the JOBS_TAXONOMY
// registry in lib/pseo/jobs-segments-edge.ts (pseoIndexing flag) — only broad
// categories with meaningful city-level coverage are flagged.

const MIN_JOBS = MIN_JOBS_FOR_CATEGORY_CITY; // SSOT: lib/pseo/render-gate.ts
const MIN_POPULATION = 10000;
const SUBMIT_CAP = 100; // URLs per run — keeps the 7-day dedupe window meaningful
// Mirrors PSEO_STALENESS_HOURS in /api/sitemaps/cities/[batch]/route.ts —
// stale aggregator rows must not resurrect URLs the sitemap already dropped.
const PSEO_STALENESS_HOURS = 36;

interface ScoredUrl {
  url: string;
  score: number; // Higher = more important
}

export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  const startTime = Date.now();
  console.log('[CRON:index-pseo] Starting pSEO URL indexing...');

  try {
    return await withCronTracking('index-pseo', async () => {
    // 1. Get quality-gated (category, city) combos from pseoStats — the same
    //    SSOT the sitemap batch route queries (/api/sitemaps/cities/[batch]).
    //    GSC Fix: the previous city-level Job groupBy ignored category, so a
    //    city with ≥3 total jobs got EVERY indexing category submitted —
    //    including 0-job combos that permanentRedirect(308) at crawl time.
    const freshnessThreshold = new Date(Date.now() - PSEO_STALENESS_HOURS * 60 * 60 * 1000);
    const categoryCityRows = await prisma.pseoStats.findMany({
      where: {
        type: 'category-city',
        totalJobs: { gte: MIN_JOBS },
        updatedAt: { gte: freshnessThreshold },
      },
      select: { categorySlug: true, locationSlug: true, totalJobs: true },
    });

    const indexingCategorySet = new Set<string>(PSEO_INDEXING_CATEGORIES);
    const cityBySlug = new Map(CITIES.map(c => [c.slug, c]));

    // 2. Build scored URL list — only pages meeting quality thresholds
    const scoredUrls: ScoredUrl[] = [];

    for (const row of categoryCityRows) {
      if (!indexingCategorySet.has(row.categorySlug)) continue;
      const city = cityBySlug.get(row.locationSlug);
      if (!city || city.population < MIN_POPULATION) continue;

      // Score: job count (0-40) + population tier (0-20) + MH shortage (0-15)
      let score = Math.min(40, row.totalJobs * 2);
      if (city.population >= 500000) score += 20;
      else if (city.population >= 100000) score += 15;
      else if (city.population >= 50000) score += 10;
      else score += 5;
      if (city.mentalHealthShortage) score += 15;

      scoredUrls.push({
        url: `${BASE_URL}/jobs/${row.categorySlug}/city/${city.slug}`,
        score,
      });
    }

    // Sort by score descending — submit highest-value pages first
    scoredUrls.sort((a, b) => b.score - a.score);

    // 3. Check which URLs have already been submitted recently
    //    We use a simple approach: check if the URL was submitted in the last 7 days
    //    by looking at existing pseoStats records with recent timestamps
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentlySubmitted = await prisma.pseoStats.findMany({
      where: {
        type: 'index-submitted',
        updatedAt: { gte: sevenDaysAgo },
      },
      select: {
        categorySlug: true,
        locationSlug: true,
      },
    });

    const submittedSet = new Set(
      recentlySubmitted.map(r => `${r.categorySlug}|${r.locationSlug}`)
    );

    // Filter out already-submitted URLs
    const newUrls = scoredUrls.filter(su => {
      // Extract category and city slug from URL
      const match = su.url.match(/\/jobs\/([^/]+)\/city\/([^/]+)$/);
      if (!match) return false;
      const key = `${match[1]}|${match[2]}`;
      return !submittedSet.has(key);
    });

    // Take only up to the cap
    const urlsToSubmit = newUrls.slice(0, SUBMIT_CAP);
    
    if (urlsToSubmit.length === 0) {
      console.log('[CRON:index-pseo] All qualifying URLs already submitted within 7 days');
      return {
        response: NextResponse.json({
          success: true,
          message: 'All qualifying pSEO URLs already submitted',
          totalQualifying: scoredUrls.length,
          newToSubmit: 0,
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          timestamp: new Date().toISOString(),
        }),
        metrics: {
          totalQualifying: scoredUrls.length,
          newToSubmit: 0,
          submitted: 0,
        },
      };
    }

    const urls = urlsToSubmit.map(su => su.url);

    console.log(`[CRON:index-pseo] Submitting ${urls.length} pSEO URLs (${scoredUrls.length} total qualifying, ${newUrls.length} new)`);

    // 4. Submit to Bing (batch). Google is intentionally excluded — see the
    //    header comment; discovery happens via the city sitemaps.
    const bingResults = await pingBingBatch(urls);

    // 5. Submit to IndexNow (batch)
    const indexNowResults = await pingIndexNow(urls);

    // 6. Track submitted URLs in DB so we don't re-submit
    for (const su of urlsToSubmit) {
      const match = su.url.match(/\/jobs\/([^/]+)\/city\/([^/]+)$/);
      if (!match) continue;
      
      try {
        await prisma.pseoStats.upsert({
          where: {
            type_categorySlug_locationSlug: {
              type: 'index-submitted',
              categorySlug: match[1],
              locationSlug: match[2],
            },
          },
          update: {
            totalJobs: su.score, // Reuse field to store score
            rawAvgSalary: 0,
            colAdjustedSalary: 0,
          },
          create: {
            type: 'index-submitted',
            categorySlug: match[1],
            locationSlug: match[2],
            totalJobs: su.score,
            rawAvgSalary: 0,
            colAdjustedSalary: 0,
          },
        });
      } catch {
        // Non-critical — continue
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const bingSuccess = bingResults.filter(r => r.success).length;
    const bingFailed = bingResults.filter(r => !r.success).length;
    const indexNowSuccess = indexNowResults.filter(r => r.success).length;
    const indexNowFailed = indexNowResults.filter(r => !r.success).length;

    const summary = {
      success: true,
      totalQualifying: scoredUrls.length,
      newToSubmit: newUrls.length,
      submitted: urls.length,
      bing: { submitted: bingSuccess, failed: bingFailed },
      indexNow: { submitted: indexNowSuccess, failed: indexNowFailed },
      topUrls: urls.slice(0, 5), // Show first 5 for debugging
      duration: `${duration}s`,
      timestamp: new Date().toISOString(),
    };

    console.log('[CRON:index-pseo] Complete:', JSON.stringify(summary));
    return {
      response: NextResponse.json(summary),
      metrics: {
        totalQualifying: scoredUrls.length,
        newToSubmit: newUrls.length,
        submitted: urls.length,
        bingSubmitted: bingSuccess,
        bingFailed,
        indexNowSubmitted: indexNowSuccess,
        indexNowFailed,
      },
    };
    });
  } catch (error) {
      await sendCronFailureAlert('index-pseo', error);
    console.error('[CRON:index-pseo] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'pSEO indexing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
