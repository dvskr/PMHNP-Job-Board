import { prisma } from '@/lib/prisma';
import { publicJobsWhere } from '@/lib/filters';
import TopStatesList from '@/components/TopStatesList';

function toSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * TopStatesSection (Server Component)
 * Fetches top 12 states by job count, scoped to the same publicJobsWhere()
 * predicate the /jobs results use so each badge matches its click-through.
 * Thin or failed reads render nothing — never fabricated per-state counts
 * (same policy as lib/site-stats.ts).
 */
export default async function TopStatesSection() {
    let states: { name: string; count: number; slug: string }[] = [];

    try {
        const topStates = await prisma.job.groupBy({
            by: ['state'],
            where: {
                ...publicJobsWhere(),
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
        return null;
    }

    return <TopStatesList states={states} />;
}
