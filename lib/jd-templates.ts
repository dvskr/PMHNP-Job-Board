/**
 * PMHNP JD skeleton templates — bullet-structured starters, not finished
 * prose. Each is ~1,500-2,500 chars, organized by setting and sub-
 * specialty, with [bracketed] placeholders where the employer must
 * fill in their actual specifics.
 *
 * Design choices (vs. the prior long-prose approach, swapped 2026-05-14):
 *   - SHORT (~2k chars) so the employer is expected to customize before
 *     submitting — not paste-and-go.
 *   - BULLETS over prose to make placeholders visually scannable.
 *   - 12 templates covering real PMHNP sub-specialties so the picker
 *     looks like a serious niche tool, not a generic 3-option drop-in.
 *   - [bracket] markers explicitly cue the recruiter to edit. Lower
 *     duplicate-content risk than identical prose across 50 employers.
 *   - Shared closing sections (Required quals, Comp, Apply) so the
 *     legally-stable boilerplate stays consistent and we don't have to
 *     update it in 12 places when DEA rules change.
 *
 * Token substitution: {{employer}}, {{city}}, {{state}} are replaced
 * by renderTemplate() at insert time using current form-field values.
 * Anything in [square brackets] is left as-is — those are prompts to
 * the human to fill in.
 */

export type JdTemplateCategory = 'outpatient' | 'inpatient' | 'telehealth' | 'specialty';

export type JdTemplateId =
  | 'outpatient-adult'
  | 'outpatient-child-adolescent'
  | 'outpatient-geriatric'
  | 'outpatient-substance-use'
  | 'inpatient-adult-acute'
  | 'inpatient-child-adolescent'
  | 'telehealth-adult'
  | 'telehealth-multistate'
  | 'fqhc-community-health'
  | 'correctional-forensic'
  | 'ect-interventional'
  | 'crisis-emergency';

export interface JdTemplate {
  id: JdTemplateId;
  category: JdTemplateCategory;
  label: string;
  summary: string;
  setting: string;
  population: string;
  /** Quill-compatible HTML. Tokens: {{employer}}, {{city}}, {{state}}. */
  body: string;
}

// ─── Shared sections ──────────────────────────────────────────────
// Boilerplate that should stay identical across all templates so legal/
// scope-of-practice language is reviewed once. Sub-specialty differences
// live in the responsibilities, preferred quals, schedule, and why-join
// sections.

const REQUIRED_QUALS_BLOCK = `<h3>Required qualifications</h3>
<ul>
<li>Master's or Doctoral degree (MSN, DNP) from an accredited PMHNP program</li>
<li>Active, unrestricted PMHNP-BC certification (ANCC)</li>
<li>Active RN and APRN/NP licensure in {{state}}</li>
<li>Active, unrestricted DEA registration with Schedule II authority (or willingness to obtain by start date)</li>
<li>[Set your experience requirement — e.g. "New grads welcome", "1+ year preferred", "3+ years required"]</li>
</ul>`;

const COMP_BENEFITS_BLOCK = `<h2>Compensation and benefits</h2>
<ul>
<li>Base salary: $[XXX,000 – XXX,000] commensurate with experience</li>
<li>[Bonus structure — e.g. quarterly outcomes bonus, productivity bonus, sign-on, none]</li>
<li>Health, dental, and vision insurance</li>
<li>$[X,XXX] annual CME stipend plus [X] paid CME days</li>
<li>Full malpractice with tail coverage</li>
<li>401(k) or 403(b) with employer match</li>
<li>[X] weeks paid time off plus [X] paid holidays</li>
<li>[Optional: loan repayment, relocation, parental leave specifics]</li>
</ul>`;

const APPLY_BLOCK = `<h2>How to apply</h2>
<p>Submit your CV with a brief cover note describing your interest in this role. We typically respond within [N] business days. Equal-opportunity employer; we strongly encourage applications from clinicians of all backgrounds.</p>`;

function buildTemplate(parts: {
  aboutBlurb: string;
  positionSummary: string;
  responsibilities: string[];
  preferredQuals: string[];
  schedule: string;
  whyJoin: string;
}): string {
  return [
    `<h2>About {{employer}}</h2><p>{{employer}} is hiring a Psychiatric Mental Health Nurse Practitioner (PMHNP) in {{city}}, {{state}}. ${parts.aboutBlurb}</p>`,
    `<h2>Position summary</h2><p>${parts.positionSummary}</p>`,
    `<h3>Key responsibilities</h3><ul>${parts.responsibilities.map((r) => `<li>${r}</li>`).join('')}</ul>`,
    REQUIRED_QUALS_BLOCK,
    `<h3>Preferred qualifications</h3><ul>${parts.preferredQuals.map((p) => `<li>${p}</li>`).join('')}</ul>`,
    `<h2>Schedule</h2><p>${parts.schedule}</p>`,
    COMP_BENEFITS_BLOCK,
    `<h2>Why join us</h2><p>${parts.whyJoin}</p>`,
    APPLY_BLOCK,
  ].join('');
}

// ─── Outpatient templates ────────────────────────────────────────

const OUTPATIENT_ADULT_BODY = buildTemplate({
  aboutBlurb:
    'We are a [mission/values phrase — e.g. clinician-led, evidence-based] outpatient psychiatric practice serving adults with [primary diagnostic mix — e.g. mood, anxiety, ADHD, trauma].',
  positionSummary:
    'This is a [full-time / part-time] outpatient PMHNP role with autonomy over your panel and treatment decisions. You will conduct psychiatric evaluations, manage psychotropic medications, and coordinate care with our [therapy / primary care / case management] team. Our EHR is [Athena / Epic / NextGen / specify] with [templated notes / AI-assisted documentation / specify any tooling].',
  responsibilities: [
    'Conduct [45 / 60]-minute initial psychiatric evaluations and [20 / 30]-minute medication-management follow-ups',
    'Diagnose and treat [list common diagnoses you accept]',
    'Prescribe and titrate psychotropic medications including [SSRIs / SNRIs / stimulants / mood stabilizers / antipsychotics — adjust to your formulary]',
    'Provide brief supportive psychotherapy and psychoeducation alongside medication management',
    'Coordinate care with in-house therapists and primary-care providers',
    'Document encounters in the EHR within [24 / 48] hours',
    'Participate in [weekly / monthly] case-consultation meetings',
  ],
  preferredQuals: [
    '[N]+ years of outpatient psychiatric experience',
    'Experience with measurement-based care (PHQ-9, GAD-7, ASRS, AUDIT)',
    '[Spanish / Mandarin / other language] fluency for our patient population',
    '[Specific modality experience: TMS, ketamine, ECT consult]',
  ],
  schedule:
    'Monday through Friday, [8:30 a.m. – 5:00 p.m. / your hours], with [one administrative half-day per week / specify]. [No weekend, on-call, or after-hours coverage required / specify any call duties].',
  whyJoin:
    '[1–2 sentences about what makes your practice distinctive — clinician-led leadership, low panel volumes, administrative support, growth path, etc.]',
});

const OUTPATIENT_CHILD_ADOLESCENT_BODY = buildTemplate({
  aboutBlurb:
    'We are a child & adolescent outpatient psychiatric practice serving patients ages [6–17 / 4–21 / specify] with [ADHD, mood, anxiety, autism spectrum, trauma — adjust to your population].',
  positionSummary:
    'This is a child & adolescent PMHNP role with focus on developmentally-informed psychiatric care. You will conduct comprehensive evaluations, prescribe psychotropic medications, and partner closely with parents, schools, and other treating providers.',
  responsibilities: [
    'Conduct comprehensive psychiatric evaluations including developmental history, parent/caregiver interview, and school collateral',
    'Diagnose and treat ADHD, mood disorders, anxiety, OCD, PTSD, [autism spectrum, eating disorders, specify]',
    'Prescribe and titrate psychotropic medications appropriate for pediatric populations',
    'Lead family meetings and psychoeducation sessions for parents/caregivers',
    'Coordinate with schools, IEP/504 teams, and pediatric primary care',
    'Maintain documentation per [your state] child mental health regulations',
  ],
  preferredQuals: [
    '[N]+ years of child & adolescent psychiatric experience',
    'CAP-PMHNP certification or equivalent specialty training',
    'Experience with developmental screening tools and parent rating scales',
    '[Spanish / specify] fluency for our patient population',
  ],
  schedule:
    'Monday through Friday with [afternoon clinic hours / extended hours / after-school slots] to accommodate school schedules. No weekends; no on-call.',
  whyJoin:
    '[Describe your practice: low panels, multidisciplinary team, training opportunities, mission, etc.]',
});

const OUTPATIENT_GERIATRIC_BODY = buildTemplate({
  aboutBlurb:
    'We are a geriatric psychiatry practice serving older adults (age [55+ / 65+]) with mood disorders, cognitive concerns, late-life psychiatric conditions, and behavioral symptoms of dementia.',
  positionSummary:
    'This is a geriatric PMHNP role centered on careful psychotropic management in medically complex older adults, often in collaboration with primary care, neurology, and skilled nursing teams.',
  responsibilities: [
    'Conduct psychiatric evaluations including cognitive screening (MoCA / MMSE), depression scales (PHQ-9, GDS), and functional assessment',
    'Diagnose and manage late-life depression, anxiety, psychotic disorders, and behavioral symptoms of dementia',
    'Prescribe psychotropic medications with attention to polypharmacy, renal/hepatic adjustments, and fall risk',
    'Coordinate with primary care, neurology, and [SNF / ALF / memory-care facility] staff',
    'Lead family meetings on diagnosis, prognosis, and care planning',
    '[Optional: conduct in-facility consults at assisted-living or skilled-nursing partners]',
  ],
  preferredQuals: [
    '[N]+ years of geriatric or general adult psychiatric experience',
    'Familiarity with Beers Criteria and STOPP/START prescribing in older adults',
    'Comfort with dementia care, capacity assessments, and end-of-life psychiatric care',
    '[Spanish / specify] fluency',
  ],
  schedule:
    'Monday through Friday daytime hours. [Some in-facility visits at partner sites / clinic-based only]. No weekends or on-call.',
  whyJoin:
    '[What makes your geriatric practice unique — interdisciplinary team, memory-care partnership, research, mission, etc.]',
});

const OUTPATIENT_SUBSTANCE_USE_BODY = buildTemplate({
  aboutBlurb:
    'We are an outpatient practice specializing in substance use disorders and co-occurring psychiatric conditions. We provide medication-assisted treatment (MAT) for opioid use disorder, alcohol use disorder, and other substance-related diagnoses.',
  positionSummary:
    'This is a PMHNP role focused on MAT and dual-diagnosis care. You will manage buprenorphine, naltrexone, and acamprosate alongside psychiatric medication management for co-occurring mood, anxiety, and trauma disorders.',
  responsibilities: [
    'Initiate and manage MAT (buprenorphine/naloxone, extended-release naltrexone, acamprosate, [specify])',
    'Conduct psychiatric evaluations for co-occurring SUD and mental-health diagnoses',
    'Manage psychotropic medications alongside MAT with attention to interactions',
    'Coordinate care with substance use counselors, peer-recovery specialists, and primary care',
    'Document per [42 CFR Part 2 / state regulations] for SUD records',
    'Participate in [weekly / monthly] case rounds with the multidisciplinary team',
  ],
  preferredQuals: [
    'Experience with buprenorphine prescribing (DATA-waiver no longer required, but documented experience preferred)',
    '[N]+ years of substance use disorder care experience',
    'Familiarity with [contingency management / motivational interviewing / harm-reduction frameworks]',
    '[Spanish / specify] fluency',
  ],
  schedule:
    'Monday through Friday with [early-morning / extended] hours to accommodate working patients. Telehealth flexibility for stable maintenance visits per current DEA rules.',
  whyJoin:
    '[Mission language — harm reduction, recovery-oriented care, integrated SUD/psych care, etc.]',
});

// ─── Inpatient templates ─────────────────────────────────────────

const INPATIENT_ADULT_ACUTE_BODY = buildTemplate({
  aboutBlurb:
    'We are a [N]-bed acute adult inpatient psychiatric unit at [community hospital / academic medical center / specify], providing stabilization for patients in acute psychiatric crisis.',
  positionSummary:
    'This is an inpatient PMHNP role with shared admitting and rounding responsibility alongside a [board-certified psychiatrist / attending physician group]. Caseload is [8–12] acute patients with average length of stay [N] days.',
  responsibilities: [
    'Perform initial admissions within [4] hours of arrival including history, mental-status exam, risk assessment, and provisional diagnosis',
    'Round daily on assigned patients with progress notes documenting clinical status, response to medications, and discharge readiness',
    'Manage acute psychotropic regimens including involuntary medication orders, IM antipsychotics, benzodiazepine tapers, and [clozapine REMS / specify]',
    'Participate in daily multidisciplinary treatment-team rounds',
    'Respond to behavioral emergencies and code response calls per unit protocol',
    'Coordinate transfers, ECT consults, and referrals to specialty programs',
    'Lead family meetings for discharge planning and safety planning',
  ],
  preferredQuals: [
    '[N]+ years of acute inpatient psychiatric experience',
    'BLS required; ACLS preferred',
    'Comfort with involuntary commitment paperwork and capacity assessments in {{state}}',
    'Experience with [clozapine REMS / ECT / specify high-acuity modalities]',
  ],
  schedule:
    '[12-hour shifts on a 7-on/7-off rotation / Monday–Friday day shifts / specify]. [Weekend coverage shared equitably / specify]. Holiday rotation [details].',
  whyJoin:
    '[Distinctive features — teaching hospital, low readmission rates, clinical scholarship support, pension/benefits, etc.]',
});

const INPATIENT_CHILD_ADOLESCENT_BODY = buildTemplate({
  aboutBlurb:
    'We are a [N]-bed child & adolescent inpatient psychiatric unit serving patients ages [4–18 / specify] in acute crisis — suicidal ideation, aggression, psychotic decompensation, severe mood episodes.',
  positionSummary:
    'This is a child & adolescent inpatient PMHNP role focused on rapid stabilization, family-centered treatment planning, and coordinated discharge into outpatient or step-down care.',
  responsibilities: [
    'Perform admissions including developmental history, parent/caregiver interview, and risk assessment',
    'Round daily; document clinical status, medication response, milieu observations',
    'Manage psychotropic regimens appropriate for pediatric acute care',
    'Lead daily multidisciplinary rounds with social work, recreation therapy, and unit nursing',
    'Coordinate with parents/guardians, schools, child-welfare agencies as needed',
    'Lead family meetings on diagnosis, treatment, and post-discharge safety planning',
  ],
  preferredQuals: [
    '[N]+ years of child & adolescent psychiatric experience (inpatient strongly preferred)',
    'CAP-PMHNP certification or equivalent specialty training',
    'Comfort with [42 CFR / juvenile-court / child-welfare] documentation requirements',
    'BLS required; PALS preferred',
  ],
  schedule:
    '[Schedule details — 12-hour shifts, weekday days, weekend rotation, etc.]',
  whyJoin:
    '[Distinctive features of your program — family integration, schooling on unit, step-down partnership, etc.]',
});

// ─── Telehealth templates ────────────────────────────────────────

const TELEHEALTH_ADULT_BODY = buildTemplate({
  aboutBlurb:
    'We are a 100% remote telepsychiatry practice serving adults in [single state / {{state}} only — specify if multi-state]. We operate exclusively over [HIPAA-compliant video platform] with [asynchronous messaging / chat as adjunct, specify].',
  positionSummary:
    'This is a fully-remote PMHNP role. You see patients exclusively over video from a home office of your choosing. We have invested in [low panel cap / measurement-based care / clinician-led policy / specify your differentiator].',
  responsibilities: [
    'Conduct [45–60]-minute initial telehealth evaluations and [20–30]-minute follow-ups',
    'Diagnose and treat adult psychiatric conditions: depression, anxiety, ADHD, PTSD, OCD, bipolar spectrum',
    'Prescribe psychotropic medications via [EPCS] in compliance with state telehealth and DEA controlled-substance rules',
    'Manage an active panel of approximately [250–350] patients',
    'Respond to asynchronous patient messages within [N] business days',
    'Coordinate care with primary care, therapists, and family members as appropriate',
  ],
  preferredQuals: [
    '[N]+ years of clinical psychiatric experience (any setting)',
    'Existing multi-state licensure (compact RN preferred)',
    'Comfort with asynchronous patient messaging workflows',
    '[Spanish / specify] fluency',
  ],
  schedule:
    'Monday through Friday [hours]. [Optional Saturday morning availability]. Full-time defined as [N] clinical hours per week. No nights, no weekends, no call.',
  whyJoin:
    '[Telepsych-specific differentiators — clinician-led, measurement-based outcomes, no commute, home-office stipend, etc.]',
});

const TELEHEALTH_MULTISTATE_BODY = buildTemplate({
  aboutBlurb:
    'We are a multi-state telepsychiatry practice licensed in [N] states, serving adults across the country. We invest heavily in licensing support — our credentialing team handles the paperwork for additional state licenses.',
  positionSummary:
    'This is a fully-remote multi-state PMHNP role. You will see patients across multiple states using a unified video platform and EHR. We support clinicians in expanding their state portfolio over time.',
  responsibilities: [
    'Conduct telehealth psychiatric evaluations and follow-ups across [N] states',
    'Maintain awareness of state-specific prescribing restrictions and telehealth rules',
    'Prescribe controlled substances via EPCS in compliance with each state\'s requirements',
    'Manage a multi-state patient panel with our scheduling team',
    'Participate in monthly virtual case-consultation and clinical-supervision meetings',
  ],
  preferredQuals: [
    'Multi-state licensure (compact RN strongly preferred) — we support adding additional states',
    '[N]+ years clinical experience',
    'Comfort with state-by-state telehealth nuances',
    '[Spanish / specify] fluency',
  ],
  schedule:
    'Flexible. Full-time is [N] clinical hours per week within hours of operation across your licensed time zones.',
  whyJoin:
    '[What makes your multi-state operation distinctive — licensing support team, clinician-led policy, transparent outcomes, etc.]',
});

// ─── Specialty / setting templates ───────────────────────────────

const FQHC_COMMUNITY_HEALTH_BODY = buildTemplate({
  aboutBlurb:
    'We are a Federally Qualified Health Center (FQHC) serving [rural / urban underserved / specify] patients. Our behavioral health team is integrated within primary care using a [collaborative care / co-located] model.',
  positionSummary:
    'This is a PMHNP role embedded in our primary-care team. You will see patients of all ages and acuity levels, with a strong emphasis on accessibility, harm reduction, and culturally responsive care.',
  responsibilities: [
    'Conduct psychiatric evaluations for adults [and pediatrics — specify scope]',
    'Provide warm hand-offs with primary-care providers',
    'Manage psychotropic medications across diagnostic categories',
    'Coordinate with [behavioral-health consultants / care managers / community-health workers]',
    'Document in our EHR ([NextGen / Epic / OCHIN / specify])',
    'Participate in clinic-wide quality-improvement initiatives',
  ],
  preferredQuals: [
    'Comfort with high-acuity, underserved populations',
    'Experience with [Medicaid / sliding-scale / HRSA-funded] care environments',
    '[Spanish / specify] strongly preferred',
    'Interest in HRSA NHSC service commitment a plus',
  ],
  schedule:
    'Monday through Friday [8–5 / specify]. No nights, weekends, or call. [X] weeks PTO plus paid CME.',
  whyJoin:
    'HRSA NHSC loan repayment eligible — up to $[50,000+] for a 2-year service commitment. [Add specifics about your mission and team.]',
});

const CORRECTIONAL_FORENSIC_BODY = buildTemplate({
  aboutBlurb:
    'We provide psychiatric care within [state / county / federal] correctional settings, serving incarcerated adults with mental-health needs.',
  positionSummary:
    'This is a correctional PMHNP role focused on psychiatric evaluation, medication management, and crisis response within a [secure facility / specify]. You will work as part of a multidisciplinary team alongside corrections staff, mental-health counselors, and medical providers.',
  responsibilities: [
    'Conduct psychiatric evaluations for newly incarcerated individuals and chronic-care follow-ups',
    'Prescribe and titrate psychotropic medications appropriate for correctional settings',
    'Respond to mental-health crises and acute decompensations within the facility',
    'Coordinate with corrections officers, counselors, and medical staff',
    'Document per [your state DOC / NCCHC / ACA] standards',
    'Participate in suicide prevention and segregation review processes',
  ],
  preferredQuals: [
    '[N]+ years of psychiatric experience (correctional experience preferred)',
    'Comfort with [NCCHC / ACA accreditation] requirements',
    'Trauma-informed care training',
    'Experience with [substance use / SMI / forensic populations]',
  ],
  schedule:
    '[Monday-Friday day shifts / specify]. [No on-call / on-call rotation specifics].',
  whyJoin:
    '[Mission language — public service, underserved population, loan repayment, retirement benefits, etc.]',
});

const ECT_INTERVENTIONAL_BODY = buildTemplate({
  aboutBlurb:
    'We are an interventional psychiatry program offering ECT, TMS, [ketamine / esketamine / specify] alongside traditional psychiatric care for treatment-resistant conditions.',
  positionSummary:
    'This is a PMHNP role within our interventional psychiatry team. You will manage referrals, conduct pre- and post-treatment evaluations, and provide medication management for patients undergoing ECT, TMS, or [other modalities].',
  responsibilities: [
    'Conduct pre-treatment evaluations for ECT/TMS candidates',
    'Manage psychotropic medications before, during, and after interventional treatment courses',
    'Provide post-treatment follow-up including cognitive screening and outcome tracking',
    'Coordinate with anesthesia, nursing, and treatment teams',
    'Lead patient/family education on interventional treatment options',
    'Document per [your facility / Joint Commission] requirements',
  ],
  preferredQuals: [
    '[N]+ years of psychiatric experience including treatment-resistant cases',
    'Familiarity with ECT, TMS, and ketamine/esketamine protocols',
    'Comfort with cognitive screening tools and outcome measurement',
    '[Specific training in interventional psychiatry a plus]',
  ],
  schedule:
    '[Clinic-based weekday hours / specify rotation with treatment days]. [Any call or weekend coverage].',
  whyJoin:
    '[Distinctive features — research opportunities, multi-modality program, neuromodulation expertise, etc.]',
});

const CRISIS_EMERGENCY_BODY = buildTemplate({
  aboutBlurb:
    'We provide psychiatric crisis assessment and stabilization in [emergency department / crisis stabilization unit / mobile crisis team — specify].',
  positionSummary:
    'This is a crisis PMHNP role focused on rapid psychiatric evaluation, risk stratification, disposition planning, and short-term stabilization. You will work alongside ED physicians, crisis counselors, and case managers.',
  responsibilities: [
    'Conduct emergency psychiatric evaluations with rapid risk and disposition assessment',
    'Initiate stabilization including medication, brief crisis intervention, and safety planning',
    'Coordinate inpatient admissions, outpatient referrals, and community resources',
    'Document and complete involuntary-commitment paperwork per {{state}} law',
    'Provide brief crisis psychoeducation to patients and families',
    'Participate in team debriefs and quality reviews',
  ],
  preferredQuals: [
    '[N]+ years of psychiatric experience (acute or ED preferred)',
    'BLS required; ACLS preferred',
    'Familiarity with civil commitment statutes in {{state}}',
    'Comfort with high-acuity, high-volume environments',
  ],
  schedule:
    '[12-hour shifts / 8-hour rotations / specify]. [Weekend and overnight coverage / day-shift only].',
  whyJoin:
    '[Distinctive features — interdisciplinary team, public-health mission, salary differentials for nights/weekends, etc.]',
});

// ─── Exported registry ────────────────────────────────────────────

export const JD_TEMPLATES: ReadonlyArray<JdTemplate> = Object.freeze([
  // Outpatient
  {
    id: 'outpatient-adult',
    category: 'outpatient',
    label: 'Outpatient — Adult',
    summary: 'General adult outpatient psychiatry. Med management + brief therapy in a clinic setting.',
    setting: 'Outpatient',
    population: 'Adults',
    body: OUTPATIENT_ADULT_BODY,
  },
  {
    id: 'outpatient-child-adolescent',
    category: 'outpatient',
    label: 'Outpatient — Child & Adolescent',
    summary: 'Pediatric/adolescent psychiatry. Developmentally-informed care, parent/school collaboration.',
    setting: 'Outpatient',
    population: 'Child & Adolescent',
    body: OUTPATIENT_CHILD_ADOLESCENT_BODY,
  },
  {
    id: 'outpatient-geriatric',
    category: 'outpatient',
    label: 'Outpatient — Geriatric',
    summary: 'Late-life psychiatry. Cognitive concerns, dementia care, polypharmacy management.',
    setting: 'Outpatient',
    population: 'Geriatric',
    body: OUTPATIENT_GERIATRIC_BODY,
  },
  {
    id: 'outpatient-substance-use',
    category: 'outpatient',
    label: 'Outpatient — Substance Use / MAT',
    summary: 'Medication-assisted treatment + dual-diagnosis psychiatric care.',
    setting: 'Outpatient',
    population: 'Substance Use / Dual Diagnosis',
    body: OUTPATIENT_SUBSTANCE_USE_BODY,
  },

  // Inpatient
  {
    id: 'inpatient-adult-acute',
    category: 'inpatient',
    label: 'Inpatient — Adult Acute',
    summary: 'Acute psychiatric admissions and rounding on a locked adult unit.',
    setting: 'Inpatient',
    population: 'Adults',
    body: INPATIENT_ADULT_ACUTE_BODY,
  },
  {
    id: 'inpatient-child-adolescent',
    category: 'inpatient',
    label: 'Inpatient — Child & Adolescent',
    summary: 'Acute pediatric/adolescent inpatient. Family-centered stabilization and discharge planning.',
    setting: 'Inpatient',
    population: 'Child & Adolescent',
    body: INPATIENT_CHILD_ADOLESCENT_BODY,
  },

  // Telehealth
  {
    id: 'telehealth-adult',
    category: 'telehealth',
    label: 'Telehealth — Adult',
    summary: 'Fully-remote video-based adult psychiatric care, single state.',
    setting: 'Telehealth',
    population: 'Adults',
    body: TELEHEALTH_ADULT_BODY,
  },
  {
    id: 'telehealth-multistate',
    category: 'telehealth',
    label: 'Telehealth — Multi-State',
    summary: 'Multi-state telepsychiatry with licensing-support team.',
    setting: 'Telehealth',
    population: 'Adults',
    body: TELEHEALTH_MULTISTATE_BODY,
  },

  // Specialty
  {
    id: 'fqhc-community-health',
    category: 'specialty',
    label: 'FQHC / Community Health',
    summary: 'Integrated behavioral health in federally-qualified or community health center.',
    setting: 'Community Health',
    population: 'All Ages',
    body: FQHC_COMMUNITY_HEALTH_BODY,
  },
  {
    id: 'correctional-forensic',
    category: 'specialty',
    label: 'Correctional / Forensic',
    summary: 'Psychiatric care within state, county, or federal correctional settings.',
    setting: 'Corrections',
    population: 'Adults',
    body: CORRECTIONAL_FORENSIC_BODY,
  },
  {
    id: 'ect-interventional',
    category: 'specialty',
    label: 'ECT / Interventional Psychiatry',
    summary: 'ECT, TMS, ketamine — treatment-resistant psychiatric care.',
    setting: 'Outpatient',
    population: 'Adults',
    body: ECT_INTERVENTIONAL_BODY,
  },
  {
    id: 'crisis-emergency',
    category: 'specialty',
    label: 'Crisis / Emergency Psych',
    summary: 'ED-embedded or crisis-stabilization psychiatric evaluation and disposition.',
    setting: 'Emergency / Crisis',
    population: 'Adults',
    body: CRISIS_EMERGENCY_BODY,
  },
]);

export const TEMPLATE_CATEGORY_LABELS: Readonly<Record<JdTemplateCategory, string>> = Object.freeze({
  outpatient: 'Outpatient',
  inpatient: 'Inpatient',
  telehealth: 'Telehealth',
  specialty: 'Specialty Settings',
});

/**
 * Replace `{{token}}` placeholders with values from the current form
 * draft. Falls back to a generic phrase for empty values so a template
 * inserted before the employer fills in their company name still reads
 * naturally. Anything in [square brackets] is left as-is — those are
 * intentional prompts to the human to fill in.
 */
export function renderTemplate(
  template: JdTemplate,
  vars: { employer?: string; city?: string; state?: string },
): string {
  return template.body
    .replace(/\{\{employer\}\}/g, vars.employer?.trim() || 'Our practice')
    .replace(/\{\{city\}\}/g, vars.city?.trim() || 'your area')
    .replace(/\{\{state\}\}/g, vars.state?.trim() || 'your state');
}

/**
 * Strip HTML and count visible characters. Mirrors the post-job form's
 * character counter so the template-quality check uses the same length
 * the employer sees.
 */
export function visibleLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length;
}
