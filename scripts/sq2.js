/**
 * Run each quality ATS source via the cron ingest endpoint (no auth in dev).
 */

const QUALITY_SOURCES = [
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'smartrecruiters',
  'bamboohr',
  'ats-jobs-db',
  'fantastic-jobs-db',
];

async function run() {
  console.log('=== Quality ATS Source Audit ===\n');
  const results = [];

  for (const source of QUALITY_SOURCES) {
    console.log(`\n--- Running: ${source} ---`);
    const start = Date.now();
    try {
      const url = `http://localhost:3000/api/cron/ingest?source=${source}`;
      const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer dev' },
      });

      const data = await res.json();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (data.results && data.results.length > 0) {
        const r = data.results[0];
        console.log(`  ✅ Fetched: ${r.fetched}, Added: ${r.added}, Dupes: ${r.duplicates}, Errors: ${r.errors} (${elapsed}s)`);
        results.push({ source, fetched: r.fetched, added: r.added, dupes: r.duplicates, errors: r.errors, elapsed, status: 'OK' });
      } else {
        console.log(`  Response: ${JSON.stringify(data).slice(0, 300)}`);
        results.push({ source, fetched: data.fetched || 0, added: data.added || 0, dupes: data.duplicates || 0, errors: 0, elapsed, status: data.error ? 'ERROR' : 'OK' });
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ❌ Failed (${elapsed}s): ${err.message}`);
      results.push({ source, fetched: 0, added: 0, dupes: 0, errors: 0, elapsed, status: 'FAILED' });
    }
  }

  console.log('\n\n=== SUMMARY ===');
  console.log('Source'.padEnd(22) + 'Fetched'.padStart(8) + 'Added'.padStart(7) + 'Dupes'.padStart(7) + '  Time    Status');
  console.log('-'.repeat(65));
  let totalFetched = 0, totalAdded = 0;
  for (const r of results) {
    totalFetched += r.fetched;
    totalAdded += r.added;
    console.log(r.source.padEnd(22) + String(r.fetched).padStart(8) + String(r.added).padStart(7) + String(r.dupes).padStart(7) + `  ${r.elapsed}s`.padEnd(10) + r.status);
  }
  console.log('-'.repeat(65));
  console.log('TOTAL'.padEnd(22) + String(totalFetched).padStart(8) + String(totalAdded).padStart(7));
}

run().catch(console.error);
