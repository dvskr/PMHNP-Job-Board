/**
 * Deterministic PMHNP resume scoring engine (lib/resume-score/score.ts).
 * Pure function suite. No DB, no network, no AI.
 */
import { describe, it, expect } from 'vitest';
import { scoreResumeText } from '@/lib/resume-score/score';
import type { ResumeScoreDimension, ResumeScoreResult } from '@/lib/resume-score/types';

const REFERENCE_YEAR = 2026;

const EXPECTED_KEYS = [
    'contact-basics',
    'licensure',
    'certification',
    'prescriptive-authority',
    'clinical-scope',
    'quantified-impact',
    'structure',
    'recency-dates',
];

function getDim(result: ResumeScoreResult, key: string): ResumeScoreDimension {
    const dimension = result.dimensions.find((d) => d.key === key);
    if (!dimension) throw new Error(`Missing dimension ${key}`);
    return dimension;
}

const STRONG_RESUME = `Jordan Avery, PMHNP-BC
jordan.avery@example.com | (555) 210-4478 | Austin, TX

PROFESSIONAL SUMMARY
Board certified Psychiatric Mental Health Nurse Practitioner with seven years of combined psychiatric nursing and advanced practice experience across inpatient, outpatient, and telehealth settings. Comfortable managing complex psychopharmacology for child, adolescent, adult, and geriatric populations. Known for structured diagnostic assessment, collaborative treatment planning, and high patient satisfaction across diverse care teams.

LICENSES
APRN license, Texas Board of Nursing, active through 2027
RN license, Texas, multistate privileges under the Nurse Licensure Compact
DEA registration with full prescriptive authority for controlled substances, Schedule II through Schedule V

CERTIFICATIONS
PMHNP-BC, American Nurses Credentialing Center (ANCC), issued 2021
Basic Life Support, American Heart Association

PROFESSIONAL EXPERIENCE

Psychiatric Mental Health Nurse Practitioner
Lakeside Behavioral Health, Austin, TX, 2021 to Present
Conducted comprehensive psychiatric evaluations and diagnostic assessments for adult and geriatric patients in a high volume outpatient clinic
Managed medication regimens for a caseload of 320 active patients, seeing 18 to 22 patients daily across clinic and telehealth visits
Provided medication management and supportive psychotherapy, including CBT informed interventions and motivational interviewing, for adolescents and adults
Reduced the 30 day readmission rate by 15% through structured follow up scheduling and close collaboration with case managers
Prescribed and monitored controlled substances including stimulants and buprenorphine under active DEA registration
Documented all encounters in Epic and supported the clinic wide transition from Cerner with superuser training sessions
Precepted PMHNP students each academic year in collaboration with the local university program

Registered Nurse, Inpatient Psychiatry
Austin State Hospital, Austin, TX, 2018 to 2021
Delivered psychiatric nursing care on a 24 bed adult inpatient unit with acute presentations
Administered scheduled and PRN psychotropic medications and monitored treatment response and side effects
Trained 6 new graduate nurses on medication administration, documentation, and de escalation protocols
Served on the unit safety committee and contributed to a 20% reduction in restraint events over two years

EDUCATION
Master of Science in Nursing, Psychiatric Mental Health Nurse Practitioner track
University of Texas at Austin, 2020
Bachelor of Science in Nursing, Texas State University, 2016

SKILLS
Psychiatric evaluation, medication management, psychotherapy, telehealth, telepsychiatry, child and adolescent psychiatry, geriatric psychiatry, crisis intervention, Epic, Cerner, Athena`;

const WEAK_RESUME = `Sam Miller
sam.miller@example.com
(555) 302-1188

OBJECTIVE
I am a dedicated registered nurse looking for my next opportunity in a supportive hospital environment where I can grow my career.

EXPERIENCE
Registered Nurse
General Hospital | 2019 to Present
I provide bedside care for patients on a busy medical surgical floor.
Responsible for administering medications and updating charts.
I communicate with families and coordinate with the care team.
Assist physicians during rounds and procedures.

Staff Nurse
Community Clinic | 2016 to 2019
Supported daily clinic operations and patient intake.
My duties included taking vitals and preparing exam rooms.

EDUCATION
Associate Degree in Nursing, City Community College, 2016

SKILLS
Patient care, teamwork, communication, time management`;

describe('scoreResumeText: output contract', () => {
    it('returns all 8 dimensions with stable kebab-case keys in order', () => {
        const result = scoreResumeText(STRONG_RESUME, REFERENCE_YEAR);
        expect(result.dimensions.map((d) => d.key)).toEqual(EXPECTED_KEYS);
    });

    it('dimension max values sum to exactly 100', () => {
        const result = scoreResumeText(STRONG_RESUME, REFERENCE_YEAR);
        expect(result.dimensions.reduce((sum, d) => sum + d.max, 0)).toBe(100);
    });

    it('total equals the sum of dimension scores', () => {
        for (const text of [STRONG_RESUME, WEAK_RESUME, '']) {
            const result = scoreResumeText(text, REFERENCE_YEAR);
            expect(result.total).toBe(result.dimensions.reduce((sum, d) => sum + d.score, 0));
        }
    });

    it('every dimension score stays within 0 and its max', () => {
        for (const text of [STRONG_RESUME, WEAK_RESUME, '']) {
            for (const d of scoreResumeText(text, REFERENCE_YEAR).dimensions) {
                expect(d.score).toBeGreaterThanOrEqual(0);
                expect(d.score).toBeLessThanOrEqual(d.max);
            }
        }
    });
});

describe('scoreResumeText: fixtures', () => {
    it('a realistic strong PMHNP resume scores 85 or higher with grade strong', () => {
        const result = scoreResumeText(STRONG_RESUME, REFERENCE_YEAR);
        expect(result.total).toBeGreaterThanOrEqual(85);
        expect(result.grade).toBe('strong');
    });

    it('a weak generic RN resume scores under 50', () => {
        const result = scoreResumeText(WEAK_RESUME, REFERENCE_YEAR);
        expect(result.total).toBeLessThan(50);
        expect(result.grade).toBe('critical');
    });

    it('the weak resume gets actionable licensure findings about states and APRN', () => {
        const licensure = getDim(scoreResumeText(WEAK_RESUME, REFERENCE_YEAR), 'licensure');
        expect(licensure.score).toBeLessThan(licensure.max);
        const joined = licensure.findings.join(' ');
        expect(joined).toMatch(/APRN or PMHNP/);
        expect(joined).toMatch(/state/i);
    });

    it('the weak resume gets a quantified-impact finding with a concrete PMHNP example', () => {
        const quantified = getDim(scoreResumeText(WEAK_RESUME, REFERENCE_YEAR), 'quantified-impact');
        expect(quantified.score).toBe(0);
        const joined = quantified.findings.join(' ');
        expect(joined).toMatch(/most common resume weakness/i);
        expect(joined).toMatch(/caseload of 60 patients/);
        expect(joined).toMatch(/18 to 22/);
    });

    it('an empty string does not crash: total 0, grade critical, all findings present', () => {
        const result = scoreResumeText('', REFERENCE_YEAR);
        expect(result.total).toBe(0);
        expect(result.grade).toBe('critical');
        expect(result.dimensions).toHaveLength(8);
        for (const d of result.dimensions) {
            expect(d.score).toBe(0);
            expect(d.findings.length).toBeGreaterThan(0);
        }
    });
});

describe('scoreResumeText: determinism and findings quality', () => {
    it('is deterministic: same input twice returns identical results', () => {
        const first = scoreResumeText(STRONG_RESUME, REFERENCE_YEAR);
        const second = scoreResumeText(STRONG_RESUME, REFERENCE_YEAR);
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });

    it('every dimension always returns at least one finding for any input', () => {
        for (const text of [STRONG_RESUME, WEAK_RESUME, '', 'x', '12345']) {
            for (const d of scoreResumeText(text, REFERENCE_YEAR).dimensions) {
                expect(d.findings.length).toBeGreaterThan(0);
            }
        }
    });

    it('findings are complete sentences with no em or en dashes', () => {
        for (const text of [STRONG_RESUME, WEAK_RESUME, '']) {
            for (const d of scoreResumeText(text, REFERENCE_YEAR).dimensions) {
                for (const finding of d.findings) {
                    expect(finding).not.toMatch(/[–—]/);
                    expect(finding.trim().endsWith('.')).toBe(true);
                }
            }
        }
    });

    it('tolerates PDF-extraction artifacts: extra spaces and mid-sentence line breaks', () => {
        const mangled = STRONG_RESUME
            .replace(/ /g, '  ')
            .replace(/prescriptive authority/i, 'prescriptive\nauthority')
            .replace(/medication management/i, 'medication\n   management');
        const result = scoreResumeText(mangled, REFERENCE_YEAR);
        expect(result.total).toBeGreaterThanOrEqual(85);
        expect(getDim(result, 'prescriptive-authority').score).toBe(10);
    });
});

describe('scoreResumeText: per-dimension behavior', () => {
    it('quantified-impact: a resume with numbers outscores the same resume with numbers stripped', () => {
        const withNumbers = getDim(scoreResumeText(STRONG_RESUME, REFERENCE_YEAR), 'quantified-impact');
        const stripped = getDim(
            scoreResumeText(STRONG_RESUME.replace(/[0-9]/g, ''), REFERENCE_YEAR),
            'quantified-impact',
        );
        expect(withNumbers.score).toBeGreaterThan(stripped.score);
        expect(stripped.score).toBe(0);
    });

    it('licensure: a license with a state nearby outscores the same license without one', () => {
        const withState = getDim(
            scoreResumeText('APRN license issued by the Texas Board of Nursing.', REFERENCE_YEAR),
            'licensure',
        );
        const withoutState = getDim(
            scoreResumeText('APRN license in good standing.', REFERENCE_YEAR),
            'licensure',
        );
        expect(withState.score).toBeGreaterThan(withoutState.score);
        expect(withoutState.findings.join(' ')).toMatch(/issuing state/i);
    });

    it('licensure: recognizes uppercase two-letter state codes near a license', () => {
        const result = getDim(scoreResumeText('RN license: TX, compact privileges.', REFERENCE_YEAR), 'licensure');
        expect(result.findings.join(' ')).toMatch(/US state is listed near your licensure/);
    });

    it('certification: absence of PMHNP-BC produces a finding that employers filter on it', () => {
        const cert = getDim(scoreResumeText(WEAK_RESUME, REFERENCE_YEAR), 'certification');
        expect(cert.score).toBe(0);
        expect(cert.findings.join(' ')).toMatch(/filter on PMHNP-BC/);
    });

    it('contact-basics: missing email is flagged and capped', () => {
        const contact = getDim(
            scoreResumeText('Sam Miller\nCall 555 302 1188 anytime.', REFERENCE_YEAR),
            'contact-basics',
        );
        expect(contact.score).toBeLessThanOrEqual(6);
        expect(contact.findings.join(' ')).toMatch(/no email address/i);
    });

    it('recency-dates: decade-old-only dates score lower than current dates', () => {
        const stale = getDim(
            scoreResumeText('Registered Nurse, General Hospital, 2009 to 2012.', REFERENCE_YEAR),
            'recency-dates',
        );
        const fresh = getDim(
            scoreResumeText('Registered Nurse, General Hospital, 2024 to Present.', REFERENCE_YEAR),
            'recency-dates',
        );
        expect(fresh.score).toBeGreaterThan(stale.score);
        expect(stale.findings.join(' ')).toMatch(/out of date/i);
        expect(fresh.score).toBe(8);
    });

    it('structure: heavy first-person pronoun use is called out', () => {
        const structure = getDim(scoreResumeText(WEAK_RESUME, REFERENCE_YEAR), 'structure');
        expect(structure.findings.join(' ')).toMatch(/first person pronouns/i);
    });
});
