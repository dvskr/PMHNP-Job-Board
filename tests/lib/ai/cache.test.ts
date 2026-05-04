/**
 * Cache key derivation properties — these matter because changing the key
 * shape silently invalidates every cached entry on deploy.
 */

import { describe, it, expect } from 'vitest';
import { __testing } from '@/lib/ai/cache';

describe('lib/ai/cache.buildCacheKey', () => {
    it('produces identical keys for identical inputs', () => {
        const a = __testing.buildCacheKey('candidate_scoring', ['v1', 'job_1', 'cand_1']);
        const b = __testing.buildCacheKey('candidate_scoring', ['v1', 'job_1', 'cand_1']);
        expect(a).toBe(b);
    });

    it('produces different keys when any part differs', () => {
        const a = __testing.buildCacheKey('candidate_scoring', ['v1', 'job_1', 'cand_1']);
        const b = __testing.buildCacheKey('candidate_scoring', ['v1', 'job_1', 'cand_2']);
        expect(a).not.toBe(b);
    });

    it('isolates by task id', () => {
        const a = __testing.buildCacheKey('candidate_scoring', ['x']);
        const b = __testing.buildCacheKey('resume_parsing',    ['x']);
        expect(a).not.toBe(b);
    });

    it('embeds the version prefix so we can bump-and-invalidate', () => {
        const key = __testing.buildCacheKey('candidate_scoring', ['x']);
        expect(key.startsWith('ai:cache:v1:candidate_scoring:')).toBe(true);
    });
});
