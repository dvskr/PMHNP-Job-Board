/**
 * The full-description email.
 *
 * Two things decide whether this format is safe to send, and neither is
 * visual:
 *
 *  1. Size. Gmail clips a message at roughly 102KB and hides the remainder
 *     behind "View entire message", which would put the apply button below
 *     the fold of a truncated message. A 50,000 character posting is allowed
 *     by the schema, so the body has to be budgeted, not trusted.
 *  2. Content. The layout only works on employer postings, whose description
 *     is author-written HTML sanitized at save time. Aggregator rows are
 *     plain text with a 50 character floor, and this template wrapped around
 *     two sentences is worse than the digest entry it replaced.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import {
  buildJdBodyHtml,
  hasEnoughDescription,
  visibleTextLength,
  JD_BODY_BUDGET,
  JD_MIN_VISIBLE,
} from '@/lib/email/jd-body';
import { buildFullJdEmail, formatPayRange, type FullJdJob } from '@/lib/email/full-jd-template';

const para = (n: number) => `<p>${'word '.repeat(n).trim()}.</p>`;

const JOB: FullJdJob = {
  id: 'job-fic-1',
  title: 'Psychiatric Mental Health NP, Adult Outpatient',
  employer: 'Cascade Behavioral Health',
  location: 'Remote, TX',
  jobType: 'Full-time',
  mode: 'Remote',
  experienceLabel: 'New grads welcome',
  normalizedMinSalary: 168000,
  normalizedMaxSalary: 195000,
  description: `<h2>About the role</h2><p>Cascade runs a fully remote adult outpatient service across Texas.</p><ul><li>Diagnostic evaluation and medication management.</li><li>Weekly case consultation.</li></ul><p>${'Detail sentence. '.repeat(40)}</p>`,
  screeningQuestions: [
    { questionText: 'Do you hold an active Texas APRN licence?' },
    { questionText: 'How many years in adult outpatient psychiatry?' },
  ],
};

const build = (job: FullJdJob) => buildFullJdEmail({
  job,
  jobUrl: 'https://pmhnphiring.com/jobs/example-fic-1',
  alertToken: 'alert-token-fic',
  criteriaText: 'PMHNP, Texas or remote',
  manageUrl: 'https://pmhnphiring.com/job-alerts/manage?token=alert-token-fic',
});

describe('the body is budgeted against Gmail clipping', () => {
  it('keeps a normal posting whole', () => {
    const body = buildJdBodyHtml(JOB.description);
    expect(body.truncated).toBe(false);
    expect(body.html).toContain('Cascade runs a fully remote');
  });

  it('truncates a posting that would blow the budget', () => {
    const body = buildJdBodyHtml(Array.from({ length: 40 }, () => para(60)).join(''));
    expect(body.truncated).toBe(true);
    expect(visibleTextLength(body.html)).toBeLessThanOrEqual(JD_BODY_BUDGET);
  });

  it('cuts at a block boundary, never mid sentence', () => {
    const body = buildJdBodyHtml(Array.from({ length: 40 }, () => para(60)).join(''));
    // Every kept paragraph is closed. A mid-sentence cut leaves an open tag.
    expect((body.html.match(/<p /g) || []).length).toBe((body.html.match(/<\/p>/g) || []).length);
  });

  it('still emits one block when the first block alone exceeds the budget', () => {
    // Otherwise a single enormous paragraph renders an empty email body.
    const body = buildJdBodyHtml(para(2000));
    expect(body.truncated).toBe(true);
    expect(body.html.length).toBeGreaterThan(0);
  });

  it('the whole message stays well under the clip threshold', () => {
    const huge = { ...JOB, description: Array.from({ length: 60 }, () => para(80)).join('') };
    const { html } = build(huge);
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(90_000);
  });

  it('says so when it truncated, rather than trailing off', () => {
    const huge = { ...JOB, description: Array.from({ length: 40 }, () => para(60)).join('') };
    expect(build(huge).html).toContain('Read the rest on the site');
  });
});

describe('only a posting with a real description qualifies', () => {
  it('rejects the 50 character floor an aggregator row can pass', () => {
    expect(hasEnoughDescription('Psychiatric NP wanted. Competitive pay. Apply now today.')).toBe(false);
  });

  it('accepts a posting with a genuine body', () => {
    expect(hasEnoughDescription(JOB.description)).toBe(true);
    expect(visibleTextLength(JOB.description)).toBeGreaterThan(JD_MIN_VISIBLE);
  });

  it('treats an empty description as no description', () => {
    expect(hasEnoughDescription('')).toBe(false);
    expect(buildJdBodyHtml('').html).toBe('');
  });
});

describe('the body is styled for mail, not for a browser', () => {
  const body = buildJdBodyHtml(JOB.description);

  it('inlines a style on every block, because a style block does not survive Gmail', () => {
    expect(body.html).toMatch(/<p style="[^"]+"/);
    expect(body.html).toMatch(/<li style="[^"]+"/);
    // No bare tag left behind.
    expect(body.html).not.toMatch(/<p>|<li>|<ul>/);
  });

  it('collapses headings to one label style rather than honouring h2 versus h4', () => {
    expect(body.html).not.toMatch(/<h[1-6]/);
    expect(body.html).toContain('text-transform:uppercase');
  });
});

describe('the email states only what the posting published', () => {
  it('shows the advertised range when there is one', () => {
    expect(formatPayRange(JOB)).toBe('$168k to $195k');
    expect(build(JOB).subject).toContain('$168k to $195k');
  });

  it('omits pay entirely when the posting withheld it', () => {
    const quiet: FullJdJob = { ...JOB, normalizedMinSalary: null, normalizedMaxSalary: null, minSalary: null, maxSalary: null };
    expect(formatPayRange(quiet)).toBe('');
    const { subject, html } = build(quiet);
    expect(subject).not.toMatch(/\$/);
    expect(html).not.toContain('Advertised');
  });

  it('never renders a range when both ends are the same figure', () => {
    expect(formatPayRange({ ...JOB, normalizedMaxSalary: 168000 })).toBe('$168k and up');
  });
});

describe('the message holds together', () => {
  const { html, subject, preheader } = build(JOB);

  it('offers exactly one apply button', () => {
    expect((html.match(/Apply on PMHNP Hiring/g) || []).length).toBe(2); // mso branch plus the anchor
  });

  it('carries the screening questions, which an aggregator email cannot', () => {
    expect(html).toContain('They will ask you');
    expect(html).toContain('active Texas APRN licence');
  });

  it('escapes employer-supplied text', () => {
    const nasty = { ...JOB, employer: 'Cascade <script>alert(1)</script>' };
    expect(build(nasty).html).not.toContain('<script>');
  });

  it('tells the reader why they got it and how to stop', () => {
    expect(html).toContain('your alert is set to full posting');
    expect(html).toContain('Delete alert');
  });

  it('writes its own preheader instead of inheriting the first body line', () => {
    expect(preheader).toContain('Full description inside');
    expect(subject).toContain('Cascade Behavioral Health');
  });

  it('uses no em or en dash anywhere a reader sees', () => {
    const withoutStyle = html.replace(/<style>[\s\S]*?<\/style>/g, '');
    expect(withoutStyle).not.toMatch(/[–—]/);
  });

  it('closes every table it opens', () => {
    expect((html.match(/<table/g) || []).length).toBe((html.match(/<\/table>/g) || []).length);
    expect((html.match(/<tr/g) || []).length).toBe((html.match(/<\/tr>/g) || []).length);
    expect((html.match(/<td/g) || []).length).toBe((html.match(/<\/td>/g) || []).length);
  });
});
