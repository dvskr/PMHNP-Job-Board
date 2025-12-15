import { parseLocation } from '../lib/location-parser';

const testCases = [
  'San Francisco, CA',
  'New York, NY',
  'Los Angeles, California',
  'Remote',
  'Boston, MA (Hybrid)',
  'Seattle, WA',
  'Chicago, Illinois',
  'Remote - Telehealth',
  'Austin, TX',
  'Flexible - Hybrid',
  'Portland, OR',
  'United States',
  'Denver, CO',
  'Virtual Nationwide',
  'Miami, Florida',
];

console.log('Testing New Location Parser\n');
console.log('='.repeat(90));

for (const location of testCases) {
  const parsed = parseLocation(location);
  
  console.log(`\nOriginal:   "${location}"`);
  console.log(`City:       ${parsed.city || 'N/A'}`);
  console.log(`State:      ${parsed.state || 'N/A'} (${parsed.stateCode || 'N/A'})`);
  console.log(`Country:    ${parsed.country}`);
  console.log(`Remote:     ${parsed.isRemote}`);
  console.log(`Hybrid:     ${parsed.isHybrid}`);
  console.log(`Confidence: ${parsed.confidence}`);
}

console.log('\n' + '='.repeat(90));

