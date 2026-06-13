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

    it('includes host + path and ignores query', () => {
        const key = buildApplyUrlPathKey('https://jobs.lever.co/lifestance/abc-123?utm=a&utm_source=x');
        expect(key).toBe('jobs.lever.co/lifestance/abc-123');
    });

    it('does NOT collide across hosts with an identical path (cross-tenant fix)', () => {
        // Two different employers on the same ATS platform share long path
        // prefixes; the old path-only key wrongly treated them as duplicates and
        // dropped the second employer's job. Including the host disambiguates.
        expect(buildApplyUrlPathKey('https://a.example.com/foo/123')).not.toBe(
            buildApplyUrlPathKey('https://b.example.com/foo/123'),
        );
    });

    it('bounds key length and stays stable across query strings', () => {
        const long = 'https://example.com/' + 'a'.repeat(300);
        const key = buildApplyUrlPathKey(long)!;
        expect(key.length).toBeLessThanOrEqual(200);
        expect(buildApplyUrlPathKey(long + '?x=1')).toBe(key);
    });
});
