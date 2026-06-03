/**
 * E1 regression — RFC 8058 List-Unsubscribe header construction.
 *
 * Before the fix every List-Unsubscribe header pointed at a 'use client' page
 * with no POST handler, so Gmail/Yahoo one-click POSTs hit a 405 (a deliverability
 * penalty). The fix points the machine-POST URL at the real /api/one-click-unsubscribe
 * endpoint while keeping the human page as a second fallback URL.
 */
import { describe, it, expect } from 'vitest';
import {
  oneClickUnsubscribeUrl,
  buildListUnsubscribeHeaders,
} from '@/lib/email/list-unsubscribe';

const BASE = 'https://pmhnphiring.com';

describe('oneClickUnsubscribeUrl', () => {
  it('builds the API POST URL from a base + token', () => {
    expect(oneClickUnsubscribeUrl(BASE, 'tok123')).toBe(
      'https://pmhnphiring.com/api/one-click-unsubscribe?token=tok123',
    );
  });

  it('strips a trailing slash from the base', () => {
    expect(oneClickUnsubscribeUrl('https://pmhnphiring.com/', 'tok123')).toBe(
      'https://pmhnphiring.com/api/one-click-unsubscribe?token=tok123',
    );
  });
});

describe('buildListUnsubscribeHeaders', () => {
  it('returns null when no unsubscribe URL is provided (transactional mail)', () => {
    expect(buildListUnsubscribeHeaders(undefined, BASE)).toBeNull();
  });

  it('points List-Unsubscribe at the API POST route + keeps the human page as fallback', () => {
    const headers = buildListUnsubscribeHeaders(`${BASE}/unsubscribe?token=tok123`, BASE);
    expect(headers).not.toBeNull();
    expect(headers!['List-Unsubscribe']).toContain('/api/one-click-unsubscribe?token=tok123');
    expect(headers!['List-Unsubscribe']).toContain('/unsubscribe?token=tok123');
    expect(headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('does NOT claim one-click (no -Post header) when the URL carries no token', () => {
    // A tokenless URL can't drive a machine POST, so we advertise it as a plain
    // unsubscribe link instead of falsely promising RFC 8058 compliance.
    const headers = buildListUnsubscribeHeaders(`${BASE}/email-preferences`, BASE);
    expect(headers).not.toBeNull();
    expect(headers!['List-Unsubscribe']).toBe('<https://pmhnphiring.com/email-preferences>');
    expect(headers!['List-Unsubscribe-Post']).toBeUndefined();
  });
});
