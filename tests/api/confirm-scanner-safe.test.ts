/**
 * Regression lock: email confirmation must survive corporate link scanners.
 *
 * THE BUG THIS PINS SHUT
 * Confirmation emails carried Supabase's `action_link`, a single-use
 * /auth/v1/verify URL that is consumed by a plain GET. Microsoft Defender for
 * Office 365 Safe Links (and Proofpoint, Mimecast, Barracuda) pre-fetch every
 * link in inbound mail to detonate it in a sandbox, which spent the token
 * before the human clicked. Recipients saw "invalid or has expired" and could
 * never finish signing up. It ran for months and hit corporate mailboxes
 * hardest, which is the employer segment. One employer requested four resends
 * in under half an hour before one finally beat the scanner.
 *
 * THE INVARIANTS
 *  1. No email may ever carry action_link again.
 *  2. The emailed page must NOT verify on mount. A GET has to be inert.
 *  3. Verification happens only on an explicit POST, server-side, rate limited.
 *  4. First-time signup must use our sender, not only the resend buttons.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('confirmation email content', () => {
  const src = read('app/api/auth/send-confirmation/route.ts');

  it('never emails Supabase action_link', () => {
    // The only permitted mentions are in the explanatory comment.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toContain('properties.action_link');
    expect(code).not.toContain('action_link');
  });

  it('emails our own inert confirm URL carrying the hashed token', () => {
    expect(src).toContain('hashed_token');
    expect(src).toContain('/auth/confirm');
    expect(src).toContain('token_hash=');
  });

  it('does not log the token or the recipient address', () => {
    // PII was scrubbed from this surface in a prior commit; keep it scrubbed.
    expect(src).not.toContain("{ email: normalizedEmail }");
    expect(src).not.toMatch(/logger\.(info|warn|error)\([^)]*url:/);
  });
});

describe('confirm page is inert on GET', () => {
  const src = read('app/auth/confirm/page.tsx');

  it('parks the token_hash strategy in an awaiting-click state', () => {
    expect(src).toContain("token_hash");
    expect(src).toContain("'awaiting-click'");
    expect(src).toContain('setPending');
  });

  it('verification runs from a click handler, never from the mount effect', () => {
    // confirmNow must be defined outside the effect and wired to onClick.
    expect(src).toContain('const confirmNow = async ()');
    expect(src).toContain('onClick={confirmNow}');
    // The effect must not call it.
    const effectStart = src.indexOf('useEffect(() => {');
    const effectEnd = src.indexOf('}, [router])');
    const effectBody = src.slice(effectStart, effectEnd);
    expect(effectBody).not.toContain('confirmNow(');
    expect(effectBody).not.toContain('verifyOtp');
  });

  it('offers a resend when the token is genuinely spent', () => {
    expect(src).toContain('Send me a new link');
    expect(src).toContain('/api/auth/send-confirmation');
  });
});

describe('server-side verification route', () => {
  const src = read('app/api/auth/verify-confirmation/route.ts');

  it('is POST only', () => {
    expect(src).toContain('export async function POST');
    expect(src).not.toContain('export async function GET');
  });

  it('verifies the OTP server-side and is rate limited', () => {
    expect(src).toContain('verifyOtp');
    expect(src).toContain('token_hash');
    expect(src).toContain('rateLimit(');
  });

  it('re-validates the redirect target as a same-origin path', () => {
    expect(src).toContain('safeInternalPath');
  });

  it('does not leak whether the address exists', () => {
    // One coarse message for expired / used / malformed.
    expect(src).toContain('no longer valid');
    expect(src).not.toMatch(/user not found|no such user|unknown email/i);
  });

  it('never logs the token', () => {
    expect(src).not.toMatch(/logger\.\w+\([^)]*tokenHash/);
    expect(src).not.toMatch(/logger\.\w+\([^)]*token_hash/);
  });
});

describe('first-time signup uses our sender', () => {
  const src = read('components/auth/SignUpForm.tsx');

  it('requests our confirmation email when the signup needs confirming', () => {
    expect(src).toContain('/api/auth/send-confirmation');
    // Guarded on there being no session, i.e. confirmation is pending.
    expect(src).toContain('if (!data.session)');
  });
});
