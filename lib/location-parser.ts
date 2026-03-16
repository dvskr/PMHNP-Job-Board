/**
 * Location Parser
 * Parses and standardizes job locations
 */

import { prisma } from './prisma';

export interface ParsedLocation {
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string;
  isRemote: boolean;
  isHybrid: boolean;
  originalLocation: string;
  confidence: number; // 0-1
}

// State name to code mappings
const STATE_CODES: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

// Code to state name mappings
const CODE_TO_STATE: Record<string, string> = Object.entries(STATE_CODES)
  .reduce((acc, [state, code]) => ({ ...acc, [code]: state }), {} as Record<string, string>);

// Remote/Hybrid indicators
const REMOTE_KEYWORDS = [
  'remote', 'telehealth', 'telepsychiatry', 'virtual', 'work from home',
  'wfh', 'anywhere', 'nationwide', 'united states', 'usa remote',
];

const HYBRID_KEYWORDS = ['hybrid', 'flexible', 'partial remote'];

/**
 * Parse a location string into structured data
 */
export function parseLocation(location: string): ParsedLocation {
  const result: ParsedLocation = {
    city: null,
    state: null,
    stateCode: null,
    country: 'US',
    isRemote: false,
    isHybrid: false,
    originalLocation: location || '',
    confidence: 0.3, // Default low confidence
  };

  // Handle null/undefined/empty
  if (!location || typeof location !== 'string') {
    return result;
  }

  // Normalize input
  const normalized = location.trim();
  if (!normalized) {
    return result;
  }

  result.originalLocation = normalized;
  const lower = normalized.toLowerCase();

  // Check for remote
  for (const keyword of REMOTE_KEYWORDS) {
    if (lower.includes(keyword)) {
      result.isRemote = true;
      result.confidence = 0.7;
      break;
    }
  }

  // Check for hybrid
  for (const keyword of HYBRID_KEYWORDS) {
    if (lower.includes(keyword)) {
      result.isHybrid = true;
      result.confidence = 0.7;
      break;
    }
  }

  // ── Pre-clean: strip remote/hybrid/country markers to isolate city/state ──
  let cleaned = normalized
    // Remove "Remote -", "Remote:", "Remote –", "(Remote)" etc.
    .replace(/\b(remote|telehealth|telepsychiatry|virtual|work from home|wfh|hybrid|flexible)\s*[-–:]\s*/gi, '')
    .replace(/\(\s*(remote|telehealth|virtual|hybrid|flexible)\s*\)/gi, '')
    .replace(/[-–]\s*(remote|telehealth|virtual|hybrid|flexible)\b/gi, '')
    .replace(/\b(remote|telehealth|telepsychiatry|virtual|work from home|wfh)\b/gi, '')
    // Remove "HQ:", "Headquarters:"
    .replace(/\b(hq|headquarters)\s*[:]\s*/gi, '')
    .trim();

  // Handle Workday "US-ST-City" format → "City, ST" (BEFORE stripping "US")
  cleaned = cleaned.replace(/^US-([A-Z]{2})-(.+)$/i, '$2, $1');

  // Now remove country markers
  cleaned = cleaned
    .replace(/,?\s*\b(united states|usa|us|u\.s\.a?\.|nationwide|anywhere)\b/gi, '')
    // Strip county names: "Colorado Springs, El Paso County" → "Colorado Springs"
    // Also handles "Raleigh, Wake County" and "San Diego, San Diego County"
    .replace(/,\s*[A-Z][a-zA-Z\s'-]+ County\b/gi, '')
    // Strip borough/neighborhood qualifiers: "Grand Central, Manhattan" → keep as-is
    .replace(/,\s*,/g, ',') // clean double commas
    .trim()
    .replace(/^[,\-–\s]+|[,\-–\s]+$/g, ''); // trim delimiters

  // If nothing left after cleaning and it's remote, return remote-only
  if (!cleaned && result.isRemote) {
    return result;
  }

  // If cleaned string is different, use it for parsing; otherwise use original
  const toParse = cleaned || normalized;

  // Try to parse "City, ST" pattern (e.g., "San Francisco, CA")
  const cityStateCodePattern = /^([^,]+),\s*([A-Z]{2})$/i;
  const cityStateCodeMatch = toParse.match(cityStateCodePattern);

  if (cityStateCodeMatch) {
    const potentialCity = cityStateCodeMatch[1].trim();
    const potentialCode = cityStateCodeMatch[2].toUpperCase();

    // Verify state code is valid
    if (CODE_TO_STATE[potentialCode]) {
      result.city = potentialCity;
      result.stateCode = potentialCode;
      result.state = CODE_TO_STATE[potentialCode];
      result.confidence = 1.0;
      return result;
    }
  }

  // Try to parse "City, State" pattern (e.g., "San Francisco, California")
  const cityStateNamePattern = /^([^,]+),\s*([A-Za-z\s]+)$/;
  const cityStateNameMatch = toParse.match(cityStateNamePattern);

  if (cityStateNameMatch) {
    const potentialCity = cityStateNameMatch[1].trim();
    const potentialState = cityStateNameMatch[2].trim();

    // Check if it's a valid state name
    if (STATE_CODES[potentialState]) {
      result.city = potentialCity;
      result.state = potentialState;
      result.stateCode = STATE_CODES[potentialState];
      result.confidence = 1.0;
      return result;
    }

    // Try case-insensitive state name lookup
    const stateLower = potentialState.toLowerCase();
    for (const [stateName, code] of Object.entries(STATE_CODES)) {
      if (stateName.toLowerCase() === stateLower) {
        result.city = potentialCity;
        result.state = stateName;
        result.stateCode = code;
        result.confidence = 1.0;
        return result;
      }
    }
  }

  // Try to extract just state code (look for 2-letter uppercase)
  const stateCodeOnlyPattern = /\b([A-Z]{2})\b/;
  const stateCodeMatch = toParse.match(stateCodeOnlyPattern);

  if (stateCodeMatch) {
    const code = stateCodeMatch[1];
    if (CODE_TO_STATE[code]) {
      result.stateCode = code;
      result.state = CODE_TO_STATE[code];
      result.confidence = 0.8;

      // Try to extract city (everything before the state code)
      const beforeState = toParse.split(code)[0].trim().replace(/,\s*$/, '');
      if (beforeState && beforeState.length > 2) {
        result.city = beforeState;
        result.confidence = 1.0;
      }

      return result;
    }
  }

  // Try to find state name in the location string
  const toParseL = toParse.toLowerCase();
  for (const [stateName, code] of Object.entries(STATE_CODES)) {
    // Use word boundary to match full state names only
    const stateRegex = new RegExp(`\\b${stateName}\\b`, 'i');
    if (!stateRegex.test(toParse)) continue;

    // Check if state name is part of a compound city name
    // (e.g., "Colorado Springs", "New York City", "Virginia Beach")
    const parts = toParse.split(stateRegex);
    const beforeState = parts[0]?.trim().replace(/,\s*$/, '') || '';
    const afterState = parts[parts.length - 1]?.trim().replace(/^,\s*/, '') || '';

    // If there's text AFTER the state name with no comma separator,
    // it's likely a compound city name — skip this state match
    if (afterState && !toParse.includes(',')) continue;

    result.state = stateName;
    result.stateCode = code;
    result.confidence = 0.8;

    // Try to extract city (part before state name)
    if (beforeState && beforeState.length > 2) {
      result.city = beforeState;
      result.confidence = 1.0;
    }

    return result;
  }

  // If we have stateCode but not state, look up full name
  if (result.stateCode && !result.state) {
    result.state = CODE_TO_STATE[result.stateCode];
  }

  // If we have state but not stateCode, look up code
  if (result.state && !result.stateCode) {
    result.stateCode = STATE_CODES[result.state];
  }

  // If we still have nothing parsed, return low confidence
  if (!result.city && !result.state && !result.isRemote && !result.isHybrid) {
    // Last resort: if toParse has a clean string that looks like a city name
    // (e.g., "Colorado Springs" after county stripping), use it as city
    if (toParse && toParse.length > 2 && /^[A-Za-z\s'-]+$/.test(toParse)) {
      result.city = toParse;
      result.confidence = 0.5;
    } else {
      result.confidence = 0.3;
    }
  }

  return result;
}

/**
 * Parse all locations for jobs where state is null
 */
export async function parseAllLocations(): Promise<{
  processed: number;
  parsed: number;
  remote: number;
}> {
  const stats = {
    processed: 0,
    parsed: 0,
    remote: 0,
  };

  try {
    // Get all jobs where state is null
    const jobs = await prisma.job.findMany({
      where: {
        state: null,
      },
      select: {
        id: true,
        location: true,
      },
    });

    console.log(`[Location Parser] Found ${jobs.length} jobs to process`);

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (job: { id: string; location: string }) => {
          try {
            const parsed = parseLocation(job.location);
            stats.processed++;

            if (parsed.isRemote) {
              stats.remote++;
            }

            if (parsed.state || parsed.city) {
              stats.parsed++;
            }

            // Update the job
            await prisma.job.update({
              where: { id: job.id },
              data: {
                city: parsed.city,
                state: parsed.state,
                stateCode: parsed.stateCode,
                country: parsed.country,
                isRemote: parsed.isRemote,
                isHybrid: parsed.isHybrid,
              },
            });
          } catch (error) {
            console.error(`[Location Parser] Error processing job ${job.id}:`, error);
          }
        })
      );

      // Log progress
      if ((i + batchSize) % 500 === 0 || i + batchSize >= jobs.length) {
        console.log(`[Location Parser] Progress: ${Math.min(i + batchSize, jobs.length)}/${jobs.length}`);
      }
    }

    console.log(`[Location Parser] Complete: Processed ${stats.processed}, Parsed ${stats.parsed}, Remote ${stats.remote}`);

    return stats;
  } catch (error) {
    console.error('[Location Parser] Fatal error:', error);
    throw error;
  }
}

/**
 * Parse and save location for a specific job
 */
export async function parseJobLocation(jobId: string): Promise<ParsedLocation> {
  try {
    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        location: true,
      },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    // Parse the location
    const parsed = parseLocation(job.location);

    // Save to database
    await prisma.job.update({
      where: { id: jobId },
      data: {
        city: parsed.city,
        state: parsed.state,
        stateCode: parsed.stateCode,
        country: parsed.country,
        isRemote: parsed.isRemote,
        isHybrid: parsed.isHybrid,
      },
    });

    console.log(`[Location Parser] Parsed job ${jobId}: ${JSON.stringify(parsed)}`);

    return parsed;
  } catch (error) {
    console.error(`[Location Parser] Error parsing job location:`, error);
    throw error;
  }
}
