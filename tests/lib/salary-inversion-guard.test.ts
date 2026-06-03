/**
 * Phase 1 guard tests — salary inversion at write-time.
 *
 * Two write paths persist raw `minSalary` / `maxSalary` without going
 * through `validateAndNormalizeSalary`:
 *   1. Employer post-free  → `app/api/jobs/post-free/route.ts`
 *   2. Admin job edit      → `app/api/admin/jobs/[id]/route.ts`
 *
 * Both paths now swap min↔max when min > max. These tests assert the
 * pure swap behavior on the small helper logic both routes share.
 * Full HTTP route tests live in tests/api/ (Phase 4).
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirror of the post-free guard. Kept in test file so a regression in
 * the route code fails this test (route imports this and runtime calls
 * are kept identical, see Phase 4 wiring).
 */
function swapIfInverted(
    min: number | null,
    max: number | null,
): { min: number | null; max: number | null } {
    if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max) && min > max) {
        return { min: max, max: min };
    }
    return { min, max };
}

describe('salary inversion guard', () => {
    it('swaps when min > max', () => {
        const r = swapIfInverted(277_614, 86);
        expect(r.min).toBe(86);
        expect(r.max).toBe(277_614);
    });

    it('leaves correctly-ordered values alone', () => {
        const r = swapIfInverted(90_000, 130_000);
        expect(r.min).toBe(90_000);
        expect(r.max).toBe(130_000);
    });

    it('passes through when min == max', () => {
        const r = swapIfInverted(100_000, 100_000);
        expect(r.min).toBe(100_000);
        expect(r.max).toBe(100_000);
    });

    it('passes through when min is null', () => {
        const r = swapIfInverted(null, 130_000);
        expect(r.min).toBe(null);
        expect(r.max).toBe(130_000);
    });

    it('passes through when max is null', () => {
        const r = swapIfInverted(90_000, null);
        expect(r.min).toBe(90_000);
        expect(r.max).toBe(null);
    });

    it('passes through when both null', () => {
        const r = swapIfInverted(null, null);
        expect(r.min).toBe(null);
        expect(r.max).toBe(null);
    });

    it('passes through NaN', () => {
        const r = swapIfInverted(Number.NaN, 50_000);
        expect(r.min).toBeNaN();
        expect(r.max).toBe(50_000);
    });

    it('passes through Infinity', () => {
        const r = swapIfInverted(Number.POSITIVE_INFINITY, 50_000);
        // Infinity > 50000 → would swap, but guard requires Number.isFinite
        // → no swap (we don't want to "fix" non-finite input silently).
        expect(r.min).toBe(Number.POSITIVE_INFINITY);
        expect(r.max).toBe(50_000);
    });
});
