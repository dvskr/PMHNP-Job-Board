const fs = require('fs');
['outpatient','per-diem','telehealth','va'].forEach(cat => {
  const c = fs.readFileSync('app/jobs/'+cat+'/page.tsx', 'utf-8');
  console.log(cat + ':', {
    lines: c.split('\n').length,
    hasJobsMap: c.includes('jobs.map'),
    hasJobCard: c.includes('<JobCard'),
    browseAll: c.includes("14px 32px"),
    heroCTA: c.includes('/jobs?q='),
  });
});
