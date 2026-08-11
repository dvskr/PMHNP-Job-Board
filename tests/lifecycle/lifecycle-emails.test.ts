/**
 * Lifecycle email registry — unit tests.
 *
 * Pins the registry shape, trigger windows, the pure send-gate predicate
 * (isSendable), and the rendered HTML of every registry email. No email is
 * ever sent here: buildHtml is pure and findEligible is never invoked
 * (prisma is globally mocked by tests/setup.ts anyway).
 */
import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_EMAILS,
  LIFECYCLE_WINDOWS,
  DAY_MS,
  SHARED_MARKETING_CAP_DAYS,
  SHARED_MARKETING_CAP_EMAIL_TYPES,
  MAX_SENDS_PER_RUN,
  isWithinTriggerWindow,
  windowBounds,
  isSendable,
  getLifecycleEmail,
  type LifecycleEmailId,
} from '@/lib/lifecycle-emails';

const NOW = new Date('2026-08-12T15:30:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

/** Email HTML minus the <style> block, which is never rendered as text.
 *  Conditional (VML/mso) comments are deliberately KEPT: their button text
 *  is what Outlook actually shows. */
const visibleCopy = (html: string): string =>
  html.replace(/<style[\s\S]*?<\/style>/gi, '');

describe('registry shape', () => {
  it('ships exactly the six specified emails with unique ids', () => {
    const ids = LIFECYCLE_EMAILS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      [
        'employer_day2_screening',
        'employer_day7_talent',
        'employer_expired_renewal',
        'candidate_day2_alert',
        'candidate_day7_resume',
        'candidate_day14_visibility',
      ].sort(),
    );
  });

  it('splits three employer and three candidate emails', () => {
    expect(LIFECYCLE_EMAILS.filter((d) => d.audience === 'employer')).toHaveLength(3);
    expect(LIFECYCLE_EMAILS.filter((d) => d.audience === 'candidate')).toHaveLength(3);
  });

  it('every entry has a window, subject, sample context, and builders', () => {
    for (const def of LIFECYCLE_EMAILS) {
      expect(LIFECYCLE_WINDOWS[def.id]).toBeDefined();
      expect(def.subject(def.sampleContext).length).toBeGreaterThan(10);
      expect(typeof def.buildHtml).toBe('function');
      expect(typeof def.findEligible).toBe('function');
    }
  });

  it('getLifecycleEmail resolves known ids and rejects unknown ones', () => {
    expect(getLifecycleEmail('candidate_day2_alert')?.audience).toBe('candidate');
    expect(getLifecycleEmail('nope')).toBeUndefined();
  });
});

describe('trigger windows', () => {
  it('pins the day-N minimums from the spec', () => {
    expect(LIFECYCLE_WINDOWS.employer_day2_screening.minDays).toBe(2);
    expect(LIFECYCLE_WINDOWS.employer_day7_talent.minDays).toBe(7);
    expect(LIFECYCLE_WINDOWS.employer_expired_renewal.minDays).toBe(3);
    expect(LIFECYCLE_WINDOWS.candidate_day2_alert.minDays).toBe(2);
    expect(LIFECYCLE_WINDOWS.candidate_day7_resume.minDays).toBe(7);
    expect(LIFECYCLE_WINDOWS.candidate_day14_visibility.minDays).toBe(14);
  });

  it('every window has a staleness upper bound (no first-enable blast)', () => {
    for (const id of Object.keys(LIFECYCLE_WINDOWS) as LifecycleEmailId[]) {
      const w = LIFECYCLE_WINDOWS[id];
      expect(w.maxDays).toBeGreaterThan(w.minDays);
      expect(w.maxDays).toBeLessThanOrEqual(60);
    }
  });

  it('isWithinTriggerWindow honors both bounds', () => {
    const w = { minDays: 2, maxDays: 30 };
    expect(isWithinTriggerWindow(daysAgo(1), NOW, w)).toBe(false); // too fresh
    expect(isWithinTriggerWindow(daysAgo(2), NOW, w)).toBe(true); // boundary
    expect(isWithinTriggerWindow(daysAgo(15), NOW, w)).toBe(true);
    expect(isWithinTriggerWindow(daysAgo(30), NOW, w)).toBe(true); // boundary
    expect(isWithinTriggerWindow(daysAgo(31), NOW, w)).toBe(false); // stale
  });

  it('windowBounds mirrors isWithinTriggerWindow', () => {
    const w = { minDays: 3, maxDays: 30 };
    const { earliest, latest } = windowBounds(NOW, w);
    expect(earliest.getTime()).toBe(daysAgo(30).getTime());
    expect(latest.getTime()).toBe(daysAgo(3).getTime());
  });
});

describe('isSendable send gates', () => {
  const base = {
    emailId: 'candidate_day2_alert' as LifecycleEmailId,
    alreadySentEmailIds: new Set<string>(),
    lastLifecycleSentAt: null as Date | null,
    recentSharedMarketingSend: false,
    suppressed: false,
    alreadySelectedThisRun: false,
    now: NOW,
  };

  it('allows a clean recipient', () => {
    expect(isSendable({ ...base })).toEqual({ ok: true });
  });

  it('blocks suppressed addresses', () => {
    expect(isSendable({ ...base, suppressed: true }).reason).toBe('suppressed');
  });

  it('never repeats an emailId per user', () => {
    expect(
      isSendable({ ...base, alreadySentEmailIds: new Set(['candidate_day2_alert']) }).reason,
    ).toBe('already_sent');
  });

  it('a different already-sent emailId does not block (only the 7-day cap does)', () => {
    const verdict = isSendable({
      ...base,
      alreadySentEmailIds: new Set(['candidate_day7_resume']),
      lastLifecycleSentAt: daysAgo(10),
    });
    expect(verdict.ok).toBe(true);
  });

  it('enforces one email max per user per run', () => {
    expect(isSendable({ ...base, alreadySelectedThisRun: true }).reason).toBe('one_per_run');
  });

  it('enforces the 7-day cap against prior lifecycle sends', () => {
    expect(isSendable({ ...base, lastLifecycleSentAt: daysAgo(3) }).reason).toBe(
      'lifecycle_7d_cap',
    );
    expect(isSendable({ ...base, lastLifecycleSentAt: daysAgo(8) }).ok).toBe(true);
  });

  it('enforces the shared cap across sibling connect-feature email types', () => {
    expect(isSendable({ ...base, recentSharedMarketingSend: true }).reason).toBe(
      'shared_marketing_7d_cap',
    );
  });
});

describe('shared cap wiring', () => {
  it('the shared list carries both this feature and the employer match digest', () => {
    expect(SHARED_MARKETING_CAP_EMAIL_TYPES).toContain('lifecycle');
    expect(SHARED_MARKETING_CAP_EMAIL_TYPES).toContain('employer_match_digest');
    expect(SHARED_MARKETING_CAP_DAYS).toBe(7);
  });

  it('the per-run batch cap is bounded', () => {
    expect(MAX_SENDS_PER_RUN).toBeGreaterThan(0);
    expect(MAX_SENDS_PER_RUN).toBeLessThanOrEqual(500);
  });
});

describe('rendered HTML', () => {
  const EXPECTED_CTA: Record<LifecycleEmailId, string> = {
    employer_day2_screening: '/employer/dashboard',
    employer_day7_talent: '/employer/talent-search',
    employer_expired_renewal: 'renew%3Dsample-job-id',
    candidate_day2_alert: '/job-alerts',
    candidate_day7_resume: '/dashboard/resume-studio',
    candidate_day14_visibility: '/settings',
  };

  for (const def of LIFECYCLE_EMAILS) {
    describe(def.id, () => {
      const html = def.buildHtml(def.sampleContext);
      const subject = def.subject(def.sampleContext);

      it('renders a complete V2 shell', () => {
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('PMHNP Hiring');
        expect(html).toContain('Manage preferences'); // unsubscribe footer
      });

      it('links to its CTA target', () => {
        expect(html).toContain(EXPECTED_CTA[def.id]);
      });

      it('contains no em or en dashes in copy (subject + body)', () => {
        expect(subject).not.toMatch(/[–—]/);
        // Scope to VISIBLE copy. The shared V2 shell's <style> block carries
        // em dashes inside CSS comments ("/* Force light mode — ... */") that
        // every platform email has shipped with for months; they are never
        // rendered as text. The no-dashes rule is about copy a reader sees,
        // so strip the style block rather than reach into shared
        // infrastructure this feature does not own.
        expect(visibleCopy(html)).not.toMatch(/[–—]/);
        expect(html).not.toContain('&mdash;');
        expect(html).not.toContain('&ndash;');
      });

      it('never leaks candidate contact fields into employer copy', () => {
        // Emails must link INTO the platform; no mailto: to candidates and
        // no resume file links.
        expect(html).not.toMatch(/mailto:(?!support@)/);
        expect(html).not.toContain('resumeUrl');
      });
    });
  }

  it('the visibility email describes the browse view and the unlock step honestly', () => {
    // This card is the consent statement for switching profileVisible on, so it
    // must match the product. It used to promise employers "never see your email
    // address, phone number, or resume file", which is false: an employer with
    // an active posting can unlock a visible profile
    // (app/api/employer/candidates/[id]) and the unlock returns contactEmail and
    // mints a signed resume download. Pin BOTH the honest wording and the
    // absence of the old absolute promise.
    const def = getLifecycleEmail('candidate_day14_visibility')!;
    const html = def.buildHtml(def.sampleContext);
    expect(html).toContain('first name and last initial');
    expect(html).not.toMatch(/never see your email address/);
    expect(html).toMatch(/contact details and resume file are not in that view/i);
    expect(html).toMatch(/has to unlock your profile/i);
  });

  it('the talent email states the same privacy transform employers see', () => {
    const def = getLifecycleEmail('employer_day7_talent')!;
    const html = def.buildHtml(def.sampleContext);
    expect(html).toContain('first name and last initial');
  });

  it('the renewal email names what a renewal re-triggers', () => {
    const def = getLifecycleEmail('employer_expired_renewal')!;
    const html = def.buildHtml(def.sampleContext);
    expect(html).toMatch(/alert subscribers/i);
    expect(html).toMatch(/AI search and candidate recommendations/);
  });

  it('personalizes the greeting and falls back cleanly', () => {
    const def = getLifecycleEmail('candidate_day2_alert')!;
    expect(def.buildHtml({ firstName: 'Casey' })).toContain('Hi Casey,');
    expect(def.buildHtml({ firstName: null })).toContain('Hi there,');
  });

  it('escapes HTML in user-supplied context values', () => {
    const def = getLifecycleEmail('employer_expired_renewal')!;
    const html = def.buildHtml({
      firstName: '<script>x</script>',
      jobTitle: 'PMHNP & "Friends" <b>',
      jobId: 'job-1',
      expiredAt: new Date('2026-08-01T00:00:00Z'),
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('PMHNP &amp; &quot;Friends&quot; &lt;b&gt;');
  });
});
