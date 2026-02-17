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
  // VERIFIED WORKING - Primary sources
  'sondermind',          // 48 PMHNP jobs - PRIMARY SOURCE
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
  'signifyhealth',       // Signify Health
  'valerahealth',        // Valera Health
  'charliehealth',       // Charlie Health
  'blackbirdhealth',     // Blackbird Health
  'ophelia',             // Ophelia

  // === NEW - VERIFIED VALID, monitoring for PMHNP ===
  'springhealth66',      // Spring Health — 91 total jobs
  'omadahealth',         // Omada Health — 32 total jobs
  'brave',               // Brave Health — 9 total jobs

  // === ADDED 2026-02-13 — VERIFIED WITH PMHNP JOBS ===
  'betterhelp',          // BetterHelp — 19 PMHNP jobs (18 recent)
  'firsthand',           // Firsthand — 13 PMHNP jobs (2 recent)
  'compasspathways',     // COMPASS Pathways — 11 PMHNP jobs (11 recent)

  // === ADDED 2026-02-13 — VALID, monitoring for PMHNP ===
  'alma',                // Alma — 10 total jobs
  'cortica',             // Cortica — 65 total jobs
  'galileo',             // Galileo — 7 total jobs
  'amaehealth',          // Amae Health — 27 total jobs
  'pelago',              // Pelago — 8 total jobs

  // === ADDED 2026-02-13 — EXPANDED SCAN (278 slugs tested) ===
  'bouldercare',         // Boulder Care — 18 PMHNP jobs (18 recent) ⭐

  // === EXPANDED SCAN — VALID, monitoring for PMHNP ===
  'daybreakhealth',      // Daybreak Health — 37 total jobs
  'parallellearning',    // Parallel Learning — 22 total jobs
  'legion',              // Legion — 20 total jobs
  'array',               // Array Behavioral Care — 20 total jobs
  'neuroflow',           // NeuroFlow — 14 total jobs
  'forgehealth',         // Forge Health — 9 total jobs
  'iris',                // Iris — 4 total jobs

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
  'vitalcaringgroup',    // VitalCaring Group — 1 PMHNP (1 recent)
  'peregrinehealth',     // Peregrine Health — 1 PMHNP (1 recent)
  'tia',                 // Tia — 1 PMHNP
  'lts',                 // LTS — 1 PMHNP (1 recent)

  // === ADDED 2026-02-16 — Full ATS Discovery (189 companies scanned) ===
  'prosperhealth',       // Prosper Health — 47 total jobs
  'pma',                 // Pathlight Mood & Anxiety — 18 total jobs
  'carbon',              // Carbon Health — 7 total jobs
  'veterans',            // Veterans Affairs — 6 total jobs
  'summit',              // Summit Healthcare — 5 total jobs
  'universal',           // Universal Health Services — 2 total jobs
  'calm',                // Calm — 1 total job

  // === ADDED 2026-02-16 — CSV test: 62 new PMHNP-active slugs ===
  'theoriamedical',      // Theoria Medical — 90 PMHNP
  'talkspacepsychiatry', // Talkspace Psychiatry — 50 PMHNP
  'midihealth',          // Midi Health — 46 PMHNP
  'luminishealth',       // Luminis Health — 41 PMHNP
  'ennoblecare',         // Ennoble Care — 38 PMHNP
  'integrityrehabgroup', // Integrity Rehab Group — 56 PMHNP
  'formhealth',          // Form Health — 24 PMHNP
  'guidelighthealth',    // Guidelight Health — 24 PMHNP
  'signifyhealth',       // Signify Health — 24 PMHNP
  'optimalcare',         // Optimal Care — 18 PMHNP
  'cartwheelcare',       // Cartwheel Care — 15 PMHNP
  'healthlink',          // HealthLink — 15 PMHNP
  'moodhealth',          // Mood Health — 15 PMHNP (dupe check OK)
  'engageseniortherapy', // Engage Senior Therapy — 14 PMHNP
  'pairteam',            // Pair Team — 14 PMHNP
  'sollishealth',        // Sollis Health — 14 PMHNP
  'dianahealth94',       // Diana Health — 12 PMHNP
  'vailclinicincdbavailhealthhospital', // Vail Health Hospital — 12 PMHNP
  'axisteletherapy',     // Axis Teletherapy — 9 PMHNP
  'folxhealth',          // FOLX Health — 9 PMHNP
  'neurahealth',         // Neura Health — 8 PMHNP
  'centrumhealth',       // Centrum Health — 7 PMHNP
  'reemahealth',         // Reema Health — 7 PMHNP
  'welbehealth',         // Welbe Health — 7 PMHNP
  'wovencare',           // Woven Care — 7 PMHNP
  'allarahealth',        // Allara Health — 6 PMHNP
  'amaehealth',          // Amae Health — 6 PMHNP (already in COMPANY_NAMES)
  'eucalyptus',          // Eucalyptus — 6 PMHNP
  'mavenclinicproviders',// Maven Clinic Providers — 6 PMHNP
  'triumvirateenvironmental', // Triumvirate Environmental — 6 PMHNP
  'aspirehealthalliance',// Aspire Health Alliance — 5 PMHNP
  'lumimeds',            // Lumimeds — 5 PMHNP
  'seenhealth',          // Seen Health — 5 PMHNP
  'sensiblecare',        // Sensible Care — 4 PMHNP
  'cardioone',           // Cardio One — 4 PMHNP
  'assemblyhealth',      // Assembly Health — 3 PMHNP
  'bridgebio',           // BridgeBio — 3 PMHNP
  'cadencehealth',       // Cadence Health — 3 PMHNP
  'imaginepediatrics',   // Imagine Pediatrics — 3 PMHNP
  'oncoverycare',        // Oncovery Care — 3 PMHNP
  'theoncologyinstitute',// The Oncology Institute — 3 PMHNP
  'thymecare',           // Thyme Care — 3 PMHNP
  'allcareers',          // AllCareers — 73 PMHNP
  'foresightmentalhealth', // Foresight Mental Health — 2 PMHNP
  'herselfhealth',       // Herself Health — 2 PMHNP
  'maplighttherapeutics',// MapLight Therapeutics — 2 PMHNP
  'meruhealth',          // Meru Health — 2 PMHNP
  'sandstonecarebroomfield', // Sandstone Care Broomfield — 1 PMHNP
  'sandstonecoloradomedicaldetox', // Sandstone CO Medical Detox — 2 PMHNP
  'vardaspace',          // Varda Space — 2 PMHNP
  'axsometherapeutics',  // Axsome Therapeutics — 1 PMHNP
  'cadrehospice',        // Cadre Hospice — 1 PMHNP
  'dynetherapeutics',    // Dyne Therapeutics — 1 PMHNP
  'found',               // Found Health — 1 PMHNP
  'habitathealth',       // Habitat Health — 1 PMHNP
  'kernalbio',           // Kernal Bio — 1 PMHNP
  'khealthcareers',      // K Health — 1 PMHNP
  'luminaryhospice',     // Luminary Hospice — 1 PMHNP
  'pomelocare',          // Pomelo Care — 1 PMHNP
  'sportandspinephysicaltherapy', // Sport \u0026 Spine PT — 1 PMHNP
  'twinhealth',          // Twin Health — 1 PMHNP
  'understoodcare',      // Understood Care — 1 PMHNP
  'vitablehealth',       // Vitable Health — 1 PMHNP
  'vitahealth',          // Vita Health — 1 PMHNP

  // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===
  '1uphealth',
  '30thstreetanimalhospital',
  '4dmoleculartherapeutics',
  'abcellera',
  'absci',
  'achievementfirstnetworksupportcareers',
  'acornhealth',
  'adahealth',
  'adaugeohealthcare',
  'adelphigraduatecareers',
  'adicettherapeuticsinc',
  'aizerhealth',
  'alayacare',
  'alpha9oncology',
  'animalcarecenterpearisburg',
  'animalcarecenterprinceton',
  'animalmedicalcenter',
  'apogeetherapeutics',
  'applytopassagehealth',
  'appsumocareers',
  'arcadiacareers',
  'arizonaliverhealth',
  'arspharmaceuticalsoperationsinc',
  'automatticcareers',
  'azuritypharmaceuticals',
  'azuritypharmaceuticalsindia',
  'beamtherapeutics',
  'biocaremedical',
  'blinkhealth',
  'blueprintmedicines',
  'bubbleskincare',
  'calahealth',
  'caliberhealth',
  'calibratecareers',
  'canopycare',
  'careem',
  'careersatpeakenergy',
  'careerteam',
  'carefeed',
  'careportalinc',
  'carerev',
  'carewell',
  'carrumhealth',
  'cayabacare',
  'centessapharmaceuticalsinc',
  'cerulacare',
  'clearviewhealthcarepartners',
  'clicktherapeutics',
  'coherehealth',
  'collectivehealth',
  'corcepttherapeutics',
  'corporatecareers',
  'courierhealth',
  'coverahealth',
  'crescendohealth',
  'daymarkhealth',
  'dayonebiopharmaceuticals',
  'dental365',
  'dianthustherapeutics',
  'divergehealth',
  'drdansanimalhospital',
  'eclinicalsolutions',
  'eikontherapeutics',
  'elationhealth',
  'eleoshealth',
  'elitedentalpartnersllc',
  'elliginthealth',
  'employerdirecthealthcare',
  'enavatecareers',
  'entradatherapeutics',
  'flatironhealth',
  'flohealth',
  'florencehealthcare',
  'foliahealth',
  'forcetherapeutics',
  'formationbio',
  'fractylhealthinc',
  'fronterahealth',
  'futurhealth',
  'garnerhealth',
  'generatebiomedicines',
  'ginkgobioworks',
  'globalhealthcareexchangeinc',
  'gramgamescareers',
  'greenbrookmedical',
  'gsgcareers',
  'harrowhealth',
  'hatchcareers',
  'headoutcareers',
  'healthjoy',
  'healthverity',
  'homewardhealth',
  'honehealth',
  'honestmedicalgroup',
  'hopscotchprimarycare',
  'hotmartcareersbr',
  'hotmartcareersen',
  'iconcareers',
  'inspiremedicalsystemsinc',
  'instridehealth',
  'interwellhealth',
  'iovancebiotherapeutics',
  'isccareers',
  'iterativehealth',
  'j2health',
  'jackhealth',
  'jukeboxhealth',
  'kalvistapharmaceuticals',
  'komodohealth',
  'kuraoncology',
  'la28careers',
  'lakeforestanimalhospital',
  'lambcareers',
  'legendcareers',
  'legendcareerseu',
  'lenusehealth',
  'linushealth',
  'logiwacareers',
  'lumahealth',
  'lyellimmunopharma',
  'mainstreethealth',
  'maslanskycareers',
  'mavenclinic',
  'mavenscareers',
  'maxmanufacturingcareers',
  'mcghealth',
  'medicalinformaticsengineering',
  'mineralystherapeutics',
  'mirumpharmaceuticals',
  'mochihealth',
  'monocl',
  'montaihealth',
  'monumentalsports',
  'msfcareers',
  'neuehealth',
  'neumora',
  'newlabcareers',
  'nexhealth',
  'nflcareers',
  'nilotherapeutics',
  'nmcareers',
  'noahmedical',
  'noctrixhealth',
  'nonantumveterinaryclinic',
  'noyocareers',
  'obsidiantherapeutics',
  'odlesalescareers',
  'ogilvyhealthcanada',
  'ogilvyhealthuk',
  'ogilvyhealthusa',
  'olaplexcareers',
  'omnicomhealth',
  'operationscareers',
  'optimadermatologycareers',
  'oshihealth',
  'ostrohealth',
  'oulahealth',
  'outsetmedical',
  'oxosmedical',
  'pagerhealth',
  'panteracapitalcareers',
  'parachutehealth',
  'paradigminccareersopenpositions',
  'parkcareers',
  'particlehealth',
  'picnichealth',
  'plianttherapeuticsinc',
  'pokemoncareers',
  'polycamcareers',
  'primemedicine',
  'privategdcareers',
  'privatehealthmanagement',
  'procaresolutions',
  'pumpcareers',
  'pursuecare',
  'qualifiedhealth',
  'quanthealth',
  'radiclehealth',
  'rakutenmedical18',
  'rdccareers',
  'recursionpharmaceuticals',
  'reflexionmedical',
  'relaytherapeutics',
  'remixtherapeutics',
  'remodelhealth',
  'rightwayhealthcare',
  'rvohealth',
  'sandstonecareboulder',
  'seaporttherapeutics',
  'shieldshealthsolutions',
  'shunnarahcareers',
  'sidecarhealth',
  'sironamedical',
  'skildai-careers',
  'skilledwoundcare',
  'sonymusicasiacareers',
  'sonymusiccareersfrance',
  'sonymusiccareersnetherlands',
  'spcareers',
  'springsworkstherapeutics',
  'spyretherapeutics',
  'stemhealthcare',
  'strandtherapeutics',
  'stratacareers',
  'stridehealth',
  'studycareers',
  'tangotherapeutics',
  'tesseratherapeutics',
  'thepharmacyhub',
  'thesiscareers',
  'thirtymadison',
  'thltestcareers',
  'tomorrowhealth',
  'transcarent',
  'transcendtherapeutics',
  'trinityairmedical',
  'trovohealth',
  'truveta',
  'twistbioscience',
  'ultragenyxpharmaceutical',
  'uniteus',
  'unlockhealth',
  'urgentcareforchildren',
  'valohealth',
  'veocorporatecareers',
  'veranahealth',
  'veratherapeuticsinc',
  'vizai',
  'volastratherapeutics',
  'vorbiopharma',
  'voyagertherapeutics',
  'waltzhealth',
  'waymark',
  'xairatherapeutics',
  'xphealth',
  'zenithhealth',
  'zocalohealth',
  'zocdoc',
  'zyngacareers',
];

import { isRelevantJob } from '../utils/job-filter';

const COMPANY_NAMES: Record<string, string> = {
  // Verified companies
  'talkiatry': 'Talkiatry',
  'talkspace': 'Talkspace',
  'sondermind': 'SonderMind',
  'brightside': 'Brightside Health',
  'brightsidehealth': 'Brightside Health',
  'springhealth': 'Spring Health',
  'lyrahealth': 'Lyra Health',
  'modernhealth': 'Modern Health',
  'cerebral': 'Cerebral',
  'headway': 'Headway',
  'teladoc': 'Teladoc Health',
  'amwell': 'Amwell',
  'mdlive': 'MDLIVE',
  'hims': 'Hims & Hers',
  'ayahealthcare': 'Aya Healthcare',
  'crosscountry': 'Cross Country Healthcare',
  'northwell': 'Northwell Health',
  'providence': 'Providence Health',
  'commonspirit': 'CommonSpirit Health',
  'mantrahealth': 'Mantra Health',

  // New additions
  'lifestancehealth': 'LifeStance Health',
  'lifestance': 'LifeStance Health',
  'twochairs': 'Two Chairs',
  'elliementalhealth': 'Ellie Mental Health',
  'thriveworks': 'Thriveworks',
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
  'signifyhealth': 'Signify Health',
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
};

function formatCompanyName(slug: string): string {

  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(title: string, content: string): boolean {
  return isRelevantJob(title, content);
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
      postedDate: job.updated_at,
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
 * Total number of chunks for Greenhouse (369 companies / ~92 per chunk = 4)
 */
export const GREENHOUSE_TOTAL_CHUNKS = 4;
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

  try {
    for (const companySlug of companies) {
      try {
        const jobs = await fetchCompanyJobs(companySlug);

        if (jobs.length === 0) {
          // Check if it was a real failure or just no PMHNP jobs
          // We'll track this for summary
        } else {
          allJobs.push(...jobs);
        }

        // Rate limiting: 500ms delay between companies
        await sleep(500);
      } catch {
        failedCompanies.push(companySlug);
        console.error(`[Greenhouse] Failed to fetch from ${companySlug}`);
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
