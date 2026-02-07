import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import EmployerDashboardClient from '@/components/employer/EmployerDashboardClient';

export default async function EmployerDashboardPage() {
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
            job: true
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
        createdAt: record.job.createdAt.toISOString(),
        expiresAt: record.job.expiresAt ? record.job.expiresAt.toISOString() : null,
        editToken: record.editToken,
        paymentStatus: record.paymentStatus,
        slug: record.job.slug,
    }));

    // 4. Get Profiler info for header
    let employerName = user.user_metadata?.company || user.user_metadata?.full_name || user.email;

    // Try to get company name from first job if metadata is empty
    if ((!employerName || employerName === user.email) && employerJobs.length > 0) {
        employerName = employerJobs[0].employerName;
    }

    return (
        <EmployerDashboardClient
            employerEmail={user.email}
            employerName={employerName}
            jobs={jobs}
        />
    );
}
