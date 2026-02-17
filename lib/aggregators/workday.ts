/**
 * Workday Direct Scraper
 * 
 * Scrapes Workday career sites directly via their hidden JSON API.
 * Each employer has a POST endpoint at:
 *   https://{slug}.wd{instance}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs
 * 
 * No API key required. Free and unlimited.
 */

import { isRelevantJob } from '../utils/job-filter';

interface WorkdayCompany {
    slug: string;
    instance: number;
    site: string;
    name: string;
}

interface WorkdayJobPosting {
    title: string;
    externalPath: string;
    locationsText: string;
    postedOn: string;
    bulletFields: string[];
    subtitles: Array<{ instances: string[] }>;
}

interface WorkdaySearchResponse {
    total: number;
    jobPostings: WorkdayJobPosting[];
}

export interface WorkdayJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate?: string;
}

// === Verified Workday career sites ===
// Discovered via scripts/discover-workday-sites.ts on 2026-02-13
const WORKDAY_COMPANIES: WorkdayCompany[] = [
    // === ORIGINAL (pre-2026-02-16) ===
    { slug: 'trinityhealth', instance: 1, site: 'jobs', name: 'Trinity Health' },
    { slug: 'memorialhermann', instance: 5, site: 'External', name: 'Memorial Hermann' },
    { slug: 'sharp', instance: 1, site: 'External', name: 'Sharp HealthCare' },
    { slug: 'lifestance', instance: 5, site: 'Careers', name: 'LifeStance Health' },
    { slug: 'chghealthcare', instance: 1, site: 'External', name: 'CHG Healthcare' },

    // === ADDED 2026-02-16 — ATS Discovery Script ===
    { slug: 'aah', instance: 5, site: 'External', name: 'Advocate Health' },
    { slug: 'ms', instance: 5, site: 'External', name: 'Mount Sinai' },
    { slug: 'carbonhealth', instance: 1, site: 'Careers', name: 'Carbon Health' },
    { slug: 'mc', instance: 1, site: 'External', name: 'Mayo Clinic' },

    // === ADDED 2026-02-16 — Verified CSV (Hospitals & Health Systems) ===
    { slug: 'adventhealth', instance: 12, site: 'AH_External_Career_Site', name: 'AdventHealth' },
    { slug: 'allina', instance: 5, site: 'External', name: 'Allina Health' },
    { slug: 'archildrens', instance: 1, site: 'External_Career_Site', name: "Arkansas Children's" },
    { slug: 'bannerhealth', instance: 108, site: 'Careers', name: 'Banner Health' },
    { slug: 'baptistfirst', instance: 12, site: 'baptistfirst', name: 'Baptist Health (AL)' },
    { slug: 'bhs', instance: 1, site: 'careers', name: 'Baptist Health (KY)' },
    { slug: 'easyservice', instance: 5, site: 'MercyHealthCareers', name: 'Bon Secours Mercy Health' },
    { slug: 'bronsonhg', instance: 1, site: 'newhires', name: 'Bronson Healthcare' },
    { slug: 'carilionclinic', instance: 12, site: 'External_Careers', name: 'Carilion Clinic' },
    { slug: 'chaptershealth', instance: 5, site: 'jobs', name: 'Chapters Health System' },
    { slug: 'choc', instance: 5, site: 'Careers', name: 'CHOC' },
    { slug: 'cincinnatichildrens', instance: 5, site: 'careersatcincinnatichildrens', name: "Cincinnati Children's" },
    { slug: 'ccf', instance: 1, site: 'ClevelandClinicCareers', name: 'Cleveland Clinic' },
    { slug: 'cookchildrens', instance: 1, site: 'Careers', name: "Cook Children's" },
    { slug: 'spectrumhealth', instance: 5, site: 'CorewellHealthCareers', name: 'Corewell Health' },
    { slug: 'coxhealth', instance: 5, site: 'CoxHealth_External', name: 'CoxHealth' },
    { slug: 'davita', instance: 1, site: 'DKC_External', name: 'DaVita' },
    { slug: 'denverhealth', instance: 1, site: 'DHHA-Main', name: 'Denver Health' },
    { slug: 'nshs', instance: 1, site: 'ns-eeh', name: 'Endeavor Health' },
    { slug: 'gbmc', instance: 1, site: 'GBMC', name: 'GBMC HealthCare' },
    { slug: 'geisinger', instance: 5, site: 'GeisingerExternal', name: 'Geisinger' },
    { slug: 'gohealthuc', instance: 12, site: 'External', name: 'GoHealth Urgent Care' },
    { slug: 'halifaxhealth', instance: 12, site: 'HalifaxHealth', name: 'Halifax Health' },
    { slug: 'hshs', instance: 1, site: 'hshscareers', name: 'Hospital Sisters Health' },
    { slug: 'imh', instance: 108, site: 'IntermountainCareers', name: 'Intermountain Health' },
    { slug: 'jeffersonhealth', instance: 5, site: 'ThomasJeffersonExternal', name: 'Jefferson Health' },
    { slug: 'luriechildrens', instance: 1, site: 'externalportal', name: "Lurie Children's" },
    { slug: 'massgeneralbrigham', instance: 1, site: 'MGBExternal', name: 'Mass General Brigham' },
    { slug: 'memorialhealthcare', instance: 1, site: 'MHS_Careers', name: 'Memorial Healthcare (FL)' },
    { slug: 'multicare', instance: 1, site: 'multicare', name: 'MultiCare Health' },
    { slug: 'nationwidechildrens', instance: 5, site: 'NCHCareers', name: "Nationwide Children's" },
    { slug: 'ochsner', instance: 1, site: 'Ochsner', name: 'Ochsner Health' },
    { slug: 'oumedicine', instance: 5, site: 'OUHealthCareers', name: 'OU Health' },
    { slug: 'rrhs', instance: 5, site: 'RRH', name: 'Rochester Regional Health' },
    { slug: 'sanford', instance: 5, site: 'SanfordHealth', name: 'Sanford Health' },
    { slug: 'sentara', instance: 1, site: 'SCS', name: 'Sentara Healthcare' },
    { slug: 'ssmh', instance: 5, site: 'ssmhealth', name: 'SSM Health' },
    { slug: 'stanfordhealthcare', instance: 5, site: 'SHC_External_Career_Site', name: 'Stanford Health Care' },
    { slug: 'sutterhealth', instance: 1, site: 'sh', name: 'Sutter Health' },
    { slug: 'umassmemorial', instance: 1, site: 'Careers', name: 'UMass Memorial Health' },
    { slug: 'uvmhealth', instance: 1, site: 'CVPH', name: 'UVM Health Network' },
    { slug: 'vumc', instance: 1, site: 'vumccareers', name: 'Vanderbilt UMC' },
    { slug: 'wvumedicine', instance: 1, site: 'WVUH', name: 'WVU Medicine' },

    // === ADDED 2026-02-16 — Verified CSV (Health Insurance — hire psychiatric NPs) ===
    { slug: 'elevancehealth', instance: 1, site: 'ANT', name: 'Elevance Health (Anthem)' },
    { slug: 'cigna', instance: 5, site: 'cignacareers', name: 'Cigna' },
    { slug: 'humana', instance: 5, site: 'Humana_External_Career_Site', name: 'Humana' },
    { slug: 'centene', instance: 5, site: 'Centene_External', name: 'Centene' },
    { slug: 'cvshealth', instance: 1, site: 'CVS_Health_Careers', name: 'CVS Health' },
    { slug: 'highmarkhealth', instance: 1, site: 'highmark', name: 'Highmark Health' },

    // === Verified CSV (Healthcare IT — Teladoc uses WD for hiring) ===
    { slug: 'teladoc', instance: 503, site: 'teladochealth_is_hiring', name: 'Teladoc Health' },
    { slug: 'athenahealth', instance: 1, site: 'External', name: 'athenahealth' },

    // === ADDED 2026-02-16 — CSV test: 9 new PMHNP-active ===
    { slug: 'essentiahealth', instance: 1, site: 'essentia_health', name: 'Essentia Health' },  // 11 PMHNP
    { slug: 'solutionhealth', instance: 1, site: 'careers', name: 'Solution Health' },            // 7 PMHNP
    { slug: 'gundersenhealth', instance: 5, site: 'gundersen', name: 'Gundersen Health' },        // 2 PMHNP
    { slug: 'benefis', instance: 1, site: 'External', name: 'Benefis Health System' },            // 2 PMHNP
    { slug: 'mercycare', instance: 1, site: 'External', name: 'Mercy Cedar Rapids' },             // 2 PMHNP
    { slug: 'southshorehealth', instance: 1, site: 'External', name: 'South Shore Health' },      // 2 PMHNP
    { slug: 'verawholehealth', instance: 1, site: 'External', name: 'Vera Whole Health' },        // 2 PMHNP
    { slug: 'bozemanhealth', instance: 1, site: 'bozemanhealthcareers', name: 'Bozeman Health' }, // 1 PMHNP
    { slug: 'hollandhospital', instance: 1, site: 'external', name: 'Holland Hospital' },         // 1 PMHNP

    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===
    { slug: 'marshfieldclinichealthsystems', instance: 5, site: 'external', name: 'Marshfieldclinichealthsystems' },
    { slug: 'pullmanregionalhospital', instance: 1, site: 'External', name: 'Pullmanregionalhospital' },

    // === BULK ADD — All remaining CSV companies (430) ===
    { slug: 'aahsandiego.com', instance: 1, site: 'External', name: 'Aahsandiego.com' },
    { slug: 'abbluecross|wd3|careers', instance: 1, site: 'External', name: 'Abbluecross|wd3|careers' },
    { slug: 'abbott', instance: 1, site: 'External', name: 'Abbott' },
    { slug: 'academyvets.com', instance: 1, site: 'External', name: 'Academyvets.com' },
    { slug: 'acathospital.com', instance: 1, site: 'External', name: 'Acathospital.com' },
    { slug: 'accenture', instance: 1, site: 'External', name: 'Accenture (healthcare practice)' },
    { slug: 'accofpahrump.com', instance: 1, site: 'External', name: 'Accofpahrump.com' },
    { slug: 'aceanimalclinic.com', instance: 1, site: 'External', name: 'Aceanimalclinic.com' },
    { slug: 'acequiaah.com', instance: 1, site: 'External', name: 'Acequiaah.com' },
    { slug: 'activision|wd1|blizzard_external_careers', instance: 1, site: 'External', name: 'Activision|wd1|blizzard External Careers' },
    { slug: 'activision|wd1|external', instance: 1, site: 'External', name: 'Activision|wd1|external' },
    { slug: 'activision|wd1|king_external_careers', instance: 1, site: 'External', name: 'Activision|wd1|king External Careers' },
    { slug: 'activision|wd1|ss_external', instance: 1, site: 'External', name: 'Activision|wd1|ss External' },
    { slug: 'adventisthealthcare|wd1|adventisthealthcarecareers', instance: 1, site: 'External', name: 'Adventisthealthcare|wd1|adventisthealthcarecareers' },
    { slug: 'agilent', instance: 1, site: 'External', name: 'Agilent Technologies' },
    { slug: 'agilonhealth|wd1|external', instance: 1, site: 'External', name: 'Agilonhealth|wd1|external' },
    { slug: 'airliquidehr|wd3|airgasexternalcareer', instance: 1, site: 'External', name: 'Airliquidehr|wd3|airgasexternalcareer' },
    { slug: 'airliquidehr|wd3|airliquideexternalcareer', instance: 1, site: 'External', name: 'Airliquidehr|wd3|airliquideexternalcareer' },
    { slug: 'akaalpet.com', instance: 1, site: 'External', name: 'Akaalpet.com' },
    { slug: 'alamoanimal.com', instance: 1, site: 'External', name: 'Alamoanimal.com' },
    { slug: 'alamovet.com', instance: 1, site: 'External', name: 'Alamovet.com' },
    { slug: 'alexisroadanimalhospital.com', instance: 1, site: 'External', name: 'Alexisroadanimalhospital.com' },
    { slug: 'allencountyhd.com', instance: 1, site: 'External', name: 'Allencountyhd.com' },
    { slug: 'alliance-healthcare.cz', instance: 1, site: 'External', name: 'Alliance Healthcare.cz' },
    { slug: 'amctyler.com', instance: 1, site: 'External', name: 'Amctyler.com' },
    { slug: 'americancrystalcareers.com', instance: 1, site: 'External', name: 'Americancrystalcareers.com' },
    { slug: 'amgen', instance: 1, site: 'External', name: 'Amgen' },
    { slug: 'ampmvet.com', instance: 1, site: 'External', name: 'Ampmvet.com' },
    { slug: 'amsaucr.org', instance: 1, site: 'External', name: 'Amsaucr.org' },
    { slug: 'andersonspro.com', instance: 1, site: 'External', name: 'Madhouse' },
    { slug: 'andrewsvetclinic.com', instance: 1, site: 'External', name: 'Andrewsvetclinic.com' },
    { slug: 'animalcareclinicmonadnock.com', instance: 1, site: 'External', name: 'Animalcareclinicmonadnock.com' },
    { slug: 'animalcareclinicsandiego.com', instance: 1, site: 'External', name: 'Animalcareclinicsandiego.com' },
    { slug: 'animalkindnessvet.net', instance: 1, site: 'External', name: 'Animal Kindness Veterinary Hospital' },
    { slug: 'ansoniawestfieldvet.com', instance: 1, site: 'External', name: 'Ansonia Veterinary Hospital Westfield &amp; Seymour' },
    { slug: 'aoncology|wd12|aoncology_careers', instance: 1, site: 'External', name: 'Aoncology|wd12|aoncology Careers' },
    { slug: 'astrazeneca', instance: 1, site: 'External', name: 'AstraZeneca (incl. Alexion)' },
    { slug: 'athenahealth|wd1|external', instance: 1, site: 'External', name: 'Athenahealth|wd1|external' },
    { slug: 'athomevet.net', instance: 1, site: 'External', name: 'At Home Veterinary' },
    { slug: 'atlanticmedia|wd1|careers', instance: 1, site: 'External', name: 'Atlanticmedia|wd1|careers' },
    { slug: 'autonomywork.com', instance: 1, site: 'External', name: 'Autonomywork.com' },
    { slug: 'awmedschool.org', instance: 1, site: 'External', name: 'Awmedschool.org' },
    { slug: 'bandageball.org', instance: 1, site: 'External', name: 'Bandageball.org' },
    { slug: 'barnard|wd1|faculty', instance: 1, site: 'External', name: 'Barnard|wd1|faculty' },
    { slug: 'barnard|wd1|staff', instance: 1, site: 'External', name: 'Barnard|wd1|staff' },
    { slug: 'baxter', instance: 1, site: 'External', name: 'Baxter International' },
    { slug: 'bbinsurance|wd1|careers', instance: 1, site: 'External', name: 'Bbinsurance|wd1|careers' },
    { slug: 'bbinsurance|wd1|careers_europe', instance: 1, site: 'External', name: 'Bbinsurance|wd1|careers Europe' },
    { slug: 'bbinsurance|wd1|proctorcareers', instance: 1, site: 'External', name: 'Bbinsurance|wd1|proctorcareers' },
    { slug: 'bdx', instance: 1, site: 'External', name: 'Becton Dickinson (BD)' },
    { slug: 'beachparkanimalclinic.com', instance: 1, site: 'External', name: 'Beachparkanimalclinic.com' },
    { slug: 'bernardsvilleanimalhospital.com', instance: 1, site: 'External', name: 'Bernardsvilleanimalhospital.com' },
    { slug: 'biibhr', instance: 1, site: 'External', name: 'Biogen' },
    { slug: 'biogenresearchday.eu', instance: 1, site: 'External', name: 'Biogenresearchday.eu' },
    { slug: 'bioresources.net.au', instance: 1, site: 'External', name: 'Bioresources.net.au' },
    { slug: 'biotechne|wd5|biotechne', instance: 1, site: 'External', name: 'Biotechne|wd5|biotechne' },
    { slug: 'boseallaboutme|wd1|es', instance: 1, site: 'External', name: 'Boseallaboutme|wd1|es' },
    { slug: 'boulevardpethospital.com', instance: 1, site: 'External', name: 'Boulevardpethospital.com' },
    { slug: 'bowdonanimalclinic.net', instance: 1, site: 'External', name: 'Bowdonanimalclinic.net' },
    { slug: 'bozemanhealthfoundation.org', instance: 1, site: 'External', name: 'Bozeman Foundation' },
    { slug: 'bozemanhealth|wd1|bozemanhealthcareers', instance: 1, site: 'External', name: 'Bozemanhealth|wd1|bozemanhealthcareers' },
    { slug: 'brandonlakesanimalhospital.com', instance: 1, site: 'External', name: 'Brandonlakesanimalhospital.com' },
    { slug: 'bristolmyerssquibb', instance: 1, site: 'External', name: 'Bristol-Myers Squibb' },
    { slug: 'brunswick-careers.com', instance: 1, site: 'External', name: 'Brunswick Careers.com' },
    { slug: 'btjobs.me', instance: 1, site: 'External', name: 'Buildertrend' },
    { slug: 'buildingmaterialscareer.com', instance: 1, site: 'External', name: 'Buildingmaterialscareer.com' },
    { slug: 'calusacrossinganimalhospital.com', instance: 1, site: 'External', name: 'Calusacrossinganimalhospital.com' },
    { slug: 'cambiahealth|wd1|external', instance: 1, site: 'External', name: 'Cambiahealth|wd1|external' },
    { slug: 'campusveterinary.com', instance: 1, site: 'External', name: 'Campusveterinary.com' },
    { slug: 'carbonhealth|wd1|careers', instance: 1, site: 'External', name: 'Carbonhealth|wd1|careers' },
    { slug: 'cardinalhealth', instance: 1, site: 'External', name: 'Cardinal Health' },
    { slug: 'cardinalhealth|wd1|ext', instance: 1, site: 'External', name: 'Cardinalhealth|wd1|ext' },
    { slug: 'careabout|wd5|adjuvant_careers', instance: 1, site: 'External', name: 'Careabout|wd5|adjuvant Careers' },
    { slug: 'careabout|wd5|consensus_careers', instance: 1, site: 'External', name: 'Careabout|wd5|consensus Careers' },
    { slug: 'careabout|wd5|mspb_careers', instance: 1, site: 'External', name: 'Careabout|wd5|mspb Careers' },
    { slug: 'caresource', instance: 1, site: 'External', name: 'CareSource' },
    { slug: 'caresource|wd1|caresource', instance: 1, site: 'External', name: 'Caresource|wd1|caresource' },
    { slug: 'carilionclinic|wd12|external_careers', instance: 1, site: 'External', name: 'Carilionclinic|wd12|external Careers' },
    { slug: 'catalent', instance: 1, site: 'External', name: 'Catalent' },
    { slug: 'ccvetco.com', instance: 1, site: 'External', name: 'Ccvetco.com' },
    { slug: 'centralanimalhospitalma.com', instance: 1, site: 'External', name: 'Centralanimalhospitalma.com' },
    { slug: 'cgm', instance: 1, site: 'External', name: 'CompuGroup Medical' },
    { slug: 'chathams.vet', instance: 1, site: 'External', name: 'Chathams.vet' },
    { slug: 'chghealthcare|wd1|external', instance: 1, site: 'External', name: 'Chghealthcare|wd1|external' },
    { slug: 'cltbugs.com', instance: 1, site: 'External', name: 'Killingsworth Environmental Pest Control' },
    { slug: 'cmh', instance: 1, site: 'External', name: 'Central Maine Healthcare' },
    { slug: 'codornicesveterinaryclinic.com', instance: 1, site: 'External', name: 'Codornicesveterinaryclinic.com' },
    { slug: 'collaborative', instance: 1, site: 'External', name: 'Cognizant (healthcare practice)' },
    { slug: 'comcastcareers.com', instance: 1, site: 'External', name: 'Comcastcareers.com' },
    { slug: 'companionvetnh.com', instance: 1, site: 'External', name: 'Companionvetnh.com' },
    { slug: 'compassioncareers.com', instance: 1, site: 'External', name: 'Compassioncareers.com' },
    { slug: 'connecturejobs.com', instance: 1, site: 'External', name: 'Connecturejobs.com' },
    { slug: 'corespecialtyinsurance|wd1|core_specialty', instance: 1, site: 'External', name: 'Corespecialtyinsurance|wd1|core Specialty' },
    { slug: 'corneliusvet.com', instance: 1, site: 'External', name: 'Corneliusvet.com' },
    { slug: 'corrohealth', instance: 1, site: 'External', name: 'CorroHealth' },
    { slug: 'corrohealth|wd1|corro', instance: 1, site: 'External', name: 'Corrohealth|wd1|corro' },
    { slug: 'cottagepethospital.com', instance: 1, site: 'External', name: 'Cottagepethospital.com' },
    { slug: 'countylineanimalhospitalfl.com', instance: 1, site: 'External', name: 'Countylineanimalhospitalfl.com' },
    { slug: 'coxhealth|wd5|coxhealth_external', instance: 1, site: 'External', name: 'Coxhealth|wd5|coxhealth External' },
    { slug: 'crittercarevet.com', instance: 1, site: 'External', name: 'Crittercarevet.com' },
    { slug: 'crossagency|wd1|crossfinancialcareers', instance: 1, site: 'External', name: 'Crossagency|wd1|crossfinancialcareers' },
    { slug: 'crosscountrymortgage|wd1|ccmcareers', instance: 1, site: 'External', name: 'Crosscountrymortgage|wd1|ccmcareers' },
    { slug: 'crossoverhealth|wd1|careers', instance: 1, site: 'External', name: 'Crossoverhealth|wd1|careers' },
    { slug: 'crowdstrike|wd5|crowdstrikecareers', instance: 1, site: 'External', name: 'Crowdstrike|wd5|crowdstrikecareers' },
    { slug: 'cvshealth|wd1|cvs_health_careers', instance: 1, site: 'External', name: 'Cvshealth|wd1|cvs Health Careers' },
    { slug: 'cwi', instance: 1, site: 'External', name: 'Children\'s Wisconsin' },
    { slug: 'dadecityanimalclinic.com', instance: 1, site: 'External', name: 'Dadecityanimalclinic.com' },
    { slug: 'damenbusinesscourse.com', instance: 1, site: 'External', name: 'Career Damen' },
    { slug: 'darlingdownsradiology.com.au', instance: 1, site: 'External', name: 'South Coast Radiology' },
    { slug: 'dawsonvillevet.com', instance: 1, site: 'External', name: 'Dawsonvillevet.com' },
    { slug: 'dc-jobs.com', instance: 1, site: 'External', name: 'Dc Jobs.com' },
    { slug: 'desertvet.com', instance: 1, site: 'External', name: 'Desertvet.com' },
    { slug: 'desklessjobs.com', instance: 1, site: 'External', name: 'Desklessjobs.com' },
    { slug: 'devoted|wd1|devoted', instance: 1, site: 'External', name: 'Devoted|wd1|devoted' },
    { slug: 'dewittvets.com', instance: 1, site: 'External', name: 'Dewittvets.com' },
    { slug: 'dexcom', instance: 1, site: 'External', name: 'DexCom' },
    { slug: 'eagle-vet.com', instance: 1, site: 'External', name: 'Eagle Vet.com' },
    { slug: 'edwards', instance: 1, site: 'External', name: 'Edwards Lifesciences' },
    { slug: 'ehealthinsurance|wd5|ehi', instance: 1, site: 'External', name: 'Ehealthinsurance|wd5|ehi' },
    { slug: 'elevancehealth|wd1|ant', instance: 1, site: 'External', name: 'Elevancehealth|wd1|ant' },
    { slug: 'elevancehealth|wd1|es', instance: 1, site: 'External', name: 'Elevancehealth|wd1|es' },
    { slug: 'elixir-careers.com', instance: 1, site: 'External', name: 'Elixir Careers.com' },
    { slug: 'elkovet.com', instance: 1, site: 'External', name: 'Elko Veterinary Clinic' },
    { slug: 'emanatehealth.org', instance: 1, site: 'External', name: 'Emanatehealth.org' },
    { slug: 'envirocareer.com', instance: 1, site: 'External', name: 'Envirocareer.com' },
    { slug: 'envista', instance: 1, site: 'External', name: 'Envista' },
    { slug: 'equisoft.careers', instance: 1, site: 'External', name: 'Equisoft' },
    { slug: 'essentiahealth|wd1|essentia_health', instance: 1, site: 'External', name: 'Essentiahealth|wd1|essentia Health' },
    { slug: 'evolent', instance: 1, site: 'External', name: 'Evolent Health' },
    { slug: 'exactcare|wd1|anewhealth_career_site', instance: 1, site: 'External', name: 'Exactcare|wd1|anewhealth Career Site' },
    { slug: 'exactcare|wd1|carepathrx_career_site', instance: 1, site: 'External', name: 'Exactcare|wd1|carepathrx Career Site' },
    { slug: 'exactsciences', instance: 1, site: 'External', name: 'Exact Sciences' },
    { slug: 'extendicare|wd10|extendicare2023', instance: 1, site: 'External', name: 'Extendicare|wd10|extendicare2023' },
    { slug: 'extendicare|wd10|paramed2023', instance: 1, site: 'External', name: 'Extendicare|wd10|paramed2023' },
    { slug: 'eyotavet.com', instance: 1, site: 'External', name: 'Eyotavet.com' },
    { slug: 'fccenvironmental.com', instance: 1, site: 'External', name: 'Fccenvironmental.com' },
    { slug: 'fermilab|wd5|fermilabcareers', instance: 1, site: 'External', name: 'Fermilab|wd5|fermilabcareers' },
    { slug: 'figopet.com', instance: 1, site: 'External', name: 'Figo Pet Insurance' },
    { slug: 'flandersvet.com', instance: 1, site: 'External', name: 'Flandersvet.com' },
    { slug: 'flexcareers.com', instance: 1, site: 'External', name: 'Flexcareers.com' },
    { slug: 'fostercaresanantonio.info', instance: 1, site: 'External', name: 'Fostercaresanantonio.info' },
    { slug: 'foxandfriendsanimalhospital.com', instance: 1, site: 'External', name: 'Foxandfriendsanimalhospital.com' },
    { slug: 'freseniusglobal', instance: 1, site: 'External', name: 'Fresenius (global)' },
    { slug: 'freseniusmedicalcare|wd3|fme', instance: 1, site: 'External', name: 'Freseniusmedicalcare|wd3|fme' },
    { slug: 'futurenet.de', instance: 1, site: 'External', name: 'nectanet' },
    { slug: 'galderma|wd3|external', instance: 1, site: 'External', name: 'Galderma|wd3|external' },
    { slug: 'gallatinhc.com', instance: 1, site: 'External', name: 'Gallatin Nursing & Rehab' },
    { slug: 'gardencityvet.com', instance: 1, site: 'External', name: 'Gardencityvet.com' },
    { slug: 'gehc', instance: 1, site: 'External', name: 'GE HealthCare' },
    { slug: 'geisertanimalhospital.com', instance: 1, site: 'External', name: 'Geisertanimalhospital.com' },
    { slug: 'generac|wd5|external', instance: 1, site: 'External', name: 'Generac|wd5|external' },
    { slug: 'generaliespana|wd3|es', instance: 1, site: 'External', name: 'Generaliespana|wd3|es' },
    { slug: 'generaliespana|wd3|generali_portal_externo', instance: 1, site: 'External', name: 'Generaliespana|wd3|generali Portal Externo' },
    { slug: 'generalmotors|wd5|careers_gm', instance: 1, site: 'External', name: 'Generalmotors|wd5|careers Gm' },
    { slug: 'generalmotors|wd5|es', instance: 1, site: 'External', name: 'Generalmotors|wd5|es' },
    { slug: 'genesiscare|wd1|genesiscare_careers', instance: 1, site: 'External', name: 'Genesiscare|wd1|genesiscare Careers' },
    { slug: 'genesys|wd1|genesys', instance: 1, site: 'External', name: 'Genesys|wd1|genesys' },
    { slug: 'genoaanimalhospital.com', instance: 1, site: 'External', name: 'Genoaanimalhospital.com' },
    { slug: 'ghc', instance: 1, site: 'External', name: 'Residential Home Health / GHC' },
    { slug: 'gilead', instance: 1, site: 'External', name: 'Gilead Sciences' },
    { slug: 'globusmedical', instance: 1, site: 'External', name: 'Globus Medical (incl. NuVasive)' },
    { slug: 'globusmedical|wd5|gmed_careers', instance: 1, site: 'External', name: 'Globusmedical|wd5|gmed Careers' },
    { slug: 'goodrichveterinary.com', instance: 1, site: 'External', name: 'Goodrichveterinary.com' },
    { slug: 'goodrx', instance: 1, site: 'External', name: 'GoodRx' },
    { slug: 'gphjobs.com', instance: 1, site: 'External', name: 'Gphjobs.com' },
    { slug: 'greatroadvets.com', instance: 1, site: 'External', name: 'Greatroadvets.com' },
    { slug: 'greendotcorp|wd1|gdc', instance: 1, site: 'External', name: 'Greendotcorp|wd1|gdc' },
    { slug: 'greenwichveterinary.com', instance: 1, site: 'External', name: 'Greenwichveterinary.com' },
    { slug: 'greifcareers.com', instance: 1, site: 'External', name: 'Greifcareers.com' },
    { slug: 'gsk', instance: 1, site: 'External', name: 'GSK' },
    { slug: 'guardianmidsouth.com', instance: 1, site: 'External', name: 'Guardianmidsouth.com' },
    { slug: 'guardianpharmacyanaheim.com', instance: 1, site: 'External', name: 'Guardianpharmacyanaheim.com' },
    { slug: 'guardianpharmacybham.com', instance: 1, site: 'External', name: 'Guardianpharmacybham.com' },
    { slug: 'guardianpharmacydaytona.com', instance: 1, site: 'External', name: 'Guardianpharmacydaytona.com' },
    { slug: 'guardianpharmacygulfcoast.com', instance: 1, site: 'External', name: 'Guardianpharmacygulfcoast.com' },
    { slug: 'guardianpharmacyindiana.com', instance: 1, site: 'External', name: 'Guardianpharmacyindiana.com' },
    { slug: 'guardianpharmacyjax.com', instance: 1, site: 'External', name: 'Guardianpharmacyjax.com' },
    { slug: 'guardianpharmacymaine.com', instance: 1, site: 'External', name: 'Guardianpharmacymaine.com' },
    { slug: 'guardianpharmacyorlando.com', instance: 1, site: 'External', name: 'Guardianpharmacyorlando.com' },
    { slug: 'guardianpharmacypiedmont.com', instance: 1, site: 'External', name: 'Guardianpharmacypiedmont.com' },
    { slug: 'guardianpharmacysouthga.com', instance: 1, site: 'External', name: 'Guardianpharmacysouthga.com' },
    { slug: 'guardianpharmacytampa.com', instance: 1, site: 'External', name: 'Guardianpharmacytampa.com' },
    { slug: 'gundersenhealth|wd5|gundersen', instance: 1, site: 'External', name: 'Gundersenhealth|wd5|gundersen' },
    { slug: 'haemonetics', instance: 1, site: 'External', name: 'Haemonetics' },
    { slug: 'haleon.pk', instance: 1, site: 'External', name: 'Haleon.pk' },
    { slug: 'halozyme', instance: 1, site: 'External', name: 'Halozyme' },
    { slug: 'hamiltonah.com', instance: 1, site: 'External', name: 'Hamiltonah.com' },
    { slug: 'hardinanimalhospital.com', instance: 1, site: 'External', name: 'Hardinanimalhospital.com' },
    { slug: 'haywardanimalclinic.com', instance: 1, site: 'External', name: 'Haywardanimalclinic.com' },
    { slug: 'healthcare', instance: 1, site: 'External', name: 'Solventum (fka 3M Health Care)' },
    { slug: 'healthcare|wd1|private', instance: 1, site: 'External', name: 'Healthcare|wd1|private' },
    { slug: 'healthcare|wd1|search', instance: 1, site: 'External', name: 'Healthcare|wd1|search' },
    { slug: 'healthcatalyst', instance: 1, site: 'External', name: 'Health Catalyst' },
    { slug: 'healthpointsosu.com', instance: 1, site: 'External', name: 'Healthpointsosu.com' },
    { slug: 'heidtvet.com', instance: 1, site: 'External', name: 'Heidtvet.com' },
    { slug: 'henryschein', instance: 1, site: 'External', name: 'Henry Schein' },
    { slug: 'hhc', instance: 1, site: 'External', name: 'Houston Healthcare' },
    { slug: 'highmarkhealth|wd1|highmark', instance: 1, site: 'External', name: 'Highmarkhealth|wd1|highmark' },
    { slug: 'hillcresthealthcaresystemjobs.com', instance: 1, site: 'External', name: 'Hillcresthealthcaresystemjobs.com' },
    { slug: 'hinesburgvtvet.com', instance: 1, site: 'External', name: 'Hinesburgvtvet.com' },
    { slug: 'hollandhospital|wd1|external', instance: 1, site: 'External', name: 'Hollandhospital|wd1|external' },
    { slug: 'homecareassistancechicago.com', instance: 1, site: 'External', name: 'Trusted Senior Home Care Assistance | Chicago  - TheKey' },
    { slug: 'homedepotretailjobs.com', instance: 1, site: 'External', name: 'Homedepotretailjobs.com' },
    { slug: 'homedepot|wd5|careerdepot', instance: 1, site: 'External', name: 'Homedepot|wd5|careerdepot' },
    { slug: 'horizon', instance: 1, site: 'External', name: 'Horizon Therapeutics' },
    { slug: 'hospicecom|wd5|compassus', instance: 1, site: 'External', name: 'Hospicecom|wd5|compassus' },
    { slug: 'hubinternational|wd1|hubinternational', instance: 1, site: 'External', name: 'Hubinternational|wd1|hubinternational' },
    { slug: 'humanresourcesjobs.app', instance: 1, site: 'External', name: 'Humanresourcesjobs.app' },
    { slug: 'huntingtonhospital', instance: 1, site: 'External', name: 'Huntington Health' },
    { slug: 'husqvarnagroup|wd3|external_career_site', instance: 1, site: 'External', name: 'Husqvarnagroup|wd3|external Career Site' },
    { slug: 'hvcvets.com', instance: 1, site: 'External', name: 'Hvcvets.com' },
    { slug: 'icanapply.uk', instance: 1, site: 'External', name: 'Icanapply.uk' },
    { slug: 'icon', instance: 1, site: 'External', name: 'ICON PLC' },
    { slug: 'iheartmedia|wd5|external_ihm', instance: 1, site: 'External', name: 'Iheartmedia|wd5|external Ihm' },
    { slug: 'iheartmedia|wd5|ihm_corporate_site', instance: 1, site: 'External', name: 'Iheartmedia|wd5|ihm Corporate Site' },
    { slug: 'iheartmedia|wd5|ihm_marketing_site', instance: 1, site: 'External', name: 'Iheartmedia|wd5|ihm Marketing Site' },
    { slug: 'iheartmedia|wd5|ihm_technology_site', instance: 1, site: 'External', name: 'Iheartmedia|wd5|ihm Technology Site' },
    { slug: 'illumina', instance: 1, site: 'External', name: 'Illumina' },
    { slug: 'immediatecare.net', instance: 1, site: 'External', name: 'Immediatecare.net' },
    { slug: 'independenceamerican.com', instance: 1, site: 'External', name: 'Independenceamerican.com' },
    { slug: 'ingrammicro|wd5|ingrammicro', instance: 1, site: 'External', name: 'Ingrammicro|wd5|ingrammicro' },
    { slug: 'insulet', instance: 1, site: 'External', name: 'Insulet' },
    { slug: 'inteelabs.com', instance: 1, site: 'External', name: 'Inteelabs.com' },
    { slug: 'integralife', instance: 1, site: 'External', name: 'Integra LifeSciences' },
    { slug: 'ipsen.uk', instance: 1, site: 'External', name: 'UK Ireland' },
    { slug: 'iqvia', instance: 1, site: 'External', name: 'IQVIA' },
    { slug: 'islandtreesveterinaryhospital.com', instance: 1, site: 'External', name: 'Islandtreesveterinaryhospital.com' },
    { slug: 'javacareers.ai', instance: 1, site: 'External', name: 'Javacareers.ai' },
    { slug: 'jeffersonhealth|wd5|thomasjeffersonexternal', instance: 1, site: 'External', name: 'Jeffersonhealth|wd5|thomasjeffersonexternal' },
    { slug: 'jj', instance: 1, site: 'External', name: 'Johnson & Johnson' },
    { slug: 'jobhunter-ug.com', instance: 1, site: 'External', name: 'Jobhunter Ug.com' },
    { slug: 'katellavet.com', instance: 1, site: 'External', name: 'Katellavet.com' },
    { slug: 'kenaiveterinaryhospital.com', instance: 1, site: 'External', name: 'Kenai Veterinary Hospital' },
    { slug: 'kingscollegecareers.com', instance: 1, site: 'External', name: 'Kingscollegecareers.com' },
    { slug: 'labcorp', instance: 1, site: 'External', name: 'LabCorp' },
    { slug: 'labcorp|wd1|external', instance: 1, site: 'External', name: 'Labcorp|wd1|external' },
    { slug: 'labcorp|wd1|fortrea', instance: 1, site: 'External', name: 'Labcorp|wd1|fortrea' },
    { slug: 'lafayetteanimalhospital.com', instance: 1, site: 'External', name: 'Lafayetteanimalhospital.com' },
    { slug: 'lakeareaanimalclinic.com', instance: 1, site: 'External', name: 'Lakeareaanimalclinic.com' },
    { slug: 'lazy3animalcare.com', instance: 1, site: 'External', name: 'Lazy 3 Animal Care' },
    { slug: 'lewistonvet.com', instance: 1, site: 'External', name: 'Lewiston Veterinary Clinic' },
    { slug: 'lilly', instance: 1, site: 'External', name: 'Eli Lilly' },
    { slug: 'livingstonanimalvet.com', instance: 1, site: 'External', name: 'Livingstonanimalvet.com' },
    { slug: 'lonza', instance: 1, site: 'External', name: 'Lonza' },
    { slug: 'marshfieldclinichealthsystems|wd5|external', instance: 1, site: 'External', name: 'Marshfieldclinichealthsystems|wd5|external' },
    { slug: 'marshfieldclinichealthsystems|wd5|physician', instance: 1, site: 'External', name: 'Marshfieldclinichealthsystems|wd5|physician' },
    { slug: 'massgeneralbrigham|wd1|mgbexternal', instance: 1, site: 'External', name: 'Massgeneralbrigham|wd1|mgbexternal' },
    { slug: 'mckesson', instance: 1, site: 'External', name: 'McKesson' },
    { slug: 'medimarketgroup|wd103|mmg', instance: 1, site: 'External', name: 'Medimarketgroup|wd103|mmg' },
    { slug: 'medimpact|wd5|medimpact', instance: 1, site: 'External', name: 'Medimpact|wd5|medimpact' },
    { slug: 'medline|wd5|medline', instance: 1, site: 'External', name: 'Medline|wd5|medline' },
    { slug: 'medtronic', instance: 1, site: 'External', name: 'Medtronic' },
    { slug: 'medtronic|wd1|medtroniccareers', instance: 1, site: 'External', name: 'Medtronic|wd1|medtroniccareers' },
    { slug: 'medtronic|wd1|redeploymentmedtroniccareers', instance: 1, site: 'External', name: 'Medtronic|wd1|redeploymentmedtroniccareers' },
    { slug: 'medwayvet.com', instance: 1, site: 'External', name: 'Medwayvet.com' },
    { slug: 'mellinaanimalhospital.com', instance: 1, site: 'External', name: 'Mellina Animal Hospital' },
    { slug: 'memorialdrivevetclinic.com', instance: 1, site: 'External', name: 'Memorialdrivevetclinic.com' },
    { slug: 'mercy.careers', instance: 1, site: 'External', name: 'Mercy.careers' },
    { slug: 'merit', instance: 1, site: 'External', name: 'Merit Medical' },
    { slug: 'methodisthealthsystem', instance: 1, site: 'External', name: 'Methodist Health System' },
    { slug: 'methodisthealthsystem|wd1|mhs_careers', instance: 1, site: 'External', name: 'Methodisthealthsystem|wd1|mhs Careers' },
    { slug: 'mhc-tn.com', instance: 1, site: 'External', name: 'Mental Health Cooperative' },
    { slug: 'micron|wd1|external', instance: 1, site: 'External', name: 'Micron|wd1|external' },
    { slug: 'mindsetpharma.com', instance: 1, site: 'External', name: 'Mindsetpharma.com' },
    { slug: 'miromatrix.com', instance: 1, site: 'External', name: 'Miromatrix.com' },
    { slug: 'missionvalleypetclinic.com', instance: 1, site: 'External', name: 'Missionvalleypetclinic.com' },
    { slug: 'modernatx', instance: 1, site: 'External', name: 'Moderna' },
    { slug: 'modernatx|wd1|m_tx', instance: 1, site: 'External', name: 'Modernatx|wd1|m Tx' },
    { slug: 'mon-clairanimalhospital.com', instance: 1, site: 'External', name: 'Mon Clairanimalhospital.com' },
    { slug: 'msd', instance: 1, site: 'External', name: 'Merck (MSD)' },
    { slug: 'multicare|wd1|multicare', instance: 1, site: 'External', name: 'Multicare|wd1|multicare' },
    { slug: 'mundipharma|wd3|external', instance: 1, site: 'External', name: 'Mundipharma|wd3|external' },
    { slug: 'mvebio.com', instance: 1, site: 'External', name: 'MVE Biological Solutions' },
    { slug: 'mwhccareers.org', instance: 1, site: 'External', name: 'Mary Washington Healthcare' },
    { slug: 'myhrabc', instance: 1, site: 'External', name: 'Cencora (AmerisourceBergen)' },
    { slug: 'mymarinhealth', instance: 1, site: 'External', name: 'MarinHealth Medical Center' },
    { slug: 'ncaws.com', instance: 1, site: 'External', name: 'Ncaws.com' },
    { slug: 'neurocrine', instance: 1, site: 'External', name: 'Neurocrine Biosciences' },
    { slug: 'northernlakesveterinaryhospital.com', instance: 1, site: 'External', name: 'Northernlakesveterinaryhospital.com' },
    { slug: 'northgateanimal.com', instance: 1, site: 'External', name: 'Northgateanimal.com' },
    { slug: 'novartis', instance: 1, site: 'External', name: 'Novartis' },
    { slug: 'ntst', instance: 1, site: 'External', name: 'Netsmart' },
    { slug: 'oakdalevetcenter.com', instance: 1, site: 'External', name: 'Oakdale Veterinary Center' },
    { slug: 'oceansideanimal.com', instance: 1, site: 'External', name: 'Oceansideanimal.com' },
    { slug: 'okcanimalemergency.com', instance: 1, site: 'External', name: 'Okcanimalemergency.com' },
    { slug: 'oncologysandiego.com', instance: 1, site: 'External', name: 'Medical Oncology Associates of San Diego' },
    { slug: 'onehealthineers', instance: 1, site: 'External', name: 'Siemens Healthineers' },
    { slug: 'onehealthineers|wd3|ijmhrms', instance: 1, site: 'External', name: 'Onehealthineers|wd3|ijmhrms' },
    { slug: 'onehealthineers|wd3|shsjb', instance: 1, site: 'External', name: 'Onehealthineers|wd3|shsjb' },
    { slug: 'orchidortho|wd5|careers', instance: 1, site: 'External', name: 'Orchidortho|wd5|careers' },
    { slug: 'organon', instance: 1, site: 'External', name: 'Organon' },
    { slug: 'owensborohealth', instance: 1, site: 'External', name: 'Owensboro Health' },
    { slug: 'owensminor', instance: 1, site: 'External', name: 'Owens & Minor' },
    { slug: 'oysterlink.com', instance: 1, site: 'External', name: 'OysterLink' },
    { slug: 'pacificavenuevetclinic.com', instance: 1, site: 'External', name: 'Pacificavenuevetclinic.com' },
    { slug: 'pacificavevet.com', instance: 1, site: 'External', name: 'Pacificavevet.com' },
    { slug: 'palmdesertvets.com', instance: 1, site: 'External', name: 'Palmdesertvets.com' },
    { slug: 'parexel', instance: 1, site: 'External', name: 'Parexel' },
    { slug: 'parkwayal.com', instance: 1, site: 'External', name: 'Parkway Assisted Living' },
    { slug: 'path', instance: 1, site: 'External', name: 'PATH (global health nonprofit)' },
    { slug: 'path|wd1|external', instance: 1, site: 'External', name: 'Path|wd1|external' },
    { slug: 'pciservices', instance: 1, site: 'External', name: 'PCI Pharma Services' },
    { slug: 'performant', instance: 1, site: 'External', name: 'Performant Healthcare' },
    { slug: 'petdocks.com', instance: 1, site: 'External', name: 'Petdocks.com' },
    { slug: 'pfizer', instance: 1, site: 'External', name: 'Pfizer' },
    { slug: 'pharmajobber.com', instance: 1, site: 'External', name: 'Pharmajobber.com' },
    { slug: 'pharmajoblinks.com', instance: 1, site: 'External', name: 'Pharmajoblinks.com' },
    { slug: 'phelpshealth|wd5|phelps', instance: 1, site: 'External', name: 'Phelpshealth|wd5|phelps' },
    { slug: 'philips', instance: 1, site: 'External', name: 'Philips' },
    { slug: 'phoebehealth', instance: 1, site: 'External', name: 'Phoebe Putney Health System' },
    { slug: 'phreesia', instance: 1, site: 'External', name: 'Phreesia' },
    { slug: 'pinecityanimalhospital.com', instance: 1, site: 'External', name: 'Pinecityanimalhospital.com' },
    { slug: 'pkamc.com', instance: 1, site: 'External', name: 'Pkamc.com' },
    { slug: 'podvita.com', instance: 1, site: 'External', name: 'Podvita.com' },
    { slug: 'point32health|wd5|thp', instance: 1, site: 'External', name: 'Point32health|wd5|thp' },
    { slug: 'policepsychology.org', instance: 1, site: 'External', name: 'Policepsychology.org' },
    { slug: 'portlandgeneral|wd5|pgn', instance: 1, site: 'External', name: 'Portlandgeneral|wd5|pgn' },
    { slug: 'powayah.com', instance: 1, site: 'External', name: 'Powayah.com' },
    { slug: 'preferredcarerx.com', instance: 1, site: 'External', name: 'Preferredcarerx.com' },
    { slug: 'premera', instance: 1, site: 'External', name: 'Premera Blue Cross' },
    { slug: 'primetherapeutics', instance: 1, site: 'External', name: 'Prime Therapeutics' },
    { slug: 'primetherapeutics|wd1|primetherapeuticscareers', instance: 1, site: 'External', name: 'Primetherapeutics|wd1|primetherapeuticscareers' },
    { slug: 'primeuc.co', instance: 1, site: 'External', name: 'Primeuc.co' },
    { slug: 'propharmagroup', instance: 1, site: 'External', name: 'ProPharma Group' },
    { slug: 'pureinsurance|wd5|pure', instance: 1, site: 'External', name: 'Pureinsurance|wd5|pure' },
    { slug: 'qhr.com', instance: 1, site: 'External', name: 'Ovation Healthcare' },
    { slug: 'raptorsdevelopment.com', instance: 1, site: 'External', name: 'Raptors Basketball Development' },
    { slug: 'rector-associates.com', instance: 1, site: 'External', name: 'Rector Associates.com' },
    { slug: 'regeneron', instance: 1, site: 'External', name: 'Regeneron' },
    { slug: 'regeneron|wd1|careers', instance: 1, site: 'External', name: 'Regeneron|wd1|careers' },
    { slug: 'regeneron|wd1|es', instance: 1, site: 'External', name: 'Regeneron|wd1|es' },
    { slug: 'relationinsurance|wd5|relation', instance: 1, site: 'External', name: 'Relationinsurance|wd5|relation' },
    { slug: 'rentonvet.com', instance: 1, site: 'External', name: 'Rentonvet.com' },
    { slug: 'resmed', instance: 1, site: 'External', name: 'ResMed' },
    { slug: 'resmed|wd3|brightree_external_careers', instance: 1, site: 'External', name: 'Resmed|wd3|brightree External Careers' },
    { slug: 'resmed|wd3|matrixcare_external_careers', instance: 1, site: 'External', name: 'Resmed|wd3|matrixcare External Careers' },
    { slug: 'resmed|wd3|resmed_external_careers', instance: 1, site: 'External', name: 'Resmed|wd3|resmed External Careers' },
    { slug: 'rhahealthservices.org', instance: 1, site: 'External', name: 'Rhahealthservices.org' },
    { slug: 'rittenhousecancer.com', instance: 1, site: 'External', name: 'Rittenhousecancer.com' },
    { slug: 'rivhs', instance: 1, site: 'External', name: 'Riverside Health System' },
    { slug: 'roaminteriordesign.com', instance: 1, site: 'External', name: 'Roaminteriordesign.com' },
    { slug: 'robertirelandvm.com', instance: 1, site: 'External', name: 'Robertirelandvm.com' },
    { slug: 'roche', instance: 1, site: 'External', name: 'Roche (incl. Genentech)' },
    { slug: 'rogersanimalhospital.com', instance: 1, site: 'External', name: 'Rogersanimalhospital.com' },
    { slug: 'ronspharmacyservices.com', instance: 1, site: 'External', name: 'Ronspharmacyservices.com' },
    { slug: 'royerveterinary.com', instance: 1, site: 'External', name: 'Royerveterinary.com' },
    { slug: 'salinasvalleyhealth', instance: 1, site: 'External', name: 'Salinas Valley Health' },
    { slug: 'salinasvalleyhealth|wd5|salinasvalleyhealth', instance: 1, site: 'External', name: 'Salinasvalleyhealth|wd5|salinasvalleyhealth' },
    { slug: 'samuelmerritt.edu', instance: 1, site: 'External', name: 'Samuelmerritt.edu' },
    { slug: 'sandiegohospitaljobs.org', instance: 1, site: 'External', name: 'Sandiegohospitaljobs.org' },
    { slug: 'sanfordhealth.jobs', instance: 1, site: 'External', name: 'Sanfordhealth.jobs' },
    { slug: 'sanofi', instance: 1, site: 'External', name: 'Sanofi' },
    { slug: 'sanrafaelvet.com', instance: 1, site: 'External', name: 'Sanrafaelvet.com' },
    { slug: 'santacruzanimalclinic.com', instance: 1, site: 'External', name: 'Santacruzanimalclinic.com' },
    { slug: 'sarepta', instance: 1, site: 'External', name: 'Sarepta Therapeutics' },
    { slug: 'sbcos.com', instance: 1, site: 'External', name: 'Sbcos.com' },
    { slug: 'seacoastveterinarygroup.com', instance: 1, site: 'External', name: 'Seacoastveterinarygroup.com' },
    { slug: 'sentryinsurance|wd1|sentrycareers', instance: 1, site: 'External', name: 'Sentryinsurance|wd1|sentrycareers' },
    { slug: 'sharecare|wd1|sharecare_careers', instance: 1, site: 'External', name: 'Sharecare|wd1|sharecare Careers' },
    { slug: 'sharonvet.com', instance: 1, site: 'External', name: 'Sharonvet.com' },
    { slug: 'smithnephew', instance: 1, site: 'External', name: 'Smith & Nephew' },
    { slug: 'solutionhealth|wd1|careers', instance: 1, site: 'External', name: 'Solutionhealth|wd1|careers' },
    { slug: 'southcountyveterinary.com', instance: 1, site: 'External', name: 'Southcountyveterinary.com' },
    { slug: 'southhavenhealth.com', instance: 1, site: 'External', name: 'Southhavenhealth.com' },
    { slug: 'southlake', instance: 1, site: 'External', name: 'Southlake Health (Canada)' },
    { slug: 'spectrumhealth|wd5|corewellhealthcareers', instance: 1, site: 'External', name: 'Spectrumhealth|wd5|corewellhealthcareers' },
    { slug: 'springernature|wd3|springernaturecareers', instance: 1, site: 'External', name: 'Springernature|wd3|springernaturecareers' },
    { slug: 'stgeorgesvet.com', instance: 1, site: 'External', name: 'Stgeorgesvet.com' },
    { slug: 'stjude', instance: 1, site: 'External', name: 'St. Jude Children\'s Research Hospital' },
    { slug: 'stonehousevet.com', instance: 1, site: 'External', name: 'Stonehousevet.com' },
    { slug: 'stonerisehh.com', instance: 1, site: 'External', name: 'Stonerisehh.com' },
    { slug: 'stryker', instance: 1, site: 'External', name: 'Stryker' },
    { slug: 'syneoshealth|wd12|syneos_health_external_site', instance: 1, site: 'External', name: 'Syneoshealth|wd12|syneos Health External Site' },
    { slug: 'takeda', instance: 1, site: 'External', name: 'Takeda' },
    { slug: 'tandemdiabetes', instance: 1, site: 'External', name: 'Tandem Diabetes Care' },
    { slug: 'tarzanapetclinic.com', instance: 1, site: 'External', name: 'Tarzanapetclinic.com' },
    { slug: 'teamcarcare|wd1|external', instance: 1, site: 'External', name: 'Teamcarcare|wd1|external' },
    { slug: 'tempus', instance: 1, site: 'External', name: 'Tempus AI' },
    { slug: 'tempus|wd5|tempus_careers', instance: 1, site: 'External', name: 'Tempus|wd5|tempus Careers' },
    { slug: 'the4100group.com', instance: 1, site: 'External', name: 'The4100group.com' },
    { slug: 'theemergencypethospital.com', instance: 1, site: 'External', name: 'Emergency Pet Hospital of Craven-Carteret' },
    { slug: 'thermofisher', instance: 1, site: 'External', name: 'Thermo Fisher Scientific' },
    { slug: 'tiffinvet.com', instance: 1, site: 'External', name: 'Tiffinvet.com' },
    { slug: 'tlcanimalhospital.us', instance: 1, site: 'External', name: 'Tlcanimalhospital.us' },
    { slug: 'toro.jobs', instance: 1, site: 'External', name: 'Toro.jobs' },
    { slug: 'transmedics|wd1|transmedics_careers', instance: 1, site: 'External', name: 'Transmedics|wd1|transmedics Careers' },
    { slug: 'trendmicro|wd3|external', instance: 1, site: 'External', name: 'Trendmicro|wd3|external' },
    { slug: 'trinityhealth|wd1|jobs', instance: 1, site: 'External', name: 'Trinityhealth|wd1|jobs' },
    { slug: 'troyandheightsanimalhospital.net', instance: 1, site: 'External', name: 'Troyandheightsanimalhospital.net' },
    { slug: 'trugreenjobs.com', instance: 1, site: 'External', name: 'Trugreenjobs.com' },
    { slug: 'tuftsmedicine|wd1|jobs', instance: 1, site: 'External', name: 'Tuftsmedicine|wd1|jobs' },
    { slug: 'ucf.careers', instance: 1, site: 'External', name: 'Ucf.careers' },
    { slug: 'umchealthsystem', instance: 1, site: 'External', name: 'UMC Health System (Lubbock)' },
    { slug: 'unisys.jobs', instance: 1, site: 'External', name: 'Unisys.jobs' },
    { slug: 'univision|wd1|es', instance: 1, site: 'External', name: 'Univision|wd1|es' },
    { slug: 'univision|wd1|external', instance: 1, site: 'External', name: 'Univision|wd1|external' },
    { slug: 'unum', instance: 1, site: 'External', name: 'Unum Group' },
    { slug: 'uppermarlborovet.com', instance: 1, site: 'External', name: 'Uppermarlborovet.com' },
    { slug: 'valleyhealthlink|wd5|valleyhealthcareers', instance: 1, site: 'External', name: 'Valleyhealthlink|wd5|valleyhealthcareers' },
    { slug: 'vca', instance: 1, site: 'External', name: 'VCA Animal Hospitals (veterinary)' },
    { slug: 'verauniversity.net', instance: 1, site: 'External', name: 'Verauniversity.net' },
    { slug: 'verawholehealth|wd1|external', instance: 1, site: 'External', name: 'Verawholehealth|wd1|external' },
    { slug: 'vermontvets.com', instance: 1, site: 'External', name: 'Vermontvets.com' },
    { slug: 'vetamc.com', instance: 1, site: 'External', name: 'Vetamc.com' },
    { slug: 'vhr-jazz', instance: 1, site: 'External', name: 'Jazz Pharmaceuticals' },
    { slug: 'viatr.is', instance: 1, site: 'External', name: 'Viatr.is' },
    { slug: 'viatris', instance: 1, site: 'External', name: 'Viatris' },
    { slug: 'villagevethospital.com', instance: 1, site: 'External', name: 'Villagevethospital.com' },
    { slug: 'virtualresearchgroup.com', instance: 1, site: 'External', name: 'Virtual Research Group' },
    { slug: 'vizient', instance: 1, site: 'External', name: 'Vizient' },
    { slug: 'vrtx', instance: 1, site: 'External', name: 'Vertex Pharmaceuticals' },
    { slug: 'vsp', instance: 1, site: 'External', name: 'VSP Vision' },
    { slug: 'walmart|wd5|non-workdayinternal', instance: 1, site: 'External', name: 'Walmart|wd5|non Workdayinternal' },
    { slug: 'walmart|wd5|walmartcanadaexternal', instance: 1, site: 'External', name: 'Walmart|wd5|walmartcanadaexternal' },
    { slug: 'walmart|wd5|walmartexternal', instance: 1, site: 'External', name: 'Walmart|wd5|walmartexternal' },
    { slug: 'washingtonavevet.com', instance: 1, site: 'External', name: 'Washingtonavevet.com' },
    { slug: 'washingtoncountyveterinary.com', instance: 1, site: 'External', name: 'Washingtoncountyveterinary.com' },
    { slug: 'washingtonfamilyvet.com', instance: 1, site: 'External', name: 'Washingtonfamilyvet.com' },
    { slug: 'washunursingcareers.com', instance: 1, site: 'External', name: 'Washunursingcareers.com' },
    { slug: 'westclermonthealthplex.com', instance: 1, site: 'External', name: 'West Clermont HealthPlex' },
    { slug: 'wholevets.com', instance: 1, site: 'External', name: 'Wholevets.com' },
    { slug: 'worldvision|wd1|worldvisioninternational', instance: 1, site: 'External', name: 'Worldvision|wd1|worldvisioninternational' },
    { slug: 'wvumedicine|wd1|uha', instance: 1, site: 'External', name: 'Wvumedicine|wd1|uha' },
    { slug: 'wvumedicine|wd1|wvuh', instance: 1, site: 'External', name: 'Wvumedicine|wd1|wvuh' },
    { slug: 'wyandotmemorial.org', instance: 1, site: 'External', name: 'Wyandotmemorial.org' },
    { slug: 'yosemitevet.com', instance: 1, site: 'External', name: 'Yosemitevet.com' },
    { slug: 'yourbeaconclinic.com', instance: 1, site: 'External', name: 'Beacon Clinic' },
    { slug: 'zealandpharma', instance: 1, site: 'External', name: 'Zealand Pharma' },
    { slug: 'zenithmarketing.com', instance: 1, site: 'External', name: 'Ash Brokerage' },
    { slug: 'zionvet.com', instance: 1, site: 'External', name: 'Zionvet.com' },
];

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch job description from the Workday job detail endpoint
 */
async function fetchJobDescription(company: WorkdayCompany, externalPath: string): Promise<string> {
    const url = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/wday/cxs/${company.slug}/${company.site}${externalPath}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return '';

        const data = await res.json();
        // Workday returns jobPostingInfo with jobDescription in HTML
        return data?.jobPostingInfo?.jobDescription || '';
    } catch {
        return '';
    }
}

/**
 * Search for PMHNP jobs on a specific Workday company site
 */
async function fetchCompanyJobs(company: WorkdayCompany): Promise<WorkdayJobRaw[]> {
    const baseUrl = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/wday/cxs/${company.slug}/${company.site}/jobs`;
    const applyBase = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/en-US/${company.site}`;

    // PMHNP search terms — cast a wide net, let isRelevantJob filter precisely
    const searchTerms = [
        'Psychiatric Nurse Practitioner',
        'PMHNP',
        'Psychiatric Mental Health',
        'Behavioral Health Nurse Practitioner',
        'Psychiatric APRN',
        'Psych NP',
    ];

    const allJobs: WorkdayJobRaw[] = [];
    const seenPaths = new Set<string>();

    for (const searchText of searchTerms) {
        let offset = 0;
        const limit = 20;
        let hasMore = true;

        while (hasMore) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);

                const res = await fetch(baseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        limit,
                        offset,
                        searchText,
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                if (!res.ok) {
                    console.warn(`[Workday] ${company.name}: HTTP ${res.status} for "${searchText}"`);
                    break;
                }

                const data: WorkdaySearchResponse = await res.json();
                const postings = data.jobPostings || [];
                const total = data.total || 0;

                if (postings.length === 0) break;

                for (const posting of postings) {
                    // Skip already seen (different search terms may find same job)
                    if (seenPaths.has(posting.externalPath)) continue;
                    seenPaths.add(posting.externalPath);

                    // Extract job ID from external path: /job/Title-Here/JR123456
                    const pathParts = posting.externalPath.split('/');
                    const jobId = pathParts[pathParts.length - 1] || posting.externalPath;

                    // Quick title pre-filter before fetching description
                    const titleLower = posting.title.toLowerCase();
                    const likelyPMHNP = titleLower.includes('pmhnp') ||
                        titleLower.includes('psychiatric') ||
                        titleLower.includes('psych') ||
                        titleLower.includes('mental health') ||
                        titleLower.includes('behavioral health') ||
                        titleLower.includes('nurse practitioner');

                    if (!likelyPMHNP) continue;

                    // Fetch the full job description
                    const description = await fetchJobDescription(company, posting.externalPath);
                    await sleep(200); // Be polite

                    // Final relevance filter
                    if (!isRelevantJob(posting.title, description)) continue;

                    allJobs.push({
                        externalId: `workday-${company.slug}-${jobId}`,
                        title: posting.title,
                        company: company.name,
                        location: posting.locationsText || 'United States',
                        description,
                        applyLink: `${applyBase}${posting.externalPath}`,
                        postedDate: posting.postedOn || undefined,
                    });
                }

                offset += limit;
                hasMore = offset < total && postings.length === limit;

                // Rate limiting between pages
                await sleep(300);
            } catch (error) {
                console.warn(`[Workday] ${company.name}: Error fetching "${searchText}" at offset ${offset}:`, error);
                break;
            }
        }

        // Rate limiting between search terms
        await sleep(500);
    }

    console.log(`[Workday] ${company.name}: ${allJobs.length} PMHNP jobs found (${seenPaths.size} total searched)`);
    return allJobs;
}

/**
 * Total number of chunks for Workday (501 companies / ~20 per chunk = 25)
 */
export const WORKDAY_TOTAL_CHUNKS = 25;
const WORKDAY_CHUNK_SIZE = Math.ceil(WORKDAY_COMPANIES.length / WORKDAY_TOTAL_CHUNKS);

/**
 * Fetch PMHNP jobs from Workday companies (supports chunked execution)
 * @param options.chunk - Chunk index (0-24). If omitted, processes all companies.
 */
export async function fetchWorkdayJobs(options?: { chunk?: number }): Promise<WorkdayJobRaw[]> {
    let companies = WORKDAY_COMPANIES;

    // Support chunked execution for Vercel cron timeout limits
    if (options?.chunk !== undefined) {
        const start = options.chunk * WORKDAY_CHUNK_SIZE;
        const end = start + WORKDAY_CHUNK_SIZE;
        companies = WORKDAY_COMPANIES.slice(start, end);
        console.log(`[Workday] Chunk ${options.chunk}/${WORKDAY_TOTAL_CHUNKS - 1}: Processing companies ${start + 1}-${Math.min(end, WORKDAY_COMPANIES.length)} of ${WORKDAY_COMPANIES.length}`);
    }

    console.log(`[Workday] Checking ${companies.length} Workday career sites for PMHNP jobs...`);

    const allJobs: WorkdayJobRaw[] = [];
    const failedCompanies: string[] = [];
    const BATCH_SIZE = 5;

    try {
        for (let i = 0; i < companies.length; i += BATCH_SIZE) {
            const batch = companies.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(company => fetchCompanyJobs(company))
            );

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    allJobs.push(...result.value);
                } else {
                    failedCompanies.push(batch[j].name);
                    console.error(`[Workday] Failed to fetch from ${batch[j].name}`);
                }
            }

            if (i + BATCH_SIZE < companies.length) {
                await sleep(300);
            }
        }

        console.log(`[Workday] Total PMHNP jobs fetched: ${allJobs.length}`);

        if (failedCompanies.length > 0) {
            console.log(`[Workday] Failed companies (${failedCompanies.length}): ${failedCompanies.join(', ')}`);
        }

        return allJobs;
    } catch (error) {
        console.error('[Workday] Error in main fetch:', error);
        return allJobs;
    }
}
