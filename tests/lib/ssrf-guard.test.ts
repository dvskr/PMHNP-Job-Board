/**
 * P5.A — SSRF guard for the dead-link prober. We deliberately do NOT
 * resolve DNS in the test; the guard is a hostname-literal check
 * intended as a cheap 80%-effective defense. The 20% gap is DNS-rebind
 * attacks, which would require an outbound proxy to fully close.
 */
import { describe, it, expect } from 'vitest';
import { isPrivateOrInternalHost, probeUrl } from '@/lib/health/probe';

describe('isPrivateOrInternalHost', () => {
    it.each([
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        '169.254.169.254',           // AWS metadata
        'metadata.google.internal',
        '10.0.0.1',
        '10.255.255.255',
        '192.168.1.1',
        '172.16.0.5',
        '172.20.0.1',
        '172.31.255.255',
        '169.254.0.1',
        'k8s.cluster.internal',
        'something.local',
    ])('blocks %s', (host) => {
        expect(isPrivateOrInternalHost(host)).toBe(true);
    });

    it.each([
        'example.com',
        'pmhnphiring.com',
        'api.adzuna.com',
        'boards.greenhouse.io',
        '8.8.8.8',
        '1.1.1.1',
        // 172.32 onward is public (out of the 172.16/12 block)
        '172.32.0.1',
        '11.0.0.1',
    ])('allows %s', (host) => {
        expect(isPrivateOrInternalHost(host)).toBe(false);
    });
});

describe('probeUrl SSRF refusal', () => {
    it('refuses to probe http://localhost/* (returns errorKind ssrf_blocked, never calls fetch)', async () => {
        let fetchCalls = 0;
        const result = await probeUrl('http://localhost:8080/anything', {
            fetchImpl: (() => {
                fetchCalls++;
                throw new Error('SSRF guard should have short-circuited before fetch');
            }) as unknown as typeof fetch,
        });
        expect(fetchCalls).toBe(0);
        expect(result.errorKind).toBe('ssrf_blocked');
        expect(result.finalStatus).toBeNull();
    });

    it('refuses cloud-metadata service URL', async () => {
        const result = await probeUrl('http://169.254.169.254/latest/meta-data/', {
            fetchImpl: (() => {
                throw new Error('should not be called');
            }) as unknown as typeof fetch,
        });
        expect(result.errorKind).toBe('ssrf_blocked');
        expect(result.errorMessage).toMatch(/169\.254\.169\.254/);
    });

    it('refuses redirect to private IP (mid-probe)', async () => {
        // First hop: public URL returns 302 to a private IP. Guard must
        // refuse the redirect, NOT fetch the private IP.
        let hopCount = 0;
        const fakeFetch: typeof fetch = async (input) => {
            hopCount++;
            if (hopCount === 1) {
                return new Response(null, {
                    status: 302,
                    headers: { Location: 'http://10.0.0.1/admin' },
                });
            }
            throw new Error('SSRF guard should have refused the redirect');
        };
        const result = await probeUrl('https://example.com/redirector', {
            fetchImpl: fakeFetch,
        });
        expect(hopCount).toBe(1);
        expect(result.errorKind).toBe('ssrf_blocked');
        expect(result.errorMessage).toMatch(/10\.0\.0\.1/);
    });
});
