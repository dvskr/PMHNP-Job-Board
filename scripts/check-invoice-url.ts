/**
 * Quick diagnostic: print the JobCharge.invoicePdfUrl currently stored
 * for a specific job, plus what Stripe returns live for the same invoice.
 * Lets us compare to see if our DB is holding a stale URL or if Stripe
 * is serving stale content at a refreshed URL.
 *
 *   npx tsx scripts/check-invoice-url.ts <jobId>
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
import Stripe from 'stripe';

async function main(): Promise<void> {
    const jobId = process.argv[2];
    if (!jobId) {
        console.error('Usage: npx tsx scripts/check-invoice-url.ts <jobId>');
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
        console.error(`No JobCharge for employerJobId=${employerJob.id}`);
        process.exit(1);
    }

    console.log('=== JobCharge in DB ===');
    console.log('id:                  ', charge.id);
    console.log('stripeInvoiceId:     ', charge.stripeInvoiceId);
    console.log('invoiceNumber:       ', charge.invoiceNumber);
    console.log('invoicePdfUrl:       ', charge.invoicePdfUrl);
    console.log('hostedInvoiceUrl:    ', charge.hostedInvoiceUrl);
    console.log('amountCents:         ', charge.amountCents);
    console.log('createdAt:           ', charge.createdAt.toISOString());

    if (!charge.stripeInvoiceId) {
        console.error('\nNo stripeInvoiceId — cannot compare to live Stripe state.');
        return;
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
        console.error('\nNo STRIPE_SECRET_KEY — cannot fetch live invoice.');
        return;
    }
    const stripe = new Stripe(stripeKey);
    const inv = await stripe.invoices.retrieve(charge.stripeInvoiceId);

    console.log('\n=== Live Stripe invoice ===');
    console.log('id:               ', inv.id);
    console.log('number:           ', inv.number);
    console.log('status:           ', inv.status);
    console.log('paid:             ', inv.paid);
    console.log('amount_paid:      ', inv.amount_paid);
    console.log('amount_remaining: ', inv.amount_remaining);
    console.log('invoice_pdf:      ', inv.invoice_pdf);
    console.log('hosted_invoice_url:', inv.hosted_invoice_url);

    const urlMatches = charge.invoicePdfUrl === inv.invoice_pdf;
    console.log('\n=== Diagnosis ===');
    console.log('DB URL === live URL?', urlMatches);
    console.log('Invoice paid?       ', inv.status === 'paid');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
