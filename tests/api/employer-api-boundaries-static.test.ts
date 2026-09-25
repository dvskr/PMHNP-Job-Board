/**
 * Static guards for the employer / checkout / webhook boundary fixes.
 *
 * Each of these reproduced against the running app during the 2026-09-03 hunt
 * and needs either a live database, a real Stripe session or a signed webhook
 * to exercise end to end. They are pinned here against the real source so a
 * later edit cannot quietly restore the old behaviour.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('employer pagination params cannot reach Prisma as NaN', () => {
    const src = read('app/api/employer/candidates/route.ts');

    it('clamps page and limit the way the public listing does', () => {
        // Math.max(1, parseInt('abc')) is NaN, so skip was NaN and Prisma threw.
        expect(src).not.toMatch(/Math\.max\(1,\s*parseInt\(searchParams\.get\('page'\)/);
        expect(src).toContain('Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1');
        expect(src).toContain('Number.isFinite(rawLimit)');
    });

    it('still caps the page size at 50', () => {
        expect(src).toMatch(/Math\.min\(Math\.max\(1,\s*rawLimit\),\s*50\)/);
    });
});

describe('employer write routes validate the body before Prisma sees it', () => {
    it('candidate-alerts parses through a schema instead of destructuring raw JSON', () => {
        const src = read('app/api/employer/candidate-alerts/route.ts');
        expect(src).toContain('alertSchema.parse');
        // A string `specialties` used to throw on .join; arrays only now.
        expect(src).toContain('specialties: z.array(z.string())');
        expect(src).toContain('minExperience: z.number().int()');
        expect(src).not.toMatch(/specialties\?\.\s*length\s*\?\s*specialties\.join/);
        // A wrongly-typed `states` was dropped to null behind a success response.
        expect(src).toContain('status: 400');
    });

    it('messages type-checks recipientId, subject and body', () => {
        const src = read('app/api/employer/messages/route.ts');
        expect(src).toContain('readJsonBody');
        expect(src).toContain("typeof recipientId !== 'string'");
        expect(src).toContain("typeof messageBody !== 'string'");
    });

    it('messages applies the candidate privacy gate to new outreach only', () => {
        const src = read('app/api/employer/messages/route.ts');
        // An opted-out candidate still received cold InMail and its notification
        // email; the unlock endpoints have always refused the same candidate.
        expect(src).toContain('recipientAcceptsOutreach');
        expect(src).toContain("recipient.role === 'job_seeker' && recipient.profileVisible && recipient.openToOffers");
        // The gate sits inside the new-conversation branch: replies in an
        // existing thread are not new contact and are not blocked.
        const newOutreachBlock = src.slice(src.indexOf('if (!existingConversation) {'));
        expect(newOutreachBlock).toContain('recipientAcceptsOutreach');
    });

    it('applicants type-checks applicationId, status and notes', () => {
        const src = read('app/api/employer/applicants/route.ts');
        expect(src).toContain('readJsonBody');
        expect(src).toContain("typeof applicationId !== 'string'");
        expect(src).toContain("typeof notes !== 'string'");
        expect(src).toContain('sanitizeText(nextNotes, NOTES_MAX_LENGTH)');
    });
});

describe('employer settings sanitizes what it copies onto every posting', () => {
    const src = read('app/api/employer/settings/route.ts');

    it('runs company URLs through sanitizeUrl', () => {
        // javascript: survived into companyWebsite and was rendered as an href
        // on every public job page for the account.
        expect(src).toContain('sanitizeUrl');
        expect(src).toContain('companyUpdate.companyWebsite = cleanUrl(companyWebsite)');
        expect(src).toContain('companyUpdate.companyLogoUrl = cleanUrl(companyLogoUrl)');
        expect(src).not.toMatch(/companyUpdate\.companyWebsite = companyWebsite;/);
    });

    it('clamps the name, phone and description fields', () => {
        expect(src).toContain('cleanText(firstName, 50)');
        expect(src).toContain('cleanText(lastName, 50)');
        expect(src).toContain('cleanText(phone, 20)');
        expect(src).toContain('COMPANY_DESCRIPTION_MAX');
    });
});

describe('employer API namespace answers non-employers consistently', () => {
    it('settings/notifications GET has a role gate', () => {
        const src = read('app/api/employer/settings/notifications/route.ts');
        expect(src).toContain("!['employer', 'admin'].includes(profile.role)");
    });
});

describe('candidate endpoints answer with a JSON envelope on failure', () => {
    it('the detail and resume routes both have a top-level catch', () => {
        for (const rel of [
            'app/api/employer/candidates/[id]/route.ts',
            'app/api/employer/candidates/[id]/resume/route.ts',
        ]) {
            const src = read(rel);
            expect(src).toContain('handleGet');
            expect(src).toMatch(/catch \(error\)[\s\S]{0,200}status: 500/);
        }
    });
});

describe('a client-named posting is only charged while it has headroom', () => {
    it('both unlock paths consult postingUnlockHeadroom', () => {
        const single = read('app/api/employer/candidates/[id]/route.ts');
        const bulk = read('app/api/employer/profiles/unlock-bulk/route.ts');
        expect(single).toContain('postingUnlockHeadroom');
        expect(bulk).toContain('postingUnlockHeadroom');
        // The bulk path verified once for the whole batch and then charged
        // every candidate to that posting regardless.
        expect(bulk).not.toContain('chargePostingId = verifiedPostingId ?? unlockCheck.postingId');
        expect(bulk).toContain('verifiedPostingHeadroom -= 1');
    });
});

describe('an archived posting cannot be republished through the API', () => {
    it('toggle-publish reads archivedAt and refuses', () => {
        const src = read('app/api/employer/jobs/[jobId]/toggle-publish/route.ts');
        expect(src).toContain('archivedAt: true');
        expect(src).toContain('!job.isPublished && job.archivedAt');
        expect(src).toContain('status: 409');
    });
});

describe('billing does not leak documents the dedicated endpoints refuse', () => {
    it('withholds the Stripe URLs unless the posting is paid', () => {
        const src = read('app/api/employer/billing/route.ts');
        expect(src).toContain("const documentsAvailable = ej.paymentStatus === 'paid'");
        expect(src).toContain('documentsAvailable ? c.invoicePdfUrl : null');
        expect(src).toContain('documentsAvailable ? c.hostedInvoiceUrl : null');
    });
});

describe('the AI search cap and reset window have one owner', () => {
    it('the usage route imports them instead of re-declaring them', () => {
        const src = read('app/api/employer/usage/route.ts');
        expect(src).toContain("import { AI_DAILY_CAPS } from '@/lib/ai-usage'");
        expect(src).toContain("import { midnightCentralTimeAsUtc } from '@/lib/time'");
        expect(src).toContain('AI_DAILY_CAPS.talent_search_rerank');
        // The inline Intl copy of midnightCentralTimeAsUtc is gone.
        expect(src).not.toContain('timeZoneName: \'longOffset\'');
    });
});

describe('paid posting creation', () => {
    const src = read('app/api/create-checkout/route.ts');

    it('uses UTC expiry math, not local-time setDate', () => {
        expect(src).toContain('expiresFromNow(config.durationDays)');
        expect(src).not.toMatch(/expiresAt\.setDate\(/);
    });

    it('derives the structured arrays the eligibility search reads', () => {
        // An empty eligibleStateCodes on a remote row reads as "open
        // everywhere" in app/api/jobs/search/semantic.
        expect(src).toContain('collectJobTypes');
        expect(src).toContain('extractEligibleStates');
        expect(src).toMatch(/jobTypes,\s*\n\s*eligibleStateCodes,/);
    });

    it('names one company on the listing and on the Stripe documents', () => {
        expect(src).toContain('const billingCompanyName = lockedCompanyName || sanitized.employer');
        expect(src).not.toMatch(/description: `\$\{sanitized\.employer\}/);
        expect(src).not.toMatch(/\$\{sanitized\.employer\} \(\$\{sanitized\.location\}\)/);
    });

    it('creates screening questions inside the posting transaction', () => {
        expect(src).toContain('tx.jobScreeningQuestion.create');
        expect(src).not.toContain('prisma.jobScreeningQuestion.create');
    });
});

describe('the Stripe webhook only grants what was actually paid for', () => {
    const src = read('app/api/webhooks/stripe/route.ts');

    it('refuses to publish a session whose payment_status is not paid', () => {
        expect(src).toContain("session.payment_status !== 'paid'");
    });

    it('stamps the paid window at payment, not at draft creation', () => {
        expect(src).toContain('expiresFromNow(config.getDurationDays(paidTierForDuration))');
    });

    it('lets a renewal extend a paused or archived posting without relisting it', () => {
        expect(src).toContain('honorsExistingHold');
        expect(src).toContain('...(honorsExistingHold && { isPublished: true })');
        expect(src).not.toMatch(/expiresAt: newExpiresAt,\s*\n\s*isPublished: true,/);
    });

    it('revokes a posting only when its last unrefunded charge is refunded', () => {
        expect(src).toContain('stillPaidElsewhere');
        expect(src).toContain('if (isFullRefund && !stillPaidElsewhere)');
    });

    it('restores a posting whose dispute closed in our favour', () => {
        expect(src).toContain("event.type === 'charge.dispute.closed'");
        expect(src).toContain("dispute.status === 'won' || dispute.status === 'warning_closed'");
        // Payment status comes back; going live again stays the employer's call.
        expect(src).toContain("data: { paymentStatus: 'paid' }");
    });
});

describe('Resend engagement status only moves forward', () => {
    const src = read('app/api/webhooks/resend/route.ts');

    it('constrains the update to statuses below the incoming stage', () => {
        expect(src).toContain('statusesBelow');
        expect(src).toContain('where: { resendId, status: { in: statusesBelow(status) } }');
        // The unconditional write that let a late 'delivered' erase a click.
        expect(src).not.toMatch(/where: \{ resendId \},\s*\n\s*data: \{ status: statusMap\[eventType\] \}/);
    });

    it('keeps bounce and complaint terminal rather than laddered', () => {
        expect(src).toContain('ENGAGEMENT_LADDER');
        expect(src).not.toMatch(/ENGAGEMENT_LADDER[\s\S]{0,80}bounced/);
    });
});
