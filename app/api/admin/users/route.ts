import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // User profiles
        const users = await prisma.userProfile.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                firstName: true,
                lastName: true,
                company: true,
                headline: true,
                openToOffers: true,
                profileVisible: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Email leads with alert counts
        const emailLeads = await prisma.emailLead.findMany({
            select: {
                id: true,
                email: true,
                source: true,
                isSubscribed: true,
                newsletterOptIn: true,
                createdAt: true,
                jobAlerts: {
                    select: {
                        id: true,
                        frequency: true,
                        isActive: true,
                        keyword: true,
                        location: true,
                        lastSentAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Cross-reference: which email leads have a user account?
        const profileEmails = new Set(users.map(u => u.email.toLowerCase()));
        const emailLeadsWithAccount = emailLeads.map(lead => ({
            ...lead,
            hasAccount: profileEmails.has(lead.email.toLowerCase()),
        }));

        // Summary counts
        const totalUsers = users.length;
        const jobSeekers = users.filter(u => u.role === 'job_seeker').length;
        const employers = users.filter(u => u.role === 'employer').length;
        const admins = users.filter(u => u.role === 'admin').length;

        const totalSubscribers = emailLeads.length;
        const activeSubscribers = emailLeads.filter(e => e.isSubscribed).length;
        const newsletterOptIns = emailLeads.filter(e => e.newsletterOptIn).length;
        const withAccount = emailLeadsWithAccount.filter(e => e.hasAccount).length;
        const withoutAccount = emailLeadsWithAccount.filter(e => !e.hasAccount).length;
        const totalAlerts = emailLeads.reduce((sum, e) => sum + e.jobAlerts.length, 0);
        const activeAlerts = emailLeads.reduce(
            (sum, e) => sum + e.jobAlerts.filter(a => a.isActive).length,
            0
        );
        const dailyAlerts = emailLeads.reduce(
            (sum, e) => sum + e.jobAlerts.filter(a => a.frequency === 'daily').length,
            0
        );
        const weeklyAlerts = emailLeads.reduce(
            (sum, e) => sum + e.jobAlerts.filter(a => a.frequency === 'weekly').length,
            0
        );

        return NextResponse.json({
            success: true,
            users,
            emailLeads: emailLeadsWithAccount,
            summary: {
                totalUsers,
                jobSeekers,
                employers,
                admins,
                totalSubscribers,
                activeSubscribers,
                newsletterOptIns,
                withAccount,
                withoutAccount,
                totalAlerts,
                activeAlerts,
                dailyAlerts,
                weeklyAlerts,
            },
        });
    } catch (error) {
        console.error('[Admin Users] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch user data' },
            { status: 500 }
        );
    }
}
