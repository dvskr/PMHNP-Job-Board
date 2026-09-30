import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { requireEmployer } from '@/lib/auth/protect';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import EmployerDashboardClient from '@/components/employer/EmployerDashboardClient';
import UnfinishedPostBanner from '@/components/employer/UnfinishedPostBanner';
import { CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Employer Dashboard',
    description: 'Manage your PMHNP job postings, track applicants, and view analytics.',
    robots: { index: false, follow: false },
};

export default async function EmployerDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ credits?: string; posted?: string }>;
}) {
    // Require employer or admin role — redirects to /unauthorized otherwise
    await requireEmployer();

    const params = await searchParams;

    // Where /api/create-pack-checkout sends a buyer after Stripe. Without
    // this the largest purchase on the site lands on an unchanged-looking
    // dashboard, and the only confirmation is a number in the usage strip.
    const justBoughtCredits = params.credits === 'purchased';

    // Where a credit-funded post lands. That path never reaches /success,
    // which is the page that normally confirms a publish, and this param was
    // being sent and read by nothing: the employer spent a credit, got a
    // dashboard that looked unchanged, and had no confirmation their listing
    // was live.
    const justPostedWithCredit = typeof params.posted === 'string' && params.posted.length > 0;

    const supabase = await createClient();

    // 1. Check Authentication
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !user.email) {
        redirect('/login?next=/employer/dashboard');
    }

    // 2. Query Jobs (by userId OR contactEmail as fallback)
    const employerJobs = await prisma.employerJob.findMany({
        where: {
            OR: [
                { userId: user.id },
                { contactEmail: user.email }
            ]
        },
        include: {
            job: {
                include: {
                    _count: {
                        select: { jobApplications: true }
                    }
                }
            }
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    // 3. Map to UI format
    const jobs = employerJobs.map(record => ({
        id: record.job.id,
        title: record.job.title,
        isPublished: record.job.isPublished,
        isFeatured: record.job.isFeatured,
        viewCount: record.job.viewCount,
        applyClickCount: record.job.applyClickCount,
        applicantCount: record.job._count.jobApplications,
        createdAt: record.job.createdAt.toISOString(),
        expiresAt: record.job.expiresAt ? record.job.expiresAt.toISOString() : null,
        archivedAt: record.job.archivedAt ? record.job.archivedAt.toISOString() : null,
        // Paused by the employer, as opposed to expired. Both leave
        // isPublished false, and only this one must hide the Renew button:
        // the renewal webhook withholds republication from a paused posting,
        // so renewing it buys days nobody can see.
        isManuallyUnpublished: record.job.isManuallyUnpublished,
        editToken: record.editToken,
        paymentStatus: record.paymentStatus,
        pricingTier: record.pricingTier || 'pro',
        slug: record.job.slug,
    }));

    // 4. Get Profiler info for header
    let employerName = user.user_metadata?.company || user.user_metadata?.full_name || user.email;

    // Try to get company name from first job if metadata is empty
    if ((!employerName || employerName === user.email) && employerJobs.length > 0) {
        employerName = employerJobs[0].employerName;
    }

    return (
        <>
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Employer Dashboard', url: 'https://pmhnphiring.com/employer/dashboard' },
            ]} />
            {/* Unfinished-post banner — fetches the auth-anchored draft
                client-side and renders a Resume + Discard pair when one
                exists. Quiet when no draft (no flash on most visits). */}
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px 0' }}>
                {justBoughtCredits && (
                    <div
                        role="status"
                        style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '14px 18px', marginBottom: '14px',
                            background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.25)',
                            borderRadius: '14px',
                        }}
                    >
                        <CheckCircle2 size={17} style={{ color: '#0D9488', flexShrink: 0, marginTop: '1px' }} />
                        <div>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#134E4A' }}>
                                Your posting credits are ready
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#4A5A55', lineHeight: 1.5 }}>
                                Your balance is in the strip below. The next job you post uses a credit
                                automatically, with nothing more to pay. Stripe has emailed your invoice.
                            </p>
                        </div>
                    </div>
                )}
                {justPostedWithCredit && (
                    <div
                        role="status"
                        style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '14px 18px', marginBottom: '14px',
                            background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.25)',
                            borderRadius: '14px',
                        }}
                    >
                        <CheckCircle2 size={17} style={{ color: '#0D9488', flexShrink: 0, marginTop: '1px' }} />
                        <div>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#134E4A' }}>
                                Your job is live
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#4A5A55', lineHeight: 1.5 }}>
                                It used one prepaid credit, so there is nothing to pay. Your remaining
                                balance is in the strip below.
                            </p>
                        </div>
                    </div>
                )}
                <UnfinishedPostBanner />
            </div>
            <EmployerDashboardClient
                employerEmail={user.email}
                employerName={employerName}
                jobs={jobs}
            />
        </>
    );
}
