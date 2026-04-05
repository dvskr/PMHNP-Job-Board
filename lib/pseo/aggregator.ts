import { prisma } from '../prisma';
import { ALL_CATEGORY_CONFIGS } from './category-city-template';
import { SETTING_CONFIGS, getAllStateSlugs, resolveStateSlug } from './setting-state-config';
import { CITIES } from './city-data/cities';

export async function aggregatePseoStats() {
  console.log('Starting pSEO Stats Aggregation...');
  
  // 1. Aggregate Setting x State (e.g., /jobs/remote/california)
  console.log('Aggregating Setting x State combinations...');
  const stateSlugs = getAllStateSlugs();
  const settingKeys = Object.keys(SETTING_CONFIGS);

  for (const settingKey of settingKeys) {
    const config = SETTING_CONFIGS[settingKey];
    for (const stateSlug of stateSlugs) {
      const stateName = resolveStateSlug(stateSlug);
      if (!stateName) continue;

      try {
        const where = config.buildWhere(stateName) as any;
        const totalJobs = await prisma.job.count({ where });

        let rawAvg = 0;
        let colAdjustedSalary = 0; // Not applicable for state level currently, but keeping schema consistent

        if (totalJobs > 0) {
          const salaryData = await prisma.job.aggregate({
            where: {
              ...where,
              normalizedMinSalary: { not: null },
              normalizedMaxSalary: { not: null },
            },
            _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
          });

          rawAvg = Math.round(
            ((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000
          );
        }

        await prisma.pseoStats.upsert({
          where: {
            type_categorySlug_locationSlug: {
              type: 'setting-state',
              categorySlug: config.slug, // e.g. "remote"
              locationSlug: stateSlug,     // e.g. "california"
            }
          },
          update: {
            totalJobs,
            rawAvgSalary: rawAvg,
            colAdjustedSalary,
          },
          create: {
            type: 'setting-state',
            categorySlug: config.slug,
            locationSlug: stateSlug,
            totalJobs,
            rawAvgSalary: rawAvg,
            colAdjustedSalary,
          }
        });
      } catch (error) {
        console.error(`Error aggregating setting-state for ${config.slug}/${stateSlug}:`, error);
      }
    }
  }

  // 2. Aggregate Category x City (e.g., /jobs/va/city/tampa-fl)
  console.log('Aggregating Category x City combinations...');
  const categoryKeys = Object.keys(ALL_CATEGORY_CONFIGS);

  // Since Category x City is huge (26 * ~4100 cities), we should batch or log progress
  let processedCities = 0;
  for (const city of CITIES) {
    if (!city) continue;

    for (const categoryKey of categoryKeys) {
      const config = ALL_CATEGORY_CONFIGS[categoryKey];
      try {
        const where = config.buildWhere(city.state, city.name) as any;
        const totalJobs = await prisma.job.count({ where });

        let rawAvg = 0;
        let colAdjustedSalary = 0;

        if (totalJobs > 0) {
          const salaryData = await prisma.job.aggregate({
            where: {
              ...where,
              normalizedMinSalary: { not: null },
              normalizedMaxSalary: { not: null },
            },
            _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
          });

          rawAvg = Math.round(
            ((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000
          );

          colAdjustedSalary = rawAvg > 0
            ? Math.round(rawAvg * (100 / city.costOfLivingIndex))
            : 0;
        }

        // Only store if jobs exist OR we want to explicitly store 0 (storing 0 prevents runtime queries forever)
        // We will store 0 so the lookup instantly fails-fast without checking DB.
        await prisma.pseoStats.upsert({
          where: {
            type_categorySlug_locationSlug: {
              type: 'category-city',
              categorySlug: config.slug,
              locationSlug: city.slug,
            }
          },
          update: {
            totalJobs,
            rawAvgSalary: rawAvg,
            colAdjustedSalary,
          },
          create: {
            type: 'category-city',
            categorySlug: config.slug,
            locationSlug: city.slug,
            totalJobs,
            rawAvgSalary: rawAvg,
            colAdjustedSalary,
          }
        });
      } catch (error) {
        console.error(`Error aggregating category-city for ${config.slug}/${city.slug}:`, error);
      }
    }
    
    processedCities++;
    if (processedCities % 50 === 0) {
      console.log(`Processed ${processedCities} cities...`);
    }
  }

  console.log('pSEO Stats Aggregation Complete!');
}
