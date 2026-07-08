import { prisma } from '@/lib/prisma';
import ClayDoughStrip from '@/components/ClayDoughStrip';
import { findCanonicalName, normalizeCompanyName } from '@/lib/company-normalizer';
import { getExtendedSiteStats, ExtendedSiteStats } from '@/lib/site-stats';

/**
 * Fallback for thin employer data: a row of real site-wide counters styled
 * like the clay dough strip (same gradient + clay pills). Rendered only when
 * getExtendedSiteStats returns real numbers — never from fallback constants.
 */
function SiteStatsRow({ stats }: { stats: ExtendedSiteStats }) {
    const chips = [
        { value: stats.totalJobs.toLocaleString('en-US'), label: 'open roles', color: '#5eead4' },
        { value: stats.totalCompanies.toLocaleString('en-US'), label: 'employers', color: '#a5b4fc' },
        ...(stats.salaryTransparencyPct > 0
            ? [{ value: `${stats.salaryTransparencyPct}%`, label: 'show salary', color: '#fcd34d' }]
            : []),
        ...(stats.jobsAddedThisWeek > 0
            ? [{ value: stats.jobsAddedThisWeek.toLocaleString('en-US'), label: 'added this week', color: '#f0abfc' }]
            : []),
    ];

    return (
        <section
            className="w-full overflow-hidden py-16 lg:py-24"
            style={{ background: 'linear-gradient(160deg, #FDFBF7 0%, #F5D5C4 40%, #F0B8A0 100%)' }}
        >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '0 24px' }}>
                {chips.map((chip) => (
                    <div
                        key={chip.label}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'baseline',
                            gap: '8px',
                            padding: '14px 28px',
                            borderRadius: '20px',
                            background: `linear-gradient(145deg, ${chip.color}cc, ${chip.color}99)`,
                            boxShadow: 'inset 3px 3px 6px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08)',
                        }}
                    >
                        <span style={{ fontSize: '20px', fontWeight: 800, color: 'rgba(30,41,59,0.85)' }}>{chip.value}</span>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(51,65,85,0.7)' }}>{chip.label}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

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

    // Too few real employers (thin data or DB error): never pad the strip with
    // fabricated names and counts. Instead, fall back to real site-wide
    // counters when they are available — and to nothing when they are not.
    if (employers.length < 5) {
        const stats = await getExtendedSiteStats();
        if (!stats || stats.totalJobs <= 0 || stats.totalCompanies <= 0) {
            return null;
        }
        return <SiteStatsRow stats={stats} />;
    }

    return <ClayDoughStrip employers={employers} />;
}
