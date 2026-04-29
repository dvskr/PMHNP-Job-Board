import { prisma } from '@/lib/prisma';
import ClayDoughStrip from '@/components/ClayDoughStrip';

const FALLBACK_EMPLOYERS = [
    { name: 'Talkiatry', count: 47 },
    { name: 'LifeStance Health', count: 32 },
    { name: 'Cerebral', count: 18 },
    { name: 'Headway', count: 24 },
    { name: 'Grow Therapy', count: 39 },
    { name: 'Spring Health', count: 15 },
    { name: 'Modern Health', count: 22 },
    { name: 'Lyra Health', count: 28 },
    { name: 'BetterHelp', count: 41 },
    { name: 'Alma', count: 13 },
    { name: 'Geode Health', count: 17 },
    { name: 'Mindpath Health', count: 19 },
    { name: 'Rula Health', count: 12 },
    { name: 'Brightside', count: 14 },
    { name: 'Noom', count: 35 },
    { name: 'Eleanor Health', count: 11 },
    { name: 'Quartet Health', count: 9 },
    { name: 'SilverCloud', count: 16 },
];

/**
 * EmployerTrustSection (Server Component)
 *
 * Fetches top employers with job counts from the database
 * and renders the clay dough strip.
 */
export default async function EmployerTrustSection() {
    let employers: { name: string; count: number }[] = [];

    try {
        const topEmployers = await prisma.job.groupBy({
            by: ['employer'],
            where: { isPublished: true },
            _count: { employer: true },
            orderBy: { _count: { employer: 'desc' } },
            take: 25,
        });

        employers = topEmployers
            .filter((e) => e.employer && e.employer.length > 0 && e.employer.length <= 40)
            .map((e) => ({
                name: e.employer,
                count: e._count.employer,
            }));
    } catch (error) {
        console.error('Error fetching employer data:', error);
    }

    // Use fallbacks if insufficient data
    if (employers.length < 10) {
        const existing = new Set(employers.map((e) => e.name.toLowerCase()));
        for (const fallback of FALLBACK_EMPLOYERS) {
            if (!existing.has(fallback.name.toLowerCase())) {
                employers.push(fallback);
            }
            if (employers.length >= 18) break;
        }
    }

    return <ClayDoughStrip employers={employers} />;
}
