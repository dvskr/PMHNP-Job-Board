/**
 * Reusable DB fixture helpers — Sprint 0.5.2.
 *
 * These helpers return realistic Prisma-shape objects that mirror what
 * production rows look like. They DO NOT touch a real database — they're
 * fixtures for the in-memory mocked Prisma client (see tests/setup.ts).
 *
 * Use them like this in feature tests:
 *
 *   import { seedTestJob, seedTestCandidate } from '../../helpers/db';
 *   import { prisma } from '@/lib/prisma';
 *
 *   const job = seedTestJob({ title: 'Telehealth PMHNP', state: 'CA' });
 *   (prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(job);
 */

let counter = 0;
function nextId(prefix: string): string {
    counter += 1;
    return `${prefix}_test_${counter.toString(36)}`;
}

export interface TestJobOverrides {
    id?: string;
    title?: string;
    description?: string;
    state?: string | null;
    setting?: string | null;
    population?: string | null;
    benefits?: string[];
    isPublished?: boolean;
    archivedAt?: Date | null;
}

export function seedTestJob(overrides: TestJobOverrides = {}) {
    return {
        id: overrides.id ?? nextId('job'),
        title: overrides.title ?? 'PMHNP Telehealth',
        description: overrides.description ?? 'Provide psychiatric care via telehealth.',
        location: 'Remote',
        mode: 'remote',
        experienceLevel: 'mid',
        benefits: overrides.benefits ?? ['health', 'dental', 'pto'],
        setting: overrides.setting ?? 'Telehealth',
        population: overrides.population ?? 'Adults',
        state: overrides.state ?? 'CA',
        isPublished: overrides.isPublished ?? true,
        isFeatured: false,
        archivedAt: overrides.archivedAt ?? null,
        qualityScore: 80,
        createdAt: new Date('2026-05-01T00:00:00Z'),
        updatedAt: new Date('2026-05-01T00:00:00Z'),
    };
}

export interface TestCandidateOverrides {
    supabaseId?: string;
    headline?: string | null;
    yearsExperience?: number | null;
    licenseStates?: string | null;
    certifications?: string | null;
    specialties?: string | null;
    skills?: string[];
    bio?: string | null;
    profileVisible?: boolean;
}

export function seedTestCandidate(overrides: TestCandidateOverrides = {}) {
    return {
        id: nextId('profile'),
        supabaseId: overrides.supabaseId ?? nextId('user'),
        firstName: 'Test',
        lastName: 'Candidate',
        headline: overrides.headline ?? 'Board-Certified PMHNP-BC | 5 Years',
        yearsExperience: overrides.yearsExperience ?? 5,
        certifications: overrides.certifications ?? 'PMHNP-BC',
        licenseStates: overrides.licenseStates ?? 'CA',
        specialties: overrides.specialties ?? 'Adult Psychiatry',
        skills: overrides.skills ?? ['Telepsychiatry', 'CBT'],
        bio: overrides.bio ?? null,
        npiNumber: null,
        deaNumber: null,
        profileVisible: overrides.profileVisible ?? true,
        deletedAt: null,
        education: [],
        workExperience: [],
        certificationRecords: [],
        licenses: [],
    };
}

export interface TestApplicationOverrides {
    id?: string;
    jobId: string;
    userId: string;
    coverLetter?: string | null;
    screeningAnswers?: unknown;
}

export function seedTestApplication(overrides: TestApplicationOverrides) {
    return {
        id: overrides.id ?? nextId('app'),
        jobId: overrides.jobId,
        userId: overrides.userId,
        coverLetter: overrides.coverLetter ?? null,
        screeningAnswers: overrides.screeningAnswers ?? null,
        aiMatchScore: null,
        aiMatchReasons: [],
        aiMissingItems: [],
        createdAt: new Date('2026-05-01T00:00:00Z'),
    };
}
