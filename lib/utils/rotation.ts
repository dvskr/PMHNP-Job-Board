/**
 * Deterministic rotation utilities — surface different items across days/visits
 * without losing the underlying score signal.
 *
 * Used by:
 *   • lib/ai/recommendation-selector — daily rotation of the 2 pinned employer
 *     postings per candidate (seed = supabaseId + ISO date)
 *   • components/FeaturedJobsSection — homepage rotation across 6h buckets
 *     so the cached page surfaces a fresh 2 employer slots through the day
 *   • lib/job-alerts-service — per-recipient daily rotation in alert digests
 *
 * Same seed ⇒ same order. Different seed ⇒ different order. The jitter band is
 * intentionally narrow ([0.9, 1.1]) so a clearly-stronger candidate still wins
 * — rotation only swaps near-ties.
 */

/**
 * Deterministic non-cryptographic hash of a string. djb2 to fold the string
 * into a 32-bit int, then a murmurhash3 finalizer to spread the bits — pure
 * djb2 on near-identical inputs (e.g. `seed+'emp-0'` vs `seed+'emp-1'`)
 * produces hashes that differ by only 1, which collapsed our jitter band to
 * a near-no-op and broke rotation. NOT for security.
 */
function hash32(input: string): number {
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
        // (h << 5) + h === h * 33
        h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    }
    // Murmur3 finalizer — strong avalanche on similar inputs.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * Map a seed to a multiplier in `[0.9, 1.1)`. Used to nudge sort order without
 * overriding meaningful score gaps. Two items with identical underlying scores
 * (e.g. same qualityScore) end up in different positions across seeds; items
 * with materially different scores stay in score order.
 */
export function jitterMultiplier(seed: string): number {
    const norm = (hash32(seed) % 10_000) / 10_000; // [0, 1)
    return 0.9 + 0.2 * norm;
}

/**
 * Sort items by `score × jitterMultiplier(seed + id)` descending. The jitter
 * band reorders near-ties deterministically per seed.
 *
 * - `seed='2026-05-06-userA'` for daily-per-user rotation.
 * - `seed=String(Math.floor(Date.now() / SIX_HOURS_MS))` for time-bucket rotation.
 */
export function sortByJitteredScore<T>(
    items: ReadonlyArray<T>,
    scoreOf: (t: T) => number,
    idOf: (t: T) => string,
    seed: string,
): T[] {
    return [...items].sort((a, b) => {
        const aJ = jitterMultiplier(seed + idOf(a));
        const bJ = jitterMultiplier(seed + idOf(b));
        return scoreOf(b) * bJ - scoreOf(a) * aJ;
    });
}

/** ISO `YYYY-MM-DD` for the given Date in UTC — stable rotation key per day. */
export function isoDateUtc(d: Date = new Date()): string {
    return d.toISOString().slice(0, 10);
}

/** Index of a 6-hour bucket since epoch — rotates 4× per day. */
export function sixHourBucket(d: Date = new Date()): number {
    return Math.floor(d.getTime() / (6 * 60 * 60 * 1000));
}
