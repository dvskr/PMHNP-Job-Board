import { prisma } from '@/lib/prisma';
import ClayDoughStrip from '@/components/ClayDoughStrip';
import { findCanonicalName, normalizeCompanyName } from '@/lib/company-normalizer';

/**
 * EmployerTrustSection (Server Component)
 *
 * Fetches top employers with job counts from the database
 * and renders the clay dough strip.
 */
export default async function EmployerTrustSection() {
    let employers: { name: string; count: number }[] = [];

    try {
        // Pull more rows than we render so we can collapse variants
        // ("Lifestance" + "LifeStance Health") into one chip without
        // shrinking the final visible set.
        const topEmployers = await prisma.job.groupBy({
            by: ['employer'],
            where: { isPublished: true },
            _count: { employer: true },
            orderBy: { _count: { employer: 'desc' } },
            take: 80,
        });

        // Collapse by canonical name. Falls back to normalizedName when
        // the company isn't in the KNOWN_COMPANIES table so unknown
        // variants ("Acme Health" vs "Acme Health LLC") still merge.
        const buckets = new Map<string, { name: string; count: number; rawCount: number }>();
        for (const e of topEmployers) {
            if (!e.employer || e.employer.length === 0 || e.employer.length > 40) continue;
            const canonical = findCanonicalName(e.employer);
            const key = canonical ?? normalizeCompanyName(e.employer);
            if (!key) continue;
            const display = canonical ?? e.employer;
            const existing = buckets.get(key);
            if (existing) {
                existing.count += e._count.employer;
                // Prefer the longer display string when no canonical is
                // known — "Acme Health" reads better than "Acme".
                if (!canonical && e.employer.length > existing.name.length) {
                    existing.name = e.employer;
                }
            } else {
                buckets.set(key, { name: display, count: e._count.employer, rawCount: e._count.employer });
            }
        }

        employers = Array.from(buckets.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 25)
            .map(({ name, count }) => ({ name, count }));
    } catch (error) {
        console.error('Error fetching employer data:', error);
    }

    // Too few real employers (thin data or DB error): render nothing rather
    // than padding the strip with fabricated names and counts.
    if (employers.length < 5) {
        return null;
    }

    return <ClayDoughStrip employers={employers} />;
}
