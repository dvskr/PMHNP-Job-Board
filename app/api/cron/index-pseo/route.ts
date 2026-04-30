/**
 * pSEO URL Indexing Cron
 * 
 * Submits high-quality pSEO city pages to Google Indexing API, Bing, and IndexNow.
 * 
 * Strategy:
 * - Uses the same quality thresholds as sitemap pruning (≥3 jobs, ≥10K pop)
 * - Tracks which URLs have been submitted via pseoStats to avoid re-submission
 * - Submits up to 100 NEW URLs per run (respecting Google's 200/day quota,
 *   splitting 100 for new jobs + 100 for pSEO pages)
 * - Prioritizes high-score pages first (more jobs + larger cities)
 * 
 * Route: GET /api/cron/index-pseo
 * Auth: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CITIES } from '@/lib/pseo/city-data/cities';
import { pingGoogle, pingBingBatch, pingIndexNow } from '@/lib/search-indexing';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';

export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// Only submit broad categories that have meaningful city-level coverage
const PSEO_INDEXING_CATEGORIES = [
  'remote', 'telehealth', 'inpatient', 'outpatient', 'travel',
  'full-time', 'part-time', 'contract', 'behavioral-health',
  '1099', 'addiction', 'new-grad',
];

const MIN_JOBS = 3;
const MIN_POPULATION = 10000;
const GOOGLE_PSEO_CAP = 100; // Reserve 100 of Google's 200/day quota for pSEO

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
    // 1. Get cities with actual job counts from DB
    const citiesWithJobs = await prisma.job.groupBy({
      by: ['city', 'state'],
      where: {
        isPublished: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
        city: { not: null },
        state: { not: null },
      },
      _count: { city: true },
    });

    // Build lookup: "city|state" → job count
    const cityJobCounts = new Map(
      citiesWithJobs
        .filter(r => r.city && r.state)
        .map(r => [`${r.city!.toLowerCase().trim()}|${r.state!.toLowerCase().trim()}`, r._count.city])
    );

    // 2. Build scored URL list — only pages meeting quality thresholds
    const scoredUrls: ScoredUrl[] = [];
    
    for (const category of PSEO_INDEXING_CATEGORIES) {
      for (const city of CITIES) {
        if (city.population < MIN_POPULATION) continue;
        
        const key = `${city.name.toLowerCase().trim()}|${city.state.toLowerCase().trim()}`;
        const jobCount = cityJobCounts.get(key) || 0;
        
        if (jobCount >= MIN_JOBS) {
          // Score: job count (0-40) + population tier (0-20) + MH shortage (0-15)
          let score = Math.min(40, jobCount * 2);
          if (city.population >= 500000) score += 20;
          else if (city.population >= 100000) score += 15;
          else if (city.population >= 50000) score += 10;
          else score += 5;
          if (city.mentalHealthShortage) score += 15;
          
          scoredUrls.push({
            url: `${BASE_URL}/jobs/${category}/city/${city.slug}`,
            score,
          });
        }
      }
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
    const urlsToSubmit = newUrls.slice(0, GOOGLE_PSEO_CAP);
    
    if (urlsToSubmit.length === 0) {
      console.log('[CRON:index-pseo] All qualifying URLs already submitted within 7 days');
      return NextResponse.json({
        success: true,
        message: 'All qualifying pSEO URLs already submitted',
        totalQualifying: scoredUrls.length,
        newToSubmit: 0,
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        timestamp: new Date().toISOString(),
      });
    }

    const urls = urlsToSubmit.map(su => su.url);

    console.log(`[CRON:index-pseo] Submitting ${urls.length} pSEO URLs (${scoredUrls.length} total qualifying, ${newUrls.length} new)`);

    // 4. Submit to Google (individual, rate-limited)
    const googleResults = [];
    for (const url of urls) {
      const result = await pingGoogle(url);
      googleResults.push(result);
      await new Promise(resolve => setTimeout(resolve, 150)); // Rate limit
    }

    // 5. Submit to Bing (batch)
    const bingResults = await pingBingBatch(urls);

    // 6. Submit to IndexNow (batch)
    const indexNowResults = await pingIndexNow(urls);

    // 7. Track submitted URLs in DB so we don't re-submit
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
    const googleSuccess = googleResults.filter(r => r.success).length;
    const googleFailed = googleResults.filter(r => !r.success).length;
    const bingSuccess = bingResults.filter(r => r.success).length;
    const bingFailed = bingResults.filter(r => !r.success).length;
    const indexNowSuccess = indexNowResults.filter(r => r.success).length;
    const indexNowFailed = indexNowResults.filter(r => !r.success).length;

    const summary = {
      success: true,
      totalQualifying: scoredUrls.length,
      newToSubmit: newUrls.length,
      submitted: urls.length,
      google: { submitted: googleSuccess, failed: googleFailed },
      bing: { submitted: bingSuccess, failed: bingFailed },
      indexNow: { submitted: indexNowSuccess, failed: indexNowFailed },
      topUrls: urls.slice(0, 5), // Show first 5 for debugging
      duration: `${duration}s`,
      timestamp: new Date().toISOString(),
    };

    console.log('[CRON:index-pseo] Complete:', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (error) {
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
