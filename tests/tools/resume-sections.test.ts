/**
 * Resume studio section contract (lib/resume-studio/sections.ts).
 * Pure-function coverage: parseSections validation and clamping,
 * sectionsToText determinism, emptySections structural validity.
 * seedSectionsFromProfile is DB-bound and covered by route-level testing.
 */
import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
    emptySections,
    parseSections,
    sectionsToText,
    RESUME_CONTENT_VERSION,
    type ResumeSections,
} from '@/lib/resume-studio/sections';

function validSections(): ResumeSections {
    return {
        contact: {
            fullName: 'Jordan Avery',
            email: 'jordan.avery@example.com',
            phone: '(555) 210-4478',
            city: 'Austin',
            state: 'TX',
            linkedinUrl: 'https://www.linkedin.com/in/jordanavery',
        },
        summary: 'Board certified PMHNP with seven years of psychiatric experience across inpatient and telehealth settings.',
        licenses: [
            {
                licenseType: 'APRN',
                licenseState: 'TX',
                licenseNumber: 'AP123456',
                expiration: 'May 2027',
            },
        ],
        certifications: [
            {
                name: 'PMHNP-BC',
                certifyingBody: 'ANCC',
                expiration: 'Dec 2027',
            },
        ],
        education: [
            {
                degreeType: 'MSN',
                fieldOfStudy: 'Psychiatric Mental Health',
                schoolName: 'University of Texas at Austin',
                graduationYear: '2019',
            },
        ],
        experience: [
            {
                jobTitle: 'Psychiatric Mental Health Nurse Practitioner',
                employerName: 'Lakeside Behavioral Health',
                location: 'Austin, TX',
                startDate: 'Jan 2021',
                endDate: '',
                isCurrent: true,
                bullets: [
                    'Managed medication regimens for a caseload of 320 active patients.',
                    'Reduced 30 day readmissions by 15% through structured follow up.',
                ],
            },
            {
                jobTitle: 'Registered Nurse, Inpatient Psychiatry',
                employerName: 'Austin State Hospital',
                location: 'Austin, TX',
                startDate: 'Jun 2018',
                endDate: 'Dec 2020',
                isCurrent: false,
                bullets: ['Delivered psychiatric nursing care on a 24 bed adult unit.'],
            },
        ],
        skills: ['Medication management', 'Telepsychiatry', 'CBT'],
    };
}

describe('RESUME_CONTENT_VERSION', () => {
    it('is version 1', () => {
        expect(RESUME_CONTENT_VERSION).toBe(1);
    });
});

describe('parseSections', () => {
    it('round-trips a valid sections object unchanged', () => {
        const input = validSections();
        expect(parseSections(input)).toEqual(input);
    });

    it('strips unknown keys while round-tripping', () => {
        const input = validSections();
        const withExtras = {
            ...input,
            unexpected: 'ignore me',
            contact: { ...input.contact, hacker: true },
        };
        expect(parseSections(withExtras)).toEqual(input);
    });

    it('rejects structurally invalid input with ZodError', () => {
        const invalidInputs: unknown[] = [
            null,
            undefined,
            42,
            'a resume',
            [],
            {},
            { ...validSections(), contact: 'not an object' },
            { ...validSections(), summary: 123 },
            { ...validSections(), experience: 'nope' },
            { ...validSections(), skills: [1, 2, 3] },
        ];
        for (const input of invalidInputs) {
            try {
                parseSections(input);
                expect.unreachable(`expected ZodError for ${JSON.stringify(input)}`);
            } catch (err) {
                expect(err).toBeInstanceOf(ZodError);
            }
        }
    });

    it('rejects wrong leaf types inside nested entries', () => {
        const base = validSections();
        const badBullet = {
            ...base,
            experience: [{ ...base.experience[0], bullets: ['fine', 99] }],
        };
        expect(() => parseSections(badBullet)).toThrow();

        const badIsCurrent = {
            ...base,
            experience: [{ ...base.experience[0], isCurrent: 'yes' }],
        };
        expect(() => parseSections(badIsCurrent)).toThrow();
    });

    it('clamps oversized strings', () => {
        const base = validSections();
        const oversized = {
            ...base,
            contact: { ...base.contact, fullName: 'x'.repeat(300) },
            summary: 'y'.repeat(5000),
            experience: [
                {
                    ...base.experience[0],
                    bullets: ['z'.repeat(1200)],
                },
            ],
        };
        const parsed = parseSections(oversized);
        expect(parsed.contact.fullName).toHaveLength(120);
        expect(parsed.summary).toHaveLength(2000);
        expect(parsed.experience[0].bullets[0]).toHaveLength(500);
    });

    it('clamps oversized arrays', () => {
        const base = validSections();
        const role = base.experience[0];
        const oversized = {
            ...base,
            licenses: Array.from({ length: 25 }, () => base.licenses[0]),
            certifications: Array.from({ length: 25 }, () => base.certifications[0]),
            education: Array.from({ length: 25 }, () => base.education[0]),
            experience: Array.from({ length: 25 }, () => ({
                ...role,
                bullets: Array.from({ length: 40 }, (_, i) => `bullet ${i}`),
            })),
            skills: Array.from({ length: 60 }, (_, i) => `skill ${i}`),
        };
        const parsed = parseSections(oversized);
        expect(parsed.licenses).toHaveLength(20);
        expect(parsed.certifications).toHaveLength(20);
        expect(parsed.education).toHaveLength(20);
        expect(parsed.experience).toHaveLength(20);
        expect(parsed.experience[0].bullets).toHaveLength(30);
        expect(parsed.skills).toHaveLength(50);
    });

    it('strips control characters but keeps newlines', () => {
        const base = validSections();
        const nul = String.fromCharCode(0);
        const bell = String.fromCharCode(7);
        const escape = String.fromCharCode(27);
        const dirty = {
            ...base,
            contact: { ...base.contact, fullName: `Jane${nul}${bell} Doe${escape}` },
            summary: `Line one${nul}\nLine two`,
        };
        const parsed = parseSections(dirty);
        expect(parsed.contact.fullName).toBe('Jane Doe');
        expect(parsed.summary).toBe('Line one\nLine two');
    });
});

describe('sectionsToText', () => {
    it('is deterministic for the same input', () => {
        const sections = validSections();
        const first = sectionsToText(sections);
        const second = sectionsToText(validSections());
        expect(first).toBe(second);
    });

    it('contains the contact block, section headers, and bullets', () => {
        const text = sectionsToText(validSections());
        expect(text).toContain('Jordan Avery');
        expect(text).toContain('jordan.avery@example.com');
        expect(text).toContain('SUMMARY');
        expect(text).toContain('LICENSES');
        expect(text).toContain('CERTIFICATIONS');
        expect(text).toContain('EDUCATION');
        expect(text).toContain('EXPERIENCE');
        expect(text).toContain('SKILLS');
        expect(text).toContain('• Managed medication regimens for a caseload of 320 active patients.');
        expect(text).toContain('Jan 2021 to Present');
        expect(text).toContain('Jun 2018 to Dec 2020');
        expect(text).toContain('Medication management, Telepsychiatry, CBT');
    });

    it('omits headers for empty sections', () => {
        const text = sectionsToText(emptySections());
        expect(text).toBe('');
    });
});

describe('emptySections', () => {
    it('passes parseSections and round-trips', () => {
        const empty = emptySections();
        expect(() => parseSections(empty)).not.toThrow();
        expect(parseSections(empty)).toEqual(empty);
    });

    it('returns a fresh object each call', () => {
        const a = emptySections();
        const b = emptySections();
        expect(a).not.toBe(b);
        expect(a.contact).not.toBe(b.contact);
    });
});
