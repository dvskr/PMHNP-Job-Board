/**
 * Metro Landing Page Data
 *
 * Editorial content for the 10 top-performing metro areas by PMHNP job demand.
 * Each metro has unique, hand-curated content covering cost of living, licensure,
 * practice environment, and local context. This data powers the content-rich
 * landing pages at /jobs/metro/[slug].
 *
 * City selection criteria:
 * - GSC search volume & CTR for "pmhnp jobs [city]"
 * - Active job count on platform
 * - Geographic diversity
 * - State practice authority status
 *
 * TWO RULES THIS FILE LEARNED THE HARD WAY:
 *
 * 1. Practice authority is NOT editorial content here. It is derived from
 *    lib/state-practice-authority.ts (see METRO_CITIES below). Hand-typed
 *    labels had drifted on four of the ten metros: Columbus and Chicago said
 *    Full, Atlanta and Dallas said Reduced, while the table every state page,
 *    city page and /tools/practice-authority-map renders from said Reduced,
 *    Reduced, Restricted and Restricted. These metro answers ship as FAQPage
 *    JSON-LD, so the site was refuting itself in structured data one click
 *    apart. Prose in licensureNote and the FAQs must agree with the table too.
 *
 * 2. No hand-written salary figures. The site's published policy (see
 *    app/llms.txt/route.ts) is that every dollar figure is a median of
 *    advertised ranges from live postings, shipped with its sample size and
 *    withheld below the sample floor. The invented "the average is
 *    approximately $X" answers that used to live in the FAQs below could not
 *    be reproduced by that engine and disagreed with /salary-guide/{state}
 *    for the same state. Salary questions link to the live surface instead.
 */

import { getStatePracticeAuthority, type PracticeAuthority } from './state-practice-authority';

export interface MetroCity {
  slug: string;
  city: string;
  state: string;
  stateCode: string;
  stateSlug: string; // for linking to /jobs/state/[state]
  citySlug: string;  // for linking to /jobs/city/[slug]
  metroArea: string; // broader metro name for display
  population: string;
  practiceAuthority: 'Full' | 'Reduced' | 'Restricted';
  avgCostOfLiving: string; // relative to US average
  heroDescription: string;
  whyThisMetro: string[];
  costOfLivingNote: string;
  licensureNote: string;
  mentalHealthContext: string;
  topSettings: string[];
  faqs: { question: string; answer: string }[];
}

/** Everything an editor writes. The authority label is not theirs to write. */
type MetroCitySeed = Omit<MetroCity, 'practiceAuthority'>;

/** Table classification to the display casing the metro pages render. */
const AUTHORITY_LABEL: Record<PracticeAuthority, MetroCity['practiceAuthority']> = {
  full: 'Full',
  reduced: 'Reduced',
  restricted: 'Restricted',
};

const METRO_SEEDS: MetroCitySeed[] = [
  {
    slug: 'new-york-ny',
    city: 'New York',
    state: 'New York',
    stateCode: 'NY',
    stateSlug: 'new-york',
    citySlug: 'new-york-ny',
    metroArea: 'New York City Metro',
    population: '8.3M (city) / 20M+ (metro)',
    avgCostOfLiving: '37% above US average',
    heroDescription: 'The NYC metro is the largest PMHNP job market in the country, with major health systems, private practices, and telehealth companies actively hiring. High cost of living is offset by salaries that rank among the highest nationally.',
    whyThisMetro: [
      'One of the deepest PMHNP pay markets in the country: see the live New York median',
      'Dense network of academic medical centers (NYU, Columbia, Mount Sinai, Montefiore)',
      'Massive underserved population creating constant demand across all 5 boroughs',
      'Thriving private practice market with strong insurance reimbursement rates',
    ],
    costOfLivingNote: 'NYC cost of living is 37% above the national average. Manhattan is most expensive; Brooklyn, Queens, and NJ suburbs offer better value. Many employers offer housing stipends or loan repayment.',
    licensureNote: 'New York is a Reduced Practice Authority state: NPs must maintain a collaborative agreement with a physician for the first 3,600 hours. After that, PMHNPs can practice independently. The NY Board of Nursing processes licenses in 4-8 weeks.',
    mentalHealthContext: 'NYC has one of the highest rates of mental health need in the nation, with 1 in 5 adults reporting a mental illness. Post-pandemic demand has surged, particularly for anxiety, depression, and substance use disorders. The city\'s diverse population requires culturally competent psychiatric care.',
    topSettings: ['Outpatient clinics', 'Community mental health centers', 'Private practice', 'Telehealth', 'Academic medical centers', 'Inpatient psychiatry'],
    faqs: [
      { question: 'What is the average PMHNP salary in New York City?', answer: 'We do not publish a hand-written average. Every pay figure on this site is a median of the salary ranges that live postings actually disclose, shipped with the number of postings behind it, so the current New York figure lives at pmhnphiring.com/salary-guide/new-york rather than in this answer. Pay varies by setting: hospital-based roles often advertise a lower base than private practice but include broader benefits.' },
      { question: 'Does New York have full practice authority for PMHNPs?', answer: 'New York has Reduced Practice Authority. New PMHNPs must maintain a collaborative agreement with a physician for their first 3,600 practice hours (roughly 2 years full-time). After completing this requirement, PMHNPs can practice independently without physician oversight.' },
      { question: 'What are the best neighborhoods for PMHNP jobs in NYC?', answer: 'PMHNP positions are available across all boroughs. Manhattan has the highest concentration of hospital-based roles. The Bronx and Brooklyn have significant community mental health center opportunities with loan repayment eligibility. Queens offers diverse patient populations. Many PMHNPs live in NJ or CT suburbs and commute or work remotely via telehealth.' },
    ],
  },
  {
    slug: 'los-angeles-ca',
    city: 'Los Angeles',
    state: 'California',
    stateCode: 'CA',
    stateSlug: 'california',
    citySlug: 'los-angeles-ca',
    metroArea: 'Greater Los Angeles',
    population: '3.9M (city) / 13M+ (metro)',
    avgCostOfLiving: '43% above US average',
    heroDescription: 'Los Angeles is one of the highest-paying PMHNP markets in the country. Despite California\'s restricted practice laws, the massive population and severe mental health provider shortage create abundant opportunities across every setting.',
    whyThisMetro: [
      'One of the strongest advertised-pay markets nationally: see the live California median',
      'Severe psychiatrist shortage creates heavy PMHNP reliance, especially in underserved areas',
      'Year-round pleasant climate and diverse cultural landscape',
      'Kaiser Permanente, Cedars-Sinai, UCLA, and major health systems actively recruiting',
    ],
    costOfLivingNote: 'LA is 43% above the national average for cost of living, driven primarily by housing. Many PMHNPs offset costs by living in suburbs like Pasadena, Long Beach, or the Inland Empire while working in central LA or via telehealth. California\'s high salaries help balance the premium.',
    licensureNote: 'California has Restricted Practice Authority: PMHNPs must practice under standardized procedures with physician oversight. However, legislation is actively being pursued to expand NP autonomy. The BRN processes applications in 8-12 weeks. DEA registration is required for prescribing.',
    mentalHealthContext: 'LA County has over 10 million residents but a severe shortage of mental health providers. Homelessness, substance use, and trauma are significant drivers of psychiatric need. The county\'s Mental Health Services Act (MHSA) funds extensive community programs that employ PMHNPs.',
    topSettings: ['Community mental health centers', 'Outpatient clinics', 'Telehealth', 'Correctional facilities', 'VA medical centers', 'Private group practices'],
    faqs: [
      { question: 'What is the average PMHNP salary in Los Angeles?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current California figure lives at pmhnphiring.com/salary-guide/california. Kaiser Permanente and the academic medical centers compete on benefits as much as base pay, and private practice and telehealth roles price differently again.' },
      { question: 'Can PMHNPs practice independently in California?', answer: 'Currently, California has Restricted Practice Authority, meaning PMHNPs must work under standardized procedures with a physician. However, there is active legislation to expand NP practice authority. Many employers handle the collaborative arrangement, so it doesn\'t significantly limit job opportunities.' },
      { question: 'What areas of LA have the most PMHNP jobs?', answer: 'PMHNP jobs are spread across LA County. Downtown LA, Hollywood, and the Westside have concentrated hospital-based roles. South LA, East LA, and the San Fernando Valley have significant community mental health opportunities with federal loan repayment. The Inland Empire (Riverside, San Bernardino) has growing demand with lower cost of living.' },
    ],
  },
  {
    slug: 'jacksonville-fl',
    city: 'Jacksonville',
    state: 'Florida',
    stateCode: 'FL',
    stateSlug: 'florida',
    citySlug: 'jacksonville-fl',
    metroArea: 'Jacksonville Metro',
    population: '950K (city) / 1.6M+ (metro)',
    avgCostOfLiving: '3% below US average',
    heroDescription: 'Jacksonville is a fast-growing PMHNP market with below-average cost of living and strong healthcare infrastructure. Multiple major hospital systems and a booming telehealth sector make it one of the best emerging markets for psychiatric NPs.',
    whyThisMetro: [
      'Cost of living is 3% below the national average, so your salary goes further',
      'No state income tax in Florida: a 6-9% instant salary boost vs. most states',
      'Rapidly growing population creating sustained mental health demand',
      'Major employers: Baptist Health, Mayo Clinic Jacksonville, UF Health, Ascension St. Vincent\'s',
    ],
    costOfLivingNote: 'Jacksonville\'s cost of living sits 3% below the national average, making it one of the most affordable major metros for PMHNPs. Housing is particularly attractive: median home prices are roughly half of coastal California or the Northeast. Combined with Florida\'s zero state income tax, effective take-home pay is significantly higher than nominal salary suggests.',
    // Florida's 2020 autonomous-practice registration has eligibility rules
    // narrower than the APRN license itself. Asserting that a psychiatric role
    // qualifies is a licensure statement to a clinician, so this points at the
    // board instead of answering for it.
    licensureNote: 'Florida has Restricted Practice Authority: PMHNPs practice under a supervisory protocol with a physician. Florida created a separate autonomous-practice registration for advanced practice registered nurses in 2020, but its eligibility rules are narrower than the license itself, so confirm with the Florida Board of Nursing whether a psychiatric role qualifies before counting on it. The Florida Board of Nursing processes licenses in 4-6 weeks.',
    mentalHealthContext: 'Florida has one of the highest rates of unmet mental health need in the US, with only 55% of adults with mental illness receiving treatment. Jacksonville\'s rapid population growth (particularly retirees and military families from Naval Station Mayport) is increasing demand for psychiatric services across all age groups.',
    topSettings: ['Outpatient clinics', 'Telehealth', 'Hospital systems', 'VA medical center', 'Private practice', 'Substance abuse treatment'],
    faqs: [
      { question: 'What is the average PMHNP salary in Jacksonville, FL?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Florida figure lives at pmhnphiring.com/salary-guide/florida. Whatever the nominal number, Florida has no state income tax and a below-average cost of living, so take-home goes further here than the same figure would in a coastal metro.' },
      { question: 'Does Florida have full practice authority for PMHNPs?', answer: 'No. Florida is a Restricted Practice Authority state: PMHNPs practice under a supervisory protocol with a physician. Florida did create a separate autonomous-practice registration for advanced practice registered nurses in 2020, but its eligibility rules are narrower than the license itself, so ask the Florida Board of Nursing directly whether a psychiatric role qualifies rather than assuming it does.' },
      { question: 'Is Jacksonville a good city for new grad PMHNPs?', answer: 'Yes. Jacksonville has multiple health systems with structured new-grad programs, including Baptist Health and UF Health. The VA medical center also hires new graduates. The city\'s growing population and relatively low competition compared to saturated markets make it an excellent launchpad for new PMHNP careers.' },
    ],
  },
  {
    slug: 'columbus-oh',
    city: 'Columbus',
    state: 'Ohio',
    stateCode: 'OH',
    stateSlug: 'ohio',
    citySlug: 'columbus-oh',
    metroArea: 'Columbus Metro',
    population: '905K (city) / 2.1M+ (metro)',
    avgCostOfLiving: '7% below US average',
    heroDescription: 'Columbus pairs a below-average cost of living with a robust healthcare ecosystem anchored by Ohio State University Wexner Medical Center. One of the best value markets for PMHNPs in the Midwest.',
    whyThisMetro: [
      'Employers routinely arrange the standard care agreement Ohio requires',
      'Cost of living is 7% below the national average',
      'Ohio State Wexner Medical Center, OhioHealth, and Nationwide Children\'s Hospital',
      'Growing tech sector driving population growth and mental health demand',
    ],
    costOfLivingNote: 'Columbus offers a cost of living 7% below average, with housing costs roughly 15% below the national median. The city\'s growing tech sector (Intel\'s new fab plant, Amazon HQ2 runner-up) is driving economic growth without the cost spikes seen in coastal cities. PMHNPs enjoy strong purchasing power here.',
    licensureNote: 'Ohio has Reduced Practice Authority: PMHNPs must hold a standard care arrangement with a collaborating physician. Most employers put that arrangement in place as part of onboarding, and it does not change day-to-day scope for an employed role. Ohio Board of Nursing processes applications in 2-4 weeks.',
    mentalHealthContext: 'Ohio has been heavily impacted by the opioid crisis, creating significant demand for psychiatric providers specializing in substance use disorders and co-occurring conditions. Columbus\'s growing and increasingly diverse population adds demand across the full spectrum of psychiatric care.',
    topSettings: ['Community mental health centers', 'Outpatient clinics', 'Academic medical centers', 'Private practice', 'Substance abuse treatment', 'Telehealth'],
    faqs: [
      { question: 'What is the average PMHNP salary in Columbus, OH?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Ohio figure lives at pmhnphiring.com/salary-guide/ohio. Ohio\'s cost of living runs below the national average, so a given figure stretches further here than in Boston or Seattle.' },
      { question: 'Does Ohio have full practice authority for PMHNPs?', answer: 'No. Ohio is a Reduced Practice Authority state: PMHNPs must maintain a standard care arrangement with a collaborating physician. The arrangement sets out scope and prescribing protocols. Employers typically handle it during onboarding, so it rarely affects day-to-day practice in an employed role, but it does mean you cannot open an independent practice without one.' },
      { question: 'What makes Columbus a good market for PMHNPs?', answer: 'Columbus combines a below-average cost of living with a growing population (fastest-growing major city in Ohio). The Ohio State Wexner Medical Center is one of the largest academic medical centers in the country, and the city\'s opioid crisis response has created significant demand for psychiatric providers.' },
    ],
  },
  {
    slug: 'tampa-fl',
    city: 'Tampa',
    state: 'Florida',
    stateCode: 'FL',
    stateSlug: 'florida',
    citySlug: 'tampa-fl',
    metroArea: 'Tampa Bay Area',
    population: '390K (city) / 3.2M+ (metro)',
    avgCostOfLiving: '2% above US average',
    heroDescription: 'The Tampa Bay metro is Florida\'s fastest-growing healthcare market, with major systems like BayCare, AdventHealth, and Tampa General Hospital actively recruiting PMHNPs. Zero state income tax and year-round warm weather make it a top relocation destination.',
    whyThisMetro: [
      'No state income tax, which effectively boosts take-home pay by 6-9%',
      'Tampa Bay area growing rapidly: 3.2M+ metro population and rising',
      'BayCare, AdventHealth, Tampa General, and Moffitt: world-class health systems',
      'Booming telehealth sector with companies like Talkiatry and Cerebral hiring here',
    ],
    costOfLivingNote: 'Tampa Bay\'s cost of living is only 2% above the national average, dramatically more affordable than Miami or South Florida. Housing in suburbs like Brandon, Wesley Chapel, and Riverview is particularly affordable. Combined with zero state income tax, PMHNPs in Tampa enjoy excellent value.',
    licensureNote: 'Florida has Restricted Practice Authority: PMHNPs practice under a supervisory protocol with a physician. Florida\'s 2020 autonomous-practice registration has eligibility rules narrower than the license itself, so check with the Florida Board of Nursing before assuming a psychiatric role qualifies. The Tampa Bay area has numerous physician collaborators available, which makes arranging supervision straightforward.',
    mentalHealthContext: 'Tampa Bay has seen significant population growth, particularly among retirees and military families (MacDill Air Force Base). This creates demand for geriatric psychiatry, PTSD treatment, and general psychiatric care. The area\'s substance use challenges add further demand.',
    topSettings: ['Outpatient clinics', 'Telehealth', 'Hospital systems', 'VA medical center', 'Senior living facilities', 'Private practice'],
    faqs: [
      { question: 'What is the average PMHNP salary in Tampa, FL?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Florida figure lives at pmhnphiring.com/salary-guide/florida. Florida charges no state income tax, so the same nominal figure takes home more here than it would in California or New York.' },
      { question: 'What is the job market like for PMHNPs in Tampa?', answer: 'The Tampa Bay PMHNP job market is strong and growing. Major employers include BayCare Health System, AdventHealth, Tampa General Hospital, and the James A. Haley VA Medical Center. The telehealth sector is also booming, with several national companies headquartered or operating heavily in the Tampa area.' },
      { question: 'Is Tampa a good city for PMHNPs relocating from out of state?', answer: 'Tampa is one of the top relocation destinations for PMHNPs. Zero state income tax, affordable cost of living, year-round warm weather, and abundant job opportunities make it extremely attractive. Florida Board of Nursing processes out-of-state license endorsements in 4-6 weeks.' },
    ],
  },
  {
    slug: 'phoenix-az',
    city: 'Phoenix',
    state: 'Arizona',
    stateCode: 'AZ',
    stateSlug: 'arizona',
    citySlug: 'phoenix-az',
    metroArea: 'Phoenix Metro (Valley of the Sun)',
    population: '1.6M (city) / 4.9M+ (metro)',
    avgCostOfLiving: '3% above US average',
    heroDescription: 'Phoenix is one of the fastest-growing PMHNP markets in the country, with Full Practice Authority and rapidly expanding healthcare infrastructure. Arizona\'s NP workforce is growing faster than any other state, driven by massive population influx and critical mental health provider shortages.',
    whyThisMetro: [
      'Full Practice Authority: independent prescribing and practice from day one',
      'Arizona has the fastest-growing NP workforce in the nation',
      'Banner Health, Dignity Health, and HonorHealth: major systems aggressively hiring',
      'Massive population growth (5th largest US city) outpacing provider supply',
    ],
    costOfLivingNote: 'Phoenix\'s cost of living is only 3% above the national average, making it remarkably affordable for a major metro. Housing is significantly cheaper than California (where many Phoenix transplants originate). No state income tax on retirement income adds appeal for semi-retired practitioners.',
    licensureNote: 'Arizona has Full Practice Authority for PMHNPs: no physician supervision or collaborative agreement needed. PMHNPs can prescribe controlled substances independently and open their own practices. Arizona Board of Nursing is one of the fastest processors in the country (2-3 weeks).',
    mentalHealthContext: 'Arizona faces a critical mental health workforce shortage: the state has only 65% of the psychiatrists needed. The rapid population growth (primarily from California, Illinois, and the Midwest) is creating demand that far outpaces supply. Rural areas surrounding Phoenix metro have Health Professional Shortage Area (HPSA) designations with loan repayment eligibility.',
    topSettings: ['Outpatient clinics', 'Telehealth', 'Community mental health', 'VA medical centers', 'Private practice', 'Integrated behavioral health'],
    faqs: [
      { question: 'What is the average PMHNP salary in Phoenix, AZ?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Arizona figure lives at pmhnphiring.com/salary-guide/arizona. What Phoenix adds beyond the headline number is a near-average cost of living and Full Practice Authority, which opens independent and telehealth practice.' },
      { question: 'Does Arizona have full practice authority for PMHNPs?', answer: 'Yes. Arizona provides Full Practice Authority for all nurse practitioners. PMHNPs can practice independently, prescribe schedule II-V controlled substances, and open their own practices without physician oversight. Arizona is one of the most NP-friendly states in the country.' },
      { question: 'What are the best employers for PMHNPs in Phoenix?', answer: 'Top employers include Banner Health (Arizona\'s largest health system), Dignity Health/CommonSpirit, HonorHealth, Valleywise Health (county safety net), and the Phoenix VA Health Care System. National telehealth companies like Talkiatry and Cerebral also have strong presence. Private practice opportunities are abundant due to Full Practice Authority.' },
    ],
  },
  {
    slug: 'dallas-tx',
    city: 'Dallas',
    state: 'Texas',
    stateCode: 'TX',
    stateSlug: 'texas',
    citySlug: 'dallas-tx',
    metroArea: 'Dallas-Fort Worth Metroplex',
    population: '1.3M (city) / 7.6M+ (metro)',
    avgCostOfLiving: '2% below US average',
    heroDescription: 'The Dallas-Fort Worth metroplex is one of the largest and fastest-growing PMHNP markets in the South. No state income tax, below-average cost of living, and massive corporate healthcare presence make DFW an excellent market for both new and experienced psychiatric NPs.',
    whyThisMetro: [
      'No state income tax in Texas: an immediate 6-9% take-home pay boost',
      '7.6M+ metro population, the 4th largest in the US and growing rapidly',
      'UT Southwestern, Baylor Scott & White, and Parkland: top academic and community systems',
      'Strong private practice market with growing telehealth sector',
    ],
    costOfLivingNote: 'DFW cost of living sits 2% below the national average, with housing particularly affordable in suburbs like Frisco, McKinney, Plano, and Arlington. Combined with zero state income tax, the same salary takes home more in Dallas than in a coastal metro.',
    licensureNote: 'Texas has Restricted Practice Authority: PMHNPs practice under physician supervision through a written prescriptive authority agreement. Most employers arrange and maintain the agreement, so it rarely changes day-to-day work in an employed role. Texas Board of Nursing processes licenses in 4-6 weeks.',
    mentalHealthContext: 'Texas has one of the lowest ratios of mental health providers to residents in the country, creating massive demand. The DFW metroplex\'s rapid corporate growth (Toyota, Goldman Sachs, Charles Schwab HQs) is bringing in professionals who need mental health services. Rural areas surrounding DFW have critical shortages.',
    topSettings: ['Outpatient clinics', 'Private practice', 'Community mental health', 'Telehealth', 'Hospital systems', 'Correctional facilities'],
    faqs: [
      { question: 'What is the average PMHNP salary in Dallas, TX?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Texas figure lives at pmhnphiring.com/salary-guide/texas. Texas charges no state income tax, so a DFW PMHNP keeps more of the same nominal figure than a colleague in California or New York.' },
      { question: 'Does Texas have full practice authority for PMHNPs?', answer: 'No. Texas is a Restricted Practice Authority state: PMHNPs practice under physician supervision through a prescriptive authority agreement (PAA) that sets out scope and protocols. Most employers facilitate the agreement, so it rarely limits day-to-day practice in an employed role, but independent practice is not available on a Texas license alone.' },
      { question: 'Why is Dallas a top market for PMHNP jobs?', answer: 'DFW combines the 4th-largest US metro population with one of the worst mental health provider-to-patient ratios in the country. Add zero state income tax, below-average cost of living, and major health systems actively recruiting, and you get one of the strongest overall value propositions for PMHNPs anywhere in the US.' },
    ],
  },
  {
    slug: 'chicago-il',
    city: 'Chicago',
    state: 'Illinois',
    stateCode: 'IL',
    stateSlug: 'illinois',
    citySlug: 'chicago-il',
    metroArea: 'Chicagoland',
    population: '2.7M (city) / 9.5M+ (metro)',
    avgCostOfLiving: '7% above US average',
    heroDescription: 'Chicago offers a massive healthcare infrastructure and a deep pool of opportunities across academic medical centers, community health centers, and private practices. The Midwest\'s largest metro pairs that depth with more affordable living than the coastal markets.',
    whyThisMetro: [
      'Depth of employers, so the collaborative agreement Illinois requires is usually arranged for you',
      'World-class academic medical centers: Northwestern, Rush, UIC, Loyola',
      'Large underserved communities on the South and West sides with loan repayment eligibility',
      'More affordable than NYC, Boston, or LA while remaining a major pay market',
    ],
    costOfLivingNote: 'Chicago\'s cost of living is 7% above the national average, driven by housing in popular neighborhoods. Suburbs like Naperville, Schaumburg, and Oak Park offer significantly more affordable options. Compared to NYC (37% above) or LA (43% above), Chicago costs far less for a metro of its size.',
    licensureNote: 'Illinois has Reduced Practice Authority: PMHNPs practice under a written collaborative agreement with a physician. Employers in the Chicago systems normally set the agreement up during onboarding. Illinois Board of Nursing processes licenses in 4-6 weeks.',
    mentalHealthContext: 'Chicago faces significant mental health disparities, with South and West side communities having dramatically less access to psychiatric care than affluent areas. Gun violence trauma, substance use, and generational poverty create intense demand for psychiatric services. The city\'s large immigrant population also requires culturally competent mental health care.',
    topSettings: ['Community mental health centers', 'Academic medical centers', 'Outpatient clinics', 'Private practice', 'VA medical center', 'Telehealth'],
    faqs: [
      { question: 'What is the average PMHNP salary in Chicago?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Illinois figure lives at pmhnphiring.com/salary-guide/illinois. Academic medical centers tend to advertise a lower base than private practice while adding benefits and loan repayment.' },
      { question: 'Does Illinois have full practice authority for PMHNPs?', answer: 'No. Illinois is a Reduced Practice Authority state: PMHNPs practice under a written collaborative agreement with a physician. The agreement sets out scope and prescribing protocols, and most Chicago employers arrange it as part of onboarding.' },
      { question: 'What neighborhoods have the most PMHNP opportunities in Chicago?', answer: 'PMHNP jobs are concentrated in the Loop and River North (medical district), but the highest demand is on the South Side (communities like Roseland, Englewood, Chatham) and West Side (Austin, Lawndale) where mental health provider shortages are most severe. These areas often qualify for federal loan repayment programs.' },
    ],
  },
  {
    slug: 'seattle-wa',
    city: 'Seattle',
    state: 'Washington',
    stateCode: 'WA',
    stateSlug: 'washington',
    citySlug: 'seattle-wa',
    metroArea: 'Greater Seattle',
    population: '750K (city) / 4M+ (metro)',
    avgCostOfLiving: '49% above US average',
    heroDescription: 'Seattle offers some of the highest PMHNP salaries in the country, backed by Full Practice Authority and a progressive mental health landscape. The tech-driven economy creates unique psychiatric needs and willingness-to-pay, while state-level mental health crisis funding adds resources.',
    whyThisMetro: [
      'Among the strongest advertised-pay markets: see the live Washington median',
      'Full Practice Authority: independent prescribing from day one',
      'Washington state leads in mental health crisis funding and program support',
      'Tech-sector workforce creating demand for anxiety, burnout, and ADHD treatment',
    ],
    costOfLivingNote: 'Seattle is 49% above the national average, primarily due to housing. However, Washington has no state income tax, which offsets roughly 6-9% of the cost premium. Many PMHNPs work in Seattle but live in more affordable areas like Tacoma, Everett, or Olympia. Telehealth positions eliminate the commute entirely.',
    licensureNote: 'Washington has Full Practice Authority for PMHNPs: no physician supervision or collaborative agreement needed. PMHNPs can prescribe all controlled substances and practice independently. Washington also has robust mental health parity laws ensuring good insurance reimbursement.',
    mentalHealthContext: 'Seattle\'s booming tech industry has created a population with high rates of anxiety, burnout, and ADHD. The city also faces significant homelessness and substance use challenges. Washington state has invested heavily in mental health crisis response, creating funded positions throughout the region.',
    topSettings: ['Tech-company partnered clinics', 'Private practice', 'Telehealth', 'Community mental health', 'Hospital systems', 'Substance abuse treatment'],
    faqs: [
      { question: 'What is the average PMHNP salary in Seattle, WA?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Washington figure lives at pmhnphiring.com/salary-guide/washington. Washington charges no state income tax, which offsets part of Seattle\'s cost-of-living premium.' },
      { question: 'Does Washington have full practice authority for PMHNPs?', answer: 'Yes. Washington provides Full Practice Authority for all nurse practitioners. PMHNPs can practice independently, prescribe schedule II-V controlled substances, and establish their own practices. The state also has strong mental health parity laws ensuring fair insurance reimbursement for psychiatric services.' },
      { question: 'What makes Seattle unique for PMHNP careers?', answer: 'Seattle\'s tech industry creates a unique patient population with high rates of anxiety, burnout, and ADHD. Companies like Amazon, Microsoft, and Meta have employee assistance programs that frequently refer to psychiatric providers. This creates a population with good insurance coverage and willingness to engage in mental health treatment, ideal for private practice PMHNPs.' },
    ],
  },
  {
    slug: 'atlanta-ga',
    city: 'Atlanta',
    state: 'Georgia',
    stateCode: 'GA',
    stateSlug: 'georgia',
    citySlug: 'atlanta-ga',
    metroArea: 'Metro Atlanta',
    population: '500K (city) / 6.1M+ (metro)',
    avgCostOfLiving: '3% above US average',
    heroDescription: 'Atlanta is the Southeast\'s largest healthcare hub, home to the CDC, Emory University, and a massive network of health systems. The 6.1M+ metro population, combined with significant mental health access gaps in surrounding areas, creates strong and sustained PMHNP demand.',
    whyThisMetro: [
      'Southeast\'s largest healthcare market with world-class institutions',
      'Emory University, Grady Health, WellStar, and Piedmont: major employers',
      'Growing metro population (6.1M+) with significant underserved communities',
      'Cost of living only 3% above average: excellent value for the Southeast',
    ],
    costOfLivingNote: 'Atlanta\'s cost of living is only 3% above the national average, dramatically more affordable than other major metros of similar size. Suburbs like Marietta, Decatur, Alpharetta, and Kennesaw offer excellent value. Georgia has a moderate state income tax (5.49% flat rate as of 2024).',
    licensureNote: 'Georgia has Restricted Practice Authority: PMHNPs practice under physician supervision through a protocol agreement. Georgia Board of Nursing processes licenses in 4-8 weeks. Georgia is in the Nurse Licensure Compact (NLC).',
    mentalHealthContext: 'Georgia ranks among the bottom 10 states for mental health workforce adequacy. Atlanta\'s underserved communities, particularly South Atlanta and surrounding rural counties, have critical psychiatric provider shortages. The city\'s large refugee and immigrant population adds cultural competency requirements to mental health care.',
    topSettings: ['Community mental health centers', 'Hospital systems', 'Outpatient clinics', 'Telehealth', 'VA medical center', 'Private practice'],
    faqs: [
      { question: 'What is the average PMHNP salary in Atlanta, GA?', answer: 'We do not publish a hand-written average. Pay figures on this site are medians of the salary ranges live postings disclose, published with their sample size, so the current Georgia figure lives at pmhnphiring.com/salary-guide/georgia. Atlanta\'s cost of living sits close to the national average, and community mental health roles here often carry federal loan repayment eligibility.' },
      { question: 'Does Georgia have full practice authority for PMHNPs?', answer: 'No. Georgia is a Restricted Practice Authority state: PMHNPs practice under physician supervision through a protocol agreement that sets out scope and prescribing guidelines. Most employers facilitate the arrangement. Georgia is part of the Nurse Licensure Compact, which makes it easier for multi-state licensees to start practicing.' },
      { question: 'Is Atlanta a good city for PMHNPs starting their career?', answer: 'Yes. Atlanta\'s large healthcare ecosystem, anchored by Emory University and Grady Health System, provides excellent mentorship and training opportunities. The VA Atlanta Healthcare System also hires new graduates. The cost of living is very manageable on a new-grad PMHNP salary, and the growing metro area ensures long-term career stability.' },
    ],
  },
];

/**
 * The exported metros, with practice authority read off the state table
 * rather than typed alongside the editorial copy. A metro whose state is not
 * in that table is a typo in `state`, and failing the build is the right
 * outcome: a silent fallback is how the labels drifted in the first place.
 */
export const METRO_CITIES: MetroCity[] = METRO_SEEDS.map((seed) => {
  const info = getStatePracticeAuthority(seed.state);
  if (!info) {
    throw new Error(
      `metro-data: "${seed.state}" (metro ${seed.slug}) has no row in STATE_PRACTICE_AUTHORITY`,
    );
  }
  return { ...seed, practiceAuthority: AUTHORITY_LABEL[info.authority] };
});

/** Lookup a metro city by slug */
export function getMetroCity(slug: string): MetroCity | undefined {
  return METRO_CITIES.find(m => m.slug === slug);
}

/** Get all metro slugs for static generation */
export function getAllMetroSlugs(): string[] {
  return METRO_CITIES.map(m => m.slug);
}

/**
 * Live-jobs where-clause for one metro (B4, organic audit 2026-08).
 *
 * Single source of truth shared by the metro page's stats queries
 * (app/jobs/metro/[slug]/page.tsx) AND the sitemap's metro gate
 * (app/sitemap.ts), so the page count and the sitemap eligibility can
 * never disagree. Adjacent-city expansions mirror what the metro pages
 * have always matched.
 *
 * Type-only Prisma import — this module stays edge-safe (plain data).
 */
export function buildMetroJobsWhere(metro: MetroCity): import('@prisma/client').Prisma.JobWhereInput {
  const city = metro.city;
  return {
    isPublished: true,
    OR: [
      { city: { contains: city, mode: 'insensitive' as const } },
      // Metro-area adjacent cities
      ...(city === 'New York' ? [{ city: { contains: 'Brooklyn', mode: 'insensitive' as const } }, { city: { contains: 'Queens', mode: 'insensitive' as const } }, { city: { contains: 'Bronx', mode: 'insensitive' as const } }] : []),
      ...(city === 'Tampa' ? [{ city: { contains: 'St. Petersburg', mode: 'insensitive' as const } }, { city: { contains: 'Clearwater', mode: 'insensitive' as const } }] : []),
      ...(city === 'Dallas' ? [{ city: { contains: 'Fort Worth', mode: 'insensitive' as const } }, { city: { contains: 'Plano', mode: 'insensitive' as const } }, { city: { contains: 'Arlington', mode: 'insensitive' as const } }] : []),
    ],
    stateCode: { equals: metro.stateCode, mode: 'insensitive' as const },
  };
}
