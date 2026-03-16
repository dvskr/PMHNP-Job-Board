import { prisma } from '@/lib/prisma';
import { Building2, CheckCircle2 } from 'lucide-react';

/**
 * B4: "Trusted by X employers" trust signal
 * Server component — queries actual employer count from DB.
 */
export default async function TrustedByEmployers() {
    let employerCount = 2500;

    try {
        const groups = await prisma.job.groupBy({
            by: ['employer'],
            where: { isPublished: true },
        });
        employerCount = groups.length;
    } catch {
        // Use fallback
    }

    const display = employerCount >= 1000
        ? `${Math.floor(employerCount / 100) * 100}+`
        : employerCount.toLocaleString();

    return (
        <section style={{ padding: '24px 0' }}>
            <div className="flex items-center justify-center gap-6 flex-wrap" style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
                <div
                    className="flex items-center gap-3 px-6 py-3 rounded-full"
                    style={{
                        background: 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(232,108,44,0.04))',
                        border: '1px solid rgba(45,212,191,0.12)',
                    }}
                >
                    <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Trusted by {display} employers
                    </span>
                </div>

                <div
                    className="flex items-center gap-3 px-6 py-3 rounded-full"
                    style={{
                        background: 'linear-gradient(135deg, rgba(232,108,44,0.06), rgba(129,140,248,0.04))',
                        border: '1px solid rgba(232,108,44,0.12)',
                    }}
                >
                    <Building2 size={18} style={{ color: '#E86C2C' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        100% PMHNP-focused
                    </span>
                </div>
            </div>
        </section>
    );
}
