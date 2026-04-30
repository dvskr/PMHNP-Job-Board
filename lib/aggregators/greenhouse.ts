interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  requisition_id: string;
  location: {
    name: string;
  };
  absolute_url: string;
  internal_job_id: number;
  metadata: Array<Record<string, unknown>>;
  departments: Array<{
    id: number;
    name: string;
  }>;
  offices: Array<{
    id: number;
    name: string;
    location: string;
  }>;
  content: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
  };
}

export interface GreenhouseJobRaw {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyLink: string;
  postedDate?: string;
}

const GREENHOUSE_COMPANIES = [
  // ── Trimmed 2026-04-30: dropped 622/622 configured tenants
  // that had never added a PMHNP job. See scripts/audit-greenhouse-tenants.ts
  // and .tmp_greenhouse_tenant_audit.json for the source data.

  // VERIFIED WORKING - Primary sources
  'headway',             // 2 PMHNP jobs
  'modernhealth',        // 1 PMHNP job
  'mantrahealth',        // 1 PMHNP job
  'cerebral',            // 1 PMHNP job (new!)
  'twochairs',           // 3 PMHNP jobs (new!)

  // VERIFIED WORKING - Monitoring (no PMHNP currently)
  'talkspace',           // On Greenhouse, checking regularly
  'ayahealthcare',       // On Greenhouse, checking regularly
  'amwell',              // On Greenhouse, checking regularly
  'octave',              // On Greenhouse, checking regularly
  'growtherapy',         // On Greenhouse, checking regularly

  // REMOVED (404 errors - not on Greenhouse):
  // lifestancehealth, lifestance, brightsidehealth, elliementalhealth, thriveworks

  // === NEW - VERIFIED WITH PMHNP JOBS ===
  'blueskytelepsych',    // Blue Sky Telepsych — 922 PMHNP jobs!
  'bicyclehealth',       // Bicycle Health — 27 PMHNP jobs
  'blackbirdhealth',     // Blackbird Health

  // === NEW - VERIFIED VALID, monitoring for PMHNP ===
  'springhealth66',      // Spring Health — 91 total jobs

  // === ADDED 2026-02-13 — VERIFIED WITH PMHNP JOBS ===
  'betterhelp',          // BetterHelp — 19 PMHNP jobs (18 recent)
  'firsthand',           // Firsthand — 13 PMHNP jobs (2 recent)
  'compasspathways',     // COMPASS Pathways — 11 PMHNP jobs (11 recent)

  // === ADDED 2026-02-13 — VALID, monitoring for PMHNP ===
  'amaehealth',          // Amae Health — 27 total jobs

  // === ADDED 2026-02-13 — EXPANDED SCAN (278 slugs tested) ===
  'bouldercare',         // Boulder Care — 18 PMHNP jobs (18 recent) ⭐

  // === EXPANDED SCAN — VALID, monitoring for PMHNP ===

  // === PROD DB MINING — 9,295 slugs from 3,602 employers ===
  'strivehealth',        // Strive Health — 14 PMHNP (14 recent) ⭐
  'medelitellc',         // MedElite LLC — 13 PMHNP (13 recent) ⭐
  'solmentalhealth',     // Sol Mental Health — 10 PMHNP (10 recent) ⭐
  'meditelecare',        // MediTelecare — 7 PMHNP (3 recent)
  'cloverhealth',        // Clover Health — 7 PMHNP (7 recent)
  'prenuvo',             // Prenuvo — 7 PMHNP (5 recent)
  'pineparkhealth',      // Pine Park Health — 6 PMHNP (3 recent)
  'moodhealth',          // Moodhealth — 5 PMHNP (5 recent)
  'compasshealthcenter', // Compass Health Center — 4 PMHNP (4 recent)
  'onemedical',          // One Medical — 4 PMHNP (4 recent)
  'seniordoc',           // Senior Doc — 3 PMHNP (3 recent)
  'ascendhealthcare',    // Ascend Healthcare — 3 PMHNP (3 recent)
  'lonestarcircleofcare',// Lone Star Circle of Care — 3 PMHNP (3 recent)
  'hellobackpack',       // Backpack Healthcare — 3 PMHNP (3 recent)
  'northpointrecoveryholdingsllc', // Northpoint Recovery — 3 PMHNP (3 recent)
  'thejanepauleycommunityhealthcenterinc', // Jane Pauley CHC — 2 PMHNP (2 recent)
  'riviamind',           // RIVIA Mind — 2 PMHNP (1 recent)
  'mentalhealthcenterofdenver', // MH Center of Denver — 1 PMHNP
  'overstoryhealth',     // Overstory Health — 1 PMHNP
  'nursing',             // Nursing Wellness Center — 1 PMHNP
  'tia',                 // Tia — 1 PMHNP

  // === ADDED 2026-02-16 — Full ATS Discovery (189 companies scanned) ===

  // === ADDED 2026-02-16 — CSV test: 62 new PMHNP-active slugs ===
  'talkspacepsychiatry', // Talkspace Psychiatry — 50 PMHNP
  'ennoblecare',         // Ennoble Care — 38 PMHNP
  'guidelighthealth',    // Guidelight Health — 24 PMHNP
  'cartwheelcare',       // Cartwheel Care — 15 PMHNP
  'moodhealth',          // Mood Health — 15 PMHNP (dupe check OK)
  'pairteam',            // Pair Team — 14 PMHNP
  'dianahealth94',       // Diana Health — 12 PMHNP
  'vailclinicincdbavailhealthhospital', // Vail Health Hospital — 12 PMHNP
  'folxhealth',          // FOLX Health — 9 PMHNP
  'welbehealth',         // Welbe Health — 7 PMHNP
  'amaehealth',          // Amae Health — 6 PMHNP (already in COMPANY_NAMES)
  'aspirehealthalliance',// Aspire Health Alliance — 5 PMHNP
  'imaginepediatrics',   // Imagine Pediatrics — 3 PMHNP
  'foresightmentalhealth', // Foresight Mental Health — 2 PMHNP
  'khealthcareers',      // K Health — 1 PMHNP

  // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===
  'carrumhealth',
  'hopscotchprimarycare',
  'oshihealth',
  'skildai-careers',

  // === BULK ADD — All remaining CSV companies (480) ===
  'akidolabs',
  'purposemed',
  'silvus-international-opportunites',
  'walleyecapital-external-students',
];


const COMPANY_NAMES: Record<string, string> = {
  // Verified companies
  'talkspace': 'Talkspace',
  'modernhealth': 'Modern Health',
  'cerebral': 'Cerebral',
  'headway': 'Headway',
  'amwell': 'Amwell',
  'ayahealthcare': 'Aya Healthcare',
  'mantrahealth': 'Mantra Health',

  // New additions
  'twochairs': 'Two Chairs',
  'octave': 'Octave',
  'growtherapy': 'Grow Therapy',

  // New verified additions
  'blueskytelepsych': 'Blue Sky Telepsych',
  'bicyclehealth': 'Bicycle Health',
  'springhealth66': 'Spring Health',
  'omadahealth': 'Omada Health',
  'brave': 'Brave Health',

  // Added 2026-02-13
  'betterhelp': 'BetterHelp',
  'firsthand': 'Firsthand',
  'compasspathways': 'COMPASS Pathways',
  'alma': 'Alma',
  'cortica': 'Cortica',
  'galileo': 'Galileo',
  'amaehealth': 'Amae Health',
  'pelago': 'Pelago',

  // Added 2026-02-13 (expanded scan)
  'bouldercare': 'Boulder Care',
  'daybreakhealth': 'Daybreak Health',
  'parallellearning': 'Parallel Learning',
  'legion': 'Legion',
  'array': 'Array Behavioral Care',
  'neuroflow': 'NeuroFlow',
  'forgehealth': 'Forge Health',
  'iris': 'Iris',

  // Added 2026-02-13 (prod DB mining — 9,295 slugs)
  'strivehealth': 'Strive Health',
  'medelitellc': 'MedElite LLC',
  'solmentalhealth': 'Sol Mental Health',
  'meditelecare': 'MediTelecare',
  'cloverhealth': 'Clover Health',
  'prenuvo': 'Prenuvo',
  'pineparkhealth': 'Pine Park Health',
  'moodhealth': 'Moodhealth',
  'compasshealthcenter': 'Compass Health Center',
  'onemedical': 'One Medical',
  'seniordoc': 'Senior Doc',
  'ascendhealthcare': 'Ascend Healthcare',
  'lonestarcircleofcare': 'Lone Star Circle of Care',
  'hellobackpack': 'Backpack Healthcare',
  'northpointrecoveryholdingsllc': 'Northpoint Recovery',
  'thejanepauleycommunityhealthcenterinc': 'Jane Pauley Community Health Center',
  'riviamind': 'RIVIA Mind',
  'mentalhealthcenterofdenver': 'Mental Health Center of Denver',
  'overstoryhealth': 'Overstory Health',
  'nursing': 'Nursing Wellness Center',
  'vitalcaringgroup': 'VitalCaring Group',
  'peregrinehealth': 'Peregrine Health',
  'tia': 'Tia',
  'lts': 'LTS',

  // Added 2026-02-16 (ATS discovery)
  'prosperhealth': 'Prosper Health',
  'pma': 'Pathlight Mood & Anxiety',
  'carbon': 'Carbon Health',
  'veterans': 'Veterans Affairs',
  'summit': 'Summit Healthcare',
  'universal': 'Universal Health Services',
  'calm': 'Calm',

  // Added 2026-02-16 (CSV test — 62 new PMHNP-active slugs)
  'theoriamedical': 'Theoria Medical',
  'talkspacepsychiatry': 'Talkspace Psychiatry',
  'midihealth': 'Midi Health',
  'luminishealth': 'Luminis Health',
  'ennoblecare': 'Ennoble Care',
  'integrityrehabgroup': 'Integrity Rehab Group',
  'formhealth': 'Form Health',
  'guidelighthealth': 'Guidelight Health',
  'optimalcare': 'Optimal Care',
  'cartwheelcare': 'Cartwheel Care',
  'healthlink': 'HealthLink',
  'engageseniortherapy': 'Engage Senior Therapy',
  'pairteam': 'Pair Team',
  'sollishealth': 'Sollis Health',
  'dianahealth94': 'Diana Health',
  'vailclinicincdbavailhealthhospital': 'Vail Health Hospital',
  'axisteletherapy': 'Axis Teletherapy',
  'folxhealth': 'FOLX Health',
  'neurahealth': 'Neura Health',
  'centrumhealth': 'Centrum Health',
  'reemahealth': 'Reema Health',
  'welbehealth': 'Welbe Health',
  'wovencare': 'Woven Care',
  'allarahealth': 'Allara Health',
  'eucalyptus': 'Eucalyptus',
  'mavenclinicproviders': 'Maven Clinic',
  'triumvirateenvironmental': 'Triumvirate Environmental',
  'aspirehealthalliance': 'Aspire Health Alliance',
  'lumimeds': 'Lumimeds',
  'seenhealth': 'Seen Health',
  'sensiblecare': 'Sensible Care',
  'cardioone': 'Cardio One',
  'assemblyhealth': 'Assembly Health',
  'bridgebio': 'BridgeBio',
  'cadencehealth': 'Cadence Health',
  'imaginepediatrics': 'Imagine Pediatrics',
  'oncoverycare': 'Oncovery Care',
  'theoncologyinstitute': 'The Oncology Institute',
  'thymecare': 'Thyme Care',
  'allcareers': 'AllCareers',
  'foresightmentalhealth': 'Foresight Mental Health',
  'herselfhealth': 'Herself Health',
  'maplighttherapeutics': 'MapLight Therapeutics',
  'meruhealth': 'Meru Health',
  'sandstonecarebroomfield': 'Sandstone Care Broomfield',
  'sandstonecoloradomedicaldetox': 'Sandstone Care Medical Detox',
  'vardaspace': 'Varda Space',
  'axsometherapeutics': 'Axsome Therapeutics',
  'cadrehospice': 'Cadre Hospice',
  'dynetherapeutics': 'Dyne Therapeutics',
  'found': 'Found Health',
  'habitathealth': 'Habitat Health',
  'kernalbio': 'Kernal Bio',
  'khealthcareers': 'K Health',
  'luminaryhospice': 'Luminary Hospice',
  'pomelocare': 'Pomelo Care',
  'sportandspinephysicaltherapy': 'Sport & Spine Physical Therapy',
  'twinhealth': 'Twin Health',
  'understoodcare': 'Understood Care',
  'vitablehealth': 'Vitable Health',
  'vitahealth': 'Vita Health',

  // Bulk-added CSV companies
  '10xgenomics': '10x Genomics',
  'adaptivebiotechnologies': 'Adaptive Biotechnologies',
  'freenome': 'Freenome',
  'natera': 'Natera',
  'truepill': 'Truepill',
  'yarrowbiotechnology': 'Yarrow Biotechnology',
};

function formatCompanyName(slug: string): string {

  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(_title: string, _content: string): boolean {
  return true; // All jobs pass through — central filter in ingestFromSource handles rejection tracking
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCompanyJobs(companySlug: string): Promise<GreenhouseJobRaw[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`;
  const companyName = formatCompanyName(companySlug);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[Greenhouse] ${companySlug}: API error ${response.status}`);
      return [];
    }

    const data: GreenhouseResponse = await response.json();
    const jobs = data.jobs || [];
    const totalJobs = jobs.length;

    console.log(`[Greenhouse] ${companySlug}: ${totalJobs} jobs fetched`);

    const allJobs = jobs.map((job: GreenhouseJob) => ({
      externalId: `greenhouse-${companySlug}-${job.id}`,
      title: job.title,
      company: companyName,
      location: job.location?.name || job.offices?.[0]?.name || 'Remote',
      description: job.content || '',
      applyLink: job.absolute_url,
      // NOTE: Greenhouse API only exposes updated_at (last-edit date), NOT a real posted date.
      // Using updated_at caused old jobs to appear "new" when employers edited listings.
      // Omitting it so the normalizer falls through to null → filter uses createdAt (ingestion time).
    }));

    // Pre-filter for PMHNP relevance
    const relevantJobs = allJobs.filter(job => isPMHNPJob(job.title, job.description));
    console.log(`[Greenhouse] ${companySlug}: ${relevantJobs.length}/${totalJobs} jobs relevant`);

    return relevantJobs;
  } catch (error) {
    console.error(`[Greenhouse] ${companySlug}: Error -`, error);
    return [];
  }
}

/**
 * Total number of chunks for Greenhouse (769 companies / ~96 per chunk = 8)
 */
export const GREENHOUSE_TOTAL_CHUNKS = 8;
const GREENHOUSE_CHUNK_SIZE = Math.ceil(GREENHOUSE_COMPANIES.length / GREENHOUSE_TOTAL_CHUNKS);

export async function fetchGreenhouseJobs(options?: { chunk?: number }): Promise<GreenhouseJobRaw[]> {
  let companies = GREENHOUSE_COMPANIES;

  if (options?.chunk !== undefined) {
    const start = options.chunk * GREENHOUSE_CHUNK_SIZE;
    const end = start + GREENHOUSE_CHUNK_SIZE;
    companies = GREENHOUSE_COMPANIES.slice(start, end);
    console.log(`[Greenhouse] Chunk ${options.chunk}/${GREENHOUSE_TOTAL_CHUNKS - 1}: Processing companies ${start + 1}-${Math.min(end, GREENHOUSE_COMPANIES.length)} of ${GREENHOUSE_COMPANIES.length}`);
  } else {
    console.log(`[Greenhouse] Checking ${GREENHOUSE_COMPANIES.length} companies for PMHNP jobs...`);
  }

  const allJobs: GreenhouseJobRaw[] = [];
  const failedCompanies: string[] = [];
  const BATCH_SIZE = 10;

  try {
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
      const batch = companies.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(companySlug => fetchCompanyJobs(companySlug))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          allJobs.push(...result.value);
        } else {
          failedCompanies.push(batch[j]);
          console.error(`[Greenhouse] Failed to fetch from ${batch[j]}`);
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < companies.length) {
        await sleep(200);
      }
    }

    console.log(`[Greenhouse] Total PMHNP jobs fetched: ${allJobs.length}`);

    if (failedCompanies.length > 0) {
      console.log(`[Greenhouse] Failed companies (${failedCompanies.length}): ${failedCompanies.join(', ')}`);
    }

    return allJobs;
  } catch (error) {
    console.error('[Greenhouse] Error in main fetch:', error);
    return allJobs;
  }
}
