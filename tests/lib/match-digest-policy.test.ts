/**
 * Unit tests for the employer match-digest pure layer:
 *   - cadence predicates (cooldown, single follow-up window)
 *   - candidate name privacy transform
 *   - click-destination allowlist (the whole open-redirect defense)
 *   - template rendering privacy + tracking contract
 *
 * NO email is ever sent here — these modules are pure by design
 * (lib/email/match-digest-policy.ts, email-click-allowlist.ts,
 * match-digest-template.ts have no Resend/Prisma imports).
 */
import { describe, it, expect } from 'vitest';
import {
  DIGEST_COOLDOWN_DAYS,
  FOLLOW_UP_AFTER_DAYS,
  MAX_CANDIDATES_PER_DIGEST,
  MAX_DIGESTS_PER_RUN,
  MAX_FOLLOW_UPS_PER_RUN,
  MIN_MATCH_SIMILARITY,
  CONNECT_LIFECYCLE_EMAIL_TYPES,
  isPostUnderDigestCooldown,
  isFollowUpDue,
  formatCandidateDisplayName,
  splitProfileList,
  type DigestCandidateCard,
} from '@/lib/email/match-digest-policy';
import {
  resolveClickDestination,
  DEFAULT_CLICK_DESTINATION,
} from '@/lib/email/email-click-allowlist';
import {
  buildMatchDigestHtml,
  buildMatchDigestSubject,
  buildTrackedUrl,
  sanitizeSubjectText,
} from '@/lib/email/match-digest-template';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-08-12T15:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);

describe('digest cooldown (1 per posting per 7 days)', () => {
  it('a never-digested posting is not under cooldown', () => {
    expect(isPostUnderDigestCooldown(null, now)).toBe(false);
  });

  it('a digest 6 days ago blocks a new one', () => {
    expect(isPostUnderDigestCooldown(daysAgo(6), now)).toBe(true);
  });

  it('a digest 8 days ago allows a new one', () => {
    expect(isPostUnderDigestCooldown(daysAgo(8), now)).toBe(false);
  });

  it('the cooldown constant is 7 days', () => {
    expect(DIGEST_COOLDOWN_DAYS).toBe(7);
  });
});

describe('follow-up window (exactly once, 4+ days, unclicked, post live)', () => {
  const base = { sentAt: daysAgo(5), clickedAt: null, followUpSentAt: null };

  it('due at 4+ days when unclicked and post is live', () => {
    expect(isFollowUpDue(base, now, true)).toBe(true);
    expect(isFollowUpDue({ ...base, sentAt: daysAgo(4) }, now, true)).toBe(true);
  });

  it('not due before 4 days', () => {
    expect(isFollowUpDue({ ...base, sentAt: daysAgo(3) }, now, true)).toBe(false);
  });

  it('never after a click', () => {
    expect(isFollowUpDue({ ...base, clickedAt: daysAgo(2) }, now, true)).toBe(false);
  });

  it('never twice', () => {
    expect(isFollowUpDue({ ...base, followUpSentAt: daysAgo(1) }, now, true)).toBe(false);
  });

  it('never for a dead posting', () => {
    expect(isFollowUpDue(base, now, false)).toBe(false);
  });

  it('the follow-up constant is 4 days', () => {
    expect(FOLLOW_UP_AFTER_DAYS).toBe(4);
  });
});

describe('candidate name privacy transform', () => {
  it('first name plus last initial', () => {
    expect(formatCandidateDisplayName('Jane', 'Doe')).toBe('Jane D.');
  });

  it('first name only when last name missing', () => {
    expect(formatCandidateDisplayName('Jane', null)).toBe('Jane');
  });

  it('generic label when first name missing', () => {
    expect(formatCandidateDisplayName(null, 'Doe')).toBe('PMHNP Candidate');
  });
});

describe('policy constants', () => {
  it('digests cap at 5 cards and a real similarity floor exists', () => {
    expect(MAX_CANDIDATES_PER_DIGEST).toBe(5);
    expect(MIN_MATCH_SIMILARITY).toBeGreaterThan(0);
  });

  it('the shared lifecycle cap list includes the digest email type', () => {
    expect(CONNECT_LIFECYCLE_EMAIL_TYPES).toContain('employer_match_digest');
  });

  it('splitProfileList trims and drops empties', () => {
    expect(splitProfileList(' CA, TX ,,NY ')).toEqual(['CA', 'TX', 'NY']);
    expect(splitProfileList(null)).toEqual([]);
  });
});

describe('click destination allowlist (open-redirect defense)', () => {
  it('accepts allowlisted relative paths, including subpaths and queries', () => {
    expect(resolveClickDestination('/employer/candidates')).toBe('/employer/candidates');
    expect(resolveClickDestination('/employer/candidates/abc123')).toBe('/employer/candidates/abc123');
    expect(resolveClickDestination('/employer/talent-search?postingId=x')).toBe('/employer/talent-search?postingId=x');
    expect(resolveClickDestination('/employer/dashboard')).toBe('/employer/dashboard');
  });

  it.each([
    ['absolute URL', 'https://acmepsych.org/phish'],
    ['protocol-relative', '//acmepsych.org'],
    ['backslash protocol-relative', '/\\acmepsych.org'],
    ['scheme smuggling', '/employer/candidates/https://acmepsych.org'],
    ['traversal', '/employer/candidates/../../admin'],
    ['encoded slash smuggling', '/employer%2f..%2fadmin'],
    ['non-allowlisted path', '/admin'],
    ['prefix lookalike', '/employer/candidatesevil'],
    ['empty', ''],
    ['whitespace', '/employer/candidates/a b'],
  ])('falls back to the default for %s', (_label, input) => {
    expect(resolveClickDestination(input)).toBe(DEFAULT_CLICK_DESTINATION);
  });

  it('null falls back to the default', () => {
    expect(resolveClickDestination(null)).toBe(DEFAULT_CLICK_DESTINATION);
  });
});

describe('digest template rendering', () => {
  const cards: DigestCandidateCard[] = [
    {
      profileId: 'cand-1',
      displayName: 'Jane D.',
      headline: 'PMHNP-BC, telepsych focus',
      yearsExperience: 6,
      licenseStates: ['CA', 'TX'],
      specialties: ['Adult', 'Telepsych'],
      similarity: 0.72,
    },
    {
      profileId: 'cand-2',
      displayName: 'Alex R.',
      headline: null,
      yearsExperience: null,
      licenseStates: [],
      specialties: [],
      similarity: 0.55,
    },
  ];

  const html = buildMatchDigestHtml({
    baseUrl: 'https://pmhnphiring.com',
    jobTitle: 'PMHNP <Outpatient>',
    candidates: cards,
    clickToken: 'tok123',
    unsubscribeToken: 'unsub-token',
  });

  it('shows the privacy-transformed names', () => {
    expect(html).toContain('Jane D.');
    expect(html).toContain('Alex R.');
  });

  it('never renders a match score: cosine similarity is not a percentage', () => {
    // The similarity on the card is operator diagnostics. Rendering 0.72 as
    // "72% match" would invent a metric, and the follow-up path (which has
    // no similarity at all) would have had to render "0% match".
    expect(html).not.toMatch(/%\s*match/i);
    expect(html).not.toContain('0% match');
  });

  it('escapes the job title everywhere, including the preheader', () => {
    // Regression: the preheader used the RAW title while the body used the
    // escaped one, so an employer-controlled job title injected markup into
    // every digest. The whole document must be free of the raw string.
    expect(html).toContain('PMHNP &lt;Outpatient&gt;');
    expect(html).not.toContain('PMHNP <Outpatient>');
  });

  it('escapes a script-tag job title rather than emitting it', () => {
    const nasty = buildMatchDigestHtml({
      baseUrl: 'https://pmhnphiring.com',
      jobTitle: '<script>alert(1)</script>',
      candidates: cards,
      clickToken: 'tok123',
      unsubscribeToken: 'unsub-token',
    });
    expect(nasty).not.toContain('<script>alert(1)</script>');
    expect(nasty).toContain('&lt;script&gt;');
  });

  it('every profile link routes through the click tracker with an encoded relative destination', () => {
    expect(html).toContain('/api/track/email-click?t=tok123&d=%2Femployer%2Fcandidates%2Fcand-1');
    expect(html).toContain('/api/track/email-click?t=tok123&d=%2Femployer%2Fcandidates%2Fcand-2');
    // CTA button also tracked.
    expect(html).toContain('d=%2Femployer%2Fcandidates"');
  });

  /**
   * The digest content only: the shared V2 shell's <style> block and its dark
   * footer are house chrome carrying the platform's own support address and
   * site links, which are not what these privacy assertions are about. Note
   * the style block must go FIRST: it defines .footer-bg, so splitting on
   * that class name before stripping it would silently cut the document at
   * the stylesheet and leave these tests asserting against an empty body.
   */
  const digestBody = () => {
    const withoutStyle = html.replace(/<style>[\s\S]*?<\/style>/g, '');
    const [body] = withoutStyle.split('footer-bg');
    return body;
  };

  it('the body slice under test is actually the digest, not an empty string', () => {
    expect(digestBody()).toContain('Jane D.');
  });

  it('contains no candidate contact channels', () => {
    expect(digestBody()).not.toMatch(/mailto:/i);
    expect(digestBody()).not.toMatch(/tel:/i);
    expect(html).not.toMatch(/@(?!pmhnphiring\.com)[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('every link in the digest body goes into the platform through the tracker', () => {
    // Stronger than banning specific words: enumerate the hrefs. A candidate
    // resume URL, an avatar on a storage host, or any third party link would
    // fail this.
    const hrefs = [...digestBody().matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith('https://pmhnphiring.com/api/track/email-click?')).toBe(true);
    }
  });

  it('renders the unsubscribe footer', () => {
    // unsubscribeFooterV2 ignores its token argument house-wide and renders a
    // generic preferences link; the real compliance surface is the
    // List-Unsubscribe header, which sendAndLog builds from the unsubscribe
    // URL the service passes. Pin what the template actually guarantees.
    expect(html).toContain('/job-alerts/manage');
    expect(html).toContain('Manage preferences');
  });

  it('no em or en dashes in any rendered copy outside the shared stylesheet', () => {
    // User-facing copy rule: colons/commas/periods, never typographic dashes.
    // The shared V2 shell has em dashes inside CSS comments in its <style>
    // block (pre-existing house chrome, never shown to a reader), so strip
    // style blocks and assert against everything a recipient can actually see.
    const visible = html.replace(/<style>[\s\S]*?<\/style>/g, '');
    expect(visible).not.toMatch(/[–—]/);
  });

  it('follow-up variant flags the reminder framing', () => {
    const followUp = buildMatchDigestHtml({
      baseUrl: 'https://pmhnphiring.com',
      jobTitle: 'PMHNP Outpatient',
      candidates: cards,
      clickToken: 'tok123',
      unsubscribeToken: 'unsub-token',
      isFollowUp: true,
    });
    expect(followUp).toContain('still available');
  });

  it('test variant carries the visible TEST banner', () => {
    const test = buildMatchDigestHtml({
      baseUrl: 'https://pmhnphiring.com',
      jobTitle: 'PMHNP Outpatient',
      candidates: cards,
      clickToken: 'test',
      unsubscribeToken: 'unsub-token',
      isTest: true,
    });
    expect(test).toContain('TEST EMAIL');
  });
});

describe('digest subject lines', () => {
  it('regular, follow-up, and test variants', () => {
    expect(buildMatchDigestSubject({ candidateCount: 3, jobTitle: 'PMHNP Outpatient' }))
      .toBe('3 PMHNP candidates match your post: PMHNP Outpatient');
    expect(buildMatchDigestSubject({ candidateCount: 1, jobTitle: 'PMHNP Outpatient' }))
      .toContain('1 PMHNP candidate ');
    expect(buildMatchDigestSubject({ candidateCount: 2, jobTitle: 'X', isFollowUp: true }))
      .toMatch(/^Reminder:/);
    expect(buildMatchDigestSubject({ candidateCount: 2, jobTitle: 'X', isTest: true }))
      .toMatch(/^\[TEST\] /);
  });

  it('subjects never contain em or en dashes', () => {
    const s = buildMatchDigestSubject({ candidateCount: 2, jobTitle: 'A Title', isFollowUp: true });
    expect(s).not.toMatch(/[–—]/);
  });

  it('strips CR/LF from an employer supplied title: subjects are mail headers', () => {
    const injected = buildMatchDigestSubject({
      candidateCount: 1,
      jobTitle: 'PMHNP\r\nBcc: someone@acmepsych.org',
    });
    expect(injected).not.toMatch(/[\r\n]/);
    expect(injected).toContain('PMHNP Bcc: someone@acmepsych.org');
  });

  it('bounds a pathological title so the real subject stays visible', () => {
    const long = buildMatchDigestSubject({ candidateCount: 1, jobTitle: 'A'.repeat(400) });
    expect(long.length).toBeLessThan(200);
    expect(long).toMatch(/\.\.\.$/);
  });

  it('keeps hyphens, which are ordinary punctuation in job titles', () => {
    expect(sanitizeSubjectText('PMHNP-BC, part-time')).toBe('PMHNP-BC, part-time');
  });
});

describe('per-run work ceiling', () => {
  it('bounds the expensive stage so the first enabled run cannot run away', () => {
    // Without a ceiling, the run after the operator flips the env flag would
    // embed + vector-search every live posting in one 120s invocation.
    expect(MAX_DIGESTS_PER_RUN).toBeGreaterThan(0);
    expect(MAX_DIGESTS_PER_RUN).toBeLessThanOrEqual(50);
    expect(MAX_FOLLOW_UPS_PER_RUN).toBeGreaterThan(0);
    expect(MAX_FOLLOW_UPS_PER_RUN).toBeLessThanOrEqual(50);
  });
});

describe('tracked URL builder', () => {
  it('encodes token and destination', () => {
    expect(buildTrackedUrl('https://pmhnphiring.com/', 'a b', '/employer/candidates?x=1'))
      .toBe('https://pmhnphiring.com/api/track/email-click?t=a%20b&d=%2Femployer%2Fcandidates%3Fx%3D1');
  });
});
