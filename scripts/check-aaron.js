const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.prod' });

const s = createClient(process.env.PROD_SUPABASE_URL, process.env.PROD_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const AARON_COMPANY = '2f5a4698-4d53-419d-bc5d-c2668b14dc4a';
  const AARON_GMAIL = '7340e1f7-9eed-4956-9ce2-f146850da52d';

  // Check jobs
  const { data: jobs, error: je } = await s
    .from('Job')
    .select('id, title, company, userId, createdAt, isPublished')
    .in('userId', [AARON_COMPANY, AARON_GMAIL]);

  console.log('=== JOBS (' + (jobs?.length || 0) + ') ===');
  if (je) console.log('Error:', je.message);
  jobs?.forEach(j => {
    console.log(j.title, '|', j.company);
    console.log('  owner:', j.userId === AARON_COMPANY ? 'aaron@unified' : 'aaron@gmail');
    console.log('  published:', j.isPublished, '| created:', j.createdAt);
  });

  // Check applications
  const jobIds = jobs?.map(j => j.id) || [];
  if (jobIds.length > 0) {
    const { data: apps, error: ae } = await s
      .from('Application')
      .select('id, candidateName, candidateEmail, createdAt, jobId')
      .in('jobId', jobIds);

    console.log('\n=== APPLICATIONS (' + (apps?.length || 0) + ') ===');
    if (ae) console.log('Error:', ae.message);
    apps?.forEach(a => {
      const job = jobs.find(j => j.id === a.jobId);
      console.log(a.candidateName, '(' + a.candidateEmail + ')');
      console.log('  -> job:', job?.title);
      console.log('  job owner:', job?.userId === AARON_COMPANY ? 'aaron@unified' : 'aaron@gmail');
      console.log('  applied:', a.createdAt);
    });
  }
}

main().catch(console.error);
