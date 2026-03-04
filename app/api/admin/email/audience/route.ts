import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET /api/admin/email/audience?segment=all|job_seekers|employers|subscribers|newsletter
 * Returns the count and a sample of users matching the given segment.
 */
export async function GET(req: Request) {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const segment = searchParams.get('segment') || 'all';

    try {
        let count = 0;
        let sample: Array<{ email: string; firstName?: string | null }> = [];

        switch (segment) {
            case 'job_seekers': {
                const users = await prisma.userProfile.findMany({
                    where: { role: 'job_seeker' },
                    select: { email: true, firstName: true },
                    orderBy: { createdAt: 'desc' },
                });
                count = users.length;
                sample = users.slice(0, 5);
                break;
            }
            case 'employers': {
                const users = await prisma.userProfile.findMany({
                    where: { role: 'employer' },
                    select: { email: true, firstName: true },
                    orderBy: { createdAt: 'desc' },
                });
                count = users.length;
                sample = users.slice(0, 5);
                break;
            }
            case 'subscribers': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true },
                    select: { email: true },
                    orderBy: { createdAt: 'desc' },
                });
                count = leads.length;
                sample = leads.slice(0, 5).map(l => ({ email: l.email }));
                break;
            }
            case 'newsletter': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true, newsletterOptIn: true },
                    select: { email: true },
                    orderBy: { createdAt: 'desc' },
                });
                count = leads.length;
                sample = leads.slice(0, 5).map(l => ({ email: l.email }));
                break;
            }
            case 'all':
            default: {
                // Union of all user profiles + email leads (deduplicated)
                const [users, leads] = await Promise.all([
                    prisma.userProfile.findMany({ select: { email: true, firstName: true } }),
                    prisma.emailLead.findMany({ where: { isSubscribed: true }, select: { email: true } }),
                ]);
                const seen = new Set<string>();
                const all: Array<{ email: string; firstName?: string | null }> = [];
                for (const u of users) {
                    const key = u.email.toLowerCase();
                    if (!seen.has(key)) { seen.add(key); all.push(u); }
                }
                for (const l of leads) {
                    const key = l.email.toLowerCase();
                    if (!seen.has(key)) { seen.add(key); all.push({ email: l.email }); }
                }
                count = all.length;
                sample = all.slice(0, 5);
                break;
            }
        }

        return NextResponse.json({ success: true, segment, count, sample });
    } catch (error) {
        console.error('[Admin Email Audience] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to get audience' }, { status: 500 });
    }
}
