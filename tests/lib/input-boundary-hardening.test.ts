/**
 * Public endpoints must answer 4xx for junk input, never 500.
 *
 * Found 2026-09-02 by the edge-to-edge hunt, each reproduced against a running
 * server and traced in the dev log:
 *
 *   POST /api/contact     {}                  -> 500  TypeError: reading 'replace' of undefined
 *   POST /api/job-alerts  {}                  -> 500  same, via sanitizeEmail
 *   GET  /api/jobs        ?salaryMin=1e400    -> 500  Infinity reached Prisma
 *   GET  /api/jobs        ?page=0 | -1 | abc  -> 500  Prisma: skip must be positive
 *
 * The first two crashed inside the shared sanitizers, so every route that
 * sanitizes a partial body was affected. These lock the boundary behaviour:
 * absent or wrongly-typed input becomes empty/no-filter, and the route's own
 * required-field validation produces the 400.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect } from 'vitest';
import {
    sanitizeContactForm,
    sanitizeJobAlert,
    sanitizeEmail,
    sanitizeText,
    sanitizeUrl,
} from '@/lib/sanitize';
import { parseFiltersFromParams } from '@/lib/filters';

// The routes receive `await request.json()`, so any JSON value can arrive in
// any field. Cast at the call site the way the route does.
const anyValue = (v: unknown) => v as string;

describe('sanitizers accept a partial or wrongly-typed body', () => {
    it('sanitizeContactForm does not throw on an empty body', () => {
        expect(() => sanitizeContactForm({} as never)).not.toThrow();
        const out = sanitizeContactForm({} as never);
        expect(out.name).toBe('');
        expect(out.email).toBe('');
        expect(out.message).toBe('');
    });

    it('sanitizeJobAlert does not throw on an empty body', () => {
        expect(() => sanitizeJobAlert({} as never)).not.toThrow();
        expect(sanitizeJobAlert({} as never).email).toBe('');
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an array', ['a', 'b']],
        ['an object', { nested: true }],
    ])('sanitizeText returns a string for %s', (_label, value) => {
        expect(sanitizeText(anyValue(value))).toBe('');
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an object', { at: 'example.com' }],
    ])('sanitizeEmail returns a string for %s', (_label, value) => {
        expect(sanitizeEmail(anyValue(value))).toBe('');
    });

    it('sanitizeUrl returns a string for undefined', () => {
        expect(sanitizeUrl(anyValue(undefined))).toBe('');
    });

    it('still sanitizes real values', () => {
        expect(sanitizeEmail('  Talent@ExamplePsych.Example ')).toBe('talent@examplepsych.example');
        expect(sanitizeText('<script>alert(1)</script>keep me')).toBe('keep me');
        // A number in a text field is preserved rather than silently dropped.
        expect(sanitizeText(anyValue(42))).toBe('42');
    });
});

describe('salaryMin filter parsing', () => {
    const salaryMin = (raw: string) =>
        parseFiltersFromParams(new URLSearchParams(`salaryMin=${raw}`)).salaryMin;

    it.each(['1e400', 'abc', '0', '-5', ''])('treats %s as no filter', (raw) => {
        expect(salaryMin(raw)).toBeNull();
    });

    it('keeps a real salary floor', () => {
        expect(salaryMin('120000')).toBe(120000);
    });

    it('never yields a non-finite value', () => {
        for (const raw of ['1e400', '-1e400', 'Infinity', 'NaN']) {
            const value = salaryMin(raw);
            expect(value === null || Number.isFinite(value)).toBe(true);
        }
    });
});
