interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt: number;
  categories: {
    commitment?: string;
    department?: string;
    level?: string;
    location?: string;
    team?: string;
  };
  description: string;
  descriptionPlain: string;
  lists: Array<{
    text: string;
    content: string;
  }>;
  additional?: string;
  additionalPlain?: string;
}

export interface LeverJobRaw {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyLink: string;
  job_type: string | null;
  department: string | null;
  postedDate?: string;
}

const LEVER_COMPANIES = [
  // === VERIFIED — Have PMHNP jobs ===
  'lifestance',          // LifeStance Health — 100+ PMHNP jobs (BIGGEST SOURCE)
  'talkiatry',           // Talkiatry — 59 PMHNP jobs
  'includedhealth',      // Included Health — 6 PMHNP jobs
  'lyrahealth',          // Lyra Health — 1 PMHNP job

  // === VERIFIED — Valid, monitoring for PMHNP ===
  'carbonhealth',        // Carbon Health — 0 currently but valid endpoint

  // === ADDED 2026-02-13 — VALID, monitoring for PMHNP ===
  'prosper',             // Prosper — 11 total jobs

  // === ADDED 2026-02-13 — EXPANDED SCAN ===
  'bighealth',           // Big Health — 7 total jobs
  'genesis',             // Genesis — 4 total jobs
  'sesame',              // Sesame — 1 total jobs

  // === PROD DB MINING — 9,295 slugs from 3,602 employers ===
  'mindful',             // Mindful Haven — 5 PMHNP (0 recent)
  'athenapsych',         // AthenaPsych — 4 PMHNP (0 recent)
  'seven-starling',      // Seven Starling — 3 PMHNP (3 recent)
  'beckley-clinical',    // Beckley Clinical — 1 PMHNP
  'synapticure',         // SynaptiCure — 1 PMHNP
  'arundellodge',        // Arundel Lodge — 1 PMHNP

  // === ADDED 2026-02-16 — Full ATS Discovery (189 companies scanned) ===
  'ro',                  // Ro Health — 40 total jobs
  'advocate',            // Advocate Health — 9 total jobs
  'ucsf',                // UCSF Health — 1 total job

  // === ADDED 2026-02-16 — CSV test: 6 new PMHNP-active slugs ===
  'lunaphysicaltherapy', // Luna Physical Therapy — 108 PMHNP
  'guidestareldercare',  // Guidestar Eldercare — 31 PMHNP
  'next-health',         // Next Health — 4 PMHNP
  'ekohealth',           // Eko Health — 1 PMHNP
  'heartbeathealth',     // Heartbeat Health — 1 PMHNP
  'swordhealth',         // Sword Health — 1 PMHNP

  // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===



















  // === BULK ADD — All remaining CSV companies (115) ===
  'airlinejobs.eu',
  'aledade',
  'annette.care',
  'apex.careers',
  'arbitalhealth',
  'arsenalbio',
  'arvor-insurance',
  'augustbioservices',
  'autonomywork.com',
  'avalerehealth',
  'aviahealth',
  'bulletinhealthcare.com',
  'cardiosense',
  'cardiosense.com',
  'celaralabs',
  'cellares',
  'clarifyhealth',
  'clinicalhealthnetworkfortransformation',
  'crescent-biopharma',
  'crossfit',
  'cscgeneration-2',
  'delfidiagnostics',
  'diversifiedradiology',
  'enter.health',
  'ethenalabs',
  'fatetherapeutics',
  'fehrandpeers',
  'fieldnation',
  'fishawack.com',
  'gatchealth',
  'genbio',
  'genedit',
  'genefab',
  'getlabs',
  'getmylifeforce.com',
  'gordian-bio',
  'grailbio',
  'h1',
  'healthcare',
  'heard-therapy.info',
  'heyjane.co',
  'inductivehealth',
  'jobradar.site',
  'journeyclinical',
  'kimiatherapeutics',
  'koalahealth',
  'kyverna',
  'labelbox',
  'landmarkbio.com',
  'leolabs-2',
  'limberhealth',
  'lookflossy.com',
  'lyciatx.com',
  'lyracollective',
  'machinalabs',
  'mammothbiosci',
  'medcarehouston.com',
  'mediafly',
  'mediagenix',
  'micmos.com',
  'moonsong-labs',
  'multiplylabs',
  'myplacehealth',
  'nekohealth',
  'nimblerx',
  'npowermedicine',
  'offchainlabs',
  'okendo',
  'ollie.com',
  'onehot.io',
  'optionb.org',
  'orcabiosystems',
  'outpacebio',
  'outpacebio.com',
  'paramedicservices',
  'parcelvision',
  'pattern-biosciences',
  'peakped.com',
  'piplabs',
  'pointclickcare',
  'pplacareers.org',
  'procept-biorobotics',
  'progression.fyi',
  'project-healthy-minds',
  'projecthealthyminds.com',
  'qbio',
  'quantum.jobs',
  'quantumcareers.com',
  'relayrobotics.com',
  'remedyproductstudio',
  'roshalhealth.com',
  'salvohealth',
  'sequel-med-tech',
  'seranbio',
  'simulmedia',
  'sprinterhealth',
  'tahoebio-ai',
  'talentneuron',
  'talentwerx',
  'tendo',
  'theattractiongame.online',
  'torchdental',
  'trivenibio',
  'tryfi.com',
  'umzim.com',
  'vedatechlabs',
  'veeva',
  'vivo-care',
  'waddellgrp.com',
  'waivercore.com',
  'warblerlabs',
  'wepclinical',
  'wilburlabs',
  'workinbiotech.com',
  'zushealth',
];

import { isRelevantJob } from '../utils/job-filter';

const COMPANY_NAMES: Record<string, string> = {
  'talkiatry': 'Talkiatry',
  'includedhealth': 'Included Health',
  'lyrahealth': 'Lyra Health',
  'carbonhealth': 'Carbon Health',
  'prosper': 'Prosper',
  'bighealth': 'Big Health',
  'genesis': 'Genesis',
  'sesame': 'Sesame',

  // Added 2026-02-13 (prod DB mining)
  'mindful': 'Mindful Haven',
  'athenapsych': 'AthenaPsych',
  'seven-starling': 'Seven Starling',
  'beckley-clinical': 'Beckley Clinical',
  'synapticure': 'SynaptiCure',
  'arundellodge': 'Arundel Lodge',

  // Added 2026-02-16 (ATS discovery)
  'ro': 'Ro Health',
  'advocate': 'Advocate Health',
  'ucsf': 'UCSF Health',

  // Added 2026-02-16 (CSV test)
  'lunaphysicaltherapy': 'Luna Physical Therapy',
  'guidestareldercare': 'GuideStar Eldercare',
  'next-health': 'Next Health',
  'ekohealth': 'Eko Health',
  'heartbeathealth': 'Heartbeat Health',
  'swordhealth': 'Sword Health',

  // Bulk-added CSV companies
  'cardiosense.com': 'Cardiosense',
  'enter.health': 'ENTER',
  'fishawack.com': 'Avalere Health',
  'h1': 'H1',
  'landmarkbio.com': 'Landmark Bio',
  'medcarehouston.com': 'MedCare Pediatric Group',
  'ollie.com': 'Ollie',
  'outpacebio.com': 'Outpace Bio',
  'peakped.com': 'Peak Pediatric Therapies',
  'simulmedia': 'Simulmedia',
  'theattractiongame.online': 'Furum Jobs',
};

function formatCompanyName(slug: string): string {
  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(title: string, description: string): boolean {
  return isRelevantJob(title, description);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCompanyPostings(companySlug: string): Promise<LeverJobRaw[]> {
  const url = `https://api.lever.co/v0/postings/${companySlug}`;
  const companyName = formatCompanyName(companySlug);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[Lever] ${companySlug}: API error ${response.status}`);
      return [];
    }

    const postings: LeverPosting[] = await response.json();
    const totalJobs = postings.length;

    console.log(`[Lever] ${companySlug}: ${totalJobs} jobs fetched`);

    const allJobs = postings.map((posting: LeverPosting) => {
      // Combine description parts
      const descriptionParts = [
        posting.descriptionPlain || posting.description,
        ...(posting.lists?.map((list: { text: string; content: string }) => `${list.text}\n${list.content}`) || []),
        posting.additionalPlain || posting.additional,
      ].filter(Boolean);

      return {
        externalId: `lever-${companySlug}-${posting.id}`,
        title: posting.text,
        company: companyName,
        location: posting.categories?.location || 'Remote',
        description: descriptionParts.join('\n\n'),
        applyLink: posting.hostedUrl || posting.applyUrl,
        job_type: posting.categories?.commitment || null,
        department: posting.categories?.department || null,
        postedDate: new Date(posting.createdAt).toISOString(),
      };
    });

    // Pre-filter for PMHNP relevance
    const relevantJobs = allJobs.filter(job => isPMHNPJob(job.title, job.description));
    console.log(`[Lever] ${companySlug}: ${relevantJobs.length}/${totalJobs} jobs relevant`);

    return relevantJobs;
  } catch (error) {
    console.error(`[Lever] ${companySlug}: Error -`, error);
    return [];
  }
}

export async function fetchLeverJobs(): Promise<LeverJobRaw[]> {
  console.log(`[Lever] Checking ${LEVER_COMPANIES.length} companies for PMHNP jobs...`);

  const allJobs: LeverJobRaw[] = [];
  const failedCompanies: string[] = [];
  const BATCH_SIZE = 10;

  try {
    for (let i = 0; i < LEVER_COMPANIES.length; i += BATCH_SIZE) {
      const batch = LEVER_COMPANIES.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(companySlug => fetchCompanyPostings(companySlug))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          allJobs.push(...result.value);
        } else {
          failedCompanies.push(batch[j]);
          console.error(`[Lever] Failed to fetch from ${batch[j]}`);
        }
      }

      if (i + BATCH_SIZE < LEVER_COMPANIES.length) {
        await sleep(200);
      }
    }

    console.log(`[Lever] Total PMHNP jobs fetched: ${allJobs.length}`);

    if (failedCompanies.length > 0) {
      console.log(`[Lever] Failed companies (${failedCompanies.length}): ${failedCompanies.join(', ')}`);
    }

    return allJobs;
  } catch (error) {
    console.error('[Lever] Error in main fetch:', error);
    return allJobs;
  }
}
