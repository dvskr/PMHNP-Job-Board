require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
    // 1. Overall counts
    const overall = await p.query(`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE is_published = true) as published,
      count(*) FILTER (WHERE is_published = false) as unpublished,
      count(*) FILTER (WHERE is_published = false AND is_manually_unpublished = true) as manually_unpub,
      count(*) FILTER (WHERE is_published = false AND is_manually_unpublished = false) as auto_unpub
    FROM jobs
  `);
    console.log('\n=== OVERALL ===');
    console.log(JSON.stringify(overall.rows[0], null, 2));

    // 2. Quality signals
    const quality = await p.query(`
    SELECT
      count(*) FILTER (WHERE is_verified_employer = true) as verified_employer,
      count(*) FILTER (WHERE is_featured = true) as featured,
      count(*) FILTER (WHERE normalized_min_salary IS NOT NULL OR normalized_max_salary IS NOT NULL) as has_salary,
      count(*) FILTER (WHERE apply_link IS NOT NULL AND apply_link != '') as has_apply_link,
      count(*) FILTER (WHERE experience_level IS NOT NULL AND experience_level != '') as has_exp_level,
      count(*) FILTER (WHERE description_summary IS NOT NULL) as has_summary,
      count(*) FILTER (WHERE length(description) > 500) as desc_over_500,
      count(*) FILTER (WHERE length(description) < 100) as desc_under_100
    FROM jobs
  `);
    console.log('\n=== QUALITY SIGNALS (all jobs) ===');
    console.log(JSON.stringify(quality.rows[0], null, 2));

    // 3. Freshness
    const freshness = await p.query(`
    SELECT
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) > NOW() - INTERVAL '24 hours') as last_24h,
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) > NOW() - INTERVAL '7 days') as last_7d,
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) > NOW() - INTERVAL '30 days') as last_30d,
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) > NOW() - INTERVAL '90 days') as last_90d,
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) <= NOW() - INTERVAL '90 days') as older_than_90d
    FROM jobs
  `);
    console.log('\n=== FRESHNESS (all jobs) ===');
    console.log(JSON.stringify(freshness.rows[0], null, 2));

    // 4. Source breakdown
    const sources = await p.query(`
    SELECT source_provider, count(*) as cnt,
      count(*) FILTER (WHERE is_published = true) as published,
      count(*) FILTER (WHERE is_published = false) as unpublished
    FROM jobs
    GROUP BY source_provider
    ORDER BY cnt DESC
  `);
    console.log('\n=== SOURCE BREAKDOWN ===');
    sources.rows.forEach(r => console.log(`  ${r.source_provider || 'NULL'}: ${r.cnt} (pub: ${r.published}, unpub: ${r.unpublished})`));

    // 5. ATS detection (apply_link patterns)
    const ats = await p.query(`
    SELECT
      count(*) FILTER (WHERE apply_link ILIKE '%workday%') as workday,
      count(*) FILTER (WHERE apply_link ILIKE '%greenhouse%') as greenhouse,
      count(*) FILTER (WHERE apply_link ILIKE '%lever.co%') as lever,
      count(*) FILTER (WHERE apply_link ILIKE '%icims%') as icims,
      count(*) FILTER (WHERE apply_link ILIKE '%smartrecruiters%') as smartrecruiters,
      count(*) FILTER (WHERE apply_link ILIKE '%ashby%') as ashby,
      count(*) FILTER (WHERE apply_link ILIKE '%jazz%' OR apply_link ILIKE '%jazzhr%') as jazzhr,
      count(*) FILTER (WHERE apply_link ILIKE '%bamboo%') as bamboo,
      count(*) FILTER (WHERE apply_link ILIKE '%paycom%') as paycom,
      count(*) FILTER (WHERE apply_link ILIKE '%ultipro%' OR apply_link ILIKE '%ukg%') as ukg,
      count(*) FILTER (WHERE apply_link ILIKE '%indeed%') as indeed,
      count(*) FILTER (WHERE apply_link ILIKE '%linkedin%') as linkedin,
      count(*) FILTER (WHERE apply_link ILIKE '%taleo%') as taleo,
      count(*) FILTER (WHERE apply_link ILIKE '%breezy%') as breezy,
      count(*) FILTER (WHERE apply_link ILIKE '%workable%') as workable,
      count(*) FILTER (WHERE apply_link ILIKE '%jobvite%') as jobvite
    FROM jobs
  `);
    console.log('\n=== ATS DETECTION (from apply_link) ===');
    const atsData = ats.rows[0];
    Object.entries(atsData).filter(([, v]) => parseInt(v) > 0).sort((a, b) => parseInt(b[1]) - parseInt(a[1])).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    // 6. Unpublished by tier
    const repubTiers = await p.query(`
    SELECT
      count(*) FILTER (WHERE is_verified_employer = true) as tier1_verified,
      count(*) FILTER (WHERE apply_link ILIKE ANY(ARRAY['%workday%','%greenhouse%','%lever.co%','%icims%','%smartrecruiters%','%ashby%','%taleo%','%jobvite%','%jazzhr%','%bamboo%']) AND is_verified_employer = false) as tier2_ats,
      count(*) FILTER (WHERE apply_link IS NOT NULL AND apply_link != '' AND NOT apply_link ILIKE ANY(ARRAY['%workday%','%greenhouse%','%lever.co%','%icims%','%smartrecruiters%','%ashby%','%taleo%','%jobvite%','%jazzhr%','%bamboo%']) AND is_verified_employer = false) as tier3_direct,
      count(*) FILTER (WHERE (apply_link IS NULL OR apply_link = '') AND is_verified_employer = false) as tier4_no_link
    FROM jobs WHERE is_published = false
  `);
    console.log('\n=== UNPUBLISHED JOBS BY POTENTIAL TIER ===');
    console.log(JSON.stringify(repubTiers.rows[0], null, 2));

    // 7. Published by tier
    const pubTiers = await p.query(`
    SELECT
      count(*) FILTER (WHERE is_verified_employer = true) as tier1_verified,
      count(*) FILTER (WHERE apply_link ILIKE ANY(ARRAY['%workday%','%greenhouse%','%lever.co%','%icims%','%smartrecruiters%','%ashby%','%taleo%','%jobvite%','%jazzhr%','%bamboo%']) AND is_verified_employer = false) as tier2_ats,
      count(*) FILTER (WHERE apply_link IS NOT NULL AND apply_link != '' AND NOT apply_link ILIKE ANY(ARRAY['%workday%','%greenhouse%','%lever.co%','%icims%','%smartrecruiters%','%ashby%','%taleo%','%jobvite%','%jazzhr%','%bamboo%']) AND is_verified_employer = false) as tier3_direct,
      count(*) FILTER (WHERE (apply_link IS NULL OR apply_link = '') AND is_verified_employer = false) as tier4_no_link
    FROM jobs WHERE is_published = true
  `);
    console.log('\n=== PUBLISHED JOBS BY POTENTIAL TIER ===');
    console.log(JSON.stringify(pubTiers.rows[0], null, 2));

    // 8. Salary breakdown among unpublished
    const unpubSalary = await p.query(`
    SELECT
      count(*) FILTER (WHERE normalized_min_salary IS NOT NULL OR normalized_max_salary IS NOT NULL) as has_salary,
      count(*) FILTER (WHERE normalized_min_salary IS NULL AND normalized_max_salary IS NULL) as no_salary
    FROM jobs WHERE is_published = false
  `);
    console.log('\n=== UNPUBLISHED: SALARY BREAKDOWN ===');
    console.log(JSON.stringify(unpubSalary.rows[0], null, 2));

    // 9. Freshness of unpublished
    const unpubFresh = await p.query(`
    SELECT
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) > NOW() - INTERVAL '30 days') as last_30d,
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) > NOW() - INTERVAL '90 days' AND COALESCE(original_posted_at, created_at) <= NOW() - INTERVAL '30 days') as d30_to_90,
      count(*) FILTER (WHERE COALESCE(original_posted_at, created_at) <= NOW() - INTERVAL '90 days') as older_90d
    FROM jobs WHERE is_published = false
  `);
    console.log('\n=== UNPUBLISHED: FRESHNESS ===');
    console.log(JSON.stringify(unpubFresh.rows[0], null, 2));

    console.log('\n=== TOTAL IF ALL REPUBLISHED ===');
    console.log(`${overall.rows[0].total} total jobs on site\n`);

    await p.end();
})().catch(e => { console.error(e); process.exit(1); });
