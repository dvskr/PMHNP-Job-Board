/**
 * The candidate application funnel has to read like a person wrote it.
 *
 * The rejection email that prompted this said:
 *
 *   "There is an update on your application for Full-Time PMHNP ... Your
 *    application has moved to the **not selected** stage."
 *
 * under a clipboard emoji subject, with no greeting, and a "View Application
 * Details" button pointing at the application that had just ended. Every one
 * of those was a separate defect and each gets a test, because copy is the
 * part of a codebase with no compiler.
 *
 * These assert the copy objects directly rather than the source text, which
 * is why lib/email/application-status-copy.ts exists as its own module:
 * tests/setup.ts mocks lib/email-service.ts wholesale.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { STATUS_COPY, statusCopyFor } from '@/lib/email/application-status-copy';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const JOB = 'Remote PMHNP, Telehealth';
const EMPLOYER = 'Northwind Behavioral';

/** Every stage that sends mail. 'applied' deliberately sends nothing. */
const STAGES = Object.keys(STATUS_COPY);

/** Emoji and pictographs, which have no place in these subject lines. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2049}\u{203C}]/u;

describe('the funnel covers every stage exactly once', () => {
  it('has copy for all five stages an employer can set', () => {
    expect(new Set(STAGES)).toEqual(
      new Set(['screening', 'interview', 'offered', 'hired', 'rejected']),
    );
  });

  it('sends nothing for a status with no copy', () => {
    // 'applied' is already covered by the confirmation email; a second mail
    // saying "your application is applied" would be noise.
    expect(statusCopyFor('applied')).toBeNull();
    expect(statusCopyFor('')).toBeNull();
    expect(statusCopyFor('__proto__')).toBeNull();
  });
});

describe.each(STAGES)('%s', (stage) => {
  const copy = STATUS_COPY[stage];
  const subject = copy.subject(JOB, EMPLOYER);
  const body = copy.body(JOB, EMPLOYER);
  const preheader = copy.preheader(JOB, EMPLOYER);

  it('has no emoji in the subject', () => {
    // The old subjects ran from a party popper to a clipboard depending on
    // the verdict. A celebratory emoji on a rejection is the worst version
    // of this email, and the mix reads as automated on the good ones too.
    expect(subject).not.toMatch(EMOJI);
  });

  it('has no em or en dashes anywhere, per the repo copy rule', () => {
    for (const text of [copy.heading, subject, body, preheader, copy.ctaLabel]) {
      expect(text, `dash in: ${text}`).not.toMatch(/[–—]/);
    }
  });

  it('does not describe the reader as having moved to a stage', () => {
    // The scaffold that produced "moved to the not selected stage".
    for (const text of [subject, body, preheader, copy.heading]) {
      expect(text.toLowerCase()).not.toContain('moved to the');
      expect(text.toLowerCase()).not.toMatch(/\bstage\b/);
    }
  });

  it('names the job and the employer where the reader expects them', () => {
    expect(subject).toContain(JOB);
    expect(body).toContain(JOB);
    // The body always identifies the employer; hired's preheader leads with
    // the role instead, which is the better line for that one.
    expect(body).toContain(EMPLOYER);
  });

  it('does not stack exclamation marks', () => {
    for (const text of [subject, body, preheader]) {
      expect((text.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it('has a sentence case CTA, not Title Case Shouting', () => {
    // "View Application Details" became "View your application".
    const words = copy.ctaLabel.split(' ').slice(1);
    const capitalised = words.filter((w) => /^[A-Z]/.test(w));
    expect(capitalised, `CTA over-capitalised: ${copy.ctaLabel}`).toHaveLength(0);
  });

  it('keeps the subject short enough not to truncate in a client', () => {
    // Roughly what Gmail shows on desktop. Long job titles can push past it,
    // so this is generous, but a subject that opens with boilerplate before
    // the useful words is the thing to catch.
    expect(subject.length).toBeLessThan(120);
  });
});

describe('the rejection is the one that has to be right', () => {
  const copy = STATUS_COPY.rejected;

  it('does not put the verdict in bold', () => {
    // It used to render "<strong>not selected</strong>" mid sentence.
    const bolded = [...copy.body(JOB, EMPLOYER).matchAll(/<strong>(.*?)<\/strong>/g)].map((m) => m[1]);
    for (const b of bolded) {
      expect(b.toLowerCase()).not.toContain('not selected');
      expect(b.toLowerCase()).not.toContain('rejected');
    }
    // The only thing emphasised is the role they applied for.
    expect(bolded).toEqual([JOB]);
  });

  it('does not announce the rejection in the heading', () => {
    // The heading shows in the preview pane beside the subject.
    expect(copy.heading.toLowerCase()).not.toContain('not selected');
    expect(copy.heading.toLowerCase()).not.toContain('unsuccessful');
  });

  it('sends the reader to open roles, not back to the dead application', () => {
    expect(copy.ctaPath).toBe('/jobs');
    expect(copy.ctaLabel.toLowerCase()).not.toContain('application details');
  });

  it('acknowledges the outcome rather than only stating it', () => {
    const body = copy.body(JOB, EMPLOYER).toLowerCase();
    expect(body).toContain('thank you');
    expect(body).toContain('disappointing');
  });

  it('is the only stage whose CTA leaves the application', () => {
    const elsewhere = STAGES.filter((s) => s !== 'rejected').map((s) => STATUS_COPY[s].ctaPath);
    expect(new Set(elsewhere)).toEqual(new Set(['/my-applications']));
  });
});

describe('the good news stages actually sound like good news', () => {
  it('an offer and a hire both open with or contain congratulations', () => {
    for (const stage of ['offered', 'hired']) {
      expect(STATUS_COPY[stage].body(JOB, EMPLOYER).toLowerCase()).toContain('congratulations');
    }
  });

  it('an interview invitation says who makes contact next', () => {
    expect(STATUS_COPY.interview.body(JOB, EMPLOYER).toLowerCase()).toContain('contact you');
  });

  it('under review tells the candidate there is nothing to do', () => {
    expect(STATUS_COPY.screening.body(JOB, EMPLOYER).toLowerCase()).toContain('nothing you need to do');
  });
});

describe('the surrounding funnel emails were fixed too', () => {
  const src = read('lib/email-service.ts');

  it('every funnel email actually renders its greeting', () => {
    // All three computed `greeting` and then never interpolated it, which is
    // why the screenshot opened with "There is an update on your application"
    // and addressed nobody. Count the uses, not just the declarations.
    const declared = (src.match(/const greeting = /g) ?? []).length;
    const used = (src.match(/\$\{greeting\}/g) ?? []).length;
    expect(declared).toBeGreaterThanOrEqual(3);
    expect(used, 'a greeting is computed and then dropped').toBeGreaterThanOrEqual(declared);
  });

  it('no application funnel subject carries an emoji', () => {
    // Scoped to the three funnel senders. Other emails in this file still
    // use emoji subjects (marketing digests, posting confirmations); whether
    // those should change is an open-rate decision, not a correctness one,
    // and widening this test would quietly make that decision here.
    const funnel = src.slice(
      src.indexOf('export async function sendNewApplicationEmail'),
      src.indexOf('EMPLOYER PERFORMANCE REPORT'),
    );
    expect(funnel.length).toBeGreaterThan(0);
    const subjects = [...funnel.matchAll(/subject: (`[^`]*`|copy\.subject\([^)]*\))/g)].map((m) => m[1]);
    expect(subjects.length, 'funnel subjects not found').toBeGreaterThanOrEqual(3);
    for (const s of subjects) {
      expect(s, `emoji in subject: ${s}`).not.toMatch(EMOJI);
    }
  });

  it('the employer notification names the candidate in the body, not just the subject', () => {
    const fn = src.slice(
      src.indexOf('export async function sendNewApplicationEmail'),
      src.indexOf('APPLICATION CONFIRMATION'),
    );
    expect(fn).toContain('escapeHtml(candidateName)');
  });

  it('resume and cover letter flags are reported rather than accepted and ignored', () => {
    // Both functions destructured hasResume/hasCoverLetter and never read
    // them. Whether a resume is attached is the most useful thing the
    // employer notification can carry.
    const fn = src.slice(
      src.indexOf('export async function sendNewApplicationEmail'),
      src.indexOf('export async function sendStatusUpdateEmail'),
    );
    expect((fn.match(/hasResume/g) ?? []).length).toBeGreaterThan(2);
    expect((fn.match(/hasCoverLetter/g) ?? []).length).toBeGreaterThan(2);
  });
});
