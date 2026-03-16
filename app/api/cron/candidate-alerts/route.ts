import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendNewCandidateAlertEmail } from '@/lib/email-service';
import { logger } from '@/lib/logger';

export const maxDuration = 120; // 2 minutes — email sends to multiple employers

/**
 * GET /api/cron/candidate-alerts
 * Matches new candidates against employer alert preferences and sends digest emails.
 * Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
    // Auth: verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get all active alerts
        const alerts = await prisma.employerCandidateAlert.findMany({
            where: { isActive: true },
            include: {
                employer: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        company: true,
                    },
                },
            },
        });

        if (alerts.length === 0) {
            return NextResponse.json({ message: 'No active alerts', sent: 0 });
        }

        let totalSent = 0;

        for (const alert of alerts) {
            // Find new candidates since last notification (or last 24 hours)
            const since = alert.lastSentAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Build filter criteria
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const where: any = {
                role: 'job_seeker',
                profileVisible: true,
                createdAt: { gt: since },
            };

            // Specialty filter (comma-separated, match any)
            if (alert.specialties) {
                const specs = alert.specialties.split(',').map(s => s.trim());
                where.OR = specs.map(s => ({
                    specialties: { contains: s, mode: 'insensitive' },
                }));
            }

            // State filter
            if (alert.states) {
                const states = alert.states.split(',').map(s => s.trim());
                if (!where.OR) where.OR = [];
                // Add state matches to existing OR
                const stateFilters = states.map(s => ({
                    licenseStates: { contains: s, mode: 'insensitive' as const },
                }));
                if (where.OR.length > 0) {
                    // Both specialty and state: candidate must match at least one of either
                    where.AND = [
                        { OR: where.OR },
                        { OR: stateFilters },
                    ];
                    delete where.OR;
                } else {
                    where.OR = stateFilters;
                }
            }

            // Experience filter
            if (alert.minExperience !== null && alert.minExperience !== undefined) {
                where.yearsExperience = { gte: alert.minExperience };
            }

            // Work mode filter
            if (alert.workMode) {
                where.preferredWorkMode = { equals: alert.workMode, mode: 'insensitive' };
            }

            const matchingCandidates = await prisma.userProfile.findMany({
                where,
                select: {
                    supabaseId: true,
                    firstName: true,
                    lastName: true,
                    headline: true,
                    specialties: true,
                    licenseStates: true,
                    yearsExperience: true,
                },
                take: 10, // Max 10 per digest
            });

            if (matchingCandidates.length === 0) continue;

            const employerName = alert.employer.company || [alert.employer.firstName, alert.employer.lastName].filter(Boolean).join(' ') || 'Employer';

            const digest = matchingCandidates.map(c => ({
                name: [c.firstName, c.lastName?.[0] ? c.lastName[0] + '.' : null].filter(Boolean).join(' ') || 'PMHNP Candidate',
                headline: c.headline,
                profileUrl: `https://pmhnphiring.com/employer/candidates/${c.supabaseId}`,
                specialties: c.specialties ? c.specialties.split(',').map(s => s.trim()) : [],
                states: c.licenseStates ? c.licenseStates.split(',').map(s => s.trim()) : [],
                experience: c.yearsExperience,
            }));

            if (alert.employer.email) {
                const result = await sendNewCandidateAlertEmail(
                    alert.employer.email,
                    employerName,
                    digest
                );

                if (result.success) {
                    totalSent++;
                    // Update lastSentAt
                    await prisma.employerCandidateAlert.update({
                        where: { id: alert.id },
                        data: { lastSentAt: new Date() },
                    });
                }
            }
        }

        logger.info('Candidate alert cron complete', { alertsProcessed: alerts.length, emailsSent: totalSent });
        return NextResponse.json({ message: 'Candidate alerts processed', sent: totalSent, total: alerts.length });
    } catch (error) {
        logger.error('Candidate alert cron failed', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
