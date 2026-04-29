'use client';

import { useState, useEffect } from 'react';
import { Activity, Play, CheckCircle, XCircle, Clock } from 'lucide-react';

interface CronJobInfo {
    path: string;
    schedule: string;
}

interface TriggerState {
    [path: string]: {
        loading: boolean;
        result?: { success: boolean; message: string };
    };
}

export default function CronHealthDashboard() {
    const [crons, setCrons] = useState<CronJobInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [triggerState, setTriggerState] = useState<TriggerState>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchCrons();
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

    const triggerCron = async (path: string) => {
        setTriggerState(prev => ({
            ...prev,
            [path]: { loading: true }
        }));

        try {
            // Note: In production this would require vercel cron secret auth header 
            // but for admin dashboard we can assume backend verifies session token.
            const res = await fetch(path, { method: 'POST' });
            
            const data = await res.text();
            let msg = data;
            try { msg = JSON.parse(data).message || data; } catch(e) {}

            setTriggerState(prev => ({
                ...prev,
                [path]: {
                    loading: false,
                    result: { success: res.ok, message: res.ok ? 'Triggered successfully' : `Failed: ${msg.slice(0, 50)}` }
                }
            }));
        } catch (err) {
            setTriggerState(prev => ({
                ...prev,
                [path]: {
                    loading: false,
                    result: { success: false, message: 'Execution error' }
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
                    <p style={{ color: '#6B7F8A' }}>Automated platform tasks configuration and manual triggers.</p>
                </div>
            </div>

            {error && (
                <div style={{ padding: '16px', backgroundColor: '#FEF2F2', color: '#991B1B', borderRadius: '16px', marginBottom: '24px',
                    boxShadow: 'inset 2px 2px 5px rgba(255,255,255,0.5), inset -1px -1px 3px rgba(0,0,0,0.03)' }}>
                    Error loading crons: {error}
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

                            return (
                                <div key={cron.path} style={{ 
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: '#94A3B8' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={14} /> Schedule: {cron.schedule}
                                            </span>
                                            <code>{cron.path}</code>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {state?.result && (
                                            <div style={{ 
                                                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px',
                                                color: state.result.success ? '#16A34A' : '#DC2626'
                                            }}>
                                                {state.result.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                                {state.result.message}
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
