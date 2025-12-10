// Debug script to see raw Jooble API response

async function debugJooble() {
  const apiKey = process.env.JOOBLE_API_KEY;
  
  if (!apiKey) {
    console.error('JOOBLE_API_KEY not set');
    return;
  }

  console.log('Making request to Jooble API...\n');

  try {
    const response = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywords: 'PMHNP',
        location: 'United States',
        page: 1,
      }),
    });

    const data = await response.json();

    console.log('Total jobs found:', data.totalCount);
    console.log('\nFirst job (raw response):');
    console.log(JSON.stringify(data.jobs[0], null, 2));
    
    console.log('\n\nAll fields in first job:');
    console.log(Object.keys(data.jobs[0]));

  } catch (error) {
    console.error('Error:', error);
  }
}

debugJooble().catch(console.error);

