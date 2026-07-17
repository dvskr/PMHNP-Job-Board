/**
 * Unit tests for `slugify` — the URL-slug builder used by ingest and
 * employer post-free paths.
 *
 * Phase 1 audit guarantees enforced here:
 *   - slug length is bounded (title cap + UUID = ~97 chars max).
 *   - UUID suffix is preserved verbatim so the route handler regex
 *     (`/[a-f0-9]{8}-[a-f0-9]{4}-…/`) can still extract job id.
 *   - clean kebab-case shape, no double-dash, no trailing dash before
 *     the suffix.
 */
import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/utils';

const SAMPLE_UUID = '12345678-1234-1234-1234-123456789012';

describe('slugify', () => {
    it('builds a kebab-case slug ending in the UUID', () => {
        const out = slugify('Psychiatric Mental Health Nurse Practitioner', SAMPLE_UUID);
        expect(out).toBe(`psychiatric-mental-health-nurse-practitioner-${SAMPLE_UUID}`);
    });

    it('caps title prefix at SLUG_TITLE_MAX (60) chars so total slug ≤ 97', () => {
        const longTitle = 'A'.repeat(200);
        const out = slugify(longTitle, SAMPLE_UUID);
        expect(out.length).toBeLessThanOrEqual(60 + 1 + SAMPLE_UUID.length);
    });

    it('preserves the full UUID suffix for route-handler regex', () => {
        const out = slugify('Senior Psychiatric Nurse Practitioner Position', SAMPLE_UUID);
        expect(out.endsWith(SAMPLE_UUID)).toBe(true);
        const extractMatch = out.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
        expect(extractMatch?.[1]).toBe(SAMPLE_UUID);
    });

    it('truncates at word boundary when possible', () => {
        const title = 'Psychiatric Nurse Practitioner Position Available Soon Today Now';
        const out = slugify(title, SAMPLE_UUID);
        const titlePart = out.slice(0, -SAMPLE_UUID.length - 1);
        // last char of titlePart should not be a partial word truncation
        // (last dash trim shouldn't leave a leading partial word)
        expect(titlePart.endsWith('-')).toBe(false);
    });

    it('strips non-alphanumeric and collapses whitespace', () => {
        const out = slugify('PMHNP (Remote) -- Full Time, $150k!', SAMPLE_UUID);
        expect(out).not.toMatch(/--/);  // no double-dash
        expect(out).not.toMatch(/[!$,()]/);  // no special chars
        expect(out).toMatch(/^[a-z0-9-]+$/);
    });

    it('lowercases the title prefix', () => {
        const out = slugify('UPPERCASE Title HERE', SAMPLE_UUID);
        const titlePart = out.slice(0, -SAMPLE_UUID.length - 1);
        expect(titlePart).toBe(titlePart.toLowerCase());
    });

    it('handles empty title gracefully', () => {
        const out = slugify('', SAMPLE_UUID);
        // GSC Fix (2026-07 audit P3): degenerate titles now yield the bare
        // id — never a leading-hyphen "-{uuid}" slug (the old pinned value).
        expect(out).toBe(SAMPLE_UUID);
        // The route regex still finds the UUID at the tail.
        expect(out.match(/([a-f0-9-]{36})$/)?.[1]).toBe(SAMPLE_UUID);
    });

    it('trims leading hyphens from titles starting with non-alphanumerics (GSC Fix 2026-07)', () => {
        const out = slugify('(Remote) Nurse Practitioner', SAMPLE_UUID);
        expect(out).toBe(`remote-nurse-practitioner-${SAMPLE_UUID}`);
        expect(out.startsWith('-')).toBe(false);
    });

    it('handles unicode by stripping (current behavior)', () => {
        const out = slugify('Psychiatric — Mental Health NP', SAMPLE_UUID);
        // em-dash is stripped, no double-dash leak
        expect(out).not.toMatch(/--/);
        expect(out).toMatch(/^[a-z0-9-]+$/);
    });
});
