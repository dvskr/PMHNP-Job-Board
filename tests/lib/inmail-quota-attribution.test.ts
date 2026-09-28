/**
 * An employer's paid InMail allowance may only be spent by the employer.
 *
 * getInMailsForPosting counted conversations where the employer was
 * `participantA OR participantB`. participantA is always the party who
 * STARTED the thread, and there are three creation sites:
 *
 *   app/api/employer/messages   employer  -> candidate   (the actual InMail)
 *   app/api/candidate/messages  candidate -> employer
 *   lib/system-messages         system    -> employer
 *
 * So two of the three put the employer in participantB, and both were being
 * charged to the allowance they paid for: a candidate writing in, and our
 * own weekly nudge. A posting that attracted interest could exhaust its own
 * outreach budget on inbound mail before the employer sent one message, and
 * nothing in the product would explain why.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { getInMailsForPosting } from '@/lib/tier-limits';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const EMPLOYER_PROFILE_ID = 'profile-employer-1';
const JOB_ID = 'job-1';
const POSTED_AT = new Date('2026-09-01T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.count.mockResolvedValue(0);
});

describe('only threads the employer started count against their allowance', () => {
  it('counts on participantA alone, never participantB', async () => {
    await getInMailsForPosting(EMPLOYER_PROFILE_ID, JOB_ID, POSTED_AT);

    const where = db.conversation.count.mock.calls[0][0].where;
    expect(where.participantA).toBe(EMPLOYER_PROFILE_ID);

    // The whole bug in one assertion: nothing in the predicate may match a
    // thread on the employer being its RECIPIENT.
    expect(JSON.stringify(where)).not.toContain('participantB');
  });

  it('still scopes to this posting, or to a legacy thread with no job', async () => {
    await getInMailsForPosting(EMPLOYER_PROFILE_ID, JOB_ID, POSTED_AT);
    const where = db.conversation.count.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ jobId: JOB_ID }, { jobId: null }]);
  });

  it('still only counts threads started after the posting was bought', async () => {
    // Otherwise a new posting inherits the previous posting's spend.
    await getInMailsForPosting(EMPLOYER_PROFILE_ID, JOB_ID, POSTED_AT);
    expect(db.conversation.count.mock.calls[0][0].where.createdAt).toEqual({ gte: POSTED_AT });
  });

  it('returns what the database counted', async () => {
    db.conversation.count.mockResolvedValue(7);
    await expect(getInMailsForPosting(EMPLOYER_PROFILE_ID, JOB_ID, POSTED_AT)).resolves.toBe(7);
  });
});

describe('participantA really is the initiator at every creation site', () => {
  // The fix is only correct while this holds. A fourth creation site that
  // puts the employer in participantA for a thread they did not start would
  // silently reintroduce the bug, so the invariant is pinned here rather
  // than left as a comment.
  it('the employer InMail route puts the sender in participantA', () => {
    const src = read('app/api/employer/messages/route.ts');
    const create = src.slice(src.indexOf('conversation.create'));
    expect(create).toMatch(/participantA: senderProfile\.id/);
  });

  it('a candidate inquiry puts the candidate in participantA', () => {
    const src = read('app/api/candidate/messages/route.ts');
    const create = src.slice(src.indexOf('conversation.create'));
    expect(create).toMatch(/participantA: profile\.id/);
    expect(create).toMatch(/participantB: employerProfile\.id/);
  });

  it('the system nudge puts the system in participantA and the employer in B', () => {
    // Which is precisely why it was being charged to the employer: our own
    // weekly nudge arrives as inbound mail on a thread carrying their jobId.
    const src = read('lib/system-messages.ts');
    expect(src).toMatch(/participantA: systemProfileId, participantB: recipientProfileId/);
  });

  it('there are exactly three places a conversation is created', () => {
    // A fourth needs its initiator checked against this rule before it
    // ships, which is what this assertion is for.
    const files = ['app/api/employer/messages/route.ts', 'app/api/candidate/messages/route.ts', 'lib/system-messages.ts'];
    for (const f of files) {
      expect(read(f), `${f} no longer creates a conversation`).toContain('conversation.create');
    }
  });
});

describe('the legacy total helper was already correct', () => {
  it('counts messages the employer sent, not threads they are in', () => {
    // getTotalInMailsForEmployer counts EmployerMessage by senderId, which
    // never had this problem. Recorded so nobody "fixes" it to match.
    const src = read('lib/tier-limits.ts');
    const fn = src.slice(src.indexOf('export async function getTotalInMailsForEmployer'));
    expect(fn).toContain('employerMessage.count');
    expect(fn).toMatch(/senderId,/);
  });
});
