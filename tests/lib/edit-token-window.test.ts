/**
 * The employer editToken validity window.
 *
 * The token is a bearer credential mailed to the employer, with no session
 * behind it. P5.A bounded it to "published, or within 30 days of expiry" but
 * implemented the rule inline in the GET loader only. The 2026-09-02 hunt found
 * POST and DELETE /api/jobs/update looked the token up with a bare
 * `findFirst({ where: { editToken } })`, so a leaked link could still rewrite a
 * posting's applyLink (redirecting every applicant) or unpublish it years later.
 *
 * The rule now lives in one module. These lock its edges.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect } from 'vitest';
import {
    isEditTokenWindowOpen,
    EDIT_TOKEN_GRACE_MS,
} from '@/lib/auth/edit-token-window';

const NOW = new Date('2026-09-02T12:00:00.000Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000);

describe('isEditTokenWindowOpen', () => {
    it('is open while the posting is published, whatever its expiry says', () => {
        expect(isEditTokenWindowOpen({ isPublished: true, expiresAt: daysAgo(900) }, NOW)).toBe(true);
        expect(isEditTokenWindowOpen({ isPublished: true, expiresAt: null }, NOW)).toBe(true);
    });

    it('stays open inside the 30-day grace window after expiry', () => {
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: daysAgo(1) }, NOW)).toBe(true);
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: daysAgo(29) }, NOW)).toBe(true);
    });

    it('closes once the grace window has passed', () => {
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: daysAgo(31) }, NOW)).toBe(false);
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: daysAgo(365) }, NOW)).toBe(false);
    });

    it('closes exactly one millisecond past the grace boundary', () => {
        const atBoundary = new Date(NOW - EDIT_TOKEN_GRACE_MS);
        const pastBoundary = new Date(NOW - EDIT_TOKEN_GRACE_MS - 1);
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: atBoundary }, NOW)).toBe(true);
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: pastBoundary }, NOW)).toBe(false);
    });

    it('treats an unpublished posting with no expiry as closed, not editable forever', () => {
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: null }, NOW)).toBe(false);
    });

    it('treats an unparseable expiry as closed', () => {
        expect(isEditTokenWindowOpen({ isPublished: false, expiresAt: 'not-a-date' }, NOW)).toBe(false);
    });

    it('accepts an ISO string as well as a Date', () => {
        expect(
            isEditTokenWindowOpen({ isPublished: false, expiresAt: daysAgo(2).toISOString() }, NOW),
        ).toBe(true);
    });
});
