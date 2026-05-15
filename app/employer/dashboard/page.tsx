import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { requireEmployer } from '@/lib/auth/protect';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import EmployerDashboardClient from '@/components/employer/EmployerDashboardClient';
import UnfinishedPostBanner from '@/components/employer/UnfinishedPostBanner';

export const metadata: Metadata = {
    title: 'Employer Dashboard',
    description: 'Manage your PMHNP job postings, track applicants, and view analytics.',
    robots: { index: false, follow: false },
};

export default async function EmployerDashboardPage() {
    // Require employer or admin role — redirects to /unauthorized otherwise
    await requireEmployer();

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
