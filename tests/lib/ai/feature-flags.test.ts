/**
 * Feature flag decision-order tests. Critical safety logic — if we get the
 * order wrong, an admin kill switch might not actually kill the feature.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isAiFeatureEnabled, listFlags, invalidateFlagCache, __testing } from '@/lib/ai/feature-flags';
import { prisma } from '@/lib/prisma';

const TENANT = { type: 'candidate' as const, id: 'user_x' };

beforeEach(() => {
    invalidateFlagCache();
    delete process.env.KILL_AI_CANDIDATE_RESUME_PARSER;
    delete process.env.KILL_AI_CANDIDATE_COVER_LETTER;
    vi.clearAllMocks();
    // Default DB stub: no overrides exist.
    (prisma.aiFeatureFlagOverride.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe('lib/ai/feature-flags.isAiFeatureEnabled', () => {
    it('returns the compiled default when no env or DB override exists', async () => {
        await expect(isAiFeatureEnabled('ai.candidate.resume_parser', TENANT)).resolves.toBe(true);
        await expect(isAiFeatureEnabled('ai.candidate.cover_letter', TENANT)).resolves.toBe(false);
    });

    it('env kill switch overrides everything else', async () => {
        process.env.KILL_AI_CANDIDATE_RESUME_PARSER = '1';
        // Even if a tenant-specific DB override would enable it, the env kill wins.
        (prisma.aiFeatureFlagOverride.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
            { flag: 'ai.candidate.resume_parser', tenantType: 'candidate', tenantId: TENANT.id, enabled: true, expiresAt: null },
        ]);
        await expect(isAiFeatureEnabled('ai.candidate.resume_parser', TENANT)).resolves.toBe(false);
    });

    it('DB tenant-specific override beats global override', async () => {
        (prisma.aiFeatureFlagOverride.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
            { flag: 'ai.candidate.cover_letter', tenantType: 'global',    tenantId: null,        enabled: true,  expiresAt: null },
            { flag: 'ai.candidate.cover_letter', tenantType: 'candidate', tenantId: TENANT.id,   enabled: false, expiresAt: null },
        ]);
        await expect(isAiFeatureEnabled('ai.candidate.cover_letter', TENANT)).resolves.toBe(false);
    });

    it('global DB override applies when no tenant-specific row exists', async () => {
        (prisma.aiFeatureFlagOverride.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
            { flag: 'ai.candidate.cover_letter', tenantType: 'global', tenantId: null, enabled: true, expiresAt: null },
        ]);
        await expect(isAiFeatureEnabled('ai.candidate.cover_letter', TENANT)).resolves.toBe(true);
    });

    it('falls back to default when DB lookup throws (does not block traffic)', async () => {
        (prisma.aiFeatureFlagOverride.findMany as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
        await expect(isAiFeatureEnabled('ai.candidate.resume_parser', TENANT)).resolves.toBe(true);
    });

    it('caches per (flag, tenant) so repeat calls do not hit the DB', async () => {
        const findManyMock = prisma.aiFeatureFlagOverride.findMany as unknown as ReturnType<typeof vi.fn>;
        findManyMock.mockResolvedValue([]);
        await isAiFeatureEnabled('ai.candidate.cover_letter', TENANT);
        await isAiFeatureEnabled('ai.candidate.cover_letter', TENANT);
        await isAiFeatureEnabled('ai.candidate.cover_letter', TENANT);
        expect(findManyMock).toHaveBeenCalledTimes(1);
    });

    it('forceRefresh bypasses the cache', async () => {
        const findManyMock = prisma.aiFeatureFlagOverride.findMany as unknown as ReturnType<typeof vi.fn>;
        findManyMock.mockResolvedValue([]);
        await isAiFeatureEnabled('ai.candidate.cover_letter', TENANT);
        await isAiFeatureEnabled('ai.candidate.cover_letter', TENANT, { forceRefresh: true });
        expect(findManyMock).toHaveBeenCalledTimes(2);
    });
});

describe('lib/ai/feature-flags.envKey', () => {
    it('translates dotted flag ids to KILL_<UPPER_SNAKE>', () => {
        expect(__testing.envKey('ai.candidate.cover_letter')).toBe('KILL_AI_CANDIDATE_COVER_LETTER');
        expect(__testing.envKey('ai.platform.spam_detection')).toBe('KILL_AI_PLATFORM_SPAM_DETECTION');
    });
});

describe('lib/ai/feature-flags.listFlags', () => {
    it('returns every registered flag with its description', () => {
        const flags = listFlags();
        expect(flags.length).toBeGreaterThan(10);
        expect(flags.find((f) => f.flag === 'ai.candidate.resume_parser')?.default).toBe(true);
    });
});
