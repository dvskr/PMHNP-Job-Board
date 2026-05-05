/**
 * Hybrid `freshnessClause` semantics with FRESHNESS_FLOOR_MS = 0.
 *
 * Pins the rule:
 *   GREATEST(originalPostedAt, createdAt) > now - W
 *
 * Which expands to:
 *   originalPostedAt >= now - W   OR   createdAt >= now - W
 *
 * Every window expands to the OR — there is no collapse case while
 * FRESHNESS_FLOOR_MS = 0 (createdAt cutoff is never in the future).
 *
 * If the floor is ever raised back above 0, add a collapse-case test
 * for windows ≤ floor.
 */

import { describe, it, expect } from 'vitest';
import { freshnessClause, postedWithinToMs } from '@/lib/filters';

const NOW = new Date('2026-05-04T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('freshnessClause — floor = 0, all windows expand to OR', () => {
    it('Past 24h matches either originalPostedAt or createdAt within 24h', () => {
        const cutoff = new Date(NOW.getTime() - DAY);
        expect(freshnessClause(NOW, postedWithinToMs('24h')!)).toEqual({
            OR: [
                { originalPostedAt: { gte: cutoff } },
                { createdAt: { gte: cutoff } },
            ],
        });
    });

    it('Past 3 days uses identical cutoffs on both fields', () => {
        const cutoff = new Date(NOW.getTime() - 3 * DAY);
        expect(freshnessClause(NOW, postedWithinToMs('3d')!)).toEqual({
            OR: [
                { originalPostedAt: { gte: cutoff } },
                { createdAt: { gte: cutoff } },
            ],
        });
    });

    it('Past 7 days uses identical cutoffs on both fields', () => {
        const cutoff = new Date(NOW.getTime() - 7 * DAY);
        expect(freshnessClause(NOW, postedWithinToMs('7d')!)).toEqual({
            OR: [
                { originalPostedAt: { gte: cutoff } },
                { createdAt: { gte: cutoff } },
            ],
        });
    });

    it('Past 30 days uses identical cutoffs on both fields', () => {
        const cutoff = new Date(NOW.getTime() - 30 * DAY);
        expect(freshnessClause(NOW, postedWithinToMs('30d')!)).toEqual({
            OR: [
                { originalPostedAt: { gte: cutoff } },
                { createdAt: { gte: cutoff } },
            ],
        });
    });

    it('arbitrary windowMs flows through symmetrically', () => {
        const windowMs = 14 * DAY;
        const cutoff = new Date(NOW.getTime() - windowMs);
        expect(freshnessClause(NOW, windowMs)).toEqual({
            OR: [
                { originalPostedAt: { gte: cutoff } },
                { createdAt: { gte: cutoff } },
            ],
        });
    });
});

describe('postedWithinToMs', () => {
    it('returns correct millisecond windows', () => {
        expect(postedWithinToMs('24h')).toBe(DAY);
        expect(postedWithinToMs('3d')).toBe(3 * DAY);
        expect(postedWithinToMs('7d')).toBe(7 * DAY);
        expect(postedWithinToMs('30d')).toBe(30 * DAY);
    });

    it('returns null for unknown / "all" / empty', () => {
        expect(postedWithinToMs('all')).toBeNull();
        expect(postedWithinToMs('')).toBeNull();
        expect(postedWithinToMs('garbage')).toBeNull();
    });
});
