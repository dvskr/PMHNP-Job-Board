/**
 * Extension-token verification must fail CLOSED (hunt 2026-09-03).
 *
 * The secret resolved as `EXTENSION_JWT_SECRET || NEXTAUTH_SECRET || ''`, and
 * the verify side then handed that empty string to jwtVerify. On jose 6.x the
 * exploit does not land — WebCrypto importKey refuses a zero-length raw HMAC
 * key with a DataError, which the function's own try/catch turns into null —
 * so the route failed closed by accident, one library upgrade away from
 * failing open. These tests pin the guard itself: with no secret configured,
 * NO token is accepted, whatever it is signed with.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function requestWith(token: string): NextRequest {
  return { headers: new Headers({ authorization: `Bearer ${token}` }) } as unknown as NextRequest;
}

async function mintWith(secret: string): Promise<string> {
  return new SignJWT({ purpose: 'extension', userId: 'victim-profile-id' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

describe('verifyExtensionToken', () => {
  it('rejects every token when no secret is configured', async () => {
    delete process.env.EXTENSION_JWT_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    const attackerSigned = await mintWith('whatever-the-attacker-picked');
    const { verifyExtensionToken, hasExtensionSigningSecret } = await import('@/lib/verify-extension-token');
    expect(hasExtensionSigningSecret()).toBe(false);
    expect(await verifyExtensionToken(requestWith(attackerSigned))).toBeNull();
  });

  it('treats an empty-string secret as unconfigured, not as a key', async () => {
    process.env.EXTENSION_JWT_SECRET = '';
    process.env.NEXTAUTH_SECRET = '';
    const attackerSigned = await mintWith('whatever-the-attacker-picked');
    const { verifyExtensionToken, hasExtensionSigningSecret } = await import('@/lib/verify-extension-token');
    expect(hasExtensionSigningSecret()).toBe(false);
    expect(await verifyExtensionToken(requestWith(attackerSigned))).toBeNull();
  });

  it('accepts a token signed with the configured secret', async () => {
    process.env.EXTENSION_JWT_SECRET = 'a-real-and-sufficiently-long-secret';
    const token = await mintWith('a-real-and-sufficiently-long-secret');
    const { verifyExtensionToken } = await import('@/lib/verify-extension-token');
    const payload = await verifyExtensionToken(requestWith(token));
    expect(payload?.userId).toBe('victim-profile-id');
  });

  it('rejects a token signed with the wrong secret', async () => {
    process.env.EXTENSION_JWT_SECRET = 'a-real-and-sufficiently-long-secret';
    const token = await mintWith('some-other-secret-entirely');
    const { verifyExtensionToken } = await import('@/lib/verify-extension-token');
    expect(await verifyExtensionToken(requestWith(token))).toBeNull();
  });
});
