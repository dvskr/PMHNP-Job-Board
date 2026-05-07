/**
 * Workday tenant config — career-site coordinates per employer.
 *
 * Extracted 2026-05-05 from lib/aggregators/workday.ts so the adapter
 * can stay focused on fetch logic. Edit this file to add or remove a
 * tenant.
 *
 * Each Workday tenant is identified by 3 fields, all required:
 *   slug:     subdomain prefix
 *   instance: numeric WD instance (1, 5, 12, 108, 503, …)
 *   site:     career-site path segment after `/wday/cxs/{slug}/`
 *
 * Endpoint shape:
 *   https://{slug}.wd{instance}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs
 */

export interface WorkdayTenant {
    slug: string;
    instance: number;
    site: string;
    name: string;
}

// AUDIT 2026-02-20: removed 28 dead slugs (HTTP 404/422/500)
// REMOVED 2026-03-11 — Dead (HTTP 422): HCA, CommonSpirit, Kaiser, UHS,
// Acadia, Wellpath, Telecare, Providence, Ascension, Tenet
export const WORKDAY_TENANTS: readonly WorkdayTenant[] = [
    // === ORIGINAL (pre-2026-02-16) ===
    { slug: 'trinityhealth', instance: 1, site: 'jobs', name: 'Trinity Health' },
    { slug: 'memorialhermann', instance: 5, site: 'External', name: 'Memorial Hermann' },
    { slug: 'sharp', instance: 1, site: 'External', name: 'Sharp HealthCare' },
    { slug: 'lifestance', instance: 5, site: 'Careers', name: 'LifeStance Health' },
    { slug: 'chghealthcare', instance: 1, site: 'External', name: 'CHG Healthcare' },

    // === ATS Discovery Script ===
    { slug: 'aah', instance: 5, site: 'External', name: 'Advocate Health' },
    { slug: 'ms', instance: 5, site: 'External', name: 'Mount Sinai' },
    { slug: 'carbonhealth', instance: 1, site: 'Careers', name: 'Carbon Health' },
    { slug: 'mc', instance: 1, site: 'External', name: 'Mayo Clinic' },

    // === Verified Hospitals & Health Systems ===
    { slug: 'adventhealth', instance: 12, site: 'AH_External_Career_Site', name: 'AdventHealth' },
    { slug: 'archildrens', instance: 1, site: 'External_Career_Site', name: "Arkansas Children's" },
    { slug: 'bannerhealth', instance: 108, site: 'Careers', name: 'Banner Health' },
    { slug: 'baptistfirst', instance: 12, site: 'baptistfirst', name: 'Baptist Health (AL)' },
    { slug: 'bhs', instance: 1, site: 'careers', name: 'Baptist Health (KY)' },
    { slug: 'easyservice', instance: 5, site: 'MercyHealthCareers', name: 'Bon Secours Mercy Health' },
    { slug: 'bronsonhg', instance: 1, site: 'newhires', name: 'Bronson Healthcare' },
    { slug: 'carilionclinic', instance: 12, site: 'External_Careers', name: 'Carilion Clinic' },
    { slug: 'chaptershealth', instance: 5, site: 'jobs', name: 'Chapters Health System' },
    { slug: 'cincinnatichildrens', instance: 5, site: 'careersatcincinnatichildrens', name: "Cincinnati Children's" },
    { slug: 'ccf', instance: 1, site: 'ClevelandClinicCareers', name: 'Cleveland Clinic' },
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
    { slug: 'uvmhealth', instance: 1, site: 'CVPH', name: 'UVM Health Network' },
    { slug: 'vumc', instance: 1, site: 'vumccareers', name: 'Vanderbilt UMC' },

    // === Health Insurance ===
    { slug: 'elevancehealth', instance: 1, site: 'ANT', name: 'Elevance Health (Anthem)' },
    { slug: 'cigna', instance: 5, site: 'cignacareers', name: 'Cigna' },
    { slug: 'humana', instance: 5, site: 'Humana_External_Career_Site', name: 'Humana' },
    { slug: 'centene', instance: 5, site: 'Centene_External', name: 'Centene' },
    { slug: 'cvshealth', instance: 1, site: 'CVS_Health_Careers', name: 'CVS Health' },
    { slug: 'highmarkhealth', instance: 1, site: 'highmark', name: 'Highmark Health' },

    // === Healthcare IT ===
    { slug: 'teladoc', instance: 503, site: 'teladochealth_is_hiring', name: 'Teladoc Health' },
    { slug: 'athenahealth', instance: 1, site: 'External', name: 'athenahealth' },

    // === Additional verified systems ===
    { slug: 'essentiahealth', instance: 1, site: 'essentia_health', name: 'Essentia Health' },
    { slug: 'solutionhealth', instance: 1, site: 'careers', name: 'Solution Health' },
    { slug: 'gundersenhealth', instance: 5, site: 'gundersen', name: 'Gundersen Health' },
    { slug: 'verawholehealth', instance: 1, site: 'External', name: 'Vera Whole Health' },
    { slug: 'bozemanhealth', instance: 1, site: 'bozemanhealthcareers', name: 'Bozeman Health' },
    { slug: 'hollandhospital', instance: 1, site: 'external', name: 'Holland Hospital' },
    { slug: 'marshfieldclinichealthsystems', instance: 5, site: 'external', name: 'Marshfield Clinic Health System' },
    { slug: 'adventisthealthcare', instance: 1, site: 'adventisthealthcarecareers', name: 'Adventist HealthCare' },
    { slug: 'agilonhealth', instance: 1, site: 'external', name: 'Agilon Health' },
    { slug: 'cambiahealth', instance: 1, site: 'external', name: 'Cambia Health Solutions' },
    { slug: 'caresource', instance: 1, site: 'caresource', name: 'CareSource' },
    { slug: 'crossoverhealth', instance: 1, site: 'careers', name: 'Crossover Health' },
    { slug: 'devoted', instance: 1, site: 'devoted', name: 'Devoted Health' },
    { slug: 'evolent', instance: 1, site: 'External', name: 'Evolent Health' },
    { slug: 'sharecare', instance: 1, site: 'sharecare_careers', name: 'Sharecare' },
    { slug: 'tuftsmedicine', instance: 1, site: 'jobs', name: 'Tufts Medicine' },
    { slug: 'umchealthsystem', instance: 1, site: 'External', name: 'UMC Health System (Lubbock)' },

    // === ADDED 2026-02-19 — ats-jobs-db API discovery ===
    { slug: 'geodehealth', instance: 1, site: 'geode', name: 'Geode Health' },
    { slug: 'lmh', instance: 1, site: 'lmhjobs', name: 'LMH Health' },
    { slug: 'mainegeneral', instance: 5, site: 'mainegeneralcareers', name: 'MaineGeneral Health' },
    { slug: 'monarch', instance: 5, site: 'monarch', name: 'Monarch' },
    { slug: 'bmc', instance: 1, site: 'bmc', name: 'Boston Medical Center' },
    { slug: 'brownhealth', instance: 12, site: 'External_Careers', name: 'Brown Medicine' },
    { slug: 'centerstone', instance: 5, site: 'centerstonecareers', name: 'Centerstone' },
    { slug: 'meharrymedicalcollege', instance: 12, site: 'External', name: 'Meharry Medical College' },
    { slug: 'seamar', instance: 12, site: 'sea_mar', name: 'Sea Mar Community Health Centers' },

    // === ADDED 2026-02-20 — Production DB apply_link mining ===
    { slug: 'rogersbh', instance: 1, site: 'RBHCareer', name: 'Rogers Behavioral Health' },
    { slug: 'tamus', instance: 1, site: 'TAMU_External', name: 'Texas A&M Health' },
    { slug: 'saintlukes', instance: 1, site: 'saintlukeshealthcareers', name: "Saint Luke's Health System" },
    { slug: 'brightli', instance: 5, site: 'BrightliTalent', name: 'Brightli' },
    { slug: 'thriveworks', instance: 5, site: 'Thriveworks', name: 'Thriveworks' },

    // === ADDED 2026-03-11 — Mined from ats-jobs-db apply links in production DB ===
    { slug: 'benefis', instance: 1, site: 'BHS', name: 'Benefis Health System' },
];
