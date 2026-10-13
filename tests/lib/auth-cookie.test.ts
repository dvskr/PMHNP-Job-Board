/**
 * "Sign in to apply" shown to signed-in candidates, on every job, on every
 * browser and device, not fixed by clearing cookies.
 *
 * THE CAUSE. hasLikelyAuthCookie matched `sb-<ref>-auth-token=` and nothing
 * else. @supabase/ssr chunks any cookie over MAX_CHUNK_SIZE (3180 bytes) into
 * `sb-<ref>-auth-token.0`, `.1`, ... so a chunked name ends in `.0` and did
 * not match. The session cookie crosses 3180 bytes once the JWT carries a
 * fully populated profile, so this hit precisely the users who had finished
 * setting up their account, and signing in again just minted another chunked
 * cookie.
 *
 * Two candidates reported it from the live site before anything caught it.
 * The regex is one half of the fix; the other half is in ApplyButton, where a
 * negative from this hint may no longer decide the gate on its own.
 *
 * Cookie values here are structural stand-ins, not real tokens.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { hasLikelyAuthCookie } from '@/lib/auth-cookie';

/** A project ref is a 20-char lowercase id; the exact value is irrelevant. */
const REF = 'abcdefghijklmnopqrst';

function setCookie(value: string): void {
  Object.defineProperty(globalThis, 'document', {
    value: { cookie: value },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'document');
});

describe('a chunked session cookie is still a session', () => {
  it('matches the chunked name that broke the live site', () => {
    // The exact shape @supabase/ssr writes once the cookie exceeds 3180
    // bytes. This returned false before the fix, which is the whole bug.
    setCookie(`sb-${REF}-auth-token.0=base64-part-one`);
    expect(hasLikelyAuthCookie()).toBe(true);
  });

  it('matches every chunk index, not just the first', () => {
    for (const n of [0, 1, 2, 9, 10, 11]) {
      setCookie(`sb-${REF}-auth-token.${n}=part`);
      expect(hasLikelyAuthCookie(), `chunk .${n}`).toBe(true);
    }
  });

  it('matches a full multi-chunk cookie jar', () => {
    setCookie(
      `sb-${REF}-auth-token.0=part-one; sb-${REF}-auth-token.1=part-two`,
    );
    expect(hasLikelyAuthCookie()).toBe(true);
  });

  it('still matches the unchunked name', () => {
    setCookie(`sb-${REF}-auth-token=single-value`);
    expect(hasLikelyAuthCookie()).toBe(true);
  });
});

describe('it finds the cookie wherever it sits in the jar', () => {
  it('first, middle and last', () => {
    const auth = `sb-${REF}-auth-token.0=v`;
    for (const jar of [
      auth,
      `other=1; ${auth}`,
      `other=1; ${auth}; another=2`,
      `a=1; b=2; ${auth}`,
    ]) {
      setCookie(jar);
      expect(hasLikelyAuthCookie(), jar).toBe(true);
    }
  });
});

describe('what must NOT count as a session', () => {
  it('no cookies at all', () => {
    setCookie('');
    expect(hasLikelyAuthCookie()).toBe(false);
  });

  it('unrelated cookies', () => {
    setCookie('ga=1; consent=yes; theme=dark');
    expect(hasLikelyAuthCookie()).toBe(false);
  });

  it('the PKCE verifier, which exists mid-sign-in and is not a session', () => {
    setCookie(`sb-${REF}-auth-token-code-verifier=abc123`);
    expect(hasLikelyAuthCookie()).toBe(false);
  });

  it('does not run the ref segment across a cookie boundary', () => {
    // `[^=]+` would let the "ref" span the `;` and splice the tail of one
    // cookie onto the head of the next, inventing a match from two
    // unrelated cookies. `[^=;\s]+` is why that cannot happen.
    setCookie('sb-x=1; something-auth-token=2');
    expect(hasLikelyAuthCookie()).toBe(false);
  });

  it('a name that merely contains the phrase', () => {
    setCookie('my-auth-token=1; xsb-abc-auth-tokenx=2');
    expect(hasLikelyAuthCookie()).toBe(false);
  });

  it('server-side, where there is no document', () => {
    Reflect.deleteProperty(globalThis as object, 'document');
    expect(hasLikelyAuthCookie()).toBe(false);
  });
});

describe('the pattern agrees with the chunker it has to track', () => {
  it('accepts exactly the names @supabase/ssr CHUNK_LIKE_REGEX produces', () => {
    // Its chunker splits on /^(.*)[.](0|[1-9][0-9]*)$/, so a chunk suffix is
    // a dot and a non-zero-padded integer. Anything else is not a chunk and
    // must not be treated as one.
    const base = `sb-${REF}-auth-token`;
    for (const ok of [`${base}.0`, `${base}.1`, `${base}.42`]) {
      setCookie(`${ok}=v`);
      expect(hasLikelyAuthCookie(), ok).toBe(true);
    }
    for (const notASession of [`${base}-code-verifier`, `${base}.x`, `${base}.`]) {
      setCookie(`${notASession}=v`);
      expect(hasLikelyAuthCookie(), notASession).toBe(false);
    }
  });
});
