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
 */

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

export const METRO_CITIES: MetroCity[] = [
  {
    slug: 'new-york-ny',
    city: 'New York',
    state: 'New York',
    stateCode: 'NY',
    stateSlug: 'new-york',
    citySlug: 'new-york-ny',
    metroArea: 'New York City Metro',
    population: '8.3M (city) / 20M+ (metro)',
    practiceAuthority: 'Reduced',
    avgCostOfLiving: '37% above US average',
    heroDescription: 'The NYC metro is the largest PMHNP job market in the country, with major health systems, private practices, and telehealth companies actively hiring. High cost of living is offset by salaries that rank among the highest nationally.',
    whyThisMetro: [
      'Highest PMHNP salaries in the US â€” $160Kâ€“$220K+ for experienced practitioners',
      'Dense network of academic medical centers (NYU, Columbia, Mount Sinai, Montefiore)',
      'Massive underserved population creating constant demand across all 5 boroughs',
      'Thriving private practice market with strong insurance reimbursement rates',
    ],
    costOfLivingNote: 'NYC cost of living is 37% above the national average, but PMHNP salaries here are 25-40% higher than most markets. Manhattan is most expensive; Brooklyn, Queens, and NJ suburbs offer better value. Many employers offer housing stipends or loan repayment.',
    licensureNote: 'New York is a Reduced Practice Authority state â€” NPs must maintain a collaborative agreement with a physician for the first 3,600 hours. After that, PMHNPs can practice independently. The NY Board of Nursing processes licenses in 4-8 weeks.',
    mentalHealthContext: 'NYC has one of the highest rates of mental health need in the nation, with 1 in 5 adults reporting a mental illness. Post-pandemic demand has surged, particularly for anxiety, depression, and substance use disorders. The city\'s diverse population requires culturally competent psychiatric care.',
    topSettings: ['Outpatient clinics', 'Community mental health centers', 'Private practice', 'Telehealth', 'Academic medical centers', 'Inpatient psychiatry'],
    faqs: [
      { question: 'What is the average PMHNP salary in New York City?', answer: 'PMHNPs in NYC earn $160,000â€“$220,000+ annually, with experienced practitioners in private practice potentially earning more. The average is approximately $175,000, which is 25-40% above the national average. Salaries vary by setting â€” hospital-based roles tend to offer slightly less base pay but include comprehensive benefits.' },
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
    practiceAuthority: 'Restricted',
    avgCostOfLiving: '43% above US average',
    heroDescription: 'Los Angeles is one of the highest-paying PMHNP markets in the country. Despite California\'s restricted practice laws, the massive population and severe mental health provider shortage create abundant opportunities across every setting.',
    whyThisMetro: [
      'California PMHNPs earn $150Kâ€“$200K+ â€” among the highest nationally',
      'Severe psychiatrist shortage creates heavy PMHNP reliance, especially in underserved areas',
      'Year-round pleasant climate and diverse cultural landscape',
      'Kaiser Permanente, Cedars-Sinai, UCLA, and major health systems actively recruiting',
    ],
    costOfLivingNote: 'LA is 43% above the national average for cost of living, driven primarily by housing. Many PMHNPs offset costs by living in suburbs like Pasadena, Long Beach, or the Inland Empire while working in central LA or via telehealth. California\'s high salaries help balance the premium.',
    licensureNote: 'California has Restricted Practice Authority â€” PMHNPs must practice under standardized procedures with physician oversight. However, legislation is actively being pursued to expand NP autonomy. The BRN processes applications in 8-12 weeks. DEA registration is required for prescribing.',
    mentalHealthContext: 'LA County has over 10 million residents but a severe shortage of mental health providers. Homelessness, substance use, and trauma are significant drivers of psychiatric need. The county\'s Mental Health Services Act (MHSA) funds extensive community programs that employ PMHNPs.',
    topSettings: ['Community mental health centers', 'Outpatient clinics', 'Telehealth', 'Correctional facilities', 'VA medical centers', 'Private group practices'],
    faqs: [
      { question: 'What is the average PMHNP salary in Los Angeles?', answer: 'PMHNPs in Los Angeles earn $150,000â€“$200,000+ annually. The average is approximately $170,000. Kaiser Permanente and academic medical centers offer competitive salaries plus excellent benefits. Private practice and telehealth roles can exceed $200K for experienced practitioners.' },
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
    practiceAuthority: 'Restricted',
    avgCostOfLiving: '3% below US average',
    heroDescription: 'Jacksonville is a fast-growing PMHNP market with below-average cost of living and strong healthcare infrastructure. Multiple major hospital systems and a booming telehealth sector make it one of the best emerging markets for psychiatric NPs.',
    whyThisMetro: [
      'Cost of living is 3% below the national average â€” your salary goes further',
      'No state income tax in Florida â€” 6-9% instant salary boost vs. most states',
      'Rapidly growing population creating sustained mental health demand',
      'Major employers: Baptist Health, Mayo Clinic Jacksonville, UF Health, Ascension St. Vincent\'s',
    ],
    costOfLivingNote: 'Jacksonville\'s cost of living sits 3% below the national average, making it one of the most affordable major metros for PMHNPs. Housing is particularly attractive â€” median home prices are roughly half of coastal California or the Northeast. Combined with Florida\'s zero state income tax, effective take-home pay is significantly higher than nominal salary suggests.',
    licensureNote: 'Florida has Restricted Practice Authority â€” PMHNPs must have a supervisory relationship with a physician. However, Florida passed legislation in 2020 allowing autonomous practice for NPs with 3,000+ supervised hours in the past 5 years. The Florida Board of Nursing processes licenses in 4-6 weeks.',
    mentalHealthContext: 'Florida has one of the highest rates of unmet mental health need in the US, with only 55% of adults with mental illness receiving treatment. Jacksonville\'s rapid population growth (particularly retirees and military families from Naval Station Mayport) is increasing demand for psychiatric services across all age groups.',
    topSettings: ['Outpatient clinics', 'Telehealth', 'Hospital systems', 'VA medical center', 'Private practice', 'Substance abuse treatment'],
    faqs: [
      { question: 'What is the average PMHNP salary in Jacksonville, FL?', answer: 'PMHNPs in Jacksonville earn $130,000â€“$170,000 annually. The average is approximately $148,000. When adjusted for Florida\'s zero state income tax and below-average cost of living, effective purchasing power is comparable to earning $175K+ in high-cost cities like NYC or LA.' },
      { question: 'Does Florida have full practice authority for PMHNPs?', answer: 'Florida recently expanded NP practice authority. PMHNPs with 3,000+ supervised clinical hours within the past 5 years can practice autonomously. New graduates start under physician supervision but can transition to independent practice within approximately 2 years.' },
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
    practiceAuthority: 'Full',
    avgCostOfLiving: '7% below US average',
    heroDescription: 'Columbus offers the rare combination of Full Practice Authority, below-average cost of living, and a robust healthcare ecosystem anchored by Ohio State University Wexner Medical Center. One of the best value markets for PMHNPs in the Midwest.',
    whyThisMetro: [
      'Full Practice Authority â€” PMHNPs can practice independently from day one',
      'Cost of living is 7% below the national average with strong salary growth',
      'Ohio State Wexner Medical Center, OhioHealth, and Nationwide Children\'s Hospital',
      'Growing tech sector driving population growth and mental health demand',
    ],
    costOfLivingNote: 'Columbus offers 7% below average cost of living with housing costs roughly 15% below national median. The city\'s growing tech sector (Intel\'s new fab plant, Amazon HQ2 runner-up) is driving economic growth without the cost spikes seen in coastal cities. PMHNPs enjoy strong purchasing power here.',
    licensureNote: 'Ohio has Full Practice Authority for PMHNPs â€” no physician supervision or collaborative agreement required. This means you can practice independently, prescribe controlled substances, and even open your own practice immediately after licensure. Ohio Board of Nursing processes applications in 2-4 weeks.',
    mentalHealthContext: 'Ohio has been heavily impacted by the opioid crisis, creating significant demand for psychiatric providers specializing in substance use disorders and co-occurring conditions. Columbus\'s growing and increasingly diverse population adds demand across the full spectrum of psychiatric care.',
    topSettings: ['Community mental health centers', 'Outpatient clinics', 'Academic medical centers', 'Private practice', 'Substance abuse treatment', 'Telehealth'],
    faqs: [
      { question: 'What is the average PMHNP salary in Columbus, OH?', answer: 'PMHNPs in Columbus earn $125,000â€“$160,000 annually, with the average around $140,000. Adjusted for Ohio\'s low cost of living, this provides purchasing power equivalent to $170K+ in cities like Boston or Seattle. Private practice PMHNPs with full panels can earn $180K+.' },
      { question: 'Does Ohio have full practice authority for PMHNPs?', answer: 'Yes! Ohio grants Full Practice Authority to all nurse practitioners, including PMHNPs. No physician supervision, no collaborative agreement, no supervised hour requirements. You can prescribe schedule II-V controlled substances independently and open your own practice immediately after licensure.' },
      { question: 'What makes Columbus a good market for PMHNPs?', answer: 'Columbus combines Full Practice Authority, below-average cost of living, and a growing population (fastest-growing major city in Ohio). The Ohio State Wexner Medical Center is one of the largest academic medical centers in the country, and the city\'s opioid crisis response has created significant demand for psychiatric providers.' },
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
    practiceAuthority: 'Restricted',
    avgCostOfLiving: '2% above US average',
    heroDescription: 'The Tampa Bay metro is Florida\'s fastest-growing healthcare market, with major systems like BayCare, AdventHealth, and Tampa General Hospital actively recruiting PMHNPs. Zero state income tax and year-round warm weather make it a top relocation destination.',
    whyThisMetro: [
      'No state income tax â€” effectively boosts take-home pay by 6-9%',
      'Tampa Bay area growing rapidly â€” 3.2M+ metro population and rising',
      'BayCare, AdventHealth, Tampa General, Moffitt â€” world-class health systems',
      'Booming telehealth sector with companies like Talkiatry and Cerebral hiring here',
    ],
    costOfLivingNote: 'Tampa Bay\'s cost of living is only 2% above the national average â€” dramatically more affordable than Miami or South Florida. Housing in suburbs like Brandon, Wesley Chapel, and Riverview is particularly affordable. Combined with zero state income tax, PMHNPs in Tampa enjoy excellent value.',
    licensureNote: 'Florida has Restricted Practice Authority with a pathway to independence â€” PMHNPs with 3,000+ supervised hours can practice autonomously. The Tampa Bay area has numerous physician collaborators available, making the initial supervision period straightforward.',
    mentalHealthContext: 'Tampa Bay has seen significant population growth, particularly among retirees and military families (MacDill Air Force Base). This creates demand for geriatric psychiatry, PTSD treatment, and general psychiatric care. The area\'s substance use challenges add further demand.',
    topSettings: ['Outpatient clinics', 'Telehealth', 'Hospital systems', 'VA medical center', 'Senior living facilities', 'Private practice'],
    faqs: [
      { question: 'What is the average PMHNP salary in Tampa, FL?', answer: 'PMHNPs in the Tampa Bay area earn $128,000â€“$165,000 annually, with the average around $145,000. When factoring in zero state income tax, this is equivalent to $160K-$185K in states with income tax like California or New York.' },
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
    practiceAuthority: 'Full',
    avgCostOfLiving: '3% above US average',
    heroDescription: 'Phoenix is one of the fastest-growing PMHNP markets in the country, with Full Practice Authority and rapidly expanding healthcare infrastructure. Arizona\'s NP workforce is growing faster than any other state, driven by massive population influx and critical mental health provider shortages.',
    whyThisMetro: [
      'Full Practice Authority â€” independent prescribing and practice from day one',
      'Arizona has the fastest-growing NP workforce in the nation',
      'Banner Health, Dignity Health, HonorHealth â€” major systems aggressively hiring',
      'Massive population growth (5th largest US city) outpacing provider supply',
    ],
    costOfLivingNote: 'Phoenix\'s cost of living is only 3% above the national average, making it remarkably affordable for a major metro. Housing is significantly cheaper than California (where many Phoenix transplants originate). No state income tax on retirement income adds appeal for semi-retired practitioners.',
    licensureNote: 'Arizona has Full Practice Authority for PMHNPs â€” no physician supervision or collaborative agreement needed. PMHNPs can prescribe controlled substances independently and open their own practices. Arizona Board of Nursing is one of the fastest processors in the country (2-3 weeks).',
    mentalHealthContext: 'Arizona faces a critical mental health workforce shortage â€” the state has only 65% of the psychiatrists needed. The rapid population growth (primarily from California, Illinois, and the Midwest) is creating demand that far outpaces supply. Rural areas surrounding Phoenix metro have Health Professional Shortage Area (HPSA) designations with loan repayment eligibility.',
    topSettings: ['Outpatient clinics', 'Telehealth', 'Community mental health', 'VA medical centers', 'Private practice', 'Integrated behavioral health'],
    faqs: [
      { question: 'What is the average PMHNP salary in Phoenix, AZ?', answer: 'PMHNPs in Phoenix earn $130,000â€“$175,000 annually, with the average around $150,000. The combination of competitive salary, low cost of living, Full Practice Authority, and no commute time (with telehealth) makes Phoenix one of the highest net-value PMHNP markets in the US.' },
      { question: 'Does Arizona have full practice authority for PMHNPs?', answer: 'Yes â€” Arizona provides Full Practice Authority for all nurse practitioners. PMHNPs can practice independently, prescribe schedule II-V controlled substances, and open their own practices without physician oversight. Arizona is one of the most NP-friendly states in the country.' },
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
    practiceAuthority: 'Reduced',
    avgCostOfLiving: '2% below US average',
    heroDescription: 'The Dallas-Fort Worth metroplex is one of the largest and fastest-growing PMHNP markets in the South. No state income tax, below-average cost of living, and massive corporate healthcare presence make DFW an excellent market for both new and experienced psychiatric NPs.',
    whyThisMetro: [
      'No state income tax in Texas â€” immediate 6-9% take-home pay boost',
      '7.6M+ metro population â€” 4th largest in the US and growing rapidly',
      'UT Southwestern, Baylor Scott & White, Parkland â€” top academic and community systems',
      'Strong private practice market with growing telehealth sector',
    ],
    costOfLivingNote: 'DFW cost of living sits 2% below the national average, with housing particularly affordable in suburbs like Frisco, McKinney, Plano, and Arlington. Combined with zero state income tax, PMHNPs in Dallas enjoy exceptional purchasing power â€” a $145K salary here goes as far as $185K+ in NYC.',
    licensureNote: 'Texas has Reduced Practice Authority â€” PMHNPs must have a written collaborative agreement with a physician. After gaining experience, finding collaborative physicians is straightforward and many employers handle this arrangement. Texas Board of Nursing processes licenses in 4-6 weeks.',
    mentalHealthContext: 'Texas has one of the lowest ratios of mental health providers to residents in the country, creating massive demand. The DFW metroplex\'s rapid corporate growth (Toyota, Goldman Sachs, Charles Schwab HQs) is bringing in professionals who need mental health services. Rural areas surrounding DFW have critical shortages.',
    topSettings: ['Outpatient clinics', 'Private practice', 'Community mental health', 'Telehealth', 'Hospital systems', 'Correctional facilities'],
    faqs: [
      { question: 'What is the average PMHNP salary in Dallas, TX?', answer: 'PMHNPs in the DFW area earn $130,000â€“$170,000 annually, with the average around $148,000. With zero state income tax, a DFW PMHNP keeps significantly more than colleagues in states like California (13.3% top rate) or New York (8.8% top rate).' },
      { question: 'Does Texas have full practice authority for PMHNPs?', answer: 'Texas has Reduced Practice Authority â€” PMHNPs must maintain a collaborative agreement with a physician. The agreement is a prescriptive authority agreement (PAA) that outlines scope and protocols. Most employers facilitate these agreements, and they don\'t significantly limit day-to-day practice.' },
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
    practiceAuthority: 'Full',
    avgCostOfLiving: '7% above US average',
    heroDescription: 'Chicago offers Full Practice Authority, a massive healthcare infrastructure, and a deep pool of opportunities across academic medical centers, community health centers, and private practices. The Midwest\'s largest metro provides strong salaries with more affordable living than coastal cities.',
    whyThisMetro: [
      'Full Practice Authority â€” independent practice with no physician oversight',
      'World-class academic medical centers: Northwestern, Rush, UIC, Loyola',
      'Large underserved communities on the South and West sides with loan repayment eligibility',
      'More affordable than NYC, Boston, or LA while maintaining competitive salaries',
    ],
    costOfLivingNote: 'Chicago\'s cost of living is 7% above the national average, driven by housing in popular neighborhoods. Suburbs like Naperville, Schaumburg, and Oak Park offer significantly more affordable options. Compared to NYC (37% above) or LA (43% above), Chicago provides much better value for the salary range.',
    licensureNote: 'Illinois has Full Practice Authority effective since 2023 (after 250 hours of physician collaboration). PMHNPs can prescribe controlled substances independently and open their own practices. Illinois Board of Nursing processes licenses in 4-6 weeks.',
    mentalHealthContext: 'Chicago faces significant mental health disparities, with South and West side communities having dramatically less access to psychiatric care than affluent areas. Gun violence trauma, substance use, and generational poverty create intense demand for psychiatric services. The city\'s large immigrant population also requires culturally competent mental health care.',
    topSettings: ['Community mental health centers', 'Academic medical centers', 'Outpatient clinics', 'Private practice', 'VA medical center', 'Telehealth'],
    faqs: [
      { question: 'What is the average PMHNP salary in Chicago?', answer: 'PMHNPs in Chicago earn $135,000â€“$180,000 annually, with the average around $155,000. Academic medical center positions tend to offer slightly lower base pay but include excellent benefits and loan repayment. Community mental health and private practice roles offer the highest compensation.' },
      { question: 'Does Illinois have full practice authority for PMHNPs?', answer: 'Yes â€” Illinois enacted Full Practice Authority in 2023. New PMHNPs complete 250 hours of collaboration with a physician (roughly 3-4 months), after which they can practice independently. This makes Illinois one of the most NP-friendly states in the Midwest.' },
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
    practiceAuthority: 'Full',
    avgCostOfLiving: '49% above US average',
    heroDescription: 'Seattle offers some of the highest PMHNP salaries in the country, backed by Full Practice Authority and a progressive mental health landscape. The tech-driven economy creates unique psychiatric needs and willingness-to-pay, while state-level mental health crisis funding adds resources.',
    whyThisMetro: [
      'Among the highest-paying PMHNP markets: $155Kâ€“$210K+',
      'Full Practice Authority â€” independent prescribing from day one',
      'Washington state leads in mental health crisis funding and program support',
      'Tech-sector workforce creating demand for anxiety, burnout, and ADHD treatment',
    ],
    costOfLivingNote: 'Seattle is 49% above the national average, primarily due to housing. However, Washington has no state income tax, which offsets roughly 6-9% of the cost premium. Many PMHNPs work in Seattle but live in more affordable areas like Tacoma, Everett, or Olympia. Telehealth positions eliminate the commute entirely.',
    licensureNote: 'Washington has Full Practice Authority for PMHNPs â€” no physician supervision or collaborative agreement needed. PMHNPs can prescribe all controlled substances and practice independently. Washington also has robust mental health parity laws ensuring good insurance reimbursement.',
    mentalHealthContext: 'Seattle\'s booming tech industry has created a population with high rates of anxiety, burnout, and ADHD. The city also faces significant homelessness and substance use challenges. Washington state has invested heavily in mental health crisis response, creating funded positions throughout the region.',
    topSettings: ['Tech-company partnered clinics', 'Private practice', 'Telehealth', 'Community mental health', 'Hospital systems', 'Substance abuse treatment'],
    faqs: [
      { question: 'What is the average PMHNP salary in Seattle, WA?', answer: 'PMHNPs in Seattle earn $155,000â€“$210,000+ annually, making it one of the top 3 highest-paying markets nationally. The average is approximately $178,000. With no state income tax, the effective take-home pay is exceptional. Private practice and telehealth roles can exceed $220K.' },
      { question: 'Does Washington have full practice authority for PMHNPs?', answer: 'Yes â€” Washington provides Full Practice Authority for all nurse practitioners. PMHNPs can practice independently, prescribe schedule II-V controlled substances, and establish their own practices. The state also has strong mental health parity laws ensuring fair insurance reimbursement for psychiatric services.' },
      { question: 'What makes Seattle unique for PMHNP careers?', answer: 'Seattle\'s tech industry creates a unique patient population with high rates of anxiety, burnout, and ADHD. Companies like Amazon, Microsoft, and Meta have employee assistance programs that frequently refer to psychiatric providers. This creates a population with good insurance coverage and willingness to engage in mental health treatment â€” ideal for private practice PMHNPs.' },
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
    practiceAuthority: 'Reduced',
    avgCostOfLiving: '3% above US average',
    heroDescription: 'Atlanta is the Southeast\'s largest healthcare hub, home to the CDC, Emory University, and a massive network of health systems. The 6.1M+ metro population, combined with significant mental health access gaps in surrounding areas, creates strong and sustained PMHNP demand.',
    whyThisMetro: [
      'Southeast\'s largest healthcare market with world-class institutions',
      'Emory University, Grady Health, WellStar, Piedmont â€” major employers',
      'Growing metro population (6.1M+) with significant underserved communities',
      'Cost of living only 3% above average â€” excellent value for the Southeast',
    ],
    costOfLivingNote: 'Atlanta\'s cost of living is only 3% above the national average â€” dramatically more affordable than other major metros of similar size. Suburbs like Marietta, Decatur, Alpharetta, and Kennesaw offer excellent value. Georgia has a moderate state income tax (5.49% flat rate as of 2024).',
    licensureNote: 'Georgia has Reduced Practice Authority â€” PMHNPs must have a collaborative agreement (protocol agreement) with a physician. The physician can supervise up to 8 NPs. Georgia Board of Nursing processes licenses in 4-8 weeks. Georgia is in the Nurse Licensure Compact (NLC).',
    mentalHealthContext: 'Georgia ranks among the bottom 10 states for mental health workforce adequacy. Atlanta\'s underserved communities, particularly South Atlanta and surrounding rural counties, have critical psychiatric provider shortages. The city\'s large refugee and immigrant population adds cultural competency requirements to mental health care.',
    topSettings: ['Community mental health centers', 'Hospital systems', 'Outpatient clinics', 'Telehealth', 'VA medical center', 'Private practice'],
    faqs: [
      { question: 'What is the average PMHNP salary in Atlanta, GA?', answer: 'PMHNPs in metro Atlanta earn $125,000â€“$165,000 annually, with the average around $143,000. Adjusted for cost of living (only 3% above average), this provides excellent purchasing power. Community mental health roles often include federal loan repayment eligibility.' },
      { question: 'Does Georgia have full practice authority for PMHNPs?', answer: 'Georgia has Reduced Practice Authority â€” PMHNPs require a protocol agreement with a physician. The agreement outlines scope of practice and prescriptive guidelines. Most employers facilitate these arrangements. Georgia is part of the Nurse Licensure Compact, making it easier for multi-state licensees to start practicing.' },
      { question: 'Is Atlanta a good city for PMHNPs starting their career?', answer: 'Yes. Atlanta\'s large healthcare ecosystem, anchored by Emory University and Grady Health System, provides excellent mentorship and training opportunities. The VA Atlanta Healthcare System also hires new graduates. The cost of living is very manageable on a new-grad PMHNP salary, and the growing metro area ensures long-term career stability.' },
    ],
  },
];

/** Lookup a metro city by slug */
export function getMetroCity(slug: string): MetroCity | undefined {
  return METRO_CITIES.find(m => m.slug === slug);
}

/** Get all metro slugs for static generation */
export function getAllMetroSlugs(): string[] {
  return METRO_CITIES.map(m => m.slug);
}
