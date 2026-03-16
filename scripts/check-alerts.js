require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

(async () => {
    try {
        const total = await p.jobAlert.count();
        const active = await p.jobAlert.count({ where: { isActive: true } });
        const inactive = await p.jobAlert.count({ where: { isActive: false } });
        const daily = await p.jobAlert.count({ where: { isActive: true, frequency: 'daily' } });
        const weekly = await p.jobAlert.count({ where: { isActive: true, frequency: 'weekly' } });
        const neverSent = await p.jobAlert.count({ where: { isActive: true, lastSentAt: null } });
        const sentLastDay = await p.jobAlert.count({
            where: { isActive: true, lastSentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });

        console.log('=== JOB ALERT STATS ===');
        console.log(`Total alerts: ${total}`);
        console.log(`Active: ${active}`);
        console.log(`Inactive: ${inactive}`);
        console.log(`Daily: ${daily}`);
        console.log(`Weekly: ${weekly}`);
        console.log(`Never sent: ${neverSent}`);
        console.log(`Sent in last 24h: ${sentLastDay}`);

        // Unique active emails
        const uniqueEmails = await p.jobAlert.findMany({
            where: { isActive: true },
            select: { email: true },
            distinct: ['email'],
        });
        console.log(`\nUnique active emails: ${uniqueEmails.length}`);

        // Show all active alerts with details
        const allActive = await p.jobAlert.findMany({
            where: { isActive: true },
            select: {
                id: true,
                email: true,
                frequency: true,
                keyword: true,
                location: true,
                mode: true,
                jobType: true,
                lastSentAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        console.log(`\n=== ALL ACTIVE ALERTS (${allActive.length}) ===`);
        for (const a of allActive) {
            const sent = a.lastSentAt ? a.lastSentAt.toISOString().slice(0, 16) : 'NEVER';
            const created = a.createdAt.toISOString().slice(0, 16);
            const filters = [
                a.keyword ? `kw:"${a.keyword}"` : null,
                a.location ? `loc:"${a.location}"` : null,
                a.mode ? `mode:"${a.mode}"` : null,
                a.jobType ? `type:"${a.jobType}"` : null,
            ]
                .filter(Boolean)
                .join(', ') || '(no filters)';
            console.log(
                `  ${a.email.padEnd(35)} ${a.frequency.padEnd(7)} sent:${sent.padEnd(17)} created:${created} ${filters}`
            );
        }

        // Also check Account-based users
        try {
            const accountUsers = await p.account.findMany({
                where: { role: 'job_seeker' },
                select: { email: true, name: true, createdAt: true },
            });
            console.log(`\n=== JOB SEEKER ACCOUNTS (${accountUsers.length}) ===`);
            for (const u of accountUsers) {
                const hasAlert = allActive.some((a) => a.email.toLowerCase() === u.email.toLowerCase());
                console.log(
                    `  ${u.email.padEnd(35)} ${hasAlert ? '✓ has alert' : '✗ NO alert'} created:${u.createdAt.toISOString().slice(0, 16)}`
                );
            }
        } catch (e) {
            console.log('Could not query accounts:', e.message);
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await p.$disconnect();
        await pool.end();
    }
})();
