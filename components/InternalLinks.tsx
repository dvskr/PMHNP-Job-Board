import Link from 'next/link';
import { MapPin, Briefcase, Wifi, Video, GraduationCap, Calendar } from 'lucide-react';

interface InternalLinksProps {
    state?: string | null;
    stateCode?: string | null;
    city?: string | null;
    isRemote?: boolean;
    isTelehealth?: boolean;
    jobType?: string | null;
    mode?: string | null;
}

/**
 * Component to add internal SEO links to job detail pages
 * Links to state pages, city pages, and job type category pages
 */
export default function InternalLinks({
    state,
    stateCode,
    city,
    isRemote,
    isTelehealth,
    jobType,
    mode,
}: InternalLinksProps) {
    const links: { href: string; label: string; icon: React.ReactNode; color: string }[] = [];

    // State page link
    if (state) {
        const stateSlug = state.toLowerCase().replace(/\s+/g, '-');
        links.push({
            href: `/jobs/state/${stateSlug}`,
            label: `All PMHNP Jobs in ${state}`,
            icon: <MapPin className="w-4 h-4" />,
            color: 'blue',
        });
    }

    // Remote jobs link
    if (isRemote || mode?.toLowerCase().includes('remote')) {
        links.push({
            href: '/jobs/remote',
            label: 'More Remote PMHNP Jobs',
            icon: <Wifi className="w-4 h-4" />,
            color: 'purple',
        });
    }

    // Telehealth jobs link
    if (isTelehealth || mode?.toLowerCase().includes('telehealth')) {
        links.push({
            href: '/jobs/telehealth',
            label: 'Browse Telehealth Positions',
            icon: <Video className="w-4 h-4" />,
            color: 'teal',
        });
    }

    // Job type specific links
    if (jobType?.toLowerCase().includes('per diem') || jobType?.toLowerCase().includes('prn')) {
        links.push({
            href: '/jobs/per-diem',
            label: 'View Per Diem PMHNP Jobs',
            icon: <Calendar className="w-4 h-4" />,
            color: 'green',
        });
    }

    if (jobType?.toLowerCase().includes('contract') || jobType?.toLowerCase().includes('travel')) {
        links.push({
            href: '/jobs/travel',
            label: 'Explore Travel PMHNP Positions',
            icon: <Briefcase className="w-4 h-4" />,
            color: 'orange',
        });
    }

    // New grad friendly detection (simple heuristic)
    // This would ideally be a field on the job, but we can detect from title/description

    if (links.length === 0) {
        // Add default links if no specific ones apply
        links.push({
            href: '/jobs',
            label: 'Browse All PMHNP Jobs',
            icon: <Briefcase className="w-4 h-4" />,
            color: 'blue',
        });
    }

    // Limit to 3 most relevant links
    const displayLinks = links.slice(0, 3);

    const colorClasses: Record<string, { bg: string; text: string; hover: string }> = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', hover: 'hover:bg-blue-100' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-700', hover: 'hover:bg-purple-100' },
        teal: { bg: 'bg-teal-50', text: 'text-teal-700', hover: 'hover:bg-teal-100' },
        green: { bg: 'bg-green-50', text: 'text-green-700', hover: 'hover:bg-green-100' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-700', hover: 'hover:bg-orange-100' },
    };

    return (
        <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Explore More Opportunities</h3>
            <div className="flex flex-wrap gap-2">
                {displayLinks.map((link) => {
                    const colors = colorClasses[link.color] || colorClasses.blue;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${colors.bg} ${colors.text} ${colors.hover}`}
                        >
                            {link.icon}
                            {link.label}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
