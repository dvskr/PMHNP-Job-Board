import { prisma } from '@/lib/prisma';

// Company suffixes to remove during normalization. Legal-form suffixes
// (Inc, LLC, Corp) are always safe to drop. Industry tags ("Health",
// "Medical", etc.) are dropped only when they don't follow an institutional
// anchor word — see ANCHOR_WORDS below.
const LEGAL_SUFFIXES = [
  'inc', 'inc.', 'incorporated', 'llc', 'l.l.c.', 'ltd', 'limited',
  'corp', 'corp.', 'corporation', 'co', 'co.', 'company',
  'pllc', 'p.c.', 'pc', 'pa', 'p.a.',
];
const INDUSTRY_SUFFIXES = [
  'health', 'healthcare', 'health care', 'medical', 'medical group',
  'group', 'services', 'solutions', 'partners', 'associates',
];

// Anchor words: when an industry suffix follows one of these, do NOT strip.
// "Indiana University Health" must not collapse to "Indiana University"
// because the two organizations are distinct entities. Without this guard
// the dedup script would merge them into one Company row.
const ANCHOR_WORDS = ['university', 'hospital', 'hospitals', 'medical center', 'clinic', 'system', 'foundation', 'institute', 'school', 'college'];

const SUFFIXES = [...LEGAL_SUFFIXES, ...INDUSTRY_SUFFIXES];

// Known companies with their canonical names and aliases.
// Aliases are matched case-insensitively against normalizeCompanyName(input),
// which lowercases + splits CamelCase + strips legal suffixes. So
// "LifeStance Health" → "life stance" matches alias "life stance".
const KNOWN_COMPANIES: Record<string, string[]> = {
  'Talkiatry': ['talkiatry', 'talkiatry inc'],
  'Talkspace': ['talkspace', 'talkspace inc', 'talkspace llc', 'talkspace psychiatry'],
  'SonderMind': ['sondermind', 'sonder mind', 'sondermind inc'],
  // LifeStance: handles "LifeStance Health" (CamelCase splits to "life stance"
  // since "stance" isn't an institutional anchor and "health" gets stripped),
  // "Lifestance" (no caps, no strip → "lifestance"), and "Life Stance".
  'LifeStance Health': ['lifestance', 'lifestance health', 'life stance', 'life stance health'],
  'BlueSky Telepsych': ['blueskytelepsych', 'blue sky telepsych', 'bluesky telepsych'],
  'Cerebral': ['cerebral', 'cerebral inc'],
  'Headway': ['headway', 'headway health'],
  'Spring Health': ['spring health', 'springhealth'],
  'Lyra Health': ['lyra health', 'lyrahealth', 'lyra'],
  'Modern Health': ['modern health', 'modernhealth'],
  'Teladoc Health': ['teladoc', 'teladoc health', 'teladochealth'],
  'Brightside Health': ['brightside', 'brightside health'],
  'TeamHealth': ['teamhealth', 'team health', 'team'],
  'BetterHelp': ['betterhelp', 'better help'],
  'CoreCivic': ['corecivic', 'core civic'],
  'DocCafe': ['doccafe', 'doc cafe'],
  'Department of Veterans Affairs': ['veterans affairs', 'va hospital', 'va health', 'va medical'],
};

/**
 * Strip a trailing " - tail" from a company name when the tail clearly
 * names a unit / department / staffing-division and not a geography.
 *
 * Geographic tails (state names, state abbreviations, "NYC", city pairs)
 * are KEPT because two campuses of the same parent are different employers
 * (e.g. "University of California - Irvine" vs "...- Davis"). When in
 * doubt, this function returns the input unchanged.
 */
function stripDepartmentTail(name: string): string {
  const m = name.match(/^(.*?)\s+[-–—]\s+(.+?)$/);
  if (!m || !m[1] || !m[2]) return name;
  const head = m[1];
  const tail = m[2].trim();
  if (!head.trim() || !tail) return name;

  // Don't strip if the tail is empty or longer than 5 words (likely descriptive).
  const tailWordCount = tail.split(/\s+/).filter(Boolean).length;
  if (tailWordCount > 5) return name;

  const tailLower = tail.toLowerCase();

  // Hard NO-strip cues: tail is a US state name, abbreviation, or famous city.
  if (LOOKS_LIKE_GEOGRAPHY.test(tail)) return name;

  // Soft YES-strip cues: tail is a known department/division/staffing label.
  if (LOOKS_LIKE_DEPARTMENT.test(tailLower)) return head;

  // Default: keep the original (don't risk a wrong merge).
  return name;
}

const US_STATE_NAMES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
  'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];
const US_STATE_ABBREVS = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

const LOOKS_LIKE_GEOGRAPHY = new RegExp(
  '(^|\\b)(' +
    [...US_STATE_NAMES, ...US_STATE_ABBREVS, 'NYC', 'LA', 'SF', 'USA', 'US'].join('|') +
  ')(\\b|$)',
  'i',
);

const LOOKS_LIKE_DEPARTMENT = /\b(division|department|recruitment|staffing|design|development|engineering|operations|marketing|sales|finance|administration|hr|locum tenens|locums?|locum jobs)\b/i;

/**
 * Normalizes a company name by:
 *   - stripping " - <department>" tails (e.g. "GHR Healthcare - Travel Division" → "GHR Healthcare")
 *   - splitting CamelCase ("BlueSky" → "blue sky") so "BlueSky" and "Blue Sky" cluster together
 *   - lowercasing
 *   - removing legal suffixes (Inc, LLC, Corp, etc.) and industry tags (Health, Medical, Group)
 *   - normalizing whitespace and punctuation
 *
 * The output is the dedup *key*, not a display name. For display, prefer
 * the longest-original-form among matching rows.
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';

  let normalized = name.trim();

  // Strip a trailing " - department/division" tail ONLY when the tail looks
  // like a unit, not a geography. Common geographies (state names, abbrevs,
  // city pairs) inside the tail signal "different location, do not merge".
  // We err on the side of NOT stripping to avoid wrongly merging campuses.
  normalized = stripDepartmentTail(normalized);

  // Split CamelCase into separate words BEFORE lowercasing. "BlueSky" → "Blue Sky"
  // Handles consecutive capitals: "TEAMHealth" → "TEAM Health" (uppercase-then-Capital-then-lower)
  normalized = normalized
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  normalized = normalized.toLowerCase();

  // Remove legal-form suffixes unconditionally (Inc, LLC, etc.).
  for (const suffix of LEGAL_SUFFIXES) {
    const suffixPattern = new RegExp(`\\b${suffix.replace('.', '\\.')}\\b`, 'gi');
    normalized = normalized.replace(suffixPattern, '');
  }

  // Remove industry suffixes only when NOT preceded by an institutional
  // anchor word. "TeamHealth" → "team" (anchor absent). But
  // "Indiana University Health" → "indiana university health" (anchor
  // present, must not collapse to "Indiana University").
  for (const suffix of INDUSTRY_SUFFIXES) {
    const escaped = suffix.replace('.', '\\.').replace(/\s+/g, '\\s+');
    // Strip only if there is no anchor word in the immediately preceding
    // 1-2 tokens. We approximate this by requiring the position before the
    // suffix to NOT match any anchor word.
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    normalized = normalized.replace(re, (match, offset: number) => {
      const before = normalized.slice(0, offset).toLowerCase();
      const hasAnchor = ANCHOR_WORDS.some((a) => {
        const aPattern = new RegExp(`\\b${a.replace(/\s+/g, '\\s+')}\\b\\s*$`);
        return aPattern.test(before.trim());
      });
      return hasAnchor ? match : '';
    });
  }

  // Remove special characters except spaces and hyphens
  normalized = normalized.replace(/[^a-z0-9\s-]/g, '');

  // Collapse hyphens (after suffix removal "summit-medical-consultants-llc"
  // becomes "summit---" — flatten to spaces).
  normalized = normalized.replace(/-+/g, ' ');

  // Collapse multiple spaces into one
  normalized = normalized.replace(/\s+/g, ' ');

  // Trim again after all replacements
  normalized = normalized.trim();

  // Convert internal whitespace to hyphens so the value is URL-safe. The
  // function output doubles as both a DB dedup key and the slug used in
  // /companies/{slug} URLs (see app/sitemap.ts and app/companies/[slug]/page.tsx).
  // Previously this returned values like "life stance", which were then
  // percent-encoded into ugly /companies/life%20stance URLs. Existing rows
  // with the legacy space-form still resolve via the backward-compat lookup
  // in getOrCreateCompany() below.
  normalized = normalized.replace(/\s+/g, '-');

  return normalized;
}

/**
 * Finds the canonical name for a given company name from KNOWN_COMPANIES
 */
export function findCanonicalName(name: string): string | null {
  const normalized = normalizeCompanyName(name);

  if (!normalized) return null;

  // Check each canonical company and its aliases
  for (const [canonicalName, aliases] of Object.entries(KNOWN_COMPANIES)) {
    const normalizedAliases = aliases.map((alias: string) => normalizeCompanyName(alias));
    
    if (normalizedAliases.includes(normalized)) {
      return canonicalName;
    }
  }

  return null;
}

/**
 * Gets an existing company or creates a new one
 * Returns the company ID
 */
export async function getOrCreateCompany(employerName: string): Promise<string> {
  try {
    if (!employerName || !employerName.trim()) {
      throw new Error('Employer name is required');
    }

    const normalized = normalizeCompanyName(employerName);
    const canonicalName = findCanonicalName(employerName);
    const finalName = canonicalName || employerName;

    // Try to find existing company by normalized name (kebab-case form).
    let company = await prisma.company.findUnique({
      where: { normalizedName: normalized },
    });

    // Backward-compat lookup: rows inserted before the normalizer started
    // emitting kebab-case have the legacy space-form stored. Try that form
    // before falling through to "create new" — otherwise every re-ingest
    // of an existing company would create a duplicate row.
    if (!company && normalized.includes('-')) {
      const legacyNormalized = normalized.replace(/-/g, ' ');
      const legacyMatch = await prisma.company.findUnique({
        where: { normalizedName: legacyNormalized },
      });
      if (legacyMatch) {
        // Opportunistically upgrade the row in place. Once all legacy rows
        // are touched by ingest, the backfill is complete; no separate
        // migration needed.
        company = await prisma.company.update({
          where: { id: legacyMatch.id },
          data: { normalizedName: normalized, jobCount: { increment: 1 } },
        });
        return company.id;
      }
    }

    if (company) {
      // Increment job count
      company = await prisma.company.update({
        where: { id: company.id },
        data: { jobCount: { increment: 1 } },
      });
      return company.id;
    }

    // Create new company
    const aliases = canonicalName ? KNOWN_COMPANIES[canonicalName] || [] : [];
    
    company = await prisma.company.create({
      data: {
        name: finalName,
        normalizedName: normalized,
        aliases: aliases,
        jobCount: 1,
        isVerified: canonicalName !== null, // Mark as verified if it's a known company
      },
    });

    return company.id;
  } catch (error) {
    console.error('Error in getOrCreateCompany:', error);
    throw error;
  }
}

/**
 * Links a job to its company based on the employer name
 */
export async function linkJobToCompany(jobId: string): Promise<void> {
  try {
    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, employer: true, companyId: true },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    if (job.companyId) {
      // Job already linked to a company
      return;
    }

    // Get or create company
    const companyId = await getOrCreateCompany(job.employer);

    // Update job with company ID
    await prisma.job.update({
      where: { id: jobId },
      data: { companyId },
    });
  } catch (error) {
    console.error(`Error linking job ${jobId} to company:`, error);
    throw error;
  }
}

/**
 * Links all jobs without a company to their respective companies
 * Processes in batches for better performance
 */
export async function linkAllJobsToCompanies(): Promise<{
  processed: number;
  linked: number;
  companiesCreated: number;
}> {
  const BATCH_SIZE = 100;
  let processed = 0;
  let linked = 0;
  const companiesMap = new Map<string, string>(); // normalized name -> company ID

  try {
    // Get count of jobs without companies
    const totalJobs = await prisma.job.count({
      where: { companyId: null },
    });

    console.log(`Found ${totalJobs} jobs without company links`);

    // Process in batches
    let skip = 0;
    while (skip < totalJobs) {
      const jobs = await prisma.job.findMany({
        where: { companyId: null },
        select: { id: true, employer: true },
        take: BATCH_SIZE,
        skip,
      });

      if (jobs.length === 0) break;

      for (const job of jobs) {
        try {
          const normalized = normalizeCompanyName(job.employer);
          
          // Check if we've already processed this company in this batch
          let companyId = companiesMap.get(normalized);
          
          if (!companyId) {
            // Get or create company
            companyId = await getOrCreateCompany(job.employer);
            companiesMap.set(normalized, companyId);
          } else {
            // Just increment the count for existing company
            await prisma.company.update({
              where: { id: companyId },
              data: { jobCount: { increment: 1 } },
            });
          }

          // Update job with company ID
          await prisma.job.update({
            where: { id: job.id },
            data: { companyId },
          });

          linked++;
        } catch (error) {
          console.error(`Error processing job ${job.id}:`, error);
        }

        processed++;
      }

      skip += BATCH_SIZE;
      console.log(`Processed ${processed}/${totalJobs} jobs...`);
    }

    const companiesCreated = companiesMap.size;

    console.log(`Completed: ${processed} processed, ${linked} linked, ${companiesCreated} companies created/used`);

    return {
      processed,
      linked,
      companiesCreated,
    };
  } catch (error) {
    console.error('Error in linkAllJobsToCompanies:', error);
    throw error;
  }
}

/**
 * Merges two companies, keeping one and transferring all jobs from the other
 */
export async function mergeCompanies(
  keepId: string,
  mergeId: string
): Promise<void> {
  try {
    if (!keepId || !mergeId) {
      throw new Error('Both keepId and mergeId are required');
    }

    if (keepId === mergeId) {
      throw new Error('Cannot merge a company with itself');
    }

    // Fetch both companies
    const [keepCompany, mergeCompany] = await Promise.all([
      prisma.company.findUnique({ where: { id: keepId } }),
      prisma.company.findUnique({ where: { id: mergeId } }),
    ]);

    if (!keepCompany) {
      throw new Error(`Company with ID ${keepId} not found`);
    }

    if (!mergeCompany) {
      throw new Error(`Company with ID ${mergeId} not found`);
    }

    // Get count of jobs to transfer
    const jobsToTransfer = await prisma.job.count({
      where: { companyId: mergeId },
    });

    // Update all jobs from mergeCompany to keepCompany
    await prisma.job.updateMany({
      where: { companyId: mergeId },
      data: { companyId: keepId },
    });

    // Add merged company name to keepCompany's aliases if not already present
    const updatedAliases = [...new Set([
      ...keepCompany.aliases,
      mergeCompany.name,
      mergeCompany.normalizedName,
      ...mergeCompany.aliases,
    ])];

    // Update keepCompany with new aliases and job count
    await prisma.company.update({
      where: { id: keepId },
      data: {
        aliases: updatedAliases,
        jobCount: keepCompany.jobCount + jobsToTransfer,
      },
    });

    // Delete the merged company
    await prisma.company.delete({
      where: { id: mergeId },
    });

    console.log(
      `Successfully merged company ${mergeCompany.name} (${jobsToTransfer} jobs) into ${keepCompany.name}`
    );
  } catch (error) {
    console.error('Error merging companies:', error);
    throw error;
  }
}

