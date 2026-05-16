/**
 * Force-refresh JobCharge.invoicePdfUrl / hostedInvoiceUrl from Stripe
 * for a specific job. Used when the live route's auto-refresh didn't
 * fire (Turbopack cache, missed webhook, etc.) and the cached URL is
 * stuck on the open-state PDF after the invoice transitioned to paid.
 *
 *   npx tsx scripts/refresh-invoice-url.ts <jobId>
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
import Stripe from 'stripe';

async function main(): Promise<void> {
    const jobId = process.argv[2];
    if (!jobId) {
        console.error('Usage: npx tsx scripts/refresh-invoice-url.ts <jobId>');
        process.exit(1);
    }

    const employerJob = await prisma.employerJob.findFirst({ where: { jobId } });
    if (!employerJob) {
        console.error(`No EmployerJob for jobId=${jobId}`);
        process.exit(1);
    }
    const charge = await prisma.jobCharge.findFirst({
        where: { employerJobId: employerJob.id },
        orderBy: { createdAt: 'desc' },
    });
    if (!charge) {
        console.error('No JobCharge');
        process.exit(1);
    }
    if (!charge.stripeInvoiceId) {
        console.error('JobCharge has no stripeInvoiceId — cannot refresh');
        process.exit(1);
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
        console.error('STRIPE_SECRET_KEY missing');
        process.exit(1);
    }
    const stripe = new Stripe(stripeKey);

    const inv = await stripe.invoices.retrieve(charge.stripeInvoiceId);
    const newPdf = inv.invoice_pdf ?? null;
    const newHosted = inv.hosted_invoice_url ?? null;
    const newNumber = inv.number ?? null;

    console.log('Before:');
    console.log('  status (Stripe):  ', inv.status);
    console.log('  DB PDF URL:       ', charge.invoicePdfUrl);
    console.log('  Stripe PDF URL:   ', newPdf);

    if (newPdf === charge.invoicePdfUrl) {
        console.log('\nURLs already match — nothing to update.');
        return;
    }

    await prisma.jobCharge.update({
        where: { id: charge.id },
        data: {
            invoicePdfUrl: newPdf,
            hostedInvoiceUrl: newHosted ?? charge.hostedInvoiceUrl,
            invoiceNumber: newNumber ?? charge.invoiceNumber,
        },
    });
    console.log('\nUpdated JobCharge.invoicePdfUrl to the live Stripe URL.');
    console.log('Now click "Download Invoice" on the dashboard — you should get the Paid PDF.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
