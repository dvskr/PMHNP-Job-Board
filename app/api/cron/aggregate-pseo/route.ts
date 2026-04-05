import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CITIES } from '@/lib/pseo/city-data/cities'
import { ALL_CATEGORY_CONFIGS } from '@/lib/pseo/category-city-template'
import { SETTING_CONFIGS, getAllStateSlugs, resolveStateSlug } from '@/lib/pseo/setting-state-config'

// Vercel Pro/Enterprise: up to 300s. Hobby: 60s.
// The full aggregation (~4100 cities × 26 categories) takes ~15-20 minutes.
// We batch-process in chunks to stay within the timeout.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    // Phase 1: Setting × State (fast — ~250 combinations)
    const stateSlugs = getAllStateSlugs()
    const settingKeys = Object.keys(SETTING_CONFIGS)
    let settingStateCount = 0

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

    // Phase 2: Category × City (heavy — ~100K+ combinations)
    const categoryKeys = Object.keys(ALL_CATEGORY_CONFIGS)
    let categoryCityCount = 0

    for (const city of CITIES) {
      if (!city) continue

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
      settingStateCount,
      categoryCityCount,
      elapsedSeconds: elapsed,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[pseo-agg] Cron aggregation error:', error)
    return NextResponse.json({ error: 'Aggregation failed' }, { status: 500 })
  }
}
