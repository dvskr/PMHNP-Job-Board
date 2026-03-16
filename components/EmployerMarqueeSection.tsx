import { prisma } from '@/lib/prisma';
import EmployerMarquee from '@/components/EmployerMarquee';

const FALLBACK_COMPANIES = [
    'Talkiatry',
    'Cerebral',
    'LifeStance Health',
    'Mindpath Health',
    'Geode Health',
    'Headlight',
    'Grow Therapy',
    'Rula Health',
    'Spring Health',
    'Alma',
];

/**
 * EmployerMarqueeSection (Server Component)
 *
 * Fetches the top 25 most frequent employers from the database
 * and passes them to the animated EmployerMarquee client component.
 */
export default async function EmployerMarqueeSection() {
    let companies: string[] = [];

    try {
        const topEmployers = await prisma.job.groupBy({
            by: ['employer'],
            where: { isPublished: true },
            _count: { employer: true },
            orderBy: { _count: { employer: 'desc' } },
            take: 25,
        });

        companies = topEmployers
            .map((e) => e.employer)
            .filter((name) => name && name.length > 0 && name.length <= 40);
    } catch (error) {
        console.error('Error fetching employer data:', error);
    }

    // Supplement with fallbacks if we have fewer than 10
    if (companies.length < 10) {
        const existing = new Set(companies.map((c) => c.toLowerCase()));
        for (const fallback of FALLBACK_COMPANIES) {
            if (!existing.has(fallback.toLowerCase())) {
                companies.push(fallback);
            }
            if (companies.length >= 20) break;
        }
    }

    return <EmployerMarquee companies={companies} />;
}
