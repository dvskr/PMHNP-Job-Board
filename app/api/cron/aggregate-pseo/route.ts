import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CITIES } from '@/lib/pseo/city-data/cities'
import { ALL_CATEGORY_CONFIGS } from '@/lib/pseo/category-city-template'
import { SETTING_CONFIGS, getAllStateSlugs, resolveStateSlug } from '@/lib/pseo/setting-state-config'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';

// Vercel Pro/Enterprise: up to 300s. Hobby: 60s.
// Batched aggregation: processes a chunk of cities per invocation.
// Call repeatedly with ?offset=0, ?offset=200, ?offset=400, etc.
export const maxDuration = 300

const BATCH_SIZE = 200 // Cities per batch

export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  const startTime = Date.now()
  const url = new URL(request.url)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const mode = url.searchParams.get('mode') || 'all' // 'all' | 'state' | 'city'

  try {
    let settingStateCount = 0
    let categoryCityCount = 0

    // ─── Phase 1: Setting × State (fast — ~250 combinations) ───
    // Only runs on first batch (offset=0) or mode=state
    if (offset === 0 || mode === 'state') {
      const stateSlugs = getAllStateSlugs()
      const settingKeys = Object.keys(SETTING_CONFIGS)

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

            await prisma.pseoStats.upsert({
              where: { type_categorySlug_locationSlug: { type: 'setting-state', categorySlug: config.slug, locationSlug: stateSlug } },
              update: { totalJobs, rawAvgSalary: rawAvg, colAdjustedSalary: 0 },
              create: { type: 'setting-state', categorySlug: config.slug, locationSlug: stateSlug, totalJobs, rawAvgSalary: rawAvg, colAdjustedSalary: 0 },
            })
            settingStateCount++
          } catch (error) {
            console.error(`[pseo-agg] Error setting-state ${config.slug}/${stateSlug}:`, error)
          }
        }
      }

      // If mode is state-only, return early
      if (mode === 'state') {
        return NextResponse.json({
          success: true,
          mode: 'state',
          settingStateCount,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
          timestamp: new Date().toISOString(),
        })
      }
    }

    // ─── Phase 2: Category × City (batched — BATCH_SIZE cities per call) ───
    const cityBatch = CITIES.slice(offset, offset + BATCH_SIZE).filter(Boolean)
    const categoryKeys = Object.keys(ALL_CATEGORY_CONFIGS)
    const isLastBatch = offset + BATCH_SIZE >= CITIES.length

    for (const city of cityBatch) {
      if (!city) continue

      // Check elapsed time — abort gracefully if nearing timeout
      if (Date.now() - startTime > 250_000) { // 250s safety margin
        console.warn(`[pseo-agg] Timeout safety: processed ${categoryCityCount} category-city rows, aborting at offset ${offset}`)
        return NextResponse.json({
          success: true,
          partial: true,
          settingStateCount,
          categoryCityCount,
          nextOffset: offset + cityBatch.indexOf(city),
          totalCities: CITIES.length,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
          timestamp: new Date().toISOString(),
        })
      }

      for (const categoryKey of categoryKeys) {
        const config = ALL_CATEGORY_CONFIGS[categoryKey]
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const where = config.buildWhere(city.state, city.name) as any
          const totalJobs = await prisma.job.count({ where })

          let rawAvg = 0
          let colAdjustedSalary = 0

          if (totalJobs > 0) {
            const salaryData = await prisma.job.aggregate({
              where: { ...where, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
              _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
            })
            rawAvg = Math.round(
              ((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000
            )
            colAdjustedSalary = rawAvg > 0 ? Math.round(rawAvg * (100 / city.costOfLivingIndex)) : 0
          }

          await prisma.pseoStats.upsert({
            where: { type_categorySlug_locationSlug: { type: 'category-city', categorySlug: config.slug, locationSlug: city.slug } },
            update: { totalJobs, rawAvgSalary: rawAvg, colAdjustedSalary },
            create: { type: 'category-city', categorySlug: config.slug, locationSlug: city.slug, totalJobs, rawAvgSalary: rawAvg, colAdjustedSalary },
          })
          categoryCityCount++
        } catch (error) {
          console.error(`[pseo-agg] Error category-city ${config.slug}/${city.slug}:`, error)
        }
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)

    return NextResponse.json({
      success: true,
      partial: !isLastBatch,
      mode,
      settingStateCount,
      categoryCityCount,
      batchInfo: {
        offset,
        batchSize: BATCH_SIZE,
        citiesInBatch: cityBatch.length,
        totalCities: CITIES.length,
        isLastBatch,
        nextOffset: isLastBatch ? null : offset + BATCH_SIZE,
      },
      elapsedSeconds: elapsed,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[pseo-agg] Cron aggregation error:', error)
    return NextResponse.json({ error: 'Aggregation failed' }, { status: 500 })
  }
}
