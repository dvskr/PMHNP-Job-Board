/**
 * Free-post quota identity keys (lib/employer-quota.ts).
 *
 * These tests encode two things that must not regress:
 *   1. The prod leak closes. One account posting free twice across an email
 *      change (one company domain, then another) must be caught.
 *   2. The gate cannot be turned into a weapon. Nothing an attacker types into
 *      the post form may produce a blocking key, because that would let them
 *      consume a third party's free post.
 */
import { describe, it, expect } from 'vitest';
import {
  buildQuotaKeys,
  describeQuotaKey,
  domainFromEmail,
  rawDomainFromEmail,
  orgKeyFromCompanyName,
  quotaKeysOverlap,
  FREE_EMAIL_DOMAINS,
} from '@/lib/employer-quota';

describe('domainFromEmail', () => {
  it('lowercases and trims a company address', () => {
    expect(domainFromEmail('  Careers@AcmePsych.ORG ')).toBe('acmepsych.org');
  });

  it('returns null for consumer mailbox providers', () => {
    for (const provider of FREE_EMAIL_DOMAINS) {
      expect(domainFromEmail(`someone@${provider}`)).toBeNull();
    }
  });

  it('returns null for malformed addresses', () => {
    const bad = [null, undefined, '', 'nope', '@x.com', 'a@', 'a@b@c.com', 'a@localhost', 'a@.'];
    for (const value of bad) {
      expect(domainFromEmail(value as string)).toBeNull();
    }
  });

  it('ignores a trailing dot in the domain', () => {
    expect(domainFromEmail('a@acmepsych.org.')).toBe('acmepsych.org');
  });
});

describe('buildQuotaKeys', () => {
  const ACME_UID = '9f1c2d3e-aaaa-4bbb-8ccc-000000000001';
  const april = buildQuotaKeys({ userId: ACME_UID, signupEmail: 'careers@acme-now.com' });

  it('emits exactly the two session-verified keys', () => {
    expect(april).toEqual([`acct:${ACME_UID}`, 'dom:acme-now.com']);
  });

  // The actual prod incident: support changed the account address, the
  // domain-derived key changed with it, and the gate handed out a second
  // free post. acct: is what closes this.
  it('blocks the same account after its email domain changes', () => {
    const july = buildQuotaKeys({ userId: ACME_UID, signupEmail: 'careers@acmepsych.org' });
    expect(quotaKeysOverlap(july, april)).toBe(true);
  });

  it('blocks a second account created on the same company domain', () => {
    const other = buildQuotaKeys({
      userId: 'a-completely-different-uid',
      signupEmail: 'hr@acme-now.com',
    });
    expect(quotaKeysOverlap(other, april)).toBe(true);
  });

  it('does not block an unrelated employer', () => {
    const other = buildQuotaKeys({ userId: 'unrelated-uid', signupEmail: 'jobs@northgatepsych.com' });
    expect(quotaKeysOverlap(other, april)).toBe(false);
  });

  it('is deterministic and deduplicated', () => {
    expect(buildQuotaKeys({ userId: ACME_UID, signupEmail: 'careers@acme-now.com' })).toEqual(april);
    expect(new Set(april).size).toBe(april.length);
  });

  it('never emits a key for a consumer mailbox domain', () => {
    // Two strangers on gmail must not collide into one shared quota.
    const a = buildQuotaKeys({ userId: 'uid-a', signupEmail: 'a@gmail.com' });
    const b = buildQuotaKeys({ userId: 'uid-b', signupEmail: 'b@gmail.com' });
    expect(a).toEqual(['acct:uid-a']);
    expect(b).toEqual(['acct:uid-b']);
    expect(quotaKeysOverlap(a, b)).toBe(false);
  });

  it('tolerates missing or junk identity without throwing', () => {
    expect(buildQuotaKeys({})).toEqual([]);
    expect(buildQuotaKeys({ userId: '   ', signupEmail: '@' })).toEqual([]);
    expect(buildQuotaKeys({ userId: null, signupEmail: null })).toEqual([]);
  });
});

/**
 * Anti-weaponization. An earlier version of this lib keyed on the posting
 * form's contact email, company website, and employer name. That let anyone
 * permanently consume a rival's free post by typing the rival's details, and
 * it produced false positives on shared ATS domains and templated practice
 * names. The type only accepts session fields now; these lock that shut.
 */
describe('form input cannot create a blocking key', () => {
  const attacker = { userId: 'attacker-uid', signupEmail: 'me@attacker-llc.com' };
  const victim = { userId: 'victim-uid', signupEmail: 'careers@acmepsych.org' };

  it('ignores form-shaped fields even if a future edit smuggles them in', () => {
    const poisoned = buildQuotaKeys({
      ...attacker,
      ...({
        contactEmail: 'careers@acmepsych.org',
        employerName: 'Acme Psychiatry',
        companyWebsite: 'https://acmepsych.org',
      } as Record<string, string>),
    });
    expect(poisoned).toEqual(['acct:attacker-uid', 'dom:attacker-llc.com']);
    expect(quotaKeysOverlap(poisoned, buildQuotaKeys(victim))).toBe(false);
  });

  it('does not collide two clinics that merely share a site builder or ATS', () => {
    const a = buildQuotaKeys({ userId: 'clinic-a', signupEmail: 'a@clinic-a.com' });
    const b = buildQuotaKeys({ userId: 'clinic-b', signupEmail: 'b@clinic-b.com' });
    expect(quotaKeysOverlap(a, b)).toBe(false);
  });

  it('does not collide clinics with similar templated names', () => {
    const a = buildQuotaKeys({ userId: 'uid-1', signupEmail: 'hr@serenitybh-tx.com' });
    const b = buildQuotaKeys({ userId: 'uid-2', signupEmail: 'hr@serenitybh-ohio.com' });
    expect(quotaKeysOverlap(a, b)).toBe(false);
  });
});

describe('describeQuotaKey', () => {
  it('explains which signal matched so the 403 is not a guess', () => {
    expect(describeQuotaKey('acct:abc')).toBe('this account');
    expect(describeQuotaKey('dom:acmepsych.org')).toBe('the domain acmepsych.org');
    expect(describeQuotaKey('legacy-row')).toBe('a previous post');
  });
});

describe('rawDomainFromEmail (shared derivation for gate, preview, and guard)', () => {
  it('normalizes the shapes that made raw split() diverge from the guard', () => {
    // "x@gmail.com." raw-splits to "gmail.com." and sailed past the
    // exact-match consumer blocklist while the checkout guard rejected it.
    expect(rawDomainFromEmail('x@gmail.com.')).toBe('gmail.com');
    expect(rawDomainFromEmail('x@GMAIL.COM')).toBe('gmail.com');
    expect(rawDomainFromEmail('x@intranet')).toBeNull();
    expect(rawDomainFromEmail('nope')).toBeNull();
  });

  it('does NOT screen consumer providers (that is the caller contract)', () => {
    expect(rawDomainFromEmail('x@gmail.com')).toBe('gmail.com');
    expect(domainFromEmail('x@gmail.com')).toBeNull();
  });
});

describe('org key from the write-once company name', () => {
  const UID = 'uid-org-1';
  const base = { userId: UID, signupEmail: 'hr@northgatepsych.com' };

  it('emits an org key alongside the account and domain keys', () => {
    expect(buildQuotaKeys({ ...base, lockedCompanyName: 'Northgate Psychiatry PLLC' }))
      .toEqual([`acct:${UID}`, 'dom:northgatepsych.com', 'org:northgatepsychiatry']);
  });

  // The evasion this key exists to close: same organization, brand new
  // account, brand new domain. acct: and dom: both miss; org: catches it.
  it('catches the same organization on a new account and a new domain', () => {
    const first = buildQuotaKeys({ userId: 'uid-a', signupEmail: 'hr@acmepsych.com', lockedCompanyName: 'Acme Psychiatry' });
    const second = buildQuotaKeys({ userId: 'uid-b', signupEmail: 'jobs@acmepsych.org', lockedCompanyName: 'Acme Psychiatry LLC' });
    expect(quotaKeysOverlap(second, first)).toBe(true);
  });

  it('ignores legal suffixes and a leading "the" when matching', () => {
    const a = orgKeyFromCompanyName('The Riverbend Counseling Group, LLC');
    const b = orgKeyFromCompanyName('Riverbend Counseling');
    expect(a).toBe(b);
    expect(a).toBe('org:riverbendcounseling');
  });

  it('is case and punctuation insensitive', () => {
    expect(orgKeyFromCompanyName('Blue  Sky  Telepsych')).toBe(orgKeyFromCompanyName('blue-sky telepsych'));
    expect(orgKeyFromCompanyName('Smith & Jones Psychiatry')).toBe(orgKeyFromCompanyName('Smith and Jones Psychiatry'));
  });

  // Failing OPEN on generic names is deliberate: refusing a real customer
  // their free post costs more than missing an evader.
  it('emits NO key for names too generic to identify an organization', () => {
    for (const generic of [
      'Psychiatry', 'Mental Health', 'Behavioral Health', 'Counseling',
      'Wellness', 'Clinic', 'Healthcare', 'Telehealth', 'Nursing',
      'Associates', 'Test', 'N/A', 'none', 'The Group LLC',
    ]) {
      expect(orgKeyFromCompanyName(generic)).toBeNull();
    }
  });

  it('emits NO key for a name shorter than the minimum', () => {
    expect(orgKeyFromCompanyName('TMR')).toBeNull();
    expect(orgKeyFromCompanyName('A B')).toBeNull();
    expect(orgKeyFromCompanyName('')).toBeNull();
    expect(orgKeyFromCompanyName(null)).toBeNull();
  });

  it('does not collide two unrelated clinics with similar templated names', () => {
    const a = buildQuotaKeys({ userId: 'uid-1', signupEmail: 'hr@serenity-tx.com', lockedCompanyName: 'Serenity Behavioral Health of Texas' });
    const b = buildQuotaKeys({ userId: 'uid-2', signupEmail: 'hr@serenity-oh.com', lockedCompanyName: 'Serenity Behavioral Health of Ohio' });
    expect(quotaKeysOverlap(a, b)).toBe(false);
  });

  it('a generic-named employer is unaffected by another generic-named one', () => {
    const a = buildQuotaKeys({ userId: 'uid-x', signupEmail: 'a@clinic-one.com', lockedCompanyName: 'Wellness' });
    const b = buildQuotaKeys({ userId: 'uid-y', signupEmail: 'b@clinic-two.com', lockedCompanyName: 'Wellness' });
    expect(a.some((k) => k.startsWith('org:'))).toBe(false);
    expect(quotaKeysOverlap(a, b)).toBe(false);
  });

  it('still refuses to build a key from anything form-shaped', () => {
    const poisoned = buildQuotaKeys({
      userId: 'attacker',
      signupEmail: 'me@attacker-llc.com',
      ...({ employerName: 'Northgate Psychiatry', company: 'Northgate Psychiatry' } as Record<string, string>),
    });
    expect(poisoned.some((k) => k.startsWith('org:'))).toBe(false);
    expect(poisoned).toEqual(['acct:attacker', 'dom:attacker-llc.com']);
  });

  it('names the organization in the refusal so support can explain it', () => {
    expect(describeQuotaKey('org:northgatepsychiatry')).toBe('your organization');
  });
});
