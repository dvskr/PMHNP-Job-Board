/**
 * Deterministic (zero-AI) PMHNP resume scoring engine.
 *
 * Pure functions only. No dependencies beyond ./types. Case-insensitive
 * matching throughout, resilient to PDF-extraction artifacts (repeated
 * spaces, line breaks mid-sentence) by scoring against both a
 * whitespace-collapsed view and a per-line view of the text.
 *
 * Weight allocation (sums to exactly 100):
 *   contact-basics          10  (email 4, phone 3, name-like first line 3)
 *   licensure               18  (APRN/PMHNP 6, RN 3, state near license 6, compact 3)
 *   certification           14  (PMHNP-BC 8, ANCC 3, board-certified phrase 3)
 *   prescriptive-authority  10  (DEA 4, controlled substances 3, prescribing 3)
 *   clinical-scope          14  (eval 2, med mgmt 3, psychotherapy 2,
 *                                populations up to 3, settings up to 2, EMR up to 2)
 *   quantified-impact       14  (distinct quantified lines: 1=5, 2=8, 3=11, 4+=14)
 *   structure               12  (sections 6, length 4, no first-person pronouns 2)
 *   recency-dates            8  (years present 3, current-role marker 3,
 *                                most recent year within a decade 2)
 *
 * Documented heuristic tradeoffs:
 * - Two-letter state codes are matched uppercase-only (full state names are
 *   case-insensitive) to avoid false positives on common words like "in",
 *   "or", "me", and "hi".
 * - "Near" for licensure-state proximity means within 100 characters of a
 *   licensure keyword in the collapsed text, which survives PDF line breaks.
 * - The recency check needs a reference year; callers may pin one via the
 *   optional second argument for reproducible output, otherwise the current
 *   calendar year is used.
 */

import type { ResumeScoreDimension, ResumeScoreGrade, ResumeScoreResult } from './types';

export type { ResumeScoreDimension, ResumeScoreGrade, ResumeScoreResult } from './types';

interface ResumeContext {
    /** Whitespace-collapsed full text, original casing preserved. */
    collapsed: string;
    /** Lowercased collapsed text (same indices as collapsed). */
    lower: string;
    /** Non-empty trimmed lines, original casing preserved. */
    lines: string[];
    wordCount: number;
    referenceYear: number;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(\+?1[\s.()-]{0,2})?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const STATE_PROXIMITY_WINDOW = 100;

const STATE_NAMES = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
    'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
    'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
    'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
    'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
    'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
    'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
    'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
    'district of columbia',
];

const STATE_CODES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
    'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
    'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
    'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

const QUANT_CONTEXT_RE = new RegExp(
    '%|\\$\\s?\\d|\\b\\d+\\s?(?:to|-)\\s?\\d+\\b|\\b(patients?|clients?|caseload|panel|'
    + 'visits?|appointments?|beds?|encounters?|admissions?|referrals?|census|hours?|'
    + 'productivity|satisfaction|readmissions?|adherence|nurses?|staff|providers?|'
    + 'clinics?|sites?|units?)\\b',
    'i',
);

export function scoreResumeText(rawText: string, referenceYear?: number): ResumeScoreResult {
    const ctx = buildContext(rawText, referenceYear ?? new Date().getFullYear());
    const dimensions = [
        scoreContactBasics(ctx),
        scoreLicensure(ctx),
        scoreCertification(ctx),
        scorePrescriptiveAuthority(ctx),
        scoreClinicalScope(ctx),
        scoreQuantifiedImpact(ctx),
        scoreStructure(ctx),
        scoreRecencyDates(ctx),
    ];
    const total = clamp(dimensions.reduce((sum, d) => sum + d.score, 0), 0, 100);
    return { total, grade: toGrade(total), dimensions };
}

function buildContext(rawText: string, referenceYear: number): ResumeContext {
    const collapsed = rawText.replace(/\s+/g, ' ').trim();
    const lines = rawText
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0);
    return {
        collapsed,
        lower: collapsed.toLowerCase(),
        lines,
        wordCount: collapsed.length === 0 ? 0 : collapsed.split(' ').length,
        referenceYear,
    };
}

function toGrade(total: number): ResumeScoreGrade {
    if (total >= 85) return 'strong';
    if (total >= 70) return 'solid';
    if (total >= 50) return 'needs-work';
    return 'critical';
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function dim(
    key: string,
    label: string,
    score: number,
    max: number,
    findings: string[],
): ResumeScoreDimension {
    return { key, label, score: clamp(score, 0, max), max, findings };
}

/** Indices of every match of pattern in text. Pattern source must be global-safe. */
function matchIndices(text: string, pattern: RegExp): number[] {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    const indices: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        indices.push(match.index);
        if (re.lastIndex === match.index) re.lastIndex += 1;
    }
    return indices;
}

function hasNearbyMatch(aIndices: number[], bIndices: number[], window: number): boolean {
    return aIndices.some((a) => bIndices.some((b) => Math.abs(a - b) <= window));
}

function countMatches(text: string, patterns: RegExp[]): number {
    return patterns.filter((pattern) => pattern.test(text)).length;
}

/** Awards points and pushes the matching finding; always pushes exactly one finding. */
function applyCheck(
    haystack: string,
    findings: string[],
    points: number,
    pattern: RegExp,
    presentFinding: string,
    missingFinding: string,
): number {
    if (pattern.test(haystack)) {
        findings.push(presentFinding);
        return points;
    }
    findings.push(missingFinding);
    return 0;
}

// ---------------------------------------------------------------------------
// Dimension 1: contact-basics (10)
// ---------------------------------------------------------------------------

function isNameLike(line: string): boolean {
    const base = line.split(',')[0].trim();
    if (base.length === 0 || base.length > 60) return false;
    if (/[\d@]/.test(base)) return false;
    if (/\b(resume|curriculum|vitae)\b/i.test(base)) return false;
    const words = base.split(' ').filter((word) => word.length > 0);
    if (words.length < 2 || words.length > 5) return false;
    return words.filter((word) => /^[A-Z]/.test(word)).length >= 2;
}

function scoreContactBasics(ctx: ResumeContext): ResumeScoreDimension {
    const findings: string[] = [];
    let score = 0;
    score += applyCheck(ctx.collapsed, findings, 4, EMAIL_RE,
        'An email address is present.',
        'No email address was found. Add a professional email address near the top of the resume.');
    score += applyCheck(ctx.collapsed, findings, 3, PHONE_RE,
        'A phone number is present.',
        'No phone number was found. Add a direct phone number so recruiters can reach you quickly.');
    if (ctx.lines.length > 0 && isNameLike(ctx.lines[0])) {
        score += 3;
        findings.push('The resume opens with a clear name line.');
    } else {
        findings.push('The first line does not look like a name. Start the resume with your full name and credentials, for example "Jordan Avery, PMHNP-BC".');
    }
    return dim('contact-basics', 'Contact Basics', score, 10, findings);
}

// ---------------------------------------------------------------------------
// Dimension 2: licensure (18)
// ---------------------------------------------------------------------------

function hasStateNearLicense(ctx: ResumeContext): boolean {
    const licenseIdx = matchIndices(
        ctx.lower,
        /\b(rn|aprn|pmhnp|registered nurse|nurse practitioner|licens[a-z]*)\b/,
    );
    if (licenseIdx.length === 0) return false;
    const stateIdx: number[] = [];
    for (const name of STATE_NAMES) {
        stateIdx.push(...matchIndices(ctx.lower, new RegExp(`\\b${name}\\b`)));
    }
    for (const code of STATE_CODES) {
        stateIdx.push(...matchIndices(ctx.collapsed, new RegExp(`\\b${code}\\b`)));
    }
    return hasNearbyMatch(licenseIdx, stateIdx, STATE_PROXIMITY_WINDOW);
}

function scoreLicensure(ctx: ResumeContext): ResumeScoreDimension {
    const findings: string[] = [];
    let score = 0;
    const hasAdvanced = /\b(aprn|pmhnp|nurse practitioner|advanced practice)\b/.test(ctx.lower);
    const hasRn = /\brn\b|\bregistered nurse\b/.test(ctx.lower);
    score += hasAdvanced ? 6 : 0;
    findings.push(hasAdvanced
        ? 'Advanced practice licensure (APRN or PMHNP) is mentioned.'
        : 'No APRN or PMHNP licensure mention was found. State your advanced practice license explicitly, for example "APRN license, Texas Board of Nursing".');
    score += hasRn ? 3 : 0;
    findings.push(hasRn
        ? 'RN licensure is mentioned.'
        : 'No RN licensure mention was found. List your RN license alongside your APRN credential.');
    if ((hasAdvanced || hasRn) && hasStateNearLicense(ctx)) {
        score += 6;
        findings.push('A US state is listed near your licensure, which recruiters need for state matching.');
    } else if (hasAdvanced || hasRn) {
        findings.push('No US state was found near your licensure mentions. Add the issuing state next to each license so recruiters can match you to state specific roles.');
    }
    if ((hasAdvanced || hasRn) && /\b(compact|multi[\s-]?state|multistate|nurse licensure compact|nlc)\b/.test(ctx.lower)) {
        score += 3;
        findings.push('Compact or multistate licensure is mentioned, which widens your job match pool.');
    } else if (hasAdvanced || hasRn) {
        findings.push('If you hold compact or multistate privileges, say so. Multistate licensure is a strong differentiator for telehealth roles.');
    }
    return dim('licensure', 'Licensure', score, 18, findings);
}

// ---------------------------------------------------------------------------
// Dimension 3: certification (14)
// ---------------------------------------------------------------------------

function scoreCertification(ctx: ResumeContext): ResumeScoreDimension {
    const findings: string[] = [];
    let score = 0;
    score += applyCheck(ctx.lower, findings, 8, /\bpmhnp[\s-]?bc\b/,
        'The PMHNP-BC credential is present, which is the certification most employers screen for.',
        'The PMHNP-BC credential was not found. Employers and applicant tracking systems filter on PMHNP-BC, so list it next to your name and in a certifications section if you hold it.');
    score += applyCheck(ctx.lower, findings, 3, /\bancc\b|american nurses credentialing center/,
        'ANCC is named as the certifying body, which adds credibility.',
        'ANCC is not mentioned. Naming the certifying body, for example "ANCC" or "American Nurses Credentialing Center", strengthens your certification entry.');
    score += applyCheck(ctx.lower, findings, 3, /board[\s-]?certif/,
        'Board certification language is present.',
        'Consider adding the phrase "board certified" to your summary because many recruiter searches use that exact wording.');
    return dim('certification', 'Certification', score, 14, findings);
}

// ---------------------------------------------------------------------------
// Dimension 4: prescriptive-authority (10)
// ---------------------------------------------------------------------------

function scorePrescriptiveAuthority(ctx: ResumeContext): ResumeScoreDimension {
    const findings: string[] = [];
    let score = 0;
    score += applyCheck(ctx.lower, findings, 4, /\bdea\b/,
        'DEA registration is mentioned.',
        'No DEA registration was found. If you hold an active DEA registration, list it because most PMHNP roles require it.');
    score += applyCheck(ctx.lower, findings, 3,
        /\bcontrolled substances?\b|\bschedule (ii|iii|iv|v|2|3|4|5)\b|\bbuprenorphine\b|\bsuboxone\b/,
        'Controlled substance experience is described.',
        'Controlled substance experience is not mentioned. Describe your experience prescribing or monitoring controlled substances if you have it.');
    score += applyCheck(ctx.lower, findings, 3, /\bprescriptive authority\b|\bprescrib[a-z]*\b/,
        'Prescribing language is present.',
        'No prescribing language was found. Use words like "prescribed" or "prescriptive authority" to show independent practice capability.');
    return dim('prescriptive-authority', 'Prescriptive Authority', score, 10, findings);
}

// ---------------------------------------------------------------------------
// Dimension 5: clinical-scope (14)
// ---------------------------------------------------------------------------

function scoreEmr(ctx: ResumeContext, findings: string[]): number {
    const named = /\b(epic|cerner|athena(health)?|eclinicalworks|meditech|allscripts|nextgen|practice fusion|kareo|valant|credible|drchrono|osmind)\b/;
    if (named.test(ctx.lower)) {
        findings.push('A named EMR system is listed, which helps with employer system matching.');
        return 2;
    }
    if (/\bemr\b|\behr\b|electronic (health|medical) record/.test(ctx.lower)) {
        findings.push('Generic EMR experience is mentioned. Naming the specific system, such as Epic or Cerner, is stronger.');
        return 1;
    }
    findings.push('No EMR experience was found. List the systems you have charted in, such as Epic, Cerner, or Athena.');
    return 0;
}

function scoreClinicalScope(ctx: ResumeContext): ResumeScoreDimension {
    const findings: string[] = [];
    let score = 0;
    score += applyCheck(ctx.lower, findings, 2,
        /psychiatric evaluation|psych eval|diagnostic (assessment|evaluation)|initial evaluation|mental status exam|intake assessment/,
        'Psychiatric evaluation experience is described.',
        'Describe psychiatric evaluation work, for example "Conducted comprehensive psychiatric evaluations and diagnostic assessments".');
    score += applyCheck(ctx.lower, findings, 3,
        /medication management|med management|psychopharmacolog|medication review|titrat/,
        'Medication management experience is described.',
        'Medication management is the core PMHNP function. Add explicit medication management language to your experience bullets.');
    score += applyCheck(ctx.lower, findings, 2,
        /psychotherap|\bcbt\b|\bdbt\b|motivational interviewing|\btherapy\b/,
        'Psychotherapy or therapy modality experience is described.',
        'Mention psychotherapy exposure or specific modalities such as CBT, DBT, or motivational interviewing.');
    const populations = countMatches(ctx.lower, [
        /\b(child(ren)?|adolescents?|pediatric|youth)\b/,
        /\badults?\b/,
        /\b(geriatric|older adults?|seniors)\b/,
    ]);
    score += Math.min(populations, 3);
    findings.push(populations > 0
        ? `Patient populations are specified for ${populations} of 3 age groups.`
        : 'No patient populations were found. Name the age groups you treat, such as adults, adolescents, or geriatric patients.');
    const settings = countMatches(ctx.lower, [
        /\binpatient\b/, /\boutpatient\b/, /\b(telehealth|telepsychiatry|telemedicine)\b/,
    ]);
    score += Math.min(settings, 2);
    findings.push(settings > 0
        ? 'Care settings such as inpatient, outpatient, or telehealth are specified.'
        : 'No care settings were found. State whether your experience is inpatient, outpatient, or telehealth.');
    score += scoreEmr(ctx, findings);
    return dim('clinical-scope', 'Clinical Scope', score, 14, findings);
}

// ---------------------------------------------------------------------------
// Dimension 6: quantified-impact (14)
// ---------------------------------------------------------------------------

function isQuantifiedLine(line: string): boolean {
    const cleaned = line
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' ')
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/(\+?1[\s.()-]{0,2})?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g, ' ')
        .replace(/\b\d{1,2}[/.]\d{1,2}([/.]\d{2,4})?\b/g, ' ')
        .replace(/\b(19|20)\d{2}\b/g, ' ');
    return /\d/.test(cleaned) && QUANT_CONTEXT_RE.test(cleaned);
}

function quantifiedTier(count: number): number {
    if (count >= 4) return 14;
    if (count === 3) return 11;
    if (count === 2) return 8;
    if (count === 1) return 5;
    return 0;
}

function scoreQuantifiedImpact(ctx: ResumeContext): ResumeScoreDimension {
    const count = new Set(ctx.lines.filter(isQuantifiedLine)).size;
    const findings: string[] = [];
    if (count === 0) {
        findings.push('No quantified accomplishments were found, which is the most common resume weakness.');
        findings.push('Rewrite your top bullets with numbers. For example, change "Managed patient medications" to "Managed medications for a caseload of 60 patients, seeing 18 to 22 patients daily with a 92% follow up adherence rate".');
    } else if (count < 4) {
        findings.push(`Found ${count} quantified ${count === 1 ? 'line' : 'lines'}. Aim for at least 4 by adding caseload sizes, daily patient volume, or outcome percentages to more bullets.`);
    } else {
        findings.push(`Found ${count} quantified lines with concrete numbers, which makes your impact easy to evaluate.`);
    }
    return dim('quantified-impact', 'Quantified Impact', quantifiedTier(count), 14, findings);
}

// ---------------------------------------------------------------------------
// Dimension 7: structure (12)
// ---------------------------------------------------------------------------

function scoreLength(ctx: ResumeContext, findings: string[]): number {
    const wc = ctx.wordCount;
    if (wc >= 350 && wc <= 1200) {
        findings.push(`Length of ${wc} words is in the ideal range of roughly 350 to 1200 words.`);
        return 4;
    }
    if ((wc >= 200 && wc < 350) || (wc > 1200 && wc <= 1800)) {
        findings.push(wc < 350
            ? `At ${wc} words the resume is on the short side. Expand your experience bullets toward at least 350 words.`
            : `At ${wc} words the resume is on the long side. Trim toward 1200 words or fewer.`);
        return 2;
    }
    findings.push(wc < 200
        ? `At ${wc} words the resume is far too short to compete. Build it out with detailed experience bullets.`
        : `At ${wc} words the resume is far too long. Cut it to roughly two pages of the most relevant psychiatric experience.`);
    return 0;
}

function scorePronouns(ctx: ResumeContext, findings: string[]): number {
    if (ctx.wordCount < 100) {
        findings.push('The resume is too short to evaluate bullet writing style.');
        return 0;
    }
    const standaloneI = (ctx.collapsed.match(/(^|[^A-Za-z])I(?![A-Za-z])/g) ?? []).length;
    const myCount = (ctx.lower.match(/\bmy\b/g) ?? []).length;
    const count = standaloneI + myCount;
    if (count === 0) {
        findings.push('Bullets avoid first person pronouns, which reads as professional resume style.');
        return 2;
    }
    if (count <= 2) {
        findings.push('A few first person pronouns such as "I" or "my" were found. Rewrite those lines to start with strong action verbs instead.');
        return 1;
    }
    findings.push('First person pronouns such as "I" and "my" appear repeatedly. Resume bullets should start with action verbs, for example "Managed a caseload of 60 patients" instead of "I managed patients".');
    return 0;
}

function scoreStructure(ctx: ResumeContext): ResumeScoreDimension {
    const findings: string[] = [];
    let score = 0;
    score += applyCheck(ctx.lower, findings, 2, /\b(experience|employment|work history)\b/,
        'An experience section is present.',
        'No experience section was found. Add a clearly labeled professional experience section.');
    score += applyCheck(ctx.lower, findings, 2, /\beducation\b/,
        'An education section is present.',
        'No education section was found. List your MSN or DNP program with graduation year.');
    score += applyCheck(ctx.lower, findings, 1, /licens|certif/,
        'A licenses or certifications section is present.',
        'No licenses or certifications section was found. Group your credentials in a dedicated section so screeners find them fast.');
    score += applyCheck(ctx.lower, findings, 1, /\b(skills|summary|objective)\b/,
        'A skills or summary section is present.',
        'No skills or summary section was found. Add a short professional summary that names your specialty and populations.');
    score += scoreLength(ctx, findings);
    score += scorePronouns(ctx, findings);
    return dim('structure', 'Structure', score, 12, findings);
}

// ---------------------------------------------------------------------------
// Dimension 8: recency-dates (8)
// ---------------------------------------------------------------------------

function scoreRecencyDates(ctx: ResumeContext): ResumeScoreDimension {
    const findings: string[] = [];
    let score = 0;
    const years = (ctx.collapsed.match(new RegExp(YEAR_RE.source, 'g')) ?? []).map(Number);
    if (years.length > 0) {
        score += 3;
        findings.push('Employment dates with four digit years are present.');
    } else {
        findings.push('No four digit years were found. Add start and end years to every role so recruiters can verify your experience timeline.');
    }
    if (/\b(present|current(ly)?)\b/i.test(ctx.collapsed)) {
        score += 3;
        findings.push('A current role indicator such as "Present" is included.');
    } else {
        findings.push('No current role indicator was found. Mark your active role with "to Present" so employers know you are practicing now.');
    }
    const maxYear = years.length > 0 ? Math.max(...years) : 0;
    if (years.length > 0 && maxYear >= ctx.referenceYear - 10) {
        score += 2;
        findings.push('The most recent dates fall within the last decade.');
    } else if (years.length > 0) {
        findings.push(`The most recent year found is ${maxYear}, which makes the resume look out of date. Add your recent roles with current dates.`);
    }
    return dim('recency-dates', 'Recency and Dates', score, 8, findings);
}
