/**
 * Setting × State pSEO Configuration
 * 
 * Defines each "setting" category (remote, telehealth, inpatient, outpatient, travel)
 * and the Prisma `where` clause used to filter jobs for that setting.
 * A shared template factory uses these configs to render ~255 state pages.
 */

// ─── State Utilities ───────────────────────────────────────────────────────────

export const STATE_CODES: Record<string, string> = {
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

export const CODE_TO_STATE: Record<string, string> = Object.entries(STATE_CODES)
  .reduce((acc, [state, code]) => ({ ...acc, [code]: state }), {} as Record<string, string>);

export const URL_TO_STATE: Record<string, string> = Object.keys(STATE_CODES)
  .reduce((acc, state) => {
    const urlFriendly = state.toLowerCase().replace(/\s+/g, '-');
    acc[urlFriendly] = state;
    return acc;
  }, {} as Record<string, string>);

/** Convert a URL slug like "new-york" to the full state name "New York" */
export function resolveStateSlug(slug: string): string | null {
  // Try exact URL match first
  if (URL_TO_STATE[slug]) return URL_TO_STATE[slug];
  // Try state code (e.g. "ny" → "New York")
  const upper = slug.toUpperCase();
  if (CODE_TO_STATE[upper]) return CODE_TO_STATE[upper];
  return null;
}

/** Convert a state name to a URL slug */
export function stateToSlug(stateName: string): string {
  return stateName.toLowerCase().replace(/\s+/g, '-');
}

/** Get all state slugs for generateStaticParams */
export function getAllStateSlugs(): string[] {
  return Object.keys(URL_TO_STATE);
}

// ─── Neighboring States ────────────────────────────────────────────────────────

export const NEIGHBORING_STATES: Record<string, string[]> = {
  'Alabama': ['Florida', 'Georgia', 'Tennessee', 'Mississippi'],
  'Alaska': ['Washington', 'California', 'Oregon'],
  'Arizona': ['California', 'Nevada', 'Utah', 'Colorado', 'New Mexico'],
  'Arkansas': ['Texas', 'Oklahoma', 'Missouri', 'Tennessee', 'Mississippi', 'Louisiana'],
  'California': ['Oregon', 'Nevada', 'Arizona', 'Washington'],
  'Colorado': ['Utah', 'Wyoming', 'Nebraska', 'Kansas', 'Oklahoma', 'New Mexico', 'Arizona'],
  'Connecticut': ['New York', 'Massachusetts', 'Rhode Island'],
  'Delaware': ['Pennsylvania', 'New Jersey', 'Maryland'],
  'District of Columbia': ['Maryland', 'Virginia'],
  'Florida': ['Georgia', 'Alabama'],
  'Georgia': ['Florida', 'Alabama', 'Tennessee', 'North Carolina', 'South Carolina'],
  'Hawaii': ['California', 'Washington', 'Oregon'],
  'Idaho': ['Washington', 'Oregon', 'Montana', 'Wyoming', 'Utah', 'Nevada'],
  'Illinois': ['Wisconsin', 'Indiana', 'Kentucky', 'Missouri', 'Iowa'],
  'Indiana': ['Michigan', 'Ohio', 'Kentucky', 'Illinois'],
  'Iowa': ['Minnesota', 'Wisconsin', 'Illinois', 'Missouri', 'Nebraska', 'South Dakota'],
  'Kansas': ['Nebraska', 'Missouri', 'Oklahoma', 'Colorado'],
  'Kentucky': ['Indiana', 'Ohio', 'West Virginia', 'Virginia', 'Tennessee', 'Missouri', 'Illinois'],
  'Louisiana': ['Texas', 'Arkansas', 'Mississippi'],
  'Maine': ['New Hampshire', 'Massachusetts'],
  'Maryland': ['Pennsylvania', 'Delaware', 'Virginia', 'West Virginia', 'District of Columbia'],
  'Massachusetts': ['New Hampshire', 'Vermont', 'New York', 'Connecticut', 'Rhode Island'],
  'Michigan': ['Ohio', 'Indiana', 'Wisconsin'],
  'Minnesota': ['Wisconsin', 'Iowa', 'South Dakota', 'North Dakota'],
  'Mississippi': ['Louisiana', 'Arkansas', 'Tennessee', 'Alabama'],
  'Missouri': ['Iowa', 'Illinois', 'Kentucky', 'Tennessee', 'Arkansas', 'Oklahoma', 'Kansas', 'Nebraska'],
  'Montana': ['North Dakota', 'South Dakota', 'Wyoming', 'Idaho'],
  'Nebraska': ['South Dakota', 'Iowa', 'Missouri', 'Kansas', 'Colorado', 'Wyoming'],
  'Nevada': ['California', 'Oregon', 'Idaho', 'Utah', 'Arizona'],
  'New Hampshire': ['Maine', 'Vermont', 'Massachusetts'],
  'New Jersey': ['New York', 'Pennsylvania', 'Delaware'],
  'New Mexico': ['Arizona', 'Utah', 'Colorado', 'Oklahoma', 'Texas'],
  'New York': ['Vermont', 'Massachusetts', 'Connecticut', 'New Jersey', 'Pennsylvania'],
  'North Carolina': ['Virginia', 'Tennessee', 'Georgia', 'South Carolina'],
  'North Dakota': ['Montana', 'South Dakota', 'Minnesota'],
  'Ohio': ['Michigan', 'Indiana', 'Kentucky', 'West Virginia', 'Pennsylvania'],
  'Oklahoma': ['Kansas', 'Missouri', 'Arkansas', 'Texas', 'New Mexico', 'Colorado'],
  'Oregon': ['Washington', 'California', 'Nevada', 'Idaho'],
  'Pennsylvania': ['New York', 'New Jersey', 'Delaware', 'Maryland', 'West Virginia', 'Ohio'],
  'Rhode Island': ['Massachusetts', 'Connecticut'],
  'South Carolina': ['North Carolina', 'Georgia'],
  'South Dakota': ['North Dakota', 'Minnesota', 'Iowa', 'Nebraska', 'Wyoming', 'Montana'],
  'Tennessee': ['Kentucky', 'Virginia', 'North Carolina', 'Georgia', 'Alabama', 'Mississippi', 'Arkansas', 'Missouri'],
  'Texas': ['New Mexico', 'Oklahoma', 'Arkansas', 'Louisiana'],
  'Utah': ['Idaho', 'Wyoming', 'Colorado', 'New Mexico', 'Arizona', 'Nevada'],
  'Vermont': ['New Hampshire', 'Massachusetts', 'New York'],
  'Virginia': ['Maryland', 'District of Columbia', 'West Virginia', 'Kentucky', 'Tennessee', 'North Carolina'],
  'Washington': ['Oregon', 'Idaho'],
  'West Virginia': ['Pennsylvania', 'Maryland', 'Virginia', 'Kentucky', 'Ohio'],
  'Wisconsin': ['Michigan', 'Minnesota', 'Iowa', 'Illinois'],
  'Wyoming': ['Montana', 'South Dakota', 'Nebraska', 'Colorado', 'Utah', 'Idaho'],
};

// ─── Setting Configurations ────────────────────────────────────────────────────

export interface SettingConfig {
  /** URL path segment: "remote", "telehealth", etc. */
  slug: string;
  /** Display name: "Remote", "Telehealth", etc. */
  label: string;
  /** Longer display: "Remote PMHNP", "Telehealth PMHNP", etc. */
  fullLabel: string;
  /** Hero subtitle for the state page */
  heroSubtitle: string;
  /** Target salary range for metadata */
  salaryRange: string;
  /** SEO keywords for metadata */
  keywords: string[];
  /** FAQ category key passed to CategoryFAQ component */
  faqCategory: string;
  /**
   * Build the Prisma `where` clause to filter jobs for this setting.
   * `stateName` is the full state name (e.g. "California").
   */
  buildWhere: (stateName: string) => Record<string, unknown>;
  /** Three benefits to show in the hero section */
  benefits: Array<{
    title: string;
    description: string;
    iconName: string; // lucide icon name
  }>;
  /** Tips shown in sidebar */
  tips: string[];
}

function buildKeywordWhere(keywords: string[], stateName: string): Record<string, unknown> {
  return {
    isPublished: true,
    state: { equals: stateName, mode: 'insensitive' },
    OR: keywords.map((kw) => ({
      OR: [
        { title: { contains: kw, mode: 'insensitive' } },
        { description: { contains: kw, mode: 'insensitive' } },
      ],
    })),
  };
}

export const SETTING_CONFIGS: Record<string, SettingConfig> = {
  remote: {
    slug: 'remote',
    label: 'Remote',
    fullLabel: 'Remote PMHNP',
    heroSubtitle: 'Work from home psychiatric NP positions',
    salaryRange: '$130K-200K',
    keywords: ['remote pmhnp', 'work from home pmhnp', 'remote psychiatric nurse practitioner', 'telehealth pmhnp'],
    faqCategory: 'remote',
    buildWhere: (stateName: string) => ({
      isPublished: true,
      isRemote: true,
      state: { equals: stateName, mode: 'insensitive' },
    }),
    benefits: [
      { title: 'Flexible Schedule', description: 'Set your own hours and work from the comfort of your home while serving patients across the state.', iconName: 'Clock' },
      { title: 'No Commute', description: 'Eliminate commute time and overhead costs. Remote PMHNP roles let you practice from anywhere in the state.', iconName: 'Home' },
      { title: 'National Reach', description: 'Serve patients statewide and expand your impact beyond your local area with telehealth flexibility.', iconName: 'Globe' },
    ],
    tips: [
      'Ensure reliable high-speed internet for telepsychiatry',
      'Create a private, HIPAA-compliant home office',
      'Verify state licensure requirements for remote practice',
      'Invest in quality telehealth equipment (webcam, headset)',
      'Set clear boundaries between work and personal time',
    ],
  },
  telehealth: {
    slug: 'telehealth',
    label: 'Telehealth',
    fullLabel: 'Telehealth PMHNP',
    heroSubtitle: 'Virtual psychiatric care positions',
    salaryRange: '$130K-200K',
    keywords: ['telehealth pmhnp', 'telemedicine pmhnp', 'virtual psychiatry', 'telepsychiatry nurse practitioner'],
    faqCategory: 'telehealth',
    buildWhere: (stateName: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      OR: [
        { title: { contains: 'telehealth', mode: 'insensitive' } },
        { title: { contains: 'telemedicine', mode: 'insensitive' } },
        { title: { contains: 'telepsych', mode: 'insensitive' } },
        { title: { contains: 'virtual', mode: 'insensitive' } },
        { description: { contains: 'telehealth', mode: 'insensitive' } },
        { description: { contains: 'telemedicine', mode: 'insensitive' } },
      ],
    }),
    benefits: [
      { title: 'Growing Demand', description: 'Telehealth psychiatric care has seen explosive growth. Virtual providers are in high demand statewide.', iconName: 'TrendingUp' },
      { title: 'Patient Accessibility', description: 'Reach patients in rural and underserved areas who lack access to in-person psychiatric care.', iconName: 'Users' },
      { title: 'Flexible Practice', description: 'Choose between full-time telehealth positions or supplement in-person work with virtual sessions.', iconName: 'Monitor' },
    ],
    tips: [
      'Master telepsychiatry platforms (Zoom, Doxy.me)',
      'Develop strong virtual rapport and assessment skills',
      'Stay current on state-specific telehealth regulations',
      'Maintain proper documentation for virtual visits',
      'Consider multi-state licensure for broader reach',
    ],
  },
  inpatient: {
    slug: 'inpatient',
    label: 'Inpatient',
    fullLabel: 'Inpatient PMHNP',
    heroSubtitle: 'Hospital & acute care psychiatric positions',
    salaryRange: '$140K-200K',
    keywords: ['inpatient pmhnp', 'hospital pmhnp', 'acute care pmhnp', 'inpatient psychiatric nurse practitioner'],
    faqCategory: 'inpatient',
    buildWhere: (stateName: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      OR: [
        { title: { contains: 'inpatient', mode: 'insensitive' } },
        { title: { contains: 'in-patient', mode: 'insensitive' } },
        { title: { contains: 'acute care', mode: 'insensitive' } },
        { title: { contains: 'hospital', mode: 'insensitive' } },
        { description: { contains: 'inpatient', mode: 'insensitive' } },
      ],
    }),
    benefits: [
      { title: 'Higher Base Pay', description: 'Inpatient PMHNPs earn $140K-$200K+ due to the demanding nature of acute psychiatric care.', iconName: 'DollarSign' },
      { title: 'Structured Environment', description: 'Hospital settings offer built-in support teams, protocols, and multidisciplinary care teams.', iconName: 'Shield' },
      { title: 'Defined Schedules', description: 'Many inpatient roles offer shift-based schedules (7-on/7-off, 3x12s) with no after-hours calls.', iconName: 'Clock' },
    ],
    tips: [
      'Get comfortable with crisis intervention and de-escalation',
      'Build rapport with multidisciplinary teams',
      'Stay current on psychopharmacology for acute conditions',
      'Negotiate shift differentials for nights and weekends',
      'Consider inpatient fellowships for specialized training',
    ],
  },
  outpatient: {
    slug: 'outpatient',
    label: 'Outpatient',
    fullLabel: 'Outpatient PMHNP',
    heroSubtitle: 'Clinic & private practice positions',
    salaryRange: '$130K-190K',
    keywords: ['outpatient pmhnp', 'clinic pmhnp', 'private practice pmhnp', 'outpatient psychiatric nurse practitioner'],
    faqCategory: 'outpatient',
    buildWhere: (stateName: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      OR: [
        { title: { contains: 'outpatient', mode: 'insensitive' } },
        { title: { contains: 'out-patient', mode: 'insensitive' } },
        { title: { contains: 'clinic', mode: 'insensitive' } },
        { title: { contains: 'private practice', mode: 'insensitive' } },
        { title: { contains: 'community mental health', mode: 'insensitive' } },
        { description: { contains: 'outpatient', mode: 'insensitive' } },
      ],
    }),
    benefits: [
      { title: 'Work-Life Balance', description: 'Most outpatient positions offer M-F schedules with no nights, weekends, or on-call requirements.', iconName: 'Clock' },
      { title: 'Long-Term Relationships', description: 'Build meaningful therapeutic relationships through ongoing medication management and therapy.', iconName: 'Heart' },
      { title: 'Private Practice Path', description: 'Outpatient experience is the foundation for starting your own practice earning $200K+ with full autonomy.', iconName: 'DollarSign' },
    ],
    tips: [
      'Start with structured clinic work before private practice',
      'Build expertise in evidence-based psychotherapy integration',
      'Negotiate productivity bonuses for high patient volume',
      'Consider part-time private practice alongside W-2 work',
      'Get comfortable with therapy modalities (CBT, DBT, MI)',
    ],
  },
  travel: {
    slug: 'travel',
    label: 'Travel',
    fullLabel: 'Travel PMHNP',
    heroSubtitle: 'Locum tenens & travel assignment positions',
    salaryRange: '$80-150/hr',
    keywords: ['travel pmhnp', 'locum tenens pmhnp', 'travel psychiatric nurse practitioner', 'locum psych np'],
    faqCategory: 'travel',
    buildWhere: (stateName: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      OR: [
        { title: { contains: 'travel', mode: 'insensitive' } },
        { title: { contains: 'locum', mode: 'insensitive' } },
        { description: { contains: 'travel', mode: 'insensitive' } },
        { description: { contains: 'locum', mode: 'insensitive' } },
      ],
    }),
    benefits: [
      { title: 'Premium Pay', description: 'Travel and locum tenens positions offer 20-40% higher compensation plus housing and travel stipends.', iconName: 'DollarSign' },
      { title: 'Flexible Assignments', description: 'Choose contract lengths from 4 weeks to 6+ months. Take breaks between assignments as needed.', iconName: 'Calendar' },
      { title: 'Explore New Places', description: 'Work across the state while experiencing different healthcare settings and patient populations.', iconName: 'MapPin' },
    ],
    tips: [
      'Maintain active licensure in the state',
      'Keep credentials updated and easily accessible',
      'Work with reputable staffing agencies',
      'Negotiate housing and travel stipends',
      'Build relationships for repeat assignments',
    ],
  },
};

/** Get all valid setting slugs */
export function getAllSettingSlugs(): string[] {
  return Object.keys(SETTING_CONFIGS);
}
