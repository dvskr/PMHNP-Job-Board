/**
 * Tests for the per-job error classifier added 2026-05-06.
 *
 * Coarse buckets only — fine-grained error analysis still happens via
 * stack traces in logs. This is for the Discord summary so we can see
 * "ten DB conflicts" vs "ten normalizer crashes" without grepping logs.
 */
import { describe, it, expect } from 'vitest';
import { classifyJobError } from '@/lib/ingestion-service';

describe('classifyJobError', () => {
    it('classifies Prisma P2002 unique-constraint as db_unique', () => {
        expect(classifyJobError({ code: 'P2002', message: 'duplicate key' })).toBe('db_unique');
    });

    it('classifies any other Prisma P-prefixed code as db_other', () => {
        expect(classifyJobError({ code: 'P2003', message: 'fk violation' })).toBe('db_other');
        expect(classifyJobError({ code: 'P2025', message: 'record not found' })).toBe('db_other');
        expect(classifyJobError({ code: 'P1001', message: 'connect timeout' })).toBe('db_other');
    });

    it('classifies fetch / network / ECONN messages as fetch_or_network', () => {
        expect(classifyJobError(new Error('fetch failed'))).toBe('fetch_or_network');
        expect(classifyJobError(new Error('network error'))).toBe('fetch_or_network');
        expect(classifyJobError(new Error('ECONNREFUSED 1.2.3.4:5432'))).toBe('fetch_or_network');
        expect(classifyJobError(new Error('EAI_AGAIN getaddrinfo'))).toBe('fetch_or_network');
        expect(classifyJobError(new Error('socket hang up'))).toBe('fetch_or_network');
    });

    it('falls back to unknown for everything else', () => {
        expect(classifyJobError(new Error('Cannot read property of undefined'))).toBe('unknown');
        expect(classifyJobError('string error')).toBe('unknown');
        expect(classifyJobError(null)).toBe('unknown');
        expect(classifyJobError(undefined)).toBe('unknown');
        expect(classifyJobError(42)).toBe('unknown');
    });

    it('does not crash on objects with non-string code/message', () => {
        expect(classifyJobError({ code: 123, message: 456 })).toBe('unknown');
        expect(classifyJobError({})).toBe('unknown');
    });
});
