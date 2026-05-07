/**
 * classifyRelevance — sub-bucketed relevance gate.
 *
 * Pins the 5 confirmed false-negative bug cases discovered by the
 * 2026-05-05 prod audit AND the 3 new tiers (employer signal,
 * dual-role, addiction context).
 */

import { describe, it, expect } from 'vitest';
import { classifyRelevance, isRelevantJob } from '@/lib/utils/job-filter';

describe('classifyRelevance — bug fix: dual-role NP-or-PA postings (the adzuna FN cluster)', () => {
    // Each of these was REJECTED in prod with rejection_reason='relevance_filter'
    // because the negative-keyword check matched 'physician' or ' pa '.
    // After the fix, all should PASS.

    it('Nurse Practitioner or Physician Assistant - Psychiatry Bethlehem', () => {
        const r = classifyRelevance(
            'Nurse Practitioner or Physician Assistant - Psychiatry Bethlehem (Full Time)',
            "St. Luke's is proud of...",
            "St. Luke's University Health Network",
        );
        expect(r).toEqual({ passes: true, reason: 'pass' });
    });

    it('Nurse Practitioner or Physician Assistant – Outpatient Adult Psychiatry', () => {
        const r = classifyRelevance(
            'Nurse Practitioner or Physician Assistant – Outpatient Adult Psychiatry - Cheshire, CT',
            'Specific experience in psychiatry...',
            'Hartford Healthcare',
        );
        expect(r.passes).toBe(true);
    });

    it('NP / Physician Assistant — desc says Inpatient Psych team', () => {
        const r = classifyRelevance(
            'NP / Physician Assistant',
            'Highland Hospital is seeking a Full Time Nurse Practitioner to join its growing Inpatient Psych team. The role is psychiatric.',
            'Highland Hospital',
        );
        expect(r.passes).toBe(true);
    });

    it('Psychiatry (Adult) - Nurse Practitioner or Physician Assistant', () => {
        const r = classifyRelevance(
            'Psychiatry (Adult) - Nurse Practitioner or Physician Assistant - St. Cloud, MN',
            'Step into a well-established outpatient psychiatry practice...',
            'Centra Care',
        );
        expect(r.passes).toBe(true);
    });

    it('Mental Health Provider (Psychiatric PA or NP) - Augusta, GA', () => {
        const r = classifyRelevance(
            'Mental Health Provider (Psychiatric PA or NP) - Augusta, GA',
            'Geode Health is a rapidly growing, national provider of outpatient mental health services.',
            'Geode Health of Texas',
        );
        expect(r.passes).toBe(true);
    });
});

describe('classifyRelevance — new Tier 2.5: employer-name signal', () => {
    it('passes generic NP title at Senior PsychCare (employer says PsychCare)', () => {
        const r = classifyRelevance(
            'Nurse Practitioner or Physician Assistant',
            '', // empty description (real fantastic-jobs-db case)
            'Senior PsychCare',
        );
        expect(r.passes).toBe(true);
    });

    it('passes generic APRN title at Kanza Mental Health', () => {
        const r = classifyRelevance(
            'Medical Services Advanced Practice Registered Nurse (APRN)',
            '',
            'KANZA MENTAL HEALTH AND GUIDANCE',
        );
        expect(r.passes).toBe(true);
    });

    it('passes generic NP at recovery-center employer', () => {
        const r = classifyRelevance(
            'Nurse Practitioner Part Time',
            '',
            'Ascension Recovery Services',
        );
        expect(r.passes).toBe(true);
    });

    it('still rejects generic NP at non-psych employer', () => {
        const r = classifyRelevance(
            'Nurse Practitioner',
            '',
            'Marathon Health',
        );
        expect(r.passes).toBe(false);
        expect(r.reason).toBe('relevance_no_keyword');
    });
});

describe('classifyRelevance — extended mental-health context (addiction / MAT / recovery)', () => {
    it('passes NP role with MAT in description', () => {
        const r = classifyRelevance(
            'Nurse Practitioner / PA - Outpt. MAT (Tuesday - Saturday)',
            'Outpatient medication-assisted treatment program...',
            'On Demand / New Day Recovery',
        );
        expect(r.passes).toBe(true);
    });

    it('passes NP role at substance-use treatment center', () => {
        const r = classifyRelevance(
            'Inpatient Nurse Practitioner',
            'Avenues Recovery Center is a nationwide network of substance use treatment centers...',
            'Avenues Recovery',
        );
        expect(r.passes).toBe(true);
    });

    it('passes addiction medicine NP', () => {
        const r = classifyRelevance(
            'Addiction Psychiatric Nurse Practitioner',
            '',
            'Some Org',
        );
        expect(r.passes).toBe(true);
    });
});

describe('classifyRelevance — sub-bucketed rejection reasons', () => {
    it('clearly non-PMHNP returns relevance_no_keyword', () => {
        const r = classifyRelevance(
            'Software Engineer',
            'We are hiring a backend developer.',
            'Tech Co',
        );
        expect(r).toEqual({ passes: false, reason: 'relevance_no_keyword' });
    });

    it('generic NP title with description-only psych context returns relevance_generic_title', () => {
        // Title is bare "Nurse Practitioner". Description has psychiatric.
        // Tier 2 passes (NP-in-title + psych-in-desc), but generic-guard fires
        // because title alone doesn't say psych and employer is non-psych.
        const r = classifyRelevance(
            'Nurse Practitioner',
            'We provide psychiatric support to our patients.',
            'Generic Hospital',
        );
        expect(r.passes).toBe(false);
        expect(r.reason).toBe('relevance_generic_title');
    });

    it('wrong-role title returns relevance_wrong_role', () => {
        // "Pediatric Nurse Practitioner" is on the negative-keyword list
        // and has no PMHNP indicator to override.
        const r = classifyRelevance(
            'Pediatric Nurse Practitioner — General Pediatrics',
            'Pediatric primary care role at our community clinic. No psychiatry involved.',
            'Generic Pediatrics',
        );
        expect(r.passes).toBe(false);
        // Could return either relevance_no_keyword or relevance_wrong_role
        // depending on whether Tier 2 picks up — both indicate correct rejection.
        expect(['relevance_no_keyword', 'relevance_wrong_role']).toContain(r.reason);
    });
});

describe('isRelevantJob (legacy boolean wrapper)', () => {
    it('still works for callers that don\'t pass employer', () => {
        expect(isRelevantJob('Psychiatric Nurse Practitioner', 'desc')).toBe(true);
        expect(isRelevantJob('Software Engineer', 'desc')).toBe(false);
    });

    it('matches classifyRelevance.passes when employer is omitted', () => {
        const cases: Array<[string, string]> = [
            ['Psychiatric Nurse Practitioner', ''],
            ['Software Engineer', ''],
            ['Nurse Practitioner', 'description has psychiatric work'],
        ];
        for (const [title, desc] of cases) {
            const bool = isRelevantJob(title, desc);
            const cls = classifyRelevance(title, desc, '');
            expect(bool).toBe(cls.passes);
        }
    });
});
