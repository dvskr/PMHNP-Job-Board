/**
 * Tests for lib/auth/email-change-policy.ts (audit #27).
 *
 * Per-domain freebie quota is anchored on EmployerJob.quotaDomain. If a user
 * could change their account email's domain freely after using freebies, they
 * could earn a fresh quota at the new domain. This helper enforces that
 * domain changes are only allowed when no freebies have been consumed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { evaluateEmailChange } from '@/lib/auth/email-change-policy';

const USER_ID = 'user-123';

describe('evaluateEmailChange', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows local-part change at the same domain (bob@acme.com → bob.smith@acme.com)', async () => {
        // No DB calls expected — same-domain short-circuits before any count
        const result = await evaluateEmailChange(USER_ID, 'bob@acme.com', 'bob.smith@acme.com');
        expect(result.allowed).toBe(true);
        expect(prisma.employerJob.count).not.toHaveBeenCalled();
    });

    it('allows identical email (no-op change)', async () => {
        const result = await evaluateEmailChange(USER_ID, 'bob@acme.com', 'bob@acme.com');
        expect(result.allowed).toBe(true);
    });

    it('is case-insensitive on domain comparison', async () => {
        const result = await evaluateEmailChange(USER_ID, 'bob@Acme.com', 'bob@acme.COM');
        expect(result.allowed).toBe(true);
    });

    it('rejects an invalid new email (no @)', async () => {
        const result = await evaluateEmailChange(USER_ID, 'bob@acme.com', 'not-an-email');
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/invalid/i);
    });

    it('allows domain change when user has zero free posts', async () => {
        vi.mocked(prisma.employerJob.count).mockResolvedValue(0 as never);

        const result = await evaluateEmailChange(USER_ID, 'bob@acme.com', 'bob@example.com');
        expect(result.allowed).toBe(true);
    });

    it('blocks domain change when user has at least one free post', async () => {
        vi.mocked(prisma.employerJob.count).mockResolvedValue(1 as never);

        const result = await evaluateEmailChange(USER_ID, 'bob@acme.com', 'bob@example.com');
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/free posts have been used/i);
        expect(result.lockedDomain).toBe('acme.com');
    });

    it('blocks domain change with multiple free posts (HCA at 2/2 cap)', async () => {
        vi.mocked(prisma.employerJob.count).mockResolvedValue(2 as never);

        const result = await evaluateEmailChange(USER_ID, 'bob@hcahealthcare.com', 'bob@elsewhere.com');
        expect(result.allowed).toBe(false);
    });

    it('passes the correct userId + paymentStatus filter to the count query', async () => {
        vi.mocked(prisma.employerJob.count).mockResolvedValue(0 as never);

        await evaluateEmailChange(USER_ID, 'bob@acme.com', 'bob@example.com');

        const callArg = vi.mocked(prisma.employerJob.count).mock.calls[0][0]!;
        expect(callArg.where).toMatchObject({
            userId: USER_ID,
            paymentStatus: 'free',
        });
    });

    it('handles empty old email (e.g., user with no prior email) by allowing if newEmail valid', async () => {
        vi.mocked(prisma.employerJob.count).mockResolvedValue(0 as never);

        // Empty old email gives null oldDomain. New email is at example.com.
        // Different "domains" (null vs example.com) → check freebies → 0 → allowed.
        const result = await evaluateEmailChange(USER_ID, '', 'bob@example.com');
        expect(result.allowed).toBe(true);
    });
});
