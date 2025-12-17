import { parseLocation, ParsedLocation } from '../lib/location-parser';

// Helper function to format parsed location
function formatLocation(parsed: ParsedLocation): string {
  if (parsed.isRemote) {
    return 'Remote';
  }
  const parts = [];
  if (parsed.city) parts.push(parsed.city);
  if (parsed.stateCode) parts.push(parsed.stateCode);
  else if (parsed.state) parts.push(parsed.state);
  if (parsed.country && parsed.country !== 'US') parts.push(parsed.country);
  return parts.join(', ') || 'Unknown';
}

const testLocations = [
  'Remote',
  'New York, NY',
  'San Francisco, California',
  'Los Angeles, CA (Remote)',
  'Chicago, IL (Hybrid)',
  'Seattle, WA',
  'Austin, Texas',
  'Boston, MA, USA',
  'Remote - United States',
  'Miami, Florida',
  'Denver, CO',
  'Portland, OR (Telehealth)',
];

console.log('Testing Location Parser\n');
console.log('='.repeat(80));

for (const location of testLocations) {
  const parsed = parseLocation(location);
  const formatted = formatLocation(parsed);
  
  console.log(`\nInput:     "${location}"`);
  console.log(`City:      ${parsed.city || 'N/A'}`);
  console.log(`State:     ${parsed.state || 'N/A'} (${parsed.stateCode || 'N/A'})`);
  console.log(`Country:   ${parsed.country || 'N/A'}`);
  console.log(`Remote:    ${parsed.isRemote}`);
  console.log(`Hybrid:    ${parsed.isHybrid}`);
  console.log(`Formatted: "${formatted}"`);
}

console.log('\n' + '='.repeat(80));

