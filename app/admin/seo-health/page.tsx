/**
 * P4: SEO health dashboard.
 *
 * Single-page admin view that surfaces every monitoring signal we built
 * during the GSC indexing crisis remediation:
 *   1. GSC snapshot trail (clicks/impressions over time, regression flag)
 *   2. Cron runs — last execution per cron + recent run history
 *   3. Deindex queue burn-down (P2.1 progress)
 *   4. Layer 2 snippet review queue (P3.4)
 *
 * Server component — pulls everything in one round-trip via prisma.
 */
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

interface SearchAnalyticsRow {
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
}

function asAnalytics(value: unknown): SearchAnalyticsRow {
    if (!value || typeof value !== 'object') return {};
    return value as SearchAnalyticsRow;
}

async function getData() {
    const [
        snapshots,
        recentCronRuns,
        cronSummary,
        queueByStatus,
        queueBySource,
        queueAttempts,
        snippetCity,
        snippetCategoryCity,
        recentSnippets,
    ] = await Promise.all([
        prisma.gscSnapshot.findMany({
            orderBy: { capturedOn: 'desc' },
            take: 14,
        }),
        prisma.cronRun.findMany({
            orderBy: { startedAt: 'desc' },
            take: 25,
        }),
        prisma.cronRun.groupBy({
            by: ['name'],
            _count: { _all: true },
            _max: { startedAt: true },
            orderBy: { _max: { startedAt: 'desc' } },
        }),
        prisma.deindexQueue.groupBy({
            by: ['status'],
            _count: { _all: true },
        }),
        prisma.deindexQueue.groupBy({
            by: ['source'],
            _count: { _all: true },
            orderBy: { _count: { source: 'desc' } },
            take: 10,
        }),
        prisma.deindexQueue.aggregate({
            _avg: { attempt: true },
            _max: { attempt: true },
        }),
        prisma.citySnippet.groupBy({
            by: ['sourceModel'],
            _count: { _all: true },
        }),
        prisma.categoryCitySnippet.groupBy({
            by: ['sourceModel'],
            _count: { _all: true },
        }),
        prisma.citySnippet.findMany({
            orderBy: { generatedAt: 'desc' },
            take: 10,
            select: { citySlug: true, sourceModel: true, generatedAt: true, approvedAt: true },
        }),
    ]);

    const pendingApproval = await prisma.citySnippet.count({ where: { approvedAt: null } })
        + await prisma.categoryCitySnippet.count({ where: { approvedAt: null } });
    const approvedTotal = await prisma.citySnippet.count({ where: { approvedAt: { not: null } } })
        + await prisma.categoryCitySnippet.count({ where: { approvedAt: { not: null } } });

    return {
        snapshots,
        recentCronRuns,
        cronSummary,
        queueByStatus,
        queueBySource,
        queueAttempts,
        snippetCity,
        snippetCategoryCity,
        recentSnippets,
        pendingApproval,
        approvedTotal,
    };
}

function formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
}

function deltaPct(today: number, weekAgo: number): { pct: number; color: string; arrow: string } {
    if (weekAgo === 0) return { pct: 0, color: '#7A6A62', arrow: '—' };
    const pct = ((today - weekAgo) / weekAgo) * 100;
    return {
        pct,
        color: pct >= 0 ? '#10B981' : pct < -15 ? '#EF4444' : '#F59E0B',
        arrow: pct >= 0 ? '▲' : '▼',
    };
}

const card: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid rgba(0,0,0,0.06)',
    padding: '20px 24px',
    boxShadow: '4px 4px 12px rgba(0,0,0,0.04)',
    marginBottom: '20px',
};

const h2: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 700,
    color: '#1A2E35',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
};

const td: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid rgba(0,0,0,0.05)',
    fontSize: '13px',
    color: '#1A2E35',
};

const th: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#7A6A62',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'left',
    borderBottom: '2px solid rgba(0,0,0,0.08)',
    background: '#FAFAFA',
};

export default async function SeoHealthPage() {
    const data = await getData();

    // Compute today vs week-ago from latest 2 snapshots that have searchAnalytics
    const latest = data.snapshots[0];
    const todaySa = latest ? asAnalytics((latest.raw as { searchAnalytics?: { today?: unknown } } | null)?.searchAnalytics?.today) : {};
    const wkAgoSa = latest ? asAnalytics((latest.raw as { searchAnalytics?: { weekAgo?: unknown } } | null)?.searchAnalytics?.weekAgo) : {};
    const clicksDelta = deltaPct(todaySa.clicks ?? 0, wkAgoSa.clicks ?? 0);
    const imprDelta = deltaPct(todaySa.impressions ?? 0, wkAgoSa.impressions ?? 0);

    const queueByStatusMap = new Map(data.queueByStatus.map((r) => [r.status, r._count._all]));
    const queueTotal = Array.from(queueByStatusMap.values()).reduce((a, b) => a + b, 0);
    const queueDone = (queueByStatusMap.get('submitted') ?? 0) + (queueByStatusMap.get('live') ?? 0);
    const queuePct = queueTotal > 0 ? Math.round((queueDone / queueTotal) * 100) : 0;

    return (
        <div style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto', background: '#FDFBF7', minHeight: '100vh' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 className="font-lora" style={{ fontSize: '28px', fontWeight: 700, color: '#1A2E35', marginBottom: '4px' }}>
                    SEO Health
                </h1>
                <p style={{ fontSize: '13px', color: '#7A6A62' }}>
                    Live signals from the GSC remediation crons. Refreshed every 60 seconds.
                </p>
            </div>

            {/* External link bar */}
            <div style={{ ...card, padding: '14px 20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px' }}>
                <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" style={{ color: '#0D9488', textDecoration: 'none', fontWeight: 600 }}>
                    ↗ Google Search Console
                </a>
                <a href="https://search.google.com/search-console/removals" target="_blank" rel="noreferrer" style={{ color: '#0D9488', textDecoration: 'none', fontWeight: 600 }}>
                    ↗ GSC Removals UI
                </a>
                <Link href="/admin/cron" style={{ color: '#0D9488', textDecoration: 'none', fontWeight: 600 }}>
                    ↗ Cron Triggers
                </Link>
            </div>

            {/* ─── 1. GSC SNAPSHOTS ─────────────────────────────────────────── */}
            <div style={card}>
                <h2 style={h2}>1. Search Console — last 14 days</h2>
                {data.snapshots.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#7A6A62' }}>
                        No snapshots yet. The <code>/api/cron/gsc-health-check</code> cron runs daily at
                        09:30 UTC. If it&apos;s been &gt;24h since deploy, check the cron is firing in Vercel
                        and that <code>GOOGLE_INDEXING_CREDENTIALS</code> + the service-account email is
                        added to GSC → Settings → Users with read access.
                    </p>
                ) : (
                    <>
                        {/* KPI strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            <div>
                                <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clicks (yesterday)</div>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A2E35' }}>{(todaySa.clicks ?? 0).toLocaleString('en-US')}</div>
                                <div style={{ fontSize: '12px', color: clicksDelta.color, fontWeight: 600 }}>
                                    {clicksDelta.arrow} {Math.abs(clicksDelta.pct).toFixed(1)}% vs 7d ago
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impressions (yesterday)</div>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A2E35' }}>{(todaySa.impressions ?? 0).toLocaleString('en-US')}</div>
                                <div style={{ fontSize: '12px', color: imprDelta.color, fontWeight: 600 }}>
                                    {imprDelta.arrow} {Math.abs(imprDelta.pct).toFixed(1)}% vs 7d ago
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CTR</div>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A2E35' }}>{((todaySa.ctr ?? 0) * 100).toFixed(2)}%</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Position</div>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A2E35' }}>{(todaySa.position ?? 0).toFixed(1)}</div>
                            </div>
                        </div>

                        {/* History table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr>
                                    <th style={th}>Date</th>
                                    <th style={th}>Clicks</th>
                                    <th style={th}>Impressions</th>
                                    <th style={th}>CTR</th>
                                    <th style={th}>Position</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.snapshots.map((s) => {
                                    const sa = asAnalytics((s.raw as { searchAnalytics?: { today?: unknown } } | null)?.searchAnalytics?.today);
                                    return (
                                        <tr key={s.id}>
                                            <td style={td}>{s.capturedOn.toISOString().slice(0, 10)}</td>
                                            <td style={td}>{(sa.clicks ?? 0).toLocaleString('en-US')}</td>
                                            <td style={td}>{(sa.impressions ?? 0).toLocaleString('en-US')}</td>
                                            <td style={td}>{((sa.ctr ?? 0) * 100).toFixed(2)}%</td>
                                            <td style={td}>{(sa.position ?? 0).toFixed(1)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </>
                )}
            </div>

            {/* ─── 2. CRON RUNS ─────────────────────────────────────────────── */}
            <div style={card}>
                <h2 style={h2}>2. Cron run log</h2>
                {data.cronSummary.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#7A6A62' }}>
                        No cron runs tracked yet. Crons opt into tracking via{' '}
                        <code>withCronTracking()</code> in <code>lib/cron/track.ts</code>. The
                        <code> historical-deindex</code> and <code>gsc-health-check</code> crons will
                        populate this table after their next run.
                    </p>
                ) : (
                    <>
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', color: '#7A6A62', marginBottom: '8px' }}>Last run per cron:</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr>
                                        <th style={th}>Cron</th>
                                        <th style={th}>Last run</th>
                                        <th style={th}>Total runs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.cronSummary.map((r) => (
                                        <tr key={r.name}>
                                            <td style={td}><code>{r.name}</code></td>
                                            <td style={td}>{r._max.startedAt ? formatRelativeTime(r._max.startedAt) : '—'}</td>
                                            <td style={td}>{r._count._all}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ fontSize: '12px', color: '#7A6A62', marginBottom: '8px' }}>Last 25 invocations:</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr>
                                    <th style={th}>Cron</th>
                                    <th style={th}>Started</th>
                                    <th style={th}>Status</th>
                                    <th style={th}>Duration</th>
                                    <th style={th}>Metrics / Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recentCronRuns.map((r) => (
                                    <tr key={r.id}>
                                        <td style={td}><code>{r.name}</code></td>
                                        <td style={td}>{formatRelativeTime(r.startedAt)}</td>
                                        <td style={{ ...td, color: r.success ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                                            {r.success ? '✓ ok' : '✗ failed'}
                                        </td>
                                        <td style={td}>{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '11px', maxWidth: '480px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {r.error ? r.error : r.metrics ? JSON.stringify(r.metrics) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </div>

            {/* ─── 3. DEINDEX QUEUE ─────────────────────────────────────────── */}
            <div style={card}>
                <h2 style={h2}>3. Deindex queue burn-down</h2>
                {queueTotal === 0 ? (
                    <p style={{ fontSize: '13px', color: '#7A6A62' }}>
                        Queue is empty. After the <code>deindex_queue</code> migration deploys, run{' '}
                        <code>npx tsx scripts/seed-deindex-queue.ts</code> to seed it from the GSC
                        ISSUES exports.
                    </p>
                ) : (
                    <>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', color: '#7A6A62', marginBottom: '4px' }}>
                                {queueDone.toLocaleString('en-US')} / {queueTotal.toLocaleString('en-US')} URLs processed ({queuePct}%)
                            </div>
                            <div style={{ height: '8px', background: '#F0F0F0', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${queuePct}%`, height: '100%', background: '#10B981' }} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            {data.queueByStatus.map((r) => (
                                <div key={r.status} style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase' }}>{r.status}</div>
                                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>{r._count._all.toLocaleString('en-US')}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ fontSize: '12px', color: '#7A6A62', marginBottom: '8px' }}>By source (top 10):</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr>
                                    <th style={th}>Source</th>
                                    <th style={th}>Count</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.queueBySource.map((r) => (
                                    <tr key={r.source}>
                                        <td style={td}><code>{r.source}</code></td>
                                        <td style={td}>{r._count._all.toLocaleString('en-US')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '12px' }}>
                            Avg attempt count: {(data.queueAttempts._avg.attempt ?? 0).toFixed(2)}.
                            Max: {data.queueAttempts._max.attempt ?? 0}.
                        </div>
                    </>
                )}
            </div>

            {/* ─── 4. LAYER 2 SNIPPETS ──────────────────────────────────────── */}
            <div style={card}>
                <h2 style={h2}>4. Layer 2 snippet review queue</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase' }}>Approved (live)</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#10B981' }}>{data.approvedTotal}</div>
                    </div>
                    <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase' }}>Pending review</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#F59E0B' }}>{data.pendingApproval}</div>
                    </div>
                    <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase' }}>City snippets</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>{data.snippetCity.reduce((sum, r) => sum + r._count._all, 0)}</div>
                    </div>
                    <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#7A6A62', textTransform: 'uppercase' }}>Taxonomy×city</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>{data.snippetCategoryCity.reduce((sum, r) => sum + r._count._all, 0)}</div>
                    </div>
                </div>

                {data.recentSnippets.length > 0 && (
                    <>
                        <div style={{ fontSize: '12px', color: '#7A6A62', marginBottom: '8px' }}>Latest 10 city snippets:</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr>
                                    <th style={th}>City</th>
                                    <th style={th}>Model</th>
                                    <th style={th}>Generated</th>
                                    <th style={th}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recentSnippets.map((r) => (
                                    <tr key={r.citySlug}>
                                        <td style={td}><code>{r.citySlug}</code></td>
                                        <td style={td}>{r.sourceModel ?? '—'}</td>
                                        <td style={td}>{formatRelativeTime(r.generatedAt)}</td>
                                        <td style={{ ...td, color: r.approvedAt ? '#10B981' : '#F59E0B', fontWeight: 600 }}>
                                            {r.approvedAt ? '✓ approved' : '○ pending'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}

                <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '12px' }}>
                    Approve via CLI: <code>npx tsx scripts/approve-snippets.ts --list</code>
                </div>
            </div>
        </div>
    );
}
