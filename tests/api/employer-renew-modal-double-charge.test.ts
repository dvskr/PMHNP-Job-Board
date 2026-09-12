/**
 * The renew modal must not open itself for a posting that was just paid for.
 *
 * The chain that made a second charge one click away: the renewal success page
 * linked "Go to Dashboard" at /employer/dashboard/<token>; that route exists
 * only to carry renew intent through login, so it forwarded to
 * /employer/dashboard?renew=<jobId>; the dashboard opened the renew modal for
 * any owned job id without checking whether the listing needed renewing at
 * all. A listing renewed seconds earlier greeted its owner with a pre-opened
 * checkout for itself.
 *
 * Source assertions, because the bug is in the wiring between four files and
 * every one of them looked reasonable on its own.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('the renewal success page', () => {
    const src = read('app/employer/renewal-success/page.tsx');

    it('does not send the buyer back through the renew-intent route', () => {
        expect(src).not.toMatch(/\/employer\/dashboard\/\$\{/);
    });

    it('still offers the dashboard and the live listing', () => {
        expect(src).toMatch(/href="\/employer\/dashboard"/);
        expect(src).toMatch(/\/jobs\/\$\{renewalData\.jobSlug\}/);
    });
});

describe('the dashboard renew intent', () => {
    const src = read('components/employer/EmployerDashboardClient.tsx');
    const effect = src.slice(
        src.indexOf("const renewJobId = searchParams.get('renew')"),
        src.indexOf('}, [renewJobId, localJobs]);'),
    );

    it('reads the deep link', () => {
        expect(effect.length).toBeGreaterThan(0);
    });

    it('opens the modal only for a listing that actually needs renewing', () => {
        expect(effect).toMatch(/shouldShowRenew\(target\)/);
        // The open must be gated, not merely mentioned.
        expect(effect).toMatch(/if\s*\(!shouldShowRenew\(target\)\)\s*return;/);
    });
});

describe('the renew control', () => {
    const src = read('components/employer/EmployerDashboardClient.tsx');

    it('hides for a posting whose payment was reversed', () => {
        const predicate = src.slice(
            src.indexOf('const shouldShowRenew'),
            src.indexOf('const handleRenewClick'),
        );
        expect(predicate).toMatch(/isPaymentReversed\(job\)/);

        const reversed = src.slice(
            src.indexOf('const isPaymentReversed'),
            src.indexOf('const shouldShowRenew'),
        );
        expect(reversed).toMatch(/'refunded'/);
        expect(reversed).toMatch(/'disputed'/);
    });

    it('re-checks before spending money', () => {
        const handler = src.slice(src.indexOf('const handleRenewClick'));
        expect(handler.slice(0, 400)).toMatch(/if\s*\(!shouldShowRenew\(job\)\)\s*return;/);
    });
});

describe('the server behind the modal', () => {
    const src = read('app/api/create-renewal-checkout/route.ts');

    it('refuses a chargeback-revoked posting regardless of what the UI does', () => {
        expect(src).toMatch(/paymentStatus === 'disputed'/);
    });

    it('refuses a renewal moments after the last one', () => {
        expect(src).toMatch(/RECENT_RENEWAL_LOCKOUT_MINUTES/);
        expect(src).toMatch(/lastRenewedAt/);
    });

    it('never hardcodes the renewal price in the copy it returns', () => {
        expect(src).not.toMatch(/\$\d{2,}/);
    });
});
