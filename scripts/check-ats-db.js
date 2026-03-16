require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
  const all = await pool.query(`
    SELECT DISTINCT apply_link, employer, title
    FROM jobs 
    WHERE source_provider = 'ats-jobs-db'
    ORDER BY employer
  `);

  const byATS = { greenhouse: {}, lever: {}, workday: {}, ashby: {}, other: {} };

  all.rows.forEach(j => {
    try {
      const url = new URL(j.apply_link);
      const host = url.hostname;

      if (host.includes('greenhouse.io')) {
        const slug = url.pathname.split('/')[1];
        byATS.greenhouse[slug] = j.employer;
      } else if (host.includes('lever.co')) {
        const slug = url.pathname.split('/')[1];
        byATS.lever[slug] = j.employer;
      } else if (host.includes('myworkdayjobs.com')) {
        const hostParts = host.split('.');
        const slug = hostParts[0];
        const instMatch = hostParts[1]?.match(/wd(\d+)/);
        const inst = instMatch ? instMatch[1] : '?';
        const pathParts = url.pathname.split('/');
        const enIdx = pathParts.indexOf('en');
        const site = enIdx >= 0 && pathParts[enIdx + 1] ? pathParts[enIdx + 1] : '?';
        byATS.workday[slug] = { instance: inst, site, employer: j.employer };
      } else if (host.includes('ashbyhq.com')) {
        const slug = url.pathname.split('/')[1];
        byATS.ashby[slug] = j.employer;
      } else {
        byATS.other[host] = j.employer;
      }
    } catch (e) { }
  });

  fs.writeFileSync('scripts/ats-companies.json', JSON.stringify(byATS, null, 2));
  console.log('Written to scripts/ats-companies.json');
  console.log('Greenhouse:', Object.keys(byATS.greenhouse).length, 'companies');
  console.log('Lever:', Object.keys(byATS.lever).length, 'companies');
  console.log('Workday:', Object.keys(byATS.workday).length, 'companies');
  console.log('Ashby:', Object.keys(byATS.ashby).length, 'companies');
  console.log('Other:', Object.keys(byATS.other).length, 'domains');

  await pool.end();
})();
