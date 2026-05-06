/**
 * Tests for the global-map dedup helpers added 2026-05-05 after the prod
 * audit found Strategy 2 silently missing duplicates.
 *
 * - `buildJobIdentityKey` is the producer/consumer contract between
 *   `ingestion-service` (which populates the map) and `deduplicator`
 *   (which reads it). They must agree byte-for-byte.
 * - `buildApplyUrlPathKey` mirrors the existing `globalApplyLinkMap`
 *   path-prefix rule.
 */
import { describe, it, expect } from 'vitest';
import {
    buildJobIdentityKey,
    buildApplyUrlPathKey,
    normalizeTitle,
    normalizeCompany,
    normalizeLocation,
} from '@/lib/deduplicator';

describe('buildJobIdentityKey', () => {
    it('produces identical keys for the same logical job posted twice', () => {
        const a = buildJobIdentityKey(
            'Psychiatric Nurse Practitioner (PMHNP)',
            'LifeStance Health',
            'United States',
        );
        const b = buildJobIdentityKey(
            'Psychiatric Nurse Practitioner (PMHNP)',
            'LifeStance Health',
            'United States',
        );
        expect(a).toBe(b);
    });

    it('strips corporate suffixes via normalizeCompany', () => {
        expect(buildJobIdentityKey('PMHNP', 'Talkiatry, Inc.', 'Remote')).toBe(
            buildJobIdentityKey('PMHNP', 'Talkiatry LLC', 'Remote'),
        );
    });

    it('does NOT strip healthcare-identity words from employer', () => {
        // "Spring Health" must remain distinct from "Spring"
        expect(buildJobIdentityKey('PMHNP', 'Spring Health', 'Remote')).not.toBe(
            buildJobIdentityKey('PMHNP', 'Spring', 'Remote'),
        );
    });

    it('treats title case + punctuation differences as the same identity', () => {
        const a = buildJobIdentityKey('Psychiatric Nurse Practitioner!', 'Acme', 'NY');
        const b = buildJobIdentityKey('PSYCHIATRIC NURSE PRACTITIONER', 'Acme', 'NY');
        expect(a).toBe(b);
    });

    it('preserves location distinctions ("Remote" vs "New York")', () => {
        expect(buildJobIdentityKey('PMHNP', 'Acme', 'Remote')).not.toBe(
            buildJobIdentityKey('PMHNP', 'Acme', 'New York'),
        );
    });

    it('uses the | separator and exact normalized field order', () => {
        // Lock the wire format so a future refactor that flips field order
        // doesn't silently invalidate maps populated under the old rule.
        const key = buildJobIdentityKey('PMHNP', 'Acme Inc', 'Remote');
        expect(key).toBe(`${normalizeTitle('PMHNP')}|${normalizeCompany('Acme Inc')}|${normalizeLocation('Remote')}`);
    });
});

describe('buildApplyUrlPathKey', () => {
    it('returns null for empty input', () => {
        expect(buildApplyUrlPathKey('')).toBeNull();
    });

    it('returns null for malformed URLs', () => {
        expect(buildApplyUrlPathKey('not a url')).toBeNull();
    });

    it('extracts pathname slice (≤ 60 chars) ignoring host/query', () => {
        const key = buildApplyUrlPathKey('https://jobs.lever.co/lifestance/abc-123?utm=a&utm_source=x');
        expect(key).toBe('/lifestance/abc-123');
    });

    it('matches across host variants when the pathname is identical', () => {
        // The current contract is path-only; same path on different hosts
        // still collides. This is intentional — it catches scrapers that
        // re-host the same lever path on a different domain.
        expect(buildApplyUrlPathKey('https://a.example.com/foo/123')).toBe(
            buildApplyUrlPathKey('https://b.example.com/foo/123'),
        );
    });

    it('truncates pathnames longer than 60 chars consistently', () => {
        const long = 'https://example.com/' + 'a'.repeat(80);
        const key = buildApplyUrlPathKey(long)!;
        expect(key.length).toBeLessThanOrEqual(60);
        expect(buildApplyUrlPathKey(long + '?x=1')).toBe(key);
    });
});
