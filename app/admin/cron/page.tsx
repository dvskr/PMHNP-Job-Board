'use client';

import { useState, useEffect } from 'react';
import { Activity, Play, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { formatCT } from '@/lib/format-ct';
import { cronNameFromPath, isRunStale } from './cron-run-lookup';

interface CronJobInfo {
    path: string;
    schedule: string;
}

interface LatestCronRun {
    name: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    success: boolean;
    error: string | null;
}

interface TriggerState {
    [path: string]: {
        loading: boolean;
        result?: { success: boolean; message: string };
    };
}

function buildSuccessMessage(parsed: unknown): string {
    if (typeof parsed === 'object' && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        const audit = p.audit as { staged?: number; flushed?: number; failedFlushes?: number; lastError?: string | null } | undefined;
        if (audit) {
            const parts = [`staged=${audit.staged ?? 0}`, `flushed=${audit.flushed ?? 0}`];
            if (audit.failedFlushes && audit.failedFlushes > 0) {
                parts.push(`FAILED=${audit.failedFlushes}`);
                if (audit.lastError) parts.push(`error="${audit.lastError}"`);
            }
            return `OK · ${parts.join(' · ')}`;
        }
        if (typeof p.message === 'string') return `OK · ${p.message}`;
    }
    return 'Triggered successfully';
}

function buildErrorMessage(status: number, parsed: unknown, fallback: string): string {
    if (typeof parsed === 'object' && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        const err = (p.error as string | undefined) ?? (p.message as string | undefined);
        if (err) return `HTTP ${status} · ${err}`;
    }
    return `HTTP ${status} · ${fallback.slice(0, 200)}`;
}

export default function CronHealthDashboard() {
    const [crons, setCrons] = useState<CronJobInfo[]>([]);
    const [runs, setRuns] = useState<Record<string, LatestCronRun>>({});
    const [loading, setLoading] = useState(true);
    const [triggerState, setTriggerState] = useState<TriggerState>({});
    const [error, setError] = useState<string | null>(null);
    const [runsError, setRunsError] = useState<string | null>(null);

    useEffect(() => {
        fetchCrons();
        fetchRuns();
    }, []);

    const fetchCrons = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/cron-list');
            if (!res.ok) throw new Error('Failed to fetch cron config');
            const data = await res.json();
            setCrons(data.crons || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    // The schedule list and the run history are separate reads on purpose: a
    // health page that renders nothing because cron_runs is unavailable is the
    // same failure as one that renders green because it never asked.
    const fetchRuns = async () => {
        try {
            const res = await fetch('/api/admin/cron-runs');
            const data = await res.json();
            if (!res.ok || data.success === false) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            const byName: Record<string, LatestCronRun> = {};
            for (const run of (data.runs || []) as LatestCronRun[]) byName[run.name] = run;
            setRuns(byName);
            setRunsError(null);
        } catch (err) {
            setRunsError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    const triggerCron = async (path: string) => {
        setTriggerState(prev => ({
            ...prev,
            [path]: { loading: true }
        }));

        try {
            // Vercel cron handlers are GET. Admin sessions are accepted by
            // verifyCronOrAdmin; the cron secret is not exposed to browsers.
            const res = await fetch(path, { method: 'GET' });

            const text = await res.text();
            let parsed: unknown = text;
            try { parsed = JSON.parse(text); } catch { /* not JSON, keep raw */ }

            // Surface as much detail as possible — recorder lastError lives
            // at audit.lastError, generic error at .error, etc.
            const message = res.ok
                ? buildSuccessMessage(parsed)
                : buildErrorMessage(res.status, parsed, text);

            setTriggerState(prev => ({
                ...prev,
                [path]: {
                    loading: false,
                    result: { success: res.ok, message }
                }
            }));

            // A manual trigger writes a cron_runs row, so the last-run column
            // is stale the moment the button returns.
            fetchRuns();
        } catch (err) {
            setTriggerState(prev => ({
                ...prev,
                [path]: {
                    loading: false,
                    result: { success: false, message: `Execution error: ${err instanceof Error ? err.message : 'unknown'}` }
                }
            }));
        }
    };

    if (loading) {
        return (
            <div style={{ maxWidth: '1000px', margin: '0 auto', paddingTop: '80px', paddingBottom: '32px', paddingLeft: '16px', paddingRight: '16px', textAlign: 'center' }}>
                <Activity className="animate-pulse" size={48} style={{ color: '#0D9488', margin: '0 auto' }} />
                <p style={{ marginTop: '16px', color: '#6B7F8A' }}>Loading cron configuration...</p>
            </div>
        );
    }

    // Group crons
    const groups: Record<string, CronJobInfo[]> = {
        'Ingestion Pipelines': [],
        'SEO & Optimization': [],
        'Engagement & Notifications': [],
        'Maintenance': [],
        'Other': []
    };

    crons.forEach(c => {
        if (c.path.includes('ingest')) groups['Ingestion Pipelines'].push(c);
        else if (c.path.includes('deindex') || c.path.includes('aggregate-pseo') || c.path.includes('seo') || c.path.includes('index-urls')) groups['SEO & Optimization'].push(c);
        else if (c.path.match(/alert|report|reminder|nudge|social|instagram|push-notification/)) groups['Engagement & Notifications'].push(c);
        else if (c.path.match(/cleanup|decay|enrich-jobs|dead-links|expiry/)) groups['Maintenance'].push(c);
        else groups['Other'].push(c);
    });

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 16px' }}>
            <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1A2E35', marginBottom: '4px' }}>Cron Health Dashboard</h1>
                    <p style={{ color: '#6B7F8A' }}>
                        Schedules, last run and outcome, and manual triggers. Run history is keyed by cron
                        route, so the ingest chunks share one history.
                    </p>
                </div>
            </div>

            {error && (
                <div style={{ padding: '16px', backgroundColor: '#FEF2F2', color: '#991B1B', borderRadius: '16px', marginBottom: '24px',
                    boxShadow: 'inset 2px 2px 5px rgba(255,255,255,0.5), inset -1px -1px 3px rgba(0,0,0,0.03)' }}>
                    Error loading crons: {error}
                </div>
            )}

            {runsError && (
                <div role="alert" style={{ padding: '16px', backgroundColor: '#FFFBEB', color: '#92400E', borderRadius: '16px', marginBottom: '24px' }}>
                    Run history could not be loaded, so every cron below reads as never run: {runsError}
                </div>
            )}

            {Object.entries(groups).filter(([_, items]) => items.length > 0).map(([groupName, items]) => (
                <div key={groupName} style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E8ECF0' }}>
                        {groupName} <span style={{ fontSize: '14px', color: '#94A3B8', fontWeight: 400 }}>({items.length} tasks)</span>
                    </h2>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {items.map(cron => {
                            const state = triggerState[cron.path];
                            const isIngest = cron.path.includes('ingest?source=');
                            const name = isIngest ? `Ingest: ${new URLSearchParams(cron.path.split('?')[1]).get('source')}` : cron.path.split('/').pop()?.split('?')[0];
                            const chunk = cron.path.includes('chunk=') ? new URLSearchParams(cron.path.split('?')[1]).get('chunk') : null;
                            const lastRun = runs[cronNameFromPath(cron.path)];
                            const stale = lastRun ? isRunStale(lastRun.startedAt) : false;

                            return (
                                <div key={`${cron.path}@${cron.schedule}`} style={{
                                    backgroundColor: '#FAFBF9', 
                                    border: '1px solid rgba(255,255,255,0.7)', 
                                    borderRadius: '18px', 
                                    padding: '18px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    boxShadow: '6px 6px 16px rgba(0,0,0,0.05), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 3px rgba(0,0,0,0.02)',
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1A2E35' }}>
                                                {name}
                                                {chunk && <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', backgroundColor: '#F8FAF9' }}>Chunk {chunk}</span>}
                                            </h3>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: '#94A3B8', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={14} /> Schedule: {cron.schedule}
                                            </span>
                                            <code>{cron.path}</code>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', fontSize: '12px', flexWrap: 'wrap' }}>
                                            {!lastRun && (
                                                <span style={{ color: '#94A3B8' }}>
                                                    No run recorded. A cron only appears here once it has run with tracking enabled.
                                                </span>
                                            )}
                                            {lastRun && (
                                                <>
                                                    <span style={{
                                                        display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600,
                                                        color: lastRun.success ? '#16A34A' : '#DC2626',
                                                    }}>
                                                        {lastRun.success
                                                            ? <CheckCircle size={13} />
                                                            : <XCircle size={13} />}
                                                        {lastRun.finishedAt
                                                            ? (lastRun.success ? 'Succeeded' : 'Failed')
                                                            : 'Started, never finished'}
                                                    </span>
                                                    <span style={{ color: '#6B7F8A' }}>{formatCT(lastRun.startedAt)}</span>
                                                    {lastRun.durationMs != null && (
                                                        <span style={{ color: '#94A3B8' }}>{(lastRun.durationMs / 1000).toFixed(1)}s</span>
                                                    )}
                                                    {stale && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#B45309', fontWeight: 600 }}>
                                                            <AlertTriangle size={13} /> Nothing in over a week
                                                        </span>
                                                    )}
                                                    {lastRun.error && (
                                                        <span style={{ color: '#DC2626', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
                                                            {lastRun.error}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '60%' }}>
                                        {state?.result && (
                                            <div style={{
                                                display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px',
                                                color: state.result.success ? '#16A34A' : '#DC2626',
                                                fontFamily: 'ui-monospace, monospace',
                                                wordBreak: 'break-word',
                                                lineHeight: 1.4,
                                            }}>
                                                {state.result.success ? <CheckCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} /> : <XCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />}
                                                <span>{state.result.message}</span>
                                            </div>
                                        )}

                                        <button 
                                            onClick={() => triggerCron(cron.path)}
                                            disabled={state?.loading}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '8px 18px', borderRadius: '14px', cursor: state?.loading ? 'not-allowed' : 'pointer',
                                                backgroundColor: state?.loading ? '#F0F3F2' : '#FAFBF9',
                                                color: '#1A2E35', border: '1px solid rgba(255,255,255,0.6)',
                                                fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
                                                boxShadow: '4px 4px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.6)',
                                            }}>
                                            <Play size={14} style={{ opacity: state?.loading ? 0.5 : 1 }} />
                                            {state?.loading ? 'Running...' : 'Trigger Manually'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
