/**
 * /admin/settings — what this deployment is actually configured to do.
 *
 * This is a server component on purpose. Every claim on the page is read at
 * request time from the environment, the rate-limit table, or the AI flag
 * registry and its override rows. The previous version was a client component
 * with no data access at all: the "Active" and "Enabled" pills were literals
 * that stayed green whether or not the integration behind them existed.
 *
 * Env VALUES never leave the server. Only "is this key present" does.
 */
import { prisma } from '@/lib/prisma';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { listFlags } from '@/lib/ai/feature-flags';
import { INTEGRATION_SECTIONS, readIntegrationStatus } from './config-status';
import { Bot, Database, Gauge } from 'lucide-react';

// Reading process.env at build time would freeze the answers into the
// bundle, which is the failure this page exists to avoid.
export const dynamic = 'force-dynamic';

const card: React.CSSProperties = {
    backgroundColor: '#FAFBF9', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '18px',
    boxShadow: '8px 8px 20px rgba(0,0,0,0.05), -6px -6px 16px rgba(255,255,255,0.9), inset 3px 3px 6px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.02)',
    padding: '24px',
};
const heading: React.CSSProperties = { color: '#1A2E35', fontWeight: 700 };
const sub: React.CSSProperties = { color: '#6B7F8A', fontSize: '14px' };
const muted: React.CSSProperties = { color: '#94A3B8', fontSize: '12px' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: '11px' };

function Pill({ tone, children }: { tone: 'good' | 'bad' | 'neutral'; children: React.ReactNode }) {
    const colors = {
        good: { bg: 'rgba(34,197,94,0.12)', text: '#15803D' },
        bad: { bg: 'rgba(245,158,11,0.14)', text: '#B45309' },
        neutral: { bg: 'rgba(148,163,184,0.14)', text: '#64748B' },
    }[tone];
    return (
        <span style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            whiteSpace: 'nowrap', backgroundColor: colors.bg, color: colors.text,
        }}>{children}</span>
    );
}

export default async function AdminSettingsPage() {
    const env = process.env as Record<string, string | undefined>;

    const sections = INTEGRATION_SECTIONS.map((section) => ({
        title: section.title,
        rows: section.rows.map((row) => ({ row, status: readIntegrationStatus(row, env) })),
    }));

    const configuredCount = sections.reduce(
        (n, s) => n + s.rows.filter((r) => r.status.configured).length, 0);
    const totalCount = sections.reduce((n, s) => n + s.rows.length, 0);

    const flags = listFlags();
    // A DB outage should not blank the page: the rest of it is env-derived and
    // still true. An empty override list plus the notice below is honest.
    let overrides: Array<{ flag: string; tenantType: string; tenantId: string | null; enabled: boolean }> = [];
    let overridesFailed = false;
    try {
        overrides = await prisma.aiFeatureFlagOverride.findMany({
            where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            select: { flag: true, tenantType: true, tenantId: true, enabled: true },
            orderBy: [{ flag: 'asc' }, { tenantType: 'asc' }],
        });
    } catch {
        overridesFailed = true;
    }

    const overridesByFlag = new Map<string, typeof overrides>();
    for (const o of overrides) {
        overridesByFlag.set(o.flag, [...(overridesByFlag.get(o.flag) ?? []), o]);
    }

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ ...heading, fontSize: 26 }}>Settings</h1>
                <p style={sub}>
                    Read at request time from this deployment. {configuredCount} of {totalCount} integrations
                    have every key they read.
                </p>
            </div>

            {sections.map((section) => (
                <div key={section.title} style={{ ...card, marginBottom: 24 }}>
                    <h2 style={{ ...heading, fontSize: 18, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Database size={20} style={{ color: '#0D9488' }} /> {section.title}
                    </h2>
                    {section.rows.map(({ row, status }) => (
                        <div key={row.label} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 16, padding: '16px 0', borderBottom: '1px solid #E8ECF0',
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2E35' }}>{row.label}</div>
                                <div style={muted}>{row.description}</div>
                                <div style={{ ...muted, ...mono, marginTop: 4 }}>
                                    {row.envKeys.join(', ')} · read by {row.readBy}
                                </div>
                                {!status.configured && (
                                    <div style={{ ...muted, ...mono, color: '#B45309', marginTop: 2 }}>
                                        not set: {status.missing.join(', ')}
                                    </div>
                                )}
                            </div>
                            <div style={{ flexShrink: 0 }}>
                                {status.configured
                                    ? <Pill tone="good">Configured</Pill>
                                    : <Pill tone="bad">Not configured</Pill>}
                            </div>
                        </div>
                    ))}
                </div>
            ))}

            {/* ─── Rate limits ─── */}
            <div style={{ ...card, marginBottom: 24 }}>
                <h2 style={{ ...heading, fontSize: 18, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Gauge size={20} style={{ color: '#F59E0B' }} /> Rate limits
                </h2>
                <p style={{ ...muted, marginBottom: 12 }}>
                    The live values from lib/rate-limit.ts, not a copy of them.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {Object.entries(RATE_LIMITS).map(([name, cfg]) => (
                        <div key={name} style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: '#F8FAF9' }}>
                            <div style={{ ...mono, color: '#1A2E35', fontWeight: 600 }}>{name}</div>
                            <div style={muted}>
                                {cfg.limit} requests per {cfg.windowSeconds} seconds
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ─── AI feature flags ─── */}
            <div style={card}>
                <h2 style={{ ...heading, fontSize: 18, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bot size={20} style={{ color: '#A855F7' }} /> AI feature flags
                </h2>
                <p style={{ ...muted, marginBottom: 12 }}>
                    Compiled defaults plus every active override row. A KILL_ environment variable for a flag
                    beats both and is not visible here. Write overrides through POST /api/admin/ai/flags.
                </p>
                {overridesFailed && (
                    <p style={{ ...muted, color: '#B45309', marginBottom: 12 }}>
                        Override rows could not be read, so only the compiled defaults below are current.
                    </p>
                )}
                {flags.map((f) => {
                    const rows = overridesByFlag.get(f.flag) ?? [];
                    return (
                        <div key={f.flag} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 16, padding: '12px 0', borderBottom: '1px solid #E8ECF0',
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ ...mono, fontSize: 12, fontWeight: 600, color: '#1A2E35' }}>{f.flag}</div>
                                <div style={muted}>{f.description}</div>
                                {rows.length > 0 && (
                                    <div style={{ ...muted, ...mono, marginTop: 4, color: '#3B82F6' }}>
                                        {rows.map((o) => `${o.tenantType}${o.tenantId ? `:${o.tenantId}` : ''} = ${o.enabled ? 'on' : 'off'}`).join(' · ')}
                                    </div>
                                )}
                            </div>
                            <div style={{ flexShrink: 0, display: 'flex', gap: 8 }}>
                                {rows.length > 0 && <Pill tone="neutral">Overridden</Pill>}
                                {f.default ? <Pill tone="good">Default on</Pill> : <Pill tone="neutral">Default off</Pill>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
