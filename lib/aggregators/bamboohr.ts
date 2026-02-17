/**
 * BambooHR Direct Scraper
 * 
 * Scrapes BambooHR career pages via their JSON API.
 * Each employer has a GET endpoint at:
 *   https://{slug}.bamboohr.com/careers/list
 * 
 * No API key required. Free and unlimited.
 */

import { isRelevantJob } from '../utils/job-filter';

interface BambooHRJob {
    id: string;
    jobOpeningName: string;
    departmentLabel?: string;
    locationLabelAlt?: string;
    employmentStatusLabel?: string;
}

interface BambooHRJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate?: string;
    jobType?: string;
}

// === Verified BambooHR career sites with PMHNP matches ===
// Discovered via scripts/test-all-ats-slugs.ts on 2026-02-16
const BAMBOOHR_COMPANIES = [
    { slug: 'benchmarktherapy', name: 'Benchmark Therapy' },          // 18 PMHNP
    { slug: 'employhealth', name: 'EmployHealth' },                    // 13 PMHNP
    { slug: 'arkoshealth', name: 'Arkos Health' },                     // 10 PMHNP
    { slug: 'cyticlinics', name: 'CyTi Clinics' },                    // 10 PMHNP
    { slug: 'baldwinfamilyhealthcare', name: 'Baldwin Family Health' },// 5 PMHNP
    { slug: 'credentcare', name: 'Credent Care' },                    // 5 PMHNP
    { slug: 'heritagehealthservices', name: 'Heritage Health' },       // 5 PMHNP
    { slug: 'relianthealthcaregroup', name: 'Reliant Healthcare' },    // 5 PMHNP
    { slug: 'bluetreehealth', name: 'Blue Tree Health' },              // 4 PMHNP
    { slug: 'everhomehealthcare', name: 'EverHome Healthcare' },       // 4 PMHNP
    { slug: 'childinspiredtherapy', name: 'Child Inspired Therapy' },  // 3 PMHNP
    { slug: 'caregivergrove', name: 'Caregiver Grove' },               // 2 PMHNP
    { slug: 'eskasonihealthcentre', name: 'Eskasoni Health Centre' },  // 2 PMHNP
    { slug: 'loraincountyhealth', name: 'Lorain County Health' },      // 2 PMHNP
    { slug: 'minneolahealth', name: 'Minneola Healthcare' },           // 2 PMHNP
    { slug: '21stcenturyrehab', name: '21st Century Rehab' },          // 1 PMHNP
    { slug: 'clinicaromero', name: 'Clinica Romero' },                 // 1 PMHNP
    { slug: 'helloavahealth', name: 'Ava Health' },                    // 1 PMHNP
    { slug: 'jsashealthcare', name: 'JSAS Healthcare' },               // 1 PMHNP
    { slug: 'monroehealthcenter', name: 'Monroe Health Center' },      // 1 PMHNP
    { slug: 'noorahealth', name: 'Noora Health' },                     // 1 PMHNP
    { slug: 'tribecapediatrics', name: 'Tribeca Pediatrics' },         // 1 PMHNP

    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===
    { slug: 'aclasscare', name: 'Aclasscare' },
    { slug: 'b2xcare', name: 'B2xcare' },
    { slug: 'brandonclinic', name: 'Brandonclinic' },
    { slug: 'cabrillohospice', name: 'Cabrillohospice' },
    { slug: 'cubecare', name: 'Cubecare' },
    { slug: 'environmentalleague', name: 'Environmentalleague' },
    { slug: 'eonhealth', name: 'Eonhealth' },
    { slug: 'extremitycare', name: 'Extremitycare' },
    { slug: 'healthcaringkw', name: 'Healthcaringkw' },
    { slug: 'healthemployersassociationofbc', name: 'Healthemployersassociationofbc' },
    { slug: 'healthvisionteam', name: 'Healthvisionteam' },
    { slug: 'inclusivechildcare', name: 'Inclusivechildcare' },
    { slug: 'orumtherapeutics', name: 'Orumtherapeutics' },
    { slug: 'playershealth', name: 'Playershealth' },
    { slug: 'privatemedical', name: 'Privatemedical' },
    { slug: 'propharmausa', name: 'Propharmausa' },
    { slug: 'saferidehealth', name: 'Saferidehealth' },
    { slug: 'salinahealth', name: 'Salinahealth' },
    { slug: 'smsenvironmental', name: 'Smsenvironmental' },
    { slug: 'spirithealth', name: 'Spirithealth' },
    { slug: 'superiorenvironmental', name: 'Superiorenvironmental' },
    { slug: 'takefivedogcare', name: 'Takefivedogcare' },
    { slug: 'therapeuticsinc', name: 'Therapeuticsinc' },
    { slug: 'timelessmedical', name: 'Timelessmedical' },
    { slug: 'truecareny', name: 'Truecareny' },
    { slug: 'tympahealth', name: 'Tympahealth' },
    { slug: 'vocareum', name: 'Vocareum' },
    { slug: 'vuehealth', name: 'Vuehealth' },

    // === BULK ADD — All remaining CSV companies (143) ===
    { slug: 'doximity', name: 'Doximity' },
    { slug: 'peartherapeutics', name: 'Pear Therapeutics' },
    { slug: '4medica', name: '4medica' },
    { slug: 'acornbiolabs', name: 'Acornbiolabs' },
    { slug: 'actionaidinternational', name: 'Actionaidinternational' },
    { slug: 'adventistmediaministries', name: 'Adventistmediaministries' },
    { slug: 'aerovisionglobal', name: 'Aerovisionglobal' },
    { slug: 'aircarehealth', name: 'Aircarehealth' },
    { slug: 'akerbiomarine', name: 'Akerbiomarine' },
    { slug: 'alabamaagcredit', name: 'Alabamaagcredit' },
    { slug: 'alabamapublictv', name: 'Alabamapublictv' },
    { slug: 'alaskatestlab', name: 'Alaskatestlab' },
    { slug: 'alphabrandmedia', name: 'Alphabrandmedia' },
    { slug: 'answerlab', name: 'Answerlab' },
    { slug: 'anvilsecure', name: 'Anvilsecure' },
    { slug: 'arkeabio', name: 'Arkeabio' },
    { slug: 'atomicroastery', name: 'Atomicroastery' },
    { slug: 'avicedarx', name: 'Avicedarx' },
    { slug: 'belaydiagnostics', name: 'Belaydiagnostics' },
    { slug: 'bimeda', name: 'Bimeda' },
    { slug: 'biolabs', name: 'Biolabs' },
    { slug: 'biolifesolutions', name: 'Biolifesolutions' },
    { slug: 'biolite', name: 'Biolite' },
    { slug: 'biologicaldiversity', name: 'Biologicaldiversity' },
    { slug: 'bioratherapeutics', name: 'Bioratherapeutics' },
    { slug: 'biovid', name: 'Biovid' },
    { slug: 'bluelabs', name: 'Bluelabs' },
    { slug: 'calmax', name: 'Calmax' },
    { slug: 'calmedeval', name: 'Calmedeval' },
    { slug: 'carboncure', name: 'Carboncure' },
    { slug: 'carlsmed', name: 'Carlsmed' },
    { slug: 'cayabacare', name: 'Cayabacare' },
    { slug: 'celltracktech', name: 'Celltracktech' },
    { slug: 'chainwaylabs', name: 'Chainwaylabs' },
    { slug: 'chargelab', name: 'Chargelab' },
    { slug: 'ckinternational', name: 'Ckinternational' },
    { slug: 'cmlabs', name: 'Cmlabs' },
    { slug: 'communityneurorehab', name: 'Communityneurorehab' },
    { slug: 'compasspathways', name: 'Compasspathways' },
    { slug: 'constructivebio', name: 'Constructivebio' },
    { slug: 'counciloneducationforpublichealth', name: 'Counciloneducationforpublichealth' },
    { slug: 'crofton', name: 'Crofton' },
    { slug: 'cronoslabs', name: 'Cronoslabs' },
    { slug: 'crosslcms', name: 'Crosslcms' },
    { slug: 'crosslinechurch', name: 'Crosslinechurch' },
    { slug: 'cureepilepsy', name: 'Cureepilepsy' },
    { slug: 'cusointernational', name: 'Cusointernational' },
    { slug: 'dnastack', name: 'Dnastack' },
    { slug: 'dwflabs', name: 'Dwflabs' },
    { slug: 'earlymedical', name: 'Earlymedical' },
    { slug: 'earthrightsinternational', name: 'Earthrightsinternational' },
    { slug: 'eastdilsecured', name: 'Eastdilsecured' },
    { slug: 'ehealthafrica', name: 'Ehealthafrica' },
    { slug: 'elementalenergies', name: 'Elementalenergies' },
    { slug: 'elementalled', name: 'Elementalled' },
    { slug: 'eliagridinternational', name: 'Eliagridinternational' },
    { slug: 'ellabakerchr', name: 'Ellabakerchr' },
    { slug: 'emberlab', name: 'Emberlab' },
    { slug: 'emeraldcloudlab', name: 'Emeraldcloudlab' },
    { slug: 'equimedia', name: 'Equimedia' },
    { slug: 'etherapeutics', name: 'Etherapeutics' },
    { slug: 'eugenecascadescoast', name: 'Eugenecascadescoast' },
    { slug: 'exocelbio', name: 'Exocelbio' },
    { slug: 'flagshipbio', name: 'Flagshipbio' },
    { slug: 'flexspring', name: 'Flexspring' },
    { slug: 'gifthealthoh', name: 'Gifthealthoh' },
    { slug: 'gomedstar', name: 'Gomedstar' },
    { slug: 'greenstonedental', name: 'Greenstonedental' },
    { slug: 'htminsurance', name: 'Htminsurance' },
    { slug: 'hummingbirdbio', name: 'Hummingbirdbio' },
    { slug: 'hypernative', name: 'Hypernative' },
    { slug: 'icron', name: 'Icron' },
    { slug: 'impactortho', name: 'Impactortho' },
    { slug: 'indicalab', name: 'Indicalab' },
    { slug: 'infravision', name: 'Infravision' },
    { slug: 'innovahealth', name: 'Innovahealth' },
    { slug: 'internationaltransfund', name: 'Internationaltransfund' },
    { slug: 'ironsideinsurancegroup', name: 'Ironsideinsurancegroup' },
    { slug: 'itcsecure', name: 'Itcsecure' },
    { slug: 'ivincihealth', name: 'Ivincihealth' },
    { slug: 'joyspring', name: 'Joyspring' },
    { slug: 'keymediahr', name: 'Keymediahr' },
    { slug: 'laboremus', name: 'Laboremus' },
    { slug: 'laborie', name: 'Laborie' },
    { slug: 'lullabot', name: 'Lullabot' },
    { slug: 'macrobond', name: 'Macrobond' },
    { slug: 'meda', name: 'Meda' },
    { slug: 'medallionbank', name: 'Medallionbank' },
    { slug: 'medasf', name: 'Medasf' },
    { slug: 'mediadesign', name: 'Mediadesign' },
    { slug: 'medialab', name: 'Medialab' },
    { slug: 'medialtd', name: 'Medialtd' },
    { slug: 'mediasense', name: 'Mediasense' },
    { slug: 'medicines360', name: 'Medicines360' },
    { slug: 'micrometrics', name: 'Micrometrics' },
    { slug: 'modernautobody', name: 'Modernautobody' },
    { slug: 'monodbio', name: 'Monodbio' },
    { slug: 'mosesbhcare', name: 'Mosesbhcare' },
    { slug: 'mpharma', name: 'Mpharma' },
    { slug: 'muensterhospital', name: 'Muensterhospital' },
    { slug: 'myeloidtherapeutics', name: 'Myeloidtherapeutics' },
    { slug: 'neoimmunetech', name: 'Neoimmunetech' },
    { slug: 'neopharmlabs', name: 'Neopharmlabs' },
    { slug: 'nvision', name: 'Nvision' },
    { slug: 'odkmedia', name: 'Odkmedia' },
    { slug: 'opticmarketinggroup', name: 'Opticmarketinggroup' },
    { slug: 'pangeabio', name: 'Pangeabio' },
    { slug: 'path', name: 'Path' },
    { slug: 'pathcrisis', name: 'Pathcrisis' },
    { slug: 'perimetermed', name: 'Perimetermed' },
    { slug: 'primehomedds', name: 'Primehomedds' },
    { slug: 'privatelabelstaff', name: 'Privatelabelstaff' },
    { slug: 'prlab', name: 'Prlab' },
    { slug: 'redpointmedia', name: 'Redpointmedia' },
    { slug: 'refugeesinternational', name: 'Refugeesinternational' },
    { slug: 'rhinolabs', name: 'Rhinolabs' },
    { slug: 'sachsmedia', name: 'Sachsmedia' },
    { slug: 'scarsellabros', name: 'Scarsellabros' },
    { slug: 'securelending', name: 'Securelending' },
    { slug: 'somnomed', name: 'Somnomed' },
    { slug: 'spaceinternational', name: 'Spaceinternational' },
    { slug: 'sparkmicrogrants', name: 'Sparkmicrogrants' },
    { slug: 'spearbio', name: 'Spearbio' },
    { slug: 'springfinancial', name: 'Springfinancial' },
    { slug: 'summercollab', name: 'Summercollab' },
    { slug: 'surgicalscience', name: 'Surgicalscience' },
    { slug: 'teamworxsecurity', name: 'Teamworxsecurity' },
    { slug: 'teravisiongames', name: 'Teravisiongames' },
    { slug: 'theapplabb', name: 'Theapplabb' },
    { slug: 'thelabnyc', name: 'Thelabnyc' },
    { slug: 'transitionbio', name: 'Transitionbio' },
    { slug: 'tropicbioscience', name: 'Tropicbioscience' },
    { slug: 'umbralab', name: 'Umbralab' },
    { slug: 'verodcapitalmanagement', name: 'Verodcapitalmanagement' },
    { slug: 'volparahealth', name: 'Volparahealth' },
    { slug: 'vsmedia', name: 'Vsmedia' },
    { slug: 'waycrosse', name: 'Waycrosse' },
    { slug: 'welab', name: 'Welab' },
    { slug: 'wildernessmedicalstaffing', name: 'Wildernessmedicalstaffing' },
    { slug: 'worldhopeinternational', name: 'Worldhopeinternational' },
    { slug: 'worldvision', name: 'Worldvision' },
    { slug: 'woundcareadvantage', name: 'Woundcareadvantage' },
    { slug: 'ylabs', name: 'Ylabs' },
];

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch job listings from a single BambooHR company
 */
async function fetchCompanyJobs(company: { slug: string; name: string }): Promise<BambooHRJobRaw[]> {
    const url = `https://${company.slug}.bamboohr.com/careers/list`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[BambooHR] ${company.name}: HTTP ${res.status}`);
            return [];
        }

        const data = await res.json() as { result?: BambooHRJob[] };
        const jobs = data.result || [];

        const relevant: BambooHRJobRaw[] = [];

        for (const job of jobs) {
            const title = job.jobOpeningName || '';
            const location = job.locationLabelAlt || '';
            const department = job.departmentLabel || '';

            // Use the same relevance filter as other aggregators
            if (!isRelevantJob(title, `${department} ${location}`)) continue;

            relevant.push({
                externalId: `bamboohr-${company.slug}-${job.id}`,
                title,
                company: company.name,
                location,
                description: `${department} - ${title}`,
                applyLink: `https://${company.slug}.bamboohr.com/careers/${job.id}`,
                jobType: job.employmentStatusLabel || undefined,
            });
        }

        if (relevant.length > 0) {
            console.log(`[BambooHR] ${company.name}: ${relevant.length} PMHNP jobs found (${jobs.length} total)`);
        }

        return relevant;
    } catch (error) {
        console.warn(`[BambooHR] ${company.name}: Error fetching jobs:`, error);
        return [];
    }
}

/**
 * Fetch PMHNP jobs from all BambooHR companies
 * Uses parallel batches to stay within Vercel timeout limits
 */
export async function fetchBambooHRJobs(): Promise<BambooHRJobRaw[]> {
    console.log(`[BambooHR] Scanning ${BAMBOOHR_COMPANIES.length} company career sites...`);

    const allJobs: BambooHRJobRaw[] = [];
    const BATCH_SIZE = 10; // Process 10 companies in parallel

    for (let i = 0; i < BAMBOOHR_COMPANIES.length; i += BATCH_SIZE) {
        const batch = BAMBOOHR_COMPANIES.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map(company => fetchCompanyJobs(company))
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                allJobs.push(...result.value);
            }
        }

        // Small delay between batches to be polite
        if (i + BATCH_SIZE < BAMBOOHR_COMPANIES.length) {
            await sleep(300);
        }
    }

    console.log(`[BambooHR] Total: ${allJobs.length} PMHNP jobs found across all companies`);
    return allJobs;
}
