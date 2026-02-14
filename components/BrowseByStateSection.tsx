import { prisma } from '@/lib/prisma';
import BrowseByState from '@/components/BrowseByState';

export default async function BrowseByStateSection() {
    let states: { state: string; count: number }[] = [];

    try {
        const groups = await prisma.job.groupBy({
            by: ['state'],
            where: {
                isPublished: true,
                state: { not: null },
            },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 12,
        });

        states = groups
            .filter((g): g is typeof g & { state: string } => g.state !== null)
            .map((g) => ({
                state: g.state,
                count: g._count.id,
            }));
    } catch (error) {
        console.error('Error fetching state data:', error);
    }

    return <BrowseByState states={states} />;
}
