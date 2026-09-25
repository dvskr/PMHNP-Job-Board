/**
 * Admin API and cron hardening: source and behaviour locks.
 *
 * Every rail below closed a finding where the route was wrong in a way no
 * caller could see. They landed without a guard, so this file is the ratchet:
 *
 *   1. The admin write handlers type-check the body instead of allow-listing
 *      field NAMES, and turn Prisma's "row is gone" into a 404.
 *   2. Admin query params are parsed, so a non-numeric `page` or `days` is a
 *      400 and never reaches Prisma as NaN.
 *   3. /api/admin/cron-list and /api/admin/pd-campaign use requireApiAdmin,
 *      not the page-style requireAdmin that answers by THROWING a redirect.
 *   4. An admin cannot demote or delete their own account out of the console.
 *   5. Posting-management mail that carries a dashboard bearer token goes to
 *      the verified account address, not to free-text contactEmail.
 *   6. The crons that stamp a dedupe marker read the send result first, the
 *      privacy purge writes a real SQL NULL, the DSAR watchdog chunks its
 *      Discord alert and reports a rejected one, and enrich-jobs logs the
 *      rejection reason it used to drop.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    collectAdminFields,
    isRecordNotFound,
    parseBoundedInt,
} from '../../app/api/admin/_lib/field-validation';

const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

// ─── 1. body validation ──────────────────────────────────────────────────────

describe('admin write bodies are type-checked, not name-checked', () => {
    const specs = {
        title: { kind: 'requiredText' as const },
        isPublished: { kind: 'boolean' as const },
        status: { kind: 'requiredText' as const, oneOf: ['draft', 'published'] as const },
        applyLink: { kind: 'text' as const, nullable: true },
        minSalary: { kind: 'int' as const, nullable: true },
    };

    it('refuses a whitespace-only title instead of publishing a blank one', () => {
        const result = collectAdminFields({ title: '   ' }, specs);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/title/);
    });

    it('refuses a string where the column holds a boolean', () => {
        const result = collectAdminFields({ isPublished: 'yes' }, specs);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/isPublished/);
    });

    it('refuses a status outside the closed set', () => {
        expect(collectAdminFields({ status: 'bogus' }, specs).ok).toBe(false);
        expect(collectAdminFields({ status: 'published' }, specs).ok).toBe(true);
    });

    it('collects only the fields the caller actually sent', () => {
        const result = collectAdminFields({ title: ' Real Title ', ignored: 1 }, specs);
        expect(result.ok).toBe(true);
        expect(result.ok === true && result.data).toEqual({ title: 'Real Title' });
    });

    it('maps Prisma P2025 to "not found" so an unknown id is a 404, not a 500', () => {
        expect(isRecordNotFound({ code: 'P2025' })).toBe(true);
        expect(isRecordNotFound(new Error('connection refused'))).toBe(false);
    });
});

describe('admin numeric query params cannot reach Prisma as NaN', () => {
    const opts = { name: 'page', fallback: 1, min: 1, max: 100 };

    it('rejects a non-numeric value rather than clamping NaN', () => {
        const result = parseBoundedInt('abc', opts);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/whole number/);
    });

    it('rejects a fractional value', () => {
        expect(parseBoundedInt('1.5', opts).ok).toBe(false);
    });

    it('falls back when the param is absent or blank', () => {
        expect(parseBoundedInt(null, opts)).toEqual({ ok: true, value: 1 });
        expect(parseBoundedInt('  ', opts)).toEqual({ ok: true, value: 1 });
    });

    it('still clamps an in-range-kind value to the bounds', () => {
        expect(parseBoundedInt('9999', opts)).toEqual({ ok: true, value: 100 });
    });
});

describe('the admin routes that take numeric params route them through the parser', () => {
    for (const rel of ['app/api/admin/analytics/route.ts', 'app/api/admin/jobs/route.ts']) {
        it(`${rel} parses instead of Math.max(parseInt(...))`, () => {
            const src = read(rel);
            expect(src).toMatch(/parseBoundedInt\(/);
            // The old shape: NaN survives both clamps and reaches Prisma.
            expect(src).not.toMatch(/Math\.max\(\s*(1\s*,\s*)?parseInt/);
            expect(src).toMatch(/status:\s*400/);
        });
    }

    it('the analytics route is not a Server Action module', () => {
        // 'use server' marks every export as a callable server action. A route
        // handler is not one, and no other route.ts under app/api carries it.
        expect(read('app/api/admin/analytics/route.ts')).not.toMatch(/^\s*['"]use server['"]/m);
    });
});

// ─── 2. admin auth shape ─────────────────────────────────────────────────────

describe('admin APIs answer with JSON, never with a thrown redirect', () => {
    const ADMIN_API_ROUTES = [
        'app/api/admin/cron-list/route.ts',
        'app/api/admin/pd-campaign/route.ts',
        'app/api/admin/jobs/route.ts',
        'app/api/admin/jobs/[id]/route.ts',
        'app/api/admin/users/[id]/route.ts',
        'app/api/admin/blog/route.ts',
        'app/api/admin/blog/[id]/route.ts',
        'app/api/admin/analytics/route.ts',
    ];

    for (const rel of ADMIN_API_ROUTES) {
        it(`${rel} gates on requireApiAdmin`, () => {
            const src = read(rel);
            expect(src).toMatch(/requireApiAdmin\(/);
            // requireAdmin() is the PAGE helper: it signals rejection by
            // throwing a next/navigation redirect. Inside an API handler that
            // either escaped as a 307 to a fetch() caller or, when caught,
            // came back as `500 {"error":"NEXT_REDIRECT"}`.
            expect(src).not.toMatch(/\bawait\s+requireAdmin\s*\(/);
            expect(src).not.toMatch(/from\s+['"]@\/lib\/auth\/protect['"]/);
        });
    }
});

describe('the admin console cannot lock its own operator out', () => {
    const src = read('app/api/admin/users/[id]/route.ts');

    it('refuses a self-targeted role change', () => {
        // requireApiAdmin proves the caller is AN admin but not WHICH one, so
        // the guard has to resolve the caller's own profile id and compare.
        expect(src).toMatch(/getCallerProfileId/);
        expect(src).toMatch(/callerProfileId === id/);
    });

    it('refuses a self-targeted hard delete', () => {
        const deleteBody = src.slice(src.indexOf('export async function DELETE'));
        expect(deleteBody).toMatch(/getCallerProfileId/);
        expect(deleteBody).toMatch(/callerProfileId === id/);
    });

    it('treats an unresolvable caller as a refusal, not as permission', () => {
        expect(src).toMatch(/if\s*\(!callerProfileId\)/);
    });
});

// ─── 3. cron sends ───────────────────────────────────────────────────────────

describe('posting-management mail goes to the verified account address', () => {
    // EmployerJob.contactEmail is free text on the post form and nothing
    // verifies it. Both of these embed dashboardToken, a bearer credential
    // that edits, pauses, renews or takes down the listing without a login.
    for (const rel of [
        'app/api/cron/expiry-warnings/route.ts',
        'app/api/cron/employer-report/route.ts',
    ]) {
        it(`${rel} resolves the recipient instead of using contactEmail`, () => {
            const src = read(rel);
            expect(src).toMatch(/resolveManagementRecipient\(/);
            expect(src).toMatch(/dashboardToken/);
        });
    }

    it('the resolver prefers the account email and keeps contactEmail only as a fallback', () => {
        const src = read('app/api/cron/_lib/employer-recipient.ts');
        expect(src).toMatch(/row\.user\?\.email\s*\|\|\s*row\.contactEmail/);
    });
});

describe('a dedupe marker is never stamped on a send that was refused', () => {
    it('the five-day expiry warning reads the result before stamping', () => {
        const src = read('app/api/cron/expiry-warnings/route.ts');
        // A refused send comes back as success:false, it does not throw, so a
        // try/catch alone let one Resend rejection exclude the posting from
        // the warning pass forever.
        expect(src).toMatch(/!warningResult\.success/);
        expect(src.indexOf('!warningResult.success')).toBeLessThan(
            src.indexOf('expiryWarningSentAt: new Date()'),
        );
    });

    it('the saved-job reminder reads the result before stamping', () => {
        const src = read('app/api/cron/saved-job-reminder/route.ts');
        expect(src).toMatch(/!sendResult\.success/);
        expect(src.indexOf('!sendResult.success')).toBeLessThan(
            src.indexOf('lastSavedJobReminderAt: new Date()'),
        );
    });
});

describe('the privacy purge actually clears what it says it anonymises', () => {
    it('email_sends metadata is written as a real SQL NULL', () => {
        const src = read('app/api/cron/purge-soft-deleted/route.ts');
        // `metadata: undefined` means "leave this column alone" in Prisma, so
        // the erased user's supabaseId and job ids survived on rows that
        // afterwards looked anonymised. Anchored on the updateMany payload,
        // not the whole file: the comment above it quotes the old shape.
        const payload = src.match(/emailSend\.updateMany\(\{[\s\S]*?\}\);/);
        expect(payload).not.toBeNull();
        expect(payload![0]).toMatch(/metadata:\s*Prisma\.DbNull/);
        expect(payload![0]).not.toMatch(/metadata:\s*undefined/);
    });
});

describe('the DSAR watchdog cannot go quiet when it has the most to say', () => {
    const src = read('app/api/cron/dsar-overdue/route.ts');

    it('chunks the alert under Discord\'s content cap', () => {
        expect(src).toMatch(/chunkLines\(/);
        const limit = src.match(/DISCORD_CONTENT_LIMIT\s*=\s*(\d+)/);
        expect(limit).not.toBeNull();
        expect(Number(limit![1])).toBeLessThanOrEqual(2000);
    });

    it('reports a webhook rejection instead of discarding the boolean', () => {
        expect(src).toMatch(/if\s*\(await sendDiscordMessage\(/);
        expect(src).toMatch(/chunksSent < chunksTotal/);
        expect(src).toMatch(/alertDelivered/);
    });
});

describe('cron observability and headroom', () => {
    it('enrich-jobs logs the rejection reason and the job it came from', () => {
        const src = read('app/api/cron/enrich-jobs/route.ts');
        expect(src).toMatch(/r\.status === 'rejected' \? r\.reason/);
        expect(src).toMatch(/jobId: failedJob\?\.id/);
    });

    it('send-alerts gets the same headroom as the other bulk senders', () => {
        // The highest-volume sender on the platform ran a per-alert query
        // phase inside a 60s cap; a hard timeout skips revertLastSentAtClaim,
        // so a claimed alert silently loses a whole cycle.
        const capOf = (rel: string) => Number(read(rel).match(/maxDuration\s*=\s*(\d+)/)![1]);
        expect(capOf('app/api/cron/send-alerts/route.ts')).toBe(
            capOf('app/api/cron/lifecycle-emails/route.ts'),
        );
    });

    it('the system-messages skip reason names the gate that actually stops it', () => {
        const src = read('app/api/cron/system-messages/route.ts');
        expect(src).toMatch(/OUTBOUND_PAUSED_MESSAGE/);
        // An operator who read the old reason set a flag nothing reads, saw no
        // change, and concluded the nudges were off while they were sending.
        expect(src).not.toMatch(/ENABLE_SYSTEM_MESSAGES/);
    });

    it('the candidate-alert digest builds links from the configured origin', () => {
        const src = read('app/api/cron/candidate-alerts/route.ts');
        expect(src).toMatch(/NEXT_PUBLIC_BASE_URL/);
        expect(src).not.toMatch(/`https:\/\/pmhnphiring\.com\/employer/);
    });

    it('enrich-thin-jds says out loud that nothing schedules it', () => {
        // The route describes "MAX_JOBS_PER_RUN per cron tick" for a tick that
        // never happens. Scheduling it spends money per run, so the docblock
        // names the gap rather than a deploy quietly closing it.
        const src = read('app/api/cron/enrich-thin-jds/route.ts');
        expect(src).toMatch(/NOT SCHEDULED/);
        const vercelJson = JSON.parse(read('vercel.json')) as { crons?: Array<{ path: string }> };
        const scheduled = (vercelJson.crons ?? []).some((c) =>
            c.path.startsWith('/api/cron/enrich-thin-jds'),
        );
        // If an operator DOES schedule it, this assertion flips and the stale
        // "NOT SCHEDULED" note has to come out with it.
        expect(scheduled).toBe(false);
    });
});
