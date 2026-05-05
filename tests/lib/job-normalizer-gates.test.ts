/**
 * Step 3 (normalize) sub-bucketed rejection reasons + new gates.
 *
 * Pins each gate's rejection_reason so admin queries / pipeline metrics
 * can pivot on stable values:
 *   - normalizer_missing_required_field (title or applyLink missing)
 *   - normalizer_missing_description    (desc < 50 chars)
 *   - normalizer_stale_post             (>90 days, non-ATS)
 *   - normalizer_indirect_apply         (wrapper host)
 *   - normalizer_exception              (try/catch fallback)
 */

import { describe, it, expect } from 'vitest';
import {
    normalizeJobWithReason,
    canonicalizeEmployerName,
    extractSalary,
    computeCompleteness,
    detectJobType,
} from '@/lib/job-normalizer';

const goodDesc = 'We are seeking a Psychiatric Nurse Practitioner to join our outpatient clinic full time.';

function rawJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: 'Psychiatric Nurse Practitioner',
        employer: 'Acme Mental Health',
        location: 'Boston, MA',
        description: goodDesc,
        applyLink: 'https://acme.com/jobs/123',
        externalId: 'acme-123',
        ...overrides,
    };
}

describe('computeCompleteness — field-presence scoring', () => {
    it('empty job scores 0', () => {
        expect(computeCompleteness({})).toBe(0);
    });

    it('description ≥200 chars: +15', () => {
        const desc = 'a'.repeat(250);
        expect(computeCompleteness({ description: desc })).toBe(15);
    });

    it('description 50–199 chars: +8', () => {
        const desc = 'a'.repeat(100);
        expect(computeCompleteness({ description: desc })).toBe(8);
    });

    it('city alone: +15 (location signal)', () => {
        expect(computeCompleteness({ city: 'Boston' })).toBe(15);
    });

    it('isRemote alone: +15', () => {
        expect(computeCompleteness({ isRemote: true })).toBe(15);
    });

    it('full annual salary: +20', () => {
        expect(computeCompleteness({ normalizedMinSalary: 100000, normalizedMaxSalary: 130000 })).toBe(20);
    });

    it('full job: 15+15+20+10+10+10+5+5+5+5 = 100', () => {
        const score = computeCompleteness({
            description: 'a'.repeat(300),
            city: 'Boston',
            state: 'Massachusetts',
            normalizedMinSalary: 100000,
            normalizedMaxSalary: 130000,
            jobType: 'Full-Time',
            mode: 'Hybrid',
            setting: 'Outpatient',
            population: 'Adults',
            benefits: ['Health Insurance'],
            experienceLevel: 'Mid-Level',
            companyId: 'co-123',
        });
        expect(score).toBe(100);
    });

    it('the floor case: description+location+jobType+mode = 43', () => {
        const score = computeCompleteness({
            description: 'a'.repeat(60),  // +8
            city: 'Boston',                // +15
            jobType: 'Full-Time',          // +10
            mode: 'In-Person',             // +10
        });
        expect(score).toBe(43); // just above MIN_COMPLETENESS_SCORE (40)
    });
});

describe('normalizeJobWithReason — completeness gate', () => {
    it('rejects job with weak data points', () => {
        // Title and applyLink only — no description, no location, no jobType.
        // Will fail at missing-description gate first (description < 50 chars).
        const result = normalizeJobWithReason(
            rawJob({ description: 'too short' }),
            'lever',
        );
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_missing_description');
    });

    it('rejects job with description but no location/jobType/mode', () => {
        // Description ≥200 (+15), but everything else missing → score = 15 < 40
        const longDesc = 'a'.repeat(300) + ' generic text without any location, schedule, or work mode signals at all whatsoever.';
        const result = normalizeJobWithReason(
            rawJob({
                description: longDesc,
                location: '',  // strip location
            }),
            'lever',
        );
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_low_completeness');
    });
});

describe('detectJobType — extended patterns', () => {
    const cases: Array<[string, string]> = [
        ['1099 contractor opportunity', 'Contract'],
        ['independent contractor role', 'Contract'],
        ['fee-for-service position', 'Contract'],
        ['locum tenens coverage needed', 'Locum Tenens'],
        ['PRN coverage', 'Per Diem'],
        ['per-diem psychiatric NP', 'Per Diem'],
        ['W-2 employed position', 'Full-Time'],
        ['F/T outpatient clinic', 'Full-Time'],
        ['P/T weekend role', 'Part-Time'],
        ['Permanent salaried role', 'Full-Time'],
    ];
    for (const [text, expected] of cases) {
        it(`"${text}" → ${expected}`, () => {
            expect(detectJobType(text)).toBe(expected);
        });
    }
});

describe('normalizeJobWithReason — sub-bucketed rejection reasons', () => {
    it('passes a complete job', () => {
        const result = normalizeJobWithReason(rawJob(), 'lever');
        expect(result.job).not.toBeNull();
        expect(result.rejectionReason).toBeUndefined();
    });

    it('rejects missing title with normalizer_missing_required_field', () => {
        const result = normalizeJobWithReason(rawJob({ title: '' }), 'lever');
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_missing_required_field');
    });

    it('rejects missing applyLink with normalizer_missing_required_field', () => {
        const result = normalizeJobWithReason(rawJob({ applyLink: '' }), 'lever');
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_missing_required_field');
    });

    it('rejects empty description with normalizer_missing_description', () => {
        const result = normalizeJobWithReason(rawJob({ description: '' }), 'lever');
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_missing_description');
    });

    it('rejects very short description with normalizer_missing_description', () => {
        const result = normalizeJobWithReason(rawJob({ description: 'Short.' }), 'lever');
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_missing_description');
    });

    it('rejects 70-day-old post with normalizer_stale_post (any source)', () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 70);
        // Adzuna's source config reads `postedAt` (see SOURCE_CONFIGS).
        const result = normalizeJobWithReason(
            rawJob({ postedAt: oldDate.toISOString() }),
            'adzuna',
        );
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_stale_post');
    });

    it('rejects 70-day-old post for ATS sources too (no more exemption)', () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 70);
        // Lever's source config reads `postedDate`.
        const result = normalizeJobWithReason(
            rawJob({ postedDate: oldDate.toISOString() }),
            'lever',
        );
        expect(result.job).toBeNull();
        expect(result.rejectionReason).toBe('normalizer_stale_post');
    });

    it('accepts 30-day-old post', () => {
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 30);
        const result = normalizeJobWithReason(
            rawJob({ postedDate: recentDate.toISOString() }),
            'lever',
        );
        expect(result.job).not.toBeNull();
    });

    it('accepts post with no date (treated as fresh)', () => {
        const result = normalizeJobWithReason(rawJob(), 'lever');
        expect(result.job).not.toBeNull();
    });
});

describe('normalizeJobWithReason — salary period passthrough (Bug #1)', () => {
    it('source-supplied salaryPeriod=annual is honored, not re-inferred', () => {
        // Without the fix, $80,000 with no salaryPeriod hint was passed as
        // null period to the validator. The validator's magnitude rule
        // then bucketed values <= $40k as 'monthly'. We're testing that
        // the explicit salaryPeriod='annual' from the adapter is now
        // preserved through the validator → no period misinference.
        const result = normalizeJobWithReason(
            rawJob({
                minSalary: 80000,
                maxSalary: 100000,
                salaryPeriod: 'annual',
            }),
            'adzuna',
        );
        expect(result.job).not.toBeNull();
        expect(result.job!.salaryPeriod).toBe('annual');
        // 80000 stays at 80000 because period is annual, not 12 * 80000.
        expect(result.job!.normalizedMinSalary).toBe(80000);
        expect(result.job!.normalizedMaxSalary).toBe(100000);
    });

    it('without the period hint, magnitude-based inference would mislabel as monthly', () => {
        // No salaryPeriod hint → validator's magnitude rule kicks in. For
        // a value <= 40000 with no period it'd bucket as 'monthly'. This
        // test pins that legacy behavior so we know what we're protecting
        // against. The fix above (Bug #1) is what makes this NOT happen
        // when the source supplies the period.
        const result = normalizeJobWithReason(
            rawJob({
                minSalary: 35000,
                maxSalary: 35000,
                // intentionally NO salaryPeriod
            }),
            'adzuna',
        );
        expect(result.job).not.toBeNull();
        // Magnitude $35k → period inferred as 'monthly' → normalized to 12*35000 = 420000
        // (which is now within the new $550k cap, so it actually appears as $420k annual)
        expect(result.job!.salaryPeriod).toBe('monthly');
    });

    it('high annual salary $487k passes (Bug #2 — was killed by old $400k cap)', () => {
        const result = normalizeJobWithReason(
            rawJob({
                minSalary: 486652,
                maxSalary: 486652,
                salaryPeriod: 'annual',
            }),
            'adzuna',
        );
        expect(result.job).not.toBeNull();
        expect(result.job!.normalizedMinSalary).toBe(486652);
        expect(result.job!.normalizedMaxSalary).toBe(486652);
    });

    it('above-cap salary $600k is still rejected', () => {
        const result = normalizeJobWithReason(
            rawJob({
                minSalary: 700000,
                maxSalary: 700000,
                salaryPeriod: 'annual',
            }),
            'adzuna',
        );
        expect(result.job).not.toBeNull();
        // $700k exceeds high-confidence cap of $550k → both null
        expect(result.job!.normalizedMinSalary).toBeNull();
        expect(result.job!.normalizedMaxSalary).toBeNull();
    });
});

describe('normalizeJobWithReason — expiry policy (60d from originalPostedAt)', () => {
    it('expiresAt is exactly originalPostedAt + 60 days', () => {
        const postedAt = new Date('2026-04-01T12:00:00Z');
        const result = normalizeJobWithReason(
            rawJob({ postedDate: postedAt.toISOString() }),
            'lever',
        );
        expect(result.job).not.toBeNull();
        const expectedExpiry = new Date(postedAt.getTime() + 60 * 24 * 60 * 60 * 1000);
        // Allow ~1ms slack for Date construction
        const diffMs = Math.abs(result.job!.expiresAt!.getTime() - expectedExpiry.getTime());
        expect(diffMs).toBeLessThan(1000);
    });

    it('falls back to ingest-time + 60d when originalPostedAt is missing', () => {
        const before = Date.now();
        const result = normalizeJobWithReason(rawJob(), 'lever');
        const after = Date.now();
        expect(result.job).not.toBeNull();
        // expiresAt should be ~60 days from now (with ~1s tolerance for clock drift between calls)
        const expectedMin = before + 60 * 24 * 60 * 60 * 1000 - 2000;
        const expectedMax = after + 60 * 24 * 60 * 60 * 1000 + 2000;
        const actual = result.job!.expiresAt!.getTime();
        expect(actual).toBeGreaterThanOrEqual(expectedMin);
        expect(actual).toBeLessThanOrEqual(expectedMax);
    });

    it('expiresAt is BEFORE NOW for jobs older than 60 days at ingest', () => {
        // Hypothetical edge case: source provides date 50 days ago. The
        // job passes the staleness gate (50 < 60) but expires in just 10d.
        const postedAt = new Date();
        postedAt.setDate(postedAt.getDate() - 50);
        const result = normalizeJobWithReason(
            rawJob({ postedDate: postedAt.toISOString() }),
            'lever',
        );
        expect(result.job).not.toBeNull();
        const daysUntilExpiry = (result.job!.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        // Should be ~10 days from now (60 - 50)
        expect(daysUntilExpiry).toBeGreaterThan(9);
        expect(daysUntilExpiry).toBeLessThan(11);
    });
});

describe('normalizeJobWithReason — indirect-apply gate', () => {
    const cases = [
        ['indeed.com/rc/clk', 'https://www.indeed.com/rc/clk?jk=abc123'],
        ['indeed.com/viewjob', 'https://www.indeed.com/viewjob?jk=abc'],
        ['glassdoor', 'https://www.glassdoor.com/job-listing/foo-123'],
        ['ziprecruiter', 'https://www.ziprecruiter.com/c/foo/jobs'],
        ['linkedin jobs', 'https://www.linkedin.com/jobs/view/1234567'],
        ['monster', 'https://www.monster.com/job-openings/foo-12345'],
        ['simplyhired', 'https://www.simplyhired.com/job/abc'],
    ] as const;

    for (const [label, url] of cases) {
        it(`rejects ${label} URLs with normalizer_indirect_apply`, () => {
            const result = normalizeJobWithReason(rawJob({ applyLink: url }), 'lever');
            expect(result.job).toBeNull();
            expect(result.rejectionReason).toBe('normalizer_indirect_apply');
        });
    }

    it('does NOT reject adzuna redirect URLs (single-hop)', () => {
        const result = normalizeJobWithReason(
            rawJob({ applyLink: 'https://www.adzuna.com/api/v1/redirect?id=12345' }),
            'adzuna',
        );
        // Adzuna's redirect is intentionally NOT in the indirect list.
        expect(result.job).not.toBeNull();
    });

    it('does NOT reject employer-direct URLs', () => {
        const result = normalizeJobWithReason(
            rawJob({ applyLink: 'https://job-boards.greenhouse.io/headway/jobs/12345' }),
            'greenhouse',
        );
        expect(result.job).not.toBeNull();
    });
});

describe('canonicalizeEmployerName', () => {
    const cases: Array<[string, string]> = [
        ['LifeStance Health, LLC', 'LifeStance Health'],
        ['LifeStance', 'LifeStance'],
        ['Acme Inc.', 'Acme'],
        ['Acme Inc', 'Acme'],
        ['Acme, Inc.', 'Acme'],
        ['Big Health Corp.', 'Big Health'],
        ['Some Co.', 'Some'],
        ['Foo, LLP', 'Foo'],
        ['Bar P.L.L.C.', 'Bar'],
        ['  Lots   of    space  ', 'Lots of space'],
        ['', ''],
    ];

    for (const [input, expected] of cases) {
        it(`"${input}" → "${expected}"`, () => {
            expect(canonicalizeEmployerName(input)).toBe(expected);
        });
    }

    it('handles null/undefined gracefully', () => {
        expect(canonicalizeEmployerName(null)).toBe('');
        expect(canonicalizeEmployerName(undefined)).toBe('');
    });
});

describe('extractSalary — new patterns (single-cap and single-floor)', () => {
    it('captures "Up to $150k per year" as a single-value cap', () => {
        const result = extractSalary('Salary up to $150k per year for qualified candidates.');
        expect(result.max).toBe(150000);
        expect(result.min).toBeNull();
        expect(result.period).toBe('year');
    });

    it('captures "starting at $120k" as single-value floor', () => {
        const result = extractSalary('Compensation starting at $120k for new grads.');
        expect(result.min).toBe(120000);
        expect(result.max).toBeNull();
    });

    it('captures "from $90,000" with salary context', () => {
        const result = extractSalary('Annual salary from $90,000 plus benefits.');
        expect(result.min).toBe(90000);
        expect(result.max).toBeNull();
    });

    it('does NOT match "up to $5,000 sign-on bonus"', () => {
        const result = extractSalary('Sign-on bonus up to $5,000 for qualified hires.');
        // Should not be treated as salary cap.
        expect(result.max).toBeNull();
    });

    it('does NOT match "up to $10,000 relocation"', () => {
        const result = extractSalary('We provide up to $10,000 in relocation assistance.');
        expect(result.max).toBeNull();
    });
});

describe('smart description summary (smartSummarize via normalizer)', () => {
    it('skips leading "About us" boilerplate when a section marker follows', () => {
        const longDesc =
            'About Acme Health: We are a leading provider of psychiatric services across the Midwest with over 200 clinics and a deep commitment to whole-person care. ' +
            'Position Summary: We are seeking a board-certified PMHNP for our outpatient clinic in Boston.';
        const result = normalizeJobWithReason(rawJob({ description: longDesc }), 'lever');
        expect(result.job).not.toBeNull();
        // Summary should start at "Position Summary", not at "About Acme"
        expect(result.job!.descriptionSummary).toContain('Position Summary');
        expect(result.job!.descriptionSummary).toMatch(/^Position Summary/);
    });

    it('falls back to start when no section marker found within 800 chars', () => {
        // Long enough to hit description+15. Includes "full time" so jobType
        // signal fires (+10) and "outpatient clinic" so mode fires (+10) →
        // completeness gate passes. No section marker → fallback start.
        const longDesc =
            'A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A ' +
            'random text about psychiatric care delivered in an outpatient clinic. Full time role. ' +
            'A A A A A A A A A A A A A A A A A A A A A A A A.';
        const result = normalizeJobWithReason(rawJob({ description: longDesc }), 'lever');
        expect(result.job).not.toBeNull();
        // No marker — summary just starts from beginning
        expect(result.job!.descriptionSummary?.startsWith('A A A')).toBe(true);
    });
});
