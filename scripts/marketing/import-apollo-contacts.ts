/**
 * Import Apollo-verified contacts into employer_leads + quarantine mined rows.
 *
 * Two actions in one idempotent pass:
 *   1. Upsert every row of tmp/marketing/tier-a-revealed.csv with
 *      email_status=verified as an EmployerLead (status 'prospect',
 *      source 'apollo_verified'). Match key: contactEmail (exact), else
 *      (companyName + contactName).
 *   2. Quarantine legacy scraped rows: any lead with source in
 *      ('mined_from_description','employer_site') still in status 'prospect'
 *      moves to status 'unverified_scraped' — operator decision 2026-07-17:
 *      scraped-from-job-post emails must NEVER be sequenced directly; they
 *      are match hints only. Leads already contacted/replied/converted are
 *      left untouched.
 *
 * Usage:
 *   npx tsx scripts/marketing/import-apollo-contacts.ts            # dry run
 *   npx tsx scripts/marketing/import-apollo-contacts.ts --execute  # write
 */
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

const EXECUTE = process.argv.includes('--execute');
const CSV_PATH = path.join(process.cwd(), 'tmp', 'marketing', 'tier-a-revealed.csv');
const QUARANTINE_SOURCES = ['mined_from_description', 'employer_site'];

function parseCsv(text: string): Array<Record<string, string>> {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const header = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const cells = splitCsvLine(line);
        const row: Record<string, string> = {};
        header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
        return row;
    });
}

function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') inQuotes = false;
            else cur += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    if (!fs.existsSync(CSV_PATH)) {
        console.error(`Missing ${CSV_PATH} — run the Apollo enrichment session first.`);
        process.exit(1);
    }
    const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf-8'))
        .filter(r => r.email_status === 'verified' && r.email);

    console.log(`${EXECUTE ? 'EXECUTE' : 'DRY RUN'} — ${rows.length} verified Apollo contacts to upsert`);

    let created = 0, updated = 0;
    for (const r of rows) {
        const existing = await prisma.employerLead.findFirst({
            where: {
                OR: [
                    { contactEmail: r.email },
                    { companyName: r.company, contactName: r.name },
                ],
            },
        });
        const data = {
            companyName: r.company,
            contactName: r.name || null,
            contactEmail: r.email,
            contactTitle: r.title || null,
            website: r.domain ? `https://${r.domain}` : null,
            linkedInUrl: r.linkedin || null,
            source: 'apollo_verified',
            status: 'prospect',
        };
        if (existing) {
            updated++;
            console.log(`  update: ${r.name} <${r.email}> (${r.company})`);
            if (EXECUTE) {
                await prisma.employerLead.update({
                    where: { id: existing.id },
                    // Never regress a lead that's already in motion.
                    data: ['contacted', 'replied', 'converted'].includes(existing.status)
                        ? { ...data, status: existing.status }
                        : data,
                });
            }
        } else {
            created++;
            console.log(`  create: ${r.name} <${r.email}> (${r.company})`);
            if (EXECUTE) {
                await prisma.employerLead.create({ data });
            }
        }
    }

    const quarantineTargets = await prisma.employerLead.count({
        where: { source: { in: QUARANTINE_SOURCES }, status: 'prospect' },
    });
    console.log(`\nQuarantine: ${quarantineTargets} scraped-source leads in 'prospect' → 'unverified_scraped'`);
    if (EXECUTE && quarantineTargets > 0) {
        await prisma.employerLead.updateMany({
            where: { source: { in: QUARANTINE_SOURCES }, status: 'prospect' },
            data: { status: 'unverified_scraped' },
        });
    }

    console.log(`\nSummary: ${created} created, ${updated} updated, ${quarantineTargets} quarantined ${EXECUTE ? '(written)' : '(dry run — pass --execute to write)'}`);
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
