require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('  ACCURATE PIPELINE SURVIVAL ANALYSIS');
  console.log('  Current time:', new Date().toISOString());
  console.log('══════════════════════════════════════════════\n');

  // ── RULE 1: Show the actual code thresholds ──
  console.log('=== YOUR PIPELINE RULES (from code) ===');
  console.log('  freshness-decay.ts shouldUnpublish(): updatedAt > 90 days → unpublish');
  console.log('  ingestion-service.ts MAX_JOB_AGE_MS: 60 days (renewal age cap)');
  console.log('  ingestion-service.ts RENEWAL_EXTENSION_MS: 14 days (expiresAt window)');
  console.log('  ingestion-service.ts cleanupExpiredJobs maxAgeDate: 120 days (hard expiry)');
  console.log('  ingestion-service.ts cleanupExpiredJobs: dead link check (404/410 on ATS jobs)');
  console.log('');

  // ── Show date ranges we're checking against ──
  const now = new Date();
  console.log('=== DATE BOUNDARIES ===');
  console.log('  NOW:', now.toISOString());
  console.log('  14 days ago:', new Date(now - 14 * 86400000).toISOString());
  console.log('  60 days ago:', new Date(now - 60 * 86400000).toISOString());
  console.log('  90 days ago:', new Date(now - 90 * 86400000).toISOString());
  console.log('  120 days ago:', new Date(now - 120 * 86400000).toISOString());
  console.log('');

  // ── Show actual date ranges in the data ──
  const dateRange = await p.query(`
    SELECT
      MIN(original_posted_at) as oldest_posted,
      MAX(original_posted_at) as newest_posted,
      MIN(updated_at) as oldest_updated,
      MAX(updated_at) as newest_updated,
      MIN(created_at) as oldest_created,
      MAX(created_at) as newest_created,
      MIN(expires_at) as oldest_expires,
      MAX(expires_at) as newest_expires
    FROM jobs WHERE is_published = false
  `);
  console.log('=== UNPUBLISHED JOBS: DATE RANGES ===');
  const dr = dateRange.rows[0];
  console.log('  original_posted_at:', dr.oldest_posted, '→', dr.newest_posted);
  console.log('  updated_at:        ', dr.oldest_updated, '→', dr.newest_updated);
  console.log('  created_at:        ', dr.oldest_created, '→', dr.newest_created);
  console.log('  expires_at:        ', dr.oldest_expires, '→', dr.newest_expires);
  console.log('');

  // ── RULE-BY-RULE ANALYSIS ──
  console.log('=== RULE-BY-RULE SURVIVAL (of 15,878 unpublished) ===\n');

  // Rule 1: Freshness decay - shouldUnpublish (updatedAt > 90 days)
  const r1 = await p.query(`
    SELECT
      count(*) FILTER (WHERE updated_at > NOW() - INTERVAL '90 days') as passes,
      count(*) FILTER (WHERE updated_at <= NOW() - INTERVAL '90 days') as fails
    FROM jobs WHERE is_published = false
  `);
  console.log('Rule 1: Freshness decay (updatedAt > 90d → unpublish)');
  console.log(`  PASS: ${r1.rows[0].passes} | FAIL: ${r1.rows[0].fails}`);

  // Rule 2: cleanup-expired expiresAt check
  const r2 = await p.query(`
    SELECT
      count(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW()) as passes,
      count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as fails
    FROM jobs WHERE is_published = false
  `);
  console.log('\nRule 2: cleanup-expired (expiresAt < now → unpublish)');
  console.log(`  PASS: ${r2.rows[0].passes} | FAIL: ${r2.rows[0].fails}`);

  // Rule 3: 120-day hard expiry (cleanupExpiredJobs)
  const r3 = await p.query(`
    SELECT
      count(*) FILTER (WHERE original_posted_at IS NULL OR original_posted_at > NOW() - INTERVAL '120 days') as passes,
      count(*) FILTER (WHERE original_posted_at IS NOT NULL AND original_posted_at <= NOW() - INTERVAL '120 days') as fails
    FROM jobs WHERE is_published = false
  `);
  console.log('\nRule 3: Hard expiry (originalPostedAt > 120d → unpublish)');
  console.log(`  PASS: ${r3.rows[0].passes} | FAIL: ${r3.rows[0].fails}`);

  // Rule 4: 60-day renewal age cap (only during ingestion, not proactive)
  const r4 = await p.query(`
    SELECT
      count(*) FILTER (WHERE original_posted_at IS NULL OR original_posted_at > NOW() - INTERVAL '60 days') as passes,
      count(*) FILTER (WHERE original_posted_at IS NOT NULL AND original_posted_at <= NOW() - INTERVAL '60 days') as fails
    FROM jobs WHERE is_published = false
  `);
  console.log('\nRule 4: 60-day age cap (only triggers during renewal, not proactive)');
  console.log(`  PASS: ${r4.rows[0].passes} | FAIL: ${r4.rows[0].fails}`);

  // ── ALL PROACTIVE RULES COMBINED ──
  // Proactive rules = rules that CRONS enforce (not ingestion-time only):
  // - shouldUnpublish: updatedAt > 90d
  // - cleanup-expired: expiresAt < now
  // - cleanupExpiredJobs: originalPostedAt > 120d
  const combined = await p.query(`
    SELECT count(*) as survives_all_proactive
    FROM jobs
    WHERE is_published = false
      AND updated_at > NOW() - INTERVAL '90 days'
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (original_posted_at IS NULL OR original_posted_at > NOW() - INTERVAL '120 days')
  `);
  console.log('\n=== SURVIVES ALL PROACTIVE CRON RULES ===');
  console.log(`  ${combined.rows[0].survives_all_proactive} jobs`);

  // ── DEAD LINK SAMPLING ──
  // Check a sample of unpublished ATS jobs for dead links
  console.log('\n=== DEAD LINK SAMPLING (ATS jobs) ===');
  const atsUnpub = await p.query(`
    SELECT id, title, apply_link, source_provider
    FROM jobs
    WHERE is_published = false
      AND source_provider IN ('greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'icims', 'jazzhr')
      AND apply_link IS NOT NULL AND apply_link != ''
    ORDER BY original_posted_at DESC
    LIMIT 30
  `);
  console.log(`  Checking ${atsUnpub.rows.length} ATS jobs for dead links...`);

  let aliveCount = 0;
  let deadCount = 0;
  let errorCount = 0;
  for (const job of atsUnpub.rows) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(job.apply_link, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'PMHNPHiring-LinkChecker/1.0' },
      });
      clearTimeout(timeout);
      if (resp.status === 404 || resp.status === 410) {
        deadCount++;
        console.log(`  ❌ DEAD [${resp.status}] [${job.source_provider}] "${job.title}"`);
      } else {
        aliveCount++;
      }
    } catch (e) {
      errorCount++;
    }
  }
  console.log(`\n  Results: ${aliveCount} alive, ${deadCount} dead, ${errorCount} timeout/error`);
  if (atsUnpub.rows.length > 0) {
    const deadRate = ((deadCount / atsUnpub.rows.length) * 100).toFixed(0);
    console.log(`  Dead link rate: ${deadRate}%`);
    // Extrapolate to all unpublished ATS jobs
    const totalAtsUnpub = await p.query(`
      SELECT count(*) as cnt FROM jobs
      WHERE is_published = false
        AND source_provider IN ('greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'icims', 'jazzhr')
    `);
    const estimated = Math.round(parseInt(totalAtsUnpub.rows[0].cnt) * (deadCount / atsUnpub.rows.length));
    console.log(`  Total unpublished ATS jobs: ${totalAtsUnpub.rows[0].cnt}`);
    console.log(`  Estimated dead links (extrapolated): ~${estimated}`);
  }

  // ── Also sample non-ATS jobs (aggregator links) ──
  console.log('\n=== DEAD LINK SAMPLING (aggregator jobs) ===');
  const aggUnpub = await p.query(`
    SELECT id, title, apply_link, source_provider
    FROM jobs
    WHERE is_published = false
      AND source_provider IN ('jsearch', 'adzuna', 'jooble')
      AND apply_link IS NOT NULL AND apply_link != ''
    ORDER BY RANDOM()
    LIMIT 20
  `);
  console.log(`  Checking ${aggUnpub.rows.length} aggregator jobs for dead links...`);
  let aggAlive = 0, aggDead = 0, aggErr = 0;
  for (const job of aggUnpub.rows) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(job.apply_link, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'PMHNPHiring-LinkChecker/1.0' },
      });
      clearTimeout(timeout);
      if (resp.status === 404 || resp.status === 410) {
        aggDead++;
        console.log(`  ❌ DEAD [${resp.status}] [${job.source_provider}] "${job.title}"`);
      } else {
        aggAlive++;
      }
    } catch (e) {
      aggErr++;
    }
  }
  console.log(`\n  Results: ${aggAlive} alive, ${aggDead} dead, ${aggErr} timeout/error`);

  console.log('\n══════════════════════════════════════════════');
  console.log('  ANALYSIS COMPLETE');
  console.log('══════════════════════════════════════════════\n');

  await p.end();
})().catch(e => { console.error(e); process.exit(1); });
