import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CITIES } from '@/lib/pseo/city-data/cities'
import { ALL_CATEGORY_CONFIGS } from '@/lib/pseo/category-city-template'
import { SETTING_CONFIGS, getAllStateSlugs, resolveStateSlug } from '@/lib/pseo/setting-state-config'
import { foldCategoryCityAggregates, stripLocationFromWhere } from '@/lib/pseo/aggregate-fold'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { logger } from '@/lib/logger';

// Vercel Pro/Enterprise: up to 300s. Hobby: 60s.
export const maxDuration = 300

// Abort threshold — leave headroom under maxDuration so a partial run still
// returns a tracked response instead of being killed by the platform.
const TIME_BUDGET_MS = 250_000

/**
 * aggregate-pseo (B1 rewrite, organic audit 2026-08).
 *
 * The old shape processed 200 cities per invocation and expected an external
 * caller to chain ?offset=200, ?offset=400, ... — but vercel.json registers
 * one bare invocation and nothing ever chained, so only CITIES[0..199]
 * refreshed since April while 647 gate-passing category-city rows served
 * frozen counts.
 *
 * New shape completes the WHOLE estate in one run: per category, ONE
 * groupBy(city, state) for counts plus one for salary averages (56 grouped
 * queries total across 28 categories), folded onto the CITIES registry by
 * lib/pseo/aggregate-fold.ts. Writes are bounded by cities that actually
 * have jobs:
 *   - combos with live jobs are upserted (updatedAt bump = liveness signal
 *     for the sitemap staleness gate; contentChangedAt stamped ONLY when
 *     values actually change — the honest lastmod source)
 *   - previously-positive rows whose city no longer has jobs are zeroed in
 *     one updateMany per category (a real content change, so
 *     contentChangedAt is stamped)
 *   - rows already at 0 that stay at 0 are not touched at all
 */
export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  const startTime = Date.now()
  const url = new URL(request.url)
  // ?offset is accepted but deliberately IGNORED — the run always covers the
  // full estate now. Kept as a no-op so any stale caller/bookmark hitting
  // ?offset=200 doesn't error and simply triggers a full refresh.
  void url.searchParams.get('offset')
  const mode = url.searchParams.get('mode') || 'all' // 'all' | 'state' | 'city'

  try {
    return await withCronTracking('aggregate-pseo', async () => {
    let settingStateCount = 0
    let categoryCityCount = 0
    let categoryCityZeroed = 0

    // ─── Phase 1: Setting × State (fast — ~250 combinations) ───
    if (mode !== 'city') {
      const stateSlugs = getAllStateSlugs()
      const settingKeys = Object.keys(SETTING_CONFIGS)

      // GSC Fix (2026-07 audit): bulk pre-read so each upsert can stamp
      // contentChangedAt ONLY when values actually differ. updatedAt keeps
      // bumping on every run (liveness for the sitemap staleness gate);
      // contentChangedAt is the honest lastmod source for city sitemaps.
      const existingSettingState = await prisma.pseoStats.findMany({
        where: { type: 'setting-state' },
        select: { categorySlug: true, locationSlug: true, totalJobs: true, rawAvgSalary: true, colAdjustedSalary: true },
      })
      const existingSSMap = new Map(
        existingSettingState.map(r => [`${r.categorySlug}|${r.locationSlug}`, r])
      )

      for (const settingKey of settingKeys) {
        const config = SETTING_CONFIGS[settingKey]
        for (const stateSlug of stateSlugs) {
          const stateName = resolveStateSlug(stateSlug)
          if (!stateName) continue

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const where = config.buildWhere(stateName) as any
            const totalJobs = await prisma.job.count({ where })

            let rawAvg = 0
            if (totalJobs > 0) {
              const salaryData = await prisma.job.aggregate({
                where: { ...where, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
                _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
              })
              rawAvg = Math.round(
                ((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000
              )
            }

            const prev = existingSSMap.get(`${config.slug}|${stateSlug}`)
            const changed = !prev || prev.totalJobs !== totalJobs || prev.rawAvgSalary !== rawAvg || prev.colAdjustedSalary !== 0
            await prisma.pseoStats.upsert({
              where: { type_categorySlug_locationSlug: { type: 'setting-state', categorySlug: config.slug, locationSlug: stateSlug } },
              update: { totalJobs, rawAvgSalary: rawAvg, colAdjustedSalary: 0, ...(changed && { contentChangedAt: new Date() }) },
              create: { type: 'setting-state', categorySlug: config.slug, locationSlug: stateSlug, totalJobs, rawAvgSalary: rawAvg, colAdjustedSalary: 0, contentChangedAt: new Date() },
            })
            settingStateCount++
          } catch (error) {
            logger.error(`[pseo-agg] Error setting-state ${config.slug}/${stateSlug}`, error)
          }
        }
      }

      // If mode is state-only, return early
      if (mode === 'state') {
        return {
          response: NextResponse.json({
            success: true,
            mode: 'state',
            settingStateCount,
            elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
            timestamp: new Date().toISOString(),
          }),
          metrics: { mode: 'state', settingStateCount },
        }
      }
    }

    // ─── Phase 2: Category × City (one groupBy pair per category) ───
    const categoryKeys = Object.keys(ALL_CATEGORY_CONFIGS)
    const perCategoryMs: Record<string, number> = {}
    const categoriesSkipped: string[] = []
    let partial = false

    for (const categoryKey of categoryKeys) {
      // Time-budget guard: with the grouped shape a full pass is far below
      // the budget, but if the DB degrades we return a tracked partial
      // result instead of dying at maxDuration. Categories keep their
      // previous rows (stale but gated by the 36h staleness checks).
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        partial = true
        categoriesSkipped.push(categoryKey)
        continue
      }

      const catStart = Date.now()
      const config = ALL_CATEGORY_CONFIGS[categoryKey]
      try {
        // Every config's buildWhere returns top-level state/city equality
        // keys plus the category conditions — stripping the location keys
        // yields the category-wide clause (contract locked by tests).
        const categoryWhere = stripLocationFromWhere(
          config.buildWhere('__strip__', '__strip__') as Record<string, unknown>,
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupedWhere = { ...categoryWhere, city: { not: null }, state: { not: null } } as any

        const [countGroups, salaryGroups, existingRows] = await Promise.all([
          prisma.job.groupBy({
            by: ['city', 'state'],
            where: groupedWhere,
            _count: { _all: true },
          }),
          prisma.job.groupBy({
            by: ['city', 'state'],
            where: { ...groupedWhere, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
            _count: { _all: true },
            _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
          }),
          // Only previously-positive rows matter: they are the ones that can
          // go stale (rows at 0 that stay 0 need no write at all).
          prisma.pseoStats.findMany({
            where: { type: 'category-city', categorySlug: config.slug, totalJobs: { gt: 0 } },
            select: { locationSlug: true, totalJobs: true, rawAvgSalary: true, colAdjustedSalary: true },
          }),
        ])

        const desired = foldCategoryCityAggregates(countGroups, salaryGroups, CITIES)
        const prevMap = new Map(existingRows.map(r => [r.locationSlug, r]))

        for (const [locationSlug, values] of desired) {
          const prev = prevMap.get(locationSlug)
          const changed = !prev
            || prev.totalJobs !== values.totalJobs
            || prev.rawAvgSalary !== values.rawAvgSalary
            || prev.colAdjustedSalary !== values.colAdjustedSalary
          await prisma.pseoStats.upsert({
            where: { type_categorySlug_locationSlug: { type: 'category-city', categorySlug: config.slug, locationSlug } },
            update: { ...values, ...(changed && { contentChangedAt: new Date() }) },
            create: { type: 'category-city', categorySlug: config.slug, locationSlug, ...values, contentChangedAt: new Date() },
          })
          categoryCityCount++
        }

        // Previously-positive rows whose city no longer has matching jobs:
        // zero them (this is the fix for the frozen "16 Open vs 1 live"
        // estate — dropping to 0 is a real content change).
        const staleSlugs = existingRows
          .filter(r => !desired.has(r.locationSlug))
          .map(r => r.locationSlug)
        if (staleSlugs.length > 0) {
          const zeroed = await prisma.pseoStats.updateMany({
            where: { type: 'category-city', categorySlug: config.slug, locationSlug: { in: staleSlugs } },
            data: { totalJobs: 0, rawAvgSalary: 0, colAdjustedSalary: 0, contentChangedAt: new Date() },
          })
          categoryCityZeroed += zeroed.count
        }
      } catch (error) {
        logger.error(`[pseo-agg] Error category-city ${config.slug}`, error)
      }
      perCategoryMs[config.slug] = Date.now() - catStart
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    // Per-category timing so a creeping runtime is visible in logs/cronRun
    // long before it threatens the cron budget.
    logger.info('[pseo-agg] category-city pass complete', {
      elapsedSeconds: elapsed,
      upserts: categoryCityCount,
      zeroed: categoryCityZeroed,
      perCategoryMs,
    })

    return {
      response: NextResponse.json({
        success: true,
        partial,
        mode,
        settingStateCount,
        categoryCityCount,
        categoryCityZeroed,
        totalCities: CITIES.length,
        ...(categoriesSkipped.length > 0 && { categoriesSkipped }),
        elapsedSeconds: elapsed,
        timestamp: new Date().toISOString(),
      }),
      metrics: {
        mode,
        partial,
        settingStateCount,
        categoryCityCount,
        categoryCityZeroed,
        categoriesSkipped: categoriesSkipped.length,
        perCategoryMs,
        elapsedSeconds: elapsed,
      },
    }
    })
  } catch (error) {
      await sendCronFailureAlert('aggregate-pseo', error);
    logger.error('[pseo-agg] Cron aggregation error', error)
    return NextResponse.json({ error: 'Aggregation failed' }, { status: 500 })
  }
}
