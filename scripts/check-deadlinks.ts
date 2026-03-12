import { config } from 'dotenv';
config();
config({ path: '.env.prod', override: true });

import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const CONCURRENCY = 20;
const TIMEOUT_MS = 8000;

interface LinkResult {
  id: string;
  title: string;
  employer: string;
  source: string;
  applyLink: string;
  status: number | null;
  dead: boolean;
  reason: string;
}

async function checkLink(url: string): Promise<{ status: number | null; dead: boolean; reason: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timer);

    // Some servers don't support HEAD, try GET if we get 405
    if (res.status === 405) {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);
      const res2 = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller2.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      clearTimeout(timer2);
      // Consume body to free resources
      await res2.text().catch(() => {});

      if (res2.status === 404 || res2.status === 410) {
        return { status: res2.status, dead: true, reason: `HTTP ${res2.status}` };
      }
      return { status: res2.status, dead: false, reason: 'OK' };
    }

    if (res.status === 404 || res.status === 410) {
      return { status: res.status, dead: true, reason: `HTTP ${res.status}` };
    }

    // Check for redirect to error/not-found pages
    const finalUrl = res.url || url;
    const notFoundPatterns = [
      'job-not-found', 'not-found', 'page-not-found', 'error', 
      'expired', 'no-longer-available', 'position-closed',
      '/404', 'jobs/search', // Redirected to search = job removed
    ];
    const isRedirectToDead = notFoundPatterns.some(p => finalUrl.toLowerCase().includes(p));
    if (isRedirectToDead) {
      return { status: res.status, dead: true, reason: `Redirected to: ${finalUrl.substring(0, 80)}` };
    }

    return { status: res.status, dead: false, reason: 'OK' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { status: null, dead: false, reason: 'timeout' }; // Timeout = assume alive (server may be slow)
    }
    const msg = err.message || '';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      return { status: null, dead: true, reason: `DNS/Connection error: ${msg.substring(0, 60)}` };
    }
    return { status: null, dead: false, reason: `Error: ${msg.substring(0, 60)}` }; // Unknown error = assume alive
  }
}

async function processBatch(jobs: any[], results: LinkResult[]) {
  const promises = jobs.map(async (job) => {
    const result = await checkLink(job.apply_link);
    const lr: LinkResult = {
      id: job.id,
      title: job.title,
      employer: job.employer,
      source: job.source_provider || '',
      applyLink: job.apply_link,
      ...result,
    };
    results.push(lr);
    return lr;
  });
  return Promise.all(promises);
}

async function main() {
  const connStr = process.env.PROD_DATABASE_URL;
  if (!connStr) { console.error('PROD_DATABASE_URL not set'); process.exit(1); }
  const client = new Client({ connectionString: connStr });
  await client.connect();

  // Get all published jobs with apply links
  const { rows: jobs } = await client.query(`
    SELECT id, title, employer, source_provider, apply_link 
    FROM jobs 
    WHERE is_published = true AND apply_link IS NOT NULL AND apply_link != ''
    ORDER BY created_at DESC
  `);
  console.log('Total published jobs to check: ' + jobs.length);

  const results: LinkResult[] = [];
  let deadCount = 0;
  let checked = 0;

  // Process in batches
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const batchResults = await processBatch(batch, results);
    const batchDead = batchResults.filter(r => r.dead).length;
    deadCount += batchDead;
    checked += batch.length;

    if (checked % 200 === 0 || i + CONCURRENCY >= jobs.length) {
      console.log(`  Checked ${checked}/${jobs.length} — ${deadCount} dead links found`);
    }
  }

  // Unpublish dead link jobs
  const deadJobs = results.filter(r => r.dead);
  const aliveJobs = results.filter(r => !r.dead);

  if (deadJobs.length > 0) {
    const deadIds = deadJobs.map(j => `'${j.id}'`).join(',');
    const updateResult = await client.query(`
      UPDATE jobs SET is_published = false, updated_at = NOW() 
      WHERE id IN (${deadIds})
    `);
    console.log('Unpublished ' + updateResult.rowCount + ' dead link jobs');
  }

  // Final count
  const finalCount = await client.query('SELECT COUNT(*)::int as c FROM jobs WHERE is_published = true');

  // Write results
  const summary = {
    totalChecked: checked,
    alive: aliveJobs.length,
    dead: deadJobs.length,
    deadBySource: {} as Record<string, number>,
    publishedAfterCleanup: finalCount.rows[0].c,
    deadJobs: deadJobs.map(j => ({
      title: j.title.slice(0, 60),
      employer: j.employer.slice(0, 25),
      source: j.source,
      reason: j.reason,
      link: j.applyLink.slice(0, 80),
    })),
  };
  for (const d of deadJobs) {
    summary.deadBySource[d.source || 'unknown'] = (summary.deadBySource[d.source || 'unknown'] || 0) + 1;
  }

  fs.writeFileSync('tmp/deadlink-results.json', JSON.stringify(summary, null, 2));
  console.log('Results written to tmp/deadlink-results.json');
  console.log('Published after cleanup: ' + finalCount.rows[0].c);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
