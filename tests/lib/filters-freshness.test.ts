/**
 * `freshnessClause` semantics (revised 2026-05-06).
 *
 *   24h  → AND( createdAt ≥ now-24h, originalPostedAt ≥ now-3d )
 *           "what's new on the board, capped so a 30-day-old original
 *            post doesn't surface as fresh just because we re-ingested
 *            it today"
 *   3d / 7d / 30d → originalPostedAt ≥ now-window  (strict, no fallback)
 *
 * NULL originalPostedAt is excluded from every window — the normalizer
 * defaults to `new Date()` at ingest, so this affects ~0% of inventory.
 */

import { describe, it, expect } from 'vitest';
import { freshnessClause, postedWithinToMs } from '@/lib/filters';

const NOW = new Date('2026-05-04T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('freshnessClause', () => {
    it('24h → AND of createdAt ≥ now-24h and originalPostedAt ≥ now-3d', () => {
        expect(freshnessClause(NOW, '24h')).toEqual({
            AND: [
                { createdAt: { gte: new Date(NOW.getTime() - DAY) } },
                { originalPostedAt: { gte: new Date(NOW.getTime() - 3 * DAY) } },
            ],
        });
    });

    it('3d → strict originalPostedAt ≥ now-3d', () => {
        expect(freshnessClause(NOW, '3d')).toEqual({
            originalPostedAt: { gte: new Date(NOW.getTime() - 3 * DAY) },
        });
    });

    it('7d → strict originalPostedAt ≥ now-7d', () => {
        expect(freshnessClause(NOW, '7d')).toEqual({
            originalPostedAt: { gte: new Date(NOW.getTime() - 7 * DAY) },
        });
    });

    it('30d → strict originalPostedAt ≥ now-30d', () => {
        expect(freshnessClause(NOW, '30d')).toEqual({
            originalPostedAt: { gte: new Date(NOW.getTime() - 30 * DAY) },
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
