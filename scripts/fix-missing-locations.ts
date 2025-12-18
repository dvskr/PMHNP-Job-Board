import { prisma } from '@/lib/prisma';
require('dotenv').config();

// US State abbreviations and full names
const STATE_ABBREV_TO_FULL: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
};

const STATE_FULL_TO_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREV_TO_FULL).map(([abbrev, full]) => [full.toLowerCase(), abbrev])
);

interface LocationData {
  city?: string;
  state?: string;
  stateCode?: string;
}

/**
 * Parse location from text using various patterns
 */
function parseLocation(text: string): LocationData | null {
  if (!text) return null;

  // Pattern 1: "City, ST" or "City, State"
  const cityStatePattern = /([A-Z][a-zA-Z\s\.]+),\s*([A-Z]{2}|[A-Z][a-zA-Z\s]+)(?:\s|$|\.|,)/g;
  const matches = Array.from(text.matchAll(cityStatePattern));
  
  for (const match of matches) {
    const city = match[1].trim();
    const stateInput = match[2].trim();
    
    // Check if it's a state abbreviation
    if (stateInput.length === 2 && STATE_ABBREV_TO_FULL[stateInput.toUpperCase()]) {
      return {
        city,
        state: STATE_ABBREV_TO_FULL[stateInput.toUpperCase()],
        stateCode: stateInput.toUpperCase(),
      };
    }
    
    // Check if it's a full state name
    const stateCode = STATE_FULL_TO_ABBREV[stateInput.toLowerCase()];
    if (stateCode) {
      return {
        city,
        state: stateInput,
        stateCode,
      };
    }
  }
  
  // Pattern 2: Just state abbreviation or name (e.g., "in Texas" or "in TX")
  const stateOnlyPattern = /\b(in|at|for|based in|located in)?\s*([A-Z]{2})\b/g;
  const stateMatches = Array.from(text.matchAll(stateOnlyPattern));
  
  for (const match of stateMatches) {
    const stateCode = match[2].toUpperCase();
    if (STATE_ABBREV_TO_FULL[stateCode]) {
      return {
        state: STATE_ABBREV_TO_FULL[stateCode],
        stateCode,
      };
    }
  }
  
  // Pattern 3: Full state name
  for (const [stateName, stateCode] of Object.entries(STATE_FULL_TO_ABBREV)) {
    const regex = new RegExp(`\\b${stateName}\\b`, 'i');
    if (regex.test(text)) {
      return {
        state: STATE_ABBREV_TO_FULL[stateCode],
        stateCode,
      };
    }
  }
  
  return null;
}

async function fixMissingLocations() {
  console.log('🗺️  PMHNP Job Board - Fix Missing Locations\n');
  console.log('='.repeat(60));
  
  // Get non-remote jobs missing city or state
  const jobsMissingLocation = await prisma.job.findMany({
    where: {
      isPublished: true,
      isRemote: false,
      OR: [
        { city: null },
        { state: null },
      ],
    },
    select: {
      id: true,
      title: true,
      location: true,
      description: true,
      city: true,
      state: true,
      stateCode: true,
    },
  });
  
  console.log(`\n📊 Found ${jobsMissingLocation.length} non-remote jobs with missing location data\n`);
  
  const updates: Array<{ id: string; data: LocationData; source: string }> = [];
  const notFound: string[] = [];
  
  for (const job of jobsMissingLocation) {
    // Try to parse from title first
    let locationData = parseLocation(job.title);
    let source = 'title';
    
    // If not found in title, try location field
    if (!locationData && job.location) {
      locationData = parseLocation(job.location);
      source = 'location';
    }
    
    // If still not found, try description (first 500 chars)
    if (!locationData && job.description) {
      const descriptionPreview = job.description.substring(0, 500);
      locationData = parseLocation(descriptionPreview);
      source = 'description';
    }
    
    if (locationData) {
      // Only update fields that are currently missing
      const updateData: LocationData = {};
      
      if (!job.city && locationData.city) {
        updateData.city = locationData.city;
      }
      
      if (!job.state && locationData.state) {
        updateData.state = locationData.state;
      }
      
      if (!job.stateCode && locationData.stateCode) {
        updateData.stateCode = locationData.stateCode;
      }
      
      if (Object.keys(updateData).length > 0) {
        updates.push({ id: job.id, data: updateData, source });
      }
    } else {
      notFound.push(job.id);
    }
  }
  
  console.log(`\n📍 Location Data Found:`);
  console.log(`  From title: ${updates.filter((u) => u.source === 'title').length}`);
  console.log(`  From location field: ${updates.filter((u) => u.source === 'location').length}`);
  console.log(`  From description: ${updates.filter((u) => u.source === 'description').length}`);
  console.log(`  Not found: ${notFound.length}`);
  
  if (updates.length > 0) {
    console.log(`\n🔧 Applying ${updates.length} updates...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      try {
        await prisma.job.update({
          where: { id: update.id },
          data: update.data,
        });
        successCount++;
      } catch (error) {
        console.error(`  ❌ Failed to update job ${update.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Successfully updated: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Failed: ${errorCount}`);
    }
  }
  
  // Show summary by state
  console.log('\n📊 LOCATION BREAKDOWN (After Fix):');
  
  const jobsByState = await prisma.job.groupBy({
    by: ['state'],
    where: { isPublished: true, isRemote: false },
    _count: { _all: true },
  });
  
  // Sort by count descending
  const sortedJobsByState = jobsByState.sort((a, b) => b._count._all - a._count._all);
  
  console.log('\n  Top States:');
  sortedJobsByState.slice(0, 10).forEach((item: { state: string | null; _count: { _all: number } }) => {
    console.log(`    ${item.state || 'NULL'}: ${item._count._all}`);
  });
  
  const stillMissing = await prisma.job.count({
    where: {
      isPublished: true,
      isRemote: false,
      OR: [
        { city: null },
        { state: null },
      ],
    },
  });
  
  console.log(`\n  Still missing location: ${stillMissing}`);
  
  await prisma.$disconnect();
  console.log('\n✅ Location Fix Complete\n');
}

fixMissingLocations().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

