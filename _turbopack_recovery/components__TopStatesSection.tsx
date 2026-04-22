import { prisma } from '@/lib/prisma';
import TopStatesList from '@/components/TopStatesList';

const FALLBACK_STATES = [
    { name: 'New York', count: 63, slug: 'new-york' },
    { name: 'Massachusetts', count: 46, slug: 'massachusetts' },
    { name: 'Florida', count: 45, slug: 'florida' },
    { name: 'Pennsylvania', count: 42, slug: 'pennsylvania' },
    { name: 'California', count: 40, slug: 'california' },
    { name: 'Texas', count: 32, slug: 'texas' },
    { name: 'North Carolina', count: 28, slug: 'north-carolina' },
    { name: 'Colorado', count: 26, slug: 'colorado' },
    { name: 'Illinois', count: 23, slug: 'illinois' },
    { name: 'Virginia', count: 22, slug: 'virginia' },
    { name: 'Georgia', count: 22, slug: 'georgia' },
    { name: 'Ohio', count: 20, slug: 'ohio' },
];

function toSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * TopStatesSection (Server Component)
 * Fetches top 12 states by job count.
 */
export default async function TopStatesSection() {
    let states: { name: string; count: number; slug: string }[] = [];

    try {
        const topStates = await prisma.job.groupBy({
            by: ['state'],
            where: {
                isPublished: true,
                state: { not: null },
            },
            _count: { state: true },
            orderBy: { _count: { state: 'desc' } },
            take: 12,
        });

        states = topStates
            .filter((s) => s.state && s.state.length > 0)
            .map((s) => ({
                name: s.state!,
                count: s._count.state,
                slug: toSlug(s.state!),
            }));
    } catch (error) {
        console.error('Error fetching state data:', error);
    }

    if (states.length < 8) {
        states = FALLBACK_STATES;
    }

    return <TopStatesList states={states} />;
}
