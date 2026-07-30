/**
 * Regression lock: confirmation links must not be redeemable by a GET.
 *
 * THE BUG THIS PINS SHUT
 * Confirmation emails carried a single-use URL that is spent by a plain GET,
 * so anything opening it before the recipient burned it. Requesting a new link
 * also invalidates the previous one, so a user who resends a few times and
 * then clicks an older email sees "invalid or has expired" every time. One
 * employer requested four links inside half an hour and only got in on the
 * newest one.
 *
 * THE INVARIANTS
 *  1. No email may ever carry action_link again.
 *  2. The emailed page must NOT verify on mount. A GET has to be inert.
 *  3. Verification happens only on an explicit POST, server-side, rate limited.
 *  4. Signup sends exactly ONE confirmation email, not two competing ones.
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

describe('signup does not double-send a confirmation email', () => {
  const src = read('components/auth/SignUpForm.tsx');

  it('leaves the first confirmation email to Supabase, which has working SMTP', () => {
    // signUp() already triggers Supabase's own "Confirm sign up" template.
    // That template is pointed at /auth/confirm?token_hash=... so it is
    // scanner-safe. Calling our sender here as well would deliver two
    // competing links, and requesting a second link invalidates the first,
    // which is the confusion this whole area is meant to remove.
    const afterSignUp = src.slice(src.indexOf('if (data.user) {'));
    const upToWelcome = afterSignUp.slice(0, afterSignUp.indexOf("'/api/auth/welcome'"));
    expect(upToWelcome).not.toContain('send-confirmation');
  });

  it('still exposes an explicit resend the user can trigger', () => {
    expect(src).toContain('handleResendConfirmation');
    expect(src).toContain('/api/auth/send-confirmation');
  });
});
