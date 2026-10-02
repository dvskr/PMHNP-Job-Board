/**
 * Two things the full-description chain was getting wrong in production.
 *
 * 1. IT MAILED EMPLOYERS. The chain's audience is the whole mailable lead
 *    list rather than alert holders, and an employer who made an account to
 *    post a job is on that list. So employers received job adverts for roles
 *    they are trying to fill, including their own. The daily brief does not
 *    have this problem because it only mails people who explicitly created a
 *    JobAlert; this chain mails everyone, so it has to filter itself.
 *
 * 2. IT NEVER SHOWED THE WORK MODE. The template read Job.mode, a free-text
 *    column that is null on most postings, so remote, hybrid and in-person
 *    simply did not appear. The canonical source is the isRemote/isHybrid
 *    pair, where in-person is the absence of both rather than a column.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workModeLabel } from '@/lib/filters';
import { buildFullJdEmail, type FullJdJob } from '@/lib/email/full-jd-template';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const baseJob: FullJdJob = {
  id: 'job-1',
  title: 'Psychiatric Mental Health Nurse Practitioner',
  employer: 'Northwind Behavioral',
  location: 'Austin, TX',
  description: '<p>'.concat('A substantial description. '.repeat(60), '</p>'),
  jobType: 'Full-time',
};

function render(over: Partial<FullJdJob> = {}) {
  return buildFullJdEmail({
    job: { ...baseJob, ...over },
    jobUrl: 'https://example.test/jobs/x',
    alertToken: null,
    criteriaText: null,
    manageUrl: 'https://example.test/manage',
    unsubscribeUrl: 'https://example.test/unsub',
  });
}

describe('work mode comes from the booleans, not the nullable column', () => {
  it('hybrid wins over remote, because it is the more specific claim', () => {
    // A hybrid role commonly carries isRemote too.
    expect(workModeLabel({ isRemote: true, isHybrid: true })).toBe('Hybrid');
    expect(workModeLabel({ isHybrid: true })).toBe('Hybrid');
  });

  it('remote when only that flag is set', () => {
    expect(workModeLabel({ isRemote: true })).toBe('Remote');
  });

  it('in-person is the absence of both, not a column', () => {
    expect(workModeLabel({ isRemote: false, isHybrid: false })).toBe('In-Person');
    // Which is also what an unset pair looks like.
    expect(workModeLabel({})).toBe('In-Person');
  });

  it('falls back to the free-text column rather than asserting in-person', () => {
    // The flags being false is indistinguishable from their being unset, and
    // some rows carry the truth only here. Calling a posting whose own mode
    // says Remote "In-Person" is the one error worth avoiding: it sits next
    // to a location that contradicts it.
    expect(workModeLabel({ mode: 'Remote' })).toBe('Remote');
    expect(workModeLabel({ mode: 'Hybrid' })).toBe('Hybrid');
    expect(workModeLabel({ isRemote: false, isHybrid: false, mode: 'remote' })).toBe('Remote');
  });

  it('a real flag still beats the free text', () => {
    expect(workModeLabel({ isHybrid: true, mode: 'Remote' })).toBe('Hybrid');
  });
});

describe('the email always states the work mode', () => {
  it.each([
    ['Remote', { isRemote: true }],
    ['Hybrid', { isHybrid: true }],
    ['In-Person', {}],
  ] as const)('renders %s in the snapshot strip', (label, flags) => {
    const { html } = render(flags);
    expect(html).toContain('Work mode');
    expect(html).toContain(label);
  });

  it('shows it even when Job.mode is null, which is most postings', () => {
    // The whole bug: the old template only rendered a mode chip when this
    // nullable column happened to be populated.
    const { html } = render({ mode: null, isRemote: true });
    expect(html).toContain('Work mode');
    expect(html).toContain('Remote');
  });

  it('still does not repeat a fact the location already carried', () => {
    // "Remote, TX" plus a Remote mode used to read
    // "Remote, TX, Full-time, Remote" in the inbox listing.
    const { preheader } = render({ location: 'Remote, TX', isRemote: true });
    expect(preheader).toBe('Remote, TX, Full-time. Full description inside.');
  });

  it('names the mode in the preheader when the location does not', () => {
    const { preheader } = render({ location: 'Austin, TX', isHybrid: true });
    expect(preheader).toBe('Austin, TX, Full-time, Hybrid. Full description inside.');
  });
});

describe('the chain is for candidates only', () => {
  const src = read('lib/full-jd-alert-service.ts');

  it('excludes accounts whose role is not job_seeker', () => {
    // role is session-proven and is what every other employer gate reads.
    expect(src).toMatch(/userProfile\.findMany\(\{[\s\S]{0,200}role: \{ not: 'job_seeker' \}/);
  });

  it('excludes legacy posters who have no account', () => {
    expect(src).toMatch(/employerJob\.findMany\(\{[\s\S]{0,200}userId: null/);
    expect(src).toContain('contactEmail: true');
  });

  it('filters the recipient list, not merely the query', () => {
    expect(src).toContain('employerEmails.has(email)');
    // Lowercased on both sides, because an address can be stored in more
    // than one casing and a case-sensitive miss would mail an employer.
    expect(src).toMatch(/\.email\.toLowerCase\(\)/);
    expect(src).toMatch(/\.contactEmail\.toLowerCase\(\)/);
  });

  it('excludes before anything is claimed in the ledger', () => {
    // A claim written for an excluded address would block a later
    // legitimate send of that posting to them.
    const filterAt = src.indexOf('employerEmails.has(email)');
    const claimAt = src.indexOf('claimJobsForRecipient(email');
    expect(filterAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(filterAt);
  });

  it('reports how many it excluded, so a silent over-filter is visible', () => {
    expect(src).toContain('excludedEmployers');
  });

  it('the daily brief still needs no such filter', () => {
    // It only mails JobAlert holders, so an employer is there by choice.
    const brief = read('lib/job-alerts-service.ts');
    expect(brief).toContain('jobAlert');
  });
});
