import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getEmployerTier } from '@/lib/tier-limits';
import { config } from '@/lib/config';

/**
 * GET /api/employer/analytics/benchmarks
 * Returns platform-wide benchmark data so employers can compare their job performance.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    try {
        // Gate: Advanced analytics requires Growth or Premium tier
        const tier = await getEmployerTier(user.id);
        if (tier === 'starter') {
            return NextResponse.json({
                error: 'Advanced analytics requires a Growth or Premium posting',
                tier,
                upgradeRequired: true,
            }, { status: 403 });
        }

        // Get platform-wide averages from published employer jobs
        const allEmployerJobs = await prisma.employerJob.findMany({
            where: {
                job: { isPublished: true },
            },
            include: {
                job: {
                    select: {
                        viewCount: true,
                        applyClickCount: true,
                        isFeatured: true,
                        createdAt: true,
                        normalizedMinSalary: true,
                        normalizedMaxSalary: true,
                        displaySalary: true,
                    },
                },
            },
        });

        const totalJobs = allEmployerJobs.length;
        if (totalJobs === 0) {
            return NextResponse.json({
                benchmarks: {
                    avgViews: 0, avgClicks: 0, avgCtr: 0,
                    medianViews: 0, medianClicks: 0,
                    featuredAvgViews: 0, featuredAvgClicks: 0,
                    standardAvgViews: 0, standardAvgClicks: 0,
                    totalJobsInPool: 0,
                    platformMedianSalary: 0,
                    platformAvgSalary: 0,
                    jobsWithSalary: 0,
                },
                employerJobs: [],
            });
        }

        const views = allEmployerJobs.map(j => j.job.viewCount || 0).sort((a, b) => a - b);
        const clicks = allEmployerJobs.map(j => j.job.applyClickCount || 0).sort((a, b) => a - b);

        const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
        const median = (arr: number[]) => {
            const mid = Math.floor(arr.length / 2);
            return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
        };

        const totalViews = sum(views);
        const totalClicks = sum(clicks);

        // Featured vs Standard breakdowns
        const featured = allEmployerJobs.filter(j => j.job.isFeatured);
        const standard = allEmployerJobs.filter(j => !j.job.isFeatured);

        // Salary benchmarks
        const salaryJobs = allEmployerJobs.filter(j => j.job.normalizedMinSalary && j.job.normalizedMinSalary > 0);
        const salaryValues = salaryJobs.map(j => {
            const min = j.job.normalizedMinSalary || 0;
            const max = j.job.normalizedMaxSalary || min;
            return Math.round((min + max) / 2);
        }).sort((a, b) => a - b);
        const platformMedianSalary = salaryValues.length > 0 ? median(salaryValues) : 0;
        const platformAvgSalary = salaryValues.length > 0 ? Math.round(sum(salaryValues) / salaryValues.length) : 0;

        // Get THIS employer's jobs with full details for salary + suggestions
        const myJobs = await prisma.employerJob.findMany({
            where: {
                OR: [
                    { userId: user.id },
                    { contactEmail: user.email! },
                ],
            },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        viewCount: true,
                        applyClickCount: true,
                        isFeatured: true,
                        normalizedMinSalary: true,
                        normalizedMaxSalary: true,
                        displaySalary: true,
                        salaryRange: true,
                        description: true,
                        mode: true,
                        isRemote: true,
                    },
                },
            },
        });

        const avgViewsBenchmark = Math.round(totalViews / totalJobs);
        const avgClicksBenchmark = Math.round(totalClicks / totalJobs);
        const avgCtrBenchmark = totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(1)) : 0;

        // Build per-job salary + suggestions
        const employerJobs = myJobs.map(ej => {
            const j = ej.job;
            const jobViews = j.viewCount || 0;
            const jobClicks = j.applyClickCount || 0;
            const jobCtr = jobViews > 0 ? Math.round((jobClicks / jobViews) * 1000) / 10 : 0;

            // Salary competitiveness
            const jobMidSalary = j.normalizedMinSalary && j.normalizedMinSalary > 0
                ? Math.round(((j.normalizedMinSalary || 0) + (j.normalizedMaxSalary || j.normalizedMinSalary || 0)) / 2)
                : null;
            let salaryRating: 'above' | 'at' | 'below' | 'unknown' = 'unknown';
            if (jobMidSalary && platformMedianSalary > 0) {
                const pct = ((jobMidSalary - platformMedianSalary) / platformMedianSalary) * 100;
                salaryRating = pct > 10 ? 'above' : pct < -10 ? 'below' : 'at';
            }

            // Improvement suggestions
            const suggestions: string[] = [];
            const hasSalary = !!(j.salaryRange || j.displaySalary || (j.normalizedMinSalary && j.normalizedMinSalary > 0));
            if (!hasSalary) {
                suggestions.push('Add a salary range — listings with pay info get up to 30% more clicks.');
            }
            if (salaryRating === 'below') {
                suggestions.push('Your salary is below market median. Consider increasing to attract more candidates.');
            }
            if (jobViews > 0 && jobCtr < avgCtrBenchmark * 0.7) {
                suggestions.push('Low click-through rate — try a more specific title or add benefits details.');
            }
            if (jobViews < avgViewsBenchmark * 0.5) {
                suggestions.push('Low visibility — upgrade to Featured for 3-5× more views.');
            }
            if ((j.description || '').length < 500) {
                suggestions.push('Short job description — detailed listings (500+ words) engage more candidates.');
            }
            if (!j.isRemote && !j.mode) {
                suggestions.push('Specify the work mode (remote, hybrid, on-site) to reach the right candidates.');
            }

            return {
                id: j.id,
                title: j.title,
                views: jobViews,
                clicks: jobClicks,
                ctr: jobCtr,
                isFeatured: j.isFeatured,
                displaySalary: j.displaySalary || j.salaryRange || null,
                midSalary: jobMidSalary,
                salaryRating,
                suggestions,
            };
        });

        return NextResponse.json({
            benchmarks: {
                avgViews: avgViewsBenchmark,
                avgClicks: avgClicksBenchmark,
                avgCtr: avgCtrBenchmark,
                medianViews: Math.round(median(views)),
                medianClicks: Math.round(median(clicks)),
                featuredAvgViews: featured.length > 0 ? Math.round(sum(featured.map(j => j.job.viewCount || 0)) / featured.length) : 0,
                featuredAvgClicks: featured.length > 0 ? Math.round(sum(featured.map(j => j.job.applyClickCount || 0)) / featured.length) : 0,
                standardAvgViews: standard.length > 0 ? Math.round(sum(standard.map(j => j.job.viewCount || 0)) / standard.length) : 0,
                standardAvgClicks: standard.length > 0 ? Math.round(sum(standard.map(j => j.job.applyClickCount || 0)) / standard.length) : 0,
                totalJobsInPool: totalJobs,
                platformMedianSalary: Math.round(platformMedianSalary),
                platformAvgSalary,
                jobsWithSalary: salaryJobs.length,
            },
            employerJobs,
        });
    } catch (error) {
        console.error('Error computing benchmarks:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
